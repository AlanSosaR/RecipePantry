// js/supabase-client.js
// Las constantes SUPABASE_URL y SUPABASE_ANON_KEY ya están definidas en config.js
// que se carga antes que este script. Solo creamos el cliente aquí.

const { createClient } = window.supabase;
window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.APP_SETTINGS = {};

window.fetchAppSettings = async function() {
    try {
        const { data, error } = await window.supabaseClient.from('app_settings').select('setting_key, setting_value');
        if (error) {
            console.warn('⚠️ No se pudieron cargar las configuraciones remotas:', error);
            return;
        }
        if (data && data.length > 0) {
            data.forEach(item => {
                window.APP_SETTINGS[item.setting_key] = item.setting_value;
            });
            console.log('✅ Configuraciones remotas (app_settings) cargadas.');
        }
    } catch (e) {
        console.warn('⚠️ Fallo al obtener app_settings:', e);
    }
};

console.log('✅ Supabase Client inicializado');
