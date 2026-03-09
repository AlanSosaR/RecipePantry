// js/db.js
// Funciones de base de datos con soporte offline TOTAL (IndexedDB + SyncQueue)

class DatabaseManager {
    constructor() {
        this._isOnline = navigator.onLine;
        window.addEventListener('online', () => this._isOnline = true);
        window.addEventListener('offline', () => this._isOnline = false);
        // Registro de IDs borrados recientemente (tombstone) - evita que el background refresh los resucite
        this._deletedIds = new Set();
    }

    async _checkLocalDB() {
        if (window.localDB) await window.localDB.init();
    }

    // ============================================
    // RECIPES - CRUD (Offline-First)
    // ============================================

    async getMyRecipes(filters = {}) {
        await this._checkLocalDB();
        const isUnfiltered = !filters.search && !filters.categoryId && !filters.favorite && !filters.shared;

        // 1. Mostrar instantáneamente de la copia local (Índice Optimizado)
        let recipes = [];
        if (window.localDB) {
            recipes = await window.localDB.getAll('recipes_index');
            // Si está vacío pero existe recipes (v1), intentar leer de ahí como fallback temporal
            // Si está vacío, se esperará a la red (v67: Eliminado fallback legacy que resucitaba borrados)
        }

        // Aplicar filtros locales sobre el índice
        let filteredRecipes = [...recipes];
        if (recipes && recipes.length > 0) {
            if (filters.shared) {
                filteredRecipes = filteredRecipes.filter(r => r.sharingContext === 'received');
            } else {
                filteredRecipes = filteredRecipes.filter(r => r.sharingContext !== 'received');
            }
            if (filters.favorite) filteredRecipes = filteredRecipes.filter(r => r.is_favorite);
            if (filters.categoryId) filteredRecipes = filteredRecipes.filter(r => r.category_id === filters.categoryId);
            if (filters.search) {
                const s = filters.search.toLowerCase();
                filteredRecipes = filteredRecipes.filter(r =>
                    (r.name_es && r.name_es.toLowerCase().includes(s)) ||
                    (r.name_en && r.name_en.toLowerCase().includes(s))
                );
            }

            // Ordenar locally (siempre para asegurar consistencia inmediata)
            const orderCol = filters.orderBy || 'updated_at';
            const asc = filters.ascending !== undefined ? filters.ascending : false; // Default desc for recipes
            filteredRecipes.sort((a, b) => {
                const valA = a[orderCol];
                const valB = b[orderCol];
                if (valA < valB) return asc ? -1 : 1;
                if (valA > valB) return asc ? 1 : -1;
                return 0;
            });

            console.log(`⚡ ${filteredRecipes.length} recetas desde caché (recipes_index)`);

            // 2. Refresco silencioso en segundo plano si hay red
            if (this._isOnline) {
                this._refreshRecipesInBackground(filters);
            }

            return { success: true, recipes: filteredRecipes, fromCache: true };
        }

        // Si no hay nada en caché, esperar a la red
        return this._fetchRecipesFromServer(filters);
    }

    async _refreshRecipesInBackground(filters) {
        if (!this._isOnline) return;
        try {
            const result = await this._fetchRecipesFromServer(filters);
            if (result.success && !result.fromCache) {
                // Filtrar cualquier receta que esté en el registro de borrados recientes (tombstone)
                const filtered = result.recipes.filter(r => !this._deletedIds.has(r.id));
                // Notificar al dashboard que el índice se ha actualizado
                window.dispatchEvent(new CustomEvent('recipes-index-updated', { detail: filtered }));
            }
        } catch (e) { /* silent */ }
    }

