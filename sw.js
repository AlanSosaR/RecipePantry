/**
 * RecipeHub Service Worker (v217)
 * Soporte Offline Total + Sync Background
 */

const CACHE_NAME = 'recipehub-v217';
const BUILD_ID = '2026-03-12-v217';

// Recursos esenciales para la App Shell
const STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/profile',
    '/profile.html',
    '/recipe-detail',
    '/recipe-detail.html',
    '/recipe-form',
    '/recipe-form.html',
    '/manifest.webmanifest',
    '/js/auth.js',
    '/js/db.js',
    '/js/localdb.js',
    '/js/dashboard.js',
    '/js/sw-register.js',
    '/css/styles.css',
    '/css/components.css',
    '/assets/icons/icon.svg',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
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
    self.skipWaiting(); // Forzar activación inmediata
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

    // Bypassear Supabase directo (Auth/PostgREST directo), pero cachear nuestra API
    if (url.origin.includes('supabase.co') && request.method !== 'GET') {
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
                    const rootFallback = (await cache.match('/index.html')) || (await cache.match('/'));
                    
                    let fallback;
                    if (pathname.includes('recipe-detail')) {
                        fallback = (await cache.match('/recipe-detail.html')) || (await cache.match('/recipe-detail')) || rootFallback;
                    } else if (pathname.includes('recipe-form')) {
                        fallback = (await cache.match('/recipe-form.html')) || (await cache.match('/recipe-form')) || rootFallback;
                    } else {
                        fallback = rootFallback || createErrorResponse('Offline: Resource not in cache');
                    }
                    
                    return cleanResponse(fallback);
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
                    const cachedResponse = await caches.match(request);
                    return cachedResponse || createErrorResponse('Offline: API data not in cache', 404);
                })
        );
        return;
    }

    // Estrategia General: Stale-While-Revalidate (Assets & API GET)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => {
                // Fallback silencioso si falla la red en SWR
                return null; 
            });

            // CRITICAL: event.respondWith MUST receive a Response object, not null.
            // If cachedResponse is null and network fails, we must return a fallback Response.
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
