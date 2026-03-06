/**
 * Recipe Pantry - Service Worker Profesional (v9)
 * Implementa estrategias de invalidación de caché robustas para producción.
 */

const CACHE_NAME = 'recipehub-v43';
const BUILD_ID = '2026-03-06-v43';

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
    '/css/styles.css',
    '/css/components.css',
    '/assets/icons/icon.svg',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined'
];

// 1. Instalación: Pre-caché y activación inmediata
self.addEventListener('install', (event) => {
    // Tomar control inmediatamente sin esperar a que el usuario cierre todas las pestañas
    self.skipWaiting();

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
                .catch(() => caches.match(request))
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

