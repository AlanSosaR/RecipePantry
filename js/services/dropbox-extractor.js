/**
 * Dropbox Extractor Service
 * Extrae contenido de archivos de Dropbox (.txt, .docx, spreadsheets, images).
 */

export async function extractFromDropbox(dropboxUrl) {
  try {
    console.log(`📥 [Dropbox] Intentando extraer: ${dropboxUrl}`);

    // La URL de Dropbox puede tener varios formatos (/s/, /scl/fi/, etc.)
    // No necesitamos extraer el filePath obligatoriamente si el proxy acepta la URL completa.
    const isDropbox = dropboxUrl.includes('dropbox.com');
    
    if (!isDropbox) throw new Error('URL de Dropbox no válida');
    
    // Obtener token
    const accessToken = localStorage.getItem('dropbox_access_token');
    if (!accessToken) throw new Error('No se encontró token de acceso de Dropbox. Inicia sesión primero.');
    
    // El proxy en /api/dropbox-metadata nos dará el nombre y mimeType
    const metaResp = await fetch('/api/dropbox-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ url: dropboxUrl })
    });
    
    if (!metaResp.ok) {
      throw new Error('No se pudo obtener metadatos del archivo desde el servidor');
    }
    
    const metadata = await metaResp.json();
    const { name, mimeType, content: proxiedContent } = metadata;
    
    console.log(`📂 [Dropbox] Archivo detectado: ${name} (${mimeType})`);

    // SI el proxy ya nos dio el contenido, usarlo directamente (para Texto/RTF)
    if (proxiedContent) {
      console.log(`✅ [Dropbox] Contenido obtenido vía proxy`);
      return {
        type: 'document',
        platform: 'dropbox',
        mimeType: mimeType,
        fileName: name,
        content: proxiedContent,
        sourceUrl: dropboxUrl,
        success: true
      };
    }

    // Convertir a link de descarga directa (?dl=1) si necesitamos fetch local (Docs/Images)
    const downloadUrl = dropboxUrl.includes('?dl=0')
      ? dropboxUrl.replace('?dl=0', '?dl=1')
      : dropboxUrl.includes('?dl=') ? dropboxUrl : dropboxUrl + (dropboxUrl.includes('?') ? '&dl=1' : '?dl=1');

    let content = '';
    
    // Manejar por MimeType o Extensión
    const lowName = name.toLowerCase();
    
    if (mimeType === 'text/plain' || lowName.endsWith('.txt') || lowName.endsWith('.rtf') || lowName.endsWith('.csv')) {
      const fileResp = await fetch(downloadUrl);
      content = await fileResp.text();
      
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowName.endsWith('.docx')) {
      const arrayBuffer = await fetch(downloadUrl).then(r => r.arrayBuffer());
      const { extractTextFromDocx } = await import('../utils/docx-parser.js');
      content = await extractTextFromDocx(arrayBuffer);
      
    } else if (mimeType.includes('spreadsheet') || mimeType === 'text/csv' || lowName.endsWith('.xlsx') || lowName.endsWith('.csv')) {
      const fileResp = await fetch(downloadUrl);
      content = await fileResp.text();
      
    } else if (mimeType.startsWith('image/') || lowName.match(/\.(jpg|jpeg|png|webp)$/)) {
      const imageResp = await fetch(downloadUrl);
      const blob = await imageResp.blob();
      const base64Image = await blobToBase64(blob);
      
      const { structureRecipeFromImage } = await import('./gemini-recipe-structurer.js');
      const result = await structureRecipeFromImage(base64Image, mimeType);
      
      return {
        type: 'image',
        platform: 'dropbox',
        mimeType: mimeType,
        fileName: name,
        content: result.content || '',
        sourceUrl: dropboxUrl,
        structuredRecipe: result.recipe,
        success: result.success
      };
    } else {
      throw new Error(`Tipo de archivo no soportado en Dropbox: ${mimeType || name}`);
    }
    
    if (!content) {
      throw new Error('No se pudo extraer contenido del archivo de Dropbox');
    }
    
    return {
      type: 'document',
      platform: 'dropbox',
      mimeType: mimeType,
      fileName: name,
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

async function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
