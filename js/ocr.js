/**
 * OCRProcessor - RecipeHub Premium
 * Gestiona el reconocimiento de texto con Tesseract.js y el parsing de recetas.
 */

class OCRProcessor {
    constructor() {
        this.worker = null;
    }

    /**
     * Procesa una imagen y devuelve el texto extraído con su confianza.
     */
    async processImage(imageFile, onProgress) {
        // Inicializar worker cada vez para asegurar frescura (puedes cachearlo si prefieres)
        const worker = await Tesseract.createWorker('spa+eng', 1, {
            logger: m => onProgress && onProgress(m)
        });

        try {
            const { data } = await worker.recognize(imageFile);
            await worker.terminate();
            return {
                text: data.text,
                confidence: data.confidence
            };
        } catch (error) {
            await worker.terminate();
            throw error;
        }
    }

    /**
     * Parsea un texto crudo en una estructura de receta: nombre, ingredientes, pasos.
     */
    parseRecipeText(text) {
        const lines = text.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        const result = {
            name: '',
            ingredients: [],
            steps: []
        };

        let currentSection = 'name';
        let stepCounter = 1;

        for (let line of lines) {
            const lowerLine = line.toLowerCase();

            // Detectar cabeceras de sección
            if (this.isIngredientsHeader(lowerLine)) {
                currentSection = 'ingredients';
                continue;
            }
            if (this.isStepsHeader(lowerLine)) {
                currentSection = 'steps';
                continue;
            }

            // Procesar según la sección actual
            switch (currentSection) {
                case 'name':
                    // Tomamos la primera línea significativa como nombre si no es una cabecera
                    if (line.length > 4 && !this.isIngredientsHeader(lowerLine) && !this.isStepsHeader(lowerLine)) {
                        result.name = line;
                        currentSection = 'ingredients'; // Pasamos a buscar ingredientes por defecto
                    }
                    break;

                case 'ingredients':
                    // Intentar extraer datos del ingrediente
                    const ing = this.parseIngredient(line);
                    if (ing) result.ingredients.push(ing);
                    break;

                case 'steps':
                    // Limpiar y guardar pasos
                    const stepText = line.replace(/^\d+[\.\)\-\s]+/, ''); // Quitar numeración previa
                    if (stepText.length > 5) {
                        result.steps.push({
                            number: stepCounter++,
                            instruction: stepText
                        });
                    }
                    break;
            }
        }

        // Sanity check: si el nombre quedó vacío, usar la primera línea
        if (!result.name && lines.length > 0) result.name = lines[0];

        return result;
    }

    isIngredientsHeader(line) {
        const keywords = ['ingrediente', 'ingredient', 'lista', 'necesitas'];
        return keywords.some(k => line.includes(k));
    }

    isStepsHeader(line) {
        const keywords = ['preparación', 'pasos', 'instrucciones', 'procedimiento', 'elaboración', 'modo de prep'];
        return keywords.some(k => line.includes(k));
    }

    /**
     * Extrae cantidad, unidad y nombre de una línea de ingrediente.
     */
    parseIngredient(line) {
        // Limpiamos bullets comunes
        let clean = line.replace(/^[-•*◦▪▫+]\s*/, '');
        if (clean.length < 2) return null;

        // Regex para capturar: [cantidad] [unidad] [nombre]
        // Ejemplos: "250 g Harina", "2 tazas de agua", "1/2 Litro Leche"
        const pattern = /^(\d+[\.\/\d\s]*)\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?\s*(?:de\s+)?(.+)$/;
        const match = clean.match(pattern);

        if (match) {
            return {
                quantity: this.normalizeQuantity(match[1]),
                unit: match[2] || '',
                name: match[3]
            };
        }

        // Fallback: solo nombre
        return { quantity: null, unit: null, name: clean };
    }

    normalizeQuantity(q) {
        q = q.trim();
        if (q.includes('/')) {
            const [num, den] = q.split('/').map(n => parseFloat(n.trim()));
            return den ? (num / den) : num;
        }
        return parseFloat(q.replace(',', '.'));
    }
}

// Exponer instancia global
window.ocrProcessor = new OCRProcessor();
