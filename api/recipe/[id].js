// api/recipe/[id].js - Vercel Serverless Function (Node.js)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Aplicar headers básicos
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        return res.status(500).json({ success: false, error: 'Database configuration missing' });
    }

    const authHeader = req.headers['authorization'] || '';

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: authHeader } } }
    );

    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'Recipe ID is required' });
        }

        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('recipes')
                .select(`
                    *,
                    category:categories(*),
                    ingredients:ingredients(*),
                    steps:preparation_steps(*)
                `)
                .eq('id', id)
                .order('order_index', { foreignTable: 'ingredients', ascending: true })
                .order('step_number', { foreignTable: 'preparation_steps', ascending: true })
                .single();

            if (error) {
                if (error.code === 'PGRST116') return res.status(404).json({ error: 'Recipe not found' });
                throw error;
            }

            // Desactivar caché de CDN/Edge para asegurar consistencia inmediata tras edición
            res.setHeader('Cache-Control', 'public, s-maxage=0, must-revalidate');
            return res.status(200).json({ success: true, data });
        }


        if (req.method === 'PUT') {
            const body = req.body;
            const { data, error } = await supabase
                .from('recipes')
                .update(body)
                .eq('id', id)
                .select(`*, category:categories(*)`);

            if (error) throw error;
            return res.status(200).json({ success: true, data: data[0] });
        }

        if (req.method === 'DELETE') {
            const { error } = await supabase
                .from('recipes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return res.status(200).json({ success: true, message: 'Recipe deleted successfully', id });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
