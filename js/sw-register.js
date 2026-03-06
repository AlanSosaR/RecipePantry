const SW_PATH = '/sw.js';
const APP_VERSION_ID = '45';

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

// 3. Notificar al usuario con un Snackbar
function notifyUpdateReady(worker) {
    const msg = window.i18n && window.i18n.getLang() === 'en'
        ? 'A new version is available!'
        : '¡Hay una nueva actualización disponible!';

    const btnTxt = window.i18n && window.i18n.getLang() === 'en' ? 'Update' : 'Actualizar';

    // Usar el Snackbar de Material 3 que ya tenemos en utils.js
    if (window.showActionSnackbar) {
        window.showActionSnackbar(msg, btnTxt, () => {
            worker.postMessage({ type: 'SKIP_WAITING' });
        });
    } else {
        // Fallback si no está cargado utils.js todavía
        if (confirm(msg)) {
            worker.postMessage({ type: 'SKIP_WAITING' });
        }
    }
}

// Iniciar registro
window.addEventListener('load', registerSW);
