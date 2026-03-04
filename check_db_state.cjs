const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const configContent = fs.readFileSync('./js/config.js', 'utf8');
const urlMatch = configContent.match(/const SUPABASE_URL = '(.*?)';/);
const keyMatch = configContent.match(/const SUPABASE_ANON_KEY = '(.*?)';/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function check() {
    console.log("--- CHEQUEO DE BASE DE DATOS ---");

    console.log("\n1. Notificaciones recientes:");
    const { data: notifs } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5);
    console.log(notifs);

    console.log("\n2. Recetas Compartidas (shared_recipes):");
    const { data: shared } = await supabase.from('shared_recipes').select('*').order('shared_at', { ascending: false }).limit(5);
    console.log(shared);

    console.log("\n3. Últimas Recetas Creadas (recipes):");
    const { data: recipes } = await supabase.from('recipes').select('id, name_es, user_id, created_at').order('created_at', { ascending: false }).limit(5);
    console.log(recipes);
}

check().catch(console.error);
