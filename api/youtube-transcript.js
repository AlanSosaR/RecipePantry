// api/youtube-transcript.js (v487)
import { getFromInvidious } from './youtube-invidious-fallback.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+413'
    };

    let html = '';
    let captionTracks = null;

    // 1. Intentar Scraping Directo con Reintentos
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`📜 [Transcript] Intento ${attempt + 1}/3 para ${videoId}`);
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers });
        if (!response.ok) {
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
                continue;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        html = await response.text();
        captionTracks = extractCaptions(html);
        
        if (captionTracks && captionTracks.length > 0) {
            console.log(`✅ [Transcript] TimedText capturado en el intento ${attempt + 1}`);
            break;
        }
        
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        if (attempt === 2) throw e;
      }
    }

    // 2. Si falla el scraping directo, EMERGENCIA: Invidious Fallback (VTT Support)
    if (!captionTracks || captionTracks.length === 0) {
      console.log('🚀 [Transcript] Bloqueo total detectado. Intentando Invidious VTT Fallback...');
      const invResult = await getFromInvidious(videoId);
      if (invResult.success && invResult.captions) {
        return res.status(200).json({ 
            success: true, 
            transcript: invResult.captions,
            source: 'invidious-vtt'
        });
      }
    }

    // 3. Procesar TimedText si se encontró
    if (!captionTracks || captionTracks.length === 0) {
        const timedTextMatch = html.match(/"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext.*?)"/);
        if (timedTextMatch) {
            captionTracks = [{ baseUrl: timedTextMatch[1].replace(/\\u0026/g, '&'), languageCode: 'auto' }];
        }
    }

    if (!captionTracks || captionTracks.length === 0) {
      return res.status(200).json({ success: true, transcript: null, error: 'Subtítulos no encontrados' });
    }

    const track = captionTracks.find(t => t.languageCode === 'es') || 
                  captionTracks.find(t => t.languageCode === 'en') ||
                  captionTracks[0];

    const transcriptResp = await fetch(track.baseUrl + (track.baseUrl.includes('fmt=json3') ? '' : '&fmt=json3'), { headers });
    const transcriptData = await transcriptResp.json();

    const transcript = transcriptData.events
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return res.status(200).json({ success: true, transcript, source: 'youtube-timedtext' });

  } catch (error) {
    console.warn('❌ [Transcript] YouTube falló. Intento de emergencia Invidious...');
    try {
        const invResult = await getFromInvidious(videoId);
        if (invResult.success && invResult.captions) {
           return res.status(200).json({ success: true, transcript: invResult.captions, source: 'invidious-vtt-emergency' });
        }
    } catch (e) {}
    return res.status(200).json({ success: true, transcript: null, error: error.message });
  }
}

function extractCaptions(html) {
  try {
    const jsonStr = html.split('ytInitialPlayerResponse = ')[1]?.split(';</script>')[0];
    if (!jsonStr) return null;
    const data = JSON.parse(jsonStr);
    return data.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  } catch (e) {
    return null;
  }
}
