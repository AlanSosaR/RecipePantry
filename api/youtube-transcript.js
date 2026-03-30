// api/youtube-transcript.js - Vercel Serverless Function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  try {
    const htmlResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+413'
      }
    });

    const html = await htmlResponse.text();

    // Regex to find the ytInitialPlayerResponse object (Tolerant with newlines and varying spacing)
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]+?});\s*(?:var|script|window)/i) || 
                               html.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]+?});/i);
    
    if (!playerResponseMatch) {
      console.warn('⚠️ [Transcript] Initial player response not found via direct regex, attempting fallback search.');
      // Attempt to find a simpler match if the boundary script tag is different
      const simplerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (!simplerMatch) throw new Error('Could not find player response');
      playerResponseMatch = simplerMatch;
    }

    const playerResponse = JSON.parse(playerResponseMatch[1]);
    const captions = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captions || captions.length === 0) {
      return res.status(200).json({ success: true, transcript: null });
    }

    // Prefer Spanish (es) or English (en)
    const track = captions.find(t => t.languageCode === 'es') || 
                  captions.find(t => t.languageCode === 'en') ||
                  captions[0];

    const transcriptResponse = await fetch(track.baseUrl + '&fmt=json3');
    const transcriptData = await transcriptResponse.json();

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
    console.error('❌ Error fetching transcript:', error);
    return res.status(200).json({ success: true, transcript: null, error: error.message });
  }
}
