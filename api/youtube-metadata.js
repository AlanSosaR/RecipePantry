// api/youtube-metadata.js (v487)
import { getFromInvidious } from './youtube-invidious-fallback.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  try {
    // 1. oEmbed Fallback (Casi nunca se bloquea)
    let oembedTitle = '';
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const oembedResp = await fetch(oembedUrl);
      if (oembedResp.ok) {
        const oembedData = await oembedResp.json();
        oembedTitle = oembedData.title || '';
      }
    } catch (e) {
      console.warn('⚠️ [oEmbed] Error fallback:', e.message);
    }

    // 2. Fetch con HEADERS REALISTAS y RETRY EXPONENCIAL
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+413'
    };

    let html = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`🔄 [Metadata] Intento ${attempt + 1}/3 para ${videoId}`);
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers });
        
        if (!response.ok) {
          if (attempt < 2) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`⏳ Status ${response.status}. Esperando ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error(`HTTP ${response.status}`);
        }
        
        html = await response.text();
        console.log(`✅ [Metadata] Headers mejorados funcionaron (v487)`);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }

    // 3. Procesar scraping de HTML
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
    
    const shortDescMatch = html.match(/"shortDescription":"(.*?)"/);
    if (shortDescMatch) {
      const fullDesc = shortDescMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      if (fullDesc.length > description.length) description = fullDesc;
    }

    // Bypass Invidious si aún está bloqueado
    const isBotBlock = description.toLowerCase().includes('disfruta de los v') || description.length < 50;
    if (isBotBlock) {
      console.log('🚀 [Metadata] Bloqueo total detectado. Activando Invidious Bypass Robusto...');
      const invidiousResult = await getFromInvidious(videoId);
      if (invidiousResult.success) {
        title = invidiousResult.title || title;
        description = invidiousResult.description || description;
        return res.status(200).json({
          success: true,
          title,
          description,
          source: 'invidious-robust'
        });
      }
    }

    // Clean HTML entities
    const clean = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    
    return res.status(200).json({
      success: true,
      title: clean(title),
      description: clean(description),
      source: 'scrape-native'
    });

  } catch (error) {
    console.warn('❌ [Metadata] YouTube falló. Intentando Invidious Fallback (v487)...');
    try {
        const invidiousResult = await getFromInvidious(videoId);
        if (invidiousResult.success) {
            return res.status(200).json({
                success: true,
                title: invidiousResult.title,
                description: invidiousResult.description,
                source: 'invidious-emergency'
            });
        }
    } catch (e) {}
    return res.status(200).json({ success: false, error: 'Bypass fallido totalmente' });
  }
}

