-- ============================================================================
-- Migración: Endurecimiento RLS para tabla 'note_items' (SIN APLICAR)
-- Objetivo: Restringir SELECT, INSERT, UPDATE y DELETE a los dueños de la nota
--           y permitir lectura (SELECT) de notas compartidas vía notificaciones
--           sin riesgo de error de cast (comparando n.id::text contra texto).
-- ============================================================================

BEGIN;

-- 1. Eliminar las políticas permisivas previas con condición 'true' y la política ALL
DROP POLICY IF EXISTS "note_items_select_policy" ON public.note_items;
DROP POLICY IF EXISTS "note_items_insert_policy" ON public.note_items;
DROP POLICY IF EXISTS "note_items_update_policy" ON public.note_items;
DROP POLICY IF EXISTS "note_items_delete_policy" ON public.note_items;
DROP POLICY IF EXISTS "Users can manage items of their own notes" ON public.note_items;

-- 2. SELECT: Dueño de la nota O receptor de nota compartida vía notificaciones
--    (n.id::text evita cualquier excepción por UUID malformado en metadata)
CREATE POLICY "note_items_select_policy"
ON public.note_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_items.note_id
        AND (
            n.user_id = auth.uid()
            OR n.user_id IN (
                SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()
            )
            OR n.id::text IN (
                SELECT notif.metadata ->> 'note_id'
                FROM public.notifications notif
                WHERE (
                    notif.user_id = auth.uid() 
                    OR notif.user_id IN (SELECT u2.id FROM public.users u2 WHERE u2.auth_user_id = auth.uid())
                )
                AND (notif.metadata ->> 'note_id') IS NOT NULL
            )
        )
    )
);

-- 3. INSERT: Solo el dueño de la nota puede insertar items en ella
CREATE POLICY "note_items_insert_policy"
ON public.note_items
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_items.note_id
        AND (
            n.user_id = auth.uid()
            OR n.user_id IN (
                SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()
            )
        )
    )
);

-- 4. UPDATE: Solo el dueño de la nota puede modificar items de su nota
CREATE POLICY "note_items_update_policy"
ON public.note_items
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_items.note_id
        AND (
            n.user_id = auth.uid()
            OR n.user_id IN (
                SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()
            )
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_items.note_id
        AND (
            n.user_id = auth.uid()
            OR n.user_id IN (
                SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()
            )
        )
    )
);

-- 5. DELETE: Solo el dueño de la nota puede borrar items de su nota
CREATE POLICY "note_items_delete_policy"
ON public.note_items
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_items.note_id
        AND (
            n.user_id = auth.uid()
            OR n.user_id IN (
                SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()
            )
        )
    )
);

COMMIT;

-- ============================================================================
-- SQL DE ROLLBACK FIEL (restaura exactamente la definición previa de pg_policies)
-- ============================================================================
/*
BEGIN;

DROP POLICY IF EXISTS "note_items_select_policy" ON public.note_items;
DROP POLICY IF EXISTS "note_items_insert_policy" ON public.note_items;
DROP POLICY IF EXISTS "note_items_update_policy" ON public.note_items;
DROP POLICY IF EXISTS "note_items_delete_policy" ON public.note_items;
DROP POLICY IF EXISTS "Users can manage items of their own notes" ON public.note_items;

CREATE POLICY "Users can manage items of their own notes"
ON public.note_items
FOR ALL
TO public
USING (
    (EXISTS (
        SELECT 1 FROM notes
        WHERE ((notes.id = note_items.note_id) AND (notes.user_id = auth.uid()))
    ))
);

CREATE POLICY "note_items_delete_policy"
ON public.note_items
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "note_items_insert_policy"
ON public.note_items
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "note_items_select_policy"
ON public.note_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "note_items_update_policy"
ON public.note_items
FOR UPDATE
TO authenticated
USING (true);

COMMIT;
*/
