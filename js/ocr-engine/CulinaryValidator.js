/**
 * CulinaryValidator.js
 * NLP y Validación estricta culinaria.
 * Transforma texto OCR en arrays de ingredientes y pasos con validación matemática.
 */

class CulinaryValidator {
    constructor() {
        this.FRACTION_MAP = {
            '½': 0.5, '1/2': 0.5, '¼': 0.25, '1/4': 0.25, '¾': 0.75, '3/4': 0.75,
            '1½': 1.5, '1 ½': 1.5, '1 1/2': 1.5,
            '2½': 2.5, '2 ½': 2.5, '2 1/2': 2.5
        };

        this.UNIT_MAPPINGS = [
            { regex: /\b(mililitros?|ml|mi)\b/gi, standard: 'ml' },
            { regex: /\b(litros?|lts?|L)\b/gi, standard: 'L' },
            { regex: /\b(gramos?|gr|g)\b/gi, standard: 'g' },
            { regex: /\b(kilogramos?|kilos?|kg)\b/gi, standard: 'kg' },
            { regex: /\b(tazas?|tzs?|tz)\b/gi, standard: 'taza' },
            { regex: /\b(cucharadas?|cdas?|cuchara(?:s)? soperas?)\b/gi, standard: 'cda' },
            { regex: /\b(cucharaditas?|cditas?|cdta|tsp)\b/gi, standard: 'cdita' },
            { regex: /\b(pizcas?)\b/gi, standard: 'pizca' },
            { regex: /\b(dientes?)\b/gi, standard: 'diente' },
            { regex: /\b(unidades?|piezas?|u|pz)\b/gi, standard: 'unidad' }
        ];
    }

    /**
     * Valida el resultado CRUDE de HybridOCR y lo transforma
     * @param {Object} ocrOutput { rawText, globalConfidence, wordsData }
     * @param {Object} options mode
     */
    validate(ocrOutput, options) {
        let text = ocrOutput.rawText || '';

        // 1. Limpieza base si está en modo "contextual" (Heredado de la V1)
        if (options.mode === 'contextual') {
            text = text.replace(/^[+*]\s/gm, '• ').replace(/^- \s/gm, '• ');
            text = text.replace(/\b1% tazas?\b/gi, '1½ taza').replace(/\b3% tazas?\b/gi, '¾ taza');
            text = text.replace(/\b%4\b/gi, '¼').replace(/\b34 de\b/gi, '¾ de');
            text = text.replace(/\b32\s+cucharaditas?\b/gi, '½ cucharadita');
            text = text.replace(/\b(\d+)mi\b/gi, '$1 ml');
        }

        // 2. Parseo Extensivo
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        let title = '';
        let ingredients = [];
        let instructions = [];
        let warnings = [];

        // Block Detection Heuristics
        let currentSection = 'title';
        let stepCount = 1;

        for (let line of lines) {
            const lowerLine = line.toLowerCase();
            if (/ingrediente|ingredient|necesita/i.test(lowerLine)) { currentSection = 'ingredients'; continue; }
            if (/preparación|paso|instruccion|procedimiento/i.test(lowerLine)) { currentSection = 'instructions'; continue; }

            if (currentSection === 'title') {
                if (!title && line.length > 3) title = line.replace(/[═─━]+/g, '').trim();
                else if (title) currentSection = 'ingredients'; // Usually follows title quickly
            } else if (currentSection === 'ingredients') {
                const parsedIng = this.parseIngredient(line);
                if (parsedIng && parsedIng.name.length > 2) ingredients.push(parsedIng);
            } else if (currentSection === 'instructions') {
                const stepDesc = line.replace(/^\d+[\.\)\-\s]+/, ''); // Remove numbers
                if (stepDesc.length > 5) {
                    instructions.push({ step: stepCount++, description: stepDesc });
                }
            }
        }

        // Fallbacks
        if (!title && lines.length > 0) title = lines[0];

        // 3. Inconsistency Detection (Cross-check ingredients in steps)
        ingredients.forEach(ing => {
            const ingUpper = ing.name.toUpperCase();
            // Skip common weak substantives (de, el, en, para) - just rough check
            if (ing.name.length > 4) {
                const presentInSteps = instructions.some(i => i.description.toUpperCase().includes(ingUpper.split(' ')[0]));
                if (!presentInSteps) {
                    // This is a common AI inconsistency check
                    console.warn(`Ingredient not explicitly found in steps: ${ing.name}`);
                    // NO agregamos esto como advertencia en UI porque es intrusivo, pero el motor lo detecta.
                }
            }
        });

        if (ingredients.length === 0) warnings.push('No se detectaron ingredientes claramente.');
        if (instructions.length === 0) warnings.push('No se detectaron pasos documentados.');

        return {
            title,
            ingredients,
            instructions,
            warnings
        };
    }

    parseIngredient(line) {
        let clean = line.replace(/^[-•*◦▪▫+—–]\s*/, '').trim();
        // Regex para capturar cantidad (num o fracción), unidad (opcional) e ingrediente
        // Mejorado para capturar caracteres españoles y ser más flexible con espacios
        const pattern = /^([\d\.\/\s¼½¾]+)?\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]{1,10})?\s*(?:de\s+)?(.+)$/;
        const match = clean.match(pattern);

        let quantity = null;
        let unit = '';
        let name = clean;
        let quantityDecimal = null;

        if (match) {
            quantity = match[1].trim();
            unit = match[2] ? match[2].trim() : '';
            name = match[3] ? match[3].trim() : clean;

            // Translate Unit to Standard Form
            for (let mapping of this.UNIT_MAPPINGS) {
                if (mapping.regex.test(unit)) {
                    unit = mapping.standard;
                    break;
                }
            }

            // Decimal calculation
            quantityDecimal = this.fractionToDecimal(quantity);
        }

        return {
            quantity: quantity,
            quantity_decimal: quantityDecimal,
            unit: unit,
            name: name,
            section: "main"
        };
    }

    fractionToDecimal(q) {
        if (!q) return null;
        if (this.FRACTION_MAP[q]) return this.FRACTION_MAP[q];

        // "1 1/2" format
        if (q.includes(' ') && q.includes('/')) {
            const parts = q.split(' ');
            return parseFloat(parts[0]) + this.evalFraction(parts[1]);
        }

        // "1/2" format
        if (q.includes('/')) return this.evalFraction(q);

        // Standard float format (European or US)
        let floatVal = parseFloat(q.replace(',', '.'));
        return isNaN(floatVal) ? null : floatVal;
    }

    evalFraction(frac) {
        const parts = frac.split('/');
        if (parts.length === 2 && parseFloat(parts[1]) !== 0) {
            return parseFloat(parts[0]) / parseFloat(parts[1]);
        }
        return null;
    }
}

window.CulinaryValidator = CulinaryValidator;
