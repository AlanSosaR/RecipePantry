/**
 * YouTube Invidious Fallback (v487)
 * Cuando YouTube bloquea directamente Vercel, usar instancias comunitarias de Invidious
 */

export const INVIDIOUS_INSTANCES = [
  'https://invidious.flokinet.to',
  'https://inv.tux.pizza',
  'https://invidious.privacydev.net',
  'https://invidious.perennialte.ch',
  'https://invidious.namazso.eu',
  'https://vid.plus.dy.fi',
  'https://y.com.sb',
];

const TIMEOUT = 12000; // 12 segundos por instancia (v496)

async function fetchWithTimeout(url, timeout = TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export async function getFromInvidious(videoId) {
  console.log(`🔍 [Invidious] Intentando con ${INVIDIOUS_INSTANCES.length} instancias comunitarias`);
  
  for (let i = 0; i < INVIDIOUS_INSTANCES.length; i++) {
    const instance = INVIDIOUS_INSTANCES[i];
    
    try {
      console.log(`🔄 [Invidious] Instancia ${i + 1}/${INVIDIOUS_INSTANCES.length}: ${instance}`);
      
      const url = `${instance}/api/v1/videos/${videoId}?fields=title,description,captions`;
      const response = await fetchWithTimeout(url);
      
      if (!response.ok) {
        console.log(`⚠️ [Invidious] Status ${response.status} en ${instance}`);
        continue;
      }
      
      const data = await response.json();
      
      if (!data.title) {
        console.log(`⚠️ [Invidious] Respuesta vacía de ${instance}`);
        continue;
      }
      
      console.log(`✅ [Invidious] Éxito en ${instance}`);
      
      // Extraer captions si están disponibles
      let captions = '';
      if (data.captions && Array.isArray(data.captions) && data.captions.length > 0) {
        try {
          // Intentar obtener la primera pista (usualmente la de mayor preferencia)
          const captionUrl = data.captions[0].url.startsWith('http') 
            ? data.captions[0].url 
            : `${instance}${data.captions[0].url}`;
            
          const captionResponse = await fetchWithTimeout(captionUrl);
          if (captionResponse.ok) {
            const vtt = await captionResponse.text();
            // Limpiar VTT y extraer solo texto
            captions = vtt
              .split('\n')
              .filter(line => !line.includes('-->') && line.trim().length > 0 && !line.includes('WEBVTT'))
              .join(' ')
              .substring(0, 3000); // Limitar a 3000 caracteres para no exceder prompts
          }
        } catch (e) {
          console.warn(`⚠️ [Invidious] Error obteniendo captions de ${instance}`);
        }
      }
      
      return {
        success: true,
        title: data.title || '',
        description: data.description || '',
        captions: captions,
        source: 'invidious',
        instance: instance
      };
      
    } catch (error) {
      console.warn(`❌ [Invidious] Error en ${instance}: ${error.message}`);
      continue;
    }
  }
  
  console.error('❌ [Invidious] El bypass total ha fallado en todas las instancias.');
  return { success: false };
}

// EXPORT para Vercel Function Endpoint (v487)
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const videoId = req.query.videoId || req.body?.videoId;
  
  if (!videoId) {
    return res.status(400).json({ error: 'Falta parametro videoId' });
  }
  
  try {
    const result = await getFromInvidious(videoId);
    return res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    return res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
}
