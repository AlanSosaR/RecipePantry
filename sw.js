/**
 * RecipePantry Service Worker (v290)
 * Soporte Offline Total + Sync Background
 */

const CACHE_NAME = 'recipepantry-v326';
const BUILD_ID = '2026-03-16-v290';

// Recursos esenciales para la App Shell
const STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/profile.html',
    '/recipe-detail.html',
    '/recipe-form.html',
    '/manifest.webmanifest',
    '/js/auth.js',
    '/js/db.js',
    '/js/localdb.js',
    '/js/dashboard.js',
    '/js/sw-register.js',
    '/js/config.js',
    '/js/supabase-client.js',
    '/js/i18n.js',
    '/js/utils.js',
    '/js/ui.js',
    '/js/recipe-detail.js',
    '/js/recipe-form.js',
    '/js/sync-manager.js',
    '/js/notifications.js',
    '/css/styles.css',
    '/css/components.css',
    '/assets/icons/icon.svg',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap'
];

// Helper to ensure we always return a valid and "clean" Response.
// Browsers block redirected responses from SW for navigation requests if not handled properly.
const cleanResponse = async (response) => {
    if (!response) return response;
    // If the response is redirected, we MUST create a new response from its body to strip the redirected flag.
    if (response.redirected) {
        const body = await response.blob();
        return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    }
    return response;
};

const createErrorResponse = (message, status = 503) => {
    return new Response(JSON.stringify({ error: message, status }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
};

// 1. Instalación: Pre-caché
self.addEventListener('install', (event) => {
    // self.skipWaiting(); // Removido: Dejar que el usuario decida actualizar de forma interactiva (v266+)
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log(`[SW] Instalando versión ${CACHE_NAME}...`);
            return cache.addAll(STATIC_RESOURCES);
        })
    );
});

// 2. Activación: Limpieza y Reclamo
self.addEventListener('activate', (event) => {
    console.log(`[SW] Activado (v${BUILD_ID})`);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Borrando caché antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Reclamar clientes inmediatamente (v216)
            return self.clients.claim();
        })
    );
});

// 3. Estrategia de Fetch (Stale-While-Revalidate + Robusta)
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (!request.url.startsWith('http')) return;

    // v241: Bypassear TODO Supabase (Auth/PostgREST) para evitar datos stale en notificaciones/recetas
    if (url.origin.includes('supabase.co')) {
        return;
    }

    // Estrategia para Navegación (HTML): Network First
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then(async (response) => {
                    if (response && response.status === 200 && response.type !== 'opaqueredirect') {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                        return cleanResponse(response);
                    }
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    const pathname = url.pathname;
                    const rootFallback = (await cache.match('/index.html', { ignoreSearch: true })) || (await cache.match('/', { ignoreSearch: true }));
                    
                    let fallback;
                    if (pathname.includes('recipe-detail')) {
                        fallback = (await cache.match('/recipe-detail.html', { ignoreSearch: true })) || (await cache.match('/recipe-detail', { ignoreSearch: true })) || rootFallback;
                    } else if (pathname.includes('recipe-form')) {
                        fallback = (await cache.match('/recipe-form.html', { ignoreSearch: true })) || (await cache.match('/recipe-form', { ignoreSearch: true })) || rootFallback;
                    } else {
                        fallback = rootFallback || createErrorResponse('Offline: Resource not in cache');
                    }
                    return cleanResponse(fallback);
                })
        );
        return;
    }

    // Estrategia para Assets Externos (Google Fonts, CDNs)
    const isGoogleFontsCSS = url.hostname.includes('fonts.googleapis.com');
    const isExternalAsset = url.hostname.includes('fonts.gstatic.com') ||
                          url.hostname.includes('cdn.jsdelivr.net');

    if (isGoogleFontsCSS || isExternalAsset) {
        // v225: NO usar ignoreSearch para el CSS de Google Fonts (googleapis) 
        // porque distintas familias tienen distintas queries.
        const useIgnoreSearch = !isGoogleFontsCSS;
        
        event.respondWith(
            caches.match(request, { ignoreSearch: useIgnoreSearch }).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                }).catch(() => createErrorResponse('External asset not available offline', 404));
            })
        );
        return;
    }

    // Estrategia para API de Recetas: Network First (v210)
    if (url.pathname.includes('/api/recipes')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cachedResponse = await caches.match(request, { ignoreSearch: true });
                    return cachedResponse || createErrorResponse('Offline: API data not in cache', 404);
                })
        );
        return;
    }

    // v266: Estrategia para JS y CSS: Network First para actualizar de inmediato
    const isStaticAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
    
    if (isStaticAsset) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cachedResponse = await caches.match(request);
                    return cachedResponse || createErrorResponse('Offline: Asset not in cache');
                })
        );
        return;
    }

    // Estrategia General: Stale-While-Revalidate (Imágenes y Assets Generales)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => null);

            return cachedResponse || fetchPromise.then(res => res || createErrorResponse('Resource not available offline'));
        })
    );
});

// 4. Mensajería
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 5. Gestión de Notificaciones
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.notification.tag === 'app-update') {
        self.skipWaiting();
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
                if (clientsArr.length > 0) {
                    clientsArr[0].focus();
                    clientsArr[0].navigate(clientsArr[0].url);
                }
            })
        );
    }
});
