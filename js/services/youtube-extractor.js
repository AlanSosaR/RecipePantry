/**
 * YouTube Extractor Service
 * Extrae título, descripción y transcripción de videos de YouTube.
 */

export async function extractFromYouTube(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error('URL de YouTube no válida');
    
    console.log(`📥 [YouTube] Procesando video ID: ${videoId}`);

    // 1. Intentar obtener metadatos (título y descripción)
    let title = '';
    let description = '';
    let transcript = null;
    let source = 'youtube-api';

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
        source = meta.source || 'scrape';
        
        const lowerDesc = description.toLowerCase();
        const isGeneric = lowerDesc.includes('disfruta de los v') || 
                         lowerDesc.includes('enjoy the videos') ||
                         description.length < 50;

        if (isGeneric) {
          console.warn('☢️ [YouTube] BLOQUEO DETECTADO. Intentando Invidious Fallback...');
          description = '';
        }
      }
    } catch (e) {
      console.warn('⚠️ [YouTube] Error metadatos:', e);
    }

    // 2. Intentar obtener la transcripción
    try {
      const transcriptResp = await fetch('/api/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      
      if (transcriptResp.ok) {
        const data = await transcriptResp.json();
        transcript = data.transcript;
        if (data.source) source = `${source}+${data.source}`;
      }
    } catch (e) {
      console.warn('⚠️ [YouTube] Error transcripción:', e);
    }

    // 3. FALLBACK ROBUSTO: Si no hay descripción o transcripción, usar Invidious Direct Client Fallback
    if (!description || !transcript) {
      console.log('🔄 [YouTube] Contenido insuficiente. Probando Invidious Robust Bypass...');
      try {
        const invResp = await fetch(`/api/youtube-invidious-fallback?videoId=${videoId}`);
        if (invResp.ok) {
          const invData = await invResp.json();
          if (invData.success) {
            if (!title || title.includes('- YouTube')) title = invData.title;
            if (!description || description.length < 50) description = invData.description;
            if (!transcript) transcript = invData.captions;
            source = `fallback-${invData.source}`;
            console.log(`✅ [YouTube] Invidious fallback exitoso desde ${invData.instance}`);
          }
        }
      } catch (err) {
        console.error('❌ [YouTube] Invidious fallback también falló');
      }
    }

    // Si aún no hay nada técnico, probar Google Data API si el usuario tiene Key
    if (!description && !transcript) {
      const apiKey = localStorage.getItem('youtube_api_key');
      if (apiKey) {
        try {
          const apiResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet`);
          const data = await apiResp.json();
          if (data.items?.[0]) {
            const snip = data.items[0].snippet;
            title = snip.title;
            description = snip.description;
            source = 'google-data-api';
          }
        } catch (e) {}
      }
    }

    // 4. Combinar y Loguear
    const contentParts = [];
    if (title) contentParts.push(`Título: ${title}`);
    if (description) contentParts.push(`Descripción: ${description}`);
    if (transcript) contentParts.push(`Transcripción:\n${transcript}`);
    
    const content = contentParts.join('\n\n');
    const success = !!title;

    console.log(`📊 [youtube-extractor] Resultado v487:
      ├─ Plataforma: youtube
      ├─ VideoID: ${videoId}
      ├─ Título: ${title?.length || 0} chars
      ├─ Descripción: ${description?.length || 0} chars
      ├─ Subtítulos: ${transcript?.length || 0} chars
      ├─ Fuente: ${source}
      └─ Status: ${success ? '✅ OK' : '❌ FALLIDO'}`);
    
    if (!success) throw new Error('No se pudo extraer contenido de YouTube');

    return {
      type: 'video',
      platform: 'youtube',
      title: title,
      description: description,
      transcript: transcript,
      content: content,
      sourceUrl: videoUrl,
      success: true,
      source: source,
      isLowContent: !description && !transcript
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
