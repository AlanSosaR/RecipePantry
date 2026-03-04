// api/recipes.js - Edge Function con filtros completos
import { createClient } from '@supabase/supabase-js';

export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
    };

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Database configuration missing (SUPABASE_URL or SUPABASE_ANON_KEY)'
        }), { status: 500, headers });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    try {
        const url = new URL(req.url);

        // Extraer TODOS los parámetros de filtrado
        const userId = url.searchParams.get('user_id');
        const search = url.searchParams.get('search');
        const categoryId = url.searchParams.get('category_id');
        const favorite = url.searchParams.get('favorite') === 'true';
        const shared = url.searchParams.get('shared') === 'true';
        const sortBy = url.searchParams.get('sort_by') || 'created_at';
        const sortOrder = url.searchParams.get('sort_order') || 'desc';
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');

        if (req.method === 'GET') {
            // Mapeo especial para tabla compartidas si aplica (simplified for proxy pattern based on db.js existing complex logic)
            if (shared) {
                if (!userId) {
                    return new Response(JSON.stringify({ success: false, error: 'User ID is required when filtering by shared recipes' }), { status: 400, headers });
                }

                let { data, error } = await supabase
                    .from('shared_recipes')
                    .select('*, recipe:recipe_id(*, category:categories(*)), permission, owner_user_id')
                    .eq('recipient_user_id', userId);

                if (error) throw error;

                if (!data || data.length === 0) {
                    return new Response(JSON.stringify({ success: true, data: [], cached: false }), { status: 200, headers });
                }

                // We return the raw data with the recipes nested to allow frontend to format as before
                let cacheTime = 60;
                headers['Cache-Control'] = `public, s-maxage=${cacheTime}, stale-while-revalidate=${cacheTime * 2}`;
                headers['CDN-Cache-Control'] = `public, s-maxage=${cacheTime}`;

                return new Response(JSON.stringify({
                    success: true,
                    data: data,
                    isSharedFormat: true,
                    filters: { shared },
                    cached: true
                }), { status: 200, headers });
            }

            // Normal Query execution (Not shared)
            let query = supabase
                .from('recipes')
                .select(`*, category:categories(id, name_es, name_en, icon, color)`, { count: 'exact' })
                .eq('is_active', true);

            // FILTRO: Usuario específico
            if (userId) {
                query = query.eq('user_id', userId);
            }

            // FILTRO: Búsqueda por texto
            if (search && search.trim()) {
                query = query.or(`name_es.ilike.%${search}%,name_en.ilike.%${search}%,description_es.ilike.%${search}%`);
            }

            // FILTRO: Categoría
            if (categoryId) {
                query = query.eq('category_id', categoryId);
            }

            // FILTRO: Favoritos
            if (favorite) {
                query = query.eq('is_favorite', true);
            }

            // ORDENAMIENTO
            const ascending = sortOrder === 'asc' || sortOrder === 'true'; // db.js default passing bool
            query = query.order(sortBy, { ascending });

            // PAGINACIÓN
            query = query.range(offset, offset + limit - 1);

            // Ejecutar query
            const { data, error, count } = await query;

            if (error) throw error;

            // Calcular tiempo de cache basado en filtros
            let cacheTime = 60; // Default: 1 minuto

            if (search) {
                cacheTime = 30; // Búsquedas: 30 segundos
            } else if (categoryId || favorite) {
                cacheTime = 120; // Filtros: 2 minutos
            } else {
                cacheTime = 60; // Lista general: 1 minuto
            }

            // Headers de cache
            headers['Cache-Control'] = `public, s-maxage=${cacheTime}, stale-while-revalidate=${cacheTime * 2}`;
            headers['CDN-Cache-Control'] = `public, s-maxage=${cacheTime}`;

            return new Response(JSON.stringify({
                success: true,
                data: data || [],
                pagination: { total: count, limit, offset, hasMore: count > offset + limit },
                filters: { search, categoryId, favorite, shared, sortBy, sortOrder },
                cached: true,
                cacheTime
            }), { status: 200, headers });
        }

        if (req.method === 'POST') {
            const body = await req.json();

            const { data, error } = await supabase
                .from('recipes')
                .insert([body])
                .select(`*, category:categories(id, name_es, name_en, icon, color)`);

            if (error) throw error;

            headers['Cache-Control'] = 'no-store';

            return new Response(JSON.stringify({
                success: true,
                data: data[0]
            }), { status: 201, headers });
        }

        return new Response(JSON.stringify({
            error: 'Method not allowed'
        }), { status: 405, headers });

    } catch (error) {
        console.error('Edge API Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            details: error.details || null
        }), { status: 500, headers });
    }
}
