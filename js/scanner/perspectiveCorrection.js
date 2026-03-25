/**
 * perspectiveCorrection.js
 * Handles warping and cropping detected documents to match Google Drive Scanner style.
 */

class PerspectiveCorrector {
    
    getDistance(p1, p2) {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }

    /**
     * Warps the source Mat based on the 4 detected corners.
     * @param {cv.Mat} src 
     * @param {Array<{x, y}>} corners - [tl, tr, br, bl]
     * @returns {cv.Mat} Processed flattened image (make sure to .delete() it when done)
     */
    warpDocument(src, corners) {
        if (!window.cv || !src || !corners || corners.length !== 4) return null;

        const [tl, tr, br, bl] = corners;

        // Compute max width
        const widthA = this.getDistance(br, bl);
        const widthB = this.getDistance(tr, tl);
        const maxWidth = Math.max(Math.floor(widthA), Math.floor(widthB));

        // Compute max height
        const heightA = this.getDistance(tr, br);
        const heightB = this.getDistance(tl, bl);
        const maxHeight = Math.max(Math.floor(heightA), Math.floor(heightB));

        let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            tl.x, tl.y,
            tr.x, tr.y,
            br.x, br.y,
            bl.x, bl.y
        ]);

        let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            maxWidth - 1, 0,
            maxWidth - 1, maxHeight - 1,
            0, maxHeight - 1
        ]);

        let M = cv.getPerspectiveTransform(srcTri, dstTri);
        let dst = new cv.Mat();
        let dsize = new cv.Size(maxWidth, maxHeight);

        cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        srcTri.delete();
        dstTri.delete();
        M.delete();

        return dst;
    }
}

window.PerspectiveCorrector = PerspectiveCorrector;
