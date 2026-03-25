/**
 * url-importer.js - Simplified logic delegating AI structuring to the server
 * v373_rtf_support
 */

const URLImporter = {
    /**
     * Imports a recipe from a URL using a Supabase Edge Function (now handles AI server-side)
     * @param {string} url - The URL to import from
     * @param {function} onProgress - Callback for progress updates
     */
    importFromURL: async function(url, onProgress) {
        try {
            if (onProgress) onProgress({ status: 'fetching', progress: 0.2, message: 'Conectando con el servidor...' });

            const SUPABASE_URL = Config.SUPABASE_URL;
            const SUPABASE_ANON_KEY = Config.SUPABASE_ANON_KEY;
            
            const apiKey = typeof getOpenRouterKey === 'function' ? getOpenRouterKey() : null;
            if (!apiKey) throw new Error("Se requiere una clave de OpenRouter válida.");

            if (onProgress) onProgress({ status: 'processing', progress: 0.5, message: 'Extrayendo y analizando con IA...' });

            const response = await fetch(`${SUPABASE_URL}/functions/v1/fetch-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ url, apiKey })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Error del servidor (Status: ${response.status})`);
            }

            const result = await response.json();

            // Handle OpenRouter specific errors returned in JSON
            if (result.error === "OpenRouter Error") {
                console.error("OpenRouter Error Details:", result.details);
                throw new Error(`IA Error (${result.status}): ${result.details || 'Error estructurando'}`);
            }

            // Handle AI Structure Failure (New in v11)
            if (result.error === "AI Structure Failure") {
                console.error("AI returned text but parsing failed:", result.raw_ai);
                throw new Error(`IA No Estructuró: ${result.raw_ai?.substring(0, 100) || 'Contenido inválido'}`);
            }

            if (result.success && result.nombre) {
                if (onProgress) onProgress({ status: 'done', progress: 1.0, message: '¡Receta lista!' });
                return {
                    ...result,
                    source_url: url,
                    servings: result.servings || 4
                };
            }

            if (result.text) {
                 // Try parsing if it's a known error from AI
                 if (result.text.includes('"error"')) {
                    try {
                        const errObj = JSON.parse(result.text);
                        if (errObj.error) throw new Error(`IA dice: ${errObj.error}`);
                    } catch(e) {}
                 }
                 throw new Error("El sistema extrajo el contenido pero la IA no detectó una receta clara. Intenta con otro enlace.");
            }

            throw new Error("No se pudo extraer contenido del enlace. Verifica que sea público.");

        } catch (error) {
            console.error('URL Import error:', error);
            throw error;
        }
    }
};

window.urlImporter = URLImporter;
