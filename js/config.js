// js/config.js
// Configuración de Supabase y traducciones

const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

// Exponer como global para los scripts que lo necesiten
if (typeof supabase !== 'undefined') {
    const { createClient } = supabase;
    window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Traducciones
const i18n = {
    es: {
        appName: 'RecipeHub',
        myRecipes: 'Mis Recetas',
        favorites: 'Favoritos',
        shared: 'Compartidas',
        settings: 'Configuración',
        logout: 'Cerrar Sesión',
        addRecipe: 'Agregar Receta',
        search: 'Buscar recetas...',
        noRecipes: 'Aún no tienes recetas',
        loading: 'Cargando...'
    }
};

window.i18n = i18n;
window.currentLang = 'es';

console.log('✅ Configuración inicializada');
