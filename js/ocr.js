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
        
        // v253: Activar visual green guide
        const overlay = document.getElementById('ocrOverlay');
        if (overlay) overlay.classList.add('active');
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
        const p = Math.round((message.progress || 0) * 100);
        
        const percentText = document.getElementById('ocrPercent');
        const progressText = document.getElementById('ocrProgressText');
        const progressBar = document.getElementById('ocrProgressBar');
        const m3Blob = document.getElementById('m3Blob');
        const m3Checkmark = document.getElementById('m3Checkmark');
        const glassOverlay = document.getElementById('ocrGlassOverlay');

        if (percentText) percentText.textContent = `${p}%`;

        if (message.message && progressText) {
            progressText.textContent = message.message;
        }

        if (progressBar) progressBar.style.width = p + '%';

        // Animación de Éxito al llegar a 100%
        if (p >= 100 || message.status === 'completado') {
            if (m3Blob) m3Blob.classList.add('success');
            if (m3Checkmark) m3Checkmark.style.opacity = '1';
            if (glassOverlay) glassOverlay.style.opacity = '0'; // Quitar frosted glass
        }
    }


    async capture() {
        if (!this.videoElement || !this.stream) return;
        
        const video = this.videoElement;
        const overlay = document.getElementById('ocrOverlay');
        
        if (overlay) {
            // Efecto de captura: Flash verde intenso
            overlay.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            setTimeout(() => { if(overlay) overlay.style.backgroundColor = 'transparent'; }, 200);
        }
        
        if (!overlay) {
            console.warn('⚠️ No ocrOverlay found, legacy capture.');
            return this._captureLegacy();
        }

        // 1. Calculate Real Dimensions (Handling Object-Fit: Cover)
        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;
        const cWidth = video.clientWidth;
        const cHeight = video.clientHeight;

        const videoRatio = vWidth / vHeight;
        const clientRatio = cWidth / cHeight;

        let drawScale, xOffset = 0, yOffset = 0;

        if (videoRatio > clientRatio) {
            drawScale = cHeight / vHeight;
            xOffset = (vWidth * drawScale - cWidth) / 2;
        } else {
            drawScale = cWidth / vWidth;
            yOffset = (vHeight * drawScale - cHeight) / 2;
        }

        const realCropX = (overlay.offsetLeft + xOffset) / drawScale;
        const realCropY = (overlay.offsetTop + yOffset) / drawScale;
        const realCropW = overlay.offsetWidth / drawScale;
        const realCropH = overlay.offsetHeight / drawScale;

        // 2. High-Res Canvas Creator
        const canvas = document.createElement('canvas');
        canvas.width = realCropW;
        canvas.height = realCropH;
        const ctx = canvas.getContext('2d');

        // Capture raw frame
        ctx.drawImage(video, realCropX, realCropY, realCropW, realCropH, 0, 0, realCropW, realCropH);

        // 3. Dropbox-Style Professional Preprocessing
        this.applyScannerEnhancement(canvas);

        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Show Processing State
        this.stopCamera();
        this.showProcessingState(imageDataUrl);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });

        const selectedLang = document.getElementById('ocrLang')?.value || 'spa';

        try {
            // v252: Precision check - No over-processing later because we already optimized it here
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m), { lang: selectedLang });

            if (results.success) {
                this.showResults(results);
            } else {
                throw new Error(results.error);
            }
        } catch (error) {
            console.error('Capture error:', error);
            if (window.showSnackbar) window.showSnackbar('No se pudo analizar. Limpia la lente e intenta con luz directa.');
            this.resetModal();
        }
    }

    /**
     * Dropbox/Adobe Scan Logic: Adaptive Thresholding + Contrast Boost
     * Uses Integral Images for O(N) performance on mobile.
     */
    applyScannerEnhancement(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        // Step A: Convert to Grayscale & Initial Contrast
        // v259: Aumentar contraste para hacerlo 'un poco más blanco y negro' sin blobs
        const factor = 1.5; 
        for (let i = 0; i < data.length; i += 4) {
            let g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            g = Math.min(255, Math.max(0, factor * (g - 128) + 128));
            data[i] = data[i + 1] = data[i + 2] = g; 
            data[i + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
    }

    async _captureLegacy() {
        const video = this.videoElement;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        this.applyScannerEnhancement(canvas);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this.stopCamera();
        this.showProcessingState(imageDataUrl);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });
        const selectedLang = document.getElementById('ocrLang')?.value || 'spa';
        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m), { lang: selectedLang });

            if (results.success) this.showResults(results);
            else throw new Error(results.error);
        } catch (error) { this.resetModal(); }
    }

    showResults(results) {
        console.log("🔍 [DEBUG] OCR Results:", JSON.stringify(results, null, 2));
        window.currentOCRResults = results;
        const isMainPageMode = document.getElementById('ocrFullText') !== null;
        if (isMainPageMode) {
            this.close();
            const resultHeader = document.getElementById('ocrResultHeaderStep1');
            const resultBody = document.getElementById('ocrResultBodyStep1');
            const captureSection = document.getElementById('ocrCaptureSection');
            const tipsSection = document.getElementById('ocrTipsSection');
            if (resultHeader) resultHeader.classList.remove('hidden');
            if (resultBody) resultBody.classList.remove('hidden');
            if (captureSection) captureSection.classList.add('hidden');
            if (tipsSection) tipsSection.classList.add('hidden');



            
            // Corregido: Actualizar todos los inputs de nombre (resolver ID duplicado)
            document.querySelectorAll('[id="ocrRecipeName"]').forEach(nameInput => {
                nameInput.value = results.nombre || '';
            });

            const pageFullText = document.getElementById('ocrFullText');
            if (pageFullText) pageFullText.value = results.texto;

            const structuredView1 = document.getElementById('ocrStructuredViewStep1');
            const rawView1 = document.getElementById('ocrRawViewStep1');
            const structuredView3 = document.getElementById('ocrStructuredViewStep3');
            const rawView3 = document.getElementById('ocrRawViewStep3');

            if (results.isStructured) {
                if (structuredView1) {
                    structuredView1.style.display = 'block';
                    structuredView1.classList.remove('hidden');
                }
                if (rawView1) rawView1.style.display = 'none';

                if (structuredView3) {
                    structuredView3.style.display = 'block';
                    structuredView3.classList.remove('hidden');
                }
                if (rawView3) rawView3.style.display = 'none';


                const renderIngs = (listId) => {
                    const list = document.getElementById(listId);
                    if (!list) return;
                    list.innerHTML = (results.ingredientes || []).map((ing, idx) => `
                        <div style="display: flex; align-items: flex-start; gap: 8px; background: var(--surface); padding: 10px 14px; border-radius: 14px; border: 1px solid var(--border);">
                            <span style="color: var(--primary); font-size: 18px; line-height: 1; flex-shrink: 0; margin-top: 1px;">•</span>
                            <div contenteditable="true" data-idx="${idx}" data-type="ing" style="font-size: 14px; color: var(--md-on-surface); line-height: 1.4; outline: none; cursor: text; flex: 1;">
                                ${ing.cantidad ? `<strong style="color: var(--primary); margin-right: 4px;">${ing.cantidad}</strong>` : ''}
                                ${ing.unidad ? `<span style="opacity: 0.8; font-weight: 500; margin-right: 4px;">${ing.unidad}</span>` : ''}
                                <span>${ing.nombre}</span>
                            </div>
                        </div>
                    `).join('');
                };


                const renderSteps = (listId) => {
                    const list = document.getElementById(listId);
                    if (!list) return;
                    list.innerHTML = (results.pasos || []).map((paso, idx) => `
                        <div style="display: flex; gap: 12px; align-items: flex-start;">
                            <span style="background: var(--primary); color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; margin-top: 2px;">${idx + 1}</span>
                            <p contenteditable="true" data-idx="${idx}" data-type="paso" style="margin: 0; font-size: 14px; color: var(--md-on-surface-variant); line-height: 1.6; outline: none; cursor: text; flex: 1;">${paso}</p>
                        </div>
                    `).join('');
                };


                renderIngs('ocrIngredientsListStep1');
                renderIngs('ocrIngredientsListStep3');
                renderSteps('ocrStepsListStep1');
                renderSteps('ocrStepsListStep3');

            } else {
                if (structuredView1) structuredView1.classList.add('hidden');
                if (rawView1) rawView1.classList.remove('hidden');
                if (structuredView3) structuredView3.classList.add('hidden');
                if (rawView3) rawView3.classList.remove('hidden');
            }

            // Cálculo de Badge de Confianza (Part 4)
            const conf = Math.round(results.confidence || 0);
            const updateBadge = (id) => {
                const badge = document.getElementById(id);
                if (badge) {
                    badge.textContent = `${conf}%`;
                    badge.style.background = conf >= 85 ? '#10B981' : conf >= 60 ? '#F59E0B' : '#EF4444';

                    badge.style.display = 'inline-flex';
                    badge.style.color = 'white';
                    badge.style.padding = '4px 12px';
                    badge.style.borderRadius = '16px';
                    badge.style.fontSize = '14px';
                    badge.style.fontWeight = '700';
                }
            };
            
            updateBadge('confidenceBadge');
            updateBadge('confidenceBadgeStep1');

            if (resultBody) resultBody.scrollIntoView({ behavior: 'smooth' });
        } else {
            this.stopCamera();
            const cameraState = document.getElementById('ocrCameraState');
            const loadingState = document.getElementById('ocrLoading');
            const resultState = document.getElementById('ocrResultState');
            if (cameraState) cameraState.style.display = 'none';
            if (loadingState) loadingState.style.display = 'none';
            
            if (resultState) {
                resultState.style.display = 'flex';
                


            }

            const nameInput = document.getElementById('ocrRecipeNameModal');
 // Corregido ID
            if (nameInput) nameInput.value = results.nombre || 'Nueva Receta OCR';
            const extractedText = document.getElementById('extractedTextModal'); // Corregido ID
            if (extractedText) extractedText.value = results.texto || '';
        }
    }

    async handleGallery(file) {

        if (!file) return;
        const reader = new FileReader();
        const imageDataUrl = await new Promise((resolve) => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
        this.stopCamera();
        const selectedLang = document.getElementById('ocrLang')?.value || 'spa';
        this.showProcessingState(imageDataUrl);
        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m), { lang: selectedLang });

            if (results.success) this.showResults(results);
            else throw new Error(results.error);
        } catch (error) { this.resetModal(); }
    }

    learnCorrections() { console.log("Sistema local no requiere fase de aprendizaje."); }
}

window.ocr = new OCRScanner();
