// --- 1. CONFIG ---
const BUILD_ID = "2026-03-01-a1";

const STATIC_CACHE = `static-${BUILD_ID}`;
const DYNAMIC_CACHE = `dynamic-${BUILD_ID}`;
const IMAGE_CACHE = `images-${BUILD_ID}`;

const MAX_IMAGE_ITEMS = 50;

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
    './manifest.webmanifest',
    './assets/placeholder-recipe.svg'
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

// --- Helper Functions ---
// Función recursiva para limitar el tamaño de una caché específica
async function limitCacheSize(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
        await cache.delete(keys[0]);
        limitCacheSize(cacheName, maxItems);
    }
}

// --- 6. Estrategias de FETCH ---
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Evitar interceptar requests que no son GET (v.g. POST a base de datos o Auth)
    if (request.method !== 'GET') return;

    // 📄 HTML → Network First
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    const responseClone = networkResponse.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, responseClone));
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
                    caches.open(STATIC_CACHE).then(cache => cache.put(request, responseClone));
                    return networkResponse;
                });
                return cachedResponse || networkFetch; // Retornar caché inmediatamente si existe, pero actualizar en background
            })
        );
        return;
    }

    // 🖼 Imágenes → Cache First con Límite
    if (request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|svg|gif)$/i) || url.pathname.includes('/storage/v1/object/public/recipe-images/')) {
        event.respondWith(
            caches.match(request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request).then(networkResponse => {
                    // Validar respuesta sana antes de put
                    if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
                        return networkResponse;
                    }

                    const responseClone = networkResponse.clone();
                    caches.open(IMAGE_CACHE).then(cache => {
                        cache.put(request, responseClone);
                        limitCacheSize(IMAGE_CACHE, MAX_IMAGE_ITEMS);
                    });
                    return networkResponse;
                }).catch(() => {
                    // Fallback local si falla descarga de cualquier imagen
                    if (request.url.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
                        return caches.match('./assets/placeholder-recipe.svg');
                    }
                });
            })
        );
        return;
    }

    // 🌐 Default → Network First (APIs, recursos misceláneos)
    event.respondWith(
        fetch(request)
            .then(networkResponse => {
                const responseClone = networkResponse.clone();
                caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, responseClone));
                return networkResponse;
            })
            .catch(() => caches.match(request))
    );
});
