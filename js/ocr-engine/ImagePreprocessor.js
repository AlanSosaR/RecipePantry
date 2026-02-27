/**
 * ImagePreprocessor.js
 * Fase 2: OpenCV.js y Canvas para Binarización, Deskew y Limpieza
 */

class ImagePreprocessor {
    constructor() {
        this.MAX_IMAGE_DIMENSION = 1800; // Phase 9: Mobile optimization max dimension
        // OpenCV.js se cargará dinámicamente en ocr.html
    }

    /**
     * Pipeline Principal de Pre-procesamiento
     */
    async process(imageFile) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = async () => {
                try {
                    // 1. Auto-resize Canvas limiting to 1800px max (Evita memory leaks en móviles)
                    const canvas = this.fastResize(img);

                    // 2. Aplicar pipeline OpenCV si está cargado
                    if (window.cv && window.cv.Mat) {
                        await this.applyOpenCVPipeline(canvas);
                    } else {
                        // Fallback a WebGL/Canvas puro (Otsu & Contrast)
                        this.applyFallbackPipeline(canvas);
                    }

                    resolve(canvas);
                } catch (e) {
                    console.error("Preprocessor Error:", e);
                    reject(e);
                }
            };
            img.onerror = () => reject(new Error("No se pudo cargar la imagen para pre-procesamiento."));
            img.src = URL.createObjectURL(imageFile);
        });
    }

    /**
     * Escala drástica manteniendo la proporción matemática.
     */
    fastResize(img) {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height && width > this.MAX_IMAGE_DIMENSION) {
            height *= this.MAX_IMAGE_DIMENSION / width;
            width = this.MAX_IMAGE_DIMENSION;
        } else if (height > this.MAX_IMAGE_DIMENSION) {
            width *= this.MAX_IMAGE_DIMENSION / height;
            height = this.MAX_IMAGE_DIMENSION;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        return canvas;
    }

    /**
     * Módulo Avanzado OpenCV.js
     * Ejecuta Grayscale, Otsu Adaptativo, Deskew rotativo y Dilatación para nitidez.
     */
    async applyOpenCVPipeline(canvas) {
        let src = cv.imread(canvas);
        let dst = new cv.Mat();

        try {
            // 1. Escala de Grises
            cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);

            // 2. Contraste adaptativo (CLAHE - Contrast Limited Adaptive Histogram Equalization)
            // Excelente para eliminar sombras proyectadas por el celular
            let tileGridSize = new cv.Size(8, 8);
            let clahe = new cv.CLAHE(2.0, tileGridSize);
            clahe.apply(src, src);
            clahe.delete();

            // 3. Auto Deskew (Calcula el ángulo de las líneas de texto y rota el mat)
            this.deskew(src);

            // 4. Binarización Adaptativa de Otsu
            cv.threshold(src, dst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

            // Dibuja el resultado de vuelta en el Canvas original
            cv.imshow(canvas, dst);
        } finally {
            src.delete();
            dst.delete();
        }
    }

    /**
     * Algoritmo de Rotación Inversa OpenCV (Deskew)
     * Encuentra líneas de Hough y rota la perspectiva.
     */
    deskew(srcMat) {
        let lines = new cv.Mat();
        let edges = new cv.Mat();

        // Detección de bordes Canny
        cv.Canny(srcMat, edges, 50, 150, 3);

        // Transformada de Hough Lineal
        cv.HoughLines(edges, lines, 1, Math.PI / 180, 200, 0, 0, 0, cv.CV_PI);

        let angle = 0;
        let validLines = 0;

        for (let i = 0; i < lines.rows; ++i) {
            let rho = lines.data32F[i * 2];
            let theta = lines.data32F[i * 2 + 1];
            // Filtra líneas casi horizontales
            let a = theta * (180 / Math.PI);
            if (a > 80 && a < 100) {
                angle += (a - 90);
                validLines++;
            }
        }

        if (validLines > 0) {
            angle = angle / validLines;
            // Rota si el ángulo es significativo (>1 grado)
            if (Math.abs(angle) > 1.0) {
                let center = new cv.Point(srcMat.cols / 2, srcMat.rows / 2);
                let M = cv.getRotationMatrix2D(center, angle, 1.0);
                cv.warpAffine(srcMat, srcMat, M, new cv.Size(srcMat.cols, srcMat.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
                M.delete();
            }
        }

        edges.delete();
        lines.delete();
    }

    /**
     * Fallback Pipeline sin OpenCV
     */
    applyFallbackPipeline(canvas) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Binarización de Otsu Cruda en 1 dimension
        let histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = v; data[i + 1] = v; data[i + 2] = v; // Gray
            histogram[Math.floor(v)]++;
        }

        let total = data.length / 4;
        let sum = 0, sumB = 0, wB = 0, wF = 0, max = 0, threshold = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];

        for (let i = 0; i < 256; i++) {
            wB += histogram[i];
            if (wB === 0) continue;
            wF = total - wB;
            if (wF === 0) break;
            sumB += i * histogram[i];
            let mB = sumB / wB;
            let mF = (sum - sumB) / wF;
            let varBetween = wB * wF * Math.pow((mB - mF), 2);
            if (varBetween > max) { max = varBetween; threshold = i; }
        }

        // Apply contrast & threshold
        for (let i = 0; i < data.length; i += 4) {
            const v = data[i] >= threshold ? 255 : 0;
            data[i] = v; data[i + 1] = v; data[i + 2] = v;
        }

        ctx.putImageData(imgData, 0, 0);
    }
}

window.ImagePreprocessor = ImagePreprocessor;
