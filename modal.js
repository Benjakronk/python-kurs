// modal.js — replaces all native alert/confirm/prompt calls

(function () {
    // Inject modal HTML once
    const container = document.createElement('div');
    container.id = 'modal-root';
    container.innerHTML = `
        <style>
            #modal-root .m-overlay {
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.55);
                z-index: 9000;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(3px);
                animation: mFadeIn 0.15s ease;
            }
            #modal-root .m-box {
                background: #fff;
                border-radius: 14px;
                padding: 28px 32px;
                max-width: 420px; width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                animation: mSlideIn 0.18s ease;
            }
            #modal-root .m-title {
                font-size: 1.1em; font-weight: 700; color: #1c3a6e;
                margin-bottom: 10px; font-family: 'Segoe UI', sans-serif;
            }
            #modal-root .m-body {
                color: #333; line-height: 1.55; margin-bottom: 20px;
                font-family: 'Segoe UI', sans-serif; font-size: 0.97em;
            }
            #modal-root .m-input {
                width: 100%; padding: 9px 12px; border: 2px solid #cdd8e3;
                border-radius: 6px; font-size: 1em; margin-bottom: 16px;
                box-sizing: border-box; transition: border-color 0.2s;
                font-family: 'Segoe UI', sans-serif;
            }
            #modal-root .m-input:focus { border-color: #2a6496; outline: none; }
            #modal-root .m-btns { display: flex; gap: 10px; justify-content: flex-end; }
            #modal-root .m-btn {
                padding: 9px 22px; border: none; border-radius: 7px;
                font-size: 0.95em; font-weight: 600; cursor: pointer;
                transition: opacity 0.15s, transform 0.15s;
                font-family: 'Segoe UI', sans-serif;
            }
            #modal-root .m-btn:hover { opacity: 0.85; transform: translateY(-1px); }
            #modal-root .m-btn-primary { background: #2a6496; color: #fff; }
            #modal-root .m-btn-secondary { background: #e9ecef; color: #333; }
            #modal-root .m-btn-danger { background: #dc3545; color: #fff; }
            @keyframes mFadeIn  { from { opacity: 0; }                     to { opacity: 1; } }
            @keyframes mSlideIn { from { transform: translateY(-12px) scale(0.97); opacity: 0; }
                                  to   { transform: translateY(0)      scale(1);    opacity: 1; } }
        </style>`;
    document.documentElement.appendChild(container);

    function _show({ title = '', body = '', inputPlaceholder = null, buttons = [] }) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'm-overlay';
            overlay.innerHTML = `
                <div class="m-box" role="dialog" aria-modal="true">
                    ${title ? `<div class="m-title">${title}</div>` : ''}
                    <div class="m-body">${body}</div>
                    ${inputPlaceholder !== null
                        ? `<input class="m-input" type="text" placeholder="${inputPlaceholder}">`
                        : ''}
                    <div class="m-btns"></div>
                </div>`;

            const btnRow   = overlay.querySelector('.m-btns');
            const inputEl  = overlay.querySelector('.m-input');

            buttons.forEach(btn => {
                const el = document.createElement('button');
                el.className = `m-btn m-btn-${btn.style || 'secondary'}`;
                el.textContent = btn.label;
                el.addEventListener('click', () => {
                    overlay.remove();
                    resolve(btn.value !== undefined ? btn.value
                        : (inputEl ? inputEl.value : undefined));
                });
                btnRow.appendChild(el);
            });

            if (inputEl) {
                inputEl.addEventListener('keydown', e => {
                    if (e.key === 'Enter') btnRow.querySelector('.m-btn-primary')?.click();
                });
            }

            container.appendChild(overlay);
            (inputEl || btnRow.querySelector('.m-btn-primary'))?.focus();
        });
    }

    // Public API — drop-in replacements for browser natives
    window.showAlert = function (message, title = 'Informasjon') {
        return _show({
            title,
            body: message,
            buttons: [{ label: 'OK', style: 'primary', value: undefined }]
        });
    };

    window.showConfirm = function (message, title = 'Bekreft') {
        return _show({
            title,
            body: message,
            buttons: [
                { label: 'Avbryt', style: 'secondary', value: false },
                { label: 'OK',     style: 'primary',   value: true  }
            ]
        });
    };

    window.showConfirmDanger = function (message, title = 'Advarsel') {
        return _show({
            title,
            body: message,
            buttons: [
                { label: 'Avbryt', style: 'secondary', value: false },
                { label: 'Slett',  style: 'danger',    value: true  }
            ]
        });
    };

    window.showPrompt = function (message, placeholder = '', title = '') {
        return _show({
            title,
            body: message,
            inputPlaceholder: placeholder,
            buttons: [
                { label: 'Avbryt', style: 'secondary', value: null },
                { label: 'OK',     style: 'primary'               }
            ]
        });
    };

    // Convenience: show a timed toast notification (non-blocking)
    window.showToast = function (message, type = 'info', durationMs = 3000) {
        const toast = document.createElement('div');
        const colors = { info: '#2a6496', success: '#28a745', danger: '#dc3545', warning: '#ffc107' };
        toast.style.cssText = `
            position:fixed; bottom:28px; right:28px; z-index:9999;
            background:${colors[type] || colors.info}; color:${type === 'warning' ? '#1a1a1a' : '#fff'};
            padding:12px 22px; border-radius:10px; font-family:'Segoe UI',sans-serif;
            font-size:0.92em; font-weight:600; box-shadow:0 6px 24px rgba(0,0,0,0.22);
            animation:mSlideIn 0.2s ease; max-width:320px; line-height:1.4;`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), durationMs);
    };
})();
