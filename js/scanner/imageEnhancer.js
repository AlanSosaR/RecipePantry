/**
 * imageEnhancer.js
 * Post-perspective visual enhancement to make text perfectly readable for OCR.
 */

class ImageEnhancer {

    /**
     * Returns true if image is sharp, false if too blurry.
     * @param {cv.Mat} src 
     * @param {number} threshold - Minimum variance required
     */
    validateQuality(src, threshold = 50) {
        if (!window.cv || !src || src.empty()) return false;

        let gray = new cv.Mat();
        let laplacian = new cv.Mat();
        let mean = new cv.Mat();
        let stddev = new cv.Mat();

        try {
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            cv.Laplacian(gray, laplacian, cv.CV_64F);
            cv.meanStdDev(laplacian, mean, stddev);

            let dev = stddev.doubleAt(0, 0);
            let variance = dev * dev;
            
            return variance > threshold;
        } catch(e) {
            console.error("Error in quality validation:", e);
            return true; // Fallback
        } finally {
            gray.delete();
            laplacian.delete();
            mean.delete();
            stddev.delete();
        }
    }

    /**
     * Enhances the warped image. Defaults to B&W mode for OCR.
     */
    enhanceForOCR(src, mode = 'bw') {
        if (!window.cv || !src || src.empty()) return null;

        let dst = new cv.Mat();
        
        try {
            if (mode === 'color') {
                src.copyTo(dst);
                // Optional color contrast adjustments can be added here
            } else {
                let gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                
                // Adaptive thresholding
                // Increase blockSize significantly to handle lighting gradients
                // Increase C to remove background noise and make background white
                cv.adaptiveThreshold(
                    gray, 
                    dst, 
                    255, 
                    cv.ADAPTIVE_THRESH_GAUSSIAN_C, 
                    cv.THRESH_BINARY, 
                    51, // blockSize => bigger means more context for lighting (odd number)
                    15   // C => constant to subtract to remove background
                );

                // Small median blur to remove salt and pepper noise
                cv.medianBlur(dst, dst, 3);
                
                gray.delete();
            }
        } catch(e) {
            console.error("Error in enhancement:", e);
            src.copyTo(dst); 
        }

        return dst;
    }
}

window.ImageEnhancer = ImageEnhancer;
