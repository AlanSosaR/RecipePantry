/**
 * JSONBuilder.js
 * Fase 5: Strict JSON Builder for Professional Data extraction.
 */

class JSONBuilder {
    constructor() { }

    /**
     * @param {Object} parsedData Data del CulinaryValidator
     * @param {String} rawText Texto crudo del OCR
     */
    build(parsedData, rawText) {
        // Output format requested strictly by user
        return {
            title: parsedData.title || "",
            language_detected: "es", // Defaulting to ES for MVP,
            time_minutes: this.extractTime(parsedData.title, rawText) || null,
            servings: this.extractServings(rawText) || null,
            difficulty: this.extractDifficulty(rawText) || "",
            ingredients: parsedData.ingredients || [],
            instructions: parsedData.instructions || [],
            notes: [],
            storage: [],
            nutrition: {
                calories: null,
                protein: null,
                carbs: null,
                fat: null,
                sugar: null,
                fiber: null
            },
            raw_text_backup: rawText || ""
        };
    }

    extractTime(title, raw) {
        const titleMatch = (title || '').match(/(\d+)\s*(minutos?|min|horas?|hr|hrs)/i);
        if (titleMatch) return parseInt(titleMatch[1]);

        const textMatch = (raw || '').match(/(?:tiempo|preparación|duración)\s*:?\s*(\d+)\s*(minutos?|min|horas?|hr|hrs)/i);
        if (textMatch) return parseInt(textMatch[1]);

        return null;
    }

    extractServings(raw) {
        const textMatch = (raw || '').match(/(?:porciones|rinde|raciones)\s*:?\s*(\d+)/i);
        if (textMatch) return parseInt(textMatch[1]);
        return null;
    }

    extractDifficulty(raw) {
        if (/dificultad\s*:?\s*fácil/i.test(raw)) return "Fácil";
        if (/dificultad\s*:?\s*media/i.test(raw)) return "Media";
        if (/dificultad\s*:?\s*difícil/i.test(raw)) return "Difícil";
        return "";
    }
}

window.JSONBuilder = JSONBuilder;
