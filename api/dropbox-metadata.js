// api/dropbox-metadata.js - Vercel Serverless Function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  const authHeader = req.headers['authorization'];

  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    // If we have an auth header, use it to fetch formal metadata
    if (authHeader) {
      const response = await fetch('https://api.dropboxapi.com/2/sharing/get_shared_link_metadata', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });
      
      if (response.ok) {
        const metadata = await response.json();
        return res.status(200).json({
          success: true,
          name: metadata.name,
          mimeType: metadata.name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 
                    metadata.name.endsWith('.txt') ? 'text/plain' : 
                    metadata.name.endsWith('.csv') ? 'text/csv' : 
                    metadata.name.match(/\.(jpg|jpeg|png|webp)$/) ? 'image/' + metadata.name.split('.').pop() : 
                    'application/octet-stream'
        });
      }
    }

    // Fallback: Use head request or HTML parsing for public links
    const downloadUrl = url.replace('?dl=0', '?dl=1');
    const headResponse = await fetch(downloadUrl, { method: 'HEAD' });
    
    if (headResponse.ok) {
      const name = url.split('/').pop().split('?')[0];
      const contentType = headResponse.headers.get('content-type') || '';
      
      const isText = contentType.includes('text') || 
                     name.endsWith('.txt') || 
                     name.endsWith('.rtf') || 
                     name.endsWith('.csv');
                     
      let content = null;
      if (isText) {
        console.log(`📄 [Dropbox Proxy] Fetching text content for: ${name}`);
        const contentResp = await fetch(downloadUrl);
        if (contentResp.ok) {
          content = await contentResp.text();
        }
      }

      return res.status(200).json({
        success: true,
        name: decodeURIComponent(name),
        mimeType: contentType,
        content: content
      });
    }

    throw new Error('Dropbox metadata fetch failed');
  } catch (error) {
    console.error('❌ Error fetching Dropbox metadata:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
