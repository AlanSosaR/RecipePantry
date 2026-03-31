/**
 * Gemini Recipe Structurer
 * Convierte cualquier texto o imagen en una receta estructurada usando Gemini.
 */

const RECIPE_STRUCTURE_PROMPT = `Eres un experto en análisis de recetas culinarias. Tu tarea es EXTRAER UNA RECETA del contenido proporcionado.

INSTRUCCIONES CRÍTICAS:
1. Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicaciones). 
2. Si el contenido proviene de una TRANSCRIPCIÓN de un video, presta mucha atención a lo que el orador dice que va a hacer ("agregamos la leche", "batimos los huevos") para extraer los ingredientes y pasos, incluso si no están en una lista formal.
3. COMPLETA todos los campos del JSON (usa null si no están disponibles).
4. Si hay varias versiones de la receta, usa la más detallada.

CONTENIDO A ANALIZAR:
---
{CONTENT}
---

RESPONDE EXACTAMENTE CON ESTE FORMATO JSON:
{
  "nombre": "nombre de la receta",
  "descripcion": "descripción breve (máx 200 chars) o null",
  "ingredientes": [
    { "nombre": "ingrediente", "cantidad": 1, "unidad": "unidad o null", "notes": "notas o null" }
  ],
  "pasos": [
    { "numero": 1, "instruccion": "detalle del paso", "tiempo_minutos": null }
  ],
  "tiempo_preparacion": null,
  "tiempo_coccion": null,
  "porciones": null,
  "dificultad": "fácil/media/difícil",
  "categorias": ["etiqueta1", "etiqueta2"]
}`;

export async function structureRecipeFromText(content, lang = 'spa') {
  try {
    const isYouTubeUrl = content.includes('youtube.com/') || content.includes('youtu.be/');
    
    // v500: Relaxing constraint if it's a video source
    const minLength = isYouTubeUrl ? 30 : 150; 

    if (!content || content.length < minLength) {
      console.warn('⚠️ [Gemini] Contenido insuficiente para estructurar:', content);
      return {
        success: false,
        error: 'Insufficient content for structured extraction',
        stage: 'gemini_structuring',
        fallbackAttempted: true,
        partialData: content
      };
    }

    const targetLang = (lang === 'eng' || lang === 'en') ? 'ENGLISH' : 'SPANISH (Español)';
    
    // v500 MASTER PROMPT: Inyectar capacidad de inferencia para videos
    let customPrompt = `${RECIPE_STRUCTURE_PROMPT}\n\nIDIOMA REQUERIDO: ${targetLang}.`;
    
    if (isYouTubeUrl && content.length < 500) {
        customPrompt += `\n⚠️ NOTA CRÍTICA: El contenido es un enlace de YouTube que no pudimos leer completamente. 
Usa tu conocimiento interno (entrenamiento) sobre este video o canal para ESTRUCTURAR LA RECETA REAL. 
Si no conoces el video exacto, infierela basándote en el título y el tipo de cocina del canal.`;
    }

    customPrompt += `\nAsegúrate de que todos los textos estén en ${targetLang}. Si el contenido está en otro idioma, TRADÚCELO.`;

    // Intentar recuperar de cache primero
    const appVer = document.documentElement.dataset.appVersion || 'v500';
    const contentHash = hashString(content + lang + appVer);
    const cached = localStorage.getItem(`gemini_extraction_cache_${contentHash}`);
    if (cached) {
      console.log(`📦 [Gemini] Usando resultado de cache (${lang})`);
      return { success: true, recipe: JSON.parse(cached), content, cached: true };
    }

    console.log(`📡 [Gemini] Consultando IA para estructurar receta (${lang})...`);

    const apiKey = localStorage.getItem('openrouter_api_key') || window.APP_SETTINGS?.openrouter_api_key || window.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('No se encontró API key de OpenRouter');
    
    const prompt = customPrompt.replace('{CONTENT}', content);
    
    // Asumiendo que importaríamos fetchWithRetry en el master app, pero si no,
    // usaremos el fetch nativo ya que aquí lo importante es NUNCA LANZAR hacia el orquestador.
    // Aunque para cumplir con reintentos usaremos fetch normal porque el fallback principal es devolver el contenido original.
    let response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          })
        });
    } catch (netErr) {
        throw new Error(`Fallo de red al contactar IA: ${netErr.message}`);
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(()=>({}));
      throw new Error(`Error de Gemini API (HTTP ${response.status}): ${errorData.error?.message || 'Error desconocido'}`);
    }
    
    const data = await response.json();
    const responseText = data.choices[0].message.content.trim();
    
    // VALIDACIÓN: Parsear y validar JSON
    let recipe = null;
    
    try {
      recipe = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        recipe = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('No se pudo parsear la respuesta de Gemini como JSON válido');
      }
    }
    
    // Validar y Normalizar
    const formattedRecipe = validateAndNormalizeRecipe(recipe);
    
    // v477: NO cachear si el resultado es esencialmente vacío (0 ingredientes)
    // Esto evita que bloqueos temporales de YouTube ensucien la caché permanentemente.
    const hasIngredients = formattedRecipe.ingredientes && formattedRecipe.ingredientes.length > 0;
    
    if (hasIngredients) {
      localStorage.setItem(`gemini_extraction_cache_${contentHash}`, JSON.stringify(formattedRecipe));
    } else {
      console.warn('⚠️ [Gemini] Resultado vacío detectado. No se guardará en caché para permitir reintento.');
    }

    return {
      success: true,
      recipe: formattedRecipe,
      content: content,
      cached: false
    };
    
  } catch (error) {
    console.error('❌ Error controlado estructurando receta en Gemini:', error);
    
    // NUNCA throw. Siempre devolver fallback estructurado.
    return {
      success: false,
      error: error.message,
      stage: 'gemini_structuring',
      fallbackAttempted: true,
      partialData: content
    };
  }
}

