/**
 * OCRManager.js
 * Orquestador principal del Motor OCR v2.0 Profesional.
 * Maneja el flujo de Pipeline desde la imagen hasta el JSON estructurado.
 */

class OCRManager {
    constructor() {
        this.preprocessor = window.ImagePreprocessor ? new window.ImagePreprocessor() : null;
        this.hybridOCR = window.HybridOCR ? new window.HybridOCR() : null;
        this.validator = window.CulinaryValidator ? new window.CulinaryValidator() : null;
        this.jsonBuilder = window.JSONBuilder ? new window.JSONBuilder() : null;
        this.adaptiveProfile = window.AdaptiveProfile ? new window.AdaptiveProfile() : null;

        this.isInitialized = false;
    }

    async initialize(onProgress) {
        if (this.isInitialized) return;

        if (onProgress) onProgress({ status: 'inicializando', progress: 0.1, message: 'Cargando modelos OCR...' });

        // Ensure classes are loaded
        if (!this.preprocessor) this.preprocessor = new window.ImagePreprocessor();
        if (!this.hybridOCR) this.hybridOCR = new window.HybridOCR();
        if (!this.validator) this.validator = new window.CulinaryValidator();
        if (!this.jsonBuilder) this.jsonBuilder = new window.JSONBuilder();
        if (!this.adaptiveProfile) this.adaptiveProfile = new window.AdaptiveProfile();

        await this.hybridOCR.initialize(onProgress);
        this.isInitialized = true;

        if (onProgress) onProgress({ status: 'listo', progress: 1.0, message: 'Motor OCR listo.' });
    }

    /**
     * Procesa una imagen de principio a fin.
     * @param {File} imageFile 
     * @param {Function} onProgress 
     * @param {Object} options - mode (fidelity|contextual), returnJSON (true|false)
     */
    async processImage(imageFile, onProgress, options = { mode: 'contextual', returnJSON: true }) {
        try {
            await this.initialize(onProgress);

            // Phase 2: Preprocessing & OpenCV
            if (onProgress) onProgress({ status: 'preprocesando', progress: 0.2, message: 'Mejorando imagen con OpenCV...' });

            const processedCanvas = await this.preprocessor.process(imageFile);

            // Phase 1b: Detección rápida de Texto / Idioma (Placeholder)
            const textTypeInfo = await this.detectTextCharacteristics(processedCanvas);

            // Phase 3: Hybrid OCR Execution
            if (onProgress) onProgress({ status: 'reconociendo', progress: 0.4, message: 'Extrayendo texto...' });

            const rawOcrResult = await this.hybridOCR.execute(processedCanvas, textTypeInfo, onProgress);

            // Phase 4: Validación y NLP
            if (onProgress) onProgress({ status: 'validando', progress: 0.8, message: 'Validación Culinaria NLP...' });

            const validatedData = this.validator.validate(rawOcrResult, options);

            // Phase 8: Perfil Adaptativo (Ajusta palabras según historial)
            const adaptedData = this.adaptiveProfile.applyCorrections(validatedData);

            // Phase 5: JSON Builder
            let finalOutput = adaptedData;
            if (options.returnJSON) {
                finalOutput = this.jsonBuilder.build(adaptedData, rawOcrResult.rawText);
            }

            return {
                success: true,
                data: finalOutput,
                confidence: rawOcrResult.globalConfidence,
                needsReview: rawOcrResult.globalConfidence < 90 || adaptedData.warnings.length > 0,
                warnings: adaptedData.warnings,
                wordsData: rawOcrResult.wordConfidences
            };

        } catch (error) {
            console.error('OCRManager Error:', error);
            throw new Error(`Fallo en el pipeline OCR: ${error.message}`);
        }
    }

    async detectTextCharacteristics(canvas) {
        // En un futuro: Red neuronal ligera para detectar Idioma e Impreso vs Manuscrito
        return {
            type: 'mixed', // impreso, manuscrito, mixto
            primaryLanguage: 'spa'
        };
    }
}

// Global Export
window.OCRManager = OCRManager;
