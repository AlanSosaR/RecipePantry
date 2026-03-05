const SW_PATH = '/sw.js';
const APP_VERSION_ID = '30';

// AUTO-SYNCHRONIZER: Forzar actualización si el HTML y el JS no coinciden
(function () {
    const htmlVer = document.documentElement.getAttribute('data-app-version');
    if (htmlVer && htmlVer !== APP_VERSION_ID) {
        console.warn(`🚀 [Sync] Desincronización: HTML v${htmlVer} vs JS v${APP_VERSION_ID}. Forzando actualización...`);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                for (let reg of regs) reg.unregister();
            });
        }
        if ('caches' in window) {
            caches.keys().then(names => {
                for (let name of names) caches.delete(name);
            });
        }
        localStorage.clear();
        sessionStorage.clear();

        const reloadCount = parseInt(sessionStorage.getItem('reload_count_v28') || '0');
        if (reloadCount < 2) {
            sessionStorage.setItem('reload_count_v28', (reloadCount + 1).toString());
            window.location.reload(true);
        }
    } else {
        sessionStorage.removeItem('reload_count_v28');
    }
})();

async function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register(SW_PATH);
        console.log('[SW-Register] Registrado correctamente:', registration.scope);

        // Definir la versión en window para debugging
        window.APP_VERSION = "2026-03-05-v29";

        // 1. Detectar si ya hay un SW esperando (updatefound ya ocurrió antes de esta carga)
        if (registration.waiting) {
            console.log('[SW-Register] Nueva versión esperando...');
            updateReady(registration.waiting);
        }

        // 2. Detectar si aparece un nuevo SW mientras la página está abierta
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('[SW-Register] Instalando nueva versión...');

            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[SW-Register] Nueva versión instalada y lista.');
                    updateReady(newWorker);
                }
            });
        });

    } catch (error) {
        console.error('[SW-Register] Error en el registro:', error);
    }

    // 3. Recarga automática cuando el nuevo SW tome el control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        console.warn('[SW-Register] Detectado cambio de controlador. Recargando para aplicar cambios...');
        window.location.reload();
    });
}

function updateReady(worker) {
    console.warn('[SW-Register] Nueva versión detectada en el servidor.');
    // Podrias mostrar un Toast aquí, pero por requerimiento forzaremos la actualización
    worker.postMessage({ type: 'SKIP_WAITING' });
}

// Iniciar registro
window.addEventListener('load', registerSW);

// Endpoint de emergencia: /force-update
window.forceAppUpdate = async function () {
    console.log('[Emergency] Forzando limpieza del Service Worker...');
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
        await registration.unregister();
    }
    const cacheNames = await caches.keys();
    for (let name of cacheNames) {
        await caches.delete(name);
    }
    localStorage.clear();
    sessionStorage.clear();
    location.reload(true);
};
