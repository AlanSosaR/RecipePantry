/**
 * documentDetection.js
 * Detects the largest rectangular document in a given OpenCV Mat.
 */

class DocumentDetector {
    constructor() {
        this.maxContours = 5; // Look at top contours
    }

    /**
     * Finds the 4 corners of the largest document-like contour.
     * @param {cv.Mat} src - Source image (RGBA)
     * @returns {Array<{x, y}>|null} Array of 4 points {x, y} or null if not found
     */
    detect(src) {
        if (!window.cv || !src || src.empty()) return null;

        let gray = new cv.Mat();
        let blurred = new cv.Mat();
        let edges = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        let validCorners = null;

        try {
            // 1. Grayscale
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // 2. Blur to reduce noise - slightly larger blur to ignore text details and focus on paper edge
            cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

            // 3. Edge detection - more forgiving limits to catch paper edges in bad light
            cv.Canny(blurred, edges, 30, 100);

            // Dilate edges to close gaps in the contour
            let M = cv.Mat.ones(3, 3, cv.CV_8U);
            cv.dilate(edges, edges, M);
            M.delete();

            // 4. Find contours
            cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

            // 5. Filter and find best contour
            let bestArea = 0;
            let bestApprox = new cv.Mat(); 

            let srcArea = src.cols * src.rows;
            let minArea = srcArea * 0.05; // Contour must be at least 5% of image (more forgiving)

            for (let i = 0; i < contours.size(); i++) {
                let cnt = contours.get(i);
                let area = cv.contourArea(cnt);

                if (area > minArea && area > bestArea) {
                    let peri = cv.arcLength(cnt, true);
                    let approx = new cv.Mat();
                    // Increased epsilon to 0.05 so slightly wavy edges on receipts still count as 4 points
                    cv.approxPolyDP(cnt, approx, 0.05 * peri, true);

                    if (approx.rows === 4) {
                        if (this.isConvexPoly(approx)) {
                            bestArea = area;
                            approx.copyTo(bestApprox);
                        }
                    } else if (approx.rows > 4 && approx.rows < 8) {
                        // Sometimes the corners of receipts are rounded or folded.
                        // Force 4 points by finding bounding rotated rect, but standard Drive scanner relies on 4 true approx points with high epsilon.
                    }
                    approx.delete();
                }
                cnt.delete();
            }

            if (bestApprox.rows === 4) {
                let points = [];
                for (let i = 0; i < 4; i++) {
                    points.push({
                        x: bestApprox.intPtr(i, 0)[0],
                        y: bestApprox.intPtr(i, 0)[1]
                    });
                }
                validCorners = this.sortCorners(points);
            }
            bestApprox.delete();

        } catch (error) {
            console.error("Error in document detection:", error);
        } finally {
            gray.delete();
            blurred.delete();
            edges.delete();
            contours.delete();
            hierarchy.delete();
        }

        return validCorners;
    }

    isConvexPoly(approx) {
        return cv.isContourConvex(approx);
    }

    sortCorners(pts) {
        // Order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
        let tl, tr, br, bl;
        
        let sums = pts.map(p => ({ p: p, sum: p.x + p.y }));
        sums.sort((a, b) => a.sum - b.sum);
        tl = sums[0].p;
        br = sums[3].p;

        let diffs = pts.map(p => ({ p: p, diff: p.y - p.x }));
        diffs.sort((a, b) => a.diff - b.diff);
        tr = diffs[0].p;
        bl = diffs[3].p;

        return [tl, tr, br, bl];
    }
}

window.DocumentDetector = DocumentDetector;
