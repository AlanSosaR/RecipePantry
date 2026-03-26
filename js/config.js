
// Exportar a global
window.APP_CONFIG = APP_CONFIG;
window.Config = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ...APP_CONFIG
};

console.log('✅ Configuración v405 inicializada');
