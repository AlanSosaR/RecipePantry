/**
 * URL Importer - Recipe Pantry v1.0
 * Extracts recipes from URLs using Supabase Edge Function + Gemini
 */

const URL_IMPORTER_CONFIG = {
    EDGE_FUNCTION_URL: 'https://fsgfrqrerddmopojjcsw.supabase.co/functions/v1/fetch-url'
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

        // 3. Send to OpenRouter for recipe extraction
        if (onProgress) onProgress({ status: 'structuring', progress: 0.6, message: 'Estructurando receta...' });

        const prompt = `You are an expert culinary assistant. You will receive the text content extracted from a webpage.
Your job is to find and extract the recipe from this content. 

The content may contain ads and irrelevant text — ignore it.
If NO recipe is found, return: {"error": "No se encontró una receta en esta página."}

Rules:
- Recipe name is usually the main title or heading
- Ingredients: quantity + unit + name
- Steps: dry, clear sentences
- Default to 4 servings
- Return ONLY JSON in Spanish

Page title: ${pageData.title || 'Unknown'}
Page URL: ${url}

PAGE CONTENT:
${pageData.text}`;

        const apiKey = getOpenRouterKey();
        if (!apiKey) throw new Error("Se requiere una clave de OpenRouter para continuar.");

        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://recipepantry.app',
                'X-Title': 'Recipe Pantry'
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                max_tokens: 4096,
                temperature: 0.1
            })
        });

        if (!response || !response.ok) {
            throw new Error('La IA no pudo procesar el contenido. Intenta de nuevo en unos segundos.');
        }

        const data = await response.json();
        const textResponse = data.choices[0].message.content;

        if (!textResponse) {
            throw new Error('La IA no devolvió resultados. Intenta con otro enlace.');
        }

        const parsed = JSON.parse(textResponse.replace(/```json|```/g, '').trim());

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
