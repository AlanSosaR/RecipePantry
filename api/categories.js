// api/categories.js - Lista de categorías (cache largo)
import { createClient } from '@supabase/supabase-js';



const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    if (req.method !== 'GET') {
        return new Response(JSON.stringify({
            error: 'Method not allowed'
        }), { status: 405, headers });
    }

    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('name_es'); // Original order in DB is usually 'name' or 'name_es' -> applying name_es since DB seems configured this way.

        if (error) throw error;

        // Cache 1 hora (categorías cambian poco)
        headers['Cache-Control'] = 'public, s-maxage=3600, stale-while-revalidate=7200';
        headers['CDN-Cache-Control'] = 'public, s-maxage=3600';

        return new Response(JSON.stringify({
            success: true,
            data: data || []
        }), { status: 200, headers });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers });
    }
}
