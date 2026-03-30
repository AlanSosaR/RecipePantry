export class YouTubeExtractor {
  static extractVideoId(url) {
    const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  static async extract(url) {
    const videoId = this.extractVideoId(url);
    if (!videoId) throw new Error('ID de video de YouTube no válido');

    let result;
    try {
      // 1. Primario: Vía Supabase Proxy
      result = await this.fetchViaProxy(url, videoId);
    } catch (e) {
      console.warn("YouTube proxy extraction failed, falling back to public oEmbed/AllOrigins...", e);
      // 2. Secundario: Scrapeo Fallback
      result = await this.fetchViaPublicFallback(url, videoId);
    }
    
    // Logging for traceability
    return result;
  }

  static async fetchViaProxy(url, videoId) {
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

    return {
      type: 'video',
      platform: 'youtube',
      title: data.title || '',
      description: data.description || data.content || '',
      transcript: data.subtitles || null,
      duration: data.duration || 0,
      sourceUrl: url
    };
  }

  static async fetchViaPublicFallback(url, videoId) {
    let title = "Video de YouTube";
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        title = oembedData.title || title;
      }
    } catch(err) {}

    let description = "";
    try {
       const htmlRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
       if (htmlRes.ok) {
          const htmlData = await htmlRes.json();
          const doc = new DOMParser().parseFromString(htmlData.contents, "text/html");
          const metaDesc = doc.querySelector('meta[name="description"]');
          if (metaDesc) {
            description = metaDesc.content;
          } else {
             const ogDesc = doc.querySelector('meta[property="og:description"]');
             if (ogDesc) description = ogDesc.content;
          }
       }
    } catch(err) {
       console.error("Fallback metadata fetch failed", err);
    }
    
    if(!description) {
        description = "No se pudo extraer la descripción automáticamente. Procesa manualmente o ingresa los ingredientes.";
    }

    return {
      type: 'video',
      platform: 'youtube',
      title: title,
      description: description,
      transcript: null,
      duration: 0,
      sourceUrl: url
    };
  }
}
