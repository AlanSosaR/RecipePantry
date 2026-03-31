// api/youtube-extract.js (v489)
// Extractor unificado usando la API InnerTube interna de YouTube
// Estrategia: descripción primero → si hay receta, listo. Si no, transcripción.

const INNERTUBE_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player';
// Clave pública del cliente web de YouTube (documentada públicamente, no es secreta)
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId requerido' });

  console.log(`🎬 [InnerTube v489] Extrayendo video: ${videoId}`);

  // ────────────────────────────────────────────────
  // ESTRATEGIA 1: InnerTube API (más fiable que scraping)
  // ────────────────────────────────────────────────
  let title = '';
  let description = '';
  let captionBaseUrl = null;
  let source = 'innertube';

  try {
    const innertubeResult = await fetchInnerTube(videoId);
    if (innertubeResult.success) {
      title = innertubeResult.title;
      description = innertubeResult.description;
      captionBaseUrl = innertubeResult.captionBaseUrl;
      console.log(`✅ [InnerTube] Título: "${title}", Desc: ${description.length} chars, Captions: ${!!captionBaseUrl}`);
    }
  } catch (e) {
    console.warn(`⚠️ [InnerTube] Error: ${e.message}`);
  }

  // Si InnerTube falla, intentar oEmbed como fallback de título
  if (!title) {
    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembed.ok) {
        const data = await oembed.json();
        title = data.title || '';
        source = 'oembed-fallback';
        console.log(`✅ [oEmbed] Título recuperado: "${title}"`);
      }
    } catch (e) {}
  }

  // ────────────────────────────────────────────────
  // ESTRATEGIA 2: ¿La descripción tiene receta?
  // Si sí → no necesitamos transcripción
  // ────────────────────────────────────────────────
  const descHasRecipe = descriptionLooksLikeRecipe(description);
  console.log(`🔍 [InnerTube] ¿Descripción contiene receta? ${descHasRecipe}`);

  let transcript = null;

  if (captionBaseUrl) {
    // ────────────────────────────────────────────────
    // ESTRATEGIA 3: Obtener transcripción SIEMPRE si está disponible (v491)
    // ────────────────────────────────────────────────
    try {
      transcript = await fetchCaptionFromUrl(captionBaseUrl);
      if (transcript) {
        console.log(`✅ [InnerTube] Transcripción: ${transcript.length} chars`);
        source += '+captions';
      }
    } catch (e) {
      console.warn(`⚠️ [InnerTube] Error en captions: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────
  // ESTRATEGIA 4: Invidious fallback si todo falló
  // ────────────────────────────────────────────────
  if (!title && !description && !transcript) {
    try {
      console.log('🔄 [InnerTube] Todo falló. Intentando Invidious...');
      const { getFromInvidious } = await import('./youtube-invidious-fallback.js');
      const inv = await getFromInvidious(videoId);
      if (inv.success) {
        title = inv.title || title;
        description = inv.description || description;
        transcript = inv.captions || transcript;
        source = `invidious:${inv.instance}`;
        console.log(`✅ [Invidious] Datos recuperados de ${inv.instance}`);
      }
    } catch (e) {
      console.warn(`⚠️ [Invidious] Error: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────
  // ESTRATEGIA 5: Consolidar y Validar
  // ────────────────────────────────────────────────
  const hasContent = !!(title || (description && description.length > 300) || (transcript && transcript.length > 50));
  
  if (!hasContent) {
    console.log(`📊 [YouTube v491] Diagnóstico:
      ├─ Title: ${title ? title.length : 0} chars
      ├─ Desc: ${description ? description.length : 0} chars (Recipe: ${descHasRecipe})
      ├─ Transcript: ${transcript ? transcript.length : 0} chars
      ├─ Source: ${source}
      └─ Content Total: ${(title + description + (transcript || '')).length} chars`);
    return res.status(200).json({
      success: false,
      error: 'Contenido extraído insuficiente',
      videoId, 
      title, 
      descriptionLength: description.length, 
      transcriptLength: transcript ? transcript.length : 0 
    });
  }

  return res.status(200).json({
    success: true,
    videoId,
    title,
    description,
    transcript,
    descHasRecipe,
    source,
  });
}

// ─────────────────────────────────────────────────────
// INNERTUBE: Llamada a la API interna de YouTube
// Retorna title, description y URL de subtítulos
// ─────────────────────────────────────────────────────
async function fetchInnerTube(videoId) {
  // El contexto de cliente web estándar de YouTube
  const body = {
    videoId,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'es',
        gl: 'ES',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }
  };

  const response = await fetch(`${INNERTUBE_ENDPOINT}?key=${INNERTUBE_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20240101.00.00',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`InnerTube HTTP ${response.status}`);
  }

  const data = await response.json();

  // Extraer título y descripción
  const videoDetails = data.videoDetails || {};
  const title = videoDetails.title || '';
  
  // v490: Buscar descripción COMPLETA (InnerTube shortDescription es limitada)
  let description = videoDetails.shortDescription || '';
  const microDescription = data.microformat?.playerMicroformatRenderer?.description?.simpleText;
  if (microDescription && microDescription.length > description.length) {
    description = microDescription;
  }

  // Extraer URL de subtítulos (prioridad: español > inglés > cualquiera) (v490)
  let captionBaseUrl = null;
  try {
    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (tracks.length > 0) {
      const esTrack = tracks.find(t => t.languageCode?.startsWith('es'));
      const enTrack = tracks.find(t => t.languageCode?.startsWith('en'));
      const anyTrack = tracks[0];
      const selected = esTrack || enTrack || anyTrack;
      captionBaseUrl = selected?.baseUrl || null;
    }
  } catch (e) {}

  // v490: Fallback directo a TimedText si no hay captions en InnerTube
  if (!captionBaseUrl) {
    try {
      const directTranscriptUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=es&fmt=json3&kind=asr`;
      const directResp = await fetch(directTranscriptUrl, { signal: AbortSignal.timeout(5000) });
      if (directResp.ok) {
        const testJson = await directResp.clone().json().catch(()=>null);
        if (testJson && testJson.events) {
            captionBaseUrl = directTranscriptUrl;
        }
      }
    } catch (e) {}
  }

  return { success: true, title, description, captionBaseUrl };
}

