// api/youtube-transcript.js (v488)
// FIX: Multi-strategy caption extraction para IPs de servidor bloqueadas por YouTube

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  // Estrategia 1: TimedText API directa (no requiere HTML parsing)
  try {
    const directResult = await tryDirectTimedText(videoId);
    if (directResult) {
      console.log(`✅ [Transcript v488] TimedText directo OK para ${videoId}`);
      return res.status(200).json({ success: true, transcript: directResult, source: 'timedtext-direct' });
    }
  } catch (e) {
    console.warn(`⚠️ [Transcript v488] TimedText directo falló: ${e.message}`);
  }

  // Estrategia 2: Scraping con múltiples User-Agents y parseo robusto
  const headerSets = [
    { // Chrome en Windows
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-419,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cookie': 'CONSENT=YES+cb; SOCS=CAESEwgDEgk0OTczMDg1MTUaAmVzIAEaBgiAi5KoBg',
    },
    { // Firefox en Linux
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Accept-Language': 'es-MX,es;q=0.8,en-US;q=0.5,en;q=0.3',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Cookie': 'CONSENT=YES+42',
    },
  ];

  for (const headers of headerSets) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`📜 [Transcript v488] Scraping intento ${attempt + 1} con ${headers['User-Agent'].substring(0, 30)}...`);
        const url = `https://www.youtube.com/watch?v=${videoId}&hl=es&gl=ES&persist_hl=1&persist_gl=1`;
        const response = await fetch(url, { headers });

        if (!response.ok) {
          if (attempt < 1) { await sleep(1500); continue; }
          break;
        }

        const html = await response.text();

        // Verificar que no es página de consent/bot-check
        if (html.includes('"playabilityStatus":{"status":"LOGIN_REQUIRED"') || 
            html.includes('www.youtube.com/api/timedtext') === false && html.length < 100000) {
          console.warn(`⚠️ [Transcript v488] Página sospechosa (${html.length} bytes). Reintentando...`);
          await sleep(2000);
          continue;
        }

        const captionTracks = extractCaptionsRobust(html);
        if (captionTracks && captionTracks.length > 0) {
          const transcript = await fetchTranscriptText(captionTracks, headers);
          if (transcript && transcript.length > 50) {
            console.log(`✅ [Transcript v488] Scraping OK: ${transcript.length} chars`);
            return res.status(200).json({ success: true, transcript, source: 'youtube-scrape' });
          }
        }

        // Intento de emergencia: buscar URL de timedtext directamente en el HTML
        const timedTextEmergency = extractTimedTextUrlFromHtml(html);
        if (timedTextEmergency) {
          const transcript = await fetchTimedTextByUrl(timedTextEmergency, headers);
          if (transcript && transcript.length > 50) {
            console.log(`✅ [Transcript v488] TimedText emergencia OK: ${transcript.length} chars`);
            return res.status(200).json({ success: true, transcript, source: 'timedtext-emergency' });
          }
        }

        if (attempt < 1) await sleep(1500);
      } catch (e) {
        console.warn(`⚠️ [Transcript v488] Error en scraping: ${e.message}`);
        if (attempt < 1) await sleep(1500);
      }
    }
  }

  // Estrategia 3: Invidious VTT Fallback
  try {
    console.log('🚀 [Transcript v488] Intentando Invidious VTT Fallback...');
    const { getFromInvidious } = await import('./youtube-invidious-fallback.js');
    const invResult = await getFromInvidious(videoId);
    if (invResult.success && invResult.captions && invResult.captions.length > 20) {
      return res.status(200).json({
        success: true,
        transcript: invResult.captions,
        source: 'invidious-vtt'
      });
    }
  } catch (e) {
    console.warn(`⚠️ [Transcript v488] Invidious falló: ${e.message}`);
  }

  return res.status(200).json({ success: true, transcript: null, error: 'Subtítulos no disponibles para este video' });
}

