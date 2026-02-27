// Recipe Pantry Service Worker — v4 (Soporte Imágenes Offline + IndexedDB Sync)
const CACHE_NAME = 'recipe-hub-cache-v28';
const IMAGE_CACHE = 'recipe-pantry-images-v1';

// App shell — archivos core a cachear al instalar
const APP_SHELL = [
    './',
    './index.html',
    './login.html',
    './ocr.html',
    './recipe-form.html',
    './recipe-detail.html',
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
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/placeholder-recipe.svg'
];

// ── Install: cachear app shell ────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.allSettled(
                APP_SHELL.map(url =>
                    cache.add(url).catch(err => console.warn(`⚠️ No se pudo cachear ${url}:`, err))
                )
            );
        })
    );
    self.skipWaiting();
});

// ── Activate: eliminar cachés antiguas ────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME && k !== IMAGE_CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── Fetch: network-first para API, cache-first para assets ──
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // API Supabase (datos JSON). Dejamos pasar libremente, será manejada por `db.js` + `IndexedDB`
    if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/')) {
        return;
    }

    // Imágenes de Supabase Storage. Usaremos Cache-First para mostrarlas offline al instante
    if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/public/')) {
        event.respondWith(
            caches.match(request).then(cached => {
                const networkFetch = fetch(request).then(response => {
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const clone = response.clone();
                        caches.open(IMAGE_CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => { /* offline fails silently */ });

                return cached || networkFetch;
            })
        );
        return;
    }

    // Ignorar extensiones y requests no-GET
    if (request.method !== 'GET' || url.protocol === 'chrome-extension:' || url.protocol === 'data:') {
        return;
    }

    // Resto del shell (CSS, HTML, JS) -> Cache-first clásico
    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request).then(response => {
                if (response && response.status === 200 && response.type !== 'opaque') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => {
                if (cached) return cached;
                if (request.destination === 'document') {
                    return caches.match('/index.html');
                }
                return new Response('Sin conexión', { status: 503 });
            });
            return cached || network;
        })
    );
});
