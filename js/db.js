// js/db.js
// Funciones de base de datos con soporte offline (localStorage cache)

const DB_CACHE_KEY = 'recipe_pantry_recipes_cache';
const DB_CATEGORIES_KEY = 'recipe_pantry_categories_cache';

class DatabaseManager {
    // ============================================
    // OFFLINE CACHE HELPERS
    // ============================================

    _saveToCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
        } catch (e) {
            console.warn('⚠️ No se pudo guardar en caché:', e);
        }
    }

    _loadFromCache(key, maxAgeMs = 24 * 60 * 60 * 1000) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            if (Date.now() - ts > maxAgeMs) return null; // caché expirada
            return data;
        } catch (e) {
            return null;
        }
    }

    // ============================================
    // RECIPES - CRUD
    // ============================================

    async getMyRecipes(filters = {}) {
        // Cache-first: show cached data instantly, then refresh in background
        const isUnfiltered = !filters.search && !filters.categoryId && !filters.favorite && !filters.shared;
        if (isUnfiltered) {
            const cached = this._loadFromCache(DB_CACHE_KEY, 5 * 60 * 1000);
            if (cached) {
                console.log(`⚡ ${cached.length} recetas desde caché (instantáneo)`);
                this._refreshRecipesInBackground(filters);
                return { success: true, recipes: cached, fromCache: true };
            }
        }
        return this._fetchRecipesFromServer(filters);
    }

    async _refreshRecipesInBackground(filters) {
        try {
            const result = await this._fetchRecipesFromServer(filters);
            if (result.success && !result.fromCache && window.dashboard) {
                const oldIds = window.dashboard.currentRecipes?.map(r => r.id).sort().join(',');
                const newIds = result.recipes.map(r => r.id).sort().join(',');
                if (oldIds !== newIds) {
                    window.dashboard.currentRecipes = result.recipes;
                    window.dashboard.renderRecipesGrid(result.recipes);
                }
            }
        } catch (e) { /* silent — cached version is showing */ }
    }

    async _fetchRecipesFromServer(filters = {}) {
        try {
            let query = window.supabaseClient
                .from('recipes')
                .select(`
                    *,
                    category:categories(id, name_es, name_en, icon, color),
                    images:recipe_images(id, image_url, is_primary)
                `)
            if (filters.shared) {
                const userId = window.authManager.currentUser.id;

                // Consulta unificada: recetas donde soy receptor
                const { data: shared, error: err } = await window.supabaseClient
                    .from('shared_recipes')
                    .select('*, recipe:recipe_id(*, category:categories(*), images:recipe_images(*)), permission')
                    .eq('recipient_user_id', userId);

                if (err) throw err;

                if (!shared || shared.length === 0) {
                    return { success: true, recipes: [], fromCache: false };
                }

                // Masear a formato de receta con metadata de compartido
                const recipes = shared.map(s => {
                    const r = s.recipe;
                    if (!r) return null;
                    return {
                        ...r,
                        primaryImage: r.images?.find(img => img.is_primary)?.image_url || null,
                        totalImages: r.images?.length || 0,
                        sharingContext: 'received',
                        sharedPermission: s.permission
                    };
                }).filter(Boolean);

                return { success: true, recipes, fromCache: false };
            } else {
                query = query.eq('user_id', window.authManager.currentUser.id);
            }

            query = query.eq('is_active', true);

            // Filtros adicionales
            if (filters.favorite) query = query.eq('is_favorite', true);
            if (filters.categoryId) query = query.eq('category_id', filters.categoryId);

            // Ordenamiento
            const orderBy = filters.orderBy || 'name_es';
            const ascending = filters.ascending !== undefined ? filters.ascending : true;
            query = query.order(orderBy, { ascending });

            if (filters.search) {
                query = query.or(
                    `name_es.ilike.%${filters.search}%,` +
                    `name_en.ilike.%${filters.search}%,` +
                    `description_es.ilike.%${filters.search}%`
                );
            }

            const { data, error } = await query;

            if (error) throw error;

            // Procesar imágenes y metadata de compartidos
            const recipes = data.map(recipe => {
                const sharedInfo = this._tempSharedData?.find(s => s.recipe_id === recipe.id);
                const isReceived = sharedInfo?.recipient_user_id === window.authManager.currentUser.id;
                const isSent = sharedInfo?.owner_user_id === window.authManager.currentUser.id;

                return {
                    ...recipe,
                    primaryImage: recipe.images?.find(img => img.is_primary)?.image_url || null,
                    totalImages: recipe.images?.length || 0,
                    sharingContext: sharedInfo ? (isReceived ? 'received' : 'sent') : null,
                    sharedPermission: sharedInfo?.permission || null
                };
            });

            // Limpiar data temporal
            this._tempSharedData = null;

            // Guardar en caché solo si no hay filtros activos
            if (!filters.search && !filters.categoryId && !filters.favorite) {
                this._saveToCache(DB_CACHE_KEY, recipes);
            }

            return { success: true, recipes, fromCache: false };

        } catch (error) {
            console.warn('⚠️ Error de red, intentando caché offline:', error);

            // Fallback a caché local
            const cached = this._loadFromCache(DB_CACHE_KEY);
            if (cached) {
                console.log(`✅ ${cached.length} recetas cargadas desde caché offline`);
                return { success: true, recipes: cached, fromCache: true };
            }

            console.error('❌ Sin conexión y sin caché:', error);
            return { success: false, error: error.message, recipes: [] };
        }
    }

    async getRecipeById(recipeId) {
        try {
            const { data: recipe, error } = await window.supabaseClient
                .from('recipes')
                .select(`
                    *,
                    category:categories(*),
                    ingredients(*),
                    steps:preparation_steps(*),
                    images:recipe_images(*)
                `)
                .eq('id', recipeId)
                .single();

            if (error) throw error;

            // Fire-and-forget: don't block on view counter
            window.supabaseClient
                .from('recipes')
                .update({
                    view_count: (recipe.view_count || 0) + 1,
                    last_viewed_at: new Date().toISOString()
                })
                .eq('id', recipeId)
                .then(() => { }).catch(() => { });

            return { success: true, recipe };

        } catch (error) {
            // Fallback a caché si está offline
            const cached = this._loadFromCache(DB_CACHE_KEY);
            if (cached) {
                const recipe = cached.find(r => r.id === recipeId);
                if (recipe) return { success: true, recipe, fromCache: true };
            }

            console.error('❌ Error obteniendo receta:', error);
            return { success: false, error: error.message };
        }
    }

    async createRecipe(recipeData) {
        try {
            const { data: recipe, error } = await window.supabaseClient
                .from('recipes')
                .insert([{
                    user_id: window.authManager.currentUser.id,
                    ...recipeData
                }])
                .select()
                .single();

            if (error) throw error;

            // Invalidar caché
            localStorage.removeItem(DB_CACHE_KEY);

            return { success: true, recipe };

        } catch (error) {
            console.error('❌ Error creando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async updateRecipe(recipeId, updates) {
        try {
            const { data: recipe, error } = await window.supabaseClient
                .from('recipes')
                .update(updates)
                .eq('id', recipeId)
                .select()
                .single();

            if (error) throw error;

            // Invalidar caché
            localStorage.removeItem(DB_CACHE_KEY);

            return { success: true, recipe };

        } catch (error) {
            console.error('❌ Error actualizando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteRecipe(recipeId) {
        try {
            const userId = window.authManager.currentUser?.id;
            if (!userId) throw new Error("No user logged in");

            // 1. Intentar eliminar de recetas compartidas (si es una receta que me compartieron)
            await window.supabaseClient
                .from('shared_recipes')
                .delete()
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', userId);

            // 2. Soft delete de la receta original (solo funcionará si soy el dueño)
            const { error } = await window.supabaseClient
                .from('recipes')
                .update({ is_active: false })
                .eq('id', recipeId)
                .eq('user_id', userId); // Asegurar que solo el dueño puede borrar

            if (error) throw error;

            // Invalidar caché
            localStorage.removeItem(DB_CACHE_KEY);

            return { success: true };

        } catch (error) {
            console.error('❌ Error eliminando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async toggleFavorite(recipeId, currentStatus) {
        try {
            const userId = window.authManager.currentUser?.id;
            if (!userId) throw new Error("No user logged in");

            // Asegurar que targetStatus es estrictamente booleano
            const targetStatus = currentStatus === true || currentStatus === 'true' ? false : true;

            // Solo podemos hacer favorita una receta que sea nuestra
            const { data, error } = await window.supabaseClient
                .from('recipes')
                .update({ is_favorite: targetStatus })
                .eq('id', recipeId)
                .eq('user_id', userId)
                .select();

            if (error) throw error;

            if (!data || data.length === 0) {
                // Supabase retorna array vacío si RLS bloquea el update o no coincide el eq
                return { success: false, error: "No tienes permiso para modificar esta receta (¿es compartida?)" };
            }

            // Actualizar caché local
            const cached = this._loadFromCache(DB_CACHE_KEY);
            if (cached) {
                const updated = cached.map(r =>
                    r.id === recipeId ? { ...r, is_favorite: targetStatus } : r
                );
                this._saveToCache(DB_CACHE_KEY, updated);
            }

            return { success: true, isFavorite: targetStatus };

        } catch (error) {
            console.error('❌ Error toggle favorito:', error);
            return { success: false, error: error.message };
        }
    }

    // --- Bulk insertions ---
    async addIngredients(recipeId, ingredients) {
        try {
            const items = ingredients.map(ing => ({
                recipe_id: recipeId,
                name_es: ing.name_es,
                unit_es: ing.unit_es || ing.unit || null,
                quantity: ing.quantity || null
            }));

            const { error } = await window.supabaseClient
                .from('ingredients')
                .insert(items);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('❌ Error insertando ingredientes:', error);
            return { success: false, error: error.message };
        }
    }

    async addSteps(recipeId, steps) {
        try {
            const items = steps.map((step, idx) => ({
                recipe_id: recipeId,
                instruction_es: step.instruction_es,
                step_number: step.step_order || step.step_number || (idx + 1)
            }));

            const { error } = await window.supabaseClient
                .from('preparation_steps')
                .insert(items);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('❌ Error insertando pasos:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteIngredients(recipeId) {
        try {
            const { error } = await window.supabaseClient
                .from('ingredients')
                .delete()
                .eq('recipe_id', recipeId);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('❌ Error eliminando ingredientes:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteSteps(recipeId) {
        try {
            const { error } = await window.supabaseClient
                .from('preparation_steps')
                .delete()
                .eq('recipe_id', recipeId);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('❌ Error eliminando pasos:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // IMAGES
    // ============================================

    async uploadImage(file, recipeId) {
        try {
            const userId = window.authManager.currentUser.id;
            const fileName = `${userId}/${recipeId}/${Date.now()}-${file.name}`;

            // Subir a Storage
            const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
                .from('recipe-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            // Obtener URL pública
            const { data: { publicUrl } } = window.supabaseClient.storage
                .from('recipe-images')
                .getPublicUrl(fileName);

            // Guardar metadata
            const { data: imageData, error: dbError } = await window.supabaseClient
                .from('recipe_images')
                .insert([{
                    recipe_id: recipeId,
                    image_url: publicUrl,
                    file_size: file.size,
                    is_primary: false
                }])
                .select()
                .single();

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
        try {
            const { data, error } = await window.supabaseClient
                .from('categories')
                .select('*')
                .order('order_index');

            if (error) throw error;

            // Guardar categorías en caché
            this._saveToCache(DB_CATEGORIES_KEY, data);

            return { success: true, categories: data };

        } catch (error) {
            console.warn('⚠️ Error de red en categorías, usando caché:', error);

            const cached = this._loadFromCache(DB_CATEGORIES_KEY);
            if (cached) return { success: true, categories: cached, fromCache: true };

            console.error('❌ Error obteniendo categorías:', error);
        }
    }

    async duplicateRecipe(recipeId, targetUserId) {
        try {
            // 1. Obtener receta original completa
            const { success, recipe, error } = await this.getRecipeById(recipeId);
            if (!success) throw new Error(error);

            // 2. Insertar nueva receta base
            const { data: newRecipe, error: recipeError } = await window.supabaseClient
                .from('recipes')
                .insert([{
                    user_id: targetUserId,
                    name_es: `${recipe.name_es} (Copia)`,
                    name_en: recipe.name_en ? `${recipe.name_en} (Copy)` : null,
                    description_es: recipe.description_es,
                    description_en: recipe.description_en,
                    category_id: recipe.category_id,
                    difficulty: recipe.difficulty,
                    prep_time: recipe.prep_time,
                    cook_time: recipe.cook_time,
                    servings: recipe.servings,
                    is_active: true,
                    is_favorite: false
                }])
                .select()
                .single();

            if (recipeError) throw recipeError;

            // 3. Duplicar Ingredientes
            const { data: ingredientsData } = await window.supabaseClient.from('ingredients').select('*').eq('recipe_id', recipeId);
            if (ingredientsData && ingredientsData.length > 0) {
                const ingredients = ingredientsData.map(i => ({
                    recipe_id: newRecipe.id,
                    name_es: i.name_es,
                    name_en: i.name_en,
                    quantity: i.quantity,
                    unit_es: i.unit_es,
                    unit_en: i.unit_en
                }));
                await window.supabaseClient.from('ingredients').insert(ingredients);
            }

            // 4. Duplicar Pasos
            const { data: stepsData } = await window.supabaseClient.from('preparation_steps').select('*').eq('recipe_id', recipeId);
            if (stepsData && stepsData.length > 0) {
                const steps = stepsData.map(s => ({
                    recipe_id: newRecipe.id,
                    instruction_es: s.instruction_es,
                    instruction_en: s.instruction_en,
                    step_number: s.step_number
                }));
                await window.supabaseClient.from('preparation_steps').insert(steps);
            }

            // 5. Duplicar referencias de imágenes
            const { data: imagesData } = await window.supabaseClient.from('recipe_images').select('*').eq('recipe_id', recipeId);
            if (imagesData && imagesData.length > 0) {
                const images = imagesData.map(img => ({
                    recipe_id: newRecipe.id,
                    image_url: img.image_url,
                    is_primary: img.is_primary,
                    file_size: img.file_size
                }));
                await window.supabaseClient.from('recipe_images').insert(images);
            }

            return { success: true, recipe: newRecipe };

        } catch (error) {
            console.error('❌ Error duplicando receta:', error);
            return { success: false, error: error.message };
        }
    }
}

// Instancia global
window.db = new DatabaseManager();

console.log('✅ DatabaseManager inicializado con soporte offline');
