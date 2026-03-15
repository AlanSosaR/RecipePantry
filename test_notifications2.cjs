const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
    try {
        const userId = '1b925be2-cbc0-4228-801b-510103027755'; // Use user from user prompt
        console.log('Testing for user:', userId);

        // 1. Fetch exact select statement from notifications.js
        const { data, error } = await supabase
            .from('notifications')
            .select(`
                id, 
                created_at, 
                leido, 
                type,
                from_user_id, 
                recipe_id,
                from_user:users!from_user_id(first_name, last_name, email, prefix),
                recipe:recipes(id, name_es, name_en)
            `)
            .eq('user_id', userId)
            .is('leido', false);

        console.log('--- FETCH RESULT ---');
        console.log('Data count:', data ? data.length : 0);
        console.log('Data details:', JSON.stringify(data, null, 2));
        console.log('Error:', error);

    } catch (e) {
        console.error('Fatal error in script:', e);
    }
}

test();
