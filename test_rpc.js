const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('c:/Users/alans/Documents/Repocitorio_recetas/RecipeHub/js/config.js', 'utf8');
const supabaseUrl = env.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1];
const supabaseKey = env.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function test(email, password, recipeId) {
    console.log('Logging in...');
    const { data: { user }, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) return console.error('Auth error:', authErr);
    console.log('User:', user.id);

    console.log('Falling back to RPC get_shared_recipe_details...');
    const { data: rpcRecipe, error: rpcError } = await supabase.rpc('get_shared_recipe_details', { p_recipe_id: recipeId });
    if (rpcError) console.error('RPC Error:', rpcError);
    else {
        console.log('RPC Data keys:', Object.keys(rpcRecipe));
        console.log('ingredients Count:', rpcRecipe.ingredients?.length);
        console.log('steps Count:', rpcRecipe.steps?.length);
    }
}
// Using Alan's actual credential base from previous logs
test('alansosafer@gmail.com', '12345678', '24956ae8-20da-4a6c-9dd6-9f874c7e3f89');
