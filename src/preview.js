/**
 * Toolpath Preview - Canvas-based visualization with grid and rulers
 * Shows travel moves (dashed blue) vs draw moves (solid green)
 */

export class PreviewRenderer {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.rulerX = document.getElementById(options.rulerX);
        this.rulerY = document.getElementById(options.rulerY);
        this.settings = options.settings;

        this.gridVisible = true;
        this.toolpath = [];
        this.animating = false;

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Account for rulers
        this.canvas.width = rect.width - 30;
        this.canvas.height = rect.height - 20;

        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '30px';
        this.canvas.style.top = '20px';

        this.drawRulers();
        this.redraw();
    }

    updateSettings(settings) {
        this.settings = settings;
        this.drawRulers();
        this.redraw();
    }

    setGridVisible(visible) {
        this.gridVisible = visible;
        this.redraw();
    }

    drawGrid() {
        if (!this.gridVisible) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Calculate scale (mm per pixel)
        const scaleX = this.settings.bedWidth / width;
        const scaleY = this.settings.bedHeight / height;

        // Major grid every 100mm, minor every 10mm
        const majorSpacingMm = 100;
        const minorSpacingMm = 10;

        ctx.save();

        // Minor grid lines
        ctx.strokeStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--grid-minor').trim() || 'rgba(99, 102, 241, 0.1)';
        ctx.lineWidth = 0.5;

        for (let mm = 0; mm <= this.settings.bedWidth; mm += minorSpacingMm) {
            const x = mm / scaleX;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let mm = 0; mm <= this.settings.bedHeight; mm += minorSpacingMm) {
            const y = height - (mm / scaleY);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Major grid lines
        ctx.strokeStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--grid-major').trim() || 'rgba(99, 102, 241, 0.3)';
        ctx.lineWidth = 1;

        for (let mm = 0; mm <= this.settings.bedWidth; mm += majorSpacingMm) {
            const x = mm / scaleX;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let mm = 0; mm <= this.settings.bedHeight; mm += majorSpacingMm) {
            const y = height - (mm / scaleY);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawRulers() {
        if (!this.rulerX || !this.rulerY) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        // X ruler (horizontal)
        let xHtml = '';
        const xStep = 100; // mm per major tick
        const scaleX = this.settings.bedWidth / width;

        for (let mm = 0; mm <= this.settings.bedWidth; mm += xStep) {
            const x = mm / scaleX;
            xHtml += `<span style="position:absolute;left:${x + 30}px;transform:translateX(-50%)">${mm}</span>`;
        }
        this.rulerX.innerHTML = xHtml;

        // Y ruler (vertical)
        let yHtml = '';
        const yStep = 100;
        const scaleY = this.settings.bedHeight / height;

        for (let mm = 0; mm <= this.settings.bedHeight; mm += yStep) {
            const y = height - (mm / scaleY);
            yHtml += `<span style="position:absolute;top:${y + 20}px;right:4px;transform:translateY(-50%)">${mm}</span>`;
        }
        this.rulerY.innerHTML = yHtml;
    }

    drawToolpath(toolpath) {
        this.toolpath = toolpath;
        this.redraw();
    }

    redraw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear
        const bgColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--bg-primary').trim() || '#0a0a0f';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        if (this.gridVisible) {
            this.drawGrid();
        }

        if (!this.toolpath.length) return;

        // Calculate scale
        const scaleX = width / this.settings.bedWidth;
        const scaleY = height / this.settings.bedHeight;

        // Draw paths
        for (const move of this.toolpath) {
            const fromX = move.from.x * scaleX;
            const fromY = height - (move.from.y * scaleY);
            const toX = move.to.x * scaleX;
            const toY = height - (move.to.y * scaleY);

            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);

            if (move.type === 'travel') {
                // Travel moves - dashed blue
                ctx.strokeStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue('--travel-color').trim() || '#3b82f6';
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 1;
            } else {
                // Draw moves - solid green
                ctx.strokeStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue('--draw-color').trim() || '#22c55e';
                ctx.setLineDash([]);
                ctx.lineWidth = 2;
            }

            ctx.stroke();
        }

        ctx.setLineDash([]);
    }

    async animate(toolpath, speed = 1) {
        if (this.animating) return;

        this.animating = true;
        this.toolpath = [];

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const scaleX = width / this.settings.bedWidth;
        const scaleY = height / this.settings.bedHeight;

        // Draw pen marker
        let penX = 0;
        let penY = height;

        const drawPen = (x, y, penDown) => {
            ctx.beginPath();
            ctx.arc(x, y, penDown ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = penDown ? '#22c55e' : '#3b82f6';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        };

        for (let i = 0; i < toolpath.length; i++) {
            if (!this.animating) break;

            const move = toolpath[i];
            const fromX = move.from.x * scaleX;
            const fromY = height - (move.from.y * scaleY);
            const toX = move.to.x * scaleX;
            const toY = height - (move.to.y * scaleY);

            // Calculate distance and animation duration
            const dx = toX - fromX;
            const dy = toY - fromY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const duration = (distance / (move.feedRate * scaleX)) * 60000 / speed; // ms

            const steps = Math.max(1, Math.ceil(duration / 16)); // ~60fps

            for (let step = 0; step <= steps; step++) {
                if (!this.animating) break;

                const t = step / steps;
                penX = fromX + dx * t;
                penY = fromY + dy * t;

                // Redraw everything
                this.toolpath = toolpath.slice(0, i);
                this.redraw();

                // Draw partial current segment
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(penX, penY);
                ctx.strokeStyle = move.type === 'travel' ? '#3b82f6' : '#22c55e';
                ctx.setLineDash(move.type === 'travel' ? [4, 4] : []);
                ctx.lineWidth = move.type === 'travel' ? 1 : 2;
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw pen
                drawPen(penX, penY, move.type === 'draw');

                await new Promise(r => setTimeout(r, 16));
            }

            this.toolpath.push(move);
        }

        this.animating = false;
        this.redraw();
    }

    stopAnimation() {
        this.animating = false;
    }

    clear() {
        this.toolpath = [];
        const bgColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--bg-primary').trim() || '#0a0a0f';
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
