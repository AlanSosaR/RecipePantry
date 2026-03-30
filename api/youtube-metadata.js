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
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    
    if (!response.ok) throw new Error(`YouTube fetch failed: ${response.status}`);
    
    const html = await response.text();
    
    // Helper to find content in a tag by property/name with flexible attribute order
    const findMeta = (tag) => {
      // Regex 1: <meta ... property="{tag}" ... content="{value}" ...>
      const re1 = new RegExp(`<meta[^>]+property=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
      // Regex 2: <meta ... content="{value}" ... property="{tag}" ...>
      const re2 = new RegExp(`<meta[^>]+content=["'](.*?)["'][^>]+property=["']${tag}["']`, 'i');
      // Regex 3: <meta ... name="{tag}" ... content="{value}" ...>
      const re3 = new RegExp(`<meta[^>]+name=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
      
      const m1 = html.match(re1); if (m1) return m1[1];
      const m2 = html.match(re2); if (m2) return m2[1];
      const m3 = html.match(re3); if (m3) return m3[1];
      return null;
    };

    let title = findMeta('og:title') || (html.match(/<title>(.*?)<\/title>/i)?.[1] || 'YouTube Video');
    let description = findMeta('og:description') || findMeta('description') || '';
    
    // v474: Intentar capturar la descripción COMPLETA de ytInitialData
    const shortDescMatch = html.match(/"shortDescription":"(.*?)"/);
    if (shortDescMatch) {
      const fullDesc = shortDescMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      if (fullDesc.length > description.length) {
        description = fullDesc;
      }
    }

    // Clean HTML entities
    const clean = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    title = clean(title);
    description = clean(description);

    return res.status(200).json({
      success: true,
      title,
      description
    });
  } catch (error) {
    console.error('❌ Error fetching YouTube metadata:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
