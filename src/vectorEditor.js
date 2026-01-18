/**
 * Vector Editor - Interactive canvas for drawing and editing vector paths
 * Uses Fabric.js for bezier curve manipulation
 */

export class VectorEditor {
    constructor(canvasId, options = {}) {
        this.canvasEl = document.getElementById(canvasId);
        this.onPathsChange = options.onPathsChange || (() => { });
        this.onCursorMove = options.onCursorMove || (() => { });
        this.onZoomChange = options.onZoomChange || (() => { });
        this.settings = options.settings;

        this.canvas = null;
        this.backgroundImage = null;
        this.currentTool = 'select';
        this.isDrawing = false;
        this.drawingPath = null;
        this.points = [];

        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        // Zoom and pan state
        this.zoomLevel = 1;
        this.minZoom = 0.1;
        this.maxZoom = 10;
        this.isPanning = false;
        this.lastPanPoint = null;

        this.init();
    }

    async init() {
        // Import Fabric.js dynamically
        const { fabric } = await import('fabric');
        this.fabric = fabric;

        // Get container dimensions
        const container = this.canvasEl.parentElement;
        const rect = container.getBoundingClientRect();

        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;

        // Initialize Fabric canvas
        this.canvas = new fabric.Canvas(this.canvasEl, {
            width: this.canvasWidth,
            height: this.canvasHeight,
            backgroundColor: '#1a1a25',
            selection: true,
            preserveObjectStacking: true
        });

        // Setup event handlers
        this.setupEvents();

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());

