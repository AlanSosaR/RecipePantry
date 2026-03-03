// --- 1. CONFIG ---
const BUILD_ID = "2026-03-03-v7";

const STATIC_CACHE = `static-${BUILD_ID}`;
const DYNAMIC_CACHE = `dynamic-${BUILD_ID}`;


// --- 3. App Shell Minimalista ---
// Solo precargamos recursos estáticos críticos, omitimos rutas dinámicas
const APP_SHELL = [
    './',
    './css/styles.css',
    './css/components.css',
    './css/responsive.css',
    './js/config.js',
    './js/supabase-client.js',
    './js/auth.js',
    './js/localdb.js',
    './js/sync-manager.js',
    './js/db.js',
    './js/utils.js',
    './js/ocr-processor.js',
    './js/app.js',
    './js/dashboard.js',
    './js/ocr.js',
    './js/recipe-form.js',
    './js/recipe-detail.js',
    './js/share-modal.js',
    './js/notifications.js',
    './js/i18n.js',
    './js/ui.js',
    './manifest.webmanifest'
];

// --- 4. Evento INSTALL ---
// Abrir STATIC_CACHE, pre-cachear el App Shell y hacer skipWaiting()
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// --- 5. Evento ACTIVATE ---
// Eliminar únicamente las caches cuyo nombre NO incluya el BUILD_ID actual
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => !key.includes(BUILD_ID))
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});



// --- 6. Estrategias de FETCH ---
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Evitar interceptar requests que no son GET (v.g. POST a base de datos o Auth)
    if (request.method !== 'GET') return;

    // Ignorar esquemas no soportados por la caché (e.g. extensiones de Chrome)
    if (!url.protocol.startsWith('http')) return;

    // 📄 HTML → Network First
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    const responseClone = networkResponse.clone();
                    if (request.url.startsWith('http')) {
                        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // 📦 JS / CSS → Stale While Revalidate
    if (request.destination === 'script' || request.destination === 'style') {
        event.respondWith(
            caches.match(request).then(cachedResponse => {
                const networkFetch = fetch(request).then(networkResponse => {
                    const responseClone = networkResponse.clone();
                    if (request.url.startsWith('http')) {
                        caches.open(STATIC_CACHE).then(cache => cache.put(request, responseClone));
                    }
                    return networkResponse;
                });
                return cachedResponse || networkFetch; // Retornar caché inmediatamente si existe, pero actualizar en background
            })
        );
        return;
    }


    // 🌐 Default → Network First (APIs, recursos misceláneos)
    event.respondWith(
        fetch(request)
            .then(networkResponse => {
                const responseClone = networkResponse.clone();
                if (request.url.startsWith('http')) {
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, responseClone));
                }
                return networkResponse;
            })
            .catch(() => caches.match(request))
    );
});
