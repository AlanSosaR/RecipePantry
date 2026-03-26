/**
 * URLImporter - Extrae recetas de URLs públicas (Dropbox, Drive, YouTube, TikTok)
 * Versión: v430 (Standardized Class Architecture)
 * Engine: Supabase fetch-url v33
 */

class URLImporter {
    /**
     * Importar receta desde URL
     * @param {string} url - URL pública
     * @param {function} onProgress - Callback para progreso
     * @param {string} lang - Idioma ('es'|'en')
     */
    static async import(url, onProgress, lang = 'es') {
        try {
            const platform = this.detectPlatform(url);
            if (!platform) throw new Error('URL no válida o plataforma no soportada');

            if (onProgress) onProgress({ status: 'fetching', progress: 0.2, message: `Detectada plataforma: ${platform}...` });

            // Supabase Credentials (v422+)
            const SUPABASE_URL = window.SUPABASE_URL || (window.Config && window.Config.SUPABASE_URL);
            const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || (window.Config && window.Config.SUPABASE_ANON_KEY);
            
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                throw new Error("Configuración de Supabase no encontrada.");
            }

            if (onProgress) onProgress({ status: 'processing', progress: 0.5, message: 'Extrayendo y analizando con IA...' });

            // Llamada al motor v33 de Supabase
            const response = await fetch(`${SUPABASE_URL}/functions/v1/fetch-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ url, lang })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Error del servidor: ${response.status}`);
            }

            const data = await response.json();

            // Validar si la IA estructuró la receta
            if (!data.isStructured || !data.recipe) {
                console.error("❌ IA No Estructuró:", data.content);
                throw new Error(data.content || "No se pudo extraer una receta clara.");
            }

            return {
                success: true,
                platform: platform,
                recipe: data.recipe,
                metadata: {
                    url: url,
                    source: platform,
                    extracted_at: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('❌ URLImporter Error:', error);
            throw error;
        }
    }

    /**
     * Detectar plataforma desde URL
     */
    static detectPlatform(url) {
        if (!url || typeof url !== 'string') return null;
        const urlLower = url.toLowerCase().trim();

        if (urlLower.includes('drive.google.com') || urlLower.includes('docs.google.com')) return 'googledrive';
        if (urlLower.includes('dropbox.com')) return 'dropbox';
        if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
        if (urlLower.includes('tiktok.com')) return 'tiktok';

        return 'generic';
    }
}

// Global exposure for legacy compatibility
window.URLImporter = URLImporter;
