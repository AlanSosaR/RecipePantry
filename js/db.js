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

        // 1. Mostrar instantáneamente de la copia local IndexedDB
        let recipes = [];
        if (window.localDB) {
            recipes = await window.localDB.getAll('recipes');
        } else {
            console.warn("LocalDB ignore: window.localDB is not defined yet.");
        }
        let fromCache = true;

        // Apply local filters if we have cached data
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
                    (r.description_es && r.description_es.toLowerCase().includes(s))
                );
            }

            // Si después de filtrar tenemos resultados, los mostramos
            if (filteredRecipes.length > 0 || !this._isOnline) {
                // Ordenar locally
                const orderCol = filters.orderBy || 'name_es';
                const asc = filters.ascending !== undefined ? filters.ascending : true;
                filteredRecipes.sort((a, b) => {
                    if (a[orderCol] < b[orderCol]) return asc ? -1 : 1;
                    if (a[orderCol] > b[orderCol]) return asc ? 1 : -1;
                    return 0;
                });

                console.log(`⚡ ${filteredRecipes.length} recetas desde Instancia Local (IndexedDB)`);

                // Si hay red e iniciamos vista general, refresco silencioso
                if (this._isOnline && isUnfiltered) {
                    this._refreshRecipesInBackground(filters);
                }

                return { success: true, recipes: filteredRecipes, fromCache: true };
            }
        }

        // Si no hay local, forzar red
        return this._fetchRecipesFromServer(filters);
    }

    async _refreshRecipesInBackground(filters) {
        if (!this._isOnline) return;
        try {
            const result = await this._fetchRecipesFromServer(filters);
            if (result.success && !result.fromCache && window.dashboard) {
                // Notificará si hubo cambios fuertes, el componente dashboard podrá escuchar
                window.dispatchEvent(new CustomEvent('recipes-updated-background', { detail: result.recipes }));
            }
        } catch (e) { /* silent */ }
    }

    async _fetchRecipesFromServer(filters = {}) {
        if (!this._isOnline) {
            return { success: false, error: 'Estás sin conexión', recipes: [] };
        }

        try {
            let query = window.supabaseClient
                .from('recipes')
                .select(`
                    *,
                    category:categories(id, name_es, name_en, icon, color),
                    images:recipe_images(id, image_url, is_primary)
                `);

            if (filters.shared) {
                const userId = window.authManager.currentUser.id;
                const { data: shared, error: err } = await window.supabaseClient
                    .from('shared_recipes')
                    .select('*, recipe:recipe_id(*, category:categories(*), images:recipe_images(*)), permission, owner_user_id')
                    .eq('recipient_user_id', userId);

                if (err) throw err;

                if (!shared || shared.length === 0) return { success: true, recipes: [], fromCache: false };

                // Fetch sender names separately to avoid ambiguous FK resolution
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

                let recipes = shared.map(s => {
                    const r = s.recipe;
                    if (!r) return null;
                    return {
                        ...r,
                        primaryImage: r.images?.find(img => img.is_primary)?.image_url || null,
                        totalImages: r.images?.length || 0,
                        sharingContext: 'received',
                        sharedPermission: s.permission,
                        senderName: senderMap[s.owner_user_id] || 'Chef'
                    };
                }).filter(Boolean);

                await window.localDB.putAll('recipes', recipes);
                return { success: true, recipes, fromCache: false };
            } else {
                query = query.eq('user_id', window.authManager.currentUser.id);
            }

            query = query.eq('is_active', true);

            if (filters.favorite) query = query.eq('is_favorite', true);
            if (filters.categoryId) query = query.eq('category_id', filters.categoryId);

            const orderBy = filters.orderBy || 'name_es';
            const ascending = filters.ascending !== undefined ? filters.ascending : true;
            query = query.order(orderBy, { ascending });

            if (filters.search) {
                query = query.or(`name_es.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%,description_es.ilike.%${filters.search}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Fetch sharing info for current user's recipes (sent) — split query to avoid FK ambiguity
            const { data: sentShared } = await window.supabaseClient
                .from('shared_recipes')
                .select('recipe_id, recipient_user_id')
                .eq('owner_user_id', window.authManager.currentUser.id);

            // Fetch recipient names
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

            let recipes = data.map(recipe => {
                const recipients = sentShared
                    ? sentShared
                        .filter(s => s.recipe_id === recipe.id)
                        .map(s => `Chef ${recipientMap[s.recipient_user_id] || ''}`.trim())
                        .filter(Boolean)
                    : [];

                return {
                    ...recipe,
                    primaryImage: recipe.images?.find(img => img.is_primary)?.image_url || null,
                    totalImages: recipe.images?.length || 0,
                    sharingContext: recipients.length > 0 ? 'sent' : null,
                    sharedWith: recipients.join(', ')
                };
            });

            // Reemplazar la colección local propia si no hay filtros activos
            if (!filters.search && !filters.categoryId && !filters.favorite && !filters.shared) {
                // Conservar las recibidas (shared) antes de limpiar
                const allLocal = await window.localDB.getAll('recipes');
                const received = allLocal.filter(r => r.sharingContext === 'received');

                await window.localDB.clear('recipes');

                // Reinsertar las nuevas (propias) y las recibidas por separado
                if (received.length > 0) await window.localDB.putAll('recipes', received);
                await window.localDB.putAll('recipes', recipes);
            }

            return { success: true, recipes, fromCache: false };

        } catch (error) {
            console.error('❌ Error _fetchRecipesFromServer:', error);
            return { success: false, error: error.message, recipes: [] };
        }
    }

    async getRecipeById(recipeId) {
        await this._checkLocalDB();

        // Intentar leer de local primero para máxima velocidad offline/online
        const cached = await window.localDB.get('recipes', recipeId);

        if (this._isOnline) {
            try {
                const { data: recipe, error } = await window.supabaseClient
                    .from('recipes')
                    .select(`*, category:categories(*), ingredients(*), steps:preparation_steps(*), images:recipe_images(*)`)
                    .eq('id', recipeId)
                    .single();

                if (error) throw error;

                recipe.primaryImage = recipe.images?.find(img => img.is_primary)?.image_url || null;
                await window.localDB.put('recipes', recipe); // Refresh cache

                window.supabaseClient.from('recipes').update({
                    view_count: (recipe.view_count || 0) + 1,
                    last_viewed_at: new Date().toISOString()
                }).eq('id', recipeId).then(() => { }).catch(() => { });

                return { success: true, recipe };
            } catch (error) {
                if (cached) return { success: true, recipe: cached, fromCache: true };
                return { success: false, error: error.message };
            }
        } else {
            if (cached) return { success: true, recipe: cached, fromCache: true };
            return { success: false, error: "Offline y receta no cacheada" };
        }
    }

    async createRecipe(recipeData) {
        await this._checkLocalDB();
        const payload = Object.assign({ user_id: window.authManager.currentUser.id }, recipeData);

        if (this._isOnline) {
            try {
                const { data: recipe, error } = await window.supabaseClient.from('recipes').insert([payload]).select().single();
                if (error) throw error;
                await window.localDB.put('recipes', recipe);
                return { success: true, recipe };
            } catch (err) {
                return { success: false, error: err.message };
            }
        } else {
            // OFFLINE MODO: Generar ID temporal, guardar en IndexedDB y Queue
            const tempId = 'temp_' + crypto.randomUUID();
            const tempRecipe = { ...payload, id: tempId, is_active: true, created_at: new Date().toISOString() };
            await window.localDB.put('recipes', tempRecipe);
            await window.localDB.enqueueSync('insert', 'recipes', tempRecipe, null);

            if (window.utils) window.utils.showToast("Receta guardada localmente (Modo sin conexión)");
            return { success: true, recipe: tempRecipe, offline: true };
        }
    }

    async updateRecipe(recipeId, updates) {
        await this._checkLocalDB();

        // Aplica el cambio en local de inmediato para el UI
        const cached = await window.localDB.get('recipes', recipeId);
        if (cached) {
            Object.assign(cached, updates);
            await window.localDB.put('recipes', cached);
        }

        if (this._isOnline) {
            try {
                const { data: recipe, error } = await window.supabaseClient.from('recipes').update(updates).eq('id', recipeId).select().single();
                if (error) throw error;
                await window.localDB.put('recipes', recipe); // Update with server truth
                return { success: true, recipe };
            } catch (err) {
                return { success: false, error: err.message };
            }
        } else {
            await window.localDB.enqueueSync('update', 'recipes', { id: recipeId, ...updates }, recipeId);
            return { success: true, recipe: cached, offline: true };
        }
    }

    async deleteRecipe(recipeId) {
        await this._checkLocalDB();

        // Soft delete local
        const cached = await window.localDB.get('recipes', recipeId);
        if (cached) {
            cached.is_active = false;
            await window.localDB.delete('recipes', recipeId); // Lo borramos del cache local explícitamente para no verlo
        }

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

        let cached = await window.localDB.get('recipes', recipeId);
        if (cached) {
            cached.is_favorite = targetStatus;
            await window.localDB.put('recipes', cached);
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
    // IMAGES
    // ============================================
    async uploadImage(file, recipeId) {
        if (!this._isOnline) {
            // In offline mode we can't upload directly to bucket easily via syncQueue because it's a file.
            // We return a fake success. The user won't get the image synced until they edit it online later.
            // (Para guardar la vida completa habría que almacenar el BLOB en localDB y subirlo).
            if (window.utils) window.utils.showToast("La foto se guardará de forma local por ahora.", "info");
            return { success: true, offline: true, image: { image_url: URL.createObjectURL(file) } };
        }

        try {
            const userId = window.authManager.currentUser.id;
            const fileName = `${userId}/${recipeId}/${Date.now()}-${file.name}`;
            const { data: uploadData, error: uploadError } = await window.supabaseClient.storage.from('recipe-images').upload(fileName, file);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = window.supabaseClient.storage.from('recipe-images').getPublicUrl(fileName);
            const { data: imageData, error: dbError } = await window.supabaseClient.from('recipe_images').insert([{
                recipe_id: recipeId, image_url: publicUrl, file_size: file.size, is_primary: false
            }]).select().single();

            if (dbError) throw dbError;
            return { success: true, image: imageData };
        } catch (error) {
            console.error('❌ Error subiendo imagen:', error);
            return { success: false, error: error.message };
        }
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
            const { success, recipe, error } = await this.getRecipeById(recipeId);
            if (!success) throw new Error(error);

            // Append explicitly 
            const newName = recipe.name_es;

            const { data: newRecipe, error: recipeError } = await window.supabaseClient.from('recipes')
                .insert([{ user_id: targetUserId, name_es: newName, name_en: recipe.name_en ? recipe.name_en : null, description_es: recipe.description_es, description_en: recipe.description_en, category_id: recipe.category_id, is_active: true, is_favorite: false }])
                .select().single();
            if (recipeError) throw recipeError;

            const { data: ingredientsData } = await window.supabaseClient.from('ingredients').select('*').eq('recipe_id', recipeId);
            if (ingredientsData && ingredientsData.length > 0) {
                const ingredients = ingredientsData.map(i => ({ recipe_id: newRecipe.id, name_es: i.name_es, name_en: i.name_en, quantity: i.quantity, unit_es: i.unit_es, unit_en: i.unit_en, raw_text: i.raw_text }));
                await window.supabaseClient.from('ingredients').insert(ingredients);
            }

            const { data: stepsData } = await window.supabaseClient.from('preparation_steps').select('*').eq('recipe_id', recipeId);
            if (stepsData && stepsData.length > 0) {
                const steps = stepsData.map(s => ({ recipe_id: newRecipe.id, instruction_es: s.instruction_es, instruction_en: s.instruction_en, step_number: s.step_number }));
                await window.supabaseClient.from('preparation_steps').insert(steps);
            }

            const { data: imagesData } = await window.supabaseClient.from('recipe_images').select('*').eq('recipe_id', recipeId);
            if (imagesData && imagesData.length > 0) {
                const images = imagesData.map(i => ({ recipe_id: newRecipe.id, image_url: i.image_url, is_primary: i.is_primary, file_size: i.file_size }));
                await window.supabaseClient.from('recipe_images').insert(images);
            }

            // Purge sharing link 
            await this.deleteSharedRecipe(window.authManager.currentUser.id, recipeId);

            // ACTUALIZACIÓN DE LOCALDB (Crucial para respuesta inmediata)
            await this._checkLocalDB();
            // 1. Borrar la versión compartida del cache
            await window.localDB.delete('recipes', recipeId);
            // 2. Insertar la nueva versión propia en el cache
            await window.localDB.put('recipes', {
                ...newRecipe,
                sharingContext: null,
                category: recipe.category,
                images: recipe.images,
                primaryImage: recipe.primaryImage
            });

            return { success: true, newRecipeId: newRecipe.id };
        } catch (error) {
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
