/**
 * URLImporter v4 - Functional Orchestrator
 * Orquesta la extracción de contenido de diversas plataformas y su estructuración con Gemini.
 */

import { extractFromYouTube } from './services/youtube-extractor.js?v=459';
import { extractFromTikTok } from './services/tiktok-extractor.js?v=459';
import { extractFromGoogleDrive } from './services/gdrive-extractor.js?v=459';
import { extractFromDropbox } from './services/dropbox-extractor.js?v=459';
import { structureRecipeFromText } from './services/gemini-recipe-structurer.js?v=459';

export async function importFromUrl(url) {
  if (!url) throw new Error('URL es requerida');
  
  const platform = detectPlatform(url);
  console.log(`🔗 [URLImporter] Plataforma detectada: ${platform}`);
  
  if (platform === 'unknown') {
    return {
      success: false,
      error: 'Plataforma no soportada',
      supportedPlatforms: ['YouTube', 'TikTok', 'Google Drive', 'Dropbox']
    };
  }

  let extractionResult = null;
  
  // Paso 1: Extraer contenido según la plataforma
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
  } catch (error) {
    return {
      success: false,
      error: `Error de extracción: ${error.message}`,
      platform,
      sourceUrl: url
    };
  }

  // Paso 2: Verificar si la extracción fue exitosa
  if (!extractionResult || extractionResult.success === false) {
    return {
      success: false,
      error: extractionResult?.error || 'Falló la extracción de contenido',
      platform,
      sourceUrl: url
    };
  }

  console.log(`✅ [${platform}] Contenido extraído satisfactoriamente`);

  // Paso 3: Si ya viene estructurado (ej. por imagen OCR con Gemini Vision interno)
  if (extractionResult.structuredRecipe) {
    console.log('✨ Receta ya estructurada vía OCR');
    return {
      success: true,
      recipe: extractionResult.structuredRecipe,
      platform,
      sourceUrl: url,
      sourceType: extractionResult.type
    };
  }

  // Paso 4: Estructurar contenido con Gemini
  console.log(`📝 [${platform}] Procesando contenido con Gemini...`);
  
  const structureResult = await structureRecipeFromText(extractionResult.content);
  
  if (!structureResult.success) {
    console.error(`❌ Error al estructurar receta:`, structureResult.error);
    return {
      success: false,
      error: 'No se pudo estructurar la receta automáticamente',
      detail: structureResult.error,
      platform,
      sourceUrl: url,
      fallbackContent: extractionResult.content
    };
  }

  // Paso 5: Validación final
  const recipe = structureResult.recipe;
  if (!recipe.nombre) {
    return {
      success: false,
      error: 'La IA no pudo identificar el nombre de la receta',
      platform,
      sourceUrl: url,
      fallbackContent: extractionResult.content
    };
  }

  console.log(`✅ [${platform}] Receta estructurada: ${recipe.nombre}`);
  
  return {
    success: true,
    recipe: recipe,
    platform: platform,
    sourceUrl: url,
    sourceType: extractionResult.type
  };
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

// Mantener compatibilidad con legacy if needed
const URLImporter = {
  import: async (url) => {
    const res = await importFromUrl(url);
    if (!res.success) throw new Error(res.error);
    
    // Mapeo al formato que espera ocr.html/recipe-form.js legacy
    return {
      type: 'structured',
      platform: res.platform,
      recipe: res.recipe,
      metadata: { url: res.sourceUrl }
    };
  }
};

window.URLImporter = URLImporter;
window.importFromUrl = importFromUrl;
