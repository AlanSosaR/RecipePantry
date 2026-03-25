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
     * Enhances the warped image. Forces color mode to preserve "real photo" feel and prevent binarization blobbing.
     */
    enhanceForOCR(src, mode = 'color') {
        if (!window.cv || !src || src.empty()) return null;

        let dst = new cv.Mat();
        
        try {
            // Force a simple contrast boost that preserves photo realism
            // Alpha 1.15 = 15% more contrast. Beta 15 = brighter image.
            src.convertTo(dst, -1, 1.15, 15);
            console.log("ImageEnhancer v354 applied contrast boost.");
        } catch(e) {
            console.error("Error in enhancement:", e);
            src.copyTo(dst); 
        }

        return dst;
    }
}

window.ImageEnhancer = ImageEnhancer;
