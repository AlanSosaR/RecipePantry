/**
 * URL Importer - Recipe Pantry v1.0
 * Extracts recipes from URLs using Supabase Edge Function + Gemini
 */

const URL_IMPORTER_CONFIG = {
    EDGE_FUNCTION_URL: 'https://fsgfrqrerddmopojjcsw.supabase.co/functions/v1/fetch-url',
    GEMINI_MODEL: 'gemini-2.5-flash-lite'
};

class URLImporter {

    /**
     * Import a recipe from a URL
     * @param {string} url - The URL to extract from
     * @param {function} onProgress - Progress callback
     * @returns {Promise<object>} - Structured recipe data
     */
    async importFromURL(url, onProgress) {
        // 1. Validate URL
        try {
            new URL(url);
        } catch {
            throw new Error('URL inválida. Verifica el formato del enlace.');
        }

        if (onProgress) onProgress({ status: 'fetching', progress: 0.1, message: 'Descargando contenido...' });

        // 2. Fetch page content via Edge Function
        let pageData;
        try {
            const response = await fetch(URL_IMPORTER_CONFIG.EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Error ${response.status}`);
            }

            pageData = await response.json();
        } catch (err) {
            if (err.message.includes('Failed to fetch')) {
                throw new Error('No se pudo conectar al servidor. Verifica tu conexión.');
            }
            throw new Error(`No se pudo acceder al enlace: ${err.message}`);
        }

        if (!pageData.text || pageData.text.trim().length < 50) {
            throw new Error('No se encontró contenido suficiente en esa página. Intenta con otro enlace.');
        }

        if (onProgress) onProgress({ status: 'analyzing', progress: 0.4, message: 'Analizando contenido con IA...' });

        // 3. Send to Gemini for recipe extraction
        const apiKey = typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : '';
        if (!apiKey) throw new Error('API key no configurada.');

        const geminiPrompt = `You are an expert culinary assistant. You will receive the text content extracted from a webpage.
Your job is to find and extract the recipe from this content. 

CRITICAL: For TikTok, Instagram, or YouTube videos, the recipe is ALMOST ALWAYS in the "TITULO" or "DESCRIPCION" fields provided below. 
Analyze these fields first for ingredients and preparation steps. 
If the description contains ingredients but not all steps, look for the rest in "CONTENIDO DE LA PÁGINA".

The content may contain ads and irrelevant text — ignore it.
If NO recipe is found, return: {"error": "No se encontró una receta en esta página."}

Rules:
- Recipe name is usually the main title or heading
- Ingredients always have a quantity + optional unit + ingredient name
- Steps are complete cooking instructions
- If servings are not mentioned, default to 4
- Translate everything to Spanish if the original is in another language
- Never invent ingredients or steps not present in the original content

Return ONLY this JSON, no markdown, no explanation:
{
  "nombre": "Recipe name in Spanish",
  "porciones": 4,
  "ingredientes": [
    { "cantidad": "300", "unidad": "g", "nombre": "ingredient name" }
  ],
  "pasos": [
    "Step as a clean complete sentence in Spanish."
  ]
}

Page title: ${pageData.title || 'Unknown'}
Page URL: ${url}

PAGE CONTENT:
${pageData.text}`;


        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${URL_IMPORTER_CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;

        if (onProgress) onProgress({ status: 'structuring', progress: 0.6, message: 'Estructurando receta...' });

        let geminiResponse;
        const maxRetries = 3;
        let backoff = 2500;

        for (let i = 0; i < maxRetries; i++) {
            try {
                geminiResponse = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: geminiPrompt }] }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" }
                    })
                });

                if (geminiResponse.status === 429) {
                    console.warn(`⚠️ Gemini 429. Reintentando en ${backoff}ms...`);
                    await new Promise(r => setTimeout(r, backoff));
                    backoff *= 2;
                    continue;
                }

                break;
            } catch (err) {
                if (i === maxRetries - 1) throw err;
                await new Promise(r => setTimeout(r, backoff));
                backoff *= 2;
            }
        }

        if (!geminiResponse || !geminiResponse.ok) {
            throw new Error('La IA no pudo procesar el contenido. Intenta de nuevo en unos segundos.');
        }

        const data = await geminiResponse.json();
        let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
            throw new Error('La IA no devolvió resultados. Intenta con otro enlace.');
        }

        // Parse JSON
        textResponse = textResponse.replace(/```json|```/g, '').trim();
        const start = textResponse.indexOf('{');
        const end = textResponse.lastIndexOf('}');

        if (start === -1 || end === -1) {
            throw new Error('No se pudo extraer una receta de esa página.');
        }

        const parsed = JSON.parse(textResponse.substring(start, end + 1));

        if (parsed.error) {
            throw new Error(parsed.error);
        }

        if (onProgress) onProgress({ status: 'finalizing', progress: 0.9, message: 'Finalizando...' });

        // Calculate confidence
        let score = 100;
        if (!parsed.nombre || parsed.nombre.trim().length < 3) score -= 10;
        if (!parsed.ingredientes || parsed.ingredientes.length === 0) score -= 20;
        if (!parsed.pasos || parsed.pasos.length < 2) score -= 5;
        if (score < 0) score = 0;

        if (onProgress) onProgress({ status: 'completado', progress: 1.0, message: '¡Lista!' });

        return {
            ...parsed,
            texto: `Extraído de: ${url}`,
            confidence: score,
            success: true,
            version: 'v1.0-url-import',
            method: 'url-import-gemini',
            isStructured: true
        };
    }
}

window.urlImporter = new URLImporter();
