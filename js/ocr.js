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
        
        if (cameraState) {
            cameraState.style.display = 'flex';
            // Ensure video feed is also flex and visible
            const videoFeed = document.getElementById('videoFeed');
            if (videoFeed) videoFeed.style.display = 'block';
        }
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
        const loadingState = document.getElementById('ocrLoading');
        const captureSection = document.getElementById('ocrCaptureSection');
        if (captureSection) captureSection.style.display = 'block';
        
        const resultArea = document.getElementById('ocrResultInStep1');
        if (resultArea) resultArea.style.display = 'none';

        const tipsSection = document.getElementById('ocrTipsSection');
        if (tipsSection) tipsSection.style.display = 'block';

        if (preview) { preview.style.display = 'none'; preview.src = ''; }
        
        // v360: Reset processing previews
        const pr = document.getElementById('ocrProcessingPreview');
        if (pr) pr.src = '';
        const prm = document.getElementById('ocrProcessingPreviewModal');
        if (prm) prm.src = '';

        // Reset progress bar and text
        const percentTexts = [document.getElementById('ocrPercent'), document.getElementById('ocrPercentModal')];
        const progressTexts = [document.getElementById('processingStatus'), document.getElementById('processingStatusModal')];
        const progressBars = [document.getElementById('progressBar'), document.getElementById('progressBarModal')];

        progressTexts.forEach(el => { if (el) el.textContent = 'Iniciando OCR...'; });
        progressBars.forEach(el => { if (el) el.style.width = '0%'; });
        percentTexts.forEach(el => { if (el) el.textContent = '0%'; });

        // Reset blob animation and checkmark to initial state
        const m3Blobs = [document.getElementById('m3Blob'), document.getElementById('m3BlobModal')];
        const m3Checkmarks = [document.getElementById('m3Checkmark'), document.getElementById('m3CheckmarkModal')];
        const glassOverlays = [document.getElementById('ocrGlassOverlay'), document.getElementById('ocrGlassOverlayModal')];
        
        m3Blobs.forEach(el => {
            if (el) el.classList.remove('success');
        });
        m3Checkmarks.forEach(el => {
            if (el) el.style.opacity = '0';
        });
        glassOverlays.forEach(el => {
            if (el) el.style.opacity = '1';
        });

        // Hide loading state and show camera
        if (loadingState) loadingState.style.display = 'none';
        const cameraState = document.getElementById('ocrCameraState');
        const resultState = document.getElementById('ocrResultState');
        if (cameraState) cameraState.style.display = 'flex';
        if (resultState) resultState.style.display = 'none';

        this.startCamera();
    }


    // Legacy alias
    reset() { this.resetModal(); }

    async startCamera() {
        if (this.stream) this.stopCamera();
        try {
            // Detectar orientación para pedir la resolución 4K en el ratio correcto y evitar recortes
            const isPortrait = window.innerHeight > window.innerWidth;
            const idealW = isPortrait ? 2160 : 4096;
            const idealH = isPortrait ? 4096 : 2160;

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: this.currentFacingMode,
                    width: { ideal: idealW },
                    height: { ideal: idealH }
                },
                audio: false
            });
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                try {
                    await this.videoElement.play();
                    if (window.cameraController) {
                        window.cameraController.startScanning(this.videoElement, (corners) => {
                            this.capture(corners);
                        });
                    }
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
        if (window.cameraController) window.cameraController.stopScanning();
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

        // Set the image preview (Try both main page and modal IDs)
        const previews = [
            document.getElementById('ocrProcessingPreview'),
            document.getElementById('ocrProcessingPreviewModal')
        ];
        previews.forEach(p => {
            if (p && imageDataUrl) p.src = imageDataUrl;
        });

        // Reset progress
        const progressTexts = [document.getElementById('processingStatus'), document.getElementById('processingStatusModal')];
        const progressBars = [document.getElementById('progressBar'), document.getElementById('progressBarModal')];
        const percentTexts = [document.getElementById('ocrPercent'), document.getElementById('ocrPercentModal')];
        
        const initText = window.i18n ? window.i18n.t('ocrProcessing') : 'Iniciando OCR...';
        progressTexts.forEach(el => { if (el) el.textContent = initText; });
        progressBars.forEach(el => { if (el) el.style.width = '0%'; });
        percentTexts.forEach(el => { if (el) el.textContent = '0%'; });
    }

    /**
     * Update progress during OCR processing
     */
    updateProgress(message) {
        const p = Math.round((message.progress || 0) * 100);
        
        const percentTexts = [document.getElementById('ocrPercent'), document.getElementById('ocrPercentModal')];
        const progressTexts = [document.getElementById('processingStatus'), document.getElementById('processingStatusModal')];
        const progressBars = [document.getElementById('progressBar'), document.getElementById('progressBarModal')];
        
        const m3Blobs = [document.getElementById('m3Blob'), document.getElementById('m3BlobModal')];
        const m3Checkmarks = [document.getElementById('m3Checkmark'), document.getElementById('m3CheckmarkModal')];
        const glassOverlays = [document.getElementById('ocrGlassOverlay'), document.getElementById('ocrGlassOverlayModal')];

        percentTexts.forEach(el => { if (el) el.textContent = `${p}%`; });

        if (message.message) {
            progressTexts.forEach(el => { if (el) el.textContent = message.message; });
        }

        progressBars.forEach(el => { if (el) el.style.width = p + '%'; });

        // Animación de Éxito al llegar a 100%
        if (p >= 100 || message.status === 'completado') {
            m3Blobs.forEach(el => { if (el) el.classList.add('success'); });
            m3Checkmarks.forEach(el => { if (el) el.style.opacity = '1'; });
            glassOverlays.forEach(el => { if (el) el.style.opacity = '0'; }); // Quitar frosted glass
        }
    }


    async capture(corners = null) {
        if (!this.videoElement || !this.stream) return;
        
        if (window.cameraController) window.cameraController.stopScanning();
        
        const overlay = document.getElementById('ocrOverlay');
        
        if (overlay) {
            // Efecto de captura: Flash verde intenso
            overlay.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            setTimeout(() => { if(overlay) overlay.style.backgroundColor = 'transparent'; }, 200);
        }
        
        if (!overlay && !window.cameraController) {
            console.warn('⚠️ No ocrOverlay found, legacy capture.');
            return this._captureLegacy();
        }

        let canvas;
        if (window.cameraController) {
            let useCorners = corners || window.cameraController.lastCorners;
            canvas = window.cameraController.processCapture(useCorners);
        } else {
            return this._captureLegacy();
        }

        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Show Processing State
        this.stopCamera();
        this.showProcessingState(imageDataUrl);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });

        const selectedLang = window.selectedOcrLang || 'spa';

        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m), { lang: selectedLang });

            if (results.success) {
                // Esperar a que el usuario vea el 100% antes de mostrar resultados
                await new Promise(resolve => setTimeout(resolve, 700));
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
        // Removed applyScannerEnhancement to guarantee original photo quality
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this.stopCamera();
        this.showProcessingState(imageDataUrl);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });
        const selectedLang = document.getElementById('ocrLang')?.value || 'spa';
        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m), { lang: selectedLang });

            if (results.success) {
                await new Promise(resolve => setTimeout(resolve, 700));
                this.showResults(results);
            }
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
            
            // Switch active step back to step1 safely without triggering goToStep(1) resets
            document.querySelectorAll('.ocr-step').forEach(el => el.classList.remove('active'));
            const step1 = document.getElementById('step1');
            if (step1) step1.classList.add('active');



            
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

                const renderIngs = (listId) => {
                    const list = document.getElementById(listId);
                    if (!list) return;
                    list.innerHTML = (results.ingredientes || []).map((ing, idx) => `
                        <div class="ocr-edit-card">
                            <span style="color: var(--primary); font-size: 18px; line-height: 1; flex-shrink: 0; margin-top: 1px;">•</span>
                            <div contenteditable="true" data-idx="${idx}" data-type="ing" style="font-size: 14px; color: var(--md-on-surface); line-height: 1.4;">
                                ${ing.cantidad ? `<strong style="color: var(--primary); margin-right: 4px;">${ing.cantidad}</strong>` : ''}
                                ${ing.unidad ? `<span style="opacity: 0.8; font-weight: 500; margin-right: 4px;">${ing.unidad}</span>` : ''}
                                <span>${ing.nombre}</span>
                            </div>
                            <span class="material-symbols-outlined" style="font-size: 20px; color: var(--primary); opacity: 0.8;">check_circle</span>
                        </div>
                    `).join('');
                };



                const renderSteps = (listId) => {
                    const list = document.getElementById(listId);
                    if (!list) return;
                    list.innerHTML = (results.pasos || []).map((paso, idx) => `
                        <div class="ocr-edit-card" style="gap: 16px;">
                            <span style="background: var(--primary); color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; margin-top: 2px;">${idx + 1}</span>
                            <div contenteditable="true" data-idx="${idx}" data-type="paso" style="margin: 0; font-size: 14px; color: var(--md-on-surface-variant); line-height: 1.6;">${paso}</div>
                        </div>
                    `).join('');
                };



                renderIngs('ocrIngredientsListStep1');
                renderSteps('ocrStepsListStep1');

            } else {
                if (structuredView1) structuredView1.classList.add('hidden');
                if (rawView1) rawView1.classList.remove('hidden');
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
        const selectedLang = window.selectedOcrLang || 'spa';
        
        // v360: Update all possible preview IDs
        const previews = [
            document.getElementById('ocrProcessingPreview'),
            document.getElementById('ocrProcessingPreviewModal')
        ];
        previews.forEach(p => {
            if (p && imageDataUrl) p.src = imageDataUrl;
        });
        
        this.showProcessingState(imageDataUrl);
        try {
            const results = await window.ocrProcessor.processImage(file, m => this.updateProgress(m), { lang: selectedLang });

            if (results.success) {
                await new Promise(resolve => setTimeout(resolve, 700));
                this.showResults(results);
            }
            else throw new Error(results.error);
        } catch (error) { this.resetModal(); }

    }

    learnCorrections() { console.log("Sistema local no requiere fase de aprendizaje."); }
}

window.ocr = new OCRScanner();
