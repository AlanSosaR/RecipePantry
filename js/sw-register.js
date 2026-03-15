const SW_PATH = '/sw.js';
const APP_VERSION_ID = '225';

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

    // v261+: Banner flotante premium para actualizar de inmediato
    const isEn = window.i18n && window.i18n.getLang() === 'en';
    const banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; background:#111827; border:2px solid #10B981; border-radius:18px; padding:18px; display:flex; gap:16px; align-items:center; justify-content:space-between; box-shadow:0 12px 30px rgba(0,0,0,0.6); z-index:999999; animation: slideUp 0.4s cubic-bezier(0.1, 0.7, 0.1, 1);';
    banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
            <div style="font-size:32px; background:#10B981; width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">🚀</div>
            <div style="min-width:0;">
                <b style="color:white; display:block; font-size:15px; font-weight:700;">${isEn ? 'New Version Available' : '¡Actualización lista!'}</b>
                <span style="color:#9CA3AF; font-size:12px; display:block; margin-top:2px;">${isEn ? 'Tap to apply improvements.' : 'Nuevas mejoras listas para ti.'}</span>
            </div>
        </div>
        <button id="btn-sw-update" style="padding:12px 20px; background:#10B981; color:white; border:none; border-radius:14px; font-weight:800; font-size:13px; cursor:pointer; flex-shrink:0;">${isEn ? 'Update' : 'Actualizar'}</button>
    `;
    document.body.appendChild(banner);
    
    const btn = document.getElementById('btn-sw-update');
    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = isEn ? 'Updating...' : 'Actualizando...';
        worker.postMessage({ type: 'SKIP_WAITING' });
    });

    if (!document.getElementById('sw-update-anim')) {
        const style = document.createElement('style');
        style.id = 'sw-update-anim';
        style.textContent = `
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(100px) scale(0.9); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    let retries = 0;
    const maxRetries = 20;
    const tryAddNotification = () => {
        if (window.notificationManager && window.notificationManager.menu) {
            window.notificationManager.addUpdateNotification(worker);
        } else if (retries < maxRetries) {
            retries++;
            setTimeout(tryAddNotification, 500);
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
