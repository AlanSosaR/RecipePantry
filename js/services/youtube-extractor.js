/**
 * YouTube Extractor Service (v498)
 * ARQUITECTURA GRACEFUL PARTIAL: Prioriza obtener ALGO antes que fallar.
 * v498: Validación ultra-relajada (solo requiere título) y logs de diagnóstico por fuente.
 */

const INVIDIOUS_CLIENT_NODES = [
  'https://invidious.flokinet.to',
  'https://inv.tux.pizza',
  'https://invidious.privacydev.net',
  'https://invidious.perennialte.ch',
  'https://invidious.namazso.eu',
  'https://inv.ggc-project.de'
];

export async function extractFromYouTube(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error('URL de YouTube no válida');

    console.log(`📡 [YouTube v498] Master Orchestrator: ${videoId}`);

    // 1. INTENTO CLIENTE (Browser IP)
    let clientData = await extractYouTubeClientSide(videoId);
    console.log(`🔍 [Diagnóstico Cliente] Title=${!!clientData.title}, Desc=${clientData.description.length}, Trans=${clientData.transcript.length}`);

    // 2. INTENTO SERVIDOR (Vercel Cloud - si falta contenido de cuerpo)
    if (!clientData.description && !clientData.transcript) {
      console.warn('⚠️ [v498] Cliente sin contenido de cuerpo. Consultando Vercel Fallback...');
      const serverResult = await fetchYouTubeFromServer(videoId);
      if (serverResult && serverResult.success) {
        console.log(`🔍 [Diagnóstico Servidor] Title=${!!serverResult.title}, Desc=${serverResult.description?.length || 0}, Source=${serverResult.source}`);
        
        // Mezclar con inteligencia: preferir el que tenga contenido
        if ((serverResult.description?.length || 0) > clientData.description.length) {
            clientData.description = serverResult.description;
            clientData.source += `+server-desc:${serverResult.source}`;
        }
        if ((serverResult.transcript?.length || 0) > clientData.transcript.length) {
            clientData.transcript = serverResult.transcript;
            clientData.source += `+server-trans`;
        }
        clientData.title = serverResult.title || clientData.title;
      }
    }

    const title       = clientData.title || '';
    const description = clientData.description || '';
    const transcript  = clientData.transcript || '';
    const source      = clientData.source || 'hybrid';

    // Consolidar contenido (v498)
    const contentParts = [];
    if (title) contentParts.push(`Título: ${title}`);
    if (description) contentParts.push(`Descripción:\n${description}`);
    if (transcript)  contentParts.push(`Transcripción/Audio:\n${transcript}`);

    const content = contentParts.join('\n\n');
    
    // v498 VALIDACIÓN ULTRA-RELAJADA: Si hay título, hay esperanza.
    const hasSuccess = !!title; 
    const hasBody = description.length > 50 || transcript.length > 100;

    console.log(`📊 [YouTube v498] Resultado:
      ├─ Title: ${title || 'N/A'} (${title.length} chars)
      ├─ Body: ${hasBody ? '✅ Detectado' : '❌ Vacío (Necesita pegado manual)'}
      ├─ Source Chain: ${source}
      └─ Status: ${hasSuccess ? '✅ OK (Parcial/Total)' : '❌ ERROR'}`);

    if (!hasSuccess) {
        throw new Error('No se pudo identificar el video. Verifica la URL.');
    }

    return {
      type: 'video',
      platform: 'youtube',
      title,
      description,
      transcript,
      content,
      rawText: content,
      sourceUrl: videoUrl,
      success: true,
      source,
      isPartial: !hasBody,
      metadata: { title, isPartial: !hasBody }
    };

  } catch (error) {
    console.error('❌ [YouTube v498] Error:', error);
    return {
      type: 'error',
      platform: 'youtube',
      error: error.message,
      sourceUrl: videoUrl,
      success: false
    };
  }
}

/**
 * CLIENT MASTER (v498)
 */
async function extractYouTubeClientSide(videoId) {
  let res = { success: false, title: '', description: '', transcript: '', source: 'client' };

  // A. oEmbed (Rápido, siempre CORS Ok)
  try {
    const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembed.ok) {
      const d = await oembed.json();
      res.title = d.title;
      console.log(`✅ [Source: oEmbed] Title="${res.title}"`);
    }
  } catch (e) {
    console.warn('⚠️ [Source: oEmbed] Error CORS o Red');
  }

  // B. Invidious (Descripción + Audio)
  console.log('🔄 [Source: Invidious] Intentando descripción/audio...');
  for (const node of INVIDIOUS_CLIENT_NODES) {
    try {
      const api = `${node}/api/v1/videos/${videoId}?fields=title,description,captions`;
      const resp = await fetch(api, { signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        const d = await resp.json();
        res.title = d.title || res.title;
        res.description = d.description || '';
        res.source = `inv:${node.split('//')[1]}`;
        
        if (d.captions?.length > 0) {
            const cap = d.captions.find(c => c.label.includes('Español')) || d.captions[0];
            const curl = cap.url.startsWith('http') ? cap.url : `${node}${cap.url}`;
            const cr = await fetch(curl, { signal: AbortSignal.timeout(4000) });
            if (cr.ok) {
                const text = await cr.text();
                res.transcript = text.replace(/WEBVTT[\s\S]*?-->.*?\n/g, '').replace(/<[^>]*>/g, '').trim();
                console.log(`✅ [Source: Invidious] Audio OK (${res.transcript.length} chars)`);
            }
        }

        if (res.description || res.transcript) {
          res.success = true;
          break;
        }
      }
    } catch (e) {
      console.warn(`❌ [Source: Invidious] Nodo ${node} fallido`);
    }
  }

  return res;
}

async function fetchYouTubeFromServer(videoId) {
    try {
        const r = await fetch('/api/youtube-extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId }),
        });
        if (r.ok) return await r.json();
    } catch (e) {}
    return null;
}

function extractVideoId(url) {
  const p = [
    /(?:v=|v\/|vi\/|u\/\w\/|embed\/|shorts\/|youtu.be\/|be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /https:\/\/m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
  ];
  for (const reg of p) {
    const m = url.match(reg);
    if (m) return m[1];
  }
  return null;
}

function extractVideoId(url) {
  const p = [
    /(?:v=|v\/|vi\/|u\/\w\/|embed\/|shorts\/|youtu.be\/|be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /https:\/\/m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
  ];
  for (const reg of p) {
    const m = url.match(reg);
    if (m) return m[1];
  }
  return null;
}
