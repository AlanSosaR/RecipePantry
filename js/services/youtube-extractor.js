/**
 * YouTube Extractor Service (v499)
 * ARQUITECTURA DIRECT BROWSER SCRAPER: Intenta obtener el HTML directamente del cliente.
 * v499: Prioriza fetch directo de YouTube.com desde el navegador del usuario.
 */

export async function extractFromYouTube(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error('URL de YouTube no válida');

    console.log(`📡 [YouTube v499] Iniciando Direct Scraper: ${videoId}`);

    // 1. oEmbed (Título - Casi infalible via CORS)
    let title = '';
    try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembed.ok) {
            const data = await oembed.json();
            title = data.title;
            console.log(`✅ [oEmbed] Título: ${title}`);
        }
    } catch (e) {
        console.warn('⚠️ [oEmbed] Error de red:', e.message);
    }

    // 2. SCRAPER DIRECTO DESDE EL NAVEGADOR (IP del usuario)
    let description = '';
    let transcript = '';
    let source = 'client-direct';

    try {
        console.log('🔄 [v499] Intentando fetch directo a YouTube.com...');
        const directData = await fetchYouTubeDescriptionDirect(videoId);
        if (directData && directData.description) {
            description = directData.description;
            title = directData.title || title;
            console.log(`✅ [DirectScraper] Descripción recuperada: ${description.length} chars`);
        } else {
            console.warn('⚠️ [DirectScraper] No se pudo obtener descripción directa (posible bloqueo de CORS)');
        }
    } catch (e) {
        console.error('❌ [DirectScraper] Error fatal:', e.message);
    }

    // 3. FALLBACK SERVIDOR (Si el cliente falló totalmente)
    if (!description) {
        console.warn('⚠️ [v499] Scraper directo falló. Recurriendo a Vercel Cloud Bypass...');
        const serverResult = await fetchYouTubeFromServer(videoId);
        if (serverResult && serverResult.success) {
            description = serverResult.description || '';
            transcript = serverResult.transcript || '';
            title = serverResult.title || title;
            source += `+server-fallback`;
            console.log('✅ [Vercel Fallback] Datos recuperados del servidor');
        }
    }

    // Consolidación
    const contentParts = [];
    if (title) contentParts.push(`Título: ${title}`);
    if (description) contentParts.push(`Descripción Detallada:\n${description}`);
    if (transcript)  contentParts.push(`Audio Extraído:\n${transcript}`);

    const content = contentParts.join('\n\n');
    const hasContent = !!title;

    console.log(`📊 [YouTube v499] Resultado Diagnóstico:
      ├─ Title: ${title || 'N/A'}
      ├─ Desc: ${description?.length || 0} chars
      ├─ Audio: ${transcript?.length || 0} chars
      ├─ Source: ${source}
      └─ Status: ${hasContent ? '✅ OK' : '❌ FALLIDO'}`);

    if (!hasContent) throw new Error('No se pudo identificar el video.');

    return {
      type: 'video',
      platform: 'youtube',
      title,
      description,
      transcript,
      content,
      rawText: content,
      sourceUrl: videoUrl,
      success: true,
      source,
      isPartial: !description && !transcript,
      metadata: { title, isPartial: !description && !transcript }
    };

  } catch (error) {
    console.error('❌ [YouTube v499] Error Crítico:', error);
    return {
      type: 'error',
      platform: 'youtube',
      error: error.message,
      sourceUrl: videoUrl,
      success: false
    };
  }
}

/**
 * EL MOTOR v499: Fetch directo y parseo de ytInitialData
 */
async function fetchYouTubeDescriptionDirect(videoId) {
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}&hl=es&gl=ES`;
        
        // El navegador intentará esto. Si hay CORS activado por el usuario o entorno:
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'es-ES,es;q=0.9'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) return null;
        const html = await response.text();

        // Extraer JSON ytInitialData
        const jsonMatch = html.match(/var ytInitialData = ({.*?});/s);
        if (!jsonMatch) return null;

        const data = JSON.parse(jsonMatch[1]);
        
        let title = '';
        let description = '';

        // Título desde metadata
        try { title = data.metadata.videoDetails.title; } catch (e) {}

        // Descripción - Ruta 1: videoSecondaryInfoRenderer (Más fiable)
        try {
            const results = data.contents.twoColumnWatchNextResults.results.results.contents;
            const secondaryInfo = results.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
            if (secondaryInfo) {
                // AtributedDescription (Nuevo formato)
                if (secondaryInfo.attributedDescription) {
                    description = secondaryInfo.attributedDescription.content;
                } 
                // Description normal
                else if (secondaryInfo.description) {
                    description = secondaryInfo.description.runs.map(r => r.text).join('');
                }
            }
        } catch (e) {}

        // Descripción - Ruta 2: videoDetails (Short description)
        if (!description) {
            try { description = data.metadata.videoDetails.shortDescription; } catch (e) {}
        }

        return { title, description };

    } catch (err) {
        console.warn('⚠️ [fetchDirect] CORS bloqueó el acceso directo o error de parseo:', err.message);
        return null;
    }
}

async function fetchYouTubeFromServer(videoId) {
    try {
        const r = await fetch('/api/youtube-extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId }),
        });
        if (r.ok) return await r.json();
    } catch (e) {}
    return null;
}

function extractVideoId(url) {
  const p = [
    /(?:v=|v\/|vi\/|u\/\w\/|embed\/|shorts\/|youtu.be\/|be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /https:\/\/m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
  ];
  for (const reg of p) {
    const m = url.match(reg);
    if (m) return m[1];
  }
  return null;
}
