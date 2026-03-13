/**
 * NotificationManager - Recipe Pantry
 * Maneja las notificaciones de archivos compartidos
 * Con flujo interactivo: Aceptar (agregar a mis recetas) / Dejar en compartidas
 */
class NotificationManager {
    constructor() {
        this.notifications = [];
        this.lastCount = 0;
        this.isReady = false;
        this.pendingNotifications = []; // v217: Cola para notificaciones que llegan antes del init
    }

    async init() {
        console.log('🔔 [Notifications] Iniciando manager...');
        this.menu = document.getElementById('notifications-menu');
        this.badge = document.getElementById('notifications-badge');
        this.list = document.getElementById('notifications-list');

        await this.fetchNotifications();
        this.setupRealtime();
        
        this.isReady = true;
        // Procesar pendientes si las hay
        if (this.pendingNotifications.length > 0) {
            console.log(`🔔 [Notifications] Procesando ${this.pendingNotifications.length} notificaciones pendientes...`);
            this.pendingNotifications.forEach(fn => fn());
            this.pendingNotifications = [];
        }

        // Cerrar menú al hacer clic fuera
        document.addEventListener('mousedown', (e) => {
            if (this.menu && !this.menu.classList.contains('hidden')) {
                const btn = document.getElementById('btn-notifications');
                if (btn && !this.menu.contains(e.target) && !btn.contains(e.target)) {
                    this.menu.classList.add('hidden');
                }
            }
        });
    }

