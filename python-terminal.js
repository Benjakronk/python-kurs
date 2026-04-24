// python-terminal.js
// Embedded Python terminal powered by Skulpt (https://skulpt.org)
// Usage: <div class="python-terminal-container" data-start-code="print('hei')"></div>
// Include skulpt.min.js and skulpt-stdlib.js BEFORE this script.

class PythonTerminal {
    constructor(container) {
        this.container = container;
        this._inputResolve = null;
        this._running = false;
        this._render();
        this._bindEvents();
    }

    _render() {
        this.container.innerHTML = `
            <div class="py-terminal-wrapper">
                <div class="py-terminal-header">
                    <div class="py-terminal-title">
                        <span>🐍</span>
                        <span>Python Terminal</span>
                    </div>
                    <div class="py-terminal-controls">
                        <button class="py-run-btn">▶ Kjør kode</button>
                        <button class="py-clear-btn">🗑 Tøm</button>
                    </div>
                </div>
                <textarea class="py-editor" spellcheck="false" autocomplete="off"
                    placeholder="Skriv Python-kode her..."></textarea>
                <div class="py-output-section">
                    <div class="py-output-label">Utdata</div>
                    <div class="py-output"></div>
                    <div class="py-input-row">
                        <span class="py-input-prompt"></span>
                        <input type="text" class="py-input-field" autocomplete="off">
                        <button class="py-input-submit">Enter</button>
                    </div>
                </div>
                <div class="py-disclaimer">
                    💡 Enkel terminal for å prøve kode raskt. For fullstendige programmer — bruk VSCode og terminalen din.
                </div>
            </div>
        `;

        this._editor        = this.container.querySelector('.py-editor');
        this._output        = this.container.querySelector('.py-output');
        this._inputRow      = this.container.querySelector('.py-input-row');
        this._inputPrompt   = this.container.querySelector('.py-input-prompt');
        this._inputField    = this.container.querySelector('.py-input-field');
        this._runBtn        = this.container.querySelector('.py-run-btn');
        this._clearBtn      = this.container.querySelector('.py-clear-btn');
        this._inputSubmit   = this.container.querySelector('.py-input-submit');
    }

    _bindEvents() {
        this._runBtn.addEventListener('click', () => this.run());
        this._clearBtn.addEventListener('click', () => this.clear());
        this._inputSubmit.addEventListener('click', () => this._submitInput());
        this._inputField.addEventListener('keydown', e => {
            if (e.key === 'Enter') this._submitInput();
        });

        // Tab key inserts 4 spaces (Python indentation) instead of losing focus
        this._editor.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this._editor.selectionStart;
                const end   = this._editor.selectionEnd;
                this._editor.value =
                    this._editor.value.substring(0, start) + '    ' +
                    this._editor.value.substring(end);
                this._editor.selectionStart = this._editor.selectionEnd = start + 4;
            }
            // Ctrl+Enter also runs
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                this.run();
            }
        });
    }

    _print(text) {
        const span = document.createElement('span');
        span.textContent = text;
        this._output.appendChild(span);
        this._output.scrollTop = this._output.scrollHeight;
    }

    _printError(text) {
        const span = document.createElement('span');
        span.className = 'py-error';
        // Shorten Skulpt's traceback to the most relevant line
        const lines = text.toString().split('\n');
        const cleaned = lines.filter(l =>
            !l.includes('at ') && !l.includes('skulpt') && l.trim() !== ''
        ).join('\n');
        span.textContent = (cleaned || text.toString()) + '\n';
        this._output.appendChild(span);
        this._output.scrollTop = this._output.scrollHeight;
    }

    _promptInput(prompt) {
        return new Promise(resolve => {
            this._inputPrompt.textContent = prompt || '';
            this._inputRow.style.display = 'flex';
            this._inputField.value = '';
            this._inputField.focus();
            this._inputResolve = resolve;
        });
    }

    _submitInput() {
        if (!this._inputResolve) return;
        const value = this._inputField.value;

        // Echo what was typed in the output (like a real terminal)
        const echo = document.createElement('span');
        echo.className = 'py-echo';
        echo.textContent = (this._inputPrompt.textContent || '') + value + '\n';
        this._output.appendChild(echo);

        this._inputRow.style.display = 'none';
        const resolve = this._inputResolve;
        this._inputResolve = null;
        resolve(value);
    }

    async run() {
        if (this._running) return;
        this._running = true;
        this.clear();

        const code = this._editor.value;
        if (!code.trim()) { this._running = false; return; }

        if (typeof Sk === 'undefined') {
            this._printError('Skulpt er ikke lastet. Sjekk internettforbindelsen og last siden på nytt.');
            this._running = false;
            return;
        }

        Sk.configure({
            output: text => this._print(text),
            inputfun: prompt => this._promptInput(prompt),
            inputfunTakesPrompt: true,
            __future__: Sk.python3,
            execLimit: 10000, // prevent infinite loops from hanging the browser
        });

        try {
            await Sk.misceval.asyncToPromise(() =>
                Sk.importMainWithBody('<stdin>', false, code, true)
            );
        } catch (err) {
            this._printError(err);
        } finally {
            this._inputRow.style.display = 'none';
            this._inputResolve = null;
            this._running = false;
        }
    }

    clear() {
        this._output.innerHTML = '';
        this._inputRow.style.display = 'none';
        this._inputResolve = null;
    }

    setCode(code) {
        this._editor.value = code;
    }
}

// Auto-initialize any terminal containers on the page
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.python-terminal-container').forEach(container => {
        const terminal = new PythonTerminal(container);
        const startCode = container.dataset.startCode;
        if (startCode) terminal.setCode(startCode);
    });
});
