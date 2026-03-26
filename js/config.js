// js/config.js
// Configuración Global Recipe Pantry (v410)

var APP_CONFIG = {
    BUILD_ID: '410',
    APP_VERSION: 'v410',
    LANG: 'es',
    THEME: 'light',
    NUKE_KEY: 'nuclear_v410_' + Date.now()
};

var SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

var DEFAULT_RECIPE_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop';
window.DEFAULT_RECIPE_IMAGE = DEFAULT_RECIPE_IMAGE;

// Exportar a global
window.APP_CONFIG = APP_CONFIG;
window.Config = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ...APP_CONFIG
};

console.log('✅ Configuración v410 inicializada');
