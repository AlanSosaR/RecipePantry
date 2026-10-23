-- Verificación de existencia de correo para el login.
-- Permite que RecipePantry muestre el error en el campo correcto
-- (correo vs. contraseña) en lugar de un mensaje ambiguo.
--
-- ADVERTENCIA DE SEGURIDAD:
-- Esta función habilita la enumeración de correos (alguien puede consultar
-- si un email tiene cuenta). Úsala solo si aceptas ese riesgo. Para mitigarlo,
-- considera añadir rate limiting (pg_cron / Supabase Edge) o mover la lógica
-- a un backend con service role key.
--
-- Cómo aplicarla:
--   1. Abre el SQL Editor de tu proyecto en Supabase.
--   2. Pega y ejecuta este archivo.
--   3. Verifica con: SELECT public.email_exists('alguien@ejemplo.com');

CREATE OR REPLACE FUNCTION public.email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = lower(trim(p_email))
  );
$$;

-- Permitir la invocación desde el cliente (anon / authenticated)
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon, authenticated;
