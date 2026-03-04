/**
 * Recipe Pantry - Service Worker Profesional (v9)
 * Implementa estrategias de invalidación de caché robustas para producción.
 */

const BUILD_ID = "2026-03-04-v13.2.0";
const CACHE_NAME = 'recipe-app-v13.2.0';

// Recursos esenciales para la App Shell
const STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/assets/icons/manifest-icon-192.maskable.png',
    '/assets/icons/manifest-icon-512.maskable.png',
    '/assets/icons/icon.svg',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined'
];

// 1. Instalación: Pre-caché de recursos críticos y saltar espera
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Forzar activación del nuevo SW
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-cacheando recursos críticos...');
            return cache.addAll(STATIC_RESOURCES);
        })
    );
});

// 2. Activación: Limpieza profunda de caches antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((name) => {
                        if (name !== CACHE_NAME) {
                            console.log('[SW] Eliminando caché antigua:', name);
                            return caches.delete(name);
                        }
                    })
                );
            }),
            self.clients.claim() // Tomar control de todas las pestañas abiertas inmediatamente
        ])
    );
});

// 3. Estrategia de Fetch Inteligente
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 0. Ignorar esquemas no soportados (ej: chrome-extension)
    if (!request.url.startsWith('http')) return;

    // No interceptar peticiones a la API o Supabase para evitar datos estancados
    if (url.origin.includes('supabase.co') || url.pathname.startsWith('/api/')) {
        return;
    }

    // Estrategia para HTML: Network First (Prioridad a la frescura)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Guardar copia fresca en caché
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request)) // Si falla red, usar caché
        );
        return;
    }

    // Estrategia para Assets (JS, CSS, Imágenes): Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((response) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => null);

            return response || fetchPromise;
        })
    );
});

// 4. Mecanismo de Mensajería para Forzar Actualización
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
