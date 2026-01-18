/**
 * G-code Generator - Converts vector paths to GRBL-compatible G-code
 * Optimized for RC plane foam cutting templates
 */

export class GcodeGenerator {
    constructor(settings) {
        this.settings = settings;
    }

    /**
     * Generate G-code from Fabric.js path objects
     */
    generate(paths) {
        if (!paths.length) {
            return this.getHeader() + '\n; No paths to generate\n\nM2 ; end program\n';
        }

        let gcode = this.getHeader();

        // Optimize path order (nearest neighbor)
        const orderedPaths = this.optimizePathOrder(paths);

        let currentX = 0;
        let currentY = 0;
        let pathIndex = 1;

        for (const pathObj of orderedPaths) {
            gcode += `\n; --- Path ${pathIndex} ---\n`;

            // Convert Fabric.js path to absolute coordinates
            const points = this.pathToPoints(pathObj);

            if (points.length < 2) continue;

            // Travel to start (pen up)
            const start = points[0];
            gcode += `${this.settings.penUpCmd} ; pen up\n`;
            gcode += `G0 X${this.toMm(start.x).toFixed(2)} Y${this.toMm(start.y).toFixed(2)} F${this.settings.travelRate} ; travel to start\n`;

            // Lower pen
            gcode += `${this.settings.penDownCmd} ; pen down\n`;

            // Draw path
            for (let i = 1; i < points.length; i++) {
                const pt = points[i];
                gcode += `G1 X${this.toMm(pt.x).toFixed(2)} Y${this.toMm(pt.y).toFixed(2)} F${this.settings.feedRate}\n`;
            }

            currentX = points[points.length - 1].x;
            currentY = points[points.length - 1].y;
            pathIndex++;
        }

        // End program
        gcode += `\n; --- End ---\n`;
        gcode += `${this.settings.penUpCmd} ; pen up\n`;
        gcode += `G0 X0 Y0 F${this.settings.travelRate} ; return home\n`;
        gcode += `M2 ; end program\n`;

        return gcode;
    }

    getHeader() {
        const date = new Date().toISOString().split('T')[0];
        return `; ============================================
; Void-Satellite CNC Plotter
; Generated: ${date}
; Work Area: ${this.settings.bedWidth}mm × ${this.settings.bedHeight}mm
; Feed Rate: ${this.settings.feedRate} mm/min
; Travel Rate: ${this.settings.travelRate} mm/min
; ============================================

G21 ; mm mode
G90 ; absolute positioning
G92 X0 Y0 Z0 ; set current position as origin
; G28 ; uncomment to home first
`;
    }

    /**
     * Convert canvas pixels to mm based on canvas/bed ratio
     */
    toMm(pixels, canvasSize = 800, bedSize = null) {
        // Assuming canvas maps to bed proportionally
        // This will be scaled properly when we know actual canvas dimensions
        const bed = bedSize || this.settings.bedWidth;
        return (pixels / canvasSize) * bed;
    }

    /**
     * Optimize path order using nearest neighbor algorithm
     */
    optimizePathOrder(paths) {
        if (paths.length <= 1) return paths;

        const ordered = [];
        const remaining = [...paths];
        let currentPos = { x: 0, y: 0 };

        while (remaining.length > 0) {
            let nearestIndex = 0;
            let nearestDist = Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const points = this.pathToPoints(remaining[i]);
                if (points.length === 0) continue;

                const startDist = this.distance(currentPos, points[0]);
                if (startDist < nearestDist) {
                    nearestDist = startDist;
                    nearestIndex = i;
                }
            }

            const nearest = remaining.splice(nearestIndex, 1)[0];
            ordered.push(nearest);

            const points = this.pathToPoints(nearest);
            if (points.length > 0) {
                currentPos = points[points.length - 1];
            }
        }

