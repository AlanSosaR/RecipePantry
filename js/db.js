// js/db.js
// Funciones de base de datos (Clase DatabaseManager)

class DatabaseManager {
    // ============================================
    // RECIPES - CRUD
    // ============================================

    async getMyRecipes(filters = {}) {
        try {
            let query = window.supabaseClient
                .from('recipes')
                .select(`
                    *,
                    category:categories(id, name_es, name_en, icon, color),
                    images:recipe_images(id, image_url, is_primary)
                `)
                .eq('user_id', window.authManager.currentUser.id)
                .eq('is_active', true);

            // Ordenamiento dinámico
            const orderBy = filters.orderBy || 'name_es';
            const ascending = filters.ascending !== undefined ? filters.ascending : true;
            query = query.order(orderBy, { ascending });

            // Aplicar filtros
            if (filters.favorite) {
                query = query.eq('is_favorite', true);
            }

            if (filters.categoryId) {
                query = query.eq('category_id', filters.categoryId);
            }

            if (filters.search) {
                query = query.or(
                    `name_es.ilike.%${filters.search}%,` +
                    `name_en.ilike.%${filters.search}%,` +
                    `description_es.ilike.%${filters.search}%`
                );
            }

            const { data, error } = await query;

            if (error) throw error;

            // Procesar imágenes
            const recipes = data.map(recipe => ({
                ...recipe,
                primaryImage: recipe.images?.find(img => img.is_primary)?.image_url || null,
                totalImages: recipe.images?.length || 0
            }));

            return { success: true, recipes };

        } catch (error) {
            console.error('❌ Error obteniendo recetas:', error);
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

            // Incrementar contador de vistas
            await window.supabaseClient
                .from('recipes')
                .update({
                    view_count: (recipe.view_count || 0) + 1,
                    last_viewed_at: new Date().toISOString()
                })
                .eq('id', recipeId);

            return { success: true, recipe };

        } catch (error) {
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

            return { success: true, recipe };

        } catch (error) {
            console.error('❌ Error actualizando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteRecipe(recipeId) {
        try {
            // Soft delete
            const { error } = await window.supabaseClient
                .from('recipes')
                .update({ is_active: false })
                .eq('id', recipeId);

            if (error) throw error;

            return { success: true };

        } catch (error) {
            console.error('❌ Error eliminando receta:', error);
            return { success: false, error: error.message };
        }
    }

    async toggleFavorite(recipeId, currentStatus) {
        try {
            const { error } = await window.supabaseClient
                .from('recipes')
                .update({ is_favorite: !currentStatus })
                .eq('id', recipeId);

            if (error) throw error;

            return { success: true, isFavorite: !currentStatus };

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
                raw_text: ing.raw_text || ing.name_es,
                unit: ing.unit || null,
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
                step_order: idx + 1
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
                    mime_type: file.type,
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

            return { success: true, categories: data };

        } catch (error) {
            console.error('❌ Error obteniendo categorías:', error);
            return { success: false, categories: [] };
        }
    }
}

// Instancia global
window.db = new DatabaseManager();

console.log('✅ DatabaseManager inicializado');
