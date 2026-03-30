export class TikTokExtractor {
  static async extract(url) {
    let result;
    try {
      result = await this.fetchViaProxy(url);
    } catch (e) {
      console.warn("TikTok proxy extraction failed, falling back to public oEmbed...", e);
      result = await this.fetchViaPublicFallback(url);
    }
    return result;
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

    return {
      type: 'video',
      platform: 'tiktok',
      title: data.title || 'Video de TikTok',
      description: data.description || data.content || '',
      transcript: data.subtitles || null,
      sourceUrl: url
    };
  }

  static async fetchViaPublicFallback(url) {
    let title = "Video de TikTok";
    let description = "";
    
    try {
      const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        title = oembedData.title || title;
        description = title; // OEmbed mainly returns title as description for TikTok
      }
    } catch(err) {}

    // html meta tags description via allOrigins
    if (!description || description === "Video de TikTok") {
        try {
           const htmlRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
           if (htmlRes.ok) {
              const htmlData = await htmlRes.json();
              const doc = new DOMParser().parseFromString(htmlData.contents, "text/html");
              const metaDesc = doc.querySelector('meta[name="description"]');
              if (metaDesc) description = metaDesc.content;
           }
        } catch(err) {
           console.error("TikTok fallback metadata fetch failed", err);
        }
    }

    return {
      type: 'video',
      platform: 'tiktok',
      title: title,
      description: description || "No se pudo extraer la descripción. Por favor procesa manualmente.",
      transcript: null,
      sourceUrl: url
    };
  }
}
