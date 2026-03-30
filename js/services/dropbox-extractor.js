// services/dropbox-extractor.js - VERSIÓN DEFINITIVA

import { fetchWithRetry } from '../utils/fetch-retry.js';

export async function extractFromDropbox(dropboxUrl) {
  try {
    console.log('🔍 [Dropbox] Normalizando formato de URL...');
    
    // Normalizar la URL como solicitó el usuario
    let downloadUrl = dropboxUrl;
    downloadUrl = downloadUrl.replace(/www\.dropbox\.com/i, 'dl.dropboxusercontent.com');
    downloadUrl = downloadUrl.replace(/dl=0/i, 'dl=1');
    if (!downloadUrl.includes('dl=')) {
        downloadUrl += downloadUrl.includes('?') ? '&dl=1' : '?dl=1';
    }

    const { fileId, fileName, fileType } = parseDropboxUrl(dropboxUrl);
    
    if (!fileId) {
       // Log, no throw
       console.warn('⚠️ [Dropbox] No se pudo parsear el ID, pero se intentará descargar igual con la URL normalizada.');
    } else {
       console.log(`✅ [Dropbox] ID extraído: ${fileId}, Tipo: ${fileType}`);
    }
    
    console.log(`📥 [Dropbox] URL de descarga directa: ${downloadUrl}`);
    
    // Usar la URL proxy para evitar CORS, pasando la URL normalizada
    console.log('⬇️ [Dropbox] Descargando archivo vía API/Proxy (o Directamente)...');
    
    // Intentaremos primero descargar directamente con la URL normalizada por si el server es CORS-friendly,
    // y si falla, usaremos el proxy interno. Pero, por seguridad y siguiendo las reqs, usaremos fetchWithRetry.
    // Ya que dl.dropboxusercontent.com suele rechazar solicitudes directas JS (CORS),
    // usaremos el proxy pasando la URL ya normalizada.
    
    const proxyUrl = `/api/dropbox-metadata?url=${encodeURIComponent(downloadUrl)}&content=true`;
    
    let fileResponse;
    try {
      fileResponse = await fetchWithRetry(proxyUrl, {}, 1);
    } catch (netErr) {
       throw new Error(`Error de red al contactar proxy Dropbox: ${netErr.message}`);
    }
    
    if (!fileResponse.ok) {
      throw new Error(`Error descargando archivo vía proxy: HTTP ${fileResponse.status}`);
    }
    
    const proxyData = await fileResponse.json();
    if (!proxyData.success || !proxyData.content) {
      throw new Error(proxyData.error || 'No se pudo obtener el contenido del archivo vía proxy');
    }

    console.log('✅ [Dropbox] Archivo obtenido exitosamente');
    
    let content = '';
    
    if (fileType === 'rtf') {
      content = extractTextFromRTF(proxyData.content);
      console.log('✅ [Dropbox] Texto extraído de RTF');
    } else if (['jpg', 'png', 'jpeg', 'gif', 'webp'].includes(fileType)) {
      // Imagen - usar Gemini Vision OCR
      const mimeType = `image/${fileType === 'jpg' ? 'jpeg' : fileType}`;
      const visionResult = await extractFromImageWithVision(proxyData.content, mimeType, downloadUrl, fileName || 'image');
      
      // Manejar el fallback si vision falla
      if (!visionResult.success) {
         throw new Error(visionResult.error || "Fallo OCR de imagen en Dropbox");
      }
      return visionResult;
    } else {
      // TXT, DOCX, CSV u otros. El proxy ya lo procesa o lo trae crudo.
      content = proxyData.content;
      console.log(`✅ [Dropbox] Contenido obtenido.`);
    }
    
    if (!content || content.trim().length === 0) {
      throw new Error('No se pudo extraer contenido legible del archivo');
    }
    
    content = cleanExtractedContent(content);
    console.log(`✅ [Dropbox] Contenido extraído: ${content.length} caracteres`);
    
    return {
      success: true,
      content: content,
      type: 'document',
      platform: 'dropbox',
      fileName: fileName,
      fileType: fileType,
      sourceUrl: dropboxUrl
    };
    
  } catch (error) {
    console.error('❌ Error controlado en extractor de Dropbox:', error);
    
    return {
      success: false,
      error: error.message,
      stage: 'dropbox_extraction',
      fallbackAttempted: true,
      partialData: null // No hay data parcial si falló la descarga
    };
  }
}

