/**
 * Recipe Validator Service (v484)
 * Detecta patrones de recetas (ingredientes, pasos, unidades) mediante Regex.
 */

export function detectRecipePatterns(text) {
  if (!text || typeof text !== 'string') return { isLikelyRecipe: false, recipeScore: 0 };

  const RECIPE_PATTERNS = {
    ingredients: /ingredientes?:|ingredients?:|insumos?:|items?:|lista de/i,
    steps: /preparación|preparacion|instructions?|modo de preparar|pasos|directions|metodo|procedimiento/i,
    quantities: /\d+\s*(tazas?|cups?|litros?|ml|grs?|gramos?|onzas?|libras?|cucharadas?|cucharitas?|piezas?|dientes?|manojos?)/i,
    listMarkers: /^[\s]*[-•*]\s+/m,
    culinaryVerbs: /mezclar|revolver|hornear|cocinar|freír|agregar|verter|batir|enfriar|servir|picar|trocear|salpimentar/i
  };

  const findings = {
    hasIngredients: RECIPE_PATTERNS.ingredients.test(text),
    hasSteps: RECIPE_PATTERNS.steps.test(text),
    hasQuantities: RECIPE_PATTERNS.quantities.test(text),
    hasLists: RECIPE_PATTERNS.listMarkers.test(text),
    hasCulinaryVerbs: RECIPE_PATTERNS.culinaryVerbs.test(text)
  };

  // Cálculo de Score (0-100)
  let score = 0;
  if (findings.hasIngredients) score += 30;
  if (findings.hasSteps) score += 25;
  if (findings.hasQuantities) score += 20;
  if (findings.hasLists) score += 15;
  if (findings.hasCulinaryVerbs) score += 10;

  console.log(`📊 [recipeValidator] Análisis:
    ├─ Ingredientes: ${findings.hasIngredients}
    ├─ Pasos: ${findings.hasSteps}
    ├─ Cantidades: ${findings.hasQuantities}
    ├─ Listas: ${findings.hasLists}
    ├─ Verbos: ${findings.hasCulinaryVerbs}
    └─ Score final: ${score}/100`);

  return {
    ...findings,
    recipeScore: score,
    isLikelyRecipe: score >= 40
  };
}
