// js/db.js
// Funciones de base de datos con soporte offline TOTAL (IndexedDB + SyncQueue)

class DatabaseManager {
    constructor() {
        this._isOnline = navigator.onLine;
        window.addEventListener('online', () => this._isOnline = true);
        window.addEventListener('offline', () => this._isOnline = false);
        // Registro de IDs borrados recientemente (tombstone) - evita que el background refresh los resucite
        this._deletedIds = new Set();
        console.log('📦 DatabaseManager: Inicializando (v218)');
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
        const forceRefresh = filters.forceRefresh === true;

        // 1. Mostrar de caché local a menos que se fuerce el refresco
        let recipes = [];
        if (window.localDB && !forceRefresh) {
            recipes = await window.localDB.getAll('recipes_index');
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

            // Ordenar locally
            const orderCol = filters.orderBy || 'updated_at';
            const asc = filters.ascending !== undefined ? filters.ascending : false;
            filteredRecipes.sort((a, b) => {
                const valA = a[orderCol];
                const valB = b[orderCol];
                if (valA < valB) return asc ? -1 : 1;
                if (valA > valB) return asc ? 1 : -1;
                return 0;
            });

            // CORRECCIÓN CRÍTICA: Si el filtro específico (ej. shared) no devolvió nada, 
            // pero tenemos recetas en caché, NO asumimos que no hay. Vamos al servidor.
            const hasSpecificFilter = filters.shared || filters.favorite || filters.categoryId || filters.search;
            if (filteredRecipes.length === 0 && hasSpecificFilter && this._isOnline) {
                console.log(`🔍 Filtro local vacío para ${JSON.stringify(filters)}, reintentando desde servidor...`);
                return this._fetchRecipesFromServer(filters);
            }

            console.log(`⚡ ${filteredRecipes.length} recetas desde caché (recipes_index)`);
            
            // Trigger event for listeners like SyncManager
            window.dispatchEvent(new CustomEvent('recipes-index-updated', { detail: filteredRecipes }));

            // 2. Refresco silencioso en segundo plano
            if (this._isOnline) {
                this._refreshRecipesInBackground(filters);
            }

            return { success: true, recipes: filteredRecipes, fromCache: true };
        }

        // Si no hay nada en caché o se forzó el refresco, ir a la red
        return this._fetchRecipesFromServer(filters);
    }

    async _refreshRecipesInBackground(filters) {
        if (!this._isOnline) return;
        try {
            const result = await this._fetchRecipesFromServer(filters);
            if (result.success && !result.fromCache) {
                const filtered = result.recipes.filter(r => !this._deletedIds.has(r.id));
                window.dispatchEvent(new CustomEvent('recipes-index-updated', { detail: filtered }));
            }
        } catch (e) { /* silent */ }
    }

    async _fetchRecipesFromServer(filters = {}) {
        if (!this._isOnline) {
            return { success: false, error: 'Estás sin conexión', recipes: [] };
        }

        try {
            const url = new URL('/api/recipes', window.location.origin);
            const userId = window.authManager?.currentUser?.id;

            if (userId) url.searchParams.set('user_id', userId);
            if (filters.search) url.searchParams.set('search', filters.search);
            if (filters.categoryId) url.searchParams.set('category_id', filters.categoryId);
            if (filters.favorite) url.searchParams.set('favorite', 'true');
            if (filters.shared) url.searchParams.set('shared', 'true');
            if (filters.orderBy) url.searchParams.set('sort_by', filters.orderBy);
            if (filters.ascending !== undefined) url.searchParams.set('sort_order', filters.ascending.toString());

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

                recipes = recipes.filter(r => !this._deletedIds.has(r.id));
                await window.localDB.putAll('recipes', recipes);

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

            // Trigger event for listeners like SyncManager
            window.dispatchEvent(new CustomEvent('recipes-index-updated', { detail: recipes }));

            return { success: true, recipes, fromCache: false };
        } catch (error) {
            console.error('❌ Edge API Error _fetchRecipesFromServer:', error);
            const localRecipes = await window.localDB?.getAll('recipes') || [];
            return { success: true, recipes: localRecipes, fromCache: true };
        }
    }

