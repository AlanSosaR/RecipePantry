/**
 * Recipe Pantry - Registro Profesional de Service Worker
 * Gestiona el ciclo de vida y la recarga automática ante actualizaciones.
 */

const SW_PATH = '/sw.js';

async function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register(SW_PATH);
        console.log('[SW-Register] Registrado correctamente:', registration.scope);

        // Definir la versión en window para debugging
        window.APP_VERSION = "2026-03-04-v10.8";

        // Detectar si ya hay un SW esperando (updatefound ya ocurrió)
        if (registration.waiting) {
            updateReady(registration.waiting);
        }

        // Detectar si aparece un nuevo SW
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    updateReady(newWorker);
                }
            });
        });

    } catch (error) {
        console.error('[SW-Register] Error en el registro:', error);
    }

    // Escuchar el evento controllerchange para recargar cuando el nuevo SW tome el control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        console.log('[SW-Register] Nuevo Service Worker activado. Recargando...');
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
