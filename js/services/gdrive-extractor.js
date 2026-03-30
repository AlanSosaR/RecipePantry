export class GDriveExtractor {
  static extractFileId(url) {
    const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/) || url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  static async extract(url) {
    const fileId = this.extractFileId(url);
    if (!fileId) throw new Error('ID de archivo de Google Drive no válido');

    try {
      return await this.fetchViaProxy(url);
    } catch(e) {
      console.warn("GDrive proxy extraction failed", e);
      throw new Error("No se pudo extraer Google Drive automáticamente. Intenta descargar el archivo e importarlo manualmente.");
    }
  }

  static async fetchViaProxy(url) {
     const SUPABASE_URL = window.SUPABASE_URL || 'https://fsgfrqrerddmopojjcsw.supabase.co';
     const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
     if(!SUPABASE_ANON_KEY) throw new Error("No supabase anon key");

     const response = await fetch(`${SUPABASE_URL}/functions/v1/fetch-url`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ url })
    });
    
    if(!response.ok) throw new Error(`Proxy error ${response.status}`);
    const data = await response.json();
    
    if (data.error) throw new Error(data.error);
    
    if (data.downloadUrl && !data.description && !data.content) {
        // It's a binary file like an image that can be downloaded
        return {
            type: data.downloadUrl.includes('image') ? 'image' : 'document',
            platform: 'gdrive',
            content: null,
            downloadUrl: data.downloadUrl,
            mimeType: 'application/octet-stream',
            sourceUrl: url,
            metadata: data.title || 'Archivo de Google Drive'
        };
    } else {
        return {
            type: 'document',
            platform: 'gdrive',
            content: data.content || data.description || '',
            mimeType: 'text/plain',
            sourceUrl: url,
            metadata: data.title || 'Documento de Google Drive'
        };
    }
  }
}
