// services/dropbox-extractor.js - VERSIÓN DEFINITIVA

export async function extractFromDropbox(dropboxUrl) {
  try {
    console.log('🔍 [Dropbox] Analizando formato de URL...');
    
    // Parse URL moderna SCL y antiguas
    const { fileId, fileName, fileType } = parseDropboxUrl(dropboxUrl);
    
    if (!fileId) {
      throw new Error('No se pudo extraer el ID de archivo de la URL de Dropbox');
    }
    
    console.log(`✅ [Dropbox] ID extraído: ${fileId}, Tipo: ${fileType}`);
    
    // Convertir a URL de descarga directa
    const downloadUrl = convertToDownloadUrl(dropboxUrl);
    console.log(`📥 [Dropbox] URL de descarga: ${downloadUrl}`);
    
    // v457: Descargar el archivo a través del PROXY para evitar CORS
    console.log('⬇️ [Dropbox] Descargando archivo vía Proxy...');
    const proxyUrl = `/api/dropbox-metadata?url=${encodeURIComponent(downloadUrl)}&content=true`;
    
    const fileResponse = await fetch(proxyUrl);
    
    if (!fileResponse.ok) {
      throw new Error(`Error descargando archivo vía proxy: HTTP ${fileResponse.status}`);
    }
    
    const proxyData = await fileResponse.json();
    if (!proxyData.success || !proxyData.content) {
      throw new Error(proxyData.error || 'No se pudo obtener el contenido del archivo vía proxy');
    }

    console.log('✅ [Dropbox] Archivo obtenido exitosamente vía Proxy');
    
    // v457: Procesar según tipo de archivo usando CONTENIDO DEL PROXY (CORS-friendly)
    let content = '';
    
    if (fileType === 'rtf') {
      content = extractTextFromRTF(proxyData.content);
      console.log('✅ [Dropbox] Texto extraído de RTF');
    } else if (['jpg', 'png', 'jpeg', 'gif', 'webp'].includes(fileType)) {
      // Imagen - usar Gemini Vision OCR
      const mimeType = `image/${fileType === 'jpg' ? 'jpeg' : fileType}`;
      return await extractFromImageWithVision(proxyData.content, mimeType, downloadUrl, fileName);
    } else if (fileType === 'docx') {
      // Word: el proxy ya nos dio el texto o base64
      content = proxyData.content;
      console.log('✅ [Dropbox] Contenido DOCX obtenido vía Proxy');
    } else {
      // TXT, CSV u otros
      content = proxyData.content;
      console.log(`✅ [Dropbox] Contenido ${fileType.toUpperCase()} obtenido vía Proxy`);
    }
    
    if (!content || content.trim().length === 0) {
      throw new Error('No se pudo extraer contenido del archivo');
    }
    
    // Limpiar contenido extraído
    content = cleanExtractedContent(content);
    
    console.log(`✅ [Dropbox] Contenido extraído: ${content.length} caracteres`);
    
    return {
      type: 'document',
      platform: 'dropbox',
      fileName: fileName,
      fileType: fileType,
      content: content,
      sourceUrl: dropboxUrl,
      success: true
    };
    
  } catch (error) {
    console.error('❌ Error en extractor de Dropbox:', error);
    return {
      type: 'error',
      platform: 'dropbox',
      error: error.message,
      sourceUrl: dropboxUrl,
      success: false
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
  
  // Formato SCL moderno: /scl/fi/([a-zA-Z0-9]+)/([^/?]+)
  const sclMatch = url.match(/\/scl\/fi\/([a-zA-Z0-9]+)\/([^/?]+)/);
  if (sclMatch) {
    fileId = sclMatch[1];
    fileName = decodeURIComponent(sclMatch[2]);
    fileType = fileName.split('.').pop().toLowerCase();
    console.log(`✅ [Dropbox] Formato SCL detectado`);
    return { fileId, fileName, fileType };
  }
  
  // Formato antiguo: /s/([a-zA-Z0-9]+)/([^/?]+)
  const sMatch = url.match(/\/s\/([a-zA-Z0-9]+)\/([^/?]+)/);
  if (sMatch) {
    fileId = sMatch[1];
    fileName = decodeURIComponent(sMatch[2]);
    fileType = fileName.split('.').pop().toLowerCase();
    console.log(`✅ [Dropbox] Formato /s/ detectado`);
    return { fileId, fileName, fileType };
  }
  
  // Formato /file/: /file/d/([a-zA-Z0-9]+)/...
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9]+)\/([^/?]+)/);
  if (fileMatch) {
    fileId = fileMatch[1];
    fileName = decodeURIComponent(fileMatch[2]);
    fileType = fileName.split('.').pop().toLowerCase();
    console.log(`✅ [Dropbox] Formato /file/d/ detectado`);
    return { fileId, fileName, fileType };
  }
  
  // Si no coincide ninguno, intentar extraer ID y nombre del path
  console.warn(`⚠️ [Dropbox] Formato no reconocido, intentando análisis alternativo...`);
  
  return { fileId: null, fileName: '', fileType: '' };
}

