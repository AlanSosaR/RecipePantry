/**
 * RecipeHub Service Worker (v162)
 * Soporte Offline Total + Sync Background
 */

const CACHE_NAME = 'recipehub-v162';
const BUILD_ID = '2026-03-11-v162';

// Recursos esenciales para la App Shell
const STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/js/auth.js',
    '/js/db.js',
    '/js/localdb.js',
    '/js/dashboard.js',
    '/js/sw-register.js',
    '/recipe-detail.html',
    '/css/styles.css',
    '/css/components.css',
    '/assets/icons/icon.svg',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined'
];

// 1. Instalación: Pre-caché
self.addEventListener('install', (event) => {
    // self.skipWaiting(); // v159+: MANUAL UPDATE - Comentado para que aparezca el botón de "Actualizar"
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log(`[SW] Instalando versión ${CACHE_NAME}...`);
            return cache.addAll(STATIC_RESOURCES);
        })
    );
});

// 2. Activación: Limpieza agresiva de caches antiguos
self.addEventListener('activate', (event) => {
    self.clients.claim(); // Tomar control de inmediato
    event.waitUntil(
        Promise.all([
            // Eliminar cualquier cache que no sea el actual
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
            // Tomar control de todos los clientes (pestañas) inmediatamente
            self.clients.claim()
        ])
    );
});

// 3. Estrategia de Fetch (Stale-While-Revalidate)
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
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    // Si falla la red, servir el template base ignorando query params.
                    if (url.pathname.includes('recipe-detail.html')) {
                        return cache.match('/recipe-detail.html');
                    }
                    return cache.match('/index.html') || cache.match('/');
                })
        );
        return;
    }

    // Estrategia para API de Recetas: Network First (v59)
    // Para asegurar que si se borra algo, no reaparezca por el cache
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
                    return caches.match(request);
                })
        );
        return;
    }

    // Estrategia General: Stale-While-Revalidate (Assets & API GET)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                // Solo cachear respuestas exitosas de GET
                if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => {
                // Si falla la red y no hay caché, retornar error silencioso o fallback
                return null;
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// 4. Mensajería
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 5. Gestión de Notificaciones (para actualizaciones y compartidos)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Si es una notificación de actualización
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