        // Save initial state
        this.saveState();
    }

    setupEvents() {
        const canvas = this.canvas;

        canvas.on('mouse:move', (e) => {
            const pointer = canvas.getPointer(e.e);
            this.onCursorMove(pointer.x, pointer.y);

            if (this.isDrawing && this.currentTool === 'pen') {
                this.updateDrawingPath(pointer);
            }
        });

        canvas.on('mouse:down', (e) => {
            const pointer = canvas.getPointer(e.e);

            if (this.currentTool === 'pen') {
                this.startDrawing(pointer);
            } else if (this.currentTool === 'line') {
                this.startLine(pointer);
            } else if (this.currentTool === 'eraser') {
                this.erase(e.target);
            }
        });

        canvas.on('mouse:up', (e) => {
            if (this.currentTool === 'pen' && this.isDrawing) {
                this.finishDrawing();
            } else if (this.currentTool === 'line' && this.isDrawing) {
                this.finishLine(this.canvas.getPointer(e.e));
            }
        });

        canvas.on('object:modified', () => {
            this.saveState();
            this.emitPaths();
        });

        canvas.on('selection:created', () => {
            this.onPathsChange(this.getPaths());
        });

        canvas.on('selection:cleared', () => {
            this.onPathsChange(this.getPaths());
        });
    }

    setTool(tool) {
        this.currentTool = tool;

        const canvas = this.canvas;

        if (tool === 'select') {
            canvas.selection = true;
            canvas.forEachObject(obj => {
                if (!obj.isBackground) {
                    obj.selectable = true;
                    obj.evented = true;
                }
            });
            canvas.defaultCursor = 'default';
        } else {
            canvas.selection = false;
            canvas.discardActiveObject();
            canvas.forEachObject(obj => {
                obj.selectable = false;
                obj.evented = tool === 'eraser';
            });

            canvas.defaultCursor = tool === 'eraser' ? 'crosshair' : 'crosshair';
        }

        canvas.renderAll();
    }

    startDrawing(pointer) {
        this.isDrawing = true;
        this.points = [{ x: pointer.x, y: pointer.y }];

        this.drawingPath = new this.fabric.Path(`M ${pointer.x} ${pointer.y}`, {
            stroke: '#22c55e',
            strokeWidth: 2,
            fill: null,
            selectable: false,
            evented: false
        });

        this.canvas.add(this.drawingPath);
    }

    updateDrawingPath(pointer) {
        if (!this.drawingPath) return;

        this.points.push({ x: pointer.x, y: pointer.y });

        // Smooth the path using quadratic curves
        let pathData = `M ${this.points[0].x} ${this.points[0].y}`;

        for (let i = 1; i < this.points.length - 1; i++) {
            const xc = (this.points[i].x + this.points[i + 1].x) / 2;
            const yc = (this.points[i].y + this.points[i + 1].y) / 2;
            pathData += ` Q ${this.points[i].x} ${this.points[i].y} ${xc} ${yc}`;
        }

        if (this.points.length > 1) {
            const last = this.points[this.points.length - 1];
            pathData += ` L ${last.x} ${last.y}`;
        }

        this.drawingPath.set({ path: this.fabric.util.parsePath(pathData) });
        this.canvas.renderAll();
    }

    finishDrawing() {
        if (!this.drawingPath) return;

        this.isDrawing = false;

        // Simplify the path
        const simplified = this.simplifyPath(this.points);

        // Create final smooth path
        let pathData = `M ${simplified[0].x} ${simplified[0].y}`;

        for (let i = 1; i < simplified.length - 1; i++) {
            const xc = (simplified[i].x + simplified[i + 1].x) / 2;
            const yc = (simplified[i].y + simplified[i + 1].y) / 2;
            pathData += ` Q ${simplified[i].x} ${simplified[i].y} ${xc} ${yc}`;
        }

        if (simplified.length > 1) {
            const last = simplified[simplified.length - 1];
            pathData += ` L ${last.x} ${last.y}`;
        }

        this.canvas.remove(this.drawingPath);

        const finalPath = new this.fabric.Path(pathData, {
            stroke: '#22c55e',
            strokeWidth: 2,
            fill: null,
            selectable: true,
            evented: true,
            hasControls: true,
            hasBorders: true
        });

        this.canvas.add(finalPath);
        this.drawingPath = null;
        this.points = [];

        this.saveState();
        this.emitPaths();
    }

    startLine(pointer) {
        this.isDrawing = true;
        this.lineStart = pointer;

        this.drawingPath = new this.fabric.Line(
            [pointer.x, pointer.y, pointer.x, pointer.y],
            {
                stroke: '#22c55e',
                strokeWidth: 2,
                selectable: false,
                evented: false
            }
        );

        this.canvas.add(this.drawingPath);

        // Track mouse for line preview
        this.canvas.on('mouse:move', this.updateLine.bind(this));
    }

    updateLine(e) {
        if (!this.isDrawing || !this.drawingPath) return;

        const pointer = this.canvas.getPointer(e.e);
        this.drawingPath.set({ x2: pointer.x, y2: pointer.y });
        this.canvas.renderAll();
    }

    finishLine(pointer) {
        if (!this.drawingPath) return;

        this.isDrawing = false;
        this.canvas.off('mouse:move', this.updateLine);

        // Convert to path for consistency
        const x1 = this.lineStart.x;
        const y1 = this.lineStart.y;
        const x2 = pointer.x;
        const y2 = pointer.y;

        this.canvas.remove(this.drawingPath);

        const linePath = new this.fabric.Path(`M ${x1} ${y1} L ${x2} ${y2}`, {
            stroke: '#22c55e',
            strokeWidth: 2,
            fill: null,
            selectable: true,
            evented: true,
            hasControls: true,
            hasBorders: true
        });

        this.canvas.add(linePath);
        this.drawingPath = null;

        this.saveState();
        this.emitPaths();
    }

    erase(target) {
        if (target && !target.isBackground) {
            this.canvas.remove(target);
            this.saveState();
            this.emitPaths();
        }
    }

    simplifyPath(points, tolerance = 2) {
        if (points.length <= 2) return points;

        // Douglas-Peucker algorithm
        const sqTolerance = tolerance * tolerance;

        const getSqDist = (p1, p2) => {
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            return dx * dx + dy * dy;
        };

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

    setBackgroundImage(dataUrl, width, height) {
        if (this.backgroundImage) {
            this.canvas.remove(this.backgroundImage);
        }

        this.fabric.Image.fromURL(dataUrl, (img) => {
            // Scale to fit canvas while maintaining aspect ratio
            const scaleX = this.canvasWidth / width;
            const scaleY = this.canvasHeight / height;
            const scale = Math.min(scaleX, scaleY) * 0.9;

            img.set({
                scaleX: scale,
                scaleY: scale,
                left: (this.canvasWidth - width * scale) / 2,
                top: (this.canvasHeight - height * scale) / 2,
                selectable: false,
                evented: false,
                opacity: 0.5,
                isBackground: true
            });

            this.backgroundImage = img;
            this.canvas.add(img);
            this.canvas.sendToBack(img);
            this.canvas.renderAll();
        });
    }

    setBackgroundOpacity(opacity) {
        if (this.backgroundImage) {
            this.backgroundImage.set('opacity', opacity);
            this.canvas.renderAll();
        }
    }

    addPaths(paths) {
        paths.forEach(pathData => {
            const path = new this.fabric.Path(pathData, {
                stroke: '#22c55e',
                strokeWidth: 2,
                fill: null,
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true
            });
            this.canvas.add(path);
        });

        this.saveState();
        this.emitPaths();
    }

    getPaths() {
        const paths = [];
        this.canvas.forEachObject(obj => {
            if (!obj.isBackground && obj.path) {
                paths.push({
                    path: obj.path,
                    left: obj.left,
                    top: obj.top,
                    scaleX: obj.scaleX,
                    scaleY: obj.scaleY,
                    angle: obj.angle
                });
            }
        });
        return paths;
    }

    emitPaths() {
        this.onPathsChange(this.getPaths());
    }

    deleteSelected() {
        const active = this.canvas.getActiveObjects();
        if (active.length) {
            active.forEach(obj => {
                if (!obj.isBackground) {
                    this.canvas.remove(obj);
                }
            });
            this.canvas.discardActiveObject();
            this.saveState();
            this.emitPaths();
        }
    }

    hasSelection() {
        const active = this.canvas.getActiveObjects();
        return active.some(obj => !obj.isBackground);
    }

    clear() {
        this.canvas.clear();
        this.canvas.backgroundColor = '#1a1a25';
        this.backgroundImage = null;
        this.history = [];
        this.historyIndex = -1;
        this.saveState();
        this.emitPaths();
    }

    saveState() {
        // Remove future states if we're not at the end
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Save current state
        const state = JSON.stringify(this.canvas.toJSON(['isBackground']));
        this.history.push(state);

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        this.historyIndex = this.history.length - 1;
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.loadState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.loadState(this.history[this.historyIndex]);
        }
    }

    canUndo() {
        return this.historyIndex > 0;
    }

    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    loadState(state) {
        this.canvas.loadFromJSON(state, () => {
            this.canvas.forEachObject(obj => {
                if (obj.isBackground) {
                    this.backgroundImage = obj;
                }
            });
            this.canvas.renderAll();
            this.emitPaths();
        });
    }

    handleResize() {
        const container = this.canvasEl.parentElement;
        const rect = container.getBoundingClientRect();

        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;

        this.canvas.setDimensions({
            width: this.canvasWidth,
            height: this.canvasHeight
        });

        this.canvas.renderAll();
    }

    // ============================================
    // Zoom Methods
    // ============================================

    zoomIn() {
        this.setZoom(this.zoomLevel * 1.2);
    }

    zoomOut() {
        this.setZoom(this.zoomLevel / 1.2);
    }

    setZoom(level, point = null) {
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, level));

        if (point) {
            // Zoom to point
            this.canvas.zoomToPoint(point, newZoom);
        } else {
            // Zoom to center
            const center = {
                x: this.canvasWidth / 2,
                y: this.canvasHeight / 2
            };
            this.canvas.zoomToPoint(center, newZoom);
        }

        this.zoomLevel = newZoom;
        this.onZoomChange(Math.round(newZoom * 100));
        this.canvas.renderAll();
    }

    zoomReset() {
        // Reset zoom and pan
        this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        this.zoomLevel = 1;
        this.onZoomChange(100);
        this.canvas.renderAll();
    }

    zoomFit() {
        // Fit all objects in view
        const objects = this.canvas.getObjects().filter(obj => !obj.isBackground);

        if (objects.length === 0 && this.backgroundImage) {
            // Fit to background image
            const img = this.backgroundImage;
            const imgWidth = img.width * img.scaleX;
            const imgHeight = img.height * img.scaleY;

            const scaleX = (this.canvasWidth * 0.9) / imgWidth;
            const scaleY = (this.canvasHeight * 0.9) / imgHeight;
            const scale = Math.min(scaleX, scaleY);

            this.setZoom(scale);

            // Center the image
            const vpt = this.canvas.viewportTransform;
            vpt[4] = (this.canvasWidth - imgWidth * scale) / 2 - img.left * scale;
            vpt[5] = (this.canvasHeight - imgHeight * scale) / 2 - img.top * scale;
            this.canvas.setViewportTransform(vpt);
        } else if (objects.length > 0) {
            // Fit to all objects
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            objects.forEach(obj => {
                const bounds = obj.getBoundingRect();
                minX = Math.min(minX, bounds.left);
                minY = Math.min(minY, bounds.top);
                maxX = Math.max(maxX, bounds.left + bounds.width);
                maxY = Math.max(maxY, bounds.top + bounds.height);
            });

            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;

            const scaleX = (this.canvasWidth * 0.9) / contentWidth;
            const scaleY = (this.canvasHeight * 0.9) / contentHeight;
            const scale = Math.min(scaleX, scaleY, this.maxZoom);

            this.zoomReset();
            this.setZoom(scale);

            // Center content
            const vpt = this.canvas.viewportTransform;
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            vpt[4] = this.canvasWidth / 2 - centerX * scale;
            vpt[5] = this.canvasHeight / 2 - centerY * scale;
            this.canvas.setViewportTransform(vpt);
        }

        this.canvas.renderAll();
    }

    getZoomLevel() {
        return Math.round(this.zoomLevel * 100);
    }

    // ============================================
    // Pan Methods
    // ============================================

    startPan(e) {
        if (this.currentTool !== 'pan') return;

        this.isPanning = true;
        this.lastPanPoint = { x: e.clientX, y: e.clientY };
        this.canvas.selection = false;
        this.canvas.defaultCursor = 'grabbing';
        document.getElementById('canvasWrapper')?.classList.add('panning');
    }

    doPan(e) {
        if (!this.isPanning || !this.lastPanPoint) return;

        const dx = e.clientX - this.lastPanPoint.x;
        const dy = e.clientY - this.lastPanPoint.y;

        const vpt = this.canvas.viewportTransform;
        vpt[4] += dx;
        vpt[5] += dy;
        this.canvas.setViewportTransform(vpt);

        this.lastPanPoint = { x: e.clientX, y: e.clientY };
        this.canvas.renderAll();
    }

    endPan() {
        this.isPanning = false;
        this.lastPanPoint = null;
        this.canvas.defaultCursor = 'grab';
        document.getElementById('canvasWrapper')?.classList.remove('panning');
    }

    // Navigate to anchor position (for anchor buttons)
    navigateToAnchor(anchor) {
        // Get content bounds
        let contentWidth, contentHeight, contentLeft, contentTop;

        if (this.backgroundImage) {
            const img = this.backgroundImage;
            contentWidth = img.width * img.scaleX;
            contentHeight = img.height * img.scaleY;
            contentLeft = img.left;
            contentTop = img.top;
        } else {
            // Use canvas bounds
            contentWidth = this.canvasWidth;
            contentHeight = this.canvasHeight;
            contentLeft = 0;
            contentTop = 0;
        }

        const vpt = this.canvas.viewportTransform;
        const zoom = this.zoomLevel;

        // Calculate target viewport position based on anchor
        let targetX, targetY;

        switch (anchor) {
            case 'tl': // Top Left
                targetX = -contentLeft * zoom + 50;
                targetY = -contentTop * zoom + 50;
                break;
            case 'tc': // Top Center
                targetX = this.canvasWidth / 2 - (contentLeft + contentWidth / 2) * zoom;
                targetY = -contentTop * zoom + 50;
                break;
            case 'tr': // Top Right
                targetX = this.canvasWidth - (contentLeft + contentWidth) * zoom - 50;
                targetY = -contentTop * zoom + 50;
                break;
            case 'ml': // Middle Left
                targetX = -contentLeft * zoom + 50;
                targetY = this.canvasHeight / 2 - (contentTop + contentHeight / 2) * zoom;
                break;
            case 'mc': // Middle Center
                targetX = this.canvasWidth / 2 - (contentLeft + contentWidth / 2) * zoom;
                targetY = this.canvasHeight / 2 - (contentTop + contentHeight / 2) * zoom;
                break;
            case 'mr': // Middle Right
                targetX = this.canvasWidth - (contentLeft + contentWidth) * zoom - 50;
                targetY = this.canvasHeight / 2 - (contentTop + contentHeight / 2) * zoom;
                break;
            case 'bl': // Bottom Left
                targetX = -contentLeft * zoom + 50;
                targetY = this.canvasHeight - (contentTop + contentHeight) * zoom - 50;
                break;
            case 'bc': // Bottom Center
                targetX = this.canvasWidth / 2 - (contentLeft + contentWidth / 2) * zoom;
                targetY = this.canvasHeight - (contentTop + contentHeight) * zoom - 50;
                break;
            case 'br': // Bottom Right
                targetX = this.canvasWidth - (contentLeft + contentWidth) * zoom - 50;
                targetY = this.canvasHeight - (contentTop + contentHeight) * zoom - 50;
                break;
            default:
                return;
        }

        // Animate viewport movement
        this.animateViewportTo(targetX, targetY);
    }

    animateViewportTo(targetX, targetY) {
        const vpt = this.canvas.viewportTransform;
        const startX = vpt[4];
        const startY = vpt[5];
        const duration = 300;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (ease-out)
            const eased = 1 - Math.pow(1 - progress, 3);

            vpt[4] = startX + (targetX - startX) * eased;
            vpt[5] = startY + (targetY - startY) * eased;
            this.canvas.setViewportTransform(vpt);
            this.canvas.renderAll();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    // Handle mouse wheel zoom
    setupWheelZoom() {
        this.canvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY;
            let zoom = this.canvas.getZoom();
            zoom *= 0.999 ** delta;

            zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));

            this.canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
            this.zoomLevel = zoom;
            this.onZoomChange(Math.round(zoom * 100));

            opt.e.preventDefault();
            opt.e.stopPropagation();
        });
    }
}
