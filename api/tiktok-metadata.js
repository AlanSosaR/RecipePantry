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

    // Fast Regex Metadata (No Cheerio)
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="(.*?)"/i);
    const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="(.*?)"/i);
    
    let title = (ogTitleMatch ? ogTitleMatch[1] : 'TikTok Video');
    let caption = (ogDescMatch ? ogDescMatch[1] : '');
    
    // Clean HTML entities
    title = title.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    caption = caption.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

    const creator = title.split(' | ')[0] || '';

    return res.status(200).json({
      success: true,
      caption,
      creator,
      hashtags: [] // Simplified for now to avoid complex parsing
    });
  } catch (error) {
    console.error('❌ Error fetching TikTok metadata:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