        return ordered;
    }

    distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Convert Fabric.js path to array of points
     */
    pathToPoints(pathObj) {
        const points = [];
        const path = pathObj.path;
        const scaleX = pathObj.scaleX || 1;
        const scaleY = pathObj.scaleY || 1;
        const left = pathObj.left || 0;
        const top = pathObj.top || 0;

        if (!path) return points;

        let currentX = 0;
        let currentY = 0;

        for (const cmd of path) {
            const type = cmd[0];

            switch (type) {
                case 'M': // Move to
                    currentX = cmd[1];
                    currentY = cmd[2];
                    points.push(this.transformPoint(currentX, currentY, scaleX, scaleY, left, top));
                    break;

                case 'L': // Line to
                    currentX = cmd[1];
                    currentY = cmd[2];
                    points.push(this.transformPoint(currentX, currentY, scaleX, scaleY, left, top));
                    break;

                case 'Q': // Quadratic curve
                    const qPoints = this.quadraticToPoints(
                        currentX, currentY,
                        cmd[1], cmd[2], // control point
                        cmd[3], cmd[4], // end point
                        this.settings.curveResolution
                    );
                    qPoints.forEach(pt => {
                        points.push(this.transformPoint(pt.x, pt.y, scaleX, scaleY, left, top));
                    });
                    currentX = cmd[3];
                    currentY = cmd[4];
                    break;

                case 'C': // Cubic curve
                    const cPoints = this.cubicToPoints(
                        currentX, currentY,
                        cmd[1], cmd[2], // control point 1
                        cmd[3], cmd[4], // control point 2
                        cmd[5], cmd[6], // end point
                        this.settings.curveResolution
                    );
                    cPoints.forEach(pt => {
                        points.push(this.transformPoint(pt.x, pt.y, scaleX, scaleY, left, top));
                    });
                    currentX = cmd[5];
                    currentY = cmd[6];
                    break;

                case 'Z': // Close path
                case 'z':
                    if (points.length > 0) {
                        points.push({ ...points[0] });
                    }
                    break;
            }
        }

        return points;
    }

    transformPoint(x, y, scaleX, scaleY, left, top) {
        return {
            x: x * scaleX + left,
            y: y * scaleY + top
        };
    }

    /**
     * Convert quadratic bezier to line segments
     */
    quadraticToPoints(x0, y0, cx, cy, x1, y1, segments) {
        const points = [];
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            points.push({
                x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
                y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1
            });
        }
        return points;
    }

    /**
     * Convert cubic bezier to line segments
     */
    cubicToPoints(x0, y0, cx1, cy1, cx2, cy2, x1, y1, segments) {
        const points = [];
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            points.push({
                x: mt * mt * mt * x0 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x1,
                y: mt * mt * mt * y0 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y1
            });
        }
        return points;
    }

    /**
     * Parse G-code string back into toolpath for preview
     */
    parseGcode(gcode) {
        const toolpath = [];
        const lines = gcode.split('\n');

        let currentX = 0;
        let currentY = 0;
        let penDown = false;
        let feedRate = this.settings.feedRate;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(';')) continue;

            // Check for pen up/down
            if (trimmed.includes('Z5') || trimmed.includes('Z 5') || trimmed.includes('S0')) {
                penDown = false;
            } else if (trimmed.includes('Z0') || trimmed.includes('Z 0') || trimmed.includes('S90')) {
                penDown = true;
            }

            // Parse coordinates
            const xMatch = trimmed.match(/X(-?\d+\.?\d*)/i);
            const yMatch = trimmed.match(/Y(-?\d+\.?\d*)/i);
            const fMatch = trimmed.match(/F(\d+\.?\d*)/i);

            if (fMatch) {
                feedRate = parseFloat(fMatch[1]);
            }

            if (xMatch || yMatch) {
                const newX = xMatch ? parseFloat(xMatch[1]) : currentX;
                const newY = yMatch ? parseFloat(yMatch[1]) : currentY;

                toolpath.push({
                    type: penDown ? 'draw' : 'travel',
                    from: { x: currentX, y: currentY },
                    to: { x: newX, y: newY },
                    feedRate: feedRate
                });

                currentX = newX;
                currentY = newY;
            }
        }

        return toolpath;
    }

    /**
     * Estimate total path length for time calculation
     */
    getEstimatedLength(paths) {
        let total = 0;

        for (const pathObj of paths) {
            const points = this.pathToPoints(pathObj);
            for (let i = 1; i < points.length; i++) {
                total += this.distance(points[i - 1], points[i]);
            }
        }

        // Convert to mm
        return this.toMm(total);
    }
}
