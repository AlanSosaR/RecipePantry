/**
 * Google Drive Extractor Service
 * Extrae contenido de archivos de Google Drive (.txt, .docx, spreadsheets, images).
 */

export async function extractFromGoogleDrive(driveUrl) {
  try {
    console.log(`📥 [Google Drive] Intentando extraer: ${driveUrl}`);

    // Extraer el ID del archivo de la URL
    let fileId = null;
    const patterns = [
      /\/d\/([a-zA-Z0-9-_]+)/,  // /d/FILE_ID/
      /id=([a-zA-Z0-9-_]+)/,     // ?id=FILE_ID
      /\/file\/d\/([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
      const match = driveUrl.match(pattern);
      if (match) {
        fileId = match[1];
        break;
      }
    }
    
    if (!fileId) throw new Error('ID de archivo de Google Drive no válido');
    
    // Obtener token de acceso de OAuth (asumiendo que ya se hizo el login)
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) throw new Error('No se encontró token de acceso de Google. Inicia sesión primero.');
    
    // Obtener metadatos del archivo
    const metaResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    if (!metaResp.ok) {
      const errorData = await metaResp.json();
      throw new Error(`Error de Google Drive API: ${errorData.error?.message || 'Error desconocido'}`);
    }
    
    const metadata = await metaResp.json();
    const { name, mimeType } = metadata;
    
    console.log(`📂 [Google Drive] Archivo detectado: ${name} (${mimeType})`);

    let content = '';
    
    // Manejar diferentes tipos de archivo
    if (mimeType === 'text/plain') {
      const fileResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      content = await fileResp.text();
      
    } else if (mimeType === 'application/vnd.google-apps.document' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Si es Google Doc nativo, exportar como texto o docx
      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      
      // Si es .docx real, descargarlo y usar el parser
      if (mimeType.includes('officedocument')) {
        const arrayBuffer = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ).then(r => r.arrayBuffer());
        
        const { extractTextFromDocx } = await import('../utils/docx-parser.js');
        content = await extractTextFromDocx(arrayBuffer);
      } else {
        const fileResp = await fetch(downloadUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        content = await fileResp.text();
      }
      
    } else if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') {
      // Google Sheets o CSV - exportar como CSV
      let downloadUrl = mimeType.includes('spreadsheet')
        ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`
        : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        
      const csvResp = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      content = await csvResp.text();
      
    } else if (mimeType.startsWith('image/')) {
      // Imagen - enviar a Gemini Vision para OCR
      const imageResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const blob = await imageResp.blob();
      const base64Image = await blobToBase64(blob);
      
      const { structureRecipeFromImage } = await import('./gemini-recipe-structurer.js');
      const result = await structureRecipeFromImage(base64Image, mimeType);
      
      return {
        type: 'image',
        platform: 'gdrive',
        mimeType: mimeType,
        fileName: name,
        content: result.content || '',
        sourceUrl: driveUrl,
        structuredRecipe: result.recipe,
        success: result.success
      };
    } else {
      throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
    }
    
    if (!content) {
      throw new Error('No se pudo extraer contenido del archivo de Google Drive');
    }
    
    return {
      type: 'document',
      platform: 'gdrive',
      mimeType: mimeType,
      fileName: name,
      content: content,
      sourceUrl: driveUrl,
      success: true
    };
    
  } catch (error) {
    console.error('❌ Error en extractor de Google Drive:', error);
    return {
      type: 'error',
      platform: 'gdrive',
      error: error.message,
      sourceUrl: driveUrl,
      success: false
    };
  }
}

async function getGoogleAccessToken() {
  // Primero intentar de localStorage (OAuth flow de la App)
  let token = localStorage.getItem('google_access_token');
  
  // Si no está, tal vez está en la sesión de Supabase si se usó Google Provider
  if (!token) {
    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      if (session?.provider_token) {
        token = session.provider_token;
      }
    } catch (e) {}
  }
  
  return token;
}

async function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