// ─────────────────────────────────────────────
// HELPER: TimedText API directa (sin HTML parsing)
// YouTube expone la API en /api/timedtext?v=VIDEO_ID con opciones de idioma
// ─────────────────────────────────────────────
async function tryDirectTimedText(videoId) {
  const langs = ['es', 'es-419', 'en', 'asr']; // asr = Auto-generated Speech Recognition
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  for (const lang of langs) {
    try {
      const baseUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3&kind=asr`;
      const resp = await fetch(baseUrl, { headers });
      if (!resp.ok) continue;
      const data = await resp.json();
      const text = extractTextFromJson3(data);
      if (text && text.length > 50) return text;
    } catch (e) {}
  }
  return null;
}

// ─────────────────────────────────────────────
// HELPER: Parseo robusto de captionTracks desde HTML (múltiples patrones)
// ─────────────────────────────────────────────
function extractCaptionsRobust(html) {
  // Patrón 1: ytInitialPlayerResponse completo
  try {
    const marker = 'ytInitialPlayerResponse = ';
    const startIdx = html.indexOf(marker);
    if (startIdx !== -1) {
      const jsonStr = html.substring(startIdx + marker.length, startIdx + marker.length + 5000000);
      // Encontrar el cierre del objeto balanceando llaves
      let depth = 0, end = -1;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > 0) {
        const data = JSON.parse(jsonStr.substring(0, end + 1));
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length > 0) return tracks;
      }
    }
  } catch (e) {}

  // Patrón 2: playerCaptionsTracklistRenderer directo
  try {
    const marker = '"playerCaptionsTracklistRenderer":';
    const startIdx = html.indexOf(marker);
    if (startIdx !== -1) {
      const jsonStr = html.substring(startIdx + marker.length, startIdx + marker.length + 50000);
      let depth = 0, end = -1;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > 0) {
        const data = JSON.parse(jsonStr.substring(0, end + 1));
        if (data.captionTracks && data.captionTracks.length > 0) return data.captionTracks;
      }
    }
  } catch (e) {}

  // Patrón 3: Regex para baseUrl de timedtext
  try {
    const matches = html.matchAll(/"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/g);
    const tracks = [];
    for (const m of matches) {
      const url = m[1].replace(/\\u0026/g, '&');
      const langMatch = url.match(/lang=([a-z-]+)/);
      tracks.push({ baseUrl: url, languageCode: langMatch ? langMatch[1] : 'auto' });
    }
    if (tracks.length > 0) return tracks;
  } catch (e) {}

  return null;
}

// ─────────────────────────────────────────────
// HELPER: URL de TimedText directa en el HTML
// ─────────────────────────────────────────────
function extractTimedTextUrlFromHtml(html) {
  try {
    const match = html.match(/https:\\\/\\\/www\.youtube\.com\\\/api\\\/timedtext[^"\\]+/);
    if (match) return match[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
  } catch (e) {}
  return null;
}

// ─────────────────────────────────────────────
// HELPER: Descargar y parsear texto de una URL de timedtext
// ─────────────────────────────────────────────
async function fetchTranscriptText(tracks, headers) {
  const track = tracks.find(t => t.languageCode?.startsWith('es')) ||
                tracks.find(t => t.languageCode?.startsWith('en')) ||
                tracks[0];

  return fetchTimedTextByUrl(track.baseUrl, headers);
}

async function fetchTimedTextByUrl(url, headers) {
  try {
    const fmtUrl = url.includes('fmt=') ? url : `${url}&fmt=json3`;
    const resp = await fetch(fmtUrl, { headers });
    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      const data = await resp.json();
      return extractTextFromJson3(data);
    } else {
      // Podría ser XML (ttml) o VTT
      const text = await resp.text();
      if (text.includes('<text')) {
        // TTML/XML
        return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      return text;
    }
  } catch (e) {
    return null;
  }
}

function extractTextFromJson3(data) {
  if (!data || !data.events) return null;
  return data.events
    .filter(e => e.segs)
    .map(e => e.segs.map(s => s.utf8).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
