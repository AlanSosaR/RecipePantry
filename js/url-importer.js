/**
 * URLImporter v5 - Robust Orchestrator
 * Orquesta la extracción de contenido y maneja errores sin romper el flujo principal.
 */

import { extractFromYouTube } from './services/youtube-extractor.js?v=474';
import { extractFromTikTok } from './services/tiktok-extractor.js?v=474';
import { extractFromGoogleDrive } from './services/gdrive-extractor.js?v=474';
import { extractFromDropbox } from './services/dropbox-extractor.js?v=474';
import { structureRecipeFromText } from './services/gemini-recipe-structurer.js?v=474';

export async function importFromUrl(url, lang = 'spa') {
  try {
    if (!url) {
      return {
        success: false,
        error: 'URL es requerida',
        stage: 'url_validation',
        fallbackAttempted: false
      };
    }
    
    // Normalizar URL (quitar comillas, espacios)
    url = url.replace(/['"]/g, '').trim();

    const platform = detectPlatform(url);
    console.log(`🔗 [URLImporter] Plataforma detectada: ${platform} (${lang})`);
    
    if (platform === 'unknown') {
      return {
        success: false,
        error: 'Plataforma no soportada',
        stage: 'platform_detection',
        fallbackAttempted: false,
        supportedPlatforms: ['YouTube', 'TikTok', 'Google Drive', 'Dropbox']
      };
    }

    let extractionResult = null;
    
    // Paso 1: Extraer contenido según la plataforma de forma controlada
    try {
      switch (platform) {
        case 'youtube':
          extractionResult = await extractFromYouTube(url);
          break;
        case 'tiktok':
          extractionResult = await extractFromTikTok(url);
          break;
        case 'googledrive':
        case 'googledocs':
          extractionResult = await extractFromGoogleDrive(url);
          break;
        case 'dropbox':
          extractionResult = await extractFromDropbox(url);
          break;
      }
    } catch (extractError) {
      // Capturar cualquier fallo interno imprevisto en los extractores
      console.error(`❌ [URLImporter] Error interno en extractor de ${platform}:`, extractError);
      extractionResult = {
        success: false,
        error: extractError.message,
        stage: `${platform}_extraction`,
        fallbackAttempted: false
      };
    }

    // Paso 2: Evaluar la respuesta del extractor (Regla de capas)
    if (!extractionResult || !extractionResult.success) {
      if (extractionResult && extractionResult.partialData) {
        // Fallback orquestador: usar datos parciales
        console.warn(`⚠️ [URLImporter] Falló la extracción completa, pero existen datos parciales. Modificando flujo a fallback.`);
        extractionResult.content = extractionResult.partialData;
      } else {
        // Fallo total irreversible de la fuente
        return {
          success: false,
          error: extractionResult?.error || 'Falló la extracción de contenido y no hay datos de fallback',
          stage: extractionResult?.stage || `${platform}_extraction`,
          platform,
          sourceUrl: url,
          fallbackAttempted: extractionResult?.fallbackAttempted || false,
          retryCount: extractionResult?.retryCount || 0
        };
      }
    }

    console.log(`✅ [${platform}] Extracción inicial terminada de forma controlada.`);

    // Paso 3: Soporte para estructuración nativa (ej. imágenes pre-procesadas OCR)
    if (extractionResult.structuredRecipe) {
      return {
        success: true,
        recipe: extractionResult.structuredRecipe,
        platform,
        sourceUrl: url,
        sourceType: extractionResult.type
      };
    }

    // Paso 4: Estructurar usando Gemini
    console.log(`📝 [${platform}] Procesando contenido con Gemini (${lang})...`);
    
    let structureResult;
    try {
      structureResult = await structureRecipeFromText(extractionResult.content, lang);
    } catch (geminiCrash) {
      console.error(`❌ [URLImporter] Error interno no capturado en Gemini:`, geminiCrash);
      structureResult = {
        success: false,
        error: geminiCrash.message,
        stage: 'gemini_structuring',
        fallbackAttempted: true,
        partialData: extractionResult.content
      };
    }
    
    // Validar caída oficial de IA
    if (!structureResult.success) {
      console.warn(`⚠️ [URLImporter] Estructuración IA fallida. Devolviendo texto crudo para UI.`);
      return {
        success: true, 
        content: structureResult.partialData || extractionResult.content, // Fallback usable para el usuario
        warning: structureResult.error || 'La IA no pudo procesar el contenido.',
        platform,
        sourceUrl: url,
        isFallbackText: true
      };
    }

    // Paso 5: Validar el JSON obtenido
    const recipe = structureResult.recipe;
    if (!recipe || !recipe.nombre) {
      return {
        success: true, // Éxito parcial para no romper flujo
        content: extractionResult.content,
        warning: 'La IA devolvió datos en un formato irreconocible (sin nombre válido).',
        platform,
        sourceUrl: url,
        isFallbackText: true
      };
    }

    console.log(`✅ [${platform}] Receta estructurada exitosamente: ${recipe.nombre}`);
    
    return {
      success: true,
      recipe: recipe,
      content: extractionResult.content, // v474-fix: Incluir contenido crudo para debug
      platform: platform,
      sourceUrl: url,
      sourceType: extractionResult.type
    };

  } catch (globalError) {
    // ❌ [NUNCA USAR THROW EN EL NIVEL SUPERIOR]
    console.error('❌ [URLImporter] Error Global no controlado (atrapado a nivel raíz):', globalError);
    return {
      success: false,
      error: 'Error interno del orquestador: ' + globalError.message,
      stage: 'orchestrator_global_catch',
      fallbackAttempted: false,
      sourceUrl: url
    };
  }
}

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('drive.google.com')) return 'googledrive';
  if (u.includes('docs.google.com')) return 'googledocs';
  if (u.includes('dropbox.com')) return 'dropbox';
  return 'unknown';
}

const URLImporter = {
  import: async (url, lang = 'spa') => {
    // NUNCA DEBE LANZAR ERRORES FUERA DE AQUÍ
    try {
      const res = await importFromUrl(url, lang);
      if (!res.success && !res.isFallbackText) {
        // En lugar de throw, devolver un objeto controlable por la capa visual
        console.error("[URLImporter UI] Error manejado controlado:", res.error);
        return {
          type: 'error',
          error: res.error,
          stage: res.stage
        };
      }
      
      return {
        type: res.isFallbackText ? 'raw_text' : 'structured',
        platform: res.platform,
        recipe: res.recipe || null,
        rawText: res.content || null,
        metadata: { url: res.sourceUrl, warning: res.warning }
      };
    } catch (e) {
      console.error("[URLImporter UI] Super Fallback - Error Catastrófico Prevenido:", e);
      return { type: 'error', error: e.message, fallbackAttempted: false };
    }
  }
};

window.URLImporter = URLImporter;
window.importFromUrl = importFromUrl;
