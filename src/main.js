/**
 * Void-Satellite CNC Plotter - Main Application
 * Orchestrates image upload, vector editing, G-code generation, and preview
 */

import { VectorEditor } from './vectorEditor.js';
import { GcodeGenerator } from './gcodeGenerator.js';
import { GcodeTerminal } from './gcodeTerminal.js';
import { PreviewRenderer } from './preview.js';
import { AITracer } from './aiTracer.js';
import { Settings } from './settings.js';

class VoidSatellite {
    constructor() {
        this.settings = new Settings();
        this.vectorEditor = null;
        this.gcodeGenerator = null;
        this.gcodeTerminal = null;
        this.previewRenderer = null;
        this.aiTracer = null;

        this.originalImage = null;
        this.currentPaths = [];

        this.init();
    }

    async init() {
        // Initialize modules
        this.vectorEditor = new VectorEditor('editorCanvas', {
            onPathsChange: (paths) => this.onPathsChange(paths),
            onCursorMove: (x, y) => this.updateCursorPosition(x, y),
            settings: this.settings
        });

        this.gcodeGenerator = new GcodeGenerator(this.settings);

        this.gcodeTerminal = new GcodeTerminal('gcodeEditor', {
            onChange: (gcode) => this.onGcodeChange(gcode)
        });

        this.previewRenderer = new PreviewRenderer('previewCanvas', {
            rulerX: 'rulerX',
            rulerY: 'rulerY',
            settings: this.settings
        });

        this.aiTracer = new AITracer(this.settings);

        // Setup event listeners
        this.setupEventListeners();

        // Initialize theme
        this.initTheme();

        // Draw initial grid
        this.previewRenderer.drawGrid();

        console.log('Void-Satellite initialized');
    }