    async recipeNameExists(name, options = { includeShared: true, excludeId: null }) {
        if (!name) return false;
        await this._checkLocalDB();
        const includeShared = options.includeShared !== false;
        const excludeId = options.excludeId || null;

        // 1. Buscar en caché local (recipes_index)
        const recipes = await window.localDB.getAll('recipes_index');
        
        const existsLocally = recipes.some(r => {
            if (excludeId && r.id === excludeId) return false;
            // Si includeShared es falso, ignoramos las que son 'received'
            if (!includeShared && r.sharingContext === 'received') return false;
            
            const matchEs = r.name_es && r.name_es.toLowerCase().trim() === name.toLowerCase().trim();
            const matchEn = r.name_en && r.name_en.toLowerCase().trim() === name.toLowerCase().trim();
            return matchEs || matchEn;
        });

        if (existsLocally) return true;

        // 2. Si no está en caché y estamos online, verificar con el servidor
        if (this._isOnline) {
            try {
                const userId = window.authManager.currentUser?.id;
                
                // Siempre verificar en mis recetas
                let queryMine = window.supabaseClient
                    .from('recipes')
                    .select('id')
                    .eq('user_id', userId)
                    .or(`name_es.ilike."${name}",name_en.ilike."${name}"`);
                    
                if (excludeId) {
                    queryMine = queryMine.neq('id', excludeId);
                }

                const { data: mine, error: errorMine } = await queryMine.limit(1);

                if (errorMine) throw errorMine;
                if (mine && mine.length > 0) return true;

                // Solo verificar en compartidas si se solicita
                if (includeShared) {
                    const { data: shared, error: errorShared } = await window.supabaseClient
                        .from('shared_recipes')
                        .select('id, recipe:recipes(name_es, name_en)')
                        .eq('recipient_user_id', userId)
                        .eq('status', 'accepted')
                        .eq('copied', false);

                    if (errorShared) throw errorShared;
                    
                    const existsInShared = shared?.some(s => 
                        (s.recipe?.name_es && s.recipe.name_es.toLowerCase().trim() === name.toLowerCase().trim()) ||
                        (s.recipe?.name_en && s.recipe.name_en.toLowerCase().trim() === name.toLowerCase().trim())
                    );
                    if (existsInShared) return true;
                }
                
                return false;
            } catch (err) {
                console.warn('⚠️ Error en recipeNameExists server check:', err);
                return false;
            }
        }

        return false;
    }


    async getRecipeById(recipeId, forceRefresh = false) {
        await this._checkLocalDB();
        if (!forceRefresh) {
            let recipe = await window.localDB.get('recipes_full', recipeId);
            
            // Fallback: Si no está en full, buscar en index (metadatos básicos)
            if (!recipe) {
                const indexRecipe = await window.localDB.get('recipes_index', recipeId);
                if (indexRecipe) {
                    console.warn(`⚠️ Receta ${recipeId} no encontrada en full. Usando datos básicos del índice.`);
                    return { success: true, recipe: { ...indexRecipe, isPartial: true }, fromCache: true };
                }
            }

            if (recipe) {
                console.log(`ℹ️ Cargando receta ${recipeId} (Modo Offline-Ready)`);
                if (this._isOnline) this._revalidateRecipeInBackground(recipeId, recipe.updated_at);
                return { success: true, recipe: recipe, fromCache: true };
            }
        } else {
            console.log(`🚀 Forzando carga de red para receta ${recipeId}...`);
        }

        if (!this._isOnline) return { success: false, error: "Sin conexión y no hay copia local" };
        return this._fetchFullRecipeFromServer(recipeId, forceRefresh);
    }

