// js/db.js
// Funciones de base de datos con soporte offline TOTAL (IndexedDB + SyncQueue)

class DatabaseManager {
    constructor() {
        this._isOnline = navigator.onLine;
        window.addEventListener('online', () => this._isOnline = true);
        window.addEventListener('offline', () => this._isOnline = false);
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
            if (recipes.length === 0) {
                const legacy = await window.localDB.getAll('recipes');
                if (legacy.length > 0) recipes = legacy;
            }
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
                // Notificar al dashboard que el índice se ha actualizado
                window.dispatchEvent(new CustomEvent('recipes-index-updated', { detail: result.recipes }));
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
                // If checking shared recipes, we need the user to retrieve their received sharing table mapping
                // Otherwise we filter by our own user
                url.searchParams.set('user_id', userId);
            }
            if (filters.search) {
                url.searchParams.set('search', filters.search);
            }
            if (filters.categoryId) {
                url.searchParams.set('category_id', filters.categoryId);
            }
            if (filters.favorite) {
                url.searchParams.set('favorite', 'true');
            }
            if (filters.shared) {
                url.searchParams.set('shared', 'true');
            }
            if (filters.orderBy) {
                url.searchParams.set('sort_by', filters.orderBy);
            }
            if (filters.ascending !== undefined) {
                url.searchParams.set('sort_order', filters.ascending.toString());
            }

            // Preparar cabeceras con Auth
            const headers = { 'Content-Type': 'application/json' };
            const { data: sessionData } = await window.supabaseClient.auth.getSession();
            if (sessionData?.session?.access_token) {
                headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
            }

