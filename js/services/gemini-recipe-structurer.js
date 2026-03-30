/**
 * Gemini Recipe Structurer
 * Convierte cualquier texto o imagen en una receta estructurada usando Gemini.
 */

const RECIPE_STRUCTURE_PROMPT = `Eres un experto en análisis de recetas culinarias. Tu tarea es EXTRAER UNA RECETA del contenido proporcionado.

INSTRUCCIONES CRÍTICAS:
1. Responde ÚNICAMENTE con JSON válido. SIN markdown, SIN explicaciones, SIN texto adicional.
2. COMPLETA todos los campos. Usa null para campos no disponibles, NUNCA omitas campos.
3. Los arrays (ingredientes, pasos, categorias) DEBEN existir y pueden estar vacíos.
4. Si hay múltiples recetas, extrae la PRINCIPAL (la más desarrollada).

CONTENIDO A ANALIZAR:
---
{CONTENT}
---

RESPONDE EXACTAMENTE CON ESTE JSON (sin cambios de estructura):
{
  "nombre": "nombre exacto de la receta",
  "descripcion": "descripción breve máximo 200 caracteres, o null si no hay",
  "ingredientes": [
    {
      "nombre": "nombre del ingrediente",
      "cantidad": 1,
      "unidad": "g o ml o taza o piezas o null",
      "notes": "notas adicionales o null"
    }
  ],
  "pasos": [
    {
      "numero": 1,
      "instruccion": "descripción clara y detallada del paso",
      "tiempo_minutos": 5
    }
  ],
  "tiempo_preparacion": 15,
  "tiempo_coccion": 30,
  "porciones": 4,
  "dificultad": "fácil",
  "categorias": ["postres", "sin gluten"]
}

REGLAS DE VALIDACIÓN:
- nombre: string no vacío o null
- descripcion: string o null
- ingredientes: array (puede estar vacío [])
- pasos: array (puede estar vacío [])
- tiempo_preparacion, tiempo_coccion, porciones: números o null
- dificultad: "fácil" | "media" | "difícil" | null
- categorias: array de strings o []`;

export async function structureRecipeFromText(content) {
  try {
    // Intentar recuperar de cache primero
    const contentHash = hashString(content);
    const cached = localStorage.getItem(`gemini_extraction_cache_${contentHash}`);
    if (cached) {
      console.log('📦 [Gemini] Usando resultado de cache');
      return { success: true, recipe: JSON.parse(cached), content, cached: true };
    }

    const apiKey = localStorage.getItem('openrouter_api_key') || window.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('No se encontró API key de OpenRouter');
    
    const prompt = RECIPE_STRUCTURE_PROMPT.replace('{CONTENT}', content);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001', // Usamos un modelo estable
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error de Gemini API: ${errorData.error?.message || 'Error desconocido'}`);
    }
    
    const data = await response.json();
    const responseText = data.choices[0].message.content.trim();
    
    // VALIDACIÓN: Parsear y validar JSON
    let recipe = null;
    
    try {
      // Intentar parsear directo
      recipe = JSON.parse(responseText);
    } catch (e) {
      // Si falla, intentar extraer de bloques markdown
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        recipe = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('No se pudo parsear la respuesta de Gemini como JSON');
      }
    }
    
    // Normalizar para evitar undefined
    recipe = validateAndNormalizeRecipe(recipe);
    
    // Guardar en cache
    localStorage.setItem(`gemini_extraction_cache_${contentHash}`, JSON.stringify(recipe));
    
    return {
      success: true,
      recipe: recipe,
      content: content,
      cached: false
    };
    
  } catch (error) {
    console.error('❌ Error estructurando receta:', error);
    return {
      success: false,
      error: error.message,
      recipe: null
    };
  }
}

export async function structureRecipeFromImage(base64Image, mimeType) {
  try {
    const apiKey = localStorage.getItem('openrouter_api_key') || window.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('No se encontró API key de OpenRouter');
    
    const imagePrompt = `Analiza esta imagen de una receta y extrae TODA la información visible. Proporciona el contenido de texto completo que puedas leer, incluyendo ingredientes y pasos. Responde en formato texto plano.`;
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Image}` }
              },
              {
                type: 'text',
                text: imagePrompt
              }
            ]
          }
        ],
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error de Gemini Vision: ${errorData.error?.message || 'Error desconocido'}`);
    }
    
    const data = await response.json();
    const extractedText = data.choices[0].message.content;
    
    // Luego estructurar el texto extraído
    return await structureRecipeFromText(extractedText);
    
  } catch (error) {
    console.error('❌ Error OCR con Gemini:', error);
    return {
      success: false,
      error: error.message,
      recipe: null,
      content: null
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
