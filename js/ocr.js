/**
 * OCRManager - RecipeHub Personal
 * Maneja la cámara para capturar fotos de recetas y procesar OCR.
 */
class OCRManager {
    constructor() {
        this.video = document.getElementById('videoFeed');
        this.canvas = document.createElement('canvas');
        this.stream = null;
        this.currentFacingMode = 'environment';

        this.init();
    }

    async init() {
        await this.startCamera();
        this.setupEventListeners();
    }

    async startCamera() {
        try {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    facingMode: this.currentFacingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
        } catch (error) {
            console.error('Error accediendo a la cámara:', error);
            window.ui.showToast('No se pudo acceder a la cámara', 'error');
        }
    }

    setupEventListeners() {
        // Capturar Foto
        document.getElementById('btnCapture').addEventListener('click', () => this.capturePhoto());

        // Galería
        const galleryBtn = document.getElementById('btnGallery');
        const galleryInput = document.getElementById('ocrGalleryInput');
        galleryBtn.addEventListener('click', () => galleryInput.click());
        galleryInput.addEventListener('change', (e) => this.handleGallerySelection(e));

        // Cambiar Cámara
        document.getElementById('btnSwitchCamera').addEventListener('click', () => this.switchCamera());

        // Reintentar e Importar
        document.getElementById('btnRetryOCR').addEventListener('click', () => this.hideModal());
        document.getElementById('btnImportOCR').addEventListener('click', () => this.importToForm());
    }

    async switchCamera() {
        this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        await this.startCamera();
    }

    capturePhoto() {
        // Dibujar frame en el canvas
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        const ctx = this.canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);

        const imageDataValue = this.canvas.toDataURL('image/jpeg');
        this.processOCR(imageDataValue);
    }

    handleGallerySelection(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => this.processOCR(e.target.result);
            reader.readAsDataURL(file);
        }
    }

    async processOCR(imageB64) {
        this.showModal();

        // Simular retardo de procesamiento
        setTimeout(() => {
            const mockText = "LASAGNA DE BERENJENA\n\nIngredientes:\n- 2 berenjenas grandes\n- 500g queso ricotta\n- 1 bote de salsa de tomate\n- Queso parmesano\n- Albahaca fresca\n\nPasos:\n1. Cortar las berenjenas en rodajas finas y salar.\n2. En una fuente, poner base de tomate.\n3. Añadir capa de berenjena y luego mezcla de ricotta.\n4. Hornear a 180C por 40 minutos.";

            document.getElementById('ocrLoading').classList.add('hidden');
            const resultsEl = document.getElementById('ocrResults');
            resultsEl.classList.remove('hidden');
            document.getElementById('extractedText').value = mockText;
        }, 2000);
    }

    showModal() {
        document.getElementById('ocrModal').classList.remove('hidden');
        document.getElementById('ocrLoading').classList.remove('hidden');
        document.getElementById('ocrResults').classList.add('hidden');
    }

    hideModal() {
        document.getElementById('ocrModal').classList.add('hidden');
    }

    importToForm() {
        const text = document.getElementById('extractedText').value;
        // En una implementación real, aquí haríamos parsing inteligente del texto
        // Por ahora, lo guardamos en sessionStorage para que el formulario lo use
        sessionStorage.setItem('ocr_extracted_text', text);

        const recipeId = new URLSearchParams(window.location.search).get('id');
        window.location.href = `recipe-form.html${recipeId ? '?id=' + recipeId : ''}`;
    }
}

// Inicializar
window.ocr = new OCRManager();