            // Fetch a la Edge API
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch recipes from API');
            }

            // Mapeo lógico para cuando cargamos compartidas
            let recipes = [];
            if (result.isSharedFormat) {
                const shared = result.data;
                // Fetch sender names separatelly (can't easily do it in API right now due to complex mappings relying safely in client context)
                const senderIds = [...new Set(shared.map(s => s.owner_user_id).filter(Boolean))];
                let senderMap = {};
                if (senderIds.length > 0) {
                    const { data: senders } = await window.supabaseClient
                        .from('users')
                        .select('id, first_name, last_name')
                        .in('id', senderIds);
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
                await window.localDB.putAll('recipes', recipes);
            } else {
                recipes = result.data;

                // Extraer a quién hemos compartido nuestras recetas para renderizarlas
                // Esto podemos dejarlo directo al cliente ya que es info que no se cachea en la API pública de Edge para todos
                const { data: sentShared } = await window.supabaseClient
                    .from('shared_recipes')
                    .select('recipe_id, recipient_user_id')
                    .eq('owner_user_id', userId);

                let recipientMap = {};
                if (sentShared && sentShared.length > 0) {
                    const recipientIds = [...new Set(sentShared.map(s => s.recipient_user_id).filter(Boolean))];
                    if (recipientIds.length > 0) {
                        const { data: recipientUsers } = await window.supabaseClient
                            .from('users')
                            .select('id, first_name, last_name')
                            .in('id', recipientIds);
                        if (recipientUsers) {
                            recipientUsers.forEach(u => {
                                recipientMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Chef';
                            });
                        }
                    }
                }

                recipes = recipes.map(recipe => {
                    const recipients = sentShared
                        ? sentShared
                            .filter(s => s.recipe_id === recipe.id)
                            .map(s => `Chef ${recipientMap[s.recipient_user_id] || ''}`.trim())
                            .filter(Boolean)
                        : [];

                    return {
                        ...recipe,
                        sharingContext: recipients.length > 0 ? 'sent' : null,
                        sharedWith: recipients.join(', ')
                    };
                });
            }

            console.log(`📦 Recipes loaded from API (Index Mode)`);

            // Reemplazar la colección local propia en recipes_index
            if (!filters.search && !filters.categoryId && !filters.favorite && !filters.shared && !result.isSharedFormat) {
                const allLocalIndex = await window.localDB.getAll('recipes_index');
                const received = allLocalIndex.filter(r => r.sharingContext === 'received');

                await window.localDB.clear('recipes_index');
                if (received.length > 0) await window.localDB.putAll('recipes_index', received);
                await window.localDB.putAll('recipes_index', recipes);
            } else {
                // Si es una búsqueda o filtro, simplemente mezclamos o guardamos estos específicos
                await window.localDB.putAll('recipes_index', recipes);
            }

            return { success: true, recipes, fromCache: false };

        } catch (error) {
            console.error('❌ Edge API Error _fetchRecipesFromServer:', error);
            // Fallback
            const localRecipes = await window.localDB?.getAll('recipes') || [];
            return { success: true, recipes: localRecipes, fromCache: true };
        }
    }

    async getRecipeById(recipeId) {
        await this._checkLocalDB();

        // 1. RETORNO INMEDIATO DESDE CACHÉ ( recipes_full )
        const cached = await window.localDB.get('recipes_full', recipeId);

        // Si tenemos caché, la devolvemos de inmediato pero disparamos revalidación
        if (cached) {
            console.log(`⚡ Receta ${recipeId} desde caché (recipes_full)`);
            if (this._isOnline) {
                this._revalidateRecipeInBackground(recipeId, cached.updated_at);
            }
            return { success: true, recipe: cached, fromCache: true };
        }

        // 2. Si NO hay caché, esperar a la red
        if (!this._isOnline) {
            return { success: false, error: "Sin conexión y no hay copia local" };
        }

        return this._fetchFullRecipeFromServer(recipeId);
    }

    async _revalidateRecipeInBackground(recipeId, lastUpdated) {
        try {
            const result = await this._fetchFullRecipeFromServer(recipeId);
            if (result.success) {
                const newRecipe = result.data;
                // Si la fecha de actualización es diferente, notificar cambios silenciosos
                if (newRecipe.updated_at !== lastUpdated) {
                    console.log('🔄 Receta actualizada en segundo plano');
                    window.dispatchEvent(new CustomEvent('recipe-detail-updated', { detail: newRecipe }));
                }
            }
        } catch (e) { /* silent */ }
    }

    async _fetchFullRecipeFromServer(recipeId) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            const { data: sessionData } = await window.supabaseClient.auth.getSession();
            if (sessionData?.session?.access_token) {
                headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
            }

            const response = await fetch(`/api/recipe/${recipeId}`, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error);

            let recipe = result.data;

            // Conservar metadatos locales si existen
            const localMeta = await window.localDB.get('recipes_index', recipeId);
            if (localMeta) {
                if (localMeta.sharingContext) recipe.sharingContext = localMeta.sharingContext;
                if (localMeta.senderName) recipe.senderName = localMeta.senderName;
            }

            // Guardar en ambos almacenes
            await window.localDB.put('recipes_full', recipe);

            // Actualizar también el índice si es necesario (mantener sincronía)
            const indexData = {
                id: recipe.id,
                name_es: recipe.name_es,
                name_en: recipe.name_en,
                image_url: recipe.image_url,
                updated_at: recipe.updated_at,
                category_id: recipe.category_id,
                is_favorite: recipe.is_favorite,
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

                // Guardar en FULL y en INDEX
                await window.localDB.put('recipes_full', recipe);
                await window.localDB.put('recipes_index', {
                    id: recipe.id,
                    name_es: recipe.name_es,
                    name_en: recipe.name_en,
                    image_url: recipe.image_url,
                    updated_at: recipe.updated_at,
                    category_id: recipe.category_id,
                    is_favorite: recipe.is_favorite
                });
                return { success: true, recipe };
            } catch (err) {
                return { success: false, error: err.message };
            }
        } else {
            const tempId = 'temp_' + crypto.randomUUID();
            const tempRecipe = { ...payload, id: tempId, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

            await window.localDB.put('recipes_full', tempRecipe);
            await window.localDB.put('recipes_index', {
                id: tempId,
                name_es: tempRecipe.name_es,
                name_en: tempRecipe.name_en,
                image_url: tempRecipe.image_url,
                updated_at: tempRecipe.updated_at,
                category_id: tempRecipe.category_id,
                is_favorite: tempRecipe.is_favorite
            });
            await window.localDB.enqueueSync('insert', 'recipes', tempRecipe, null);

            if (window.utils) window.utils.showToast("Receta guardada localmente (Modo sin conexión)");
            return { success: true, recipe: tempRecipe, offline: true };
        }
    }

    async updateRecipe(recipeId, updates) {
        await this._checkLocalDB();

        // Actualizar local de inmediato (FULL e INDEX)
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

                // Sincronizar con verdad del servidor
                await window.localDB.put('recipes_full', recipe);
                await window.localDB.put('recipes_index', {
                    id: recipe.id,
                    name_es: recipe.name_es,
                    name_en: recipe.name_en,
                    image_url: recipe.image_url,
                    updated_at: recipe.updated_at,
                    category_id: recipe.category_id,
                    is_favorite: recipe.is_favorite
                });
                return { success: true, recipe };
            } catch (err) {
                return { success: false, error: err.message };
            }
        } else {
            await window.localDB.enqueueSync('update', 'recipes', { id: recipeId, ...updates }, recipeId);
            return { success: true, offline: true };
        }
    }

    async deleteRecipe(recipeId) {
        await this._checkLocalDB();

        // Borrado local (INDEX y FULL)
        await window.localDB.delete('recipes_index', recipeId);
        await window.localDB.delete('recipes_full', recipeId);

        if (this._isOnline) {
            try {
                const userId = window.authManager.currentUser?.id;
                await window.supabaseClient.from('shared_recipes').delete().eq('recipe_id', recipeId).eq('recipient_user_id', userId);
                const { error } = await window.supabaseClient.from('recipes').update({ is_active: false }).eq('id', recipeId).eq('user_id', userId);
                if (error) throw error;
                return { success: true };
            } catch (err) {
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

        // Actualizar localmente INDEX y FULL
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

    // --- Bulk insertions ---
    async addIngredients(recipeId, ingredients) {
        await this._checkLocalDB();
        const items = ingredients.map(ing => ({
            recipe_id: recipeId,
            name_es: ing.name_es,
            unit_es: ing.unit_es || ing.unit || null,
            quantity: ing.quantity || null
        }));

        if (this._isOnline) {
            try {
                const { error } = await window.supabaseClient.from('ingredients').insert(items);
                if (error) throw error;
                return { success: true };
            } catch (e) { return { success: false, error: e.message }; }
        } else {
            for (let item of items) {
                await window.localDB.enqueueSync('insert', 'ingredients', item, recipeId);
            }
            return { success: true, offline: true };
        }
    }

    async addSteps(recipeId, steps) {
        await this._checkLocalDB();
        const items = steps.map((step, idx) => ({
            recipe_id: recipeId,
            instruction_es: step.instruction_es,
            step_number: step.step_order || step.step_number || (idx + 1)
        }));

        if (this._isOnline) {
            try {
                const { error } = await window.supabaseClient.from('preparation_steps').insert(items);
                if (error) throw error;
                return { success: true };
            } catch (e) { return { success: false, error: e.message }; }
        } else {
            for (let item of items) {
                await window.localDB.enqueueSync('insert', 'preparation_steps', item, recipeId);
            }
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
            if (error) throw error;
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
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



    // ============================================
    // CATEGORIES
    // ============================================
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

    // ============================================
    // SHARED RECIPES
    // ============================================
    async duplicateRecipe(recipeId, targetUserId) {
        if (!this._isOnline) return { success: false, error: 'Debes tener conexión para duplicar una receta compartida.' };
        try {
            const { success, recipe, error: fetchError } = await this.getRecipeById(recipeId);
            if (!success) throw new Error(fetchError);

            // 1. Insertar la receta principal
            const { data: newRecipeData, error: recipeError } = await window.supabaseClient.from('recipes')
                .insert([{
                    user_id: targetUserId,
                    name_es: recipe.name_es,
                    name_en: recipe.name_en || null,
                    description_es: recipe.description_es,
                    description_en: recipe.description_en,
                    category_id: recipe.category_id,
                    is_active: true,
                    is_favorite: false
                }])
                .select().single();

            if (recipeError) throw recipeError;
            const newRecipeId = newRecipeData.id;

            // 2. Insertar ingredientes
            if (recipe.ingredients && recipe.ingredients.length > 0) {
                const ingredientsToInsert = recipe.ingredients.map(i => ({
                    recipe_id: newRecipeId,
                    name_es: i.name_es,
                    name_en: i.name_en,
                    quantity: i.quantity,
                    unit_es: i.unit_es,
                    unit_en: i.unit_en,
                    raw_text: i.raw_text
                }));
                await window.supabaseClient.from('ingredients').insert(ingredientsToInsert);
            }

            // 3. Insertar pasos
            const steps = recipe.preparation_steps || recipe.steps;
            if (steps && steps.length > 0) {
                const stepsToInsert = steps.map(s => ({
                    recipe_id: newRecipeId,
                    instruction_es: s.instruction_es,
                    instruction_en: s.instruction_en || null,
                    step_number: s.step_number
                }));
                await window.supabaseClient.from('preparation_steps').insert(stepsToInsert);
            }



            // 5. Mantenemos el enlace de compartición intacto a petición del usuario
            // (Se elimina si queremos que pase de compartida a propia exclusivamente)
            // await this.deleteSharedRecipe(window.authManager.currentUser.id, recipeId);

            // 6. Actualizar LocalDB con la receta completa para renderizado inmediato en "Mis Recetas"
            await this._checkLocalDB();

            // Opcional: Podríamos no borrarla del caché local como compartida, pero para evitar duplicados visuales en "Todas",
            // mantenemos ambas en caché (la compartida y la nueva propia)

            const completelyDuplicatedRecipe = {
                ...newRecipeData,
                sharingContext: null,
                category: recipe.category,
                ingredients: recipe.ingredients,
                steps: recipe.steps
            };

            await window.localDB.put('recipes_full', completelyDuplicatedRecipe);
            await window.localDB.put('recipes_index', {
                id: newRecipeData.id,
                name_es: newRecipeData.name_es,
                name_en: newRecipeData.name_en,
                image_url: newRecipeData.image_url,
                updated_at: newRecipeData.updated_at,
                category_id: newRecipeData.category_id,
                is_favorite: newRecipeData.is_favorite,
                sharingContext: null
            });

            return { success: true, newRecipeId: newRecipeId };
        } catch (error) {
            console.error('Error duplicando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteSharedRecipe(userId, recipeId) {
        if (!this._isOnline) return { success: false, error: 'Sin red para borrar enlace' };
        try {
            const { error } = await window.supabaseClient.from('shared_recipes').delete().eq('recipient_user_id', userId).eq('recipe_id', recipeId);
            if (error) throw error;
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }
}

// Inicializar y exportar instancia global
window.db = new DatabaseManager();
