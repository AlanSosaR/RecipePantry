/**
 * YouTube Extractor Service (v497)
 * ARQUITECTURA CLIENT-SIDE: Extrae datos directamente desde el navegador del usuario.
 * Ventaja: Evita el bloqueo de IPs de servidores (como Vercel) por parte de YouTube.
 */

// Instancias de Invidious que permiten CORS (crítico para fetch desde navegador)
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

    console.log(`📡 [YouTube v497] Master Orchestrator: ${videoId}`);

    // INTENTO 1: Directamente en el Cliente (Navegador IP)
    let clientData = await extractYouTubeClientSide(videoId);

    // INTENTO 2: Si el cliente no obtuvo "cuerpo" (desc o audio), usar Vercel
    if (!clientData.success || (!clientData.description && !clientData.transcript)) {
      console.warn('⚠️ [v497] Extracción cliente insuficiente. Saltando a Vercel Cloud Bypass...');
      const serverResult = await fetchYouTubeFromServer(videoId);
      if (serverResult && serverResult.success) {
        // Mezclar datos: preferir lo que tenga más contenido
        if ((serverResult.description?.length || 0) > (clientData.description?.length || 0)) {
            clientData.description = serverResult.description;
        }
        if ((serverResult.transcript?.length || 0) > (clientData.transcript?.length || 0)) {
            clientData.transcript = serverResult.transcript;
        }
        clientData.source += `+server:${serverResult.source}`;
        clientData.success = true;
      }
    }

    const title       = clientData.title || '';
    const description = clientData.description || '';
    const transcript  = clientData.transcript || '';
    const source      = clientData.source || 'client-unknown';

    // Consolidación de texto final
    const contentParts = [];
    if (title) contentParts.push(`Título: ${title}`);
    if (description) contentParts.push(`Descripción:\n${description}`);
    if (transcript)  contentParts.push(`Transcripción/Audio:\n${transcript}`);

    const content = contentParts.join('\n\n');
    
    // Validación de viabilidad para Gemini
    const isViable = !!(title && (description.length > 50 || transcript.length > 100));

    console.log(`📊 [YouTube v497] Diagnóstico Final:
      ├─ Title: ${title.length} chars
      ├─ Desc: ${description.length} chars
      ├─ Audio: ${transcript.length} chars
      ├─ Source: ${source}
      └─ Viable: ${isViable ? '✅ SÍ' : '❌ NO'}`);

    if (!isViable && !description && !transcript) {
        throw new Error('YouTube ha bloqueado el acceso a los datos del video. Por favor copia la descripción manualmente.');
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
      metadata: { title }
    };

  } catch (error) {
    console.error('❌ [YouTube v497] Error Crítico:', error);
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
 * CLIENT-SIDE MASTER: Solo corre en el navegador
 */
async function extractYouTubeClientSide(videoId) {
  let res = { success: false, title: '', description: '', transcript: '', source: 'client' };

  // A. oEmbed (Título y Miniatura: Siempre funciona via CORS)
  try {
    const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembed.ok) {
      const d = await oembed.json();
      res.title = d.title;
      console.log('✅ [Client] oEmbed Ok');
    }
  } catch (e) {}

  // B. Invidious CORS Bypassing (Descripción y Audio)
  for (const node of INVIDIOUS_CLIENT_NODES) {
    try {
      console.log(`🔄 [Client] Probando nodo: ${node}`);
      const api = `${node}/api/v1/videos/${videoId}?fields=title,description,captions,descriptionHtml`;
      const resp = await fetch(api, { signal: AbortSignal.timeout(7000) });
      
      if (resp.ok) {
        const data = await resp.json();
        res.title = data.title || res.title;
        res.description = data.description || '';
        res.source = `client-invidious:${node.split('//')[1]}`;

        // Intentar obtener Captions (Transcripción)
        if (data.captions && data.captions.length > 0) {
            const cap = data.captions.find(c => c.label.includes('Español') || c.label.includes('Inglés')) || data.captions[0];
            const capUrl = cap.url.startsWith('http') ? cap.url : `${node}${cap.url}`;
            const capR = await fetch(capUrl, { signal: AbortSignal.timeout(4000) });
            if (capR.ok) {
                const text = await capR.text();
                // Limpiar etiquetas de subtítulos
                res.transcript = text.replace(/WEBVTT[\s\S]*?-->.*?\n/g, '').replace(/<[^>]*>/g, '').trim();
                console.log(`✅ [Client] Audio recuperado: ${res.transcript.length} chars`);
            }
        }

        if (res.description.length > 50 || res.transcript.length > 100) {
          res.success = true;
          break; 
        }
      }
    } catch (e) {
      console.warn(`⚠️ [Client] Nodo fallido: ${e.message}`);
    }
  }

  return res;
}

/**
 * SERVER REDUNDANCY (Vercel)
 */
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
