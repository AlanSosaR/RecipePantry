/**
 * YouTube Extractor Service (v489)
 * Usa el nuevo endpoint unificado /api/youtube-extract basado en InnerTube
 * Estrategia: descripción primero → transcripción solo si no hay receta en desc
 */

export async function extractFromYouTube(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error('URL de YouTube no válida');

    console.log(`📥 [YouTube v492] Procesando video ID: ${videoId}`);

    // Llamada única al endpoint unificado InnerTube
    const resp = await fetch('/api/youtube-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();

    if (!data.success) {
      console.warn(`⚠️ [YouTube v494] Extracción incompleta: ${data.error}`);
    }

    const title       = data.title || '';
    const description = data.description || '';
    const transcript  = data.transcript || '';
    const source      = data.source || 'unknown';

    // Construir el contenido combinado para Gemini
    // Si la descripción parece receta → usarla primero
    // Si no → usar transcripción
    const contentParts = [];
    if (title)       contentParts.push(`Título del video: ${title}`);
    if (description && data.descHasRecipe) {
      contentParts.push(`Descripción (contiene receta):\n${description}`);
    } else if (description) {
      contentParts.push(`Descripción del video:\n${description}`);
    }
    if (transcript)  contentParts.push(`Transcripción/Subtítulos:\n${transcript}`);

    const content = contentParts.join('\n\n');
    const success = !!(title || content);

    console.log(`📊 [YouTube v489] Resultado:
      ├─ VideoID: ${videoId}
      ├─ Título: ${title.length} chars
      ├─ Descripción: ${description.length} chars ${data.descHasRecipe ? '(✅ tiene receta)' : '(sin receta)'}
      ├─ Transcripción: ${transcript.length} chars
      ├─ Fuente: ${source}
      └─ Status: ${success ? '✅ OK' : '❌ VACÍO'}`);

    if (!success) throw new Error('No se pudo extraer contenido del video');

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
      isLowContent: !description && !transcript,
      metadata: { title, recipeScore: data.descHasRecipe ? 90 : (transcript ? 70 : 30) }
    };

  } catch (error) {
    console.error('❌ [YouTube v489] Error:', error);
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
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
