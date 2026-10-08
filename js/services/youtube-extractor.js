/**
 * YouTube Extractor Service (v502)
 * ARQUITECTURA AI-DIRECT BYPASS: El extractor entrega la URL incluso si falla el scraper.
 * Integra fallback con microservicio local recipe-transcriber-api (http://localhost:8000/extract-recipe).
 */

export async function extractFromYouTube(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error('URL de YouTube no válida');

    console.log(`📡 [YouTube v502] Extracción iniciada para video: ${videoId}`);

    // 1. oEmbed (Título)
    let title = '';
    try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembed.ok) {
            const data = await oembed.json();
            title = data.title;
            console.log(`✅ [oEmbed] Título obtenido: ${title}`);
        }
    } catch (e) {}

    // 2. Direct Scraper
    let description = '';
    let transcript = '';
    let source = 'client-direct';
    let structuredRecipe = null;

    try {
        const directData = await fetchYouTubeDescriptionDirect(videoId);
        if (directData && directData.description) {
            description = directData.description;
            title = directData.title || title;
            console.log(`✅ [DirectScraper] Cuerpo obtenido: ${description.length} caracteres`);
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
            console.log('✅ [Vercel Fallback] Datos recuperados del servidor');
        }
    }

    // 4. Fallback Microservicio Local de Transcripción (recipe-transcriber-api)
    if (!description && !transcript) {
        const localApiResult = await fetchFromLocalTranscriberApi(videoUrl);
        if (localApiResult) {
            if (localApiResult.recipe && (localApiResult.recipe.nombre || localApiResult.recipe.name)) {
                structuredRecipe = localApiResult.recipe;
                title = structuredRecipe.nombre || structuredRecipe.name || title;
            }
            if (localApiResult.transcription) {
                transcript = localApiResult.transcription;
            }
            source += `+transcriber-api`;
            console.log('✅ [Transcriber API Fallback] Receta o transcripción obtenida desde microservicio local');
        }
    }

    // 5. Deterministic Data Packing
    const contentParts = [
        `URL: ${videoUrl}`,
        `TITLE: ${title || 'Unknown'}`
    ];
    if (description) contentParts.push(`DESCRIPTION FOUND:\n${description}`);
    if (transcript)  contentParts.push(`TRANSCRIPT FOUND:\n${transcript}`);
    if (structuredRecipe && (structuredRecipe.descripcion || structuredRecipe.description)) {
        contentParts.push(`RECIPE SUMMARY:\n${structuredRecipe.descripcion || structuredRecipe.description}`);
    }

    const content = contentParts.join('\n\n');
    
    // Identificación exitosa del video (Solución a ReferenceError: success is not defined)
    const success = Boolean(videoId && (title || description || transcript || structuredRecipe));

    console.log(`📊 [YouTube v502] Status:
      ├─ Title: ${title || 'Unknown'}
      ├─ Data Present: ${!!(description || transcript || structuredRecipe)}
      ├─ Structured Recipe: ${!!structuredRecipe}
      └─ Result: ${success ? 'Éxito' : 'Fallo'}`);

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
      structuredRecipe: structuredRecipe || null,
      isAiOnly: !description && !transcript && !structuredRecipe,
      metadata: { title, videoId, isAiOnly: !description && !transcript && !structuredRecipe }
    };

  } catch (error) {
    console.error('❌ [YouTube v502] Error:', error);
    return {
      type: 'error',
      platform: 'youtube',
      error: error.message,
      sourceUrl: videoUrl,
      success: false
    };
  }
}

async function fetchFromLocalTranscriberApi(videoUrl) {
    try {
        console.log(`🎙️ [Local Transcriber API] Intentando consultar http://localhost:8000/extract-recipe...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch('http://localhost:8000/extract-recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: videoUrl }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`⚠️ [Local Transcriber API] Respuesta HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data && data.success) {
            return data;
        }
    } catch (err) {
        // Fallback silencioso si el microservicio local no está corriendo o tiene timeout
        console.warn(`⚠️ [Local Transcriber API] No disponible (${err.message}). Continuando flujo estándar.`);
    }
    return null;
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
