// Recipe Pantry Service Worker — v8 (Cloudflare Native Routing)
const CACHE_NAME = 'recipe-hub-cache-v62';
const IMAGE_CACHE = 'recipe-pantry-images-v8';

// App shell — archivos core a cachear al instalar (sin .html)
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
        (async () => {
            try {
                // NORMALIZAR RUTAS HTML PARA CLOUDFLARE PAGES
                // Cloudflare redirige *.html a * (ej. /login.html -> /login)
                // Hacemos que el SW evalúe y descargue siempre la ruta limpia para evitar el error de redirección 308.
                let fetchUrl = request.url;
                let cacheKey = request;

                if (url.origin === location.origin && url.pathname.endsWith('.html')) {
                    let cleanUrl = new URL(request.url);
                    cleanUrl.pathname = cleanUrl.pathname.replace(/\.html$/, '');
                    if (cleanUrl.pathname === '/index') cleanUrl.pathname = '/';

                    fetchUrl = cleanUrl.href;
                    cacheKey = cleanUrl.href;
                }

                const cached = await caches.match(cacheKey);

                const network = fetch(fetchUrl).then(response => {
                    // Solo cachear respuestas exitosas reales
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
                    }
                    return response;
                }).catch(async () => {
                    if (cached) return cached;
                    if (request.destination === 'document') {
                        return await caches.match('/');
                    }
                    return new Response('Sin conexión', { status: 503 });
                });

                return cached ? cached : await network;
            } catch (err) {
                console.error("SW Fetch Error:", err);
                return new Response('Error interno offline', { status: 500 });
            }
        })()
    );
});