    async _fetchRecipesFromServer(filters = {}) {
        if (!this._isOnline) {
            return { success: false, error: 'Estás sin conexión', recipes: [] };
        }

        try {
            // Construir URL con parámetros para Vercel Edge Cache API
            const url = new URL('/api/recipes', window.location.origin);
            const userId = window.authManager?.currentUser?.id;

            // Añadir filtros como query params
            if (userId) {
                url.searchParams.set('user_id', userId);
            }
            if (filters.search) url.searchParams.set('search', filters.search);
            if (filters.categoryId) url.searchParams.set('category_id', filters.categoryId);
            if (filters.favorite) url.searchParams.set('favorite', 'true');
            if (filters.shared) url.searchParams.set('shared', 'true');
            if (filters.orderBy) url.searchParams.set('sort_by', filters.orderBy);
            if (filters.ascending !== undefined) url.searchParams.set('sort_order', filters.ascending.toString());

            // Cache buster para evitar CDN Edge Cache antigua
            url.searchParams.set('t', Date.now());

            const headers = { 'Content-Type': 'application/json' };
            const { data: sessionData } = await window.supabaseClient.auth.getSession();
            if (sessionData?.session?.access_token) {
                headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
            }

            const response = await fetch(url.toString(), { method: 'GET', headers: headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Failed to fetch recipes from API');

            let recipes = [];
            if (result.isSharedFormat) {
                const shared = result.data;
                const senderIds = [...new Set(shared.map(s => s.owner_user_id).filter(Boolean))];
                let senderMap = {};
                if (senderIds.length > 0) {
                    const { data: senders } = await window.supabaseClient.from('users').select('id, first_name, last_name').in('id', senderIds);
                    if (senders) {
                        senders.forEach(u => {
                            senderMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Chef';
                        });
                    }
                }
                recipes = shared.map(s => {
                    const r = s.recipe;
                    if (!r) return null;
                    return {
                        ...r,
                        sharingContext: 'received',
                        sharedPermission: s.permission,
                        senderName: senderMap[s.owner_user_id] || 'Chef'
                    };
                }).filter(Boolean);

                // LIMPIEZA CRÍTICA v69: Debemos limpiar AMBAS tablas locales
                // Si solo limpiamos 'recipes', la tabla 'recipes_index' sigue teniendo el dato viejo y el Dashboard lo muestra.
                if (window.localDB) {
                    const allLocalFull = await window.localDB.getAll('recipes');
                    for (const item of allLocalFull) {
                        if (item.sharingContext === 'received') {
                            await window.localDB.delete('recipes', item.id);
                        }
                    }
                    const allLocalIndex = await window.localDB.getAll('recipes_index');
                    for (const item of allLocalIndex) {
                        if (item.sharingContext === 'received') {
                            await window.localDB.delete('recipes_index', item.id);
                        }
                    }
                }

                // v70: Filtrar tombstones ANTES de guardar en IndexedDB
                recipes = recipes.filter(r => !this._deletedIds.has(r.id));

                await window.localDB.putAll('recipes', recipes);
                // v66: Asegurar que el índice también se actualice con los nuevos datos limpios
                const indexItems = recipes.map(r => ({
                    id: r.id, name_es: r.name_es, name_en: r.name_en, image_url: r.image_url,
                    updated_at: r.updated_at, category_id: r.category_id, is_favorite: r.is_favorite,
                    sharingContext: r.sharingContext || null
                }));
                await window.localDB.putAll('recipes_index', indexItems);
            } else {
                recipes = result.data;
                const { data: sentShared } = await window.supabaseClient.from('shared_recipes').select('recipe_id, recipient_user_id').eq('owner_user_id', userId);
                let recipientMap = {};
                if (sentShared && sentShared.length > 0) {
                    const recipientIds = [...new Set(sentShared.map(s => s.recipient_user_id).filter(Boolean))];
                    if (recipientIds.length > 0) {
                        const { data: recipientUsers } = await window.supabaseClient.from('users').select('id, first_name, last_name').in('id', recipientIds);
                        if (recipientUsers) {
                            recipientUsers.forEach(u => {
                                recipientMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Chef';
                            });
                        }
                    }
                }
                recipes = recipes.map(recipe => {
                    const recipients = sentShared ? sentShared.filter(s => s.recipe_id === recipe.id).map(s => `Chef ${recipientMap[s.recipient_user_id] || ''}`.trim()).filter(Boolean) : [];
                    return { ...recipe, sharingContext: recipients.length > 0 ? 'sent' : null, sharedWith: recipients.join(', ') };
                });
            }

            console.log(`📦 Recipes loaded from API (Index Mode)`);
            if (!filters.search && !filters.categoryId && !filters.favorite && !filters.shared && !result.isSharedFormat) {
                const allLocalIndex = await window.localDB.getAll('recipes_index');
                const received = allLocalIndex.filter(r => r.sharingContext === 'received');
                await window.localDB.clear('recipes_index');
                if (received.length > 0) await window.localDB.putAll('recipes_index', received);
                await window.localDB.putAll('recipes_index', recipes);
            } else {
                await window.localDB.putAll('recipes_index', recipes);
            }

            return { success: true, recipes, fromCache: false };
        } catch (error) {
            console.error('❌ Edge API Error _fetchRecipesFromServer:', error);
            const localRecipes = await window.localDB?.getAll('recipes') || [];
            return { success: true, recipes: localRecipes, fromCache: true };
        }
    }

    async getRecipeById(recipeId, forceRefresh = false) {
        await this._checkLocalDB();

        // Si no se fuerza el refresco, intentar cargar de caché primero
        if (!forceRefresh) {
            const cached = await window.localDB.get('recipes_full', recipeId);
            if (cached) {
                // Log más discreto para no confundir al usuario
                console.log(`ℹ️ Cargando receta ${recipeId} (Modo Offline-Ready)`);
                if (this._isOnline) this._revalidateRecipeInBackground(recipeId, cached.updated_at);
                return { success: true, recipe: cached, fromCache: true };
            }
        } else {
            console.log(`🚀 Forzando carga de red para receta ${recipeId}...`);
        }

        if (!this._isOnline) return { success: false, error: "Sin conexión y no hay copia local" };
        return this._fetchFullRecipeFromServer(recipeId, forceRefresh);
    }

    async _revalidateRecipeInBackground(recipeId, lastUpdated) {
        try {
            // Usar cache-busting para el revalidador también
            const result = await this._fetchFullRecipeFromServer(recipeId, true);
            if (result.success) {
                const newRecipe = result.data;
                if (newRecipe.updated_at !== lastUpdated) {
                    console.log('🔄 Receta actualizada en segundo plano');
                    window.dispatchEvent(new CustomEvent('recipe-detail-updated', { detail: newRecipe }));
                }
            }
        } catch (e) { /* silent */ }
    }

    async _fetchFullRecipeFromServer(recipeId, forceRefresh = false) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            const { data: sessionData } = await window.supabaseClient.auth.getSession();
            if (sessionData?.session?.access_token) {
                headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
            }
            // Cache-busting con timestamp para saltar cachés de red/edge intermedios Y el Service Worker
            const connector = recipeId.includes('?') ? '&' : '?';
            const url = `/api/recipe/${recipeId}${connector}t=${Date.now()}`;

            const response = await fetch(url, { method: 'GET', headers: headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            let recipe = result.data;
            const localMeta = await window.localDB.get('recipes_index', recipeId);
            if (localMeta) {
                if (localMeta.sharingContext) recipe.sharingContext = localMeta.sharingContext;
                if (localMeta.senderName) recipe.senderName = localMeta.senderName;
            }
            await window.localDB.put('recipes_full', recipe);
            const indexData = {
                id: recipe.id, name_es: recipe.name_es, name_en: recipe.name_en,
                image_url: recipe.image_url, updated_at: recipe.updated_at,
                category_id: recipe.category_id, is_favorite: recipe.is_favorite,
                sharingContext: recipe.sharingContext || null
            };
            await window.localDB.put('recipes_index', indexData);
            return { success: true, recipe, data: recipe };
        } catch (error) {
            console.error('Error fetching full recipe:', error);
            return { success: false, error: error.message };
        }
    }

    async createRecipe(recipeData) {
        await this._checkLocalDB();
        const payload = Object.assign({ user_id: window.authManager.currentUser.id }, recipeData);
        if (this._isOnline) {
            try {
                const { data: recipe, error } = await window.supabaseClient.from('recipes').insert([payload]).select().single();
                if (error) throw error;
                await window.localDB.put('recipes_full', recipe);
                await window.localDB.put('recipes_index', {
                    id: recipe.id, name_es: recipe.name_es, name_en: recipe.name_en, image_url: recipe.image_url,
                    updated_at: recipe.updated_at, category_id: recipe.category_id, is_favorite: recipe.is_favorite
                });
                return { success: true, recipe };
            } catch (err) { return { success: false, error: err.message }; }
        } else {
            const tempId = 'temp_' + crypto.randomUUID();
            const tempRecipe = { ...payload, id: tempId, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            await window.localDB.put('recipes_full', tempRecipe);
            await window.localDB.put('recipes_index', {
                id: tempId, name_es: tempRecipe.name_es, name_en: tempRecipe.name_en, image_url: tempRecipe.image_url,
                updated_at: tempRecipe.updated_at, category_id: tempRecipe.category_id, is_favorite: tempRecipe.is_favorite
            });
            await window.localDB.enqueueSync('insert', 'recipes', tempRecipe, null);
            return { success: true, recipe: tempRecipe, offline: true };
        }
    }

    async updateRecipe(recipeId, updates) {
        await this._checkLocalDB();
        const cachedFull = await window.localDB.get('recipes_full', recipeId);
        const cachedIndex = await window.localDB.get('recipes_index', recipeId);
        if (cachedFull) {
            Object.assign(cachedFull, updates);
            await window.localDB.put('recipes_full', cachedFull);
        }
        if (cachedIndex) {
            Object.assign(cachedIndex, updates);
            await window.localDB.put('recipes_index', cachedIndex);
        }

        if (this._isOnline) {
            try {
                const { data: recipe, error } = await window.supabaseClient.from('recipes').update(updates).eq('id', recipeId).select().single();
                if (error) throw error;

                // Forzar recarga completa borrando TODO rastro de caché para este ID
                if (window.localDB) {
                    await window.localDB.delete('recipes_full', recipeId);
                    await window.localDB.delete('recipes_index', recipeId);
                    await window.localDB.delete('recipes', recipeId);
                }

                // NUEVO: Invalidar también la Cache API física del Service Worker
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    for (const name of cacheNames) {
                        const cache = await caches.open(name);
                        // Intentar borrar la URL exacta de la API
                        await cache.delete(`/api/recipe/${recipeId}`);
                        console.log(`🗑️ Caché de API eliminada para ${recipeId}`);
                    }
                }
                return { success: true, recipe };
            } catch (err) { return { success: false, error: err.message }; }
        } else {
            await window.localDB.enqueueSync('update', 'recipes', { id: recipeId, ...updates }, recipeId);
            return { success: true, offline: true };
        }
    }

    /**
     * Duplica una receta compartida como propia del usuario destino.
     * Copia: datos de receta + ingredientes + pasos de preparación.
     */
    async duplicateRecipe(sourceRecipeId, targetUserId) {
        try {
            // 1. Obtener la receta completa desde Supabase (con ingredientes y pasos)
            const { data: src, error: srcErr } = await window.supabaseClient
                .from('recipes')
                .select(`
                    name_es, name_en, description_es, description_en,
                    category_id, pantry_es, pantry_en, personal_notes, tags,
                    ingredients(name_es, name_en, quantity, unit_es, unit_en, order_index),
                    preparation_steps(step_number, instruction_es, instruction_en)
                `)
                .eq('id', sourceRecipeId)
                .single();

            if (srcErr || !src) throw new Error(srcErr?.message || 'Receta no encontrada');

            // 2. Insertar la nueva receta como propia
            const { data: newRecipe, error: rcpErr } = await window.supabaseClient
                .from('recipes')
                .insert({
                    user_id: targetUserId,
                    category_id: src.category_id,
                    name_es: src.name_es,
                    name_en: src.name_en,
                    description_es: src.description_es,
                    description_en: src.description_en,
                    pantry_es: src.pantry_es,
                    pantry_en: src.pantry_en,
                    personal_notes: src.personal_notes,
                    tags: src.tags,
                    is_active: true,
                    is_favorite: false
                })
                .select('id')
                .single();

            if (rcpErr || !newRecipe) throw new Error(rcpErr?.message || 'Error al crear receta');

            const newId = newRecipe.id;

            // 3. Copiar ingredientes (si hay)
            if (src.ingredients && src.ingredients.length > 0) {
                const ingredients = src.ingredients.map(i => ({
                    recipe_id: newId,
                    name_es: i.name_es,
                    name_en: i.name_en,
                    quantity: i.quantity,
                    unit_es: i.unit_es,
                    unit_en: i.unit_en,
                    order_index: i.order_index
                }));
                const { error: ingErr } = await window.supabaseClient.from('ingredients').insert(ingredients);
                if (ingErr) console.warn('⚠️ Error copiando ingredientes:', ingErr.message);
            }

            // 4. Copiar pasos de preparación (si hay)
            if (src.preparation_steps && src.preparation_steps.length > 0) {
                const steps = src.preparation_steps.map(s => ({
                    recipe_id: newId,
                    step_number: s.step_number,
                    instruction_es: s.instruction_es,
                    instruction_en: s.instruction_en
                }));
                const { error: stpErr } = await window.supabaseClient.from('preparation_steps').insert(steps);
                if (stpErr) console.warn('⚠️ Error copiando pasos:', stpErr.message);
            }

            // 5. Invalidar caché local para que la nueva receta aparezca
            if (window.localDB) {
                await window.localDB.delete('recipes_index', sourceRecipeId);
            }

            console.log(`✅ Receta duplicada: ${sourceRecipeId} → ${newId}`);
            return { success: true, newRecipeId: newId };

        } catch (e) {
            console.error('❌ duplicateRecipe error:', e);
            return { success: false, error: e.message };
        }
    }

    async deleteRecipe(recipeId) {
        await this._checkLocalDB();

        // 0. Registrar como borrado (tombstone) para bloquear background refresh
        this._deletedIds.add(recipeId);
        setTimeout(() => this._deletedIds.delete(recipeId), 60000); // Limpiar tras 60s

        // Limpieza agresiva de TODAS las tablas locales posibles para este ID
        if (window.localDB) {
            await window.localDB.delete('recipes_index', recipeId);
            await window.localDB.delete('recipes_full', recipeId);
            await window.localDB.delete('recipes', recipeId); // Legacy fallback
        }

        if (this._isOnline) {
            try {
                const userId = window.authManager.currentUser?.id;

                // Intentar eliminar de ambas tablas para asegurar persistencia (redundancia de seguridad)
                // 1. Si soy receptor de una compartida, elimino el vínculo
                await window.supabaseClient.from('shared_recipes').delete()
                    .eq('recipe_id', recipeId)
                    .eq('recipient_user_id', userId);

                // 2. Si soy el dueño, elimino la receta (hard delete)
                // Primero relaciones con restricción NO ACTION
                await window.supabaseClient.from('shared_recipes').delete().eq('recipe_id', recipeId).eq('owner_user_id', userId);
                await window.supabaseClient.from('ocr_queue').delete().eq('recipe_id', recipeId);

                // Luego la receta propiamente dicha
                const { error: deleteError } = await window.supabaseClient.from('recipes').delete()
                    .eq('id', recipeId)
                    .eq('user_id', userId);

                // 3. Limpiar cachés del Service Worker para evitar reaparición offline/fantasma
                if ('caches' in window) {
                    try {
                        const cacheNames = await caches.keys();
                        for (const name of cacheNames) {
                            const cache = await caches.open(name);
                            // Borrar el detalle y CUALQUIER variante de la lista de recetas
                            await cache.delete(`/api/recipe/${recipeId}`);

                            const cachedRequests = await cache.keys();
                            for (const req of cachedRequests) {
                                // Invalidar TODA la API de recetas para forzar recarga limpia
                                if (req.url.includes('/api/recipes')) {
                                    await cache.delete(req);
                                }
                            }
                        }
                    } catch (e) { console.warn('Cache clear error:', e); }
                }

                // 4. (v65) Ya no forzamos carga desde aquí para evitar saltos de pantalla inesperados.
                // El DashboardManager se encarga de reflejar el cambio localmente.
                return { success: true };
            } catch (err) {
                console.error('❌ Error en deleteRecipe:', err);
                return { success: false, error: err.message };
            }
        } else {
            // Modo Offline: Encolar para sincronización
            await window.localDB.enqueueSync('delete', 'recipes', { id: recipeId }, recipeId);
            return { success: true, offline: true };
        }
    }

    async toggleFavorite(recipeId, currentStatus) {
        await this._checkLocalDB();
        const targetStatus = currentStatus === true || currentStatus === 'true' ? false : true;
        const cachedFull = await window.localDB.get('recipes_full', recipeId);
        const cachedIndex = await window.localDB.get('recipes_index', recipeId);
        if (cachedFull) {
            cachedFull.is_favorite = targetStatus;
            await window.localDB.put('recipes_full', cachedFull);
        }
        if (cachedIndex) {
            cachedIndex.is_favorite = targetStatus;
            await window.localDB.put('recipes_index', cachedIndex);
        }
        if (this._isOnline) {
            try {
                const userId = window.authManager.currentUser?.id;
                const { data, error } = await window.supabaseClient.from('recipes').update({ is_favorite: targetStatus }).eq('id', recipeId).eq('user_id', userId).select();
                if (error) throw error;
                if (!data || data.length === 0) return { success: false, error: "No permiso" };
                return { success: true, isFavorite: targetStatus };
            } catch (err) { return { success: false, error: err.message }; }
        } else {
            await window.localDB.enqueueSync('update', 'recipes', { id: recipeId, is_favorite: targetStatus }, recipeId);
            return { success: true, isFavorite: targetStatus, offline: true };
        }
    }

    async addIngredients(recipeId, ingredients) {
        await this._checkLocalDB();
        const items = ingredients.map(ing => ({
            recipe_id: recipeId,
            name_es: ing.name_es || null,
            name_en: ing.name_en || null,
            unit_es: ing.unit_es || null,
            unit_en: ing.unit_en || null,
            quantity: ing.quantity || null
        }));
        if (this._isOnline) {
            try {
                const { error } = await window.supabaseClient.from('ingredients').insert(items);
                if (error) {
                    console.error('❌ Error Supabase insert ingredientes:', error);
                    throw error;
                }
                return { success: true };
            } catch (e) {
                console.error('❌ Excepción en addIngredients:', e);
                return { success: false, error: e.message };
            }
        } else {
            for (let item of items) await window.localDB.enqueueSync('insert', 'ingredients', item, recipeId);
            return { success: true, offline: true };
        }
    }

    async addSteps(recipeId, steps) {
        await this._checkLocalDB();
        const items = steps.map((step, idx) => ({
            recipe_id: recipeId,
            instruction_es: step.instruction_es || null,
            instruction_en: step.instruction_en || null,
            step_number: step.step_order || step.step_number || (idx + 1)
        }));
        if (this._isOnline) {
            try {
                const { error } = await window.supabaseClient.from('preparation_steps').insert(items);
                if (error) throw error;
                return { success: true };
            } catch (e) { return { success: false, error: e.message }; }
        } else {
            for (let item of items) await window.localDB.enqueueSync('insert', 'preparation_steps', item, recipeId);
            return { success: true, offline: true };
        }
    }

    async deleteIngredients(recipeId) {
        if (!this._isOnline) {
            await window.localDB.enqueueSync('delete_permanent', 'ingredients', { recipe_id: recipeId }, recipeId);
            return { success: true, offline: true };
        }
        try {
            const { error } = await window.supabaseClient.from('ingredients').delete().eq('recipe_id', recipeId);
            if (error) {
                console.error('❌ Error Supabase delete ingredientes:', error);
                throw error;
            }
            return { success: true };
        } catch (e) {
            console.error('❌ Excepción en deleteIngredients:', e);
            return { success: false, error: e.message };
        }
    }

    async deleteSteps(recipeId) {
        if (!this._isOnline) {
            await window.localDB.enqueueSync('delete_permanent', 'preparation_steps', { recipe_id: recipeId }, recipeId);
            return { success: true, offline: true };
        }
        try {
            const { error } = await window.supabaseClient.from('preparation_steps').delete().eq('recipe_id', recipeId);
            if (error) throw error;
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    async getMyCategories() {
        await this._checkLocalDB();
        const cached = await window.localDB.getAll('categories');
        if (this._isOnline) {
            try {
                const { data, error } = await window.supabaseClient.from('categories').select('*').order('order_index');
                if (error) throw error;
                await window.localDB.putAll('categories', data);
                return { success: true, categories: data };
            } catch (error) {
                if (cached.length) return { success: true, categories: cached, fromCache: true };
                console.error('❌ Error categorías:', error);
            }
        } else {
            return { success: true, categories: cached, fromCache: true, offline: true };
        }
    }

    async duplicateRecipe(recipeId, targetUserId) {
        if (!this._isOnline) return { success: false, error: 'Debes tener conexión para duplicar una receta compartida.' };
        try {
            const { success, recipe, error: fetchError } = await this.getRecipeById(recipeId);
            if (!success) throw new Error(fetchError);
            const { data: newRecipeData, error: recipeError } = await window.supabaseClient.from('recipes').insert([{
                user_id: targetUserId, name_es: recipe.name_es, name_en: recipe.name_en || null,
                description_es: recipe.description_es, description_en: recipe.description_en,
                category_id: recipe.category_id, is_active: true, is_favorite: false
            }]).select().single();
            if (recipeError) throw recipeError;
            const newRecipeId = newRecipeData.id;
            if (recipe.ingredients?.length > 0) {
                const ingredientsToInsert = recipe.ingredients.map(i => ({
                    recipe_id: newRecipeId, name_es: i.name_es, name_en: i.name_en,
                    quantity: i.quantity, unit_es: i.unit_es, unit_en: i.unit_en, raw_text: i.raw_text
                }));
                await window.supabaseClient.from('ingredients').insert(ingredientsToInsert);
            }
            const steps = recipe.preparation_steps || recipe.steps;
            if (steps && steps.length > 0) {
                const stepsToInsert = steps.map(s => ({
                    recipe_id: newRecipeId, instruction_es: s.instruction_es, instruction_en: s.instruction_en || null, step_number: s.step_number
                }));
                await window.supabaseClient.from('preparation_steps').insert(stepsToInsert);
            }
            const completelyDuplicatedRecipe = { ...newRecipeData, sharingContext: null, category: recipe.category, ingredients: recipe.ingredients, steps: recipe.steps };
            await window.localDB.put('recipes_full', completelyDuplicatedRecipe);
            await window.localDB.put('recipes_index', {
                id: newRecipeData.id, name_es: newRecipeData.name_es, name_en: newRecipeData.name_en, image_url: newRecipeData.image_url,
                updated_at: newRecipeData.updated_at, category_id: newRecipeData.category_id, is_favorite: newRecipeData.is_favorite, sharingContext: null
            });
            return { success: true, newRecipeId: newRecipeId };
        } catch (error) {
            console.error('Error duplicando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteSharedRecipe(userId, recipeId) {
        // 1. Registrar como borrado (tombstone) para bloquear background refresh
        this._deletedIds.add(recipeId);
        setTimeout(() => this._deletedIds.delete(recipeId), 60000); // Limpiar tras 60s

        // 2. Limpieza local instantánea de TODAS las tablas
        if (window.localDB) {
            await window.localDB.delete('recipes_index', recipeId);
            await window.localDB.delete('recipes_full', recipeId);
            await window.localDB.delete('recipes', recipeId);
        }

        if (!this._isOnline) return { success: true, offline: true };

        try {
            // 3. Limpiar cachés del Service Worker ANTES de borrar en red
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    for (const name of cacheNames) {
                        const cache = await caches.open(name);
                        await cache.delete(`/api/recipe/${recipeId}`);
                        const cachedRequests = await cache.keys();
                        for (const req of cachedRequests) {
                            if (req.url.includes('/api/recipes')) {
                                await cache.delete(req);
                            }
                        }
                    }
                } catch (e) { console.warn('Cache clear error:', e); }
            }

            // 4. Borrar enlace en Supabase
            const { error } = await window.supabaseClient.from('shared_recipes').delete().eq('recipient_user_id', userId).eq('recipe_id', recipeId);
            if (error) throw error;

            console.log(`✅ Receta compartida ${recipeId} eliminada de Supabase`);
            return { success: true };
        } catch (e) {
            // Si falla la red, revertir el tombstone inmediatamente
            this._deletedIds.delete(recipeId);
            console.error('❌ Error en deleteSharedRecipe:', e);
            return { success: false, error: e.message };
        }
    }
}

window.db = new DatabaseManager();
