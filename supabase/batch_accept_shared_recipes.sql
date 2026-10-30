-- batch_accept_shared_recipes.sql
-- Duplica en un solo lote rápido dentro de PostgreSQL las recetas compartidas

CREATE OR REPLACE FUNCTION public.batch_accept_shared_recipes(
    p_recipe_ids uuid[],
    p_target_user_id uuid,
    p_target_folder text DEFAULT NULL,
    p_notification_id uuid DEFAULT NULL
)
RETURNS TABLE (
    new_recipe_id uuid,
    old_recipe_id uuid,
    name_es varchar,
    name_en varchar,
    pantry_es text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r_id uuid;
    v_new_id uuid;
    v_clean_folder text;
    v_recipe record;
BEGIN
    v_clean_folder := NULLIF(TRIM(p_target_folder), '');

    FOREACH r_id IN ARRAY p_recipe_ids LOOP
        SELECT * INTO v_recipe FROM public.recipes WHERE id = r_id;
        IF FOUND THEN
            INSERT INTO public.recipes (
                user_id,
                name_es,
                name_en,
                description_es,
                description_en,
                pantry_es,
                pantry_en,
                personal_notes,
                tags,
                is_active,
                is_favorite,
                created_from_ocr
            ) VALUES (
                p_target_user_id,
                v_recipe.name_es,
                v_recipe.name_en,
                v_recipe.description_es,
                v_recipe.description_en,
                v_clean_folder,
                v_clean_folder,
                v_recipe.personal_notes,
                v_recipe.tags,
                true,
                false,
                false
            )
            RETURNING id INTO v_new_id;

            INSERT INTO public.ingredients (
                recipe_id,
                name_es,
                name_en,
                quantity,
                unit_es,
                unit_en,
                order_index,
                is_checked
            )
            SELECT
                v_new_id,
                name_es,
                name_en,
                quantity,
                unit_es,
                unit_en,
                order_index,
                false
            FROM public.ingredients
            WHERE recipe_id = r_id;

            INSERT INTO public.preparation_steps (
                recipe_id,
                step_number,
                instruction_es,
                instruction_en,
                image_url,
                time_minutes,
                is_completed
            )
            SELECT
                v_new_id,
                step_number,
                instruction_es,
                instruction_en,
                image_url,
                time_minutes,
                false
            FROM public.preparation_steps
            WHERE recipe_id = r_id;

            DELETE FROM public.shared_recipes
            WHERE recipient_user_id = p_target_user_id
              AND recipe_id = r_id;

            new_recipe_id := v_new_id;
            old_recipe_id := r_id;
            name_es := v_recipe.name_es;
            name_en := v_recipe.name_en;
            pantry_es := v_clean_folder;
            RETURN NEXT;
        END IF;
    END LOOP;

    IF p_notification_id IS NOT NULL THEN
        UPDATE public.notifications
        SET leido = true
        WHERE id = p_notification_id;
    END IF;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_accept_shared_recipes(uuid[], uuid, text, uuid) TO anon, authenticated, service_role;
