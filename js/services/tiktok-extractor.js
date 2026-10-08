/**
 * TikTok Extractor Service (v502)
 * Extrae descripción (caption) y creador de videos de TikTok.
 * Con fallback al microservicio local recipe-transcriber-api.
 */

export async function extractFromTikTok(videoUrl) {
  try {
    console.log(`📥 [TikTok] Intentando importar: ${videoUrl}`);
    let caption = '';
    let creator = '';
    let hashtags = [];
    let structuredRecipe = null;
    let transcript = '';

    // 1. Intentar obtener metadatos desde el backend proxy (/api/tiktok-metadata)
    try {
      const metaResp = await fetch('/api/tiktok-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl })
      });
      
      if (metaResp.ok) {
        const meta = await metaResp.json();
        caption = meta.caption || '';
        creator = meta.creator || '';
        hashtags = meta.hashtags || [];
      }
    } catch (netErr) {
      console.warn('⚠️ [TikTok] Endpoint /api/tiktok-metadata no disponible en entorno local.');
    }
    
    // 2. Fallback a microservicio local de transcripción (recipe-transcriber-api)
    if (!caption) {
      try {
        const localApi = await fetchFromLocalTranscriberApi(videoUrl);
        if (localApi && localApi.success) {
          if (localApi.recipe && (localApi.recipe.nombre || localApi.recipe.name)) {
            structuredRecipe = localApi.recipe;
          }
          if (localApi.transcription) {
            transcript = localApi.transcription;
          }
          console.log('✅ [TikTok] Datos recuperados desde recipe-transcriber-api local');
        }
      } catch (e) {}
    }

    const contentParts = [];
    if (creator) contentParts.push(`Creador: ${creator}`);
    if (caption) contentParts.push(`Descripción: ${caption}`);
    if (hashtags && hashtags.length > 0) contentParts.push(`Hashtags: ${hashtags.join(', ')}`);
    if (transcript) contentParts.push(`Transcripción: ${transcript}`);
    if (structuredRecipe && (structuredRecipe.descripcion || structuredRecipe.nombre)) {
      contentParts.push(`Receta: ${structuredRecipe.nombre}\n${structuredRecipe.descripcion || ''}`);
    }
    
    const content = contentParts.join('\n');
    
    if (!content && !structuredRecipe) {
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
      structuredRecipe: structuredRecipe || null,
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

async function fetchFromLocalTranscriberApi(videoUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const response = await fetch('http://localhost:8000/extract-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}
