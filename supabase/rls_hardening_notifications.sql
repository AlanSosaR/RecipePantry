-- ============================================================================
-- Migración: Endurecimiento RLS para tabla 'notifications' (SIN APLICAR)
-- Objetivo: Eliminar INSERT anónimo sin romper compartir recetas/notas/menús ni push.
-- ============================================================================

BEGIN;

-- 1. Eliminar la política permisiva que permite inserciones anónimas (anon key)
DROP POLICY IF EXISTS "Anyone can insert" ON public.notifications;

-- 2. Asegurar que solo usuarios autenticados puedan insertar notificaciones,
--    validando además que from_user_id pertenezca al usuario que invoca
--    (o que sea una notificación de bienvenida para sí mismo).
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
    auth.role() = 'authenticated'
    AND (
        -- Flujo 1: Notificación saliente compartida (recetas, notas, menús)
        (
            from_user_id IS NOT NULL 
            AND from_user_id IN (
                SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()
            )
        )
        -- Flujo 2: Notificación generada para sí mismo (ej. bienvenida en login)
        OR (
            user_id IN (
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

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anyone can insert" ON public.notifications;

CREATE POLICY "Anyone can insert"
ON public.notifications
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications
FOR INSERT
TO public
WITH CHECK ((auth.role() = 'authenticated'::text));

COMMIT;
*/
