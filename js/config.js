// js/config.js
// Configuración Global Recipe Pantry (v421)

var APP_CONFIG = {
    BUILD_ID: '421',
    APP_VERSION: 'v421',
    LANG: 'es',
    THEME: 'light',
    NUKE_KEY: 'nuclear_v421_' + Date.now()
};

var SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZ2ZycXJlcmRkbW9wb2pqY3N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MTYwNDMsImV4cCI6MjA4Njk5MjA0M30.2dMVvE2vxovwnOM_9V0JY8YFVTvvk-omfB6kfEvjoZc';

// Legacy compatibility
window.APP_CONFIG = APP_CONFIG;
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
