/**
 * YouTube Extractor Service
 * Extrae título, descripción y transcripción de videos de YouTube.
 */

export async function extractFromYouTube(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error('URL de YouTube no válida');
    
    console.log(`📥 [YouTube] Procesando video ID: ${videoId}`);

    // Intentar obtener metadatos (título y descripción)
    let title = '';
    let description = '';
    let transcript = null;

    try {
      const metaResp = await fetch('/api/youtube-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      
      if (metaResp.ok) {
        const meta = await metaResp.json();
        title = meta.title || '';
        description = meta.description || '';
        
        // v476: Filtrar contenido basura (Consent Page)
        const isGeneric = description.toLowerCase().includes('disfruta de los v') || 
                         description.toLowerCase().includes('enjoy the videos');
        
        if (isGeneric || meta.isPotentialBlock) {
          console.warn('⚠️ [YouTube] Bloqueo detectado o descripción genérica. Descartando metadatos.');
          description = '';
          if (title.toLowerCase().includes('- youtube')) title = '';
        }

        console.log(`📊 [YouTube] Metadatos obtenidos: Title(${title.length}), Desc(${description.length})`);
      } else {
        console.error(`❌ [YouTube] Error en API de Metadatos: ${metaResp.status}`);
      }
    } catch (e) {
      console.warn('⚠️ [YouTube] Error al obtener metadatos del servidor:', e);
    }

    // Intentar obtener la transcripción
    try {
      const transcriptResp = await fetch('/api/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      
      if (transcriptResp.ok) {
        const data = await transcriptResp.json();
        transcript = data.transcript;
        console.log(`📜 [YouTube] Transcripción obtenida: ${transcript ? transcript.length : 0} caracteres`);
      } else {
        console.warn(`⚠️ [YouTube] Falló Transcripción: ${transcriptResp.status}`);
      }
    } catch (e) {
      console.warn('⚠️ [YouTube] No se pudo obtener la transcripción:', e);
    }

    // Fallback: Si no hay título o descripción del servidor, intentar con YouTube Data API si hay key
    if (!title && !description) {
      const apiKey = localStorage.getItem('youtube_api_key');
      if (apiKey) {
        try {
          const apiResp = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet`
          );
          const data = await apiResp.json();
          if (data.items && data.items[0]) {
            const snippet = data.items[0].snippet;
            title = snippet.title;
            description = snippet.description;
          }
        } catch (e) {
          console.warn('⚠️ [YouTube] Falló la API de Google:', e);
        }
      }
    }

    // Combinar todo el contenido extraído
    const contentParts = [];
    if (title) contentParts.push(`Título: ${title}`);
    if (description) contentParts.push(`Descripción: ${description}`);
    if (transcript) contentParts.push(`Transcripción:\n${transcript}`);
    
    const content = contentParts.join('\n\n');
    
    if (!content) {
      throw new Error('No se pudo extraer ningún contenido del video de YouTube');
    }
    
    return {
      type: 'video',
      platform: 'youtube',
      title: title || 'YouTube Video',
      description: description || '',
      transcript: transcript,
      content: content,
      sourceUrl: videoUrl,
      success: true
    };
    
  } catch (error) {
    console.error('❌ Error en extractor de YouTube:', error);
    return {
      type: 'error',
      platform: 'youtube',
      error: error.message,
      sourceUrl: videoUrl,
      success: false
    };
  }
}

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
