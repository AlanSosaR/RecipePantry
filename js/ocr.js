/**
 * OCRScanner - Recipe Pantry Premium v2.0
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
        const cameraState = document.getElementById('ocrCameraState');
        const resultState = document.getElementById('ocrResultState');
        const loadingState = document.getElementById('ocrLoading');
        if (cameraState) cameraState.style.display = 'flex';
        if (resultState) resultState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'none';
    }

    async close() {
        const modal = document.getElementById('ocrModal');
        if (modal) modal.classList.remove('open');
        this.stopCamera();
        this.resetModal();
    }

    resetModal() {
        this.stopCamera();
        const preview = document.getElementById('capturePreview');
        const video = document.getElementById('videoFeed');
        const loadingState = document.getElementById('ocrLoading');
        const captureSection = document.getElementById('ocrCaptureSection');
        if (captureSection) captureSection.style.display = 'block';
        
        const resultArea = document.getElementById('ocrResultInStep1');
        if (resultArea) resultArea.style.display = 'none';

        const tipsSection = document.getElementById('ocrTipsSection');
        if (tipsSection) tipsSection.style.display = 'block';

        if (preview) { preview.style.display = 'none'; preview.src = ''; }

        // Reset progress
        const progressText = document.getElementById('ocrProgressText');
        const progressBar = document.getElementById('ocrProgressBar');
        if (progressText) progressText.textContent = 'Iniciando OCR...';
        if (progressBar) progressBar.style.width = '0%';

        this.startCamera();
    }

    // Legacy alias
    reset() { this.resetModal(); }

    async startCamera() {
        if (this.stream) this.stopCamera();
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.currentFacingMode },
                audio: false
            });
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                try {
                    await this.videoElement.play();
                } catch (playError) {
                    if (playError.name !== 'AbortError') {
                        console.error('Error al reproducir video:', playError);
                    }
                }
            }
        } catch (err) {
            console.error('Error camera:', err);
            this.stream = null;

            // Si el usuario denegó los permisos o no hay cámara
            if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
                if (window.showSnackbar) {
                    window.showSnackbar('No hay acceso a la cámara. Sube una foto de tu galería.');
                }
                // Ocultar feed de video para que solo quede el botón de subir foto
                if (this.videoElement) {
                    this.videoElement.style.display = 'none';
                }
            } else {
                if (window.showSnackbar) {
                    window.showSnackbar('Error al iniciar la cámara. Intenta subir una foto.');
                }
            }
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

    /**
     * Show the "Analizando..." processing state with image preview
     */
    showProcessingState(imageDataUrl) {
        const cameraState = document.getElementById('ocrCameraState');
        const resultState = document.getElementById('ocrResultState');
        const loadingState = document.getElementById('ocrLoading');

        if (cameraState) cameraState.style.display = 'none';
        if (resultState) resultState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'flex';

        // Set the image preview
        const processingPreview = document.getElementById('ocrProcessingPreview');
        if (processingPreview && imageDataUrl) {
            processingPreview.src = imageDataUrl;
        }

        // Reset progress
        const progressText = document.getElementById('ocrProgressText');
        const progressBar = document.getElementById('ocrProgressBar');
        if (progressText) progressText.textContent = window.i18n ? window.i18n.t('ocrProcessing') : 'Iniciando OCR...';
        if (progressBar) progressBar.style.width = '0%';
    }

    /**
     * Update progress during OCR processing
     */
    updateProgress(message) {
        if (message.status === 'recognizing text' || message.status === 'reconociendo') {
            const p = Math.round((message.progress || 0) * 100);
            const progressText = document.getElementById('ocrProgressText');
            const progressBar = document.getElementById('ocrProgressBar');
            if (progressText) {
                progressText.textContent = window.i18n ?
                    window.i18n.t('ocrReading', { progress: p }) :
                    `Leyendo... ${p}%`;
            }
            if (progressBar) progressBar.style.width = p + '%';
        } else if (message.message) {
            const progressText = document.getElementById('ocrProgressText');
            if (progressText) progressText.textContent = message.message;
        }
    }

    async capture() {
        if (!this.videoElement || !this.stream) return;
        
        const video = this.videoElement;
        const overlay = document.getElementById('ocrOverlay');
        
        if (!overlay) {
            console.warn('⚠️ No se encontró ocrOverlay, usando captura completa.');
            return this._captureLegacy();
        }

        // 1. Calcular dimensiones reales contemplando object-fit: cover
        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;
        const cWidth = video.clientWidth;
        const cHeight = video.clientHeight;

        const videoRatio = vWidth / vHeight;
        const clientRatio = cWidth / cHeight;

        let drawScale, xOffset = 0, yOffset = 0;

        if (videoRatio > clientRatio) {
            // El video es más ancho que el contenedor (se cortan los lados)
            drawScale = cHeight / vHeight;
            xOffset = (vWidth * drawScale - cWidth) / 2;
        } else {
            // El video es más alto que el contenedor (se corta arriba/abajo)
            drawScale = cWidth / vWidth;
            yOffset = (vHeight * drawScale - cHeight) / 2;
        }

        // Mapear coordenadas del overlay (CSS px) a coordenadas del video (Physical px)
        const realCropX = (overlay.offsetLeft + xOffset) / drawScale;
        const realCropY = (overlay.offsetTop + yOffset) / drawScale;
        const realCropW = overlay.offsetWidth / drawScale;
        const realCropH = overlay.offsetHeight / drawScale;

        // 2. Crear canvas con el tamaño del recorte
        const canvas = document.createElement('canvas');
        canvas.width = realCropW;
        canvas.height = realCropH;
        const ctx = canvas.getContext('2d');

        // Dibujar solo la región de interés
        ctx.drawImage(video, realCropX, realCropY, realCropW, realCropH, 0, 0, realCropW, realCropH);

        // 3. Preprocesamiento para OCR (Grayscale + Contrast + Threshold)
        this.applyOCRPreprocessing(canvas);

        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Mostrar estado de procesamiento
        this.stopCamera();
        this.showProcessingState(imageDataUrl);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });

        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m));
            if (results.success) {
                this.showResults(results);
            } else {
                throw new Error(results.error);
            }
        } catch (error) {
            console.error('Capture error:', error);
            if (window.showSnackbar) window.showSnackbar('No se pudo analizar la imagen. Prueba con mejor luz.');
            this.resetModal();
        }
    }

    /**
     * Preprocesamiento de imagen para maximizar precisión de Tesseract
     * (Grayscale + Thresholding)
     */
    applyOCRPreprocessing(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Factor de contraste (ajustable)
        const contrast = 60; 
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
            // A. Escala de grises (Luminancia perceptiva)
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // B. Mejora de contraste
            gray = factor * (gray - 128) + 128;

            // C. Umbral simple (Binarización Blanco y Negro)
            const threshold = 128;
            const final = gray < threshold ? 0 : 255;

            data[i] = data[i + 1] = data[i + 2] = final;
            // El canal Alpha (data[i+3]) se mantiene como está (opaco)
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Método fallback por si el overlay falla
     */
    async _captureLegacy() {
        const video = this.videoElement;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        this.applyOCRPreprocessing(canvas); // Aplicamos preprocesamiento aunque no haya recorte

        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this.stopCamera();
        this.showProcessingState(imageDataUrl);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });

        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m));
            if (results.success) this.showResults(results);
            else throw new Error(results.error);
        } catch (error) {
            console.error('Legacy Capture error:', error);
            this.resetModal();
        }
    }

    showResults(results) {
        window.currentOCRResults = results;
        
        // Determinar si estamos en ocr.html (modo página principal)
        const isMainPageMode = document.getElementById('ocrFullText') !== null;

        if (isMainPageMode) {
            // MODO A: Página principal (ocr.html)
            this.close(); // Cerramos el modal

            const resultHeader = document.getElementById('ocrResultHeaderStep1');
            const resultBody = document.getElementById('ocrResultBodyStep1');
            const captureSection = document.getElementById('ocrCaptureSection');
            const tipsSection = document.getElementById('ocrTipsSection');

            if (resultHeader) resultHeader.classList.remove('hidden');
            if (resultBody) resultBody.classList.remove('hidden');
            if (captureSection) captureSection.classList.add('hidden');
            if (tipsSection) tipsSection.classList.add('hidden');

            const unifiedBody = document.querySelector('.ocr-result-unified');
            if (unifiedBody && !unifiedBody.id) unifiedBody.classList.remove('hidden'); // Soporte v148

            const nameInput = document.getElementById('ocrRecipeName');
            if (nameInput) nameInput.value = results.nombre || '';

            const pageFullText = document.getElementById('ocrFullText');
            if (pageFullText) pageFullText.value = results.texto;

            const conf = Math.round(results.confidence || 0);
            const confBadge = document.getElementById('confidenceBadgeStep1');
            if (confBadge) {
                confBadge.textContent = `${conf}%`;
                confBadge.style.background = conf >= 90 ? '#10B981' : conf >= 70 ? '#F59E0B' : '#EF4444';
                confBadge.style.display = 'inline-flex';
            }

            if (resultBody) resultBody.scrollIntoView({ behavior: 'smooth' });
            else if (unifiedBody) unifiedBody.scrollIntoView({ behavior: 'smooth' });

        } else {
            // MODO B: Modal en formulario (recipe-form.html)
            this.stopCamera();
            
            const cameraState = document.getElementById('ocrCameraState');
            const loadingState = document.getElementById('ocrLoading');
            const resultState = document.getElementById('ocrResultState');

            if (cameraState) cameraState.style.display = 'none';
            if (loadingState) loadingState.style.display = 'none';
            if (resultState) resultState.style.display = 'flex';

            const nameInput = document.getElementById('ocrRecipeName');
            if (nameInput) nameInput.value = results.nombre || 'Nueva Receta OCR';

            const extractedText = document.getElementById('extractedText');
            if (extractedText) extractedText.value = results.texto || '';
        }

        console.log(`✅ showResults: ${results.texto.length} chars, confianza ${Math.round(results.confidence || 0)}% | Método: ${results.method}`);
    }

    async handleGallery(file) {
        if (!file) return;

        // Generate preview from the gallery file
        const reader = new FileReader();
        const imageDataUrl = await new Promise((resolve) => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
        });

        // Show Analizando with preview
        this.stopCamera();
        this.showProcessingState(imageDataUrl);

        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m));
            if (results.success) {
                this.showResults(results);
            } else {
                throw new Error(results.error);
            }
        } catch (error) {
            console.error('Gallery error:', error);
            if (window.showSnackbar) window.showSnackbar('No se pudo analizar la imagen.');
            this.resetModal();
        }
    }

    learnCorrections() {
        console.log("Sistema local no requiere fase de aprendizaje.");
    }
}

// Global initialization
window.ocr = new OCRScanner();
