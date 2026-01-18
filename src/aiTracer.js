/**
 * AI Tracer - Connects to Cloudflare AI Worker for intelligent edge detection
 * Falls back to client-side Canny edge detection if worker unavailable
 */

export class AITracer {
    constructor(settings) {
        this.settings = settings;
    }

    /**
     * Trace image using AI worker
     */
    async trace(image) {
        if (this.settings.workerUrl) {
            try {
                return await this.traceWithAI(image);
            } catch (error) {
                console.warn('AI trace failed, falling back to client-side:', error);
            }
        }

        return this.clientSideTrace(image);
    }

    /**
     * Send image to Cloudflare AI Worker for tracing
     */
    async traceWithAI(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

        const formData = new FormData();
        formData.append('image', blob, 'image.png');
        formData.append('options', JSON.stringify({
            threshold: 128,
            simplify: this.settings.simplifyTolerance
        }));

        const response = await fetch(`${this.settings.workerUrl}/api/trace`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Worker returned ${response.status}`);
        }

        const result = await response.json();

        if (result.edgeImage) {
            // Worker returned a processed edge image, trace it client-side
            const edgeImg = new Image();
            await new Promise(resolve => {
                edgeImg.onload = resolve;
                edgeImg.src = result.edgeImage;
            });
            return this.clientSideTrace(edgeImg);
        }

        return [];
    }

    /**
     * Client-side edge detection and path extraction
     * Uses Canny-style edge detection
     */
    clientSideTrace(image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Scale down for processing if too large
        const maxSize = 800;
        let width = image.width;
        let height = image.height;

        if (width > maxSize || height > maxSize) {
            const scale = maxSize / Math.max(width, height);
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Convert to grayscale
        const gray = new Uint8Array(width * height);
        for (let i = 0; i < data.length; i += 4) {
            gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }

        // Apply Gaussian blur
        const blurred = this.gaussianBlur(gray, width, height);

        // Sobel edge detection
        const edges = this.sobelEdge(blurred, width, height);

        // Threshold edges
        const threshold = 50;
        const binary = edges.map(v => v > threshold ? 255 : 0);

        // Extract contours using marching squares
        const paths = this.extractContours(binary, width, height);

        // Simplify and convert to SVG path strings
        return paths.map(points => this.pointsToPath(points));
    }

    gaussianBlur(data, width, height, radius = 1) {
        const kernel = [
            [1, 2, 1],
            [2, 4, 2],
            [1, 2, 1]
        ];
        const kernelSum = 16;

        const result = new Uint8Array(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        sum += data[(y + ky) * width + (x + kx)] * kernel[ky + 1][kx + 1];
                    }
                }
                result[y * width + x] = Math.round(sum / kernelSum);
            }
        }

        return result;
    }

    sobelEdge(data, width, height) {
        const gx = [
            [-1, 0, 1],
            [-2, 0, 2],
            [-1, 0, 1]
        ];
        const gy = [
            [-1, -2, -1],
            [0, 0, 0],
            [1, 2, 1]
        ];

        const result = new Uint8Array(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sumX = 0, sumY = 0;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const val = data[(y + ky) * width + (x + kx)];
                        sumX += val * gx[ky + 1][kx + 1];
                        sumY += val * gy[ky + 1][kx + 1];
                    }
                }

                result[y * width + x] = Math.min(255, Math.sqrt(sumX * sumX + sumY * sumY));
            }
        }

        return result;
    }

    extractContours(binary, width, height) {
        const visited = new Set();
        const paths = [];

        // Find edge pixels and trace contours
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;

                if (binary[idx] === 255 && !visited.has(idx)) {
                    const path = this.traceContour(binary, width, height, x, y, visited);
                    if (path.length > 10) { // Minimum path length
                        paths.push(path);
                    }
                }
            }
        }

        return paths;
    }

    traceContour(binary, width, height, startX, startY, visited) {
        const path = [];
        const directions = [
            [1, 0], [1, 1], [0, 1], [-1, 1],
            [-1, 0], [-1, -1], [0, -1], [1, -1]
        ];

        let x = startX;
        let y = startY;
        let dir = 0;
        let maxLength = 5000;

        while (maxLength-- > 0) {
            const idx = y * width + x;

            if (visited.has(idx)) {
                if (path.length > 0) break;
            }

            visited.add(idx);
            path.push({ x, y });

            // Find next edge pixel
            let found = false;
            for (let i = 0; i < 8; i++) {
                const checkDir = (dir + i) % 8;
                const nx = x + directions[checkDir][0];
                const ny = y + directions[checkDir][1];

                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nidx = ny * width + nx;
                    if (binary[nidx] === 255 && !visited.has(nidx)) {
                        x = nx;
                        y = ny;
                        dir = (checkDir + 5) % 8; // Prefer continuing in same direction
                        found = true;
                        break;
                    }
                }
            }

            if (!found) break;
        }

        return this.simplifyPath(path);
    }

    simplifyPath(points, tolerance = 2) {
        if (points.length <= 2) return points;

        // Douglas-Peucker simplification
        const sqTolerance = tolerance * tolerance;

        const getSqSegDist = (p, p1, p2) => {
            let x = p1.x, y = p1.y;
            let dx = p2.x - x, dy = p2.y - y;

            if (dx !== 0 || dy !== 0) {
                const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
                if (t > 1) {
                    x = p2.x;
                    y = p2.y;
                } else if (t > 0) {
                    x += dx * t;
                    y += dy * t;
                }
            }

            dx = p.x - x;
            dy = p.y - y;
            return dx * dx + dy * dy;
        };

        const simplifyDP = (points, first, last, sqTolerance, simplified) => {
            let maxSqDist = sqTolerance;
            let index;

            for (let i = first + 1; i < last; i++) {
                const sqDist = getSqSegDist(points[i], points[first], points[last]);
                if (sqDist > maxSqDist) {
                    index = i;
                    maxSqDist = sqDist;
                }
            }

            if (maxSqDist > sqTolerance) {
                if (index - first > 1) simplifyDP(points, first, index, sqTolerance, simplified);
                simplified.push(points[index]);
                if (last - index > 1) simplifyDP(points, index, last, sqTolerance, simplified);
            }
        };

        const simplified = [points[0]];
        simplifyDP(points, 0, points.length - 1, sqTolerance, simplified);
        simplified.push(points[points.length - 1]);

        return simplified;
    }

    pointsToPath(points) {
        if (points.length < 2) return '';

        let d = `M ${points[0].x} ${points[0].y}`;

        // Use quadratic curves for smoothing
        for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            d += ` Q ${points[i].x} ${points[i].y} ${xc} ${yc}`;
        }

        // Last point
        const last = points[points.length - 1];
        d += ` L ${last.x} ${last.y}`;

        return d;
    }
}
