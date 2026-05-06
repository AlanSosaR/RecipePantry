-- Create notes table
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    content TEXT,
    type TEXT DEFAULT 'text' CHECK (type IN ('text', 'checklist')),
    color TEXT,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create note_items table for checklists
CREATE TABLE IF NOT EXISTS public.note_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
    content TEXT,
    is_completed BOOLEAN DEFAULT false,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_items ENABLE ROW LEVEL SECURITY;

-- Policies for notes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users can manage their own notes') THEN
        CREATE POLICY "Users can manage their own notes" ON public.notes
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Policies for note_items (via notes)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_items' AND policyname = 'Users can manage items of their own notes') THEN
        CREATE POLICY "Users can manage items of their own notes" ON public.note_items
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM public.notes
                    WHERE notes.id = note_items.note_id
                    AND notes.user_id = auth.uid()
                )
            );
    END IF;
END $$;
