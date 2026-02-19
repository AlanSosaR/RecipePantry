// OCR Wrapper using Tesseract.js (Client-side)
// Loads Tesseract from CDN for zero-install setup

export async function scanImage(imageElement) {
    try {
        // Dynamically load Tesseract.js if not present
        if (typeof Tesseract === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const worker = await Tesseract.createWorker('spa'); // Spanish as default
        const ret = await worker.recognize(imageElement);
        await worker.terminate();

        return { text: ret.data.text, confidence: ret.data.confidence, error: null };
    } catch (err) {
        console.error("OCR Error:", err);
        return { text: '', confidence: 0, error: err.message };
    }
}
