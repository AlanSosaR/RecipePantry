-- ==============================================================================
-- Tablas: suppliers y supplier_items (Módulo de Proveedores y Productos)
-- ==============================================================================

-- 1. Tabla de Proveedores (suppliers)
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    image_url TEXT,
    category VARCHAR(100) DEFAULT 'otros',
    delivery_days TEXT[] DEFAULT '{}'::text[],
    cutoff_time TIME WITHOUT TIME ZONE DEFAULT '18:00:00'::time,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabla de Productos del Proveedor (supplier_items)
CREATE TABLE IF NOT EXISTS public.supplier_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    user_id UUID,
    name VARCHAR(255) NOT NULL,
    image_url TEXT,
    category VARCHAR(100),
    unit VARCHAR(50) DEFAULT 'unidad',
    package_format VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON public.suppliers (user_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier_id ON public.supplier_items (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_user_id ON public.supplier_items (user_id);

-- 4. Habilitar RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_items ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS permisivas / operativas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'suppliers_all_policy') THEN
        CREATE POLICY suppliers_all_policy ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supplier_items' AND policyname = 'supplier_items_all_policy') THEN
        CREATE POLICY supplier_items_all_policy ON public.supplier_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
