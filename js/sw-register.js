const SW_PATH = '/sw.js';
const APP_VERSION_ID = '75';

// 1. Registro del Service Worker
async function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register(SW_PATH);
        console.log('[SW] Registrado:', registration.scope);

        // Si hay una actualización esperando, informar al usuario
        if (registration.waiting) {
            notifyUpdateReady(registration.waiting);
        }

        // Si se encuentra una actualización
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    notifyUpdateReady(newWorker);
                }
            });
        });

    } catch (error) {
        console.error('[SW] Error:', error);
    }

    // 2. Recarga automática cuando el nuevo SW tome el control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

// 3. Notificar al usuario a través del sistema de notificaciones de la app
async function notifyUpdateReady(worker) {
    if ('setAppBadge' in navigator) {
        navigator.setAppBadge(1).catch(() => { });
    }

    // Agregar la notificación al sistema interno de la app (campanita)
    let retries = 0;
    const maxRetries = 20; // 10 seconds (500ms * 20)

    const tryAddNotification = () => {
        if (window.notificationManager && window.notificationManager.menu) {
            window.notificationManager.addUpdateNotification(worker);
        } else if (retries < maxRetries) {
            retries++;
            setTimeout(tryAddNotification, 500);
        } else {
            console.warn('Update ready, but notificationManager failed to load in time.');
            // Autostart removed in v61 to honor user interaction
        }
    };

    tryAddNotification();
}

// Iniciar registro
window.addEventListener('load', registerSW);
