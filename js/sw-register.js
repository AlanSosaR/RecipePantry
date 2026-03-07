const SW_PATH = '/sw.js';
const APP_VERSION_ID = '46';

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

// 3. Notificar al usuario con Notificación de Sistema y Badge en el Icono
async function notifyUpdateReady(worker) {
    // A. Badge en el icono (PWA)
    if ('setAppBadge' in navigator) {
        navigator.setAppBadge(1).catch(() => { });
    }

    // B. Notificación de Sistema
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                reg.showNotification(isEn ? 'Update Available' : 'Actualización Disponible', {
                    body: isEn ? 'Tap to apply the new version.' : 'Toca para aplicar la nueva versión.',
                    icon: '/assets/icons/icon.svg',
                    tag: 'app-update',
                    requireInteraction: true,
                    data: { type: 'SKIP_WAITING' }
                });
            }
        }
    }

    // C. Si el usuario hace clic en el documento, aprovechamos para actualizar si hay algo pendiente
    // Esto es un "soft update" por si fallan las notificaciones
    const updateHandler = () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        document.removeEventListener('click', updateHandler);
    };
    document.addEventListener('click', updateHandler);
}

// Iniciar registro
window.addEventListener('load', registerSW);
