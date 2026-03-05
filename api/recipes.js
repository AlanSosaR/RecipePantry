// api/recipes.js - Vercel Serverless Function (Node.js)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        return res.status(500).json({
            success: false,
            error: 'Database configuration missing'
        });
    }

    // Extraer header de autenticación
    const authHeader = req.headers['authorization'] || '';

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: authHeader
                }
            }
        }
    );

    try {
        // Extraer TODOS los parámetros de filtrado desde req.query (Node.js)
        const {
            user_id: userId,
            search,
            category_id: categoryId,
            favorite,
            shared,
            sort_by: sortBy = 'created_at',
            sort_order: sortOrder = 'desc',
            limit = '50',
            offset = '0'
        } = req.query;

        const isFavorite = favorite === 'true';
        const isShared = shared === 'true';
        const limitNum = parseInt(limit);
        const offsetNum = parseInt(offset);

        if (req.method === 'GET') {
            if (isShared) {
                if (!userId) {
                    return res.status(400).json({ success: false, error: 'User ID is required' });
                }

                let { data, error } = await supabase
                    .from('shared_recipes')
                    .select('*, recipe:recipe_id(*, category:categories(*)), permission, owner_user_id')
                    .eq('recipient_user_id', userId);

                if (error) throw error;

                res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
                return res.status(200).json({
                    success: true,
                    data: data || [],
                    isSharedFormat: true,
                    filters: { shared: isShared },
                    cached: true
                });
            }

            // Normal Query
            let query = supabase
                .from('recipes')
                .select(`*, category:categories(id, name_es, name_en, icon, color)`, { count: 'exact' })
                .eq('is_active', true);

            if (userId) query = query.eq('user_id', userId);
            if (search && search.trim()) {
                query = query.or(`name_es.ilike.%${search}%,name_en.ilike.%${search}%,description_es.ilike.%${search}%`);
            }
            if (categoryId) query = query.eq('category_id', categoryId);
            if (isFavorite) query = query.eq('is_favorite', true);

            const ascending = sortOrder === 'asc' || sortOrder === 'true';
            query = query.order(sortBy, { ascending });
            query = query.range(offsetNum, offsetNum + limitNum - 1);

            const { data, error, count } = await query;
            if (error) throw error;

            let cacheTime = search ? 30 : (categoryId || isFavorite ? 120 : 60);
            res.setHeader('Cache-Control', `public, s-maxage=${cacheTime}, stale-while-revalidate=${cacheTime * 2}`);

            return res.status(200).json({
                success: true,
                data: data || [],
                pagination: { total: count, limit: limitNum, offset: offsetNum, hasMore: count > offsetNum + limitNum },
                filters: { search, categoryId, favorite: isFavorite, shared: isShared, sortBy, sortOrder },
                cached: true
            });
        }

        if (req.method === 'POST') {
            const body = req.body;
            const { data, error } = await supabase
                .from('recipes')
                .insert([body])
                .select(`*, category:categories(id, name_es, name_en, icon, color)`);

            if (error) throw error;

            return res.status(201).json({
                success: true,
                data: data[0]
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