    async _revalidateRecipeInBackground(recipeId, lastUpdated) {
        try {
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
        // AbortController para timeout de 5 segundos (v214)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const headers = { 'Content-Type': 'application/json' };
            const { data: sessionData } = await window.supabaseClient.auth.getSession();
            if (sessionData?.session?.access_token) {
                headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
            }
            
            const connector = recipeId.includes('?') ? '&' : '?';
            const url = `/api/recipe/${recipeId}${connector}t=${Date.now()}`;

            const response = await fetch(url, { 
                method: 'GET', 
                headers: headers,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

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
            clearTimeout(timeoutId);
            const isTimeout = error.name === 'AbortError';
            console.error(isTimeout ? `⏱️ Timeout (5s) en fetch de receta ${recipeId}` : `❌ Error fetching full recipe ${recipeId}:`, error);
            
            // Si falló la red pero forzamos un refresh, intentar devolver lo que haya en caché como último recurso
            const cached = await window.localDB.get('recipes_full', recipeId);
            if (cached) {
                console.log('✅ Fallback a caché local tras fallo de red');
                return { success: true, recipe: cached, fromCache: true };
            }

            return { success: false, error: isTimeout ? 'Timeout de conexión' : error.message };
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
                if (window.localDB) {
                    await window.localDB.delete('recipes_full', recipeId);
                    await window.localDB.delete('recipes_index', recipeId);
                    await window.localDB.delete('recipes', recipeId);
                }
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    for (const name of cacheNames) {
                        const cache = await caches.open(name);
                        await cache.delete(`/api/recipe/${recipeId}`);
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
     * Copia técnica profunda: metadatos + ingredientes + pasos.
     */
    async duplicateRecipe(sourceRecipeId, targetUserId) {
        if (!this._isOnline) return { success: false, error: 'Debes tener conexión para duplicar una receta.' };
        try {
            // 1. Obtener la receta COMPLETA (con ingredientes y pasos)
            const { success, recipe, error: fetchError } = await this.getRecipeById(sourceRecipeId, true);
            if (!success) throw new Error(fetchError);

            // 2. Verificar si el nombre ya existe en la colección del usuario (Nuevo requisito)
            const recipeName = (window.i18n && window.i18n.getLang() === 'en') ? (recipe.name_en || recipe.name_es) : recipe.name_es;
            const exists = await this.recipeNameExists(recipeName, { includeShared: false });
            if (exists) {
                return { success: false, error: `Ya existe una receta con el nombre "${recipeName}" en tu colección.` };
            }

            // 3. Insertar metadatos base
            const { data: newRecipeData, error: recipeError } = await window.supabaseClient.from('recipes').insert([{
                user_id: targetUserId,
                name_es: recipe.name_es,
                name_en: recipe.name_en || null,
                description_es: recipe.description_es,
                description_en: recipe.description_en,
                category_id: recipe.category_id,
                pantry_es: recipe.pantry_es,
                pantry_en: recipe.pantry_en,
                personal_notes: recipe.personal_notes,
                tags: recipe.tags,
                is_active: true,
                is_favorite: false
            }]).select().single();

            if (recipeError) throw recipeError;
            const newRecipeId = newRecipeData.id;

            // 3. Insertar ingredientes
            if (recipe.ingredients?.length > 0) {
                const ingredientsToInsert = recipe.ingredients.map(i => ({
                    recipe_id: newRecipeId,
                    name_es: i.name_es,
                    name_en: i.name_en,
                    quantity: (i.quantity === '' || i.quantity === undefined) ? null : i.quantity,
                    unit_es: i.unit_es,
                    unit_en: i.unit_en,
                    order_index: (i.order_index === '' || i.order_index === undefined) ? null : i.order_index
                }));
                const { error: ingErr } = await window.supabaseClient.from('ingredients').insert(ingredientsToInsert);
                if (ingErr) console.warn('⚠️ Error copiando ingredientes:', ingErr.message);
            }

            // 4. Insertar pasos
            const steps = recipe.preparation_steps || recipe.steps;
            if (steps?.length > 0) {
                const stepsToInsert = steps.map(s => ({
                    recipe_id: newRecipeId,
                    instruction_es: s.instruction_es,
                    instruction_en: s.instruction_en || null,
                    step_number: (s.step_number === '' || s.step_number === undefined) ? null : s.step_number
                }));
                const { error: stpErr } = await window.supabaseClient.from('preparation_steps').insert(stepsToInsert);
                if (stpErr) console.warn('⚠️ Error copiando pasos:', stpErr.message);
            }

            // 5. Marcar la receta compartida como COPIADA para que desaparezca de "Compartidas"
            const { error: copyErr } = await window.supabaseClient
                .from('shared_recipes')
                .update({ 
                    copied: true, 
                    copied_at: new Date().toISOString() 
                })
                .eq('recipe_id', sourceRecipeId)
                .eq('recipient_user_id', targetUserId);
            
            if (copyErr) console.warn('⚠️ Error marcando como copiada:', copyErr.message);

            // 6. Cachear localmente la nueva receta y limpiar rastro de la vieja
            if (window.localDB) {
                await window.localDB.delete('recipes_index', sourceRecipeId);
                const completelyDuplicatedRecipe = { ...newRecipeData, sharingContext: null, ingredients: recipe.ingredients, preparation_steps: steps };
                await window.localDB.put('recipes_full', completelyDuplicatedRecipe);
                await window.localDB.put('recipes_index', {
                    id: newRecipeData.id, name_es: newRecipeData.name_es, name_en: newRecipeData.name_en,
                    updated_at: newRecipeData.updated_at, category_id: newRecipeData.category_id,
                    is_favorite: false, sharingContext: null
                });
            }

            console.log(`✅ Receta duplicada: ${sourceRecipeId} → ${newRecipeId}`);
            return { success: true, newRecipeId: newRecipeId };
        } catch (error) {
            console.error('❌ Error duplicando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteRecipe(recipeId) {
        await this._checkLocalDB();
        this._deletedIds.add(recipeId);
        setTimeout(() => this._deletedIds.delete(recipeId), 60000);

        if (window.localDB) {
            await window.localDB.delete('recipes_index', recipeId);
            await window.localDB.delete('recipes_full', recipeId);
            await window.localDB.delete('recipes', recipeId);
        }

        if (this._isOnline) {
            try {
                const userId = window.authManager.currentUser?.id;
                await window.supabaseClient.from('shared_recipes').delete().eq('recipe_id', recipeId).eq('recipient_user_id', userId);
                await window.supabaseClient.from('shared_recipes').delete().eq('recipe_id', recipeId).eq('owner_user_id', userId);
                await window.supabaseClient.from('ocr_queue').delete().eq('recipe_id', recipeId);
                const { error: deleteError } = await window.supabaseClient.from('recipes').delete().eq('id', recipeId).eq('user_id', userId);

                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    for (const name of cacheNames) {
                        const cache = await caches.open(name);
                        await cache.delete(`/api/recipe/${recipeId}`);
                        const cachedRequests = await cache.keys();
                        for (const req of cachedRequests) {
                            if (req.url.includes('/api/recipes')) await cache.delete(req);
                        }
                    }
                }
                return { success: true };
            } catch (err) {
                console.error('❌ Error en deleteRecipe:', err);
                return { success: false, error: err.message };
            }
        } else {
            await window.localDB.enqueueSync('delete', 'recipes', { id: recipeId }, recipeId);
            return { success: true, offline: true };
        }
    }

    async toggleFavorite(recipeId, currentStatus) {
        await this._checkLocalDB();
        const targetStatus = currentStatus === true || currentStatus === 'true' ? false : true;
        const cachedFull = await window.localDB.get('recipes_full', recipeId);
        const cachedIndex = await window.localDB.get('recipes_index', recipeId);
        if (cachedFull) { cachedFull.is_favorite = targetStatus; await window.localDB.put('recipes_full', cachedFull); }
        if (cachedIndex) { cachedIndex.is_favorite = targetStatus; await window.localDB.put('recipes_index', cachedIndex); }
        if (this._isOnline) {
            try {
                const userId = window.authManager.currentUser?.id;
                await window.supabaseClient.from('recipes').update({ is_favorite: targetStatus }).eq('id', recipeId).eq('user_id', userId);
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
            recipe_id: recipeId, name_es: ing.name_es, name_en: ing.name_en,
            unit_es: ing.unit_es, unit_en: ing.unit_en, quantity: ing.quantity
        }));
        if (this._isOnline) {
            try {
                await window.supabaseClient.from('ingredients').insert(items);
                return { success: true };
            } catch (e) { return { success: false, error: e.message }; }
        } else {
            for (let item of items) await window.localDB.enqueueSync('insert', 'ingredients', item, recipeId);
            return { success: true, offline: true };
        }
    }

    async addSteps(recipeId, steps) {
        await this._checkLocalDB();
        const items = steps.map((step, idx) => ({
            recipe_id: recipeId, instruction_es: step.instruction_es, instruction_en: step.instruction_en,
            step_number: step.step_order || step.step_number || (idx + 1)
        }));
        if (this._isOnline) {
            try {
                await window.supabaseClient.from('preparation_steps').insert(items);
                return { success: true };
            } catch (e) { return { success: false, error: e.message }; }
        } else {
            for (let item of items) await window.localDB.enqueueSync('insert', 'preparation_steps', item, recipeId);
            return { success: true, offline: true };
        }
    }

    async deleteIngredients(recipeId) {
        if (!this._isOnline) { await window.localDB.enqueueSync('delete_permanent', 'ingredients', { recipe_id: recipeId }, recipeId); return { success: true, offline: true }; }
        try { await window.supabaseClient.from('ingredients').delete().eq('recipe_id', recipeId); return { success: true }; }
        catch (e) { return { success: false, error: e.message }; }
    }

    async deleteSteps(recipeId) {
        if (!this._isOnline) { await window.localDB.enqueueSync('delete_permanent', 'preparation_steps', { recipe_id: recipeId }, recipeId); return { success: true, offline: true }; }
        try { await window.supabaseClient.from('preparation_steps').delete().eq('recipe_id', recipeId); return { success: true }; }
        catch (e) { return { success: false, error: e.message }; }
    }

    async getMyCategories() {
        await this._checkLocalDB();
        const cached = await window.localDB.getAll('categories');
        if (this._isOnline) {
            try {
                const { data } = await window.supabaseClient.from('categories').select('*').order('order_index');
                await window.localDB.putAll('categories', data);
                return { success: true, categories: data };
            } catch (error) {
                if (cached.length) return { success: true, categories: cached, fromCache: true };
            }
        } else { return { success: true, categories: cached, fromCache: true, offline: true }; }
    }

    async deleteSharedRecipe(userId, recipeId) {
        this._deletedIds.add(recipeId);
        setTimeout(() => this._deletedIds.delete(recipeId), 60000);
        if (window.localDB) {
            await window.localDB.delete('recipes_index', recipeId);
            await window.localDB.delete('recipes_full', recipeId);
            await window.localDB.delete('recipes', recipeId);
        }
        if (!this._isOnline) return { success: true, offline: true };
        try {
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                for (const name of cacheNames) {
                    const cache = await caches.open(name);
                    await cache.delete(`/api/recipe/${recipeId}`);
                    const cachedRequests = await cache.keys();
                    for (const req of cachedRequests) {
                        if (req.url.includes('/api/recipes')) await cache.delete(req);
                    }
                }
            }
            await window.supabaseClient.from('shared_recipes').delete().eq('recipient_user_id', userId).eq('recipe_id', recipeId);
            return { success: true };
        } catch (e) {
            this._deletedIds.delete(recipeId);
            return { success: false, error: e.message };
        }
    }
}

window.db = new DatabaseManager();
