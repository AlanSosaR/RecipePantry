/**
 * Gemini Recipe Structurer
 * Convierte cualquier texto o imagen en una receta estructurada usando Gemini.
 */

const RECIPE_STRUCTURE_PROMPT = `You are a deterministic data extraction engine, not a creative assistant.

INPUT DATA:
* Video Title: {TITLE}
* Video URL: {URL}
* Video Description (optional): {CONTENT}

STRICT RULES:
1. You MUST NOT invent, infer, or assume any ingredient, quantity, or step that is not explicitly present in the provided description.
2. If the description is missing, incomplete, or does not contain a recipe:
   * You MUST return ONLY the string: "NO_RECIPE_DATA_AVAILABLE"
3. If only partial data exists:
   * Extract ONLY what is explicitly written.
   * Do NOT complete missing steps or ingredients.
4. Ignore your general knowledge about the dish.
5. Do NOT generate a "typical recipe".

EXTRACTION TARGET (JSON FORMAT):
{
  "nombre": "string",
  "descripcion": "string or null",
  "ingredientes": [
    { "nombre": "string", "cantidad": "string or null", "unidad": "string or null", "notes": "string or null" }
  ],
  "pasos": [
    { "numero": number, "instruccion": "string" }
  ],
  "metadata": {
    "source": "description",
    "completeness": "full" | "partial" | "none"
  }
}

OUTPUT REQUIREMENTS:
* Return ONLY valid JSON if data is available.
* Return ONLY "NO_RECIPE_DATA_AVAILABLE" if no recipe is found in the description.
* No explanations. No markdown blocks.`;

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
    
    // v501: Inject accurate variables for the prompt
    let titleParts = content.match(/TITLE:\s*(.*)/);
    let urlParts = content.match(/URL:\s*(.*)/);
    
    let prompt = RECIPE_STRUCTURE_PROMPT
        .replace('{TITLE}', titleParts ? titleParts[1] : 'Unknown')
        .replace('{URL}', urlParts ? urlParts[1] : 'Unknown')
        .replace('{CONTENT}', content);

    prompt += `\n\nFINAL INSTRUCTION: Respond in ${targetLang}. If translating from another language, be precise.`;

    // Intentar recuperar de cache primero
    const appVer = document.documentElement.dataset.appVersion || 'v501';
    const contentHash = hashString(content + lang + appVer);
    const cached = localStorage.getItem(`gemini_extraction_cache_${contentHash}`);
    if (cached) {
      console.log(`📦 [Gemini] Usando resultado de cache (${lang})`);
      return { success: true, recipe: JSON.parse(cached), content, cached: true };
    }

    console.log(`📡 [Gemini v501] Mode: Deterministic Engine...`);

    const apiKey = localStorage.getItem('openrouter_api_key') || window.APP_SETTINGS?.openrouter_api_key || window.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('No se encontró API key de OpenRouter');
    
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

    // v501 Check for exact "NO_RECIPE_DATA_AVAILABLE"
    if (responseText.includes('NO_RECIPE_DATA_AVAILABLE')) {
        console.warn('🛑 [Gemini v501] Engine signal: NO_RECIPE_DATA_AVAILABLE');
        return {
            success: false,
            error: 'No se detectó una receta real en el contenido. Por favor intenta pegar la descripción manualmente.',
            noDataSignal: true,
            stage: 'gemini_structuring'
        };
    }
    
    // VALIDACIÓN: Parsear y validar JSON
    let recipe = null;
    try {
      recipe = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
         recipe = JSON.parse(jsonMatch[1].trim());
      } else {
         throw new Error('La IA no pudo generar un JSON válido. Revisa el contenido original.');
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
