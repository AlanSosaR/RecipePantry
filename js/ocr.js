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
        if (typeof Tesseract === 'undefined' && typeof window.Tesseract === 'undefined') {
            console.error('Tesseract is not defined');
            throw new Error('El sistema de reconocimiento (Tesseract) no se ha cargado correctamente. Por favor, recarga la página.');
        }

        const tesseractInstance = typeof Tesseract !== 'undefined' ? Tesseract : window.Tesseract;

        try {
            // En v5, Tesseract.recognize es la forma más limpia y robusta 
            // de manejar el ciclo de vida del worker automáticamente.
            const { data } = await tesseractInstance.recognize(imageFile, 'spa+eng', {
                logger: m => {
                    if (onProgress) onProgress(m);
                }
            });

            return {
                text: data.text,
                confidence: data.confidence
            };
        } catch (error) {
            console.error('Error en Tesseract.recognize:', error);
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
            window.utils.showToast('No se pudo acceder a la cámara. Revisa los permisos.', 'error');
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
        loading.style.display = 'flex';

        try {
            // Dibujar frame en canvas oculto
            const canvas = document.createElement('canvas');
            canvas.width = this.videoElement.videoWidth;
            canvas.height = this.videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.videoElement, 0, 0);

            // Convertir a Blob/File
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
            const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });

            // Procesar con OCRProcessor
            const results = await window.ocrProcessor.processImage(file);

            this.showResults(results);
        } catch (error) {
            console.error('OCR Error:', error);
            window.utils.showToast('Error al procesar la imagen', 'error');
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
            const results = await window.ocrProcessor.processImage(file);
            this.showResults(results);
        } catch (error) {
            console.error('OCR Error:', error);
            window.utils.showToast('Error al procesar archivo', 'error');
        } finally {
            loading.style.display = 'none';
        }
    }
}

// Exponer instancias globales
window.ocrProcessor = new OCRProcessor();
window.ocr = new OCRScanner();
