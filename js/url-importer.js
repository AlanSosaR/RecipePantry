/**
 * url-importer.js - Logic for importing recipes from URLs (Web, YouTube, TikTok, Drive, Dropbox)
 * v362_drive_dropbox
 */

const URLImporter = {
    /**
     * Imports a recipe from a URL using a Supabase Edge Function and OpenRouter
     * @param {string} url - The URL to import from
     * @param {function} onProgress - Callback for progress updates
     */
    importFromURL: async function(url, onProgress) {
        try {
            if (onProgress) onProgress({ status: 'fetching', progress: 0.1, message: 'Conectando con el servidor...' });

            // 1. Fetch content from our scraping edge function
            const SUPABASE_URL = Config.SUPABASE_URL;
            const SUPABASE_ANON_KEY = Config.SUPABASE_ANON_KEY;

            if (onProgress) onProgress({ status: 'fetching', progress: 0.2, message: 'Extrayendo contenido...' });

            const response = await fetch(`${SUPABASE_URL}/functions/v1/fetch-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Error al extraer el contenido del enlace.');
            }

            const pageData = await response.json();

            if (!pageData.text || pageData.text.trim().length < 50) {
                throw new Error('No se encontró contenido suficiente (ni transcripción ni descripción). Intenta con otro enlace o verifica que el archivo sea público.');
            }

            const isVideo = pageData.isVideo || false;
            const isCloudDoc = pageData.isCloudDoc || false;
            
            let analysisMsg = 'Analizando contenido con IA...';
            let structuringMsg = 'Estructurando receta...';
            
            if (isVideo) {
                analysisMsg = 'Transcribiendo vídeo...';
                structuringMsg = 'Estructurando pasos de la receta...';
            } else if (isCloudDoc) {
                analysisMsg = 'Leyendo documento de la nube...';
                structuringMsg = 'Estructurando contenido del documento...';
            }

            if (onProgress) onProgress({ status: 'analyzing', progress: 0.4, message: analysisMsg });

            // 2. Send to OpenRouter for recipe extraction
            if (onProgress) onProgress({ status: 'structuring', progress: 0.6, message: structuringMsg });

            let prompt;
            if (isVideo) {
                prompt = `Eres un experto culinario. Vas a recibir una TRANSCRIPCIÓN DE AUDIO o DESCRIPCIÓN de un vídeo de cocina (YouTube/TikTok).
Tu trabajo es extraer la receta estructurada de este texto.

REGLAS:
- Identifica los ingredientes exactos (cantidad + unidad + nombre).
- Si la transcripción es "sucia" (sin signos de puntuación), límpiala y dale sentido lógico.
- Divide los pasos de preparación de forma clara.
- Si no hay receta, devuelve: {"error": "No se pudo extraer una receta clara de este vídeo."}
- Devuelve SOLO JSON en ESPAÑOL.

TÍTULO DEL VÍDEO: ${pageData.title || 'Unknown'}
URL: ${url}

CONTENIDO:\n${pageData.text}`;
            } else if (isCloudDoc) {
                prompt = `Eres un experto culinario. Vas a recibir el contenido de un DOCUMENTO (Google Drive/Dropbox).
Tu trabajo es encontrar la receta en este texto y estructurarla.

REGLAS:
- Identifica nombre, ingredientes y pasos.
- Ignora metadatos o texto irrelevante.
- Devuelve SOLO JSON en ESPAÑOL.

TÍTULO DEL ARCHIVO: ${pageData.title || 'Unknown'}
URL: ${url}

CONTENIDO:\n${pageData.text}`;
            } else {
                prompt = `You are an expert culinary assistant. You will receive the text content extracted from a webpage.
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

PAGE CONTENT:\n${pageData.text}`;
            }

            const apiKey = getOpenRouterKey();
            if (!apiKey) throw new Error("Se requiere una clave de OpenRouter para continuar.");

            const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Recipe Pantry"
                },
                body: JSON.stringify({
                    model: "google/gemini-flash-1.5",
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (!aiResponse.ok) {
                const status = aiResponse.status;
                throw new Error(`Error en la comunicación con la IA (Status: ${status}).`);
            }

            const aiData = await aiResponse.json();
            const rawContent = aiData.choices[0].message.content;
            
            // Clean JSON response (OpenRouter sometimes wraps it in markdown)
            const cleanJson = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
            const recipe = JSON.parse(cleanJson);

            if (recipe.error) throw new Error(recipe.error);

            if (onProgress) onProgress({ status: 'done', progress: 1.0, message: '¡Receta lista!' });

            return {
                ...recipe,
                source_url: url,
                servings: recipe.servings || 4
            };

        } catch (error) {
            console.error('URL Import error:', error);
            throw error;
        }
    }
};

// Expose globally for ocr.html
window.urlImporter = URLImporter;

// No global helper here - already provided by ocr-processor.js


