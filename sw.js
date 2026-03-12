/**
 * RecipeHub Service Worker (v211)
 * Soporte Offline Total + Sync Background
 */

const CACHE_NAME = 'recipehub-v211';
const BUILD_ID = '2026-03-12-v211';

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

// Helper to ensure we always return a valid Response
const createErrorResponse = (message, status = 503) => {
    return new Response(JSON.stringify({ error: message, status }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
};

// 1. Instalación: Pre-caché
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log(`[SW] Instalando versión ${CACHE_NAME}...`);
            return cache.addAll(STATIC_RESOURCES);
        })
    );
});

// 2. Activación: Limpieza agresiva de caches antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((name) => {
                        if (name !== CACHE_NAME) {
                            console.log('[SW] Purgando caché obsoleta:', name);
                            return caches.delete(name);
                        }
                    })
                );
            }),
            self.clients.claim()
        ])
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
                .then((response) => {
                    if (response && response.status === 200 && response.type !== 'opaqueredirect') {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    const pathname = url.pathname;
                    const rootFallback = (await cache.match('/index.html')) || (await cache.match('/'));
                    
                    if (pathname.includes('recipe-detail')) {
                        return (await cache.match('/recipe-detail.html')) || (await cache.match('/recipe-detail')) || rootFallback;
                    }
                    if (pathname.includes('recipe-form')) {
                        return (await cache.match('/recipe-form.html')) || (await cache.match('/recipe-form')) || rootFallback;
                    }
                    
                    return rootFallback || createErrorResponse('Offline: Resource not in cache');
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
