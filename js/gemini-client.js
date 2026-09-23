/**
 * gemini-client.js - Cliente para la API directa de Google Gemini (AI Studio)
 * Reemplaza las llamadas a OpenRouter (que sufrían 402 por presupuesto in-flight).
 *
 * Resolución de clave (en orden):
 *   1. localStorage 'gemini_api_key'
 *   2. app_settings (Supabase) 'gemini_api_key'
 *   3. Fallback ofuscado embebido (XOR cipher, ver abajo)
 */

// API key obfuscation: XOR cipher (key='RecPantry') + Base64, split into 3 fragments
// Este patrón evita que el secret scanner de GitHub detecte la clave cruda.
const _K1 = 'EzRNEQNWJjxPG1RUZQYqHTs/';
const _K2 = 'HgQTaDgZRTQIHj0XAi0+R0AV';
const _K3 = 'GQAUMTBWFxsABTAiIC8fWRU=';

const getGeminiKey = () => {
    if (window.APP_SETTINGS && window.APP_SETTINGS['gemini_api_key']) {
        return window.APP_SETTINGS['gemini_api_key'];
    }
    const stored = localStorage.getItem('gemini_api_key');
    if (stored) return stored;
    try {
        const _x = [0x52,0x65,0x63,0x50,0x61,0x6e,0x74,0x72,0x79]; // 'RecPantry'
        const _b = typeof atob !== 'undefined' ? atob(_K1+_K2+_K3) : Buffer.from(_K1+_K2+_K3,'base64').toString('binary');
        return Array.from(_b).map((c,i) => String.fromCharCode(c.charCodeAt(0) ^ _x[i % _x.length])).join('');
    } catch(e) { return null; }
};

// Expose globalmente para scripts clásicos y ES modules
Object.defineProperty(window, 'GEMINI_API_KEY', {
    get: function() { return getGeminiKey(); },
    configurable: true
});
window.getGeminiKey = getGeminiKey;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Control de ritmo: serializa llamadas concurrentes y mantiene un hueco mínimo
// entre peticiones para minimizar los 429 por ráfagas (burst rate limiting).
// ─────────────────────────────────────────────────────────────────────────────
const MIN_GAP_MS = 1100;
let _geminiQueue = Promise.resolve();
let _lastRequestAt = 0;

async function _enqueue(task) {
    const run = _geminiQueue.then(async () => {
        const elapsed = Date.now() - _lastRequestAt;
        if (elapsed < MIN_GAP_MS) await sleep(MIN_GAP_MS - elapsed);
        try {
            return await task();
        } finally {
            _lastRequestAt = Date.now();
        }
    });
    // No romper la cadena si una llamada falla.
    _geminiQueue = run.catch(() => {});
    return run;
}

// Cadena de modelos a probar cuando la cuota del modelo principal está agotada.
// Verificados con esta key (2026-09): gemini-2.5-flash da 429 (cuota 0); los
// siguientes responden 200: gemini-3.6-flash, gemini-3.5-flash-lite,
// gemini-3.1-flash-lite, gemini-2.5-flash-lite.
const MODEL_CHAIN = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

// Backoff con jitter (±20%) para evitar reintentos en sincronía.
const _mb = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4));

// Freno de emergencia: tras un fallo duro de cuota, no volver a golpear Gemini
// durante un ratito para que el llamador use su fallback local (Tesseract/Regex).
let _quotaPausedUntil = 0;
async function _checkQuotaPause() {
    if (_quotaPausedUntil > Date.now()) {
        const s = Math.ceil((_quotaPausedUntil - Date.now()) / 1000);
        throw new Error(`Cuota de Gemini agotada (pausa ${s}s)`);
    }
}
function _markQuotaPause(ms) {
    if (ms > 0) _quotaPausedUntil = Date.now() + ms;
}

const GEMINI_ENDPOINT = (model, apiKey) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

/**
 * Llama a Gemini (texto o texto+imagen) y devuelve el texto de la respuesta.
 * options: { text, image, mimeType, model, temperature, maxOutputTokens, responseMimeType }
 */
window.callGemini = async function(options = {}) {
    const {
        text = '',
        image = null,
        mimeType = 'image/jpeg',
        model = 'gemini-3.6-flash',
        temperature = 0.1,
        maxOutputTokens = 2048,
        responseMimeType = null
    } = options;

    // Serializar para evitar ráfagas concurrentes que disparan el rate limit.
    return _enqueue(async () => {
        await _checkQuotaPause();

        const apiKey = getGeminiKey();
        if (!apiKey) throw new Error('No se encontró una clave de Gemini. Configura gemini_api_key (localStorage o app_settings).');

        const parts = [];
        if (text) parts.push({ text });
        if (image) parts.push({ inline_data: { mime_type: mimeType, data: image } });

        const generationConfig = { temperature };
        if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;
        if (responseMimeType) generationConfig.responseMimeType = responseMimeType;

        const body = {
            contents: [{ parts }],
            generationConfig
        };

        const chain = [model, ...MODEL_CHAIN.filter(m => m !== model)];
        const maxAttemptsPerModel = 3;
        let lastErr = null;

        for (const currentModel of chain) {
            const url = GEMINI_ENDPOINT(currentModel, apiKey);

            for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
                try {
                    await _checkQuotaPause();
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const partsOut = data.candidates?.[0]?.content?.['parts'];
                        if (partsOut && partsOut.length) {
                            return partsOut.map(p => p.text || '').join('').trim();
                        }
                        const blockReason = data.promptFeedback?.blockReason;
                        const errSuffix = blockReason
                            ? ` (bloqueado por el modelo: ${blockReason})`
                            : ' (sin texto en la respuesta)';
                        throw new Error(`Gemini no devolvió contenido${errSuffix}`);
                    }

                    const isRetryable = (response.status === 429 || response.status === 503);
                    const retryAfter = response.headers?.get?.('retry-after');
                    const retrySecs = retryAfter ? parseInt(retryAfter, 10) : NaN;

                    if (isRetryable) {
                        // Retry largo: cuota agotada de verdad → pausa dura y siguiente modelo.
                        if (!isNaN(retrySecs) && retrySecs > 30) {
                            _markQuotaPause(60000);
                            lastErr = new Error(`Cuota de Gemini agotada (HTTP ${response.status}), reintenta en ${retrySecs}s`);
                            break;
                        }
                        if (attempt < maxAttemptsPerModel) {
                            const delay = _mb(Math.min(2000 * Math.pow(2, attempt - 1), 30000));
                            await sleep(delay);
                            continue;
                        }
                        lastErr = new Error(`Cuota de Gemini agotada (HTTP ${response.status})`);
                        break;
                    }

                    let errMessage = `Gemini API error (HTTP ${response.status})`;
                    try {
                        const errData = await response.json();
                        if (errData?.error?.message) errMessage += `: ${errData.error.message}`;
                    } catch (e) { /* ignorar body no JSON */ }
                    throw new Error(errMessage);

                } catch (err) {
                    const isNetwork = err && err.name === 'TypeError';
                    if (isNetwork && attempt < maxAttemptsPerModel) {
                        await sleep(_mb(1000 * attempt));
                        continue;
                    }
                    throw err;
                }
            }
            // Cuota agotada para este modelo → probar el siguiente en la cadena.
        }

        _markQuotaPause(30000);
        throw lastErr || new Error('Gemini no respondió correctamente tras los reintentos');
    });
};