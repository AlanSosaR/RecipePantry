// js/config.js
// Configuración Global Recipe Pantry (v262)

const APP_CONFIG = {
    APP_VERSION: '262',
    CACHE_NAME: 'recipehub-v262',
    BUILD_ID: '2026-03-13-v262'
};

const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

const DEFAULT_RECIPE_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop';
window.DEFAULT_RECIPE_IMAGE = DEFAULT_RECIPE_IMAGE;

// Exportar a global
window.APP_CONFIG = APP_CONFIG;

console.log('✅ Configuración v262 inicializada');
