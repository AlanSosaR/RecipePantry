// api/tiktok-metadata.js - Vercel Serverless Function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) throw new Error(`TikTok fetch failed: ${response.status}`);
    const html = await response.text();

    // Helper for flexible attribute order in meta tags
    const findMeta = (tag) => {
      const re1 = new RegExp(`<meta[^>]+property=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
      const re2 = new RegExp(`<meta[^>]+content=["'](.*?)["'][^>]+property=["']${tag}["']`, 'i');
      const re3 = new RegExp(`<meta[^>]+name=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
      const m1 = html.match(re1); if (m1) return m1[1];
      const m2 = html.match(re2); if (m2) return m2[1];
      const m3 = html.match(re3); if (m3) return m3[1];
      return null;
    };

    let title = findMeta('og:title') || 'TikTok Video';
    let caption = findMeta('og:description') || findMeta('description') || '';
    
    // Clean HTML entities efficiently
    const clean = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    title = clean(title);
    caption = clean(caption);

    const creator = title.split(' | ')[0] || '';

    return res.status(200).json({
      success: true,
      caption,
      creator,
      hashtags: [] 
    });
  } catch (error) {
    console.error('❌ Error fetching TikTok metadata:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
