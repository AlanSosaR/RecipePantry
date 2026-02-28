// Recipe Pantry Service Worker — v72
const CACHE_NAME = 'recipe-hub-cache-v72';
const IMAGE_CACHE = 'recipe-pantry-images-v11';

// App shell — archivos core a cachear al instalar
const APP_SHELL = [
    './',
    './login',
    './ocr',
    './recipe-form',
    './recipe-detail',
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
    './manifest.webmanifest',
    './assets/icons/manifest-icon-192.maskable.png',
    './assets/icons/manifest-icon-512.maskable.png',
    './assets/placeholder-recipe.svg'
];

self.addEventListener('install', event => {
    console.log('SW: Installing v72...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    console.log('SW: v72 Activated');
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar requests que no son del mismo origen (API Supabase de datos JSON)
    if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/')) {
        return; // Deja pasar libremente, manejada por db.js
    }

    // Imágenes de Supabase (Origen distinto, Cache-First)
    if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/public/')) {
        event.respondWith(
            caches.match(request).then(cached => {
                const networkFetch = fetch(request, {
                    redirect: 'follow',
                    mode: 'cors'
                }).then(response => {
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const clone = response.clone();
                        caches.open(IMAGE_CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => { /* silent fallback offline */ });

                return cached || networkFetch;
            })
        );
        return;
    }

    // Ignorar otras extensiones (Chrome)
    if (request.method !== 'GET' || url.protocol === 'chrome-extension:' || url.protocol === 'data:') {
        return;
    }

    // Para requests del mismo origen
    event.respondWith(handleRequest(request));
});

async function handleRequest(request) {
    const url = new URL(request.url);

    // Estrategia 1: Network First para HTML (SPA)
    if (request.destination === 'document' || request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        try {
            const response = await fetch(request.url, {
                redirect: 'follow'
            });

            if (response.ok && response.type !== 'opaque') {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
            }

            return response;
        } catch (error) {
            console.log('[SW] Network failed for HTML, checking cache');

            // Fallback a cache directo
            const cached = await caches.match(request);
            if (cached) return cached;

            // Fallback final a / o barra espaciadora
            const indexCache = await caches.match('/') || await caches.match('/');
            if (indexCache) return indexCache;

            return new Response('Offline - Page not cached', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    }

    // Estrategia 2: Cache First para assets estáticos
    if (request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image' ||
        request.destination === 'font' ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css')) {

        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        try {
            const response = await fetch(request.url, {
                redirect: 'follow'
            });

            if (response.ok && response.type !== 'opaque') {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
            }

            return response;
        } catch (error) {
            console.error('[SW] Asset fetch failed:', error);
            return new Response('Network error', { status: 503 });
        }
    }

    // Default: Cache First fallando a Network
    try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request.url, {
            redirect: 'follow'
        });

        if (response.ok && response.type !== 'opaque') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        return new Response('Offline', { status: 503 });
    }
}
