/**
 * OCRProcessor.js - Recipe Pantry Premium v7.0.0
 * Sistema simplificado basado en Tesseract.js v7 con correcciones mejoradas.
 */

class OCRProcessor {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
        this.MAX_IMAGE_DIMENSION = 1800;
    }

    /**
     * Inicialización optimizada para Tesseract.js v7.0.0
     */
    async initialize(onProgress) {
        if (this.isInitialized) return;

        console.log('🚀 Inicializando Tesseract.js v7.0.0...');

        // V7: Los parámetros se pasan en createWorker si es necesario para el logger
        this.worker = await Tesseract.createWorker('spa+eng', 1, {
            logger: info => {
                if (info.status === 'recognizing text' && onProgress) {
                    onProgress({
                        status: 'recognizing text',
                        progress: info.progress,
                        message: `Leyendo... ${Math.round(info.progress * 100)}%`
                    });
                }
            }
        });

        // Configuración de motor
        await this.worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúñÁÉÍÓÚÑüÜ0123456789 .,;:()[]{}°•✓→★½¼¾-/+@#$%&\'\"',
        });

        this.isInitialized = true;
        console.log('✅ Tesseract v7.0.0 listo (15-35% más rápido)');
    }

    /**
     * Proceso principal de OCR
     */
    async processImage(imageFile, onProgress) {
        try {
            await this.initialize(onProgress);

            if (onProgress) onProgress({ status: 'preprocesando', progress: 0.1, message: '📸 Preprocesando imagen...' });
            const processedCanvas = await this.preprocessImage(imageFile);

            if (onProgress) onProgress({ status: 'reconociendo', progress: 0.3, message: '🔍 Extrayendo texto con Tesseract v7...' });

            const { data: { text, confidence } } = await this.worker.recognize(processedCanvas);

            console.log(`📝 Texto extraído | Confianza: ${confidence.toFixed(1)}%`);
            if (onProgress) onProgress({ status: 'finalizando', progress: 0.7, message: '⚙️ Aplicando correcciones inteligentes...' });

            // 1. Aplicar todos los parches y correcciones de texto
            const textoCorregido = this.applyAllCorrections(text);

            // 2. Extraer estructura básica (Nombre, Ingredientes, Pasos)
            const nombre = this.extractRecipeName(textoCorregido);
            const ingredientes = this.extractIngredients(textoCorregido);
            const pasos = this.extractSteps(textoCorregido);

            if (onProgress) onProgress({ status: 'completado', progress: 1.0, message: '✨ Proceso completado' });

            return {
                nombre: nombre,
                texto: textoCorregido,
                ingredientes: ingredientes,
                pasos: pasos,
                confidence: confidence,
                success: true,
                version: 'v7.0.0',
                method: 'tesseract-v7'
            };

        } catch (error) {
            console.error('❌ Error en OCRProcessor:', error);
            return { error: error.message, success: false };
        }
    }

    /**
     * Pre-procesamiento de imagen integrado (OpenCV + Fallback)
     */
    async preprocessImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = async () => {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height && width > this.MAX_IMAGE_DIMENSION) {
                        height *= this.MAX_IMAGE_DIMENSION / width;
                        width = this.MAX_IMAGE_DIMENSION;
                    } else if (height > this.MAX_IMAGE_DIMENSION) {
                        width *= this.MAX_IMAGE_DIMENSION / height;
                        height = this.MAX_IMAGE_DIMENSION;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);

                    // Aplicar filtros básicos si OpenCV no está disponible
                    if (!window.cv) {
                        this.applyBasicFilters(canvas);
                    } else {
                        // Podríamos integrar OpenCV aquí si es necesario, 
                        // pero para "simple" los filtros de canvas suelen bastar con un buen OCR
                    }

                    resolve(canvas);
                } catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error("Error al cargar imagen"));
            img.src = URL.createObjectURL(file);
        });
    }

    applyBasicFilters(canvas) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Grayscale + Contrast boost
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            // High contrast point
            const v = gray > 128 ? (gray + 20) : (gray - 20);
            const final = Math.max(0, Math.min(255, v));
            data[i] = final; data[i + 1] = final; data[i + 2] = final;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    applyAllCorrections(text) {
        let corrected = text;

        // ═══════════════════════════════════════════════════
        // CORRECCIONES DE FRACCIONES
        // ═══════════════════════════════════════════════════
        corrected = corrected.replace(/(\d)%\s*(?=taza|cucharadita|cucharada)/gi, '$1½');
        corrected = corrected.replace(/3%\s*(?=de|taza)/gi, '¾');
        corrected = corrected.replace(/%[4a]\s*(?=de|cucharadita)/gi, '¼');
        corrected = corrected.replace(/\b34\s*de\s*taza\b/gi, '¾ de taza');
        corrected = corrected.replace(/\b32\s*cucharadita/gi, '½ cucharadita');
        corrected = corrected.replace(/\bAñadir\s*2\s*taza\b/gi, 'Añadir ½ taza');

        // ═══════════════════════════════════════════════════
        // CORRECCIONES DE SÍMBOLOS
        // ═══════════════════════════════════════════════════
        corrected = corrected.replace(/^[«+*]\s+/gm, '• ');
        corrected = corrected.replace(/^—\s+/gm, '→ ');
        corrected = corrected.replace(/Xx\s*[»*+=\s]+\s*\(Fácil\)/gi, '★★☆☆☆ (Fácil)');
        corrected = corrected.replace(/Xx\s*[»*+=\s]+\s*\(Media\)/gi, '★★★☆☆ (Media)');
        corrected = corrected.replace(/Xx\s*[»*+=\s]+\s*\(Difícil\)/gi, '★★★★☆ (Difícil)');

        // ═══════════════════════════════════════════════════
        // CORRECCIONES DE EMOJIS
        // ═══════════════════════════════════════════════════
        corrected = corrected.replace(/^A\s*IMPORTANTE:/gm, '⚠️ IMPORTANTE:');
        corrected = corrected.replace(/^@\s*TIPS:/gm, '💡 TIPS:');
        corrected = corrected.replace(/^6\s*ALMACENAMIENTO:/gm, '⏱️ ALMACENAMIENTO:');

        // ═══════════════════════════════════════════════════
        // CORRECCIONES DE CARACTERES CONFUNDIDOS
        // ═══════════════════════════════════════════════════
        corrected = corrected.replace(/(\d+)\s*mi\b/g, '$1ml');
        corrected = corrected.replace(/\bhomo\b/gi, 'horno');
        corrected = corrected.replace(/(\d+)%(?=\s*\(|\))/g, '$1°F');
        corrected = corrected.replace(/1\s*semanal\b/gi, '1 semana');

        // ═══════════════════════════════════════════════════
        // CORRECCIONES DE PALABRAS COMUNES
        // ═══════════════════════════════════════════════════
        const wordCorrections = {
            'Tiemos': 'Tiempo', 'tienpo': 'tiempo', 'ones': 'minutos',
            'orenaración': 'preparación', 'Porciminutos': 'Porciones',
            'allados': 'rallados', 'tornates': 'tomates',
            'aio': 'ajo', 'sebolla': 'cebolla'
        };

        for (const [wrong, right] of Object.entries(wordCorrections)) {
            corrected = corrected.replace(new RegExp('\\b' + wrong + '\\b', 'gi'), right);
        }

        // ═══════════════════════════════════════════════════
        // UNIDADES Y NORMALIZACIÓN
        // ═══════════════════════════════════════════════════
        corrected = corrected.replace(/(\d+)i\b/g, '$1l');
        corrected = corrected.replace(/(\d+)rn\b/g, '$1m');
        corrected = corrected.replace(/\((\d+(?:\.\d+)?)8\)/g, '($1g)');

        corrected = corrected.replace(/ {2,}/g, ' ');
        corrected = corrected.replace(/\n{3,}/g, '\n\n');
        corrected = corrected.replace(/^ +| +$/gm, '');

        return corrected.trim();
    }

    /**
     * Parsea texto crudo para extraer estructura (usado por recipe-form.html)
     */
    parseRecipeText(text) {
        const corrected = this.applyAllCorrections(text);
        return {
            name: this.extractRecipeName(corrected),
            ingredients: this.extractIngredients(corrected),
            steps: this.extractSteps(corrected)
        };
    }

    extractRecipeName(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
            // Eliminar adornos comunes en el título
            return lines[0].replace(/[═─━*#_-]+/g, '').trim();
        }
        return 'Nueva Receta';
    }

    extractIngredients(text) {
        const ingredients = [];
        let inSection = false;

        const lines = text.split('\n');
        for (const line of lines) {
            const clean = line.trim().toLowerCase();
            if (clean.includes('ingrediente')) { inSection = true; continue; }
            if (clean.includes('preparación') || clean.includes('paso') || clean.includes('instrucción')) { inSection = false; continue; }

            if (inSection && line.trim().length > 2) {
                // Limpiar viñetas
                ingredients.push(line.replace(/^[-•*◦▪▫+—–\d\.]+\s*/, '').trim());
            }
        }
        return ingredients;
    }

    extractSteps(text) {
        const steps = [];
        let inSection = false;

        const lines = text.split('\n');
        for (const line of lines) {
            const clean = line.trim().toLowerCase();
            if (clean.includes('preparación') || clean.includes('paso') || clean.includes('instrucción')) { inSection = true; continue; }
            if (clean.includes('notas') || clean.includes('tips')) { inSection = false; continue; }

            if (inSection && line.trim().length > 5) {
                // Limpiar números de paso si ya vienen
                steps.push(line.replace(/^\d+[\.\)\-\s]+/, '').trim());
            }
        }
        return steps;
    }
}

window.ocrProcessor = new OCRProcessor();
