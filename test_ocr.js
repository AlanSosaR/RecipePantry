
const text = `Paraiso.
Proceso Lavado, Seco.
Variedad — Parainema
Perfil Miel, Cítrico, Chocolate.
Teléfono 9667-0613 / 9867-5101
Calidad de café
100% Arabica 7 1b (454 g)
Café Cortero es un proyecto familiar con la
iniciativa
de producir un café de calidad amigable con el
medio
ambiente.
— ¡Disfrútalo y Compártelo! 100%
Na DE Z We
A`;

function isIngredientsHeader(line) {
    const keywords = ['ingrediente', 'ingredient', 'lista', 'necesitas'];
    return keywords.some(k => line.includes(k));
}

function isStepsHeader(line) {
    const keywords = ['preparación', 'pasos', 'instrucciones', 'procedimiento', 'elaboración', 'modo de prep'];
    return keywords.some(k => line.includes(k));
}

function parseIngredient(line) {
    let clean = line.replace(/^[-•*◦▪▫+]\s*/, '');
    if (clean.length < 2) return null;
    const pattern = /^(\d+[\.\/\d\s]*)\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?\s*(?:de\s+)?(.+)$/;
    const match = clean.match(pattern);
    if (match) {
        return { quantity: match[1], unit: match[2] || '', name: match[3] };
    }
    return { quantity: null, unit: null, name: clean };
}

function parseRecipeText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const result = { name: '', ingredients: [], steps: [] };
    let currentSection = 'name';
    let stepCounter = 1;

    for (let line of lines) {
        const lowerLine = line.toLowerCase();
        if (isIngredientsHeader(lowerLine)) { currentSection = 'ingredients'; continue; }
        if (isStepsHeader(lowerLine)) { currentSection = 'steps'; continue; }

        switch (currentSection) {
            case 'name':
                if (line.length > 4) {
                    result.name = line;
                    currentSection = 'ingredients';
                }
                break;
            case 'ingredients':
                const ing = parseIngredient(line);
                if (ing) result.ingredients.push(ing);
                break;
            case 'steps':
                result.steps.push({ number: stepCounter++, instruction: line });
                break;
        }
    }
    return result;
}

const parsed = parseRecipeText(text);
console.log(JSON.stringify(parsed, null, 2));
