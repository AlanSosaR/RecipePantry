-- ==============================================================================
-- Tabla: prep_tasks (Módulo To Do / Prep List diario)
-- ==============================================================================

-- 1. Crear la tabla prep_tasks si no existe
CREATE TABLE IF NOT EXISTS public.prep_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    qty TEXT DEFAULT '',
    category VARCHAR(50) DEFAULT 'diario',
    is_daily BOOLEAN DEFAULT true,
    completed BOOLEAN DEFAULT false,
    recipe_id TEXT,
    recipe_data JSONB,
    portions INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    is_shared BOOLEAN DEFAULT true,
    due_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Índices para rendimiento en búsquedas y ordenamiento
CREATE INDEX IF NOT EXISTS idx_prep_tasks_due_date ON public.prep_tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_prep_tasks_user_id ON public.prep_tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_prep_tasks_is_daily ON public.prep_tasks (is_daily);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.prep_tasks ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de acceso (RLS)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prep_tasks' AND policyname = 'prep_tasks_select_policy') THEN
        CREATE POLICY prep_tasks_select_policy ON public.prep_tasks FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prep_tasks' AND policyname = 'prep_tasks_insert_policy') THEN
        CREATE POLICY prep_tasks_insert_policy ON public.prep_tasks FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prep_tasks' AND policyname = 'prep_tasks_update_policy') THEN
        CREATE POLICY prep_tasks_update_policy ON public.prep_tasks FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prep_tasks' AND policyname = 'prep_tasks_delete_policy') THEN
        CREATE POLICY prep_tasks_delete_policy ON public.prep_tasks FOR DELETE USING (true);
    END IF;
END $$;

-- 5. Agregar a la publicación de Supabase Realtime para sincronización en vivo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'prep_tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_tasks;
    END IF;
END $$;