/**
 * Parsea URLs de Dropbox (formatos SCL moderno, antiguo /s/, /file/)
 */
function parseDropboxUrl(url) {
  let fileId = null;
  let fileName = '';
  let fileType = '';
  
  // Formato moderno SCL guiado
  const sclMatch = url.match(/\/scl\/fi\/([a-zA-Z0-9]+)\/([^/?]+)/);
  if (sclMatch) {
    fileId = sclMatch[1];
    fileName = decodeURIComponent(sclMatch[2]);
    fileType = fileName.split('.').pop()?.toLowerCase() || '';
    return { fileId, fileName, fileType };
  }
  
  // Formato /s/
  const sMatch = url.match(/\/s\/([a-zA-Z0-9]+)\/([^/?]+)/);
  if (sMatch) {
    fileId = sMatch[1];
    fileName = decodeURIComponent(sMatch[2]);
    fileType = fileName.split('.').pop()?.toLowerCase() || '';
    return { fileId, fileName, fileType };
  }
  
  // Formato /file/d/
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9]+)\/([^/?]+)/);
  if (fileMatch) {
    fileId = fileMatch[1];
    fileName = decodeURIComponent(fileMatch[2]);
    fileType = fileName.split('.').pop()?.toLowerCase() || '';
    return { fileId, fileName, fileType };
  }
  
  return { fileId: null, fileName: '', fileType: '' };
}

/**
 * Extrae texto de un archivo RTF
 */
function extractTextFromRTF(rtfText) {
  try {
    let text = rtfText.replace(/^\\rtf[0-9]?\\[^\\}]+/, '');
    text = text.replace(/\\/g, ' '); 
    text = text.replace(/[{}]/g, ''); 
    text = text.replace(/\s+/g, ' '); 
    
    text = text.replace(/\\\'[0-9a-f]{2}/g, (match) => {
      try {
        return String.fromCharCode(parseInt(match.slice(2), 16));
      } catch {
        return '';
      }
    });
    
    text = text
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
    
    text = text.replace(/\*?\\[a-z]+[0-9]*/gi, ' ');
    text = text.replace(/[^\x20-\x7E\n]/g, ''); 
    
    return text.trim();
  } catch (error) {
    console.error('Error extrayendo RTF:', error);
    return rtfText;
  }
}

/**
 * Extrae texto de imágenes usando Gemini Vision OCR
 */
async function extractFromImageWithVision(base64Image, mimeType, sourceUrl, fileName) {
  try {
    const apiKey = localStorage.getItem('openrouter_api_key') || window.APP_SETTINGS?.openrouter_api_key;
    if (!apiKey) throw new Error('No API key found para OCR Visión');
    
    // Aquí podríamos usar fetchWithRetry, lo actualizamos!
    const response = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash:free',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              { type: 'text', text: `Extrae todo el texto de la receta y nada más.` }
            ]
          }
        ],
        temperature: 0.1
      })
    }, 1);
    
    if (!response.ok) {
      throw new Error(`Gemini Vision falló con HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const extractedText = data.choices[0].message.content;
    
    return {
      success: true,
      content: extractedText,
      type: 'image',
      platform: 'dropbox',
      fileName: fileName,
      fileType: 'image',
      sourceUrl: sourceUrl
    };
    
  } catch (error) {
    return {
      success: false,
      error: `OCR error: ${error.message}`,
      stage: 'dropbox_image_ocr',
      fallbackAttempted: true,
      partialData: null
    };
  }
}

function cleanExtractedContent(content) {
  if (!content) return '';
  return content.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}
