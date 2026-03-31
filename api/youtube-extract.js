// api/youtube-extract.js (v492)
// Extractor unificado usando: 1. InnerTube API → 2. HTML Scraping → 3. Invidious
// Estrategia de v492: Fallback de scraping robusto para evitar "0 chars" cuando la API es bloqueada.

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

  // ────────────────────────────────────────────────
  // ESTRATEGIA 2: HTML Scraping (Fallback si InnerTube falla o IP bloqueada)
  // ────────────────────────────────────────────────
  if (!title || (!description && !captionBaseUrl)) {
    try {
      console.log(`🔄 [Scraper v492] Intentando scraping de HTML para ${videoId}...`);
      const htmlUrl = `https://www.youtube.com/watch?v=${videoId}&hl=es&gl=ES`;
      const htmlResp = await fetch(htmlUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'es-MX,es;q=0.9',
          'Cookie': 'CONSENT=YES+42',
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (htmlResp.ok) {
        const html = await htmlResp.text();
        const scraped = extractFromHtml(html);
        if (scraped.success) {
          title = scraped.title || title;
          description = scraped.description || description;
          captionBaseUrl = scraped.captionBaseUrl || captionBaseUrl;
          source = (source === 'innertube' ? 'scraper' : source + '+scraper');
          console.log(`✅ [Scraper] Recuperado: Title: "${title}", Desc: ${description?.length}, Captions: ${!!captionBaseUrl}`);
        }
      }
    } catch (e) {
      console.warn(`⚠️ [Scraper] Error: ${e.message}`);
    }
  }

  // ESTRATEGIA 3: oEmbed como último recurso para título
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
  // ESTRATEGIA 5: Consolidar y Validar (v492)
  // EVITAR Alucinaciones: Si tenemos Título pero no hay CUERPO (descrip o transcript) con contenido real, abortar.
  // ────────────────────────────────────────────────
  const descriptionActual = description || '';
  const transcriptActual = transcript || '';
  
  // Scoring de contenido para evitar falsos positivos
  const hasSubstantialBody = (descriptionActual.length > 200 || transcriptActual.length > 300);
  const looksLikeRecipe = descriptionLooksLikeRecipe(descriptionActual) || transcriptActual.length > 800;
  
  const hasContent = !!(title && (hasSubstantialBody || looksLikeRecipe));
  
  if (!hasContent) {
    console.log(`📊 [YouTube v492] Diagnóstico:
      ├─ Title: ${title ? title.length : 0} chars
      ├─ Desc: ${descriptionActual.length} chars (Score: ${descriptionLooksLikeRecipe(descriptionActual)})
      ├─ Transcript: ${transcriptActual.length} chars
      ├─ Source: ${source}
      └─ Result: ❌ INSUFICIENTE PARA GEMINI`);
    return res.status(200).json({
      success: false,
      error: 'Contenido extraído insuficiente para encontrar una receta. Verifica que el video no sea privado.',
      videoId, 
      title, 
      descriptionLength: descriptionActual.length, 
      transcriptLength: transcriptActual.length 
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
// SCRAPER: Extraer metadatos del HTML bruto de la página
// ─────────────────────────────────────────────────────
function extractFromHtml(html) {
  try {
    const marker = 'ytInitialPlayerResponse = ';
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) return { success: false };

    const jsonStr = html.substring(startIdx + marker.length, startIdx + marker.length + 5000000);
    // Balanceo de llaves para un JSON seguro
    let depth = 0, end = -1;
    for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return { success: false };

    const data = JSON.parse(jsonStr.substring(0, end + 1));
    const videoDetails = data.videoDetails || {};
    const title = videoDetails.title || '';
    const description = videoDetails.shortDescription || '';
    
    // Captions del scraper
    let captionBaseUrl = null;
    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (tracks.length > 0) {
        const esTrack = tracks.find(t => t.languageCode?.startsWith('es'));
        const selected = esTrack || tracks[0];
        captionBaseUrl = selected?.baseUrl || null;
    }

    return { success: true, title, description, captionBaseUrl };
  } catch (e) {
    return { success: false, error: e.message };
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

