/**
 * interactiveCrop.js - CamScanner Style Interactive Crop & Perspective Editor
 * Allows drag-and-drop corner adjustment with a real-time floating magnifier lens.
 */

class InteractiveCrop {
    constructor(containerEl, canvasEl) {
        this.container = containerEl;
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');
        
        this.image = null;
        this.corners = []; // [{x, y}, ...] in image coordinate space
        this.activeCornerIndex = -1;
        this.displayScale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.currentRotation = 0; // 0, 90, 180, 270

        // Create magnifier element
        this.magnifier = document.createElement('div');
        this.magnifier.className = 'crop-magnifier';
        this.magnifier.style.display = 'none';
        this.container.style.position = 'relative';
        this.container.appendChild(this.magnifier);

        this.magnifierCanvas = document.createElement('canvas');
        this.magnifierCanvas.width = 110;
        this.magnifierCanvas.height = 110;
        this.magnifierCtx = this.magnifierCanvas.getContext('2d');
        this.magnifier.appendChild(this.magnifierCanvas);

        this.initEvents();
    }

    /**
     * Load image into the crop editor
     */
    loadImage(imgOrCanvas) {
        this.image = imgOrCanvas;
        this.currentRotation = 0;
        this.activeCornerIndex = -1;
        this.hideMagnifier();
        this.setupDefaultCorners();
        this.render();
    }

    setupDefaultCorners() {
        if (!this.image) return;
        const w = this.image.width;
        const h = this.image.height;

        // Default: inset 6% from edges
        const insetX = w * 0.06;
        const insetY = h * 0.06;

        this.corners = [
            { x: insetX, y: insetY },         // Top-Left
            { x: w - insetX, y: insetY },     // Top-Right
            { x: w - insetX, y: h - insetY }, // Bottom-Right
            { x: insetX, y: h - insetY }      // Bottom-Left
        ];
    }

    setCorners(newCorners) {
        if (newCorners && newCorners.length === 4) {
            this.corners = newCorners.map(p => ({ x: p.x, y: p.y }));
            this.render();
        }
    }

    resetToFull() {
        if (!this.image) return;
        this.corners = [
            { x: 0, y: 0 },
            { x: this.image.width, y: 0 },
            { x: this.image.width, y: this.image.height },
            { x: 0, y: this.image.height }
        ];
        this.render();
    }

    rotate90() {
        if (!this.image) return;
        // Rotate image 90 degrees clockwise
        const rotCanvas = document.createElement('canvas');
        rotCanvas.width = this.image.height;
        rotCanvas.height = this.image.width;
        const rctx = rotCanvas.getContext('2d');
        rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        rctx.rotate(Math.PI / 2);
        rctx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);

        // Transform corners coordinates and maintain [tl, tr, br, bl] clockwise order
        const transformed = this.corners.map(p => ({
            x: this.image.height - p.y,
            y: p.x
        }));

        this.corners = [
            transformed[3], // Old Bottom-Left becomes new Top-Left
            transformed[0], // Old Top-Left becomes new Top-Right
            transformed[1], // Old Top-Right becomes new Bottom-Right
            transformed[2]  // Old Bottom-Right becomes new Bottom-Left
        ];

