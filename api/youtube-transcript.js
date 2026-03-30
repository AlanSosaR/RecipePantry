// api/youtube-transcript.js - Vercel Serverless Function (v480 Mobile Bypass)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  try {
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    const consentCookie = 'CONSENT=YES+cb.20210328-17-p0.en+FX+413';

    const extractCaptions = (html) => {
      // Find ytInitialPlayerResponse
      const match = html.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]+?});\s*(?:var|script|window)/i) || 
                    html.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]+?});/i);
      if (!match) return null;
      try {
        const player = JSON.parse(match[1]);
        return player.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
      } catch (e) {
        return null;
      }
    };

    // 1. Intentar Desktop
    const desktopResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': desktopUA, 'Cookie': consentCookie }
    });
    const desktopHtml = await desktopResp.text();
    let captionTracks = extractCaptions(desktopHtml);

    // 2. Si falla, intentar Mobile Bypass (v480)
    if (!captionTracks) {
      console.log('🔄 [Transcript] Desktop falló. Intentando Mobile Bypass...');
      const mobileResp = await fetch(`https://m.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': mobileUA, 'Cookie': consentCookie }
      });
      if (mobileResp.ok) {
        const mobileHtml = await mobileResp.text();
        captionTracks = extractCaptions(mobileHtml);
        if (captionTracks) console.log('✅ [Transcript] Bypass móvil exitoso.');
      }
    }

    // v481: Bypass Invidious API para Transcripciones
    if (!captionTracks || captionTracks.length === 0) {
      console.log('🚀 [Transcript] Bloqueo total. Probando Invidious API Proxy...');
      try {
        const instances = ['https://invidious.projectsegfau.lt', 'https://inv.riverside.rocks', 'https://yewtu.be'];
        for (const inst of instances) {
          try {
            const invResp = await fetch(`${inst}/api/v1/videos/${videoId}`);
            if (invResp.ok) {
              const invData = await invResp.json();
              if (invData.captions && invData.captions.length > 0) {
                // Mapear formato Invidious a formato YouTube
                captionTracks = invData.captions.map(c => ({
                  baseUrl: `${inst}${c.url}`,
                  languageCode: c.label.toLowerCase().includes('span') ? 'es' : 'en'
                }));
                console.log(`✅ [Transcript] Bypass Invidious exitoso (${inst}).`);
                break;
              }
            }
          } catch (e) { continue; }
        }
      } catch (e) { console.warn('⚠️ Fallo bypass Invidious transcript'); }
    }

    if (!captionTracks || captionTracks.length === 0) {
      // Intentar una búsqueda desesperada de cualquier link timedtext
      const timedTextMatch = desktopHtml.match(/"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext.*?)"/);
      if (timedTextMatch) {
         console.log('🎯 [Transcript] Encontrado link directo de timedtext.');
         captionTracks = [{ baseUrl: timedTextMatch[1].replace(/\\u0026/g, '&'), languageCode: 'auto' }];
      }
    }

    if (!captionTracks || captionTracks.length === 0) {
      return res.status(200).json({ success: true, transcript: null, error: 'No se encontraron subtítulos (v480 Protected)' });
    }

    // Preferir español o inglés
    const track = captionTracks.find(t => t.languageCode === 'es') || 
                  captionTracks.find(t => t.languageCode === 'en') ||
                  captionTracks[0];

    // Fetch actual transcript JSON
    const transcriptResp = await fetch(track.baseUrl + (track.baseUrl.includes('fmt=json3') ? '' : '&fmt=json3'));
    const transcriptData = await transcriptResp.json();

    const transcript = transcriptData.events
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return res.status(200).json({
      success: true,
      transcript
    });

  } catch (error) {
    console.error('❌ Error fatal en transcript:', error);
    return res.status(200).json({ success: true, transcript: null, error: error.message });
  }
}