    setupEventListeners() {
        // File upload
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.loadImage(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                this.loadImage(e.target.files[0]);
            }
        });

        // Image opacity
        document.getElementById('imageOpacity').addEventListener('input', (e) => {
            this.vectorEditor.setBackgroundOpacity(e.target.value / 100);
        });

        // Buttons
        document.getElementById('traceBtn').addEventListener('click', () => this.traceImage());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('regenerateBtn').addEventListener('click', () => this.regenerateGcode());
        document.getElementById('copyGcode').addEventListener('click', () => this.copyGcode());
        document.getElementById('downloadGcode').addEventListener('click', () => this.downloadGcode());

        // Toolbar
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.vectorEditor.setTool(btn.dataset.tool);
            });
        });

        document.getElementById('undoBtn').addEventListener('click', () => this.vectorEditor.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.vectorEditor.redo());
        document.getElementById('deleteBtn').addEventListener('click', () => this.vectorEditor.deleteSelected());

        // Preview controls
        document.getElementById('playSimulation').addEventListener('click', () => this.playSimulation());
        document.getElementById('showGrid').addEventListener('change', (e) => {
            this.previewRenderer.setGridVisible(e.target.checked);
        });

        // Settings modal
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.querySelector('.modal-close').addEventListener('click', () => this.closeSettings());
        document.querySelector('.modal-backdrop').addEventListener('click', () => this.closeSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;

                // Show preview
                document.getElementById('uploadArea').classList.add('hidden');
                document.getElementById('imagePreview').classList.remove('hidden');
                document.getElementById('originalImage').src = e.target.result;

                // Enable buttons
                document.getElementById('traceBtn').disabled = false;
                document.getElementById('clearBtn').disabled = false;

                // Set as background in editor
                this.vectorEditor.setBackgroundImage(e.target.result, img.width, img.height);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    async traceImage() {
        if (!this.originalImage) return;

        const traceBtn = document.getElementById('traceBtn');
        traceBtn.disabled = true;
        traceBtn.innerHTML = '<span class="animate-pulse">Tracing...</span>';

        try {
            const paths = await this.aiTracer.trace(this.originalImage);
            this.vectorEditor.addPaths(paths);
        } catch (error) {
            console.error('Trace failed:', error);
            // Fallback to client-side edge detection
            const paths = this.aiTracer.clientSideTrace(this.originalImage);
            this.vectorEditor.addPaths(paths);
        }

        traceBtn.disabled = false;
        traceBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      AI Trace
    `;
    }

    clearAll() {
        this.vectorEditor.clear();
        this.originalImage = null;

        document.getElementById('uploadArea').classList.remove('hidden');
        document.getElementById('imagePreview').classList.add('hidden');
        document.getElementById('originalImage').src = '';
        document.getElementById('traceBtn').disabled = true;
        document.getElementById('clearBtn').disabled = true;

        this.gcodeTerminal.setContent(this.getDefaultGcode());
        this.previewRenderer.clear();
        this.previewRenderer.drawGrid();
    }

    onPathsChange(paths) {
        this.currentPaths = paths;

        // Update path count
        document.getElementById('pathCount').textContent = `${paths.length} paths`;

        // Update undo/redo buttons
        document.getElementById('undoBtn').disabled = !this.vectorEditor.canUndo();
        document.getElementById('redoBtn').disabled = !this.vectorEditor.canRedo();
        document.getElementById('deleteBtn').disabled = !this.vectorEditor.hasSelection();

        // Regenerate G-code
        this.regenerateGcode();
    }

    regenerateGcode() {
        const gcode = this.gcodeGenerator.generate(this.currentPaths);
        this.gcodeTerminal.setContent(gcode);
        this.updatePreview(gcode);
        this.updateEstimatedTime();
    }

    onGcodeChange(gcode) {
        // User edited G-code directly, update preview
        this.updatePreview(gcode);
    }

    updatePreview(gcode) {
        const toolpath = this.gcodeGenerator.parseGcode(gcode);
        this.previewRenderer.drawToolpath(toolpath);
    }

    updateCursorPosition(x, y) {
        const mmX = (x * this.settings.bedWidth / this.vectorEditor.canvasWidth).toFixed(1);
        const mmY = (y * this.settings.bedHeight / this.vectorEditor.canvasHeight).toFixed(1);
        document.getElementById('cursorPosition').textContent = `X: ${mmX}mm Y: ${mmY}mm`;
    }

    updateEstimatedTime() {
        // Rough estimate based on path length and feed rate
        const totalLength = this.gcodeGenerator.getEstimatedLength(this.currentPaths);
        const timeMinutes = totalLength / this.settings.feedRate;
        const minutes = Math.floor(timeMinutes);
        const seconds = Math.floor((timeMinutes - minutes) * 60);
        document.getElementById('estimatedTime').textContent = `Est: ${minutes}m ${seconds}s`;
    }

    async playSimulation() {
        const btn = document.getElementById('playSimulation');
        btn.disabled = true;

        const gcode = this.gcodeTerminal.getContent();
        const toolpath = this.gcodeGenerator.parseGcode(gcode);

        await this.previewRenderer.animate(toolpath);

        btn.disabled = false;
    }

    copyGcode() {
        const gcode = this.gcodeTerminal.getContent();
        navigator.clipboard.writeText(gcode).then(() => {
            const btn = document.getElementById('copyGcode');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✓ Copied';
            setTimeout(() => btn.innerHTML = originalHTML, 2000);
        });
    }

    downloadGcode() {
        const gcode = this.gcodeTerminal.getContent();
        const blob = new Blob([gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `void-satellite-${Date.now()}.gcode`;
        a.click();
        URL.revokeObjectURL(url);
    }

    getDefaultGcode() {
        return `; Void-Satellite CNC Plotter
; No paths - upload an image and trace
G21 ; mm mode
G90 ; absolute positioning
; G28 ; uncomment to home

; Add your paths here

M2 ; end program
`;
    }

    openSettings() {
        const modal = document.getElementById('settingsModal');
        modal.classList.remove('hidden');

        // Populate current settings
        document.getElementById('bedWidth').value = this.settings.bedWidth;
        document.getElementById('bedHeight').value = this.settings.bedHeight;
        document.getElementById('feedRate').value = this.settings.feedRate;
        document.getElementById('travelRate').value = this.settings.travelRate;
        document.getElementById('penUpCmd').value = this.settings.penUpCmd;
        document.getElementById('penDownCmd').value = this.settings.penDownCmd;
        document.getElementById('workerUrl').value = this.settings.workerUrl;
    }

    closeSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    saveSettings() {
        this.settings.update({
            bedWidth: parseInt(document.getElementById('bedWidth').value),
            bedHeight: parseInt(document.getElementById('bedHeight').value),
            feedRate: parseInt(document.getElementById('feedRate').value),
            travelRate: parseInt(document.getElementById('travelRate').value),
            penUpCmd: document.getElementById('penUpCmd').value,
            penDownCmd: document.getElementById('penDownCmd').value,
            workerUrl: document.getElementById('workerUrl').value
        });

        document.getElementById('bedSize').textContent =
            `${this.settings.bedWidth}mm × ${this.settings.bedHeight}mm`;

        this.previewRenderer.updateSettings(this.settings);
        this.closeSettings();

        // Regenerate G-code with new settings
        this.regenerateGcode();
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.dataset.theme = savedTheme;
    }

    toggleTheme() {
        const current = document.documentElement.dataset.theme;
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
    }

    handleKeyboard(e) {
        // Tool shortcuts
        if (!e.ctrlKey && !e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'v': this.selectTool('select'); break;
                case 'p': this.selectTool('pen'); break;
                case 'l': this.selectTool('line'); break;
                case 'e': this.selectTool('eraser'); break;
                case 'delete':
                case 'backspace':
                    this.vectorEditor.deleteSelected();
                    break;
            }
        }

        // Undo/Redo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                this.vectorEditor.redo();
            } else {
                this.vectorEditor.undo();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            this.vectorEditor.redo();
        }
    }

    selectTool(tool) {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        this.vectorEditor.setTool(tool);
    }
}

// Initialize app
const app = new VoidSatellite();
