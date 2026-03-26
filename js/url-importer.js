/**
 * URLImporter v2 - Con debugging y fallback mejorado (v433)
 * Extrae recetas de URLs públicas (Dropbox, Drive, YouTube, TikTok)
 * Versión Literal del Blueprint de Usuario Adaptada para Supabase Engine.
 */

class URLImporter {
  /**
   * Importar receta desde URL
   * @param {string} url - URL pública
   * @returns {Promise<{type, platform, content, metadata, sourceType}>}
   */
  static async import(url) {
    try {
      const platform = this.detectPlatform(url);
      console.log(`🔗 [URLImporter] Plataforma detectada: ${platform}`);
      
      if (!platform) {
        throw new Error('URL no válida o plataforma no soportada');
      }

      let result;
      
      switch (platform) {
        case 'googledrive':
          result = await this.importFromGoogleDrive(url);
          break;
        case 'dropbox':
          result = await this.importFromDropbox(url);
          break;
        case 'youtube':
          result = await this.importFromYouTube(url);
          break;
        case 'tiktok':
          result = await this.importFromTikTok(url);
          break;
        default:
          throw new Error(`Plataforma no soportada: ${platform}`);
      }

      console.log(`✅ [URLImporter] Contenido extraído:`, {
        type: result.type,
        platform: result.platform,
        sourceType: result.sourceType,
        contentLength: (result.content && (result.content.length || result.content.size)) || 0
      });

      return result;
    } catch (error) {
      console.error('❌ [URLImporter] Error:', error);
      throw error;
    }
  }

  /**
   * Detectar plataforma desde URL
   */
  static detectPlatform(url) {
    if (!url || typeof url !== 'string') return null;

    const urlLower = url.toLowerCase().trim();

    if (urlLower.includes('drive.google.com') || urlLower.includes('docs.google.com')) {
      return 'googledrive';
    }
    if (urlLower.includes('dropbox.com')) {
      return 'dropbox';
    }
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return 'youtube';
    }
    if (urlLower.includes('tiktok.com') || urlLower.includes('vt.tiktok.com') || urlLower.includes('vm.tiktok.com')) {
      return 'tiktok';
    }

