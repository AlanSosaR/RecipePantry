import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- HELPERS ---
function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchYoutubeTranscript(videoUrl: string): Promise<string | null> {
  try {
    const videoIdMatch = videoUrl.match(/(?:v=|\/embed\/|\/watch\?v=|\/shorts\/|^v=|^)([\w-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    if (!videoId) return null;

    console.log(`[YouTube] Fetching transcript for ${videoId}...`);
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36' }
    });
    const html = await pageRes.text();

    const splittedHtml = html.split('"captions":');
    if (splittedHtml.length <= 1) return null;

    const captionsPart = splittedHtml[1].split(',"videoDetails"')[0];
    const captionsJson = JSON.parse(captionsPart);
    const captionTracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) return null;

    const track = captionTracks.find((t: any) => t.languageCode === 'es') || 
                  captionTracks.find((t: any) => t.languageCode === 'en') || 
                  captionTracks[0];

    const transcriptRes = await fetch(track.baseUrl);
    const xml = await transcriptRes.text();
    
    return xml.replace(/<text[^>]*>/g, '').replace(/<\/text>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '');
  } catch (e) {
    console.error('[YouTube Error]', e);
    return null;
  }
}

async function fetchTikTokMetadata(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1' }
    });
    const html = await res.text();
    
    const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    const ogDesc = ogDescMatch ? ogDescMatch[1] : null;

    const jsonMatch = html.match(/<script id="SIGI_STATE" type="application\/json">([\s\S]+?)<\/script>/);
    let extraData = "";
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        for (const key in data.ItemModule) {
          extraData += data.ItemModule[key].desc + "\n";
        }
      } catch (e) {}
    }

    return (ogDesc || "") + "\n" + extraData;
  } catch (e) {
    return null;
  }
}

// --- MAIN HANDLER ---
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { url: inputUrl } = await req.json();
    if (!inputUrl) throw new Error('URL required');

    let url = inputUrl;
    let isVideo = false;
    let videoType = '';
    let isCloudDoc = false;

    // 1. Detect and Resolve
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      isVideo = true;
      videoType = 'youtube';
    } else if (url.includes('tiktok.com')) {
      isVideo = true;
      videoType = 'tiktok';
      if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
         const resolveRes = await fetch(url, { redirect: 'follow' });
         url = resolveRes.url;
      }
    } 
    // Google Drive Support
    else if (url.includes('docs.google.com/document')) {
      isCloudDoc = true;
      // Transform to text export
      url = url.replace(/\/edit.*$/, '/export?format=txt');
    }
    // Dropbox Support
    else if (url.includes('dropbox.com')) {
      isCloudDoc = true;
      // Force raw download
      if (url.includes('?dl=0')) url = url.replace('?dl=0', '?raw=1');
      else if (!url.includes('?')) url += '?raw=1';
      else if (!url.includes('raw=1')) url += '&raw=1';
    }

    let finalContent = "";
    let title = isCloudDoc ? "Documento de la Nube" : "Receta de Video";

    // 2. Specialized Fetching
    if (videoType === 'youtube') {
      const transcript = await fetchYoutubeTranscript(url);
      if (transcript) finalContent = `TRANSCRIPCIÓN DE YOUTUBE:\n${transcript}`;
    } else if (videoType === 'tiktok') {
      const desc = await fetchTikTokMetadata(url);
      if (desc) finalContent = `DESCRIPCIÓN DE TIKTOK:\n${desc}`;
    } else if (isCloudDoc) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudo acceder al documento. Asegúrate de que sea Público.');
      finalContent = await res.text();
    }

    // 3. Fallback to HTML Scraping
    if (!finalContent) {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36' },
        redirect: 'follow',
      });
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : title;
      finalContent = cleanHtml(html);
    }

    return new Response(
      JSON.stringify({ 
        text: finalContent.substring(0, 20000), 
        title, 
        url,
        isVideo,
        isCloudDoc
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
