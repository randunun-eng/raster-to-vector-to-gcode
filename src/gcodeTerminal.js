/**
 * G-code Terminal - Editable G-code editor with syntax highlighting
 * Allows direct editing and regeneration
 */

export class GcodeTerminal {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.onChange = options.onChange || (() => { });
        this.editor = null;
        this.content = '';

        this.init();
    }

    async init() {
        // Create a simple textarea-based editor for now
        // Can be upgraded to CodeMirror later for syntax highlighting
        this.editor = document.createElement('textarea');
        this.editor.className = 'gcode-textarea';
        this.editor.spellcheck = false;
        this.editor.placeholder = '; G-code will appear here after tracing...';

        // Add styling
        Object.assign(this.editor.style, {
            width: '100%',
            height: '100%',
            padding: '16px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            lineHeight: '1.6',
            color: 'var(--text-primary)',
            backgroundColor: 'var(--bg-primary)',
            border: 'none',
            outline: 'none',
            resize: 'none',
            whiteSpace: 'pre',
            overflowWrap: 'normal',
            overflowX: 'auto'
        });

        this.container.appendChild(this.editor);

        // Listen for changes
        this.editor.addEventListener('input', () => {
            this.content = this.editor.value;
            this.onChange(this.content);
        });

        // Add line numbers container
        this.setupLineNumbers();
    }

    setupLineNumbers() {
        // Wrap in a container with line numbers
        const wrapper = document.createElement('div');
        wrapper.className = 'gcode-wrapper';
        wrapper.style.cssText = `
      display: flex;
      height: 100%;
      position: relative;
    `;

        const lineNumbers = document.createElement('div');
        lineNumbers.className = 'line-numbers';
        lineNumbers.style.cssText = `
      width: 40px;
      padding: 16px 8px;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      line-height: 1.6;
      color: var(--text-muted);
      background: var(--bg-tertiary);
      text-align: right;
      user-select: none;
      overflow: hidden;
    `;

        this.lineNumbers = lineNumbers;

        // Reparent
        this.container.innerHTML = '';
        wrapper.appendChild(lineNumbers);
        wrapper.appendChild(this.editor);
        this.container.appendChild(wrapper);

        this.editor.style.flex = '1';

        // Sync scroll
        this.editor.addEventListener('scroll', () => {
            lineNumbers.scrollTop = this.editor.scrollTop;
        });

        // Update line numbers on input
        this.editor.addEventListener('input', () => this.updateLineNumbers());
    }

    updateLineNumbers() {
        const lines = this.editor.value.split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += i + '<br>';
        }
        this.lineNumbers.innerHTML = html;
    }

    setContent(gcode) {
        this.content = gcode;
        this.editor.value = gcode;
        this.updateLineNumbers();
    }

    getContent() {
        return this.editor.value;
    }

    insertComment(lineNumber, comment) {
        const lines = this.editor.value.split('\n');
        if (lineNumber >= 0 && lineNumber < lines.length) {
            lines[lineNumber] = lines[lineNumber] + ' ; ' + comment;
            this.setContent(lines.join('\n'));
        }
    }

    highlightLine(lineNumber) {
        // Move cursor to specific line
        const lines = this.editor.value.split('\n');
        let charPos = 0;
        for (let i = 0; i < lineNumber && i < lines.length; i++) {
            charPos += lines[i].length + 1;
        }
        this.editor.setSelectionRange(charPos, charPos + (lines[lineNumber]?.length || 0));
        this.editor.focus();
    }
}