/**
 * Convierte URL de Dropbox a URL de descarga directa
 */
function convertToDownloadUrl(url) {
  // Si ya tiene ?dl=1, está listo
  if (url.includes('?dl=1')) {
    return url;
  }
  
  // Reemplazar ?dl=0 con ?dl=1
  if (url.includes('?dl=0')) {
    return url.replace('?dl=0', '?dl=1');
  }
  
  // Si no tiene dl parameter, agregarlo
  if (url.includes('?')) {
    return url + '&dl=1';
  } else {
    return url + '?dl=1';
  }
}

/**
 * Extrae texto de un archivo RTF
 * RTF es un formato de texto enriquecido que contiene comandos de formato
 */
function extractTextFromRTF(rtfText) {
  try {
    // Eliminar cabecera RTF
    let text = rtfText.replace(/^\\rtf[0-9]?\\[^\\}]+/, '');
    
    // Eliminar caracteres de control RTF
    text = text.replace(/\\/g, ' '); // Reemplazar backslashes
    text = text.replace(/[{}]/g, ''); // Eliminar llaves
    text = text.replace(/\s+/g, ' '); // Colapsar espacios múltiples
    
    // Limpiar caracteres especiales
    text = text.replace(/\\\'[0-9a-f]{2}/g, (match) => {
      try {
        return String.fromCharCode(parseInt(match.slice(2), 16));
      } catch {
        return '';
      }
    });
    
    // Decodificar entidades comunes
    text = text
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
    
    // Limpiar más controles RTF residuales
    text = text.replace(/\*?\\[a-z]+[0-9]*/gi, ' ');
    text = text.replace(/[^\x20-\x7E\n]/g, ''); // Mantener solo ASCII imprimible
    
    return text.trim();
    
  } catch (error) {
    console.error('Error extrayendo RTF:', error);
    // Fallback: retornar el texto original sin procesar
    return rtfText;
  }
}

/**
 * Extrae texto de imágenes usando Gemini Vision OCR
 */
async function extractFromImageWithVision(base64Image, mimeType, sourceUrl, fileName) {
  try {
    console.log('🔍 [Dropbox] Enviando imagen a Gemini Vision para OCR...');
    
    const apiKey = localStorage.getItem('openrouter_api_key');
    if (!apiKey) throw new Error('No API key found');
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              },
              {
                type: 'text',
                text: `Analiza esta imagen de una receta culinaria. Extrae TODO el texto visible incluyendo:
- Nombre de la receta
- Ingredientes con cantidades y unidades
- Pasos de preparación
- Tiempo de preparación y cocción
- Número de porciones
- Cualquier otra información relevante

Responde en formato texto plano, bien estructurado y legible.`
              }
            ]
          }
        ],
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini Vision error: ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    const extractedText = data.choices[0].message.content;
    
    console.log('✅ [Dropbox] OCR completado');
    
    return {
      type: 'image',
      platform: 'dropbox',
      fileName: fileName,
      fileType: 'image',
      content: extractedText,
      sourceUrl: sourceUrl,
      success: true
    };
    
  } catch (error) {
    console.error('❌ Error en OCR Gemini Vision:', error);
    return {
      type: 'error',
      platform: 'dropbox',
      error: `OCR error: ${error.message}`,
      sourceUrl: sourceUrl,
      success: false
    };
  }
}

/**
 * Extrae texto de PDFs usando Gemini Vision
 */
async function extractFromPdfWithVision(base64Pdf, sourceUrl, fileName) {
  try {
    console.log('📄 [Dropbox] Enviando PDF a Gemini Vision...');
    
    const apiKey = localStorage.getItem('openrouter_api_key');
    if (!apiKey) throw new Error('No API key found');
    
    // Para PDFs, usar un endpoint de server-side o intentar con visión
    // Nota: Algunos modelos no soportan PDF directamente, necesitaría conversión
    console.warn('⚠️ [Dropbox] PDF requiere procesamiento server-side');
    
    return {
      type: 'error',
      platform: 'dropbox',
      error: 'PDF processing requires server-side setup. Please convert to image or text.',
      sourceUrl: sourceUrl,
      success: false
    };
    
  } catch (error) {
    console.error('❌ Error procesando PDF:', error);
    return {
      type: 'error',
      platform: 'dropbox',
      error: error.message,
      sourceUrl: sourceUrl,
      success: false
    };
  }
}

/**
 * Limpia el contenido extraído
 */
function cleanExtractedContent(content) {
  if (!content) return '';
  
  // Eliminar líneas vacías múltiples
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Trim
  content = content.trim();
  
  return content;
}

/**
 * Convierte Blob a Base64
 */
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
