/**
 * URLImporter v3 - Modular Orchestrator
 * Extrae recetas de URLs públicas (Dropbox, Drive, YouTube, TikTok) orchestrando servicios específicos.
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
          const { GDriveExtractor } = await import('./services/gdrive-extractor.js');
          result = await GDriveExtractor.extract(url);
          break;
        case 'dropbox':
          const { DropboxExtractor } = await import('./services/dropbox-extractor.js');
          result = await DropboxExtractor.extract(url);
          break;
        case 'youtube':
          const { YouTubeExtractor } = await import('./services/youtube-extractor.js');
          result = await YouTubeExtractor.extract(url);
          break;
        case 'tiktok':
          const { TikTokExtractor } = await import('./services/tiktok-extractor.js');
          result = await TikTokExtractor.extract(url);
          break;
        default:
          throw new Error(`Plataforma no soportada: ${platform}`);
      }

      // Map output to what ocr.html handleUrlImport expects: { type: 'text'|'file'|'structured', platform, content, metadata }
      const mappedResult = this.mapToLegacyFormat(result, url);

      console.log(`✅ [URLImporter] Contenido extraído:`, {
        type: mappedResult.type,
        platform: mappedResult.platform,
        sourceType: mappedResult.sourceType,
        contentLength: (mappedResult.content && (mappedResult.content.length || mappedResult.content.size)) || 0
      });

      return mappedResult;
    } catch (error) {
      console.error('❌ [URLImporter] Error:', error);
      throw error;
    }
  }

  static mapToLegacyFormat(result, originalUrl) {
    if (result.type === 'video') {
         // YouTube or TikTok video mapped to text description
         const contentString = `Título: ${result.title}\nDescripción: ${result.description}\n${result.transcript ? 'Subtítulos: ' + result.transcript : ''}`;
         return {
             type: 'text',
             platform: result.platform,
             content: contentString,
             metadata: { url: originalUrl, title: result.title },
             sourceType: result.transcript ? 'subtitles' : 'description'
         };
    } else if (result.type === 'document') {
         return {
             type: 'text',
             platform: result.platform,
             content: result.content,
             metadata: { url: originalUrl, title: result.metadata || 'Documento' },
             sourceType: 'document'
         };
    } else if (result.type === 'image' || result.type === 'file') {
         return {
             type: 'file',
             platform: result.platform,
             content: result.content, // blob or file id
             metadata: { url: originalUrl, title: result.metadata || 'Archivo' },
             sourceType: result.type
         };
    }
    return result; // Fallback to whatever it is (e.g. structured)
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
}

window.URLImporter = URLImporter;
