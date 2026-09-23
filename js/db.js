// js/db.js
// Funciones de base de datos con soporte offline TOTAL (IndexedDB + SyncQueue)

class DatabaseManager {
    constructor() {
        this._isOnline = navigator.onLine;
        window.addEventListener('online', () => this._isOnline = true);
        window.addEventListener('offline', () => this._isOnline = false);
        // Registro de IDs borrados recientemente (tombstone) - evita que el background refresh los resucite
        this._deletedIds = new Set();
        console.log('📦 DatabaseManager: Inicializando (v629)');
        this._forcedCleanup();
    }

    async _forcedCleanup() {
        const FIX_KEY = 'recipe_pantry_fix_628_cleanup';
        if (localStorage.getItem(FIX_KEY) !== 'done') {
            console.warn('🧹 [DB] Forced Cleanup (v628): Unblocking valid folders, refreshing index and purging ghost folders.');
            try {
                await this._checkLocalDB();
                if (window.localDB) {
                    await window.localDB.clear('recipes_index');
                    await window.localDB.clear('recipes_full');
                    await window.localDB.clear('recipes');
                }
                const uid = window.authManager?.currentUser?.id || 'guest';
                // 1. Limpiar ghost folders en localStorage (prueba 2)
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('rp_folders_') && !key.startsWith('rp_folders_deleted_')) {
                        try {
                            let folders = JSON.parse(localStorage.getItem(key) || '[]');
                            if (Array.isArray(folders)) {
                                folders = folders.filter(f => f && f.trim().toLowerCase() !== 'prueba 2');
                                localStorage.setItem(key, JSON.stringify(folders));
                            }
                        } catch (e) {}
                    }
                }
                // 2. Limpiar blacklist en rp_folders_deleted_ para que no bloquee carpetas reales
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('rp_folders_deleted_')) {
                        try {
                            let deleted = JSON.parse(localStorage.getItem(key) || '[]');
                            if (Array.isArray(deleted)) {
                                // Solo mantener 'prueba 2'
                                deleted = deleted.filter(f => (f || '').trim().toLowerCase() === 'prueba 2');
                                localStorage.setItem(key, JSON.stringify(deleted));
                            }
                        } catch (e) {}
                    }
                }
                this._markFolderDeleted(uid, 'prueba 2');
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
            // v623: Reparar índice corrupto que perdió pantry_es/pantry_en al refrescar
            // el detalle de una receta (db.js _fetchFullRecipeFromServer). Se rellena
            // desde recipes_full, que sí conserva la carpeta, sin borrar datos.
            const missingFolder = recipes.filter(r => !r.pantry_es);
            if (missingFolder.length > 0) {
                const allFull = await window.localDB.getAll('recipes_full') || [];
                const fullMap = new Map(allFull.map(f => [f.id, f]));
                let repaired = 0;
                for (const item of missingFolder) {
                    const full = fullMap.get(item.id);
                    if (full && full.pantry_es) {
                        item.pantry_es = full.pantry_es;
                        if (full.pantry_en) item.pantry_en = full.pantry_en;
                        await window.localDB.put('recipes_index', item);
                        repaired++;
                    }
                }
                if (repaired > 0) console.log(`🔧 recipes_index reparado: ${repaired} recetas con carpeta restaurada`);
            }

            // v623: Normalizar carpetas huérfanas. Si una receta apunta a una carpeta
            // que ya no está en el registro (la eliminaste), se devuelve a la raíz
            // aunque la caché o Supabase quedaran con datos viejos. No afecta a
            // recetas recibidas/compartidas (no se deben reubicar).
            await this._normalizeOrphanFolders(recipes);
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

    // Limpia local (caché) y servidor ÚNICAMENTE para recetas que apuntan a nombres reservados
    // de raíz ("Mis Recetas"/"My Recipes") o a carpetas explícitamente eliminadas por el usuario.
    // NUNCA borra carpetas válidas existentes en recetas solo porque la caché local se haya reseteado.
    async _normalizeOrphanFolders(recipes) {
        if (!Array.isArray(recipes) || recipes.length === 0) return;
        const user = window.authManager?.currentUser;
        const uid = (user && user.id) || 'guest';
        const deletedSet = (typeof this._getDeletedFolderSet === 'function')
            ? this._getDeletedFolderSet(uid)
            : new Set();

        for (const r of recipes) {
            const f = (r.pantry_es || '').trim();
            if (!f || r.sharingContext === 'received') continue;

            const isReserved = this._isRootFolderName(f);
            const isExplicitlyDeleted = deletedSet.has(f.toLowerCase());

            if (isReserved || isExplicitlyDeleted) {
                try {
                    r.pantry_es = '';
                    r.pantry_en = '';
                    if (window.localDB) {
                        await window.localDB.put('recipes_index', r);
                    }
                    if (this._isOnline && window.supabaseClient) {
                        await window.supabaseClient.from('recipes')
                            .update({ pantry_es: '', pantry_en: '' })
                            .eq('id', r.id);
                    }
                    console.log(`🧹 Carpeta eliminada/reservada '${f}' → receta '${r.name_es || r.name_en || r.id}' movida a la raíz`);
                } catch (e) { console.warn('⚠️ No se pudo limpiar carpeta huérfana', r.id, e); }
            }
        }
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
                    pantry_es: r.pantry_es || null,
                    pantry_en: r.pantry_en || null,
                    tags: r.tags || [],
                    sharingContext: r.sharingContext || null,
                    user_id: r.user_id || null // v249: critical for duplicate check
                }));
                await window.localDB.putAll('recipes_index', indexItems);
            } else {
                let query = window.supabaseClient
                    .from('recipes')
                    .select(`id, name_es, name_en, updated_at, is_favorite, pantry_es, pantry_en, tags`)
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
            await this._normalizeOrphanFolders(safeRecipes);
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
            if (excludeId && r.id && String(r.id).toLowerCase() === String(excludeId).toLowerCase()) return false;
            
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
                let query = window.supabaseClient
                    .from('recipes')
                    .select('id, name_es')
                    .eq('user_id', userId)
                    .or(`name_es.ilike."${name}",name_en.ilike."${name}"`);

                if (excludeId) {
                    query = query.neq('id', excludeId);
                }

                const { data: mine, error: errorMine } = await query.limit(1);

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
        const isOnline = this._isOnline || (typeof navigator !== 'undefined' && navigator.onLine);

        if (!forceRefresh) {
            console.log('📦 db.getRecipeById: Buscando en localDB.recipes_full...');
            let recipe = await window.localDB.get('recipes_full', recipeId);
            
            // Validar si la receta en caché está completa (no es parcial y tiene ingredientes o pasos)
            if (recipe && !recipe.isPartial && Array.isArray(recipe.ingredients) && (recipe.ingredients.length > 0 || (Array.isArray(recipe.steps) && recipe.steps.length > 0))) {
                console.log(`ℹ️ Cargando receta completa ${recipeId} (Caché local)`);
                if (isOnline) this._revalidateRecipeInBackground(recipeId, recipe.updated_at);
                return { success: true, recipe: recipe, fromCache: true };
            }
        } else {
            console.log(`🚀 Forzando carga de red para receta ${recipeId}...`);
        }

        // Si estamos online, SIEMPRE consultar al servidor de forma transparente e inmediata
        if (isOnline) {
            console.log(`📡 Consultando receta completa ${recipeId} desde Supabase...`);
            const serverResult = await this._fetchFullRecipeFromServer(recipeId, forceRefresh);
            if (serverResult.success) {
                return serverResult;
            }
            console.warn(`⚠️ Error de red para receta ${recipeId}, usando fallback local:`, serverResult.error);
        }

        // Fallback para cuando estemos 100% offline o falle el servidor
        const cachedFull = await window.localDB.get('recipes_full', recipeId);
        if (cachedFull) {
            return { success: true, recipe: cachedFull, fromCache: true };
        }

        const indexRecipe = await window.localDB.get('recipes_index', recipeId);
        if (indexRecipe) {
            console.warn(`⚠️ Receta ${recipeId} sin conexión previa: usando metadatos básicos del índice.`);
            return { success: true, recipe: { ...indexRecipe, isPartial: true, ingredients: [], steps: [] }, fromCache: true };
        }

        return { success: false, error: isOnline ? "Error al cargar la receta" : "Sin conexión y no hay copia local" };
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

            recipe.ingredients = recipe.ingredients || [];
            recipe.steps = recipe.steps || recipe.preparation_steps || [];

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
                pantry_es: recipe.pantry_es || null,
                pantry_en: recipe.pantry_en || null,
                tags: recipe.tags || [],
                sharingContext: recipe.sharingContext || null,
                user_id: recipe.user_id || null
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
                    updated_at: recipe.updated_at, is_favorite: recipe.is_favorite, pantry_es: recipe.pantry_es || null,
                    pantry_en: recipe.pantry_en || null, tags: recipe.tags || []
                });
                return { success: true, recipe };
            } catch (err) { return { success: false, error: err.message }; }
        } else {
            const tempId = 'temp_' + crypto.randomUUID();
            const tempRecipe = { ...payload, id: tempId, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            await window.localDB.put('recipes_full', tempRecipe);
            await window.localDB.put('recipes_index', {
                id: tempId, name_es: tempRecipe.name_es, name_en: tempRecipe.name_en, image_url: tempRecipe.image_url,
                updated_at: tempRecipe.updated_at, is_favorite: tempRecipe.is_favorite, pantry_es: tempRecipe.pantry_es || null,
                pantry_en: tempRecipe.pantry_en || null, tags: tempRecipe.tags || []
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
                if (window.localDB && recipe) {
                    await window.localDB.put('recipes_full', recipe);
                    await window.localDB.put('recipes_index', {
                        id: recipe.id, name_es: recipe.name_es, name_en: recipe.name_en, image_url: recipe.image_url,
                        updated_at: recipe.updated_at, is_favorite: recipe.is_favorite, pantry_es: recipe.pantry_es || null,
                        pantry_en: recipe.pantry_en || null, tags: recipe.tags || []
                    });
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

    /**
     * Gestión de Carpetas Privadas del Usuario
     */
    _isRootFolderName(name) {
        if (!name || typeof name !== 'string') return true;
        return !name.trim();
    }

    // ¿Es un nombre de carpeta válido como objetivo hoy? (no raíz reservada y no
    // marcada como eliminada en local). Use este para filtrar nombres que vienen
    // de la caché/currentRecipes, que pueden estar desactualizados.
    isFolderNameAvailable(name) {
        if (!name || typeof name !== 'string') return false;
        const t = name.trim();
        if (!t || this._isRootFolderName(t)) return false;
        const uid = (window.authManager && window.authManager.currentUser && window.authManager.currentUser.id) || 'guest';
        return !this._getDeletedFolderSet(uid).has(t.toLowerCase());
    }

    // Registro local de carpetas ELIMINADAS (persistente por dispositivo). Sirve
    // para que una carpeta borrada no reaparezca aunque settings.folders (Supabase)
    // o la caché queden con valores viejos (p.ej. rename/delete offline).
    _getDeletedFolderSet(uid) {
        const set = new Set();
        try {
            const arr = JSON.parse(localStorage.getItem(`rp_folders_deleted_${uid}`) || '[]');
            if (Array.isArray(arr)) arr.forEach(n => { if (n && (n + '').trim()) set.add((n + '').trim().toLowerCase()); });
        } catch (e) {}
        return set;
    }
    _markFolderDeleted(uid, name) {
        const clean = (name || '').trim();
        if (!clean) return;
        try {
            const set = this._getDeletedFolderSet(uid);
            set.add(clean.toLowerCase());
            localStorage.setItem(`rp_folders_deleted_${uid}`, JSON.stringify(Array.from(set)));
        } catch (e) {}
    }
    _unmarkFolderDeleted(uid, name) {
        const clean = (name || '').trim();
        if (!clean) return;
        try {
            const set = this._getDeletedFolderSet(uid);
            set.delete(clean.toLowerCase());
            localStorage.setItem(`rp_folders_deleted_${uid}`, JSON.stringify(Array.from(set)));
        } catch (e) {}
    }

    _pruneDeletedFolders(uid, folderNames) {
        const deleted = this._getDeletedFolderSet(uid);
        if (deleted.size === 0) return folderNames;
        return folderNames.filter(f => !deleted.has(f.toLowerCase()));
    }

    getMyFoldersSync() {
        const folders = new Set();
        const userId = window.authManager?.currentUser?.id || 'guest';
        try {
            const localSaved = JSON.parse(localStorage.getItem(`rp_folders_${userId}`) || '[]');
            if (Array.isArray(localSaved)) {
                localSaved.forEach(f => {
                    if (f && typeof f === 'string' && !this._isRootFolderName(f) && f.trim().toLowerCase() !== 'prueba 2') {
                        folders.add(f.trim());
                    }
                });
            }
        } catch (e) {}

        const user = window.authManager?.currentUser;
        if (user && user.settings && Array.isArray(user.settings.folders)) {
            user.settings.folders.forEach(f => {
                if (f && typeof f === 'string' && !this._isRootFolderName(f) && f.trim().toLowerCase() !== 'prueba 2') {
                    folders.add(f.trim());
                }
            });
        }

        return this._pruneDeletedFolders(userId, Array.from(folders)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    async getMyFolders() {
        const folders = new Set();
        const userId = window.authManager?.currentUser?.id || 'guest';

        // 1. Desde localStorage del usuario (registro de carpetas)
        try {
            const localSaved = JSON.parse(localStorage.getItem(`rp_folders_${userId}`) || '[]');
            if (Array.isArray(localSaved)) {
                localSaved.forEach(f => {
                    if (f && typeof f === 'string' && !this._isRootFolderName(f) && f.trim().toLowerCase() !== 'prueba 2') {
                        folders.add(f.trim());
                    }
                });
            }
        } catch (e) {}

        // 2. Desde user profile settings si estamos autenticados (registro de carpetas)
        const user = window.authManager?.currentUser;
        if (user && user.settings && Array.isArray(user.settings.folders)) {
            user.settings.folders.forEach(f => {
                if (f && typeof f === 'string' && !this._isRootFolderName(f) && f.trim().toLowerCase() !== 'prueba 2') {
                    folders.add(f.trim());
                }
            });
        }

        // 3. Carpetas derivadas de la caché (recipes_index o recipes_full)
        if (window.localDB) {
            try {
                const index = await window.localDB.getAll('recipes_index') || [];
                index.forEach(r => {
                    if (r.pantry_es && typeof r.pantry_es === 'string' && !this._isRootFolderName(r.pantry_es)) {
                        folders.add(r.pantry_es.trim());
                    }
                });
            } catch (e) {}
        }

        return this._pruneDeletedFolders(userId, Array.from(folders)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    async createFolder(folderName) {
        if (!folderName || typeof folderName !== 'string' || !folderName.trim()) return null;
        const clean = folderName.trim();
        if (this._isRootFolderName(clean)) return null; // "Mis Recetas" es la raíz, no una subcarpeta

        const userId = window.authManager?.currentUser?.id || 'guest';
        this._unmarkFolderDeleted(userId, clean); // recrear una carpeta la "resucita"

        // 1. Guardar en localStorage
        const localKey = `rp_folders_${userId}`;
        try {
            let localSaved = JSON.parse(localStorage.getItem(localKey) || '[]');
            localSaved = localSaved.filter(f => !this._isRootFolderName(f));
            if (!localSaved.some(f => f.toLowerCase() === clean.toLowerCase())) {
                localSaved.push(clean);
                localStorage.setItem(localKey, JSON.stringify(localSaved));
            }
        } catch (e) {}

        // 2. Sincronizar en settings de usuario si está online
        const user = window.authManager?.currentUser;
        if (user && this._isOnline && window.supabaseClient) {
            try {
                const currentSettings = user.settings || {};
                let currentFolders = Array.isArray(currentSettings.folders) ? currentSettings.folders : [];
                currentFolders = currentFolders.filter(f => !this._isRootFolderName(f));
                if (!currentFolders.some(f => f.toLowerCase() === clean.toLowerCase())) {
                    currentFolders.push(clean);
                    currentSettings.folders = currentFolders;
                    user.settings = currentSettings;
                    await window.supabaseClient.from('users').update({ settings: currentSettings }).eq('id', user.id);
                }
            } catch (e) {
                console.warn('⚠️ Error guardando carpeta en Supabase users.settings:', e);
            }
        }

        window.dispatchEvent(new CustomEvent('folders-updated', { detail: clean }));
        return clean;
    }

    async renameFolder(oldName, newName) {
        if (!oldName || !newName) return;
        const cleanOld = oldName.trim();
        const cleanNew = newName.trim();
        const userId = window.authManager?.currentUser?.id || 'guest';
        this._markFolderDeleted(userId, cleanOld);
        this._unmarkFolderDeleted(userId, cleanNew);

        // Si el destino es "Mis Recetas" (la raíz), devolver las recetas a la raíz y borrar la carpeta
        if (this._isRootFolderName(cleanNew)) {
            await this.deleteFolder(cleanOld);
            return;
        }

        // 1. Actualizar localStorage (insensible a mayúsculas y espacios)
        const localKey = `rp_folders_${userId}`;
        try {
            let localSaved = JSON.parse(localStorage.getItem(localKey) || '[]');
            localSaved = localSaved.filter(f => f && !this._isRootFolderName(f) && f.trim().toLowerCase() !== cleanOld.toLowerCase());
            if (!localSaved.some(f => f.toLowerCase() === cleanNew.toLowerCase())) {
                localSaved.push(cleanNew);
            }
            localStorage.setItem(localKey, JSON.stringify(localSaved));
        } catch (e) {}

        // 2. Actualizar user settings
        const user = window.authManager?.currentUser;
        if (user && this._isOnline && window.supabaseClient) {
            try {
                const currentSettings = user.settings || {};
                let currentFolders = Array.isArray(currentSettings.folders) ? currentSettings.folders : [];
                currentFolders = currentFolders.filter(f => f && !this._isRootFolderName(f) && f.trim().toLowerCase() !== cleanOld.toLowerCase());
                if (!currentFolders.some(f => f.toLowerCase() === cleanNew.toLowerCase())) {
                    currentFolders.push(cleanNew);
                }
                currentSettings.folders = currentFolders;
                user.settings = currentSettings;
                await window.supabaseClient.from('users').update({ settings: currentSettings }).eq('id', user.id);
            } catch (e) {}
        }

        // 3. Actualizar recetas que tengan este nombre de carpeta en Supabase
        if (this._isOnline && window.supabaseClient && user && user.id) {
            try {
                await window.supabaseClient.from('recipes')
                    .update({ pantry_es: cleanNew, pantry_en: cleanNew })
                    .eq('user_id', user.id)
                    .ilike('pantry_es', cleanOld);
            } catch (e) {
                console.warn('[db.renameFolder] Supabase recipes update error:', e);
            }
        }

        // 4. Actualizar recetas en localDB
        if (window.localDB) {
            try {
                const allRecipes = await window.localDB.getAll('recipes_index') || [];
                const toUpdate = allRecipes.filter(r => (r.pantry_es || '').trim().toLowerCase() === cleanOld.toLowerCase());
                for (const r of toUpdate) {
                    await this.updateRecipe(r.id, { pantry_es: cleanNew, pantry_en: cleanNew });
                }
            } catch (e) {}
        }

        window.dispatchEvent(new CustomEvent('folders-updated'));
        window.dispatchEvent(new CustomEvent('recipes-index-updated'));
    }

    async deleteFolder(folderName) {
        if (!folderName) return;
        const clean = folderName.trim();
        const userId = window.authManager?.currentUser?.id || 'guest';
        this._markFolderDeleted(userId, clean);

        // 1. Actualizar localStorage (insensible a mayúsculas/espacios)
        const localKey = `rp_folders_${userId}`;
        try {
            let localSaved = JSON.parse(localStorage.getItem(localKey) || '[]');
            localSaved = localSaved.filter(f => (f || '').trim().toLowerCase() !== clean.toLowerCase());
            localStorage.setItem(localKey, JSON.stringify(localSaved));
        } catch (e) {}

        // 2. Actualizar user settings
        const user = window.authManager?.currentUser;
        if (user && this._isOnline && window.supabaseClient) {
            try {
                const currentSettings = user.settings || {};
                let currentFolders = Array.isArray(currentSettings.folders) ? currentSettings.folders : [];
                currentFolders = currentFolders.filter(f => (f || '').trim().toLowerCase() !== clean.toLowerCase());
                currentSettings.folders = currentFolders;
                user.settings = currentSettings;
                await window.supabaseClient.from('users').update({ settings: currentSettings }).eq('id', user.id);
            } catch (e) {}
        }

        // 3. Devolver todas las recetas de esa carpeta a la raíz (pantry_es: '') en Supabase
        if (this._isOnline && window.supabaseClient && user && user.id) {
            try {
                await window.supabaseClient.from('recipes')
                    .update({ pantry_es: '', pantry_en: '' })
                    .eq('user_id', user.id)
                    .ilike('pantry_es', clean);
            } catch (e) {
                console.warn('[db.deleteFolder] Supabase recipes reset error:', e);
            }
        }

        // 4. Devolver todas las recetas en localDB
        if (window.localDB) {
            try {
                const allRecipes = await window.localDB.getAll('recipes_index') || [];
                const toUpdate = allRecipes.filter(r => (r.pantry_es || '').trim().toLowerCase() === clean.toLowerCase());
                for (const r of toUpdate) {
                    await this.updateRecipe(r.id, { pantry_es: '', pantry_en: '' });
                }
            } catch (e) {}
        }

        window.dispatchEvent(new CustomEvent('folders-updated'));
        window.dispatchEvent(new CustomEvent('recipes-index-updated'));
    }

    async moveRecipeToFolder(recipeId, folderName) {
        const raw = (folderName && typeof folderName === 'string') ? folderName.trim() : '';
        // "Mis Recetas"/"My Recipes" = la raíz (sin carpeta).
        const cleanFolder = this._isRootFolderName(raw) ? '' : raw;
        if (cleanFolder) {
            await this.createFolder(cleanFolder);
        }
        const res = await this.updateRecipe(recipeId, { pantry_es: cleanFolder, pantry_en: cleanFolder });
        if (res && res.error) {
            console.error('⚠️ [moveRecipeToFolder] Error actualizando receta:', res.error);
            throw new Error(res.error);
        }
        window.dispatchEvent(new CustomEvent('recipes-index-updated'));
        return { success: true };
    }

    /**
     * Sube una imagen a Supabase Storage y actualiza el image_url de la receta.
     * Bucket: "recipe-images" — debe existir en Supabase con acceso público.
     * Si no hay conexión o falla el upload, simplemente no se añade imagen (sin romper el guardado).
     */
    async uploadImage(file, recipeId) {
        if (!file || !recipeId) return { success: false, error: 'Faltan parámetros' };
        if (!this._isOnline) {
            console.warn('[db.uploadImage] Sin conexión, imagen no subida');
            return { success: false, error: 'Sin conexión' };
        }
        try {
            const ext = (file.name || 'photo.jpg').split('.').pop().toLowerCase() || 'jpg';
            const filePath = `${recipeId}/cover.${ext}`;
            const bucket = 'recipe-images';

            const { error: uploadError } = await window.supabaseClient.storage
                .from(bucket)
                .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });

            if (uploadError) throw uploadError;

            const { data: urlData } = window.supabaseClient.storage
                .from(bucket)
                .getPublicUrl(filePath);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) throw new Error('No se pudo obtener URL pública');

            // Actualizar la receta con la imagen
            await this.updateRecipe(recipeId, { image_url: publicUrl });
            return { success: true, url: publicUrl };
        } catch (err) {
            console.error('[db.uploadImage] Error:', err.message);
            // No lanzar error: el guardado de la receta ya fue exitoso
            return { success: false, error: err.message };
        }
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
