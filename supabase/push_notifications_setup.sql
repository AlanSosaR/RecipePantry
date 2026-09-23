-- ============================================================
-- RecipePantry — Firebase Push Notifications Setup
-- ============================================================

-- 0. Activar extensión pg_net para llamadas HTTP asíncronas
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Tabla push_tokens
-- Guarda el token FCM de cada usuario por plataforma (web/ios/android)
-- En RecipePantry, user_id referencia a public.users(id)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token       text        NOT NULL,
    platform    text        NOT NULL DEFAULT 'web',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE(user_id, platform)
);

-- Índice para búsquedas rápidas por user_id
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

-- Row Level Security
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Política RLS: los usuarios pueden gestionar sus propios tokens
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage their own push tokens"
    ON public.push_tokens
    FOR ALL
    USING (
        user_id IN (
            SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_id IN (
            SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
    );

-- Permisos
GRANT ALL ON public.push_tokens TO authenticated, service_role;

-- ============================================================
-- 2. Trigger para enviar push cuando se inserta en notifications
-- ============================================================

-- Función trigger
CREATE OR REPLACE FUNCTION notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text := coalesce(nullif(current_setting('app.supabase_url', true), ''), 'https://fsgfrqrerddmopojjcsw.supabase.co');
  service_key  text := coalesce(nullif(current_setting('app.service_role_key', true), ''), '');
  headers_json jsonb;
BEGIN
  -- Solo disparar si hay user_id destino
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF service_key <> '' THEN
    headers_json := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    );
  ELSE
    headers_json := jsonb_build_object(
      'Content-Type', 'application/json'
    );
  END IF;

  -- Llamar a la Edge Function en segundo plano (no bloquea el INSERT)
  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/send-push-notification',
    headers := headers_json,
    body    := jsonb_build_object(
      'user_id',         NEW.user_id,
      'notification_id', NEW.id,
      'type',            COALESCE(NEW.type, 'general')
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Si falla pg_net, no rompemos el INSERT principal
  RAISE WARNING 'notify_push_on_notification_insert: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Crear el trigger
DROP TRIGGER IF EXISTS trigger_push_on_notification ON notifications;
CREATE TRIGGER trigger_push_on_notification
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION notify_push_on_notification_insert();
