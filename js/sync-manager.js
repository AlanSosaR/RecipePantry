// js/sync-manager.js
// Escucha el retorno de conectividad y empuja la sync_queue local hacia Supabase.

class SyncManager {
    constructor() {
        this.isSyncing = false;
        this.initListeners();
    }

    initListeners() {
        window.addEventListener('online', () => {
            console.log('🌐 Conexión recuperada. Iniciando Sync Manager...');
            this.syncQueue();
        });

        // Evento custom para disparar sync manual
        window.addEventListener('trigger-sync', () => {
            if (navigator.onLine) this.syncQueue();
        });
    }

    async syncQueue() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            await window.localDB.init();
            const queue = await window.localDB.getSyncQueue();

            if (queue.length === 0) {
                this.isSyncing = false;
                return;
            }

            console.log(`🔄 Procesando ${queue.length} tareas offline...`);
            if (window.utils && window.utils.showToast) {
                window.utils.showToast(`Sincronizando ${queue.length} cambios con la nube...`, 'info', 3000);
            }

            // Mapeo temporal de ID local -> ID de la base de datos real
            const idMap = new Map();

            for (const item of queue) {
                try {
                    await this.processItem(item, idMap);
                    await window.localDB.removeSyncItem(item.uuid);
                } catch (e) {
                    console.error('Error procesando sync item:', item, e);
                    // Si falla por Auth, paramos. Si es por otra cosa, intentamos la siguiente.
                    if (e.message && e.message.includes("JWT")) {
                        break;
                    }
                }
            }

            console.log('✅ Sync Manager completó la cola.');

            // Dispatch a global event so UI components can refresh (like the dashboard)
            window.dispatchEvent(new CustomEvent('sync-completed'));

            // Refresh cache by making a transparent call
            if (window.db && window.authManager && window.authManager.currentUser) {
                window.db.getMyRecipes(); / Refreshes IndexedDB snapshot automatically if online
            }

            if (window.utils && window.utils.showToast) {
                window.utils.showToast('¡Todo sincronizado!', 'success');
            }

        } catch (error) {
            console.error('Error durante el sync local:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    async processItem(item, idMap) {
        // Obtenemos Supabase
        if (!window.supabaseClient) throw new Error("Supabase client not loaded");
        const sb = window.supabaseClient;

        let { operation, table, payload, recipeId } = item;

        // Si la tabla hija depende de una receta que fue insertada previamente offline, 
        // cambiamos el oldRecipeId (ej: "temp_...") por el UUID real que generó Supabase.
        if (recipeId && idMap.has(recipeId)) {
            payload.recipe_id = idMap.get(recipeId);
        }

        if (operation === 'insert') {
            // Remueve el ID falso local para que Supabase genere el suyo
            const tempId = payload.id;
            const insertPayload = { ...payload };
            if (String(insertPayload.id).startsWith('temp_')) {
                delete insertPayload.id;
            }

            const { data, error } = await sb.from(table).insert([insertPayload]).select().single();
            if (error) throw error;

            if (data && table === 'recipes') {
                idMap.set(tempId, data.id); / Guardamos la conversión ID_FALSO -> UUID_REAL
            }
        }
        else if (operation === 'update') {
            // Si target id era un "temp_", y ya fue insertada en este barrido, usamos el real
            const targetId = payload.id;
            const realId = String(targetId).startsWith('temp_') ? idMap.get(targetId) : targetId;

            if (!realId) throw new Error("Could not map temp ID to real ID for update");

            const updatePayload = { ...payload };
            delete updatePayload.id; / no actualizamos el PK

            const { error } = await sb.from(table).update(updatePayload).eq('id', realId);
            if (error) throw error;

            // Especial para Favoritos: Update cache directly as fallback mechanism 
            if (payload.hasOwnProperty('is_favorite') && table === 'recipes') {
                const r = await window.localDB.get('recipes', realId);
                if (r) {
                    r.is_favorite = payload.is_favorite;
                    await window.localDB.put('recipes', r);
                }
            }
        }
        else if (operation === 'delete') {
            const targetId = payload.id;
            const realId = String(targetId).startsWith('temp_') ? idMap.get(targetId) : targetId;
            if (!realId) return; / Si era temporal y nunca subió, ignoramos borrar en nube

            const { error } = await sb.from(table).update({ is_active: false }).eq('id', realId); / Soft delete en DB
            if (error) throw error;
        }
        else if (operation === 'delete_permanent') {
            const targetId = payload.id;
            const realId = String(targetId).startsWith('temp_') ? idMap.get(targetId) : targetId;
            if (!realId) return;

            // Para delete hard dependencies (ingredients, steps)
            const { error } = await sb.from(table).delete().eq(item.pk_col || 'recipe_id', realId);
            if (error) throw error;
        }
        else if (operation === 'raw_rpc' || operation === 'custom') {
            // Operaciones custom si es necesario luego
            console.log("No implemented custom sync:", item);
        }
    }
}

// Inicia un observador global
window.syncManager = new SyncManager();

// Si inicia online, dispara el primer chequeo al cargar
document.addEventListener('DOMContentLoaded', () => {
    if (navigator.onLine) {
        // Pequeño timeout para no estancar el UI principal en load
        setTimeout(() => window.syncManager.syncQueue(), 2000);
    }
});
