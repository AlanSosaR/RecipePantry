// api/youtube-extract.js (v495)
// SUPER-BYPASS: InnerTube → Scraper → RSS Feed → Invidious
// v495: Añade extracción via RSS Feed (feeds/videos.xml) como bypass de alta fiabilidad.

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

  console.log(`🎬 [v495] Extrayendo video: ${videoId}`);

  let title = '';
  let description = '';
  let transcript = '';
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
  // ESTRATEGIA 2: Mega-Scraper (v494)
  // Basado en el motor de 'youtube-transcript.js'
  // ────────────────────────────────────────────────
  if (!title || !description || !captionBaseUrl) {
    const headerSets = [
      { // Chrome Desktop
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cookie': 'CONSENT=YES+42; SOCS=CAESEwgDEgk0OTczMDg1MTUaAmVzIAEaBgiAi5KoBg',
      },
      { // Mobile Safari (Often less restricted)
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'es-MX,es;q=0.9',
        'Cookie': 'CONSENT=YES+cb',
      }
    ];

    for (const headers of headerSets) {
      if (title && description && captionBaseUrl) break;
      try {
        console.log(`🔄 [Scraper v494] Intento con UA: ${headers['User-Agent'].substring(0, 20)}...`);
        const url = `https://www.youtube.com/watch?v=${videoId}&hl=es&gl=ES&persist_hl=1`;
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        
        if (resp.ok) {
          const html = await resp.text();
          const scraped = extractFromHtml(html);
          if (scraped.success) {
            title = scraped.title || title;
            description = scraped.description || description;
            captionBaseUrl = scraped.captionBaseUrl || captionBaseUrl;
            source = `scrape:${headers['User-Agent'].includes('iPhone') ? 'mobile' : 'desktop'}`;
            
            // Intento de emergencia de TimedText URL directa
            if (!captionBaseUrl) {
              const emergencyUrl = extractTimedTextUrlFromHtml(html);
              if (emergencyUrl) {
                captionBaseUrl = emergencyUrl;
                source += '+emergency-tt';
              }
            }
          }
        }
      } catch (e) {
        console.warn(`⚠️ [Scraper v494] Error: ${e.message}`);
      }
    }
  }

  // ────────────────────────────────────────────────
  // ESTRATEGIA 3: RSS Feed Fallback (v495)
  // Muy útil para descripciones cuando el HTML está bloqueado
  // ────────────────────────────────────────────────
  if (!title || !description) {
    try {
      console.log('🔄 [RSS v495] Intentando bypass por RSS Feed...');
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?video_id=${videoId}`;
      const rssResp = await fetch(rssUrl, { signal: AbortSignal.timeout(6000) });
      if (rssResp.ok) {
        const xml = await rssResp.text();
        const rssTitle = xml.match(/<title>([^<]+)<\/title>/);
        const rssDesc = xml.match(/<media:description>([^<]+)<\/media:description>/);
        
        if (rssTitle) title = rssTitle[1] || title;
        if (rssDesc) {
          description = rssDesc[1] || description;
          source += '+rss';
          console.log(`✅ [RSS] Recuperada descripción: ${description.length} chars`);
        }
      }
    } catch (e) {
      console.warn(`⚠️ [RSS] Falló: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────
  // ESTRATEGIA 4: Transcript Fetching (v495)
  // ────────────────────────────────────────────────
  if (captionBaseUrl) {
    try {
      transcript = await fetchCaptionFromUrl(captionBaseUrl);
      if (transcript) source += '+captions';
    } catch (e) {
      console.warn(`⚠️ [Transcript] Falló: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────
  // ESTRATEGIA 5: Invidious fallback si todo falló
  // ────────────────────────────────────────────────
  if (!title || (!description && !transcript)) {
    try {
      console.log('🔄 [v495] Todo falló. Intentando Invidious (Instancias Premium)...');
      const { getFromInvidious } = await import('./youtube-invidious-fallback.js');
      const inv = await getFromInvidious(videoId);
      if (inv.success) {
        title = inv.title || title;
        description = inv.description || description;
        transcript = inv.captions || transcript;
        source = `invidious:${inv.instance}`;
        console.log(`✅ [Invidious] Datos de ${inv.instance}`);
      }
    } catch (e) {
      console.warn(`⚠️ [Invidious] Error: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────
  // ESTRATEGIA 6: Consolidar y Validar (v495)
  // ────────────────────────────────────────────────
  const descriptionActual = description || '';
  const transcriptActual = transcript || '';
  
  // Scraper de emergencia si solo tenemos título
  const hasContent = !!(title && (descriptionActual.length > 100 || transcriptActual.length > 200));
  
  if (!hasContent) {
    console.log(`📊 [YouTube v495] Diagnóstico de Fallo: Title=${!!title}, Desc=${descriptionActual.length}, Trans=${transcriptActual.length}`);
    return res.status(200).json({
      success: false,
      error: 'YouTube ha bloqueado el acceso automático a este video. Por favor, copia la descripción del video y pégala manualmente en la pestaña de Texto para procesarla con la IA.',
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
    const captions = data.captions?.playerCaptionsTracklistRenderer || data.captions?.playerCaptionsTracklistRenderer;
    const tracks = captions?.captionTracks || [];
    
    if (tracks.length > 0) {
        const esTrack = tracks.find(t => t.languageCode?.startsWith('es'));
        const enTrack = tracks.find(t => t.languageCode?.startsWith('en'));
        const selected = esTrack || enTrack || tracks[0];
        captionBaseUrl = selected?.baseUrl || null;
    }

    return { success: true, title, description, captionBaseUrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────────
// EMERGENCIA: Buscar URL de TimedText directamente en el HTML
// ─────────────────────────────────────────────────────
function extractTimedTextUrlFromHtml(html) {
  try {
    const regex = /"https:\/\/www\.youtube\.com\/api\/timedtext[^"]+"/;
    const match = html.match(regex);
    if (match) {
      let url = match[0].replace(/"/g, '');
      url = url.replace(/\\u0026/g, '&');
      if (!url.includes('fmt=vtt')) url += '&fmt=vtt';
      return url;
    }
  } catch (e) {}
  return null;
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

