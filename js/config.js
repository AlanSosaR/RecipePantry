// js/config.js
// Configuración Global Recipe Pantry (v420)

var APP_CONFIG = {
    BUILD_ID: '420',
    APP_VERSION: 'v420',
    LANG: 'es',
    THEME: 'light',
    NUKE_KEY: 'nuclear_v420_' + Date.now()
};

var SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZ2ZycXJlcmRkbW9wb2pqY3N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4Mzg3MjYsImV4cCI6MjAyNTQxNDcyNn0.8X9X-8X9X-8X9X-8X9X-8X9X-8X9X-8X9X-8X9X-8X9X';

// Legacy compatibility
window.APP_CONFIG = APP_CONFIG;
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
