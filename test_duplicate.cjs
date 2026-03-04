const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const supabaseKey = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDuplicate() {
    const { data: shared, error: errShared } = await supabase
        .from('shared_recipes')
        .select('*');

    console.log('Shared recipes in DB:', shared);
    if (errShared) console.error('Error:', errShared);
}
testDuplicate();
