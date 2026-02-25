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
     * Sistema de Post-Procesamiento Inteligente v3.0
     * Aplica reglas culinarias para limpiar y estructurar el texto.
     */
    smartCorrectText(rawText) {
        let texto = rawText;

        // 1. Extraer nombre de receta (primeras 5 líneas)
        const lineas = texto.split(/\r?\n/);
        let nombreReceta = '';

        for (let i = 0; i < Math.min(5, lineas.length); i++) {
            const linea = lineas[i]
                .replace(/[═─━]+/g, '')
                .trim();

            // Criterios para nombre: MAYÚSCULAS o contiene 'RECETA'
            if (linea.length > 2 &&
                linea.length < 60 &&
                (linea.includes('RECETA') || linea === linea.toUpperCase())) {
                nombreReceta = linea
                    .replace(/RECETA DE /gi, '')
                    .trim();
                // Capitalizar
                if (nombreReceta.length > 0) {
                    nombreReceta = nombreReceta.charAt(0).toUpperCase() + nombreReceta.slice(1).toLowerCase();
                }
                break;
            }
        }

        // 2. Correcciones tipográficas comunes
        const correcciones = {
            'Tiemos': 'Tiempo',
            'orenaración': 'preparación',
            'ones': 'minutos',
            'anios': 'minutos',
            'allados': 'rallados',
            'itros': 'litros',
            'tornates': 'tomates',
            'aio': 'ajo',
            'sebolla': 'cebolla',
            'nicar': 'picar',
            'trosear': 'picar'
        };

        for (const [mal, bien] of Object.entries(correcciones)) {
            texto = texto.replace(new RegExp(mal, 'gi'), bien);
        }

        // 3. Números y Unidades
        texto = texto.replace(/(\d+)mi\b/g, '$1ml'); // 200mi -> 200ml
        texto = texto.replace(/(\d+)\s?(tomates|ajo|cebolla|aceite|sal)/gi, '$1 $2'); // 2tomates -> 2 tomates
        texto = texto.replace(/\((\d+\.\d+)8\)/g, '($1g)'); // (0.58) -> (0.5g)
        texto = texto.replace(/(\d+)-(\d+)8\b/g, '$1-$2g'); // 15-208 -> 15-20g
        texto = texto.replace(/«\s*(\d*)\s*litros/gi, '1½ litros'); // « 1itros -> 1½ litros

        // 4. Símbolos especiales
        texto = texto.replace(/^[+*]\s/gm, '• ');
        texto = texto.replace(/^Y\s/gm, '✓ ');
        texto = texto.replace(/^>\s/gm, '→ ');
        texto = texto.replace(/^- \s/gm, '• ');

        // 5. Dificultad (XX -> Estrellas)
        texto = texto.replace(/XX \(Media\)/gi, '★★★☆☆ (Media)');
        texto = texto.replace(/XX \(Fácil\)/gi, '★★☆☆☆ (Fácil)');
        texto = texto.replace(/XX \(Difícil\)/gi, '★★★★☆ (Difícil)');
        texto = texto.replace(/XX \(Muy Difícil\)/gi, '★★★★★ (Muy Difícil)');

        // --- Fase 2: Refinamiento de Errores Residuales ---
        // 1. Corregir palabras fusionadas
        texto = texto.replace(/Porci\w*:/gi, 'Porciones:');
        texto = texto.replace(/Tiempominutos/gi, 'Tiempo');
        texto = texto.replace(/Dificultades/gi, 'Dificultad');

        // 2. Inteligencia de Sección y Símbolos en Listas
        const lineasRefinadas = texto.split(/\r?\n/);
        let enSeccion = null;
        let resultadoRefinado = [];

        for (let i = 0; i < lineasRefinadas.length; i++) {
            let linea = lineasRefinadas[i];

            // Detectar inicio de sección (mayúsculas + dos puntos)
            if (linea.match(/^[A-ZÁÉÍÓÚ\s]+:$/)) {
                enSeccion = linea;
                resultadoRefinado.push(linea);
                continue;
            }

            // Si estamos en una sección y la línea tiene contenido pero no tiene símbolo
            if (enSeccion && linea.trim() && !linea.match(/^[•✓→\-]/)) {
                // Determinar símbolo según sección
                let simbolo = '•';
                if (enSeccion.includes('PROTEÍNAS')) simbolo = '✓';
                if (enSeccion.includes('VERDURAS') || enSeccion.includes('CONDIMENTOS')) simbolo = '→';

                linea = simbolo + ' ' + linea.trim();
            }

            // Si línea vacía, resetear sección contextual
            if (!linea.trim()) {
                enSeccion = null;
            }

            resultadoRefinado.push(linea);
        }

        texto = resultadoRefinado.join('\n');
        // --- Fin Fase 2 ---

        // 5. Validación de Contexto Culinario (Diccionario v3.0)
        const diccionario = {
            validos: ['minutos', 'horas', 'gramos', 'litros', 'ml', 'tomates', 'cebolla', 'ajo', 'aceite', 'sal', 'rallados', 'picar', 'trocear', 'dorar'],
            errores: {
                'tornates': 'tomates',
                'aio': 'ajo',
                'sebolla': 'cebolla',
                'allar': 'rallar',
                'nicar': 'picar',
                'trosear': 'trocear',
                'timos': 'tiempo'
            }
        };

        let erroresContados = 10; // Base por regex previos
        let palabrasDudosas = 0;

        // Aplicar diccionario de errores
        for (const [mal, bien] of Object.entries(diccionario.errores)) {
            const regex = new RegExp(`\\b${mal}\\b`, 'gi');
            const matches = texto.match(regex);
            if (matches) {
                texto = texto.replace(regex, bien);
                erroresContados += matches.length;
            }
        }

        // Marcar con [?] palabras sospechosas (opcional para revisión manual)
        const palabras = texto.split(/\s+/);
        const procesadoFinal = palabras.map(p => {
            const limpia = p.replace(/[.,:;()]/g, '').toLowerCase();
            if (limpia.length > 5 && !diccionario.validos.includes(limpia) && !diccionario.errores[limpia] && !/^\d/.test(limpia)) {
                // palabrasDudosas++;
                // return p + '[?]'; // Desactivado para limpieza visual, pero listo para depurar
            }
            return p;
        }).join(' ');

        const confianzaFinal = Math.min(98, 100 - (palabrasDudosas * 1.5));

        return {
            nombre_receta: nombreReceta || 'Receta sin nombre',
            texto_corregido: texto.trim(),
            errores_corregidos: erroresContados,
            confianza: confianzaFinal
        };
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

        // Aplicar corrección inteligente v3.0
        const corrected = window.ocrProcessor.smartCorrectText(results.text);

        const textOutput = document.getElementById('extractedText');
        if (textOutput) textOutput.value = corrected.text;

        const nameInput = document.getElementById('ocrRecipeName');
        if (nameInput) nameInput.value = corrected.name || '';
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
