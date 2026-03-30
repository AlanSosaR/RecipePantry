// api/youtube-metadata.js - Vercel Serverless Function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  try {
    // v476: Primero intentamos oEmbed para asegurar el Título Real (Casi nunca se bloquea)
    let oembedTitle = '';
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const oembedResp = await fetch(oembedUrl);
      if (oembedResp.ok) {
        const oembedData = await oembedResp.json();
        oembedTitle = oembedData.title || '';
        console.log(`✅ [oEmbed] Título recuperado: ${oembedTitle}`);
      }
    } catch (e) {
      console.warn('⚠️ [oEmbed] Error fallback:', e.message);
    }

    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+413'
      }
    });
    
    if (!response.ok) throw new Error(`YouTube fetch failed: ${response.status}`);
    
    const html = await response.text();
    
    // Helper to find content in a tag by property/name with flexible attribute order
    const findMeta = (tag) => {
      const re1 = new RegExp(`<meta[^>]+property=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
      const re2 = new RegExp(`<meta[^>]+content=["'](.*?)["'][^>]+property=["']${tag}["']`, 'i');
      const re3 = new RegExp(`<meta[^>]+name=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
      const m1 = html.match(re1); if (m1) return m1[1];
      const m2 = html.match(re2); if (m2) return m2[1];
      const m3 = html.match(re3); if (m3) return m3[1];
      return null;
    };

    let title = oembedTitle || findMeta('og:title') || (html.match(/<title>(.*?)<\/title>/i)?.[1] || 'YouTube Video');
    let description = findMeta('og:description') || findMeta('description') || '';
    
    // v474: Intentar capturar la descripción COMPLETA de ytInitialData
    const shortDescMatch = html.match(/"shortDescription":"(.*?)"/);
    if (shortDescMatch) {
      const fullDesc = shortDescMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      if (fullDesc.length > description.length) description = fullDesc;
    }

    // v480: Bypass Móvil - Si la descripción es basura, intentar con m.youtube.com
    const isBotBlock = description.toLowerCase().includes('disfruta de los v') || 
                       description.toLowerCase().includes('enjoy the videos') ||
                       description.length < 50;

    if (isBotBlock) {
      console.log('🔄 [YouTube] Bloqueo detectado en Desktop. Intentando bypass móvil...');
      try {
        const mobileResp = await fetch(`https://m.youtube.com/watch?v=${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept-Language': 'es-MX,es;q=0.9',
            'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+413'
          }
        });
        if (mobileResp.ok) {
          const mobileHtml = await mobileResp.text();
          const mDescMatch = mobileHtml.match(/"shortDescription":"(.*?)"/);
          if (mDescMatch) {
            const mFullDesc = mDescMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            if (mFullDesc.length > 50 && !mFullDesc.toLowerCase().includes('disfruta de los v')) {
              description = mFullDesc;
              console.log('✅ [YouTube] Bypass móvil exitoso.');
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ [YouTube] Error bypass móvil:', e.message);
      }
    }

    const isGenericTitle = title.toLowerCase().includes('- youtube');
    const finalBlockCheck = description.toLowerCase().includes('disfruta de los v') || description.length < 10;

    // Clean HTML entities
    const clean = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    title = clean(title);
    description = clean(description);

    return res.status(200).json({
      success: true,
      title,
      description,
      isPotentialBlock: finalBlockCheck && isGenericTitle,
      source: oembedTitle ? 'oembed+scrape' : 'scrape'
    });
  } catch (error) {
    console.error('❌ Error fetching YouTube metadata:', error);
    return res.status(200).json({ success: false, error: error.message });
  }
}