    async fetchNotifications() {
        try {
            const user = window.authManager?.currentUser;
            if (!user) {
                console.warn('⚠️ [Notifications] No hay usuario para buscar notificaciones');
                return;
            }

            console.log(`🔔 [Notifications] Buscando notificaciones para user_id: ${user.id}`);

            const { data, error } = await window.supabaseClient
                .from('notifications')
                .select(`
                    id, 
                    created_at, 
                    leido, 
                    type,
                    from_user_id, 
                    recipe_id,
                    from_user:users!from_user_id(first_name, last_name, email, prefix),
                    recipe:recipes(id, name_es, name_en)
                `)
                .eq('user_id', user.id)
                .is('leido', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            console.log(`🔔 [Notifications] Fetch successful for ${user.id}. Rows: ${data?.length || 0}`);
            if (data && data.length > 0) {
                console.log('🔔 [Notifications] Detalle de datos crudos:', data);
            }

            const serverNotifications = data.map(n => {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const recipeName = isEn ? (n.recipe?.name_en || n.recipe?.name_es) : n.recipe?.name_es;
                const senderName = [n.from_user?.first_name, n.from_user?.last_name].filter(Boolean).join(' ')
                    || n.from_user?.email
                    || (isEn ? 'Someone' : 'Alguien');
                const senderPrefix = n.from_user?.prefix || (isEn ? 'Chef' : 'Chef');

                return {
                    id: n.id,
                    recipeId: n.recipe_id,
                    recipeName: recipeName || (isEn ? 'Shared Recipe' : 'Receta compartida'),
                    type: n.type || 'recipe_shared',
                    timestamp: n.created_at,
                    sender: senderName,
                    prefix: senderPrefix,
                    leido: n.leido
                };
            });

            // Preservar notificaciones locales (update, sync)
            const localNotifications = this.notifications.filter(n => ['app_update', 'offline_sync'].includes(n.type));
            this.notifications = [...localNotifications, ...serverNotifications];
            
            // Eliminar duplicados por ID
            const seen = new Set();
            this.notifications = this.notifications.filter(n => {
                if (!n.id) return true;
                const duplicate = seen.has(n.id);
                seen.add(n.id);
                return !duplicate;
            });

            this.updateBadge();
            if (this.menu && !this.menu.classList.contains('hidden')) {
                this.renderMenu();
            }
        } catch (err) {
            console.error('❌ [Notifications] Error en fetchNotifications:', err);
        }
    }

    setupRealtime() {
        const user = window.authManager?.currentUser;
        if (!user) return;
        const userId = user.id;

        console.log(`📡 [Notifications] Configurando Realtime (INSERT) para user_id: ${userId}`);

        const channel = window.supabaseClient
            .channel(`notifications:${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                console.log('📬 [Notifications] Nuevo registro detectado vía Realtime!', payload);
                
                // Optimistic UI Update: Mostrar en la campana de inmediato
                if (payload.new && payload.new.id) {
                    const isEn = window.i18n && window.i18n.getLang() === 'en';
                    this.notifications.unshift({
                        id: payload.new.id,
                        recipeId: payload.new.recipe_id,
                        recipeName: isEn ? 'Loading recipe...' : 'Cargando receta...',
                        type: payload.new.type || 'recipe_shared',
                        timestamp: payload.new.created_at || new Date().toISOString(),
                        sender: '...',
                        prefix: '',
                        leido: false
                    });
                    this.updateBadge(); // Esto hará que tiemble y suba el contador inmediatamente
                    if (this.menu && !this.menu.classList.contains('hidden')) {
                        this.renderMenu();
                    }
                }

                // Delay para asegurar que los joins (from_user, recipes) estén listos
                setTimeout(() => this.fetchNotifications(), 800);
                
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                if (window.utils && window.utils.showToast) {
                    window.utils.showToast(isEn ? '🔔 You have received a new recipe!' : '🔔 ¡Has recibido una nueva receta!', 'info');
                }
            });

        channel.subscribe((status) => {
            console.log(`📡 [Notifications] Realtime Channel Status: ${status}`);
        });
    }

    updateBadge() {
        if (!this.badge) return;
        const unreadCount = this.notifications.filter(n => !n.leido).length;
        console.log(`🔔 [Notifications] Actualizando badge: ${unreadCount} pendientes`);
        const btn = document.getElementById('btn-notifications');

        if (unreadCount > 0) {
            this.badge.classList.remove('hidden');
            this.badge.textContent = unreadCount;
            if (this.lastCount < unreadCount && btn) {
                btn.classList.add('bell-shake');
                setTimeout(() => btn.classList.remove('bell-shake'), 1000);
            }
        } else {
            this.badge.classList.add('hidden');
        }
        this.lastCount = unreadCount;
    }

    addUpdateNotification(worker) {
        if (!this.isReady) {
            console.log('🔔 [Notifications] Manager no listo, encolando actualización...');
            this.pendingNotifications.push(() => this.addUpdateNotification(worker));
            return;
        }

        console.log('🔔 [Notifications] Agregando tarjeta de actualización manual...');
        this.updateWorker = worker;
        // Evitar duplicados en la lista de UI
        if (this.notifications.some(n => n.type === 'app_update')) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // Añadir al principio de la lista
        this.notifications.unshift({
            id: 'update-1',
            type: 'app_update',
            recipeName: isEn ? 'New Version Available' : 'Nueva versión disponible',
            sender: 'Sistema',
            timestamp: new Date().toISOString(),
            leido: false
        });

        this.updateBadge();
        if (this.menu && !this.menu.classList.contains('hidden')) {
            this.renderMenu();
        }

        // Mostrar un Toast para asegurar que el usuario lo vea
        if (window.utils && window.utils.showToast) {
            window.utils.showToast(isEn ? '🔔 New update available!' : '🔔 ¡Nueva actualización disponible!', 'info', 5000);
        }
    }

    addSyncNotification() {
        if (!this.isReady) {
            console.log('🔔 [Notifications] Manager no listo, encolando aviso de sync...');
            this.pendingNotifications.push(() => this.addSyncNotification());
            return;
        }

        // Evitar duplicados
        if (this.notifications.some(n => n.type === 'offline_sync')) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // Añadir al principio de la lista
        this.notifications.unshift({
            id: 'sync-prompt-1',
            type: 'offline_sync',
            recipeName: isEn ? 'Recipes Offline' : 'Recetas Offline',
            sender: 'Sistema',
            timestamp: new Date().toISOString(),
            leido: false
        });

        this.updateBadge();
        if (this.menu && !this.menu.classList.contains('hidden')) {
            this.renderMenu();
        }

        // Mostrar un Toast discreto
        if (window.utils && window.utils.showToast) {
            window.utils.showToast(isEn ? '🔔 Access your recipes offline!' : '🔔 ¡Accede a tus recetas sin conexión!', 'info', 5000);
        }
    }

    toggleMenu(event) {
        if (event) event.stopPropagation();
        if (!this.menu) return;

        const isHidden = this.menu.classList.contains('hidden');
        if (isHidden) {
            this.renderMenu();
            this.menu.classList.remove('hidden');
        } else {
            this.menu.classList.add('hidden');
        }
    }

    renderMenu() {
        if (!this.list) return;

        if (this.notifications.length === 0) {
            this.list.innerHTML = `
                <div class="notifications-empty">
                    <p>Sin notificaciones</p>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.notifications.map(n => {
            if (n.type === 'app_update') {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const msg = isEn ? 'Tap to apply the new version and reload.' : 'Toca para aplicar la nueva versión y recargar.';
                const btnText = isEn ? 'Update Now' : 'Actualizar ahora';
                return `
                    <div class="notification-item unread" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; align-items:flex-start; gap:12px;">
                            <div class="notification-avatar" style="flex-shrink:0; background:#10B981;">
                                🚀
                            </div>
                            <div style="flex:1; min-width:0;">
                                <span style="color:white; display:block; font-size:13px; font-weight:600;">Recipe Pantry</span>
                                <span style="color:#10B981; font-weight:700; display:block; margin-top:2px;">${n.recipeName}</span>
                                <span style="color:#bbb; font-size:11px; display:block; margin-top:4px;">${msg}</span>
                                
                                <!-- Action buttons -->
                                <div style="display:flex; gap:8px; margin-top:10px;">
                                    <button onclick="event.stopPropagation(); window.notificationManager.handleUpdateApp()"
                                        style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                        🔄 ${btnText}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (n.type === 'offline_sync') {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const msg = isEn 
                    ? 'Download your recipes to use them without internet.' 
                    : 'Descarga tus recetas para usarlas sin internet.';
                const btnText = isEn ? 'Download Now' : 'Descargar ahora';
                return `
                    <div class="notification-item unread" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; align-items:flex-start; gap:12px;">
                            <div class="notification-avatar" style="flex-shrink:0; background:#10B981;">
                                📥
                            </div>
                            <div style="flex:1; min-width:0;">
                                <span style="color:white; display:block; font-size:13px; font-weight:600;">Recipe Pantry</span>
                                <span style="color:#10B981; font-weight:700; display:block; margin-top:2px;">${n.recipeName}</span>
                                <span style="color:#bbb; font-size:11px; display:block; margin-top:4px;">${msg}</span>
                                
                                <!-- Action buttons -->
                                <div style="display:flex; gap:8px; margin-top:10px;">
                                    <button onclick="event.stopPropagation(); window.notificationManager.handleSyncDownload('${n.id}')"
                                        style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                        ⚡ ${btnText}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            const safeRecipeId = n.recipeId || '';
            const isRecipeIdValid = safeRecipeId.length > 10 && safeRecipeId !== 'undefined';
            
            return `
                <div class="notification-item ${n.leido ? '' : 'unread'}" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <div class="notification-avatar" style="flex-shrink:0;">
                            ${n.sender ? n.sender.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div style="flex:1; min-width:0;">
                            <span style="color:white; display:block; font-size:13px; font-weight:600;">${n.prefix} ${n.sender} te ha compartido una receta</span>
                            <span style="color:#10B981; font-weight:700; display:block; margin-top:2px;">${n.recipeName}</span>
                            <span style="color:#666; font-size:10px; display:block; margin-top:4px;">${new Date(n.timestamp).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            
                            <!-- Action buttons -->
                            <div style="display:flex; gap:8px; margin-top:10px; ${isRecipeIdValid ? '' : 'opacity:0.5; pointer-events:none;'}">
                                <button onclick="event.stopPropagation(); window.notificationManager.handleAcceptRecipe('${n.id}', '${safeRecipeId}')"
                                    style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                    ✅ Agregar a mis recetas
                                </button>
                                <button onclick="event.stopPropagation(); window.notificationManager.handleDeclineRecipe('${n.id}', '${safeRecipeId}')"
                                    style="flex:1; padding:8px 12px; background:rgba(255,255,255,0.1); color:#ccc; border:1px solid rgba(255,255,255,0.15); border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;">
                                    Dejar en compartidas
                                </button>
                            </div>
                            <!-- Error fallback message if ID is invalid -->
                            ${!isRecipeIdValid ? '<span style="color:red; font-size:10px; display:block; margin-top:4px;">⚠️ Error: ID de receta no válido</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    handleUpdateApp() {
        console.log('🔄 [Notifications] Intentando actualizar app...', this.updateWorker);
        
        if (this.updateWorker && this.updateWorker.state !== 'redundant') {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            if (window.utils && window.utils.showToast) {
                window.utils.showToast(isEn ? 'Updating app...' : 'Actualizando la app...', 'info');
            }
            
            try {
                this.updateWorker.postMessage({ type: 'SKIP_WAITING' });
            } catch (err) {
                console.error('❌ Error postMessage to worker:', err);
                window.location.reload();
            }
        } else {
            console.warn('⚠️ No hay worker activo para actualizar o está redundante. Recargando...');
            window.location.reload();
        }
    }

    handleSyncDownload(notificationId) {
        if (window.syncManager) {
            window.syncManager.preloadOfflineRecipes({ silent: false });
            
            // Marcar como leída y quitar de la lista
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();
            this.menu.classList.add('hidden');
        }
    }

    /**
     * Accept: Convierte la receta en propia
     */
    async handleAcceptRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            // 0. Verificar si el nombre ya existe en mis recetas
            const n = this.notifications.find(item => item.id === notificationId);
            if (n && n.recipeName) {
                const exists = await window.db.recipeNameExists(n.recipeName, { includeShared: false });
                if (exists) {
                    window.utils.showToast(
                        window.i18n && window.i18n.getLang() === 'en' ?
                            'A recipe with this name already exists in your recipes' :
                            'esta receta con este nobree ya esta en tus recetas',
                        'warning'
                    );
                    return;
                }
            }

            window.utils.showToast(window.i18n ? window.i18n.t('savingRecipe') : 'Guardando receta...', 'info');

            // 1. Actualizar estado en el servidor (shared_recipes) - Opcional si vamos a borrar, pero mantenemos flujo
            const { error: shareError } = await window.supabaseClient
                .from('shared_recipes')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            if (shareError) throw shareError;

            // 2. Duplicar la receta
            const duplicateResult = await window.db.duplicateRecipe(recipeId, user.id);
            if (!duplicateResult.success) throw new Error(duplicateResult.error);

            // 3. Eliminar de compartidas definitivamente
            await window.db.deleteSharedRecipe(user.id, recipeId);

            // 4. Marcar notificación como leída (y cualquier otra duplicada para esta receta)
            const { error: notifError } = await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('user_id', user.id)
                .eq('recipe_id', recipeId)
                .eq('type', 'recipe_shared');

            if (notifError) {
                console.error('⚠️ [Notifications] Error marcando como leída:', notifError);
                // Intentar backup por ID exacto si el filtro complejo falla
                await window.supabaseClient.from('notifications').update({ leido: true }).eq('id', notificationId);
            }

            // 5. Actualizar UI
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.utils.showToast('✅ ¡Receta agregada a tu colección!', 'success');

            // 6. NAVEGACIÓN AUTOMÁTICA a "Mis Recetas"
            if (window.dashboardManager) {
                window.dashboardManager.switchView('recipes');
            } else if (window.dashboard) {
                window.dashboard.switchView('recipes');
            }

        } catch (err) {
            console.error('Error aceptando receta:', err);
            window.utils.showToast('Error al agregar la receta', 'error');
        }
    }

    /**
     * Decline: Dejar en compartidas
     */
    async handleDeclineRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            window.utils.showToast('Guardando en compartidas...', 'info');

            // 1. Update shared_recipes status
            const { error: shareError } = await window.supabaseClient
                .from('shared_recipes')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            if (shareError) throw shareError;

            // 2. Mark notification as read (and any duplicates)
            const { error: notifError } = await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('user_id', user.id)
                .eq('recipe_id', recipeId);
            
            if (notifError) {
                console.error('⚠️ [Notifications] Error marcando declive como leído:', notifError);
                await window.supabaseClient.from('notifications').update({ leido: true }).eq('id', notificationId);
            }

            // 3. Update UI
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.utils.showToast('Receta guardada en compartidas', 'success');

            // 4. NAVEGACIÓN AUTOMÁTICA a "Compartidas"
            if (window.dashboardManager) {
                window.dashboardManager.switchView('shared');
            } else if (window.dashboard) {
                window.dashboard.switchView('shared');
            }

        } catch (err) {
            console.error('Error procesando receta:', err);
            window.utils.showToast('Error al procesar', 'error');
        }
    }

    // Legacy: direct click opens recipe
    async handleNotificationClick(notificationId) {
        const n = this.notifications.find(n => n.id === notificationId);
        if (!n) return;

        try {
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

            this.notifications = this.notifications.filter(item => item.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.location.href = `/recipe-detail?id=${n.recipeId}`;
            this.menu.classList.add('hidden');
        } catch (err) {
            console.error('Error:', err);
            window.location.href = `/recipe-detail?id=${n.recipeId}`;
        }
    }
}

// Inicializar y exponer globalmente
window.notificationManager = new NotificationManager();
