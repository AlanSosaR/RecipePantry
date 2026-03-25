/**
 * cameraController.js
 * Manages the real-time processing loop, stability detection, dynamic overlay, and capture.
 */

class CameraController {
    constructor() {
        this.video = null;
        this.canvas = document.createElement('canvas'); // Hidden canvas for reading frames
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        // This overlay will be drawn on top of the video
        this.overlayCanvas = document.getElementById('ocrDynamicOverlay'); 
        this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext('2d') : null;

        this.detector = new window.DocumentDetector();
        this.corrector = new window.PerspectiveCorrector();
        this.enhancer = new window.ImageEnhancer();

        this.isProcessing = false;
        this.processInterval = 3; // Process 1 out of every 3 frames (~10fps if 30fps video)
        this.frameCount = 0;

        this.lastCorners = null;
        this.stableStartTime = 0;
        this.onAutoCapture = null; // Callback for when stable
    }

    startScanning(videoElement, autoCaptureCallback) {
        this.video = videoElement;
        this.onAutoCapture = autoCaptureCallback;
        this.isProcessing = true;
        this.frameCount = 0;
        this.lastCorners = null;
        this.stableStartTime = 0;

        this.overlayCanvas = document.getElementById('ocrDynamicOverlay'); 
        if (this.overlayCanvas) {
            this.overlayCtx = this.overlayCanvas.getContext('2d');
        }

        // Ensure OpenCV is ready before starting loop
        this.waitForOpenCV().then(() => {
            if (this.isProcessing) {
                requestAnimationFrame(() => this.processLoop());
            }
        });
    }

    stopScanning() {
        this.isProcessing = false;
        this.clearOverlay();
    }

