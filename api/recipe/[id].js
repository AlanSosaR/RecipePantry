// api/recipe/[id].js - Detalle, actualizar, eliminar
import { createClient } from '@supabase/supabase-js';

export const config = {
    runtime: 'edge',
};

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const id = pathParts[pathParts.length - 1];

        if (!id || id === '[id]') {
            return new Response(JSON.stringify({ error: 'Recipe ID is required' }), { status: 400, headers });
        }

        if (req.method === 'GET') {
            // GET - Detalle completo con joins as defined originally in db.js
            const { data, error } = await supabase
                .from('recipes')
                .select(`
          *,
          category:categories(*),
          ingredients(*),
          steps:preparation_steps(*)
        `)
                .eq('id', id)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return new Response(JSON.stringify({ error: 'Recipe not found', id }), { status: 404, headers });
                }
                throw error;
            }

            headers['Cache-Control'] = 'public, s-maxage=300, stale-while-revalidate=600';
            headers['CDN-Cache-Control'] = 'public, s-maxage=300';

            return new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
        }

        if (req.method === 'PUT') {
            const body = await req.json();

            const { data, error } = await supabase
                .from('recipes')
                .update(body)
                .eq('id', id)
                .select(`*, category:categories(*)`);

            if (error) throw error;
            headers['Cache-Control'] = 'no-store';

            return new Response(JSON.stringify({ success: true, data: data[0] }), { status: 200, headers });
        }

        if (req.method === 'DELETE') {
            const { error } = await supabase
                .from('recipes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            headers['Cache-Control'] = 'no-store';

            return new Response(JSON.stringify({
                success: true, message: 'Recipe deleted successfully', id
            }), { status: 200, headers });
        }

        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

    } catch (error) {
        console.error('Edge API Error:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
    }
}
