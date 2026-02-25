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
     * Ahora utiliza una Supabase Edge Function con IA para mayor precisión.
     */
    async processImage(imageFile, onProgress) {
        const loading = document.getElementById('ocrLoading');
        if (loading) loading.style.display = 'flex';

        try {
            // El archivo ya viene procesado (recortado) si era necesario
            const reader = new FileReader();
            const base64Promise = new Promise((resolve) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(imageFile);
            });

            const base64Image = await base64Promise;

            const { data, error } = await window.supabaseClient.functions.invoke('ocr-ai', {
                body: { image: base64Image }
            });

            if (error) {
                // Si es un error de la función, intentar obtener el detalle del body
                if (error.context && error.context.json) {
                    const detail = await error.context.json();
                    console.error('Detalle del error de la función:', detail);
                    throw new Error(detail.error || error.message);
                }
                throw error;
            }

            return {
                text: data.text,
                confidence: data.confidence || 100
            };
        } catch (error) {
            console.error('Error en el proceso de OCR con IA:', error);

            // Fallback a Tesseract si la función de IA falla (opcional, pero mejor avisar)
            window.showToast(window.i18n ? window.i18n.t('ocrAiFallback') : 'Error con la IA, intentando escaneo local...', 'info');

            if (typeof Tesseract === 'undefined' && typeof window.Tesseract === 'undefined') {
                throw new Error('El sistema de reconocimiento no está disponible.');
            }
            const tesseractInstance = typeof Tesseract !== 'undefined' ? Tesseract : window.Tesseract;
            const { data } = await tesseractInstance.recognize(imageFile, 'spa+eng', {
                logger: m => { if (onProgress) onProgress(m); }
            });
            return { text: data.text, confidence: data.confidence };
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }

    /**
     * Recorta la barra de estado superior de una imagen si parece ser una captura de móvil.
     * @param {Blob|File} imageFile - El archivo de imagen original.
     * @returns {Promise<Blob>} - El blob de la imagen recortada.
     */
    async cleanStatusBar(imageFile) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Si la imagen es vertical (móvil) y tiene dimensiones típicas de captura
                const isProbablyMobile = img.height > img.width;
                const cropHeight = isProbablyMobile ? 80 : 0;

                canvas.width = img.width;
                canvas.height = img.height - cropHeight;

                // Dibujar la imagen empezando desde los 80px (o 0) superiores
                ctx.drawImage(img, 0, cropHeight, img.width, img.height - cropHeight, 0, 0, img.width, img.height - cropHeight);

                canvas.toBlob((blob) => {
                    resolve(blob || imageFile);
                }, 'image/jpeg', 0.9);
            };
            img.onerror = () => resolve(imageFile);
            img.src = URL.createObjectURL(imageFile);
        });
    }

    /**
     * Parsea un texto crudo en una estructura de receta: nombre, ingredientes, pasos.
     */
    parseRecipeText(text) {
        // Robust line splitting (handles \r\n and multiple spaces)
        const lines = text.split(/\r?\n/)
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
        // Clean bullets and em-dashes
        let clean = line.replace(/^[-•*◦▪▫+—–]\s*/, '').trim();
        // Remove common coffee labels that aren't ingredients but can be parsed as such
        if (clean.toLowerCase().startsWith('variedad') || clean.toLowerCase().startsWith('proceso')) {
            clean = clean.replace(/^(asvariedad|proceso)\s*[:—–-]?\s*/i, '');
        }
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

    /**
     * Realiza un análisis exhaustivo del texto (Modo Anti Gravity)
     */
    performExhaustiveAnalysis(text, confidence) {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

        // 1. Detectar Números y Datos
        const numbersMatch = text.match(/\d+(?:[\.,\/\d\s]*\d+)?/g) || [];

        // 2. Detectar Emojis y Símbolos
        const emojis = Array.from(text.matchAll(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2B50}\u{2B06}\u{2194}\u{2934}\u{2935}]/gu)).map(m => m[0]);
        const symbols = Array.from(text.matchAll(/[©®™★♦✓→+\-×÷=≠≈∞]/g)).map(m => m[0]);
        const allSymbols = [...new Set([...emojis, ...symbols])];

        // 3. Document Type & Language
        const isRecipe = text.toLowerCase().includes('ingrediente') || text.toLowerCase().includes('preparación') || text.toLowerCase().includes('ingredient') || text.toLowerCase().includes('preparation');
        const docType = isRecipe
            ? (window.i18n ? window.i18n.t('ocrDocTypeRecipe') : 'Receta de Cocina')
            : (window.i18n ? window.i18n.t('ocrDocTypeGeneral') : 'Documento / Texto General');
        const language = this.detectLanguage(text);

        // 4. Alertas (Graphed from confidence or formatting issues)
        const alerts = [];
        if (confidence < 70) alerts.push(window.i18n ? window.i18n.t('ocrAlertLowConfidence') : 'Calidad de lectura media/baja.');
        if (text.length < 50) alerts.push(window.i18n ? window.i18n.t('ocrAlertShortText') : 'Texto muy corto.');

        return {
            raw: text,
            stats: {
                hasText: lines.length > 0 ? 'SÍ' : 'NO',
                language: language,
                numbersCount: numbersMatch.length,
                symbols: allSymbols,
                docType: docType
            },
            alerts: alerts
        };
    }

    detectLanguage(text) {
        const commonSpanish = ['de', 'la', 'el', 'los', 'con', 'para', 'una', 'ingredientes', 'preparación'];
        const lower = text.toLowerCase();
        const matches = commonSpanish.filter(word => lower.includes(` ${word} `) || lower.startsWith(word)).length;
        if (matches > 2) return window.i18n ? window.i18n.t('ocrLangEs') : 'Español';
        return window.i18n ? window.i18n.t('ocrLangAuto') : 'Detectado (Auto)';
    }

    generateExhaustiveReport(analysis) {
        if (!window.i18n) return analysis.raw; // Fallback

        const report = `---
${window.i18n.t('ocrReportExtracted')}
${analysis.raw}

---
${window.i18n.t('ocrReportElements')}
${window.i18n.t('ocrReportTpl', {
            hasText: analysis.stats.hasText,
            language: analysis.stats.language,
            numCount: analysis.stats.numbersCount,
            symbols: analysis.stats.symbols.join(' ') || 'None',
            docType: analysis.stats.docType
        })}

---
${window.i18n.t('ocrReportAlerts')}
${analysis.alerts.length > 0 ? analysis.alerts.map(a => '- ' + a).join('\n') : window.i18n.t('ocrReportNominal')}
`;
        return report;
    }
}