    async waitForOpenCV() {
        return new Promise((resolve) => {
            if (window.cv && window.cv.Mat) {
                resolve();
            } else {
                let interval = setInterval(() => {
                    if (window.cv && window.cv.Mat) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            }
        });
    }

    processLoop() {
        if (!this.isProcessing || !this.video || this.video.paused || this.video.ended) return;

        this.frameCount++;
        if (this.frameCount % this.processInterval === 0) {
            this.detectDocumentInFrame();
        }

        if (this.isProcessing) {
            requestAnimationFrame(() => this.processLoop());
        }
    }

    detectDocumentInFrame() {
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        if (!vw || !vh) return;

        if (this.canvas.width !== vw) this.canvas.width = vw;
        if (this.canvas.height !== vh) this.canvas.height = vh;

        // Draw current frame to hidden canvas to get image data
        this.ctx.drawImage(this.video, 0, 0, vw, vh);
        
        let src = cv.imread(this.canvas);
        let corners = this.detector.detect(src);
        
        if (corners) {
            this.drawOverlay(corners, vw, vh);
            this.checkStability(corners);
        } else {
            this.clearOverlay();
            this.lastCorners = null;
        }

        src.delete();
    }

    checkStability(corners) {
        if (!this.lastCorners) {
            this.lastCorners = corners;
            this.stableStartTime = Date.now();
            return;
        }

        let maxDist = 0;
        for (let i = 0; i < 4; i++) {
            let dist = this.corrector.getDistance(corners[i], this.lastCorners[i]);
            if (dist > maxDist) maxDist = dist;
        }

        // Stability threshold in pixels
        const STABILITY_THRESHOLD = 15;
        if (maxDist < STABILITY_THRESHOLD) {
            let stableDuration = Date.now() - this.stableStartTime;
            if (stableDuration > 800) {
                // Stable for > 800ms
                if (this.onAutoCapture) {
                    this.onAutoCapture(corners);
                    this.stopScanning(); // Pause scanning after capture
                }
            }
        } else {
            // Document moved, reset timer
            this.lastCorners = corners;
            this.stableStartTime = Date.now();
        }
    }

    drawOverlay(corners, videoWidth, videoHeight) {
        if (!this.overlayCanvas || !this.overlayCtx) return;

        // Automatically match canvas size to element size
        const cw = this.overlayCanvas.width = this.overlayCanvas.clientWidth;
        const ch = this.overlayCanvas.height = this.overlayCanvas.clientHeight;
        
        this.overlayCtx.clearRect(0, 0, cw, ch);

        const videoRatio = videoWidth / videoHeight;
        const clientRatio = cw / ch;

        let drawScale, xOffset = 0, yOffset = 0;

        if (videoRatio > clientRatio) {
            drawScale = ch / videoHeight;
            xOffset = (videoWidth * drawScale - cw) / 2;
        } else {
            drawScale = cw / videoWidth;
            yOffset = (videoHeight * drawScale - ch) / 2;
        }

        const mapPoint = (p) => {
            return {
                x: (p.x * drawScale) - xOffset,
                y: (p.y * drawScale) - yOffset
            };
        };

        const mappedCorners = corners.map(mapPoint);

        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(mappedCorners[0].x, mappedCorners[0].y);
        for(let i=1; i<4; i++){
            this.overlayCtx.lineTo(mappedCorners[i].x, mappedCorners[i].y);
        }
        this.overlayCtx.closePath();

        // Fill subtle green
        this.overlayCtx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        this.overlayCtx.fill();

        // Draw green border
        this.overlayCtx.lineWidth = 3;
        this.overlayCtx.strokeStyle = '#10B981';
        this.overlayCtx.stroke();
    }

    clearOverlay() {
        if (this.overlayCtx && this.overlayCanvas) {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
    }

    /**
     * Executes the actual capture and warp process logic.
     * @param {Array<{x, y}>|null} corners 
     * @param {boolean} colorMode - optional 
     * @returns {HTMLCanvasElement} - The canvas with the processed image
     */
    processCapture(corners, colorMode = true) {
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        
        if (this.canvas.width !== vw) this.canvas.width = vw;
        if (this.canvas.height !== vh) this.canvas.height = vh;
        this.ctx.drawImage(this.video, 0, 0, vw, vh);
        
        if (!window.cv || !window.cv.Mat) {
             // Fallback if cv is not ready
             return this.canvas;
        }

        let src = cv.imread(this.canvas);
        let finalMat = null;
        let finalMode = colorMode ? 'color' : 'bw';

        if (corners) {
            // Document found: Warp it
            let warped = this.corrector.warpDocument(src, corners);
            
            // Validate quality
            let isSharp = this.enhancer.validateQuality(warped, 30);
            if (!isSharp) {
                if (window.showSnackbar) window.showSnackbar("Imagen posiblemente borrosa.");
            }

            // Enhance
            finalMat = this.enhancer.enhanceForOCR(warped, finalMode);
            warped.delete();
        } else {
            // Fallback: No valid document corners, attempt to center-crop roughly based on old UI overlay
            let oldOverlay = document.getElementById('ocrOverlay');
            if (oldOverlay) {
                let docRect = oldOverlay.getBoundingClientRect();
                let videoRect = this.video.getBoundingClientRect();
                
                // Proportionally map overlay coordinates to video resolution
                let scaleX = vw / videoRect.width;
                let scaleY = vh / videoRect.height;
                
                let cropX = Math.max(0, (docRect.left - videoRect.left) * scaleX);
                let cropY = Math.max(0, (docRect.top - videoRect.top) * scaleY);
                let cropW = Math.min(vw - cropX, docRect.width * scaleX);
                let cropH = Math.min(vh - cropY, docRect.height * scaleY);
                
                let rect = new cv.Rect(cropX, cropY, cropW, cropH);
                try {
                    let cropped = src.roi(rect);
                    finalMat = this.enhancer.enhanceForOCR(cropped, finalMode);
                    cropped.delete();
                } catch(e) {
                     finalMat = this.enhancer.enhanceForOCR(src, finalMode);
                }
            } else {
                finalMat = this.enhancer.enhanceForOCR(src, finalMode);
            }
        }

        src.delete();
        
        if (finalMat) {
            // Resize canvas to final cropped size and clear before drawing
            cv.imshow(this.canvas, finalMat);
            finalMat.delete();
        }

        return this.canvas;
    }
}

// Initialize camera controller singleton
window.cameraController = new CameraController();
