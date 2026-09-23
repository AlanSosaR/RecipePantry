/**
 * imageEnhancer.js - CamScanner Style Image Enhancement Suite
 * Provides Magic Color, High-Contrast B&W, Lighten, and Original filters
 * Compatible with both OpenCV cv.Mat and pure HTMLCanvasElement.
 */

class ImageEnhancer {

    /**
     * Applies CamScanner style filters to a canvas
     * @param {HTMLCanvasElement} inputCanvas 
     * @param {'magic'|'bw'|'lighten'|'original'} filterMode 
     * @returns {HTMLCanvasElement}
     */
    applyFilter(inputCanvas, filterMode = 'magic') {
        if (!inputCanvas) return null;
        if (filterMode === 'original') return inputCanvas;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = inputCanvas.width;
        outCanvas.height = inputCanvas.height;
        const ctx = outCanvas.getContext('2d');
        ctx.drawImage(inputCanvas, 0, 0);

        const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
        const data = imgData.data;
        const len = data.length;

        if (filterMode === 'magic') {
            // ═════════════════════════════════════════════════════════
            // CAMSCANNER "COLOR MÁGICO" (MAGIC COLOR)
            // Aclara el fondo grisáceo/amarillento del papel a blanco puro,
            // acentúa los negros del texto y satura los colores de fotos.
            // ═════════════════════════════════════════════════════════
            for (let i = 0; i < len; i += 4) {
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];

                // Luminancia perceptual
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                // Curva S agresiva para papel:
                // Si es claro (papel con sombras), empujar hacia 255 blanco
                // Si es oscuro (tinta/letras), empujar hacia 0 negro
                let factor = 1.0;
                if (lum > 140) {
                    factor = 1.0 + Math.pow((lum - 140) / 115, 1.5) * 0.45;
                } else if (lum < 90) {
                    factor = 0.85;
                }

                r = Math.min(255, Math.max(0, Math.round(r * factor)));
                g = Math.min(255, Math.max(0, Math.round(g * factor)));
                b = Math.min(255, Math.max(0, Math.round(b * factor)));

                // Ligera saturación de color para que los encabezados sigan vibrantes
                const avg = (r + g + b) / 3;
                r = Math.min(255, Math.max(0, Math.round(avg + 1.25 * (r - avg))));
                g = Math.min(255, Math.max(0, Math.round(avg + 1.25 * (g - avg))));
                b = Math.min(255, Math.max(0, Math.round(avg + 1.25 * (b - avg))));

                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
            }

            ctx.putImageData(imgData, 0, 0);

            // Filtro de nitidez suave (Unsharp Mask)
            return this.applySharpen(outCanvas);

        } else if (filterMode === 'bw') {
            // ═════════════════════════════════════════════════════════
            // BLANCO Y NEGRO (B&W CLEAN FOTOCOPIA)
            // ═════════════════════════════════════════════════════════
            // Calcular umbral dinámico (Otsu simplificado)
            let sum = 0;
            for (let i = 0; i < len; i += 4) {
                sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
            const meanLum = sum / (len / 4);
            const threshold = Math.max(100, Math.min(165, meanLum * 0.92));

            for (let i = 0; i < len; i += 4) {
                const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const val = lum < threshold ? 0 : 255;
                data[i] = data[i + 1] = data[i + 2] = val;
            }
            ctx.putImageData(imgData, 0, 0);
            return outCanvas;

        } else if (filterMode === 'lighten') {
            // ═════════════════════════════════════════════════════════
            // ACLARAR (ELIMINADOR DE SOMBRAS)
            // ═════════════════════════════════════════════════════════
            for (let i = 0; i < len; i += 4) {
                // Elevar brillo en tonos medios y claros
                data[i] = Math.min(255, Math.round(data[i] * 1.22 + 10));
                data[i + 1] = Math.min(255, Math.round(data[i + 1] * 1.22 + 10));
                data[i + 2] = Math.min(255, Math.round(data[i + 2] * 1.22 + 10));
            }
            ctx.putImageData(imgData, 0, 0);
            return outCanvas;
        }

        return outCanvas;
    }

    /**
     * Aplica máscara de enfoque ligera para bordes nítidos
     */
    applySharpen(canvas) {
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext('2d');
        ctx.drawImage(canvas, 0, 0);

        const imgData = ctx.getImageData(0, 0, out.width, out.height);
        const d = imgData.data;
        const w = out.width;
        const h = out.height;
        const copy = new Uint8ClampedArray(d);

        // Kernel leve 3x3
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = (y * w + x) * 4;
                for (let c = 0; c < 3; c++) {
                    const center = copy[idx + c];
                    const up = copy[((y - 1) * w + x) * 4 + c];
                    const down = copy[((y + 1) * w + x) * 4 + c];
                    const left = copy[(y * w + (x - 1)) * 4 + c];
                    const right = copy[(y * w + (x + 1)) * 4 + c];

                    const val = center * 1.35 - (up + down + left + right) * 0.0875;
                    d[idx + c] = Math.max(0, Math.min(255, val));
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return out;
    }

    /**
     * Backward compatibility with existing OpenCV Mat routines
     */
    enhanceForOCR(src, mode = 'color') {
        if (!window.cv || !src || src.empty()) return null;
        let dst = new cv.Mat();
        try {
            src.convertTo(dst, -1, 1.15, 15);
        } catch(e) {
            src.copyTo(dst);
        }
        return dst;
    }

    validateQuality(src, threshold = 50) {
        if (!window.cv || !src || src.empty()) return true;
        let gray = new cv.Mat();
        let laplacian = new cv.Mat();
        let mean = new cv.Mat();
        let stddev = new cv.Mat();
        try {
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            cv.Laplacian(gray, laplacian, cv.CV_64F);
            cv.meanStdDev(laplacian, mean, stddev);
            let dev = stddev.doubleAt(0, 0);
            return (dev * dev) > threshold;
        } catch(e) {
            return true;
        } finally {
            gray.delete();
            laplacian.delete();
            mean.delete();
            stddev.delete();
        }
    }
}

window.ImageEnhancer = ImageEnhancer;
