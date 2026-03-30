// api/dropbox-metadata.js - v459 (Definitive Proxy)
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Soporte para GET y POST
  let url = '';
  if (req.method === 'GET') {
    url = req.query.url;
  } else if (req.method === 'POST') {
    url = req.body?.url;
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!url) return res.status(400).json({ success: false, error: 'url is required' });

  try {
    console.log(`🔍 [Dropbox Proxy] Procesando: ${url}`);
    
    // 1. Normalizar URL de Dropbox
    const downloadUrl = normalizeDropboxUrl(url);
    console.log(`📥 [Dropbox Proxy] URL normalizada: ${downloadUrl}`);
    
    // 2. Descargar archivo
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Error de red: HTTP ${response.status}`);
    }
    
    const fileName = decodeURIComponent(url.split('/').pop().split('?')[0]);
    const contentType = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    let rawContent = decoder.decode(buffer);
    let finalContent = rawContent;

    // 3. Procesar RTF si es necesario
    if (fileName.toLowerCase().endsWith('.rtf') || contentType.includes('rtf')) {
      console.log('📄 [Dropbox Proxy] Detectado RTF, extrayendo texto...');
      finalContent = stripRtf(rawContent);
    }

    // 4. Respuesta Normalizada
    return res.status(200).json({
      success: true,
      name: fileName,
      mimeType: contentType,
      text: finalContent, // Campo solicitado por el usuario
      content: finalContent // Compatibilidad con frontend actual
    });

  } catch (error) {
    console.error('❌ Error [Dropbox Proxy]:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error'
    });
  }
}

/**
 * Normaliza URLs de Dropbox para descarga directa
 */
function normalizeDropboxUrl(url) {
  let dUrl = url;
  
  // Reemplazar dominio para descarga directa (Bypass HTML Preview)
  dUrl = dUrl.replace(/www\.dropbox\.com/, 'dl.dropboxusercontent.com');
  
  // Asegurar parámetro dl=1
  if (dUrl.includes('?')) {
    if (dUrl.includes('dl=0')) {
      dUrl = dUrl.replace('dl=0', 'dl=1');
    } else if (!dUrl.includes('dl=1')) {
      dUrl += '&dl=1';
    }
  } else {
    dUrl += '?dl=1';
  }
  
  return dUrl;
}

/**
 * Strips formatting from RTF text
 */
function stripRtf(rtf) {
  if (!rtf) return '';
  
  try {
    // 1. Eliminar grupos RTF no deseados (fichas, imágenes, etc)
    let text = rtf.replace(/\{\\*?\\[^{}]+\}/g, '');
    
    // 2. Eliminar comandos de control
    text = text.replace(/\\(?:[a-z]{1,32}(-?\d+)?|'[\da-f]{2}|[\n\r]|[^a-z])/gi, (match) => {
      // Manejar caracteres especiales \'XX
      if (match.startsWith("\\'")) {
        return String.fromCharCode(parseInt(match.substring(2), 16));
      }
      // Manejar saltos de línea rtf (\par, \line)
      if (match.includes('par') || match.includes('line')) return '\n';
      return '';
    });
    
    // 3. Eliminar llaves residuales y espacios múltiples
    text = text.replace(/[{}]/g, '');
    text = text.replace(/ +/g, ' ');
    text = text.replace(/\n\s*\n+/g, '\n\n');
    
    return text.trim();
  } catch (e) {
    console.warn('⚠️ Fallo en stripRtf, devolviendo raw:', e.message);
    return rtf.replace(/[{}]/g, '').replace(/\\[a-z0-9]+/gi, '').trim();
  }
}
