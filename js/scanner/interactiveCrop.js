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

        // Selección completa de toda la imagen por defecto
        this.corners = [
            { x: 0, y: 0 },         // Top-Left
            { x: w, y: 0 },         // Top-Right
            { x: w, y: h },         // Bottom-Right
            { x: 0, y: h }          // Bottom-Left
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
     * Auto-detect corners - Selecciona siempre la imagen completa (100% borde a borde)
     */
    autoDetect() {
        this.resetToFull();
        return true;
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
        const maxH = Math.round(Math.min(window.innerHeight * 0.65, 580));

        // Margin around image to ensure corner circular handles are 100% visible and not clipped
        const handleMargin = 16;
        const availInnerW = Math.max(100, availableW - (handleMargin * 2));
        const maxInnerH = Math.max(100, maxH - (handleMargin * 2));

        const imgAspect = this.image.height / this.image.width;
        let targetW = availInnerW;
        let targetH = Math.round(targetW * imgAspect);

        if (targetH > maxInnerH) {
            targetH = maxInnerH;
            targetW = Math.round(targetH / imgAspect);
        }

        const totalW = targetW + (handleMargin * 2);
        const totalH = targetH + (handleMargin * 2);

        this.container.style.height = `${totalH}px`;
        this.container.style.minHeight = 'unset';

        this.displayScale = targetW / this.image.width;
        const drawW = targetW;
        const drawH = targetH;

        // High-DPI Retina canvas configuration (prevents pixelation and blur)
        this.canvas.width = Math.round(totalW * dpr);
        this.canvas.height = Math.round(totalH * dpr);
        this.canvas.style.width = `${totalW}px`;
        this.canvas.style.height = `${totalH}px`;

        this.offsetX = handleMargin;
        this.offsetY = handleMargin;

        const ctx = this.ctx;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, totalW, totalH);

        // 1. Draw Image with high-definition rendering
        ctx.drawImage(this.image, this.offsetX, this.offsetY, drawW, drawH);

        // 2. Draw Semi-transparent Dark Mask outside polygon
        const screenCorners = this.corners.map(p => this.imageToScreen(p));
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.rect(0, 0, totalW, totalH);
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

        // 4. Draw Corner Handles (100% visible, fully rounded without edge clipping)
        screenCorners.forEach((pt, idx) => {
            const isHovered = (this.activeCornerIndex === idx);
            
            // Outer shadow ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, isHovered ? 16 : 14, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
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
     * Floats HIGH above the finger so it's never occluded or hidden behind
     */
    updateMagnifier(containerX, containerY, imgPt) {
        if (!this.image) return;

        this.magnifier.style.display = 'block';

        // Position magnifier 145px ABOVE the user's finger touch point
        const lensRadius = 60; // 120px diameter
        let lensLeft = containerX - lensRadius;
        let lensTop = containerY - 145;

        const containerRect = this.container.getBoundingClientRect();
        const availableW = containerRect.width || 360;

        // Keep horizontal position within safe container bounds
        if (lensLeft < 8) lensLeft = 8;
        if (lensLeft > availableW - 128) lensLeft = availableW - 128;

        // Allow lens to pop out above container (overflow: visible) and never flip under the finger!
        if (lensTop < -75) lensTop = -75;

        this.magnifier.style.left = `${lensLeft}px`;
        this.magnifier.style.top = `${lensTop}px`;

        // Render zoomed portion with Retina sharpness
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const targetPixelSize = Math.round(120 * dpr);
        if (this.magnifierCanvas.width !== targetPixelSize) {
            this.magnifierCanvas.width = targetPixelSize;
            this.magnifierCanvas.height = targetPixelSize;
            this.magnifierCanvas.style.width = '120px';
            this.magnifierCanvas.style.height = '120px';
        }

        const zoomFactor = 2.4;
        const sampleSize = Math.round(120 / zoomFactor);
        const sx = Math.max(0, Math.min(this.image.width - sampleSize, imgPt.x - sampleSize / 2));
        const sy = Math.max(0, Math.min(this.image.height - sampleSize, imgPt.y - sampleSize / 2));

        const mctx = this.magnifierCtx;
        mctx.save();
        mctx.scale(dpr, dpr);
        mctx.imageSmoothingEnabled = true;
        mctx.imageSmoothingQuality = 'high';
        mctx.clearRect(0, 0, 120, 120);
        mctx.drawImage(this.image, sx, sy, sampleSize, sampleSize, 0, 0, 120, 120);

        // Draw crosshair on magnifier
        mctx.strokeStyle = '#10B981';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.moveTo(60, 38);
        mctx.lineTo(60, 82);
        mctx.moveTo(38, 60);
        mctx.lineTo(82, 60);
        mctx.stroke();

        // Center dot
        mctx.fillStyle = '#EF4444';
        mctx.beginPath();
        mctx.arc(60, 60, 3.5, 0, Math.PI * 2);
        mctx.fill();

        mctx.restore();
    }

    hideMagnifier() {
        this.magnifier.style.display = 'none';
    }

    initEvents() {
        const getCoords = (e) => {
            const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
            
            const canvasRect = this.canvas.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();

            return {
                canvasX: clientX - canvasRect.left,
                canvasY: clientY - canvasRect.top,
                containerX: clientX - containerRect.left,
                containerY: clientY - containerRect.top
            };
        };

        const onStart = (e) => {
            if (!this.image) return;
            const coords = getCoords(e);
            const hitRadius = 34; // Generous hit target for mobile fingers

            let closestDist = Infinity;
            let closestIdx = -1;

            this.corners.forEach((pt, idx) => {
                const screenPt = this.imageToScreen(pt);
                const dist = Math.hypot(screenPt.x - coords.canvasX, screenPt.y - coords.canvasY);
                if (dist < hitRadius && dist < closestDist) {
                    closestDist = dist;
                    closestIdx = idx;
                }
            });

            if (closestIdx !== -1) {
                e.preventDefault();
                this.activeCornerIndex = closestIdx;
                const imgPt = this.corners[closestIdx];
                this.updateMagnifier(coords.containerX, coords.containerY, imgPt);
                this.render();
            }
        };

        const onMove = (e) => {
            if (this.activeCornerIndex === -1 || !this.image) return;
            e.preventDefault();
            const coords = getCoords(e);
            const imgPt = this.screenToImage({ x: coords.canvasX, y: coords.canvasY });
            this.corners[this.activeCornerIndex] = imgPt;
            this.updateMagnifier(coords.containerX, coords.containerY, imgPt);
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
