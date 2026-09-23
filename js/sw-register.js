const APP_VERSION_ID = 'v640';
const SW_PATH = '/sw.js';
let currentWorker = null;
let updateBannerDismissed = false;
let _updateNotified = false; // guard: evita notificaciones duplicadas en la misma sesión

// 1. Registro del Service Worker
async function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register(SW_PATH);
        console.log('[SW] Registrado (' + APP_VERSION_ID + '):', registration.scope);

        // 1.1 Si ya hay una actualización esperando al inicio
        if (registration.waiting) {
            console.log('[SW] Worker en espera detectado al inicio.');
            currentWorker = registration.waiting;
            notifyUpdateReady(registration.waiting);
        }

        // 1.2 Si se detecta una nueva actualización
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            console.log('[SW] Nueva actualización detectada. Estado inicial:', newWorker.state);
            
            newWorker.addEventListener('statechange', () => {
                console.log('[SW] Cambio de estado del worker:', newWorker.state);
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[SW] Nueva versión instalada en segundo plano.');
                    currentWorker = newWorker;
                    notifyUpdateReady(newWorker);
                }
            });
        });

        // 1.3 Forzar búsqueda de actualización a los 2s de iniciar
        setTimeout(() => {
            registration.update().catch(() => {});
        }, 2000);

        // 1.4 Chequeo proactivo al volver a la app en móvil (desbloquear pantalla, volver de otra pestaña)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('[SW] App en primer plano, verificando actualizaciones...');
                registration.update().catch(() => {});
                checkVersionJson();
            }
        });

        // 1.5 Chequeo periódico cada 60 segundos
        setInterval(() => {
            registration.update().catch(() => {});
            checkVersionJson();
        }, 60000);

    } catch (error) {
        console.error('[SW] Error en registro:', error);
    }

    // 2. Recarga controlada cuando cambie el Service Worker
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if ((window._manualAppUpdateTriggered || window._swUpdating) && !refreshing && !window._progressHandlingReload) {
            refreshing = true;
            window.location.reload();
        }
    });
}

// 3. Chequeo directo a version.json (garantiza detección inmediata en móvil y PWA)
async function checkVersionJson() {
    try {
        const res = await fetch('/version.json?_t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const currentVersion = (window.APP_CONFIG && window.APP_CONFIG.BUILD_ID) || APP_VERSION_ID;
        if (data && data.build) {
            if (data.build !== currentVersion) {
                console.log(`[Version] Nueva versión en servidor: ${data.build} (actual: ${currentVersion})`);
                // Evitar notificaciones duplicadas si ya se notificó en esta sesión
                if (!_updateNotified) {
                    _updateNotified = true;
                    notifyUpdateReady(null);
                }
            } else {
                // Si ya estamos en la versión actual, limpiar cualquier notificación pendiente de actualización
                _updateNotified = false;
                if (window.notificationManager) {
                    window.notificationManager.notifications = window.notificationManager.notifications.filter(n => n.type !== 'app_update');
                    window.notificationManager.updateBadge();
                    const btn = document.getElementById('btn-notifications');
                    if (btn) btn.classList.remove('bell-update-pulse');
                }
            }
        }
    } catch (e) {
        // Silencioso si está offline
    }
}

// 4. Notificar al usuario (solo Campanita — sin banner flotante)
async function notifyUpdateReady(worker) {
    if (sessionStorage.getItem('recipe_pantry_just_updated')) {
        console.log('[Update] Acaba de actualizarse, omitiendo aviso redundante.');
        sessionStorage.removeItem('recipe_pantry_just_updated');
        return;
    }

    console.log('📢 [Update] Preparando notificación de actualización en campana...');
    if ('setAppBadge' in navigator) {
        navigator.setAppBadge(1).catch(() => {});
    }

    // Agregar a la campanita de notificaciones si está disponible
    let retries = 0;
    const maxRetries = 15;
    const tryAddNotification = () => {
        if (window.notificationManager && window.notificationManager.isReady) {
            window.notificationManager.addUpdateNotification(worker);
        } else if (retries < maxRetries) {
            retries++;
            setTimeout(tryAddNotification, 500);
        }
    };
    tryAddNotification();
}

// 5. Banner flotante visible y accesible en móvil
function showFloatingUpdateBanner(newVer) {
    if (updateBannerDismissed) return;
    if (document.getElementById('m3-app-update-banner')) return;

    const isEn = window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en';
    const versionText = newVer ? `(${newVer})` : '';

    const banner = document.createElement('div');
    banner.id = 'm3-app-update-banner';
    banner.className = 'm3-floating-update-banner';
    banner.innerHTML = `
        <div class="update-banner-left">
            <div class="update-banner-icon">
                <span class="material-symbols-outlined">rocket_launch</span>
            </div>
            <div class="update-banner-info">
                <div class="update-banner-title">
                    <span>${isEn ? 'Update Available!' : '¡Nueva actualización!'}</span>
                    ${versionText ? `<span class="update-banner-tag">${versionText}</span>` : ''}
                </div>
                <div class="update-banner-sub">
                    ${isEn ? 'Tap to get the latest version' : 'Toca para obtener los últimos cambios'}
                </div>
            </div>
        </div>
        <div class="update-banner-actions">
            <button class="btn-update-now" onclick="window.triggerAppUpdate()" type="button">
                <span class="material-symbols-outlined" style="font-size: 17px;">refresh</span>
                <span>${isEn ? 'Update' : 'Actualizar'}</span>
            </button>
            <button class="btn-update-dismiss" onclick="window.dismissUpdateBanner()" type="button" aria-label="Dismiss">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
    `;

    document.body.appendChild(banner);
}

window.dismissUpdateBanner = function() {
    updateBannerDismissed = true;
    const banner = document.getElementById('m3-app-update-banner');
    if (banner) {
        banner.classList.add('dismissing');
        setTimeout(() => banner.remove(), 300);
    }
};

window.triggerAppUpdate = async function() {
    window._manualAppUpdateTriggered = true;
    window._swUpdating = true;

    // Si notificationManager tiene su propio modal interactivo, usarlo
    if (window.notificationManager && typeof window.notificationManager.handleUpdateApp === 'function') {
        window.dismissUpdateBanner();
        window.notificationManager.handleUpdateApp();
        return;
    }

    // Modal de carga en el banner
    const banner = document.getElementById('m3-app-update-banner');
    if (banner) {
        const isEn = window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en';
        banner.innerHTML = `
            <div class="update-banner-loading">
                <span class="material-symbols-outlined rotating">sync</span>
                <span>${isEn ? 'Updating Recipe Pantry...' : 'Actualizando Recipe Pantry...'}</span>
            </div>
        `;
    }

    try {
        if (currentWorker) {
            currentWorker.postMessage({ action: 'skipWaiting' });
        }
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
    } catch (e) {
        console.warn('[Update] Error limpiando caché:', e);
    }

    sessionStorage.setItem('recipe_pantry_just_updated', 'true');
    setTimeout(() => {
        window.location.reload();
    }, 600);
};

// 6. Chequeo manual accesible globalmente
window.checkAppUpdate = async function() {
    console.log('🔍 [Update] Chequeo manual solicitado...');
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
        } catch (e) {}
    }
    await checkVersionJson();
};

// Chequeo inicial a los 3 segundos de carga
setTimeout(checkVersionJson, 3000);

// Iniciar registro
window.addEventListener('load', registerSW);