    return null;
  }

  /**
   * Importar desde Google Drive
   */
  static async importFromGoogleDrive(url) {
    console.log(`📥 [GoogleDrive] Intentando importar...`);
    const fileId = this.extractGoogleDriveFileId(url);
    if (!fileId) throw new Error('ID de archivo de Google Drive no válido');

    // Usamos el Supabase Engine v33 (Proxy para evitar CORS)
    return await this.supabaseProxyImport(url, 'googledrive');
  }

  static extractGoogleDriveFileId(url) {
    const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/) || url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  /**
   * Importar desde Dropbox
   */
  static async importFromDropbox(url) {
    console.log(`📥 [Dropbox] Intentando importar...`);
    
    // v435: Asegurar link de descarga directa (?dl=1)
    let directUrl = url;
    if (url.includes('dropbox.com') && !url.includes('dl=1')) {
        directUrl = url.includes('?') ? url.replace(/dl=[0-9]/, 'dl=1') : url + '?dl=1';
        if (!directUrl.includes('dl=1')) directUrl += '&dl=1';
    }
    console.log(`🔄 [Dropbox] URL Final: ${directUrl}`);

    // v446: Intento de Descarga Directa desde el cliente (Bypass Proxy para archivos)
    try {
        const res = await fetch(directUrl);
        if (res.ok) {
            const blob = await res.blob();
            const type = blob.type;
            const extension = directUrl.split('/').pop().split('?')[0].split('.').pop().toLowerCase();

            console.log(`✅ [Dropbox] Descarga directa exitosa. Type: ${type}, Ext: ${extension}`);

            // Si es texto o RTF, lo tratamos como texto para Gemini
            if (type.includes('text') || extension === 'rtf' || extension === 'txt' || extension === 'md') {
                const text = await blob.text();
                // Limpieza básica de RTF (rudimentaria)
                const cleanText = extension === 'rtf' ? text.replace(/\\([a-z]{1,32})(-?\d+)? ?/g, '').replace(/\{|\}/g, '') : text;
                
                return {
                    type: 'text',
                    platform: 'dropbox',
                    content: cleanText,
                    metadata: { url, title: directUrl.split('/').pop().split('?')[0] },
                    sourceType: 'description'
                };
            }

            // Si es imagen o PDF, lo devolvemos como archivo para OCR/Vision
            return {
                type: 'file',
                platform: 'dropbox',
                content: blob,
                metadata: { url, title: directUrl.split('/').pop().split('?')[0] },
                sourceType: type.startsWith('image/') ? 'image' : 'pdf'
            };
        }
    } catch (e) {
        console.warn(`⚠️ [Dropbox] Fallo descarga directa (CORS?), usando proxy...`, e);
    }

    // Usamos el Supabase Engine v33 (Proxy para evitar CORS) si el directo falla
    return await this.supabaseProxyImport(directUrl, 'dropbox');
  }

  /**
   * Importar desde YouTube
   */
  static async importFromYouTube(url) {
    console.log(`📥 [YouTube] Intentando importar...`);
    const videoId = this.extractYouTubeVideoId(url);
    if (!videoId) throw new Error('ID de video de YouTube no válido');
    console.log(`🔄 [YouTube] Video ID: ${videoId}`);

    try {
        // En este proyecto usamos Supabase como backend
        return await this.supabaseProxyImport(url, 'youtube');
    } catch (error) {
        console.warn(`⚠️ [YouTube] API respondió error, usando fallback...`);
        return await this.youTubeFallback(url, videoId);
    }
  }

  /**
   * Importar desde TikTok
   */
  static async importFromTikTok(url) {
    console.log(`📥 [TikTok] Intentando importar...`);
    try {
        return await this.supabaseProxyImport(url, 'tiktok');
    } catch (error) {
        console.warn(`⚠️ [TikTok] API respondió error, usando fallback...`);
        return await this.tiktokFallback(url);
    }
  }

  /**
   * Supabase Proxy Import - El motor real que hace el scraping.
   */
  static async supabaseProxyImport(url, platform) {
    const SUPABASE_URL = window.SUPABASE_URL || 'https://fsgfrqrerddmopojjcsw.supabase.co';
    const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/fetch-url`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ url })
    });

    if (!response.ok) {
        throw new Error(`API respondió ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ [${platform.charAt(0).toUpperCase() + platform.slice(1)}] Proxy Metadata:`, data.error ? data.error : 'OK');

    // Si ya está estructurado por el servidor
    if (data.isStructured && data.recipe) {
        return {
            type: 'structured',
            platform: platform,
            content: data.recipe,
            metadata: { url, title: data.recipe.nombre },
            sourceType: 'ai-server'
        };
    }

    // Si devuelve un archivo (PDF/Imagen) para OCR local
    if (data.downloadUrl && platform !== 'youtube' && platform !== 'tiktok') {
        const fileRes = await fetch(data.downloadUrl);
        const blob = await fileRes.blob();
        return {
            type: 'file',
            platform: platform,
            content: blob,
            metadata: { url, title: data.title || platform },
            sourceType: blob.type.startsWith('image/') ? 'image' : 'pdf'
        };
    }

    // Si devuelve texto (Descripción/Subtítulos) para IA local
    if (data.content || data.description) {
        const textContent = data.content || (data.title ? `Título: ${data.title}\n\n${data.description}` : data.description);
        return {
            type: 'text',
            platform: platform,
            content: textContent,
            metadata: { url, title: data.title || platform },
            sourceType: data.subtitles ? 'subtitles' : 'description'
        };
    }

    throw new Error("No se detectó contenido para extraer.");
  }

  /**
   * Fallback para YouTube: enviar URL a Gemini directamente
   */
  static async youTubeFallback(url, videoId) {
    console.log(`🔄 [YouTube] Fallback: enviando prompt de texto a Gemini...`);
    return {
      type: 'text',
      platform: 'youtube',
      content: `[SISTEMA: El motor de extracción falló. NO ALUCINES. Si no conoces la receta exacta de este video específico (${url}), responde simplemente con el nombre del video si lo sabes, y dile al usuario que no pudiste extraer los ingredientes automáticamente y que los ingrese a mano. No inventes ingredientes.]\n\nExtraer receta del video: ${url}`,
      metadata: { url, title: `YouTube Video (${videoId})` },
      sourceType: 'description'
    };
  }

  /**
   * Fallback para TikTok
   */
  static async tiktokFallback(url) {
    console.log(`🔄 [TikTok] Fallback: enviando prompt de texto a Gemini...`);
    return {
      type: 'text',
      platform: 'tiktok',
      content: `[SISTEMA: El motor de extracción falló. NO ALUCINES. Si no conoces la receta exacta del TikTok (${url}), pide al usuario que pegue el texto manualmente. No inventes ingredientes.]\n\nExtrae la receta del TikTok: ${url}`,
      metadata: { url, title: 'TikTok Video' },
      sourceType: 'description'
    };
  }

  /**
   * Extraer VIDEO_ID de YouTube
   */
  static extractYouTubeVideoId(url) {
    const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }
}

window.URLImporter = URLImporter;
