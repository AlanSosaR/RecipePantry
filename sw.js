// Recipe Pantry Service Worker — v3 (Naranja + Offline)
const CACHE_NAME = 'recipe-pantry-v25';

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
    './js/db.js',
    './js/utils.js',
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
            // addAll falla silenciosamente si algún archivo no existe
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
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── Fetch: network-first para API, cache-first para assets ──
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar requests no-GET y llamadas a Supabase (datos siempre de red)
    if (request.method !== 'GET' || url.hostname.includes('supabase.co')) {
        return;
    }

    // Ignorar extensiones de Chrome y datos
    if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') {
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request).then(response => {
                // Cachear respuestas exitosas de assets estáticos
                if (response && response.status === 200 && response.type !== 'opaque') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => {
                // Sin red: devolver caché si existe
                if (cached) return cached;
                // Fallback para páginas HTML
                if (request.destination === 'document') {
                    return caches.match('/index.html');
                }
                return new Response('Sin conexión', { status: 503 });
            });

            // Devolver caché inmediatamente si está disponible, sino esperar red
            return cached || network;
        })
    );
});
