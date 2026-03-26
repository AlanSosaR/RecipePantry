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
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    const html = await res.text();
    
    // 1. OG Description
    const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    let content = ogDescMatch ? ogDescMatch[1] : "";

    // 2. Modern React Data (__UNIVERSAL_DATA_FOR_REHYDRATION__)
    const rehydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]+?)<\/script>/);
    if (rehydrationMatch) {
      try {
        const fullData = JSON.parse(rehydrationMatch[1]);
        const videoDetail = fullData?.__DEFAULT_SCOPE__?.["webapp.video-detail"];
        const itemStruct = videoDetail?.itemInfo?.itemStruct;
        
        if (itemStruct) {
          if (itemStruct.desc) content += "\n" + itemStruct.desc;
          
          // Transcription/Subtitles
          const subtitleInfos = itemStruct.video?.subtitleInfos;
          if (Array.isArray(subtitleInfos) && subtitleInfos.length > 0) {
            console.log(`[TikTok] Found ${subtitleInfos.length} subtitle tracks.`);
            // Priority: Spanish -> English -> First available
            const subTrack = subtitleInfos.find((s: any) => s.LanguageCode === 'es-US' || s.LanguageCode === 'es') || 
                             subtitleInfos.find((s: any) => s.LanguageCode?.startsWith('en')) ||
                             subtitleInfos[0];
            
            if (subTrack?.Url) {
              console.log(`[TikTok] Fetching subtitles from: ${subTrack.Url}`);
              const subRes = await fetch(subTrack.Url);
              const subData = await subRes.json();
              const transcriptText = subData.body?.map((line: any) => line.text).join(' ') || "";
              if (transcriptText) {
                content += "\nTRANSCRIPCIÓN DE TIKTOK:\n" + transcriptText;
              }
            }
          }
        }
      } catch (e) {
        console.error('[TikTok Rehydration Error]', e);
      }
    }

    // 3. Legacy SIGI_STATE
    const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">([\s\S]+?)<\/script>/);
    if (sigiMatch && !content.includes("TRANSCRIPCIÓN")) {
      try {
        const data = JSON.parse(sigiMatch[1]);
        if (data.ItemModule) {
          for (const key in data.ItemModule) {
            content += "\n" + data.ItemModule[key].desc;
          }
        }
      } catch (e) {}
    }

    return content.trim() || null;
  } catch (e) {
    console.error('[TikTok Error]', e);
    return null;
  }
}

// --- MAIN HANDLER ---
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { url: inputUrl, apiKey, lang = 'es' } = body;

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

    // 4. AI STRUCTURING (OpenRouter)
    if (apiKey && finalContent) {
      console.log(`[AI] Processing with OpenRouter (Lang: ${lang})...`);
      try {
        const systemPrompt = `Eres un experto en extracción de recetas. Extrae la información del texto proporcionado y devuélvela en formato JSON estricto.
IMPORTANTE: 
1. La respuesta DEBE estar en ${lang === 'es' ? 'Español' : 'Inglés'}.
2. Corrige las unidades de medida: asegúrate de que haya un ESPACIO entre el número y la unidad (ej: "100g" -> "100 g", "2l" -> "2 l").
3. Si el texto es una transcripción de video, ignora el saludo inicial y extrae solo ingredientes y pasos.
4. Si no se encuentra una receta, devuelve {"error": "No se detectó una receta"}.

Esquema JSON:
{
  "nombre": "Título de la receta",
  "ingredientes": [{"cantidad": "valor", "unidad": "unidad", "nombre": "ingrediente"}],
  "pasos": ["paso 1", "paso 2"],
  "servings": 4
}`;

        const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://recipe-pantry.vercel.app',
            'X-Title': 'Recipe Pantry'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `TEXTO A PROCESAR:\n${finalContent.substring(0, 15000)}` }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (!aiResponse.ok) {
          const aiErr = await aiResponse.text();
          throw new Error(`OpenRouter API Error: ${aiResponse.status} - ${aiErr}`);
        }

        const aiResult = await aiResponse.json();
        const structuredRecipe = JSON.parse(aiResult.choices[0].message.content);

        if (structuredRecipe.error) {
           throw new Error(structuredRecipe.error);
        }

        return new Response(
          JSON.stringify({ 
            ...structuredRecipe,
            success: true,
            url,
            isVideo,
            isCloudDoc,
            source_url: url
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );

      } catch (e) {
        console.error('[AI Error]', e);
        // Fallback to raw text if AI fails
        return new Response(
          JSON.stringify({ 
            text: finalContent.substring(0, 10000), 
            title, 
            url,
            isVideo,
            isCloudDoc,
            error: "AI Structure Failure",
            raw_ai: e.message
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Default response if no API key
    return new Response(
      JSON.stringify({ 
        text: finalContent.substring(0, 5000), 
        title, 
        url,
        isVideo,
        isCloudDoc
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Global Error]', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
