// js/db.js
// Funciones de base de datos con soporte offline TOTAL (IndexedDB + SyncQueue)

class DatabaseManager {
    constructor() {
        this._isOnline = navigator.onLine;
        window.addEventListener('online', () => this._isOnline = true);
        window.addEventListener('offline', () => this._isOnline = false);
        // Registro de IDs borrados recientemente (tombstone) - evita que el background refresh los resucite
        this._deletedIds = new Set();
        console.log('📦 DatabaseManager: Inicializando (v250)');
        this._forcedCleanup();
    }

    async _forcedCleanup() {
        const FIX_KEY = 'recipe_pantry_fix_250_cleanup';
        if (localStorage.getItem(FIX_KEY) !== 'done') {
            console.warn('🧹 [DB] Forced Cleanup (v249): Clearing local caches to resolve zombie conflicts.');
            try {
                await this._checkLocalDB();
                if (window.localDB) {
                    await window.localDB.clear('recipes_index');
                    await window.localDB.clear('recipes_full');
                    await window.localDB.clear('recipes');
                }
                localStorage.setItem(FIX_KEY, 'done');
            } catch (e) {
                console.error('❌ [DB] Forced Cleanup failed:', e);
            }
        }
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
            let userId = window.authManager?.currentUser?.id;

            // v229: QUITADO fallback a auth_user_id porque causa fallos en la API de recetas (espera PK int/uuid de tabla users)
            if (!userId) {
                console.error('❌ ERROR: userId no disponible en _fetchRecipesFromServer. Perfil:', window.authManager?.currentUser);
                console.warn('⚠️ Abortando fetch para proteger caché de recipes_index.');
                // Retornamos éxito falso pero indicando que viene de cache para no borrar el localDB
                const localRecipes = await window.localDB?.getAll('recipes_index') || [];
                return { success: true, recipes: localRecipes, fromCache: true };
            }

            console.log(`📡 [DB] Fetching recipes directly via Supabase Client (bypassing Edge API)`);
            let recipes = [];
            const isSharedFormat = filters.shared === true;
            let shared = [];

            if (isSharedFormat) {
                let { data, error } = await window.supabaseClient
                    .from('shared_recipes')
                    .select('id, permission, owner_user_id, recipe:recipe_id(id, name_es, name_en, updated_at, is_favorite, is_active)')
                    .eq('recipient_user_id', userId)
                    .eq('status', 'accepted')
                    .eq('copied', false);

                if (error) throw error;
                shared = (data || []).filter(item => item.recipe && item.recipe.is_active !== false);
                const senderIds = [...new Set(shared.map(s => s.owner_user_id).filter(Boolean))];
                let senderMap = {};
                if (senderIds.length > 0) {
                    const { data: senders } = await window.supabaseClient.from('users').select('id, first_name, last_name').in('id', senderIds);
                    if (senders && Array.isArray(senders)) {
                        for (const u of senders) {
                            senderMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Chef';
                        }
                    } else {
                        console.warn('⚠️ [DB] No se pudieron cargar detalles de los remitentes:', senderIds);
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
                    id: r.id, 
                    name_es: r.name_es, 
                    name_en: r.name_en, 
                    image_url: r.image_url,
                    updated_at: r.updated_at, 
                    category_id: r.category_id, 
                    is_favorite: r.is_favorite,
                    sharingContext: r.sharingContext || null,
                    user_id: r.user_id || null // v249: critical for duplicate check
                }));
                await window.localDB.putAll('recipes_index', indexItems);
            } else {
                let query = window.supabaseClient
                    .from('recipes')
                    .select(`id, name_es, name_en, updated_at, is_favorite`)
                    .eq('is_active', true)
                    .eq('user_id', userId);

                if (filters.search && filters.search.trim()) {
                    const s = filters.search.trim();
                    query = query.or(`name_es.ilike.%${s}%,name_en.ilike.%${s}%,description_es.ilike.%${s}%`);
                }
                if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
                if (filters.favorite) query = query.eq('is_favorite', true);

                const sortBy = filters.orderBy || 'updated_at';
                const isAsc = filters.ascending === true || filters.ascending === 'true';
                query = query.order(sortBy, { ascending: isAsc });
                query = query.range(0, 999);

                const { data, error } = await query;
                if (error) throw error;
                recipes = data || [];

                const { data: sentShared } = await window.supabaseClient.from('shared_recipes').select('recipe_id, recipient_user_id').eq('owner_user_id', userId);
                let recipientMap = {};
                if (sentShared && sentShared.length > 0) {
                    const recipientIds = [...new Set(sentShared.map(s => s.recipient_user_id).filter(Boolean))];
                    if (recipientIds.length > 0) {
                        const { data: recipientUsers } = await window.supabaseClient.from('users').select('id, first_name, last_name').in('id', recipientIds);
                        if (recipientUsers && Array.isArray(recipientUsers)) {
                            for (const u of recipientUsers) {
                                recipientMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Chef';
                            }
                        }
                    }
                }
                recipes = recipes.map(recipe => {
                    const recipients = sentShared 
                        ? sentShared
                            .filter(s => s.recipe_id === recipe.id && s.recipient_user_id && recipientMap[s.recipient_user_id])
                            .map(s => `Chef ${recipientMap[s.recipient_user_id]}`)
                            .filter(Boolean)
                        : [];
                    return { 
                        ...recipe, 
                        sharingContext: recipients.length > 0 ? 'sent' : null, 
                        sharedWith: recipients.join(', ') 
                    };
                });
            }

