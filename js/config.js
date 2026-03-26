// js/config.js
// Configuración Global Recipe Pantry (v405)

const APP_CONFIG = {
    BUILD_ID: '405',
    APP_VERSION: 'v405',
    LANG: 'es',
    THEME: 'light',
    NUKE_KEY: 'nuclear_v405_' + Date.now()
};

const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

const DEFAULT_RECIPE_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop';
window.DEFAULT_RECIPE_IMAGE = DEFAULT_RECIPE_IMAGE;

// Exportar a global
window.APP_CONFIG = APP_CONFIG;
window.Config = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ...APP_CONFIG
};

console.log('✅ Configuración v405 inicializada');
