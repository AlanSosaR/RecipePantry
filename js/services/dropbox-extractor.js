/**
 * Dropbox Extractor Service
 * Extrae contenido de archivos de Dropbox (.txt, .docx, spreadsheets, images).
 */

export async function extractFromDropbox(dropboxUrl) {
  try {
    console.log(`📥 [Dropbox] Intentando extraer: ${dropboxUrl}`);

    // ID de archivo (Path)
    let filePath = null;
    
    if (dropboxUrl.includes('/dl=0') || dropboxUrl.includes('/dl=1')) {
      // Shared link format: https://www.dropbox.com/s/FILE_ID/filename?dl=0
      filePath = dropboxUrl.replace('?dl=0', '').replace('?dl=1', '').split('/s/')[1];
    } else if (dropboxUrl.includes('/file/')) {
      // App-specific format
      filePath = dropboxUrl.split('/file/')[1];
    }
    
    if (!filePath) throw new Error('URL de Dropbox no válida');
    
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
    const { name, mimeType } = metadata;
    
    console.log(`📂 [Dropbox] Archivo detectado: ${name} (${mimeType})`);

    // Convertir a link de descarga directa (?dl=1)
    const downloadUrl = dropboxUrl.includes('?dl=0')
      ? dropboxUrl.replace('?dl=0', '?dl=1')
      : dropboxUrl.includes('?dl=') ? dropboxUrl : dropboxUrl + (dropboxUrl.includes('?') ? '&dl=1' : '?dl=1');

    let content = '';
    
    // Manejar por MimeType
    if (mimeType === 'text/plain') {
      const fileResp = await fetch(downloadUrl);
      content = await fileResp.text();
      
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await fetch(downloadUrl).then(r => r.arrayBuffer());
      const { extractTextFromDocx } = await import('../utils/docx-parser.js');
      content = await extractTextFromDocx(arrayBuffer);
      
    } else if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') {
      const fileResp = await fetch(downloadUrl);
      content = await fileResp.text();
      
    } else if (mimeType.startsWith('image/')) {
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
      throw new Error(`Tipo de archivo no soportado en Dropbox: ${mimeType}`);
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