export async function structureRecipeFromImage(base64Image, mimeType) {
  try {
    const apiKey = localStorage.getItem('openrouter_api_key') || window.APP_SETTINGS?.openrouter_api_key || window.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('No se encontró API key de OpenRouter');
    
    const imagePrompt = `Analiza esta imagen de una receta y extrae TODA la información visible. Proporciona el contenido de texto completo que puedas leer, incluyendo ingredientes y pasos. Responde en formato texto plano.`;
    
    let response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                  { type: 'text', text: imagePrompt }
                ]
              }
            ],
            temperature: 0.1
          })
        });
    } catch (netErr) {
        throw new Error(`Fallo de red al contactar IA Visión: ${netErr.message}`);
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(()=>({}));
      throw new Error(`Error de Gemini Vision (HTTP ${response.status}): ${errorData.error?.message || 'Error desconocido'}`);
    }
    
    const data = await response.json();
    const extractedText = data.choices[0].message.content;
    
    return await structureRecipeFromText(extractedText);
    
  } catch (error) {
    console.error('❌ Error controlado OCR con Gemini Vision:', error);
    return {
      success: false,
      error: error.message,
      stage: 'gemini_vision_ocr',
      fallbackAttempted: true,
      partialData: null
    };
  }
}

function validateAndNormalizeRecipe(recipe) {
  return {
    nombre: recipe.nombre || 'Nueva Receta Importada',
    descripcion: recipe.descripcion || null,
    ingredientes: Array.isArray(recipe.ingredientes) ? recipe.ingredientes.map(ing => ({
      nombre: ing.nombre || 'Ingrediente desconocido',
      cantidad: typeof ing.cantidad === 'number' ? ing.cantidad : parseFloat(ing.cantidad) || null,
      unidad: ing.unidad || null,
      notas: ing.notes || ing.notas || null
    })) : [],
    pasos: Array.isArray(recipe.pasos) ? recipe.pasos.map((paso, idx) => ({
      numero: paso.numero || idx + 1,
      instruccion: paso.instruccion || '',
      tiempo_minutos: typeof paso.tiempo_minutos === 'number' ? paso.tiempo_minutos : null
    })) : [],
    tiempo_preparacion: typeof recipe.tiempo_preparacion === 'number' ? recipe.tiempo_preparacion : null,
    tiempo_coccion: typeof recipe.tiempo_coccion === 'number' ? recipe.tiempo_coccion : null,
    porciones: typeof recipe.porciones === 'number' ? recipe.porciones : null,
    dificultad: ['fácil', 'media', 'difícil'].includes(recipe.dificultad) ? recipe.dificultad : 'media',
    categorias: Array.isArray(recipe.categorias) ? recipe.categorias : []
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
