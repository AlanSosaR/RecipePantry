/**
 * YouTube Extractor Service (v500)
 * ARQUITECTURA AI-DIRECT BYPASS: El extractor entrega la URL incluso si falla el scraper.
 * v500: Permite que Gemini use su propio conocimiento si no hay descripción.
 */

export async function extractFromYouTube(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error('URL de YouTube no válida');

    console.log(`📡 [YouTube v500] Modo AI-Direct Pilot: ${videoId}`);

    // 1. oEmbed (Título)
    let title = '';
    try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembed.ok) {
            const data = await oembed.json();
            title = data.title;
            console.log(`✅ [oEmbed] Título: ${title}`);
        }
    } catch (e) {}

    // 2. Direct Scraper
    let description = '';
    let transcript = '';
    let source = 'client-direct';

    try {
        const directData = await fetchYouTubeDescriptionDirect(videoId);
        if (directData && directData.description) {
            description = directData.description;
            title = directData.title || title;
            console.log(`✅ [DirectScraper] Cuerpo obtenido: ${description.length} chars`);
        }
    } catch (e) {}

    // 3. Fallback Servidor
    if (!description) {
        const serverResult = await fetchYouTubeFromServer(videoId);
        if (serverResult && serverResult.success) {
            description = serverResult.description || '';
            transcript = serverResult.transcript || '';
            title = serverResult.title || title;
            source += `+server`;
            console.log('✅ [Vercel Fallback] Datos recuperados');
        }
    }

    // 4. v501 MODIFICACIÓN: Deterministic Data Packing
    const contentParts = [
        `URL: ${videoUrl}`,
        `TITLE: ${title || 'Unknown'}`
    ];
    if (description) contentParts.push(`DESCRIPTION FOUND:\n${description}`);
    if (transcript)  contentParts.push(`TRANSCRIPT FOUND:\n${transcript}`);

    const content = contentParts.join('\n\n');
    
    console.log(`📊 [YouTube v501] Status:
      ├─ Title: ${title || 'Unknown'}
      ├─ Data Present: ${!!(description || transcript)}
      └─ Result: Proceed to Deterministic Engine`);

    if (!success) throw new Error('No se pudo identificar el video.');

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
      isAiOnly: !description && !transcript,
      metadata: { title, videoId, isAiOnly: !description && !transcript }
    };

  } catch (error) {
    console.error('❌ [YouTube v500] Error:', error);
    return {
      type: 'error',
      platform: 'youtube',
      error: error.message,
      sourceUrl: videoUrl,
      success: false
    };
  }
}

async function fetchYouTubeDescriptionDirect(videoId) {
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}&hl=es`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return null;
        const html = await response.text();
        const jsonMatch = html.match(/var ytInitialData = ({.*?});/s);
        if (!jsonMatch) return null;
        const data = JSON.parse(jsonMatch[1]);
        let title = '';
        let description = '';
        try { title = data.metadata.videoDetails.title; } catch (e) {}
        try {
            const results = data.contents.twoColumnWatchNextResults.results.results.contents;
            const sec = results.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
            if (sec) description = sec.attributedDescription?.content || sec.description?.runs.map(r => r.text).join('') || '';
        } catch (e) {}
        return { title, description };
    } catch (err) {
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
