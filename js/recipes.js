import { supabase } from './supabase-client.js';

/**
 * Obtiene el ID del perfil público (public.users.id) del usuario autenticado.
 * Este ID es necesario para todas las relaciones de FK en la BD.
 */
export async function getUserPublicId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

    if (error) {
        console.error('[getUserPublicId]', error);
        return null;
    }
    return data?.id ?? null;
}

/**
 * Obtiene todas las recetas del usuario autenticado, con categoría e imágenes.
 */
export async function getRecipes() {
    const { data, error } = await supabase
        .from('recipes')
        .select(`
            id, name_es, description_es, prep_time_minutes, cook_time_minutes,
            servings, difficulty, is_favorite, created_at,
            categories (id, name_es, icon),
            recipe_images (id, image_url, is_primary)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    return { data, error };
}

/**
 * Obtiene recetas filtradas por categoría.
 */
export async function getRecipesByCategory(categoryId) {
    const { data, error } = await supabase
        .from('recipes')
        .select(`
            id, name_es, prep_time_minutes, cook_time_minutes,
            is_favorite, difficulty,
            categories (id, name_es, icon),
            recipe_images (id, image_url, is_primary)
        `)
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    return { data, error };
}

/**
 * Obtiene una receta completa con ingredientes y pasos.
 */
export async function getRecipeById(id) {
    const { data, error } = await supabase
        .from('recipes')
        .select(`
            *,
            categories (id, name_es, icon),
            recipe_images (id, image_url, is_primary, order_index),
            ingredients (id, name_es, quantity, unit_es, order_index),
            preparation_steps (id, step_number, instruction_es, time_minutes)
        `)
        .eq('id', id)
        .single();

    // Incrementar view_count sin bloquear
    if (!error && data) {
        supabase
            .from('recipes')
            .update({ view_count: (data.view_count || 0) + 1, last_viewed_at: new Date().toISOString() })
            .eq('id', id)
            .then(() => { });
    }

    return { data, error };
}

/**
 * Crea una receta con sus ingredientes y pasos en una sola operación transaccional.
 */
export async function createRecipeComplete(recipeData, ingredients = [], steps = []) {
    // 1. Insertar la receta
    const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert(recipeData)
        .select()
        .single();

    if (recipeError) return { error: recipeError };

    // 2. Insertar ingredientes (si hay)
    if (ingredients.length > 0) {
        const ingPayload = ingredients.map((ing, idx) => ({
            recipe_id: recipe.id,
            name_es: ing.name_es,
            quantity: ing.quantity || null,
            unit_es: ing.unit_es || null,
            order_index: idx
        }));

        const { error: ingError } = await supabase.from('ingredients').insert(ingPayload);
        if (ingError) console.warn('[createRecipeComplete] ingredientes:', ingError);
    }

    // 3. Insertar pasos (si hay)
    if (steps.length > 0) {
        const stepsPayload = steps.map(s => ({
            recipe_id: recipe.id,
            step_number: s.step_number,
            instruction_es: s.instruction_es
        }));

        const { error: stepsError } = await supabase.from('preparation_steps').insert(stepsPayload);
        if (stepsError) console.warn('[createRecipeComplete] pasos:', stepsError);
    }

    return { data: recipe, error: null };
}

/**
 * Alterna el estado de favorito de una receta.
 */
export async function toggleFavorite(id, currentValue) {
    const { error } = await supabase
        .from('recipes')
        .update({ is_favorite: !currentValue })
        .eq('id', id);

    return { error };
}

/**
 * Elimina una receta (soft delete: marca is_active = false).
 */
export async function deleteRecipe(id) {
    const { error } = await supabase
        .from('recipes')
        .update({ is_active: false })
        .eq('id', id);

    return { error };
}

/**
 * Actualiza campos de una receta existente.
 */
export async function updateRecipe(id, updates) {
    const { data, error } = await supabase
        .from('recipes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    return { data, error };
}
