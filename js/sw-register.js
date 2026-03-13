const SW_PATH = '/sw.js';
const APP_VERSION_ID = '223';

// 1. Registro del Service Worker
async function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register(SW_PATH);
        console.log('[SW] Registrado:', registration.scope);

        // Si hay una actualización esperando, informar al usuario
        if (registration.waiting) {
            console.log('[SW] Worker en espera detectado al inicio.');
            notifyUpdateReady(registration.waiting);
        }

        // Si se encuentra una actualización
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('[SW] Nueva actualización detectada. Estado inicial:', newWorker.state);
            
            newWorker.addEventListener('statechange', () => {
                console.log('[SW] Cambio de estado del worker:', newWorker.state);
                if (newWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                        console.log('[SW] Nueva versión lista (Update).');
                        notifyUpdateReady(newWorker);
                    } else {
                        console.log('[SW] Instalación inicial completada.');
                    }
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
    console.log('📢 [Update] Preparando notificación interactiva...');
    if ('setAppBadge' in navigator) {
        navigator.setAppBadge(1).catch(() => { });
    }

    // Agregar la notificación al sistema interno de la app (campanita)
    let retries = 0;
    const maxRetries = 20;

    const tryAddNotification = () => {
        if (window.notificationManager && window.notificationManager.menu) {
            window.notificationManager.addUpdateNotification(worker);
        } else if (retries < maxRetries) {
            retries++;
            setTimeout(tryAddNotification, 500);
        } else {
            console.warn('Update ready, but notificationManager failed to load in time.');
        }
    };

    tryAddNotification();
}

// 4. Manual check trigger for Pull-to-Refresh
window.checkAppUpdate = async function () {
    if (!('serviceWorker' in navigator)) return;
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            console.log('🔍 [Update] Buscando actualizaciones manualmente...');
            await registration.update();
        }
    } catch (error) {
        console.error('[Update] Error en chequeo manual:', error);
    }
};

// Iniciar registro
window.addEventListener('load', registerSW);
