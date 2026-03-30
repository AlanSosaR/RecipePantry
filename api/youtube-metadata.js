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
    
    // Robust Regex extraction for Metadata (No Cheerio needed)
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="(.*?)"/i);
    const descMatch = html.match(/<meta\s+name="description"\s+content="(.*?)"/i);
    const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="(.*?)"/i);
    
    let title = (ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : 'YouTube Video'));
    let description = (ogDescMatch ? ogDescMatch[1] : (descMatch ? descMatch[1] : ''));
    
    // Clean HTML entities if any
    title = title.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    description = description.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

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
