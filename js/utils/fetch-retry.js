/**
 * fetch-retry.js
 * Utilidad global para peticiones de red con reintentos automáticos.
 */

export async function fetchWithRetry(url, options = {}, retries = 1) {
    let attempt = 0;
    
    while (attempt <= retries) {
        try {
            const res = await fetch(url, options);
            
            // No retry en errores de cliente, excepto si es un rate limit temporal (429) u optativo
            if (res.status >= 400 && res.status < 500 && res.status !== 429) {
                return res;
            }
            
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            
            return res;
            
        } catch (err) {
            if (attempt === retries) {
                throw err;
            }
            console.warn(`[FetchRetry] Falló el intento ${attempt + 1}. Reintentando ${url}...`);
            attempt++;
            
            // Pausa breve antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Opcional: hacerlo disponible globalmente por si legacy ocr.html lo requiere
window.fetchWithRetry = fetchWithRetry;