// ─────────────────────────────────────────────────────
// CAPTIONS: Descargar y parsear texto de subtítulos
// ─────────────────────────────────────────────────────
async function fetchCaptionFromUrl(baseUrl) {
  try {
    const url = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      const data = await resp.json();
      return (data.events || [])
        .filter(e => e.segs)
        .map(e => e.segs.map(s => s.utf8 || '').join(''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      // XML/TTML
      const text = await resp.text();
      return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────────────
// DETECCIÓN: ¿La descripción del video parece una receta?
// ─────────────────────────────────────────────────────
function descriptionLooksLikeRecipe(description) {
  if (!description || description.length < 80) return false;

  const text = description.toLowerCase();

  // Palabras clave de recetas en español e inglés
  const ingredientKeywords = ['ingredientes', 'ingredients', 'taza', 'cucharada', 'gramos', 'ml ', 'litro', 'cup', 'tbsp', 'tsp', 'oz ', 'lb '];
  const stepKeywords = ['preparación', 'preparacion', 'instrucciones', 'pasos', 'modo de', 'procedimiento', 'directions', 'instructions', 'steps'];
  const measureKeywords = [/\d+\s*(g|gr|kg|ml|l|oz|lb|taza|cup)/i, /\d+\/\d+/];

  const hasIngredients = ingredientKeywords.some(k => text.includes(k));
  const hasSteps = stepKeywords.some(k => text.includes(k));
  const hasMeasures = measureKeywords.some(r => r.test(description));

  // Si tiene palabras de ingredientes + medidas O tiene sección de pasos → es receta
  return (hasIngredients && hasMeasures) || hasSteps || (hasIngredients && description.length > 200);
}