            console.log(`📦 Recipes loaded from DB (Index Mode bypass)`);
            const safeRecipes = Array.isArray(recipes) ? recipes : [];
            if (!filters.search && !filters.categoryId && !filters.favorite && !filters.shared && !isSharedFormat) {
                const allLocalIndex = await window.localDB.getAll('recipes_index');
                const received = allLocalIndex.filter(r => r.sharingContext === 'received');
                await window.localDB.clear('recipes_index');
                if (received.length > 0) await window.localDB.putAll('recipes_index', received);
                await window.localDB.putAll('recipes_index', safeRecipes);
            } else {
                await window.localDB.putAll('recipes_index', safeRecipes);
            }

            // Trigger event for listeners like SyncManager
            window.dispatchEvent(new CustomEvent('recipes-index-updated', { detail: safeRecipes }));

            return { success: true, recipes: safeRecipes, fromCache: false };
        } catch (error) {
            console.error('❌ Edge API Error _fetchRecipesFromServer:', error);
            // v231: Corregido almacen fallback (recipes_index en lugar de recipes)
            const localRecipes = await window.localDB?.getAll('recipes_index') || [];
            return { success: true, recipes: localRecipes, fromCache: true };
        }
    }

    async recipeNameExists(name, options = { includeShared: true, excludeId: null }) {
        if (!name) return false;
        await this._checkLocalDB();
        const includeShared = options.includeShared !== false;
        const excludeId = options.excludeId || null;
        const normalizedName = name.toLowerCase().trim();

        console.log(`🔍 [DB] recipeNameExists check: "${name}" (includeShared: ${includeShared})`);

        // 1. Buscar en caché local (recipes_index)
        const localRecipes = await window.localDB.getAll('recipes_index');
        
        const localMatch = localRecipes.find(r => {
            if (excludeId && r.id === excludeId) return false;
            
            const userId = window.authManager.currentUser?.id;
            
            // v249: Si includeShared es falso, ignoramos las recibidas.
            // Verificamos por contexto o por user_id (si el dueño NO es el usuario actual, es recibida)
            const isReceived = r.sharingContext === 'received' || r.type === 'received' || (r.user_id && userId && r.user_id !== userId);
            if (!includeShared && isReceived) return false;
            
            const matchEs = r.name_es && r.name_es.toLowerCase().trim() === normalizedName;
            const matchEn = r.name_en && r.name_en.toLowerCase().trim() === normalizedName;
            const matchGeneric = r.name && r.name.toLowerCase().trim() === normalizedName;
            return matchEs || matchEn || matchGeneric;
        });

        if (localMatch) {
            console.warn(`🚩 [DB] Conflicto de nombre encontrado LOCALMENTE con ID ${localMatch.id}. (excludeId era: ${excludeId})`, localMatch);
            return true;
        }

        // 2. Si no está en caché y estamos online, verificar con el servidor
        if (this._isOnline) {
            try {
                const userId = window.authManager.currentUser?.id;
                if (!userId) return false;

                // Siempre verificar en mis recetas
                // v248: Usamos sintaxis más limpia para evitar fallos con caracteres especiales
                const { data: mine, error: errorMine } = await window.supabaseClient
                    .from('recipes')
                    .select('id, name_es')
                    .eq('user_id', userId)
                    .or(`name_es.ilike."${name}",name_en.ilike."${name}"`)
                    .limit(1);

                if (errorMine) throw errorMine;
                if (mine && mine.length > 0) {
                    console.warn('🚩 [DB] Conflicto de nombre encontrado en SERVIDOR (Mis Recetas):', mine[0]);
                    return true;
                }

                // Solo verificar en compartidas si se solicita
                if (includeShared) {
                    const { data: shared, error: errorShared } = await window.supabaseClient
                        .from('shared_recipes')
                        .select('id, recipe:recipes(name_es, name_en)')
                        .eq('recipient_user_id', userId)
                        .eq('status', 'accepted')
                        .eq('copied', false);

                    if (errorShared) throw errorShared;
                    
                    const sharedMatch = shared?.find(s => 
                        (s.recipe?.name_es && s.recipe.name_es.toLowerCase().trim() === normalizedName) ||
                        (s.recipe?.name_en && s.recipe.name_en.toLowerCase().trim() === normalizedName)
                    );
                    
                    if (sharedMatch) {
                        console.warn('🚩 [DB] Conflicto de nombre encontrado en SERVIDOR (Compartidas):', sharedMatch);
                        return true;
                    }
                }
                
                return false;
            } catch (err) {
                console.warn('⚠️ [DB] Error en recipeNameExists server check:', err);
                return false;
            }
        }

        return false;
    }


    async getRecipeById(recipeId, forceRefresh = false) {
        console.log('📦 db.getRecipeById: Iniciando para', recipeId, 'forceRefresh:', forceRefresh);
        await this._checkLocalDB();
        if (!forceRefresh) {
            console.log('📦 db.getRecipeById: Buscando en localDB.recipes_full...');
            let recipe = await window.localDB.get('recipes_full', recipeId);
            
            // Fallback: Si no está en full, buscar en index (metadatos básicos)
            if (!recipe) {
                console.log('📦 db.getRecipeById: No encontrado en full, buscando en index...');
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
            console.log(`📡 [DB] Fetching full recipe directly via Supabase Client: ${recipeId}`);
            
            const { data: recipe, error } = await window.supabaseClient
                .from('recipes')
                .select(`
                    *,
                    ingredients:ingredients(*),
                    steps:preparation_steps(*)
                `)
                .eq('id', recipeId)
                .order('order_index', { foreignTable: 'ingredients', ascending: true })
                .order('step_number', { foreignTable: 'preparation_steps', ascending: true })
                .single();
                
            clearTimeout(timeoutId);

            if (error) {
                if (error.code === 'PGRST116') throw new Error('Recipe not found');
                throw error;
            }

            const localMeta = await window.localDB.get('recipes_index', recipeId);
            if (localMeta) {
                if (localMeta.sharingContext) recipe.sharingContext = localMeta.sharingContext;
                if (localMeta.senderName) recipe.senderName = localMeta.senderName;
            }
            
            await window.localDB.put('recipes_full', recipe);
            
            const indexData = {
                id: recipe.id, name_es: recipe.name_es, name_en: recipe.name_en,
                image_url: recipe.image_url, updated_at: recipe.updated_at,
                is_favorite: recipe.is_favorite,
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
                    updated_at: recipe.updated_at, is_favorite: recipe.is_favorite
                });
                return { success: true, recipe };
            } catch (err) { return { success: false, error: err.message }; }
        } else {
            const tempId = 'temp_' + crypto.randomUUID();
            const tempRecipe = { ...payload, id: tempId, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            await window.localDB.put('recipes_full', tempRecipe);
            await window.localDB.put('recipes_index', {
                id: tempId, name_es: tempRecipe.name_es, name_en: tempRecipe.name_en, image_url: tempRecipe.image_url,
                updated_at: tempRecipe.updated_at, is_favorite: tempRecipe.is_favorite
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

            // 2. Verificar si el nombre ya existe en la colección del usuario 
            // v250: Pasamos sourceRecipeId para evitar que la receta compartida se bloquee a sí misma
            const recipeName = (window.i18n && window.i18n.getLang() === 'en') ? (recipe.name_en || recipe.name_es) : recipe.name_es;
            const exists = await this.recipeNameExists(recipeName, { 
                includeShared: false,
                excludeId: sourceRecipeId 
            });
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
                    updated_at: newRecipeData.updated_at,
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
        return { success: true, categories: [] };
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
