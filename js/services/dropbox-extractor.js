export class DropboxExtractor {
  static async extract(url) {
    let directUrl = url;
    if (url.includes('dropbox.com') && !url.includes('dl=1')) {
        directUrl = url.includes('?') ? url.replace(/dl=[0-9]/, 'dl=1') : url + '?dl=1';
        if (!directUrl.includes('dl=1')) directUrl += '&dl=1';
    }
    
    // Direct attempt to handle basic text or images
    try {
        const res = await fetch(directUrl);
        if (res.ok) {
            const blob = await res.blob();
            const type = blob.type;
            const extension = directUrl.split('/').pop().split('?')[0].split('.').pop().toLowerCase();

            if (type.includes('text') || ['rtf','txt','md','csv'].includes(extension)) {
                let text = await blob.text();
                // Basic cleanup for RTF if needed
                if (extension === 'rtf') text = text.replace(/\\([a-z]{1,32})(-?\d+)? ?/g, '').replace(/\{|\}/g, '');
                return {
                    type: 'document',
                    platform: 'dropbox',
                    content: text,
                    mimeType: type || 'text/plain',
                    sourceUrl: url
                };
            }

            // Non-text file that we might be able to handle (e.g. image for vision OCR)
            return {
                type: type.startsWith('image/') ? 'image' : 'document',
                platform: 'dropbox',
                content: blob,
                mimeType: type,
                sourceUrl: url,
                downloadUrl: directUrl
            };
        }
    } catch(e) {
        console.warn("Dropbox direct download failed (CORS), trying proxy...");
    }

    try {
        // Fallback to proxy
        return await this.fetchViaProxy(directUrl);
    } catch(e) {
        throw new Error("No se pudo extraer el enlace de Dropbox automáticamente.");
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
    if(data.error) throw new Error(data.error);

    return {
        type: 'document',
        platform: 'dropbox',
        content: data.content || data.description || '',
        mimeType: 'text/plain',
        sourceUrl: url
    };
  }
}
