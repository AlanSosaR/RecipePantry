const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
    try {
        // 1. Fetch any user
        const { data: users, error: uErr } = await supabase.from('users').select('*').limit(1);
        if (uErr) throw uErr;
        const user = users[0];
        if (!user) {
            console.log('No users found');
            return;
        }
        console.log('Testing for user:', user.id);

        // 2. Clear old notifications for test
        await supabase.from('notifications').delete().eq('user_id', user.id).eq('type', 'welcome');

        // 3. Insert welcome
        const { error: insErr } = await supabase.from('notifications').insert([{
            user_id: user.id,
            type: 'welcome',
            titulo: '🎉 ¡Te damos la bienvenida a Recipe Pantry!',
            mensaje: 'Test Message',
            leido: false
        }]);
        if (insErr) console.error('Insert Error:', insErr);
        else console.log('Welcome inserted successfully!');

        // 4. Fetch with EXACT select statement from notifications.js
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
            .eq('user_id', user.id)
            .is('leido', false);

        console.log('--- FETCH RESULT ---');
        console.log('Data count:', data ? data.length : 0);
        if (data && data.length > 0) console.log('First Item:', JSON.stringify(data[0], null, 2));
        console.log('Error:', error);

    } catch (e) {
        console.error('Fatal error in script:', e);
    }
}

test();
