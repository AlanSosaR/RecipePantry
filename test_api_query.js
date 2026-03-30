import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
    console.log('Testing query...');
    const userId = 'cf5ee75b-7182-v4703-a8a0-fbeae25f4c61';

    let query = supabase
        .from('recipes')
        .select(`*, category:categories(id, name_es, name_en, icon, color)`, { count: 'exact' })
        .eq('is_active', true)
        .eq('user_id', userId)
        .order('name_es', { ascending: true })
        .range(0, 49);

    const { data, error, count } = await query;

    if (error) {
        console.error('Query Error:', error);
    } else {
        console.log('Query Success!');
        console.log('Count:', count);
        console.log('Data length:', data.length);
        if (data.length > 0) {
            console.log('First recipe name:', data[0].name_es);
        }
    }
}

test();