        this.image = rotCanvas;
        this.render();
    }

    /**
     * Auto-detect corners using OpenCV DocumentDetector
     */
    autoDetect() {
        if (!window.cv || !window.DocumentDetector || !this.image) return false;
        try {
            const detector = new window.DocumentDetector();
            const tempCanvas = document.createElement('canvas');
            const maxDim = 800;
            let w = this.image.width;
            let h = this.image.height;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            tempCanvas.width = Math.round(w * scale);
            tempCanvas.height = Math.round(h * scale);
            const tctx = tempCanvas.getContext('2d');
            tctx.drawImage(this.image, 0, 0, tempCanvas.width, tempCanvas.height);

            const src = cv.imread(tempCanvas);
            const detected = detector.detect(src);
            src.delete();

            if (detected && detected.length === 4) {
                this.corners = detected.map(p => ({
                    x: p.x / scale,
                    y: p.y / scale
                }));
                this.render();
                return true;
            }
        } catch (e) {
            console.warn("Auto-detect failed:", e);
        }
        return false;
    }

    /**
     * Coordinate transformations
     */
    imageToScreen(pt) {
        return {
            x: this.offsetX + pt.x * this.displayScale,
            y: this.offsetY + pt.y * this.displayScale
        };
    }

    screenToImage(pt) {
        return {
            x: Math.max(0, Math.min(this.image.width, (pt.x - this.offsetX) / this.displayScale)),
            y: Math.max(0, Math.min(this.image.height, (pt.y - this.offsetY) / this.displayScale))
        };
    }

    render() {
        if (!this.image) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const containerRect = this.container.getBoundingClientRect();
        const availableW = Math.round(containerRect.width || 360);
        const availableH = Math.round(containerRect.height || 480);

        // Fit image into container while preserving aspect ratio
        const scaleX = availableW / this.image.width;
        const scaleY = availableH / this.image.height;
        this.displayScale = Math.min(scaleX, scaleY) * 0.95;

        const drawW = Math.round(this.image.width * this.displayScale);
        const drawH = Math.round(this.image.height * this.displayScale);

        // High-DPI Retina canvas configuration (prevents pixelation and blur)
        this.canvas.width = Math.round(availableW * dpr);
        this.canvas.height = Math.round(availableH * dpr);
        this.canvas.style.width = `${availableW}px`;
        this.canvas.style.height = `${availableH}px`;

        this.offsetX = Math.round((availableW - drawW) / 2);
        this.offsetY = Math.round((availableH - drawH) / 2);

        const ctx = this.ctx;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, availableW, availableH);

        // 1. Draw Image with high-definition rendering
        ctx.drawImage(this.image, this.offsetX, this.offsetY, drawW, drawH);

        // 2. Draw Semi-transparent Dark Mask outside polygon
        const screenCorners = this.corners.map(p => this.imageToScreen(p));
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.rect(0, 0, availableW, availableH);
        ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(screenCorners[i].x, screenCorners[i].y);
        }
        ctx.closePath();
        ctx.fill('evenodd');
        ctx.restore();

        // 3. Draw Polygon Outline (CamScanner Emerald Style)
        ctx.save();
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(screenCorners[i].x, screenCorners[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Grid lines (rule of thirds inside the crop area)
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // 4. Draw Corner Handles & Mid-side Handles
        screenCorners.forEach((pt, idx) => {
            const isHovered = (this.activeCornerIndex === idx);
            
            // Outer shadow ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, isHovered ? 16 : 14, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 8;
            ctx.fill();

            // Inner emerald ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, isHovered ? 13 : 11, 0, Math.PI * 2);
            ctx.fillStyle = '#10B981';
            ctx.shadowBlur = 0;
            ctx.fill();

            // Center white dot
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
        });

        ctx.restore();
    }

    /**
     * Updates magnifier zoom lens preview with Retina crispness
     */
    updateMagnifier(screenX, screenY, imgPt) {
        if (!this.image) return;

        this.magnifier.style.display = 'block';

        // Position magnifier slightly above the user's finger so it's not occluded
        const lensRadius = 55;
        let lensLeft = screenX - lensRadius;
        let lensTop = screenY - 140;

        const containerRect = this.container.getBoundingClientRect();
        const availableW = containerRect.width || 360;

        if (lensTop < 10) lensTop = screenY + 40; // Flip below if near top
        if (lensLeft < 10) lensLeft = 10;
        if (lensLeft > availableW - 120) lensLeft = availableW - 120;

        this.magnifier.style.left = `${lensLeft}px`;
        this.magnifier.style.top = `${lensTop}px`;

        // Render zoomed portion with Retina sharpness
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const targetPixelSize = Math.round(110 * dpr);
        if (this.magnifierCanvas.width !== targetPixelSize) {
            this.magnifierCanvas.width = targetPixelSize;
            this.magnifierCanvas.height = targetPixelSize;
            this.magnifierCanvas.style.width = '110px';
            this.magnifierCanvas.style.height = '110px';
        }

        const zoomFactor = 2.4;
        const sampleSize = Math.round(110 / zoomFactor);
        const sx = Math.max(0, Math.min(this.image.width - sampleSize, imgPt.x - sampleSize / 2));
        const sy = Math.max(0, Math.min(this.image.height - sampleSize, imgPt.y - sampleSize / 2));

        const mctx = this.magnifierCtx;
        mctx.save();
        mctx.scale(dpr, dpr);
        mctx.imageSmoothingEnabled = true;
        mctx.imageSmoothingQuality = 'high';
        mctx.clearRect(0, 0, 110, 110);
        mctx.drawImage(this.image, sx, sy, sampleSize, sampleSize, 0, 0, 110, 110);

        // Draw crosshair on magnifier
        mctx.strokeStyle = '#10B981';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.moveTo(55, 35);
        mctx.lineTo(55, 75);
        mctx.moveTo(35, 55);
        mctx.lineTo(75, 55);
        mctx.stroke();

        // Center dot
        mctx.fillStyle = '#EF4444';
        mctx.beginPath();
        mctx.arc(55, 55, 3, 0, Math.PI * 2);
        mctx.fill();

        mctx.restore();
    }

    hideMagnifier() {
        this.magnifier.style.display = 'none';
    }

    initEvents() {
        const getTouchPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const onStart = (e) => {
            if (!this.image) return;
            const pos = getTouchPos(e);
            const hitRadius = 32; // Generous hit target for mobile fingers

            let closestDist = Infinity;
            let closestIdx = -1;

            this.corners.forEach((pt, idx) => {
                const screenPt = this.imageToScreen(pt);
                const dist = Math.hypot(screenPt.x - pos.x, screenPt.y - pos.y);
                if (dist < hitRadius && dist < closestDist) {
                    closestDist = dist;
                    closestIdx = idx;
                }
            });

            if (closestIdx !== -1) {
                e.preventDefault();
                this.activeCornerIndex = closestIdx;
                const imgPt = this.corners[closestIdx];
                this.updateMagnifier(pos.x, pos.y, imgPt);
                this.render();
            }
        };

        const onMove = (e) => {
            if (this.activeCornerIndex === -1 || !this.image) return;
            e.preventDefault();
            const pos = getTouchPos(e);
            const imgPt = this.screenToImage(pos);
            this.corners[this.activeCornerIndex] = imgPt;
            this.updateMagnifier(pos.x, pos.y, imgPt);
            this.render();
        };

        const onEnd = (e) => {
            if (this.activeCornerIndex !== -1) {
                this.activeCornerIndex = -1;
                this.hideMagnifier();
                this.render();
            }
        };

        this.canvas.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        this.canvas.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);

        window.addEventListener('resize', () => this.render());
    }

    /**
     * Warps and flattens the selected document area
     * @returns {HTMLCanvasElement}
     */
    getCroppedCanvas() {
        if (!this.image) return null;

        // Try OpenCV perspective transform if available
        if (window.cv && window.PerspectiveCorrector) {
            try {
                const corrector = new window.PerspectiveCorrector();
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.image.width;
                tempCanvas.height = this.image.height;
                const tctx = tempCanvas.getContext('2d');
                tctx.drawImage(this.image, 0, 0);

                const src = cv.imread(tempCanvas);
                const warped = corrector.warpDocument(src, this.corners);
                src.delete();

                if (warped && !warped.empty()) {
                    const resultCanvas = document.createElement('canvas');
                    cv.imshow(resultCanvas, warped);
                    warped.delete();
                    return resultCanvas;
                }
            } catch (cvErr) {
                console.warn("OpenCV warp failed, using canvas fallback:", cvErr);
            }
        }

        // Pure Canvas Fallback (Bounding Box)
        return this.fallbackWarp();
    }

    fallbackWarp() {
        const [tl, tr, br, bl] = this.corners;
        const minX = Math.min(tl.x, bl.x);
        const minY = Math.min(tl.y, tr.y);
        const maxX = Math.max(tr.x, br.x);
        const maxY = Math.max(bl.y, br.y);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = Math.max(100, Math.round(maxX - minX));
        outCanvas.height = Math.max(100, Math.round(maxY - minY));
        const ctx = outCanvas.getContext('2d');
        ctx.drawImage(this.image, minX, minY, outCanvas.width, outCanvas.height, 0, 0, outCanvas.width, outCanvas.height);
        return outCanvas;
    }
}

window.InteractiveCrop = InteractiveCrop;
