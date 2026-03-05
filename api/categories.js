// api/categories.js - Lista de categorías (cache largo)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Method not allowed'
        });
    }

    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('name_es');

        if (error) throw error;

        // Cache 1 hora (categorías cambian poco)
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=3600');

        return res.status(200).json({
            success: true,
            data: data || []
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