/**
 * OCRScanner - RecipeHub Premium
 * Gestiona la interfaz de la cámara, captura de frames y comunicación con OCRProcessor.
 */
class OCRScanner {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.currentFacingMode = 'environment';
    }

    async openModal() {
        const modal = document.getElementById('ocrModal');
        if (!modal) return;

        modal.classList.add('open');
        this.videoElement = document.getElementById('videoFeed');
        await this.startCamera();

        // Reset results state
        document.getElementById('ocrCameraState').style.display = 'flex';
        document.getElementById('ocrResultState').style.display = 'none';
        document.getElementById('ocrLoading').style.display = 'none';
    }

    async close() {
        const modal = document.getElementById('ocrModal');
        if (modal) modal.classList.remove('open');
        this.stopCamera();
    }

    async startCamera() {
        if (this.stream) this.stopCamera();

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.currentFacingMode },
                audio: false
            });
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                await this.videoElement.play();
            }
        } catch (err) {
            console.error('Error al acceder a la cámara:', err);
            window.showToast(window.i18n ? window.i18n.t('ocrCameraError') : 'No se pudo acceder a la cámara.', 'error');
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    async switchCamera() {
        this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
        await this.startCamera();
    }

    async capture() {
        if (!this.videoElement || !this.stream) return;

        const loading = document.getElementById('ocrLoading');
        const video = this.videoElement;
        const preview = document.getElementById('capturePreview');

        try {
            // Show loading spinner
            loading.style.display = 'flex';

            // Draw current frame to canvas
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            // Show frozen preview of the captured frame while processing
            if (preview) {
                preview.src = canvas.toDataURL('image/jpeg', 0.85);
                preview.style.display = 'block';
                video.style.display = 'none';
            }

            // Convert canvas to blob for processing
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));

            // Convert back to File for processing
            const processedBlob = await window.ocrProcessor.cleanStatusBar(blob);
            const file = new File([processedBlob], 'scan.jpg', { type: 'image/jpeg' });

            // Process with OCRProcessor
            const results = await window.ocrProcessor.processImage(file);
            this.showResults(results);

        } catch (error) {
            console.error('OCR Error:', error);
            window.showToast(window.i18n ? window.i18n.t('ocrProcessError') : 'Error al procesar la imagen', 'error');
            // On error, restore camera view
            if (preview) { preview.style.display = 'none'; }
            if (video) { video.style.display = 'block'; }
        } finally {
            loading.style.display = 'none';
        }
    }

    showResults(results) {
        this.stopCamera();
        document.getElementById('ocrCameraState').style.display = 'none';
        document.getElementById('ocrResultState').style.display = 'flex';

        const textOutput = document.getElementById('extractedText');
        if (textOutput) textOutput.value = results.text;

        // Auto-parse for preview if possible
        const parsed = window.ocrProcessor.parseRecipeText(results.text);
        const nameInput = document.getElementById('ocrRecipeName');
        if (nameInput) nameInput.value = parsed.name || '';
    }

    async handleGallery(file) {
        if (!file) return;
        const loading = document.getElementById('ocrLoading');
        loading.style.display = 'flex';

        try {
            const processedBlob = await window.ocrProcessor.cleanStatusBar(file);
            const processedFile = new File([processedBlob], file.name, { type: file.type });
            const results = await window.ocrProcessor.processImage(processedFile);
            this.showResults(results);
        } catch (error) {
            console.error('OCR Error:', error);
            window.showToast('Error al procesar archivo', 'error');
        } finally {
            loading.style.display = 'none';
        }
    }
}

// Exponer instancias globales
window.ocrProcessor = new OCRProcessor();
window.ocr = new OCRScanner();
