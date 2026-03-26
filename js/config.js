// js/config.js
// Configuración Global Recipe Pantry (v442)

var APP_CONFIG = {
    BUILD_ID: '442',
    APP_VERSION: 'v442',
    LANG: 'es',
    THEME: 'light',
    NUKE_KEY: 'nuclear_v442_' + Date.now()
};

var SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZ2ZycXJlcmRkbW9wb2pqY3N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MTYwNDMsImV4cCI6MjA4Njk5MjA0M30.2dMVvE2vxovwnOM_9V0JY8YFVTvvk-omfB6kfEvjoZc';

// Legacy compatibility
window.APP_CONFIG = APP_CONFIG;
window.Config = { SUPABASE_URL, SUPABASE_ANON_KEY };

// v442: SURGICAL FAIL-SAFE (No loops)
(async function() {
    try {
        const VERSION = '442';
        const FLAG = 'rp_updated_to_v442';
        
        // 1. SI YA ACTUALIZAMOS, SALIR INMEDIATAMENTE
        if (localStorage.getItem(FLAG) === 'true') return;

        console.log('🛡️ [Config] Iniciando actualización única a v442...');
        
        // Guardar auth para no cerrar sesión
        const auth = localStorage.getItem('supabase.auth.token');
        
        // Limpiar caches
        if (window.caches) {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
        }
        
        // Desinstalar SW viejos
        if (navigator.serviceWorker) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
        }

        // 2. MARCAR ÉXITO ANTES DE RECARGAR
        localStorage.clear();
        if (auth) localStorage.setItem('supabase.auth.token', auth);
        localStorage.setItem(FLAG, 'true');
        localStorage.setItem('recipe_app_version', VERSION);

        console.warn('✅ Sistema v442 limpio. Recargando para estabilizar...');
        setTimeout(() => window.location.reload(true), 1500);
    } catch(e) { console.error('Sync Error', e); }
})();

// v441: TROJAN HORSE SYNC (Fail-safe update)
(async function() {
    try {
        const targetVersion = '441';
        const syncFlag = 'rp_nuke_v441';
        if (localStorage.getItem(syncFlag)) return;

        console.log('🛡️ [Config] Caballo de Troya v441 Activo...');
        const res = await fetch('/version.json?t=' + Date.now());
        const meta = await res.json();

        if (meta.version === targetVersion) {
            console.warn('🚨 [Config] ENTORNO OBSOLETO DETECTADO. Limpieza Total en curso...');
            localStorage.setItem(syncFlag, 'true');
            
            if (window.caches) {
                const keys = await caches.keys();
                for (const k of keys) await caches.delete(k);
            }
            if (navigator.serviceWorker) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const r of regs) await r.unregister();
            }
            const auth = localStorage.getItem('supabase.auth.token');
            localStorage.clear();
            if (auth) localStorage.setItem('supabase.auth.token', auth);
            localStorage.setItem(syncFlag, 'true');

            console.log('✅ Limpieza completada. Recargando en 1s...');
            setTimeout(() => window.location.reload(true), 1500);
        }
    } catch(e) { console.error('Sync Error', e); }
})();
