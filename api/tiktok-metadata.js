// api/tiktok-metadata.js - Vercel Serverless Function
import * as cheerio from 'cheerio';

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
    const $ = cheerio.load(html);

    // Get metadata from OG tags
    const caption = $('meta[property="og:description"]').attr('content') || '';
    const title = $('meta[property="og:title"]').attr('content') || '';
    const creator = title.split(' | ')[0] || '';

    // Get hashtags from the HTML if possible
    const hashtags = [];
    $('a[href*="/tag/"]').each((i, el) => {
      hashtags.push($(el).text());
    });

    return res.status(200).json({
      success: true,
      caption,
      creator,
      hashtags
    });
  } catch (error) {
    console.error('❌ Error fetching TikTok metadata:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
