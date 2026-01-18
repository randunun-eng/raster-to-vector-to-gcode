/**
 * Vector Editor - Interactive canvas for drawing and editing vector paths
 * Uses Fabric.js for bezier curve manipulation
 */

export class VectorEditor {
    constructor(canvasId, options = {}) {
        this.canvasEl = document.getElementById(canvasId);
        this.onPathsChange = options.onPathsChange || (() => { });
        this.onCursorMove = options.onCursorMove || (() => { });
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
}
