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
        const cameraState = document.getElementById('ocrCameraState');
        const resultState = document.getElementById('ocrResultState');

        if (preview) { preview.style.display = 'none'; preview.src = ''; }
        if (video) video.style.display = 'block';
        if (loadingState) loadingState.style.display = 'none';
        if (cameraState) cameraState.style.display = 'flex';
        if (resultState) resultState.style.display = 'none';

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
        if (message.status === 'recognizing text') {
            const p = Math.round(message.progress * 100);
            const progressText = document.getElementById('ocrProgressText');
            const progressBar = document.getElementById('ocrProgressBar');
            if (progressText) progressText.textContent = window.i18n ? window.i18n.t('ocrReading', { progress: p }) : `Leyendo... ${p}%`;
            if (progressBar) progressBar.style.width = p + '%';
        }
    }

    async capture() {
        if (!this.videoElement || !this.stream) return;
        const video = this.videoElement;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Show "Analizando..." with image preview
        this.stopCamera();
        this.showProcessingState(imageDataUrl);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });

        try {
            const mode = document.querySelector('input[name="ocrMode"]:checked')?.value || 'fidelity';
            const results = await window.ocrManager.processImage(file, m => this.updateProgress(m), { mode, returnJSON: true });
            this.showResults(results.data, results);
        } catch (error) {
            console.error('Capture error:', error);
            if (window.utils) window.utils.showToast('No se pudo analizar la imagen. Intenta con mejor iluminación.', 'error');
            this.resetModal();
        }
    }

    showResults(data, metadata) {
        const cameraState = document.getElementById('ocrCameraState');
        const resultState = document.getElementById('ocrResultState');
        const loadingState = document.getElementById('ocrLoading');

        if (cameraState) cameraState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'none';
        if (resultState) resultState.style.display = 'flex';

        // Render generated JSON back into strings for Editor
        const jsonText = JSON.stringify(data, null, 2);
        const textOutput = document.getElementById('extractedText');
        if (textOutput) textOutput.value = jsonText;

        const nameInput = document.getElementById('ocrRecipeName');
        if (nameInput) nameInput.value = data.title || '';

        // Confidence badge
        const conf = Math.round(metadata.confidence || 0);
        const confBadge = document.getElementById('confidenceBadge');
        if (confBadge) {
            confBadge.textContent = `Precisión: ${conf}%`;
            confBadge.style.color = conf >= 85 ? '#10B981' : conf >= 60 ? '#F59E0B' : '#EF4444';
            confBadge.style.fontWeight = 'bold';
            confBadge.style.fontSize = '14px';
        }

        // Store original text for Phase 7 (Adaptive Learning)
        this.originalRawText = jsonText;

        // Feedback
        if (!data || !data.ingredients) {
            if (window.utils) window.utils.showToast('La imagen no contenía texto legible.', 'warning');
        } else if (metadata.needsReview) {
            if (window.utils) window.utils.showToast(`Revisa las cantidades. Alertas pendientes.`, 'warning');
        }

        // Auto-scroll para que se vea el texto
        if (resultState) {
            resultState.scrollTop = 0;
            setTimeout(() => resultState.scrollTop = 0, 100);
        }

        console.log(`✅ showResults: ${text.length} chars, confianza ${conf}%`);
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
            const mode = document.querySelector('input[name="ocrMode"]:checked')?.value || 'fidelity';
            const results = await window.ocrManager.processImage(file, m => this.updateProgress(m), { mode, returnJSON: true });
            this.showResults(results.data, results);
        } catch (error) {
            console.error('Gallery error:', error);
            if (window.utils) window.utils.showToast('No se pudo analizar la imagen.', 'error');
            this.resetModal();
        }
    }

    /**
     * Phase 7: Adaptive Learning
     * Compares original text with edited text and saves word mappings.
     */
    learnCorrections() {
        const textOutput = document.getElementById('extractedText');
        if (!textOutput || !this.originalRawText) return;

        const editedText = textOutput.value;
        if (editedText === this.originalRawText) return;

        try {
            const originalJSON = JSON.parse(this.originalRawText);
            const latestJSON = JSON.parse(editedText);
            if (window.ocrManager) window.ocrManager.adaptiveProfile.learnCorrections(originalJSON, latestJSON);
        } catch (e) {
            console.log("JSON parse error on learning phase", e);
        }
    }
}

window.ocrManager = new OCRManager();
window.ocr = new OCRScanner();
