-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (extends Supabase Auth)
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID NOT NULL, -- Link to auth.users, but FK might not be strictly enforceable if in different schema without permissions
    email VARCHAR(255) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    collection_name VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 1b. Categories Table
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_es VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    icon VARCHAR(100),
    color VARCHAR(50),
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Recipes Table
CREATE TABLE public.recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id),
    name_es VARCHAR(255),
    name_en VARCHAR(255),
    description_es TEXT,
    description_en TEXT,
    prep_time_minutes INTEGER CHECK (prep_time_minutes >= 0),
    cook_time_minutes INTEGER CHECK (cook_time_minutes >= 0),
    servings INTEGER CHECK (servings > 0),
    difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
    is_favorite BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    times_cooked INTEGER DEFAULT 0,
    created_from_ocr BOOLEAN DEFAULT FALSE,
    ocr_raw_text TEXT,
    ocr_confidence DECIMAL(5,2),
    tags TEXT[],
    personal_notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Ingredients Table
CREATE TABLE public.ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    name_es VARCHAR(255),
    name_en VARCHAR(255),
    quantity DECIMAL(10,2),
    unit_es VARCHAR(100),
    unit_en VARCHAR(100),
    order_index INTEGER,
    is_checked BOOLEAN DEFAULT FALSE
);

-- 4. Preparation Steps Table
CREATE TABLE public.preparation_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    step_number INTEGER,
    instruction_es TEXT,
    instruction_en TEXT,
    image_url TEXT,
    time_minutes INTEGER,
    is_completed BOOLEAN DEFAULT FALSE
);

-- 5. Recipe Images Table
CREATE TABLE public.recipe_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    image_url TEXT,
    order_index INTEGER,
    is_primary BOOLEAN DEFAULT FALSE,
    caption_es TEXT,
    caption_en TEXT,
    step_id UUID REFERENCES public.preparation_steps(id),
    ocr_text TEXT,
    ocr_confidence DECIMAL(5,2),
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Shared Recipes Table
CREATE TABLE public.shared_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID REFERENCES public.users(id),
    recipe_id UUID REFERENCES public.recipes(id),
    recipient_user_id UUID REFERENCES public.users(id),
    permission TEXT CHECK (permission IN ('view', 'view_and_copy')),
    status TEXT CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked')),
    message TEXT,
    copied BOOLEAN DEFAULT FALSE,
    copied_at TIMESTAMP WITH TIME ZONE,
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    accepted_at TIMESTAMP WITH TIME ZONE
);

-- 7. OCR Queue Table
CREATE TABLE public.ocr_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id),
    image_url TEXT,
    process_type TEXT CHECK (process_type IN ('recipe_photo', 'ingredient_list', 'step_image')),
    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    extracted_text TEXT,
    confidence DECIMAL(5,2),
    recipe_id UUID REFERENCES public.recipes(id),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- 8. User Searches Table
CREATE TABLE public.user_searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id),
    search_term TEXT,
    search_count INTEGER DEFAULT 1,
    last_searched_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX idx_recipes_user ON public.recipes(user_id);
CREATE INDEX idx_recipes_favorite ON public.recipes(user_id, is_favorite);
CREATE INDEX idx_recipes_tags ON public.recipes USING GIN(tags);
CREATE INDEX idx_recipes_search_es ON public.recipes USING gin(to_tsvector('spanish', name_es || ' ' || COALESCE(description_es, '')));
CREATE INDEX idx_shared_recipes_recipient ON public.shared_recipes(recipient_user_id);
CREATE INDEX idx_ocr_queue_status ON public.ocr_queue(status);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Note: Actual RLS policies depend on `auth.uid()` which works in Supabase environment.

-- Example Policies (Uncomment to apply)
-- CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth_user_id = auth.uid());
-- CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth_user_id = auth.uid());
-- CREATE POLICY "Users can view own recipes" ON public.recipes FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- Functions
CREATE OR REPLACE FUNCTION increment_times_cooked(recipe_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.recipes
  SET times_cooked = times_cooked + 1
  WHERE id = recipe_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
