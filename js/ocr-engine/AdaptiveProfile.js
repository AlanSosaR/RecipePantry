/**
 * AdaptiveProfile.js
 * Fase 8: Aprendizaje Adaptativo con IndexedDB local.
 */

class AdaptiveProfile {
    constructor() {
        this.correctionsDict = {};
        this.loadProfile();
    }

    loadProfile() {
        try {
            const data = localStorage.getItem('ocr_v2_user_profile');
            if (data) this.correctionsDict = JSON.parse(data);
        } catch (e) {
            console.warn("No se pudo cargar perfil local adaptativo OCR v2.");
        }
    }

    applyCorrections(validatedData) {
        // En MVP, si hay mapeos 1:1, los inyectaremos en los títulos/descripciones.
        // Pero idealmente el motor Adaptive previene esto ajustando los thresholds de binarización

        validatedData.ingredients = validatedData.ingredients.map(ing => {
            let replacedName = ing.name;
            for (const [wrong, correct] of Object.entries(this.correctionsDict)) {
                // Reemplazo simple como prueba
                replacedName = replacedName.replace(wrong, correct);
            }
            ing.name = replacedName;
            return ing;
        });

        validatedData.instructions = validatedData.instructions.map(inst => {
            let replacedDesc = inst.description;
            for (const [wrong, correct] of Object.entries(this.correctionsDict)) {
                replacedDesc = replacedDesc.replace(wrong, correct);
            }
            inst.description = replacedDesc;
            return inst;
        });

        return validatedData;
    }

    learnCorrections(originalJSON, latestJSON) {
        if (!originalJSON || !latestJSON) return;

        let learnedCount = 0;

        // Comparamos ingredientes 
        const origIng = originalJSON.ingredients || [];
        const newIng = latestJSON.ingredients || [];

        if (origIng.length === newIng.length) {
            for (let i = 0; i < origIng.length; i++) {
                if (origIng[i].name !== newIng[i].name && origIng[i].name.length > 3 && newIng[i].name.length > 3) {
                    this.correctionsDict[origIng[i].name] = newIng[i].name;
                    learnedCount++;
                }
            }
        }

        if (learnedCount > 0) {
            localStorage.setItem('ocr_v2_user_profile', JSON.stringify(this.correctionsDict));
            console.log(`[OCR Adaptativo] Aprendidas ${learnedCount} correcciones de perfil.`);
        }
    }
}

window.AdaptiveProfile = AdaptiveProfile;
