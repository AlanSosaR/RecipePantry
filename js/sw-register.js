const SW_PATH = '/sw.js';
const APP_VERSION_ID = '189';

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
            console.log('[SW] Nueva actualización detectada, instalando...');
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                console.log('[SW] Estado del nuevo worker:', newWorker.state);
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[SW] Update listo para ser aplicado.');
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

    // Nueva notificación prominent y global (Material 3 Snackbar)
    const updateMsg = window.i18n ? window.i18n.t('updateAvailable') : '¡Nueva actualización de la app disponible!';
    const applyTxt = window.i18n ? window.i18n.t('applyUpdateBtn') : 'ACTUALIZAR';
    
    // Si tenemos la función global de snackbar (de action-snackbar), usarla para que sea muy visible
    if (window.showActionSnackbar) {
        window.showActionSnackbar(updateMsg, applyTxt, () => {
            worker.postMessage({ type: 'SKIP_WAITING' });
        });
    } else {
        // Fallback a un toast normal si el snackbar no está listo
        if (window.showToast) {
            window.showToast(updateMsg, 'info');
        }
        // Force update after 3 seconds as a fallback
        setTimeout(() => worker.postMessage({ type: 'SKIP_WAITING' }), 3000);
    }
}

// Iniciar registro
window.addEventListener('load', registerSW);
