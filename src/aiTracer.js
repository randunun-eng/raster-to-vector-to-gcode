/**
 * AI Tracer - Connects to Cloudflare AI Worker for intelligent edge detection
 * With skeletonization for clean single-line output suitable for CNC cutting
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
     * Client-side edge detection with skeletonization for clean single lines
     */
    clientSideTrace(image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Scale down for processing if too large
        const maxSize = 1000;
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

        // Threshold to binary
        const threshold = 40;
        let binary = new Uint8Array(width * height);
        for (let i = 0; i < edges.length; i++) {
            binary[i] = edges[i] > threshold ? 1 : 0;
        }

        // === KEY FIX: Skeletonize to get single-pixel centerlines ===
        binary = this.skeletonize(binary, width, height);

        // Extract paths from skeleton
        const paths = this.extractSkeletonPaths(binary, width, height);

        // Simplify and convert to SVG path strings
        return paths.map(points => this.pointsToPath(points));
    }

    gaussianBlur(data, width, height) {
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

    /**
     * Zhang-Suen thinning algorithm for skeletonization
     * Reduces binary edges to single-pixel wide centerlines
     */
    skeletonize(binary, width, height) {
        const img = new Uint8Array(binary);
        let changed = true;
        let iterations = 0;
        const maxIterations = 100;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            // Pass 1
            const toRemove1 = [];
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    if (img[idx] === 1 && this.zhangSuenPass1(img, x, y, width)) {
                        toRemove1.push(idx);
                    }
                }
            }
            for (const idx of toRemove1) {
                img[idx] = 0;
                changed = true;
            }

            // Pass 2
            const toRemove2 = [];
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    if (img[idx] === 1 && this.zhangSuenPass2(img, x, y, width)) {
                        toRemove2.push(idx);
                    }
                }
            }
            for (const idx of toRemove2) {
                img[idx] = 0;
                changed = true;
            }
        }

        console.log(`Skeletonization completed in ${iterations} iterations`);
        return img;
    }

    /**
     * Get 8-connected neighbors (P2-P9 in Zhang-Suen notation)
     */
    getNeighbors(img, x, y, width) {
        return [
            img[(y - 1) * width + x],     // P2 (north)
            img[(y - 1) * width + x + 1], // P3 (northeast)
            img[y * width + x + 1],       // P4 (east)
            img[(y + 1) * width + x + 1], // P5 (southeast)
            img[(y + 1) * width + x],     // P6 (south)
            img[(y + 1) * width + x - 1], // P7 (southwest)
            img[y * width + x - 1],       // P8 (west)
            img[(y - 1) * width + x - 1]  // P9 (northwest)
        ];
    }

    /**
     * Count 0-to-1 transitions in clockwise order
     */
    countTransitions(neighbors) {
        let count = 0;
        for (let i = 0; i < 8; i++) {
            if (neighbors[i] === 0 && neighbors[(i + 1) % 8] === 1) {
                count++;
            }
        }
        return count;
    }

    /**
     * Count non-zero neighbors
     */
    countNeighbors(neighbors) {
        return neighbors.reduce((sum, v) => sum + v, 0);
    }

    zhangSuenPass1(img, x, y, width) {
        const n = this.getNeighbors(img, x, y, width);
        const B = this.countNeighbors(n);
        const A = this.countTransitions(n);

        // Conditions for Pass 1
        return (
            B >= 2 && B <= 6 &&
            A === 1 &&
            (n[0] * n[2] * n[4]) === 0 && // P2 * P4 * P6 = 0
            (n[2] * n[4] * n[6]) === 0    // P4 * P6 * P8 = 0
        );
    }

    zhangSuenPass2(img, x, y, width) {
        const n = this.getNeighbors(img, x, y, width);
        const B = this.countNeighbors(n);
        const A = this.countTransitions(n);

        // Conditions for Pass 2
        return (
            B >= 2 && B <= 6 &&
            A === 1 &&
            (n[0] * n[2] * n[6]) === 0 && // P2 * P4 * P8 = 0
            (n[0] * n[4] * n[6]) === 0    // P2 * P6 * P8 = 0
        );
    }

    /**
     * Extract paths from skeletonized image
     * Follows connected single-pixel lines
     */
    extractSkeletonPaths(skeleton, width, height) {
        const visited = new Set();
        const paths = [];

        // Find all endpoints and junction points first
        const endpoints = [];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                if (skeleton[idx] === 1) {
                    const neighborCount = this.count8Neighbors(skeleton, x, y, width);
                    if (neighborCount === 1) {
                        endpoints.push({ x, y });
                    }
                }
            }
        }

        // Start tracing from endpoints for cleaner paths
        for (const start of endpoints) {
            const idx = start.y * width + start.x;
            if (!visited.has(idx)) {
                const path = this.tracePath(skeleton, width, height, start.x, start.y, visited);
                if (path.length >= 5) { // Minimum path length
                    paths.push(path);
                }
            }
        }

        // Then trace remaining connected components (closed loops)
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                if (skeleton[idx] === 1 && !visited.has(idx)) {
                    const path = this.tracePath(skeleton, width, height, x, y, visited);
                    if (path.length >= 5) {
                        paths.push(path);
                    }
                }
            }
        }

        return paths;
    }

    count8Neighbors(img, x, y, width) {
        const neighbors = this.getNeighbors(img, x, y, width);
        return neighbors.reduce((sum, v) => sum + v, 0);
    }

    tracePath(skeleton, width, height, startX, startY, visited) {
        const path = [];
        const directions = [
            [0, -1], [1, -1], [1, 0], [1, 1],
            [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ];

        let x = startX;
        let y = startY;
        let maxLength = 10000;

        while (maxLength-- > 0) {
            const idx = y * width + x;

            if (visited.has(idx)) {
                break;
            }

            visited.add(idx);
            path.push({ x, y });

            // Find unvisited neighbor
            let found = false;
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nidx = ny * width + nx;
                    if (skeleton[nidx] === 1 && !visited.has(nidx)) {
                        x = nx;
                        y = ny;
                        found = true;
                        break;
                    }
                }
            }

            if (!found) break;
        }

        return this.simplifyPath(path, 1.5);
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
