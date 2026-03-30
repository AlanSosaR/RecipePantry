/**
 * TikTok Extractor Service
 * Extrae descripción (caption) y creador de videos de TikTok.
 */

export async function extractFromTikTok(videoUrl) {
  try {
    console.log(`📥 [TikTok] Intentando importar: ${videoUrl}`);

    // TikTok bloquea CORS, por lo que necesitamos un proxy del servidor
    const metaResp = await fetch('/api/tiktok-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl })
    });
    
    if (!metaResp.ok) {
      throw new Error('No se pudo obtener metadatos de TikTok desde el servidor');
    }
    
    const meta = await metaResp.json();
    const { caption, creator, hashtags } = meta;
    
    const contentParts = [];
    if (creator) contentParts.push(`Creador: ${creator}`);
    if (caption) contentParts.push(`Descripción: ${caption}`);
    if (hashtags && hashtags.length > 0) contentParts.push(`Hashtags: ${hashtags.join(', ')}`);
    
    const content = contentParts.join('\n');
    
    if (!content) {
      throw new Error('No se encontró contenido relevante en el video de TikTok');
    }
    
    return {
      type: 'video',
      platform: 'tiktok',
      caption: caption || '',
      creator: creator || '',
      hashtags: hashtags || [],
      content: content,
      sourceUrl: videoUrl,
      success: true
    };
    
  } catch (error) {
    console.error('❌ Error en extractor de TikTok:', error);
    return {
      type: 'error',
      platform: 'tiktok',
      error: error.message,
      sourceUrl: videoUrl,
      success: false
    };
  }
}
