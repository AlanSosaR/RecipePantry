const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('c:/Users/alans/Documents/Repocitorio_recetas/RecipeHub/js/config.js', 'utf8');
const supabaseUrl = env.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1];
const supabaseKey = env.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: rpcRecipe, error: rpcError } = await supabase.rpc('get_shared_recipe_details', { p_recipe_id: 'eb185e9d-799b-4ba1-88ab-f6601ed5b2e8' });
    console.log('rpcRecipe type:', typeof rpcRecipe);
    console.log('rpcRecipe isArray:', Array.isArray(rpcRecipe));
    console.log('rpcRecipe keys:', rpcRecipe ? Object.keys(rpcRecipe) : null);
    if (rpcRecipe && Array.isArray(rpcRecipe)) {
        console.log('First element keys:', Object.keys(rpcRecipe[0]));
    }
}
test();
