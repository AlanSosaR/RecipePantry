/**
 * HybridOCR.js
 * Ejecuta la malla múltiple en Fase 3: Tesseract para general e impresos, 
 * y TrOCR (ONNX) para manuscritos críticos asíncrono.
 */

class HybridOCR {
    constructor() {
        this.tesseractWorker = null;
        this.trocrSession = null;
        this.languages = 'spa+eng'; // Alpha, luego dinámica
        this.isReady = false;
    }

    async initialize(onProgress) {
        if (this.isReady) return;

        // Tesseract Init
        if (onProgress) onProgress({ status: 'init', progress: 0.1, message: 'Inicializando motores OCR...' });
        const tesseractInstance = typeof Tesseract !== 'undefined' ? Tesseract : window.Tesseract;

        if (tesseractInstance) {
            this.tesseractWorker = await tesseractInstance.createWorker(this.languages, 1, {
                logger: m => {
                    // Mapeo progress al formato ui
                    if (m.status === 'recognizing text' && onProgress) {
                        onProgress({ status: 'recognizing', progress: m.progress, message: `Leyendo (${Math.round(m.progress * 100)}%)...` });
                    }
                }
            });
            await this.tesseractWorker.setParameters({
                tessedit_pageseg_mode: tesseractInstance.PSM.AUTO,
                tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáéíóúÁÉÍÓÚñÑüÜ¼½¾°CFmlgxtazasdecm%+-./:;,★⚠💡⏱ ',
                preserve_interword_spaces: '1'
            });
        }

        this.isReady = true;
    }

    /**
     * Orquestador Híbrido. Ejecuta modelo rápido (Tesseract) y verifica.
     * Si falla en manuscrito, usa fallback TrOCR.
     */
    async execute(canvas, textTypeInfo, onProgress) {
        if (!this.tesseractWorker) throw new Error("Tesseract Worker not loaded.");

        // Nivel 1: Tesseract Fast Execution
        const tsResult = await this.tesseractWorker.recognize(canvas);
        const { text, confidence, words } = tsResult.data;

        console.log(`[HybridOCR] Tesseract Raw Output:`, text);
        console.log(`[HybridOCR] Tesseract Confidence: ${confidence}%`);

        // Métrica: Calcula Media Numérica de Confianza
        let numericConf = confidence;
        const numberWords = words.filter(w => /\d+|¼|½|¾/.test(w.text));
        if (numberWords.length > 0) {
            numericConf = numberWords.reduce((acc, w) => acc + w.confidence, 0) / numberWords.length;
        }

        // Ejecutar TrOCR Fallback (Nivel 2) si manuscrita y baja conf
        if ((textTypeInfo.type === 'manuscrito' || textTypeInfo.type === 'mixed') && (confidence < 85 || numericConf < 90)) {
            console.warn(`[OCR Híbrido] Confianza baja detectada (${confidence}%). Solicitando Fallback ONNX...`);

            try {
                // NOTA: Para MVP Web Asíncrono, si el modelo TrOCR no está cargado (150MB), 
                // delegamos a Edge / Claude hasta que se termine de inyectar el ONNX en background.
                const fallbackOutput = await this.invokeCloudTrOCR(canvas);
                return {
                    rawText: fallbackOutput.text,
                    globalConfidence: fallbackOutput.confidence,
                    wordConfidences: fallbackOutput.words || words, // Trata de heredar palabras si cloud no lo provee,
                    model: 'cloud-trocr-fallback'
                };
            } catch (e) {
                console.warn("[OCR Híbrido] Fallback falló, procediendo con Tesseract original.", e);
            }
        }

        return {
            rawText: text,
            globalConfidence: confidence,
            wordConfidences: words, // Datos detallados requeridos por Fase 5 (Fidelidad / Debug Modo Visual)
            model: 'tesseract-local'
        };
    }

    // Temporary delegator to Cloud ML to replicate TrOCR behavior until ONNX logic is injected
    async invokeCloudTrOCR(canvas) {
        const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        const { data, error } = await window.supabaseClient.functions.invoke('ocr-claude', {
            body: { image: base64 }
        });
        if (error) throw new Error("Fallback Cloud Execution Failed");

        return {
            text: data.text,
            confidence: data.confidence || 95,
            words: []
        };
    }
}

window.HybridOCR = HybridOCR;
