// auth.js
// Handles user login, registration, and progress sync with Google Sheets.
// Requires config.js and modal.js to be loaded first.
// If modal.js is not yet on the page, this guard ensures it loads synchronously-ish.
if (typeof showAlert === 'undefined') {
    document.write('<script src="modal.js"><\/script>');
}

class CourseAuth {
    constructor() {
        this.currentUser = null;
        this._cloudOk = COURSE_CONFIG.enableCloudSync && !!COURSE_CONFIG.appsScriptUrl;
        this._init();
    }

    _init() {
        const stored = localStorage.getItem('py_course_user');
        if (stored) {
            try { this.currentUser = JSON.parse(stored); } catch {}
        }
        this._updateUserBadge();
    }

    // -----------------------------------------------------------------------
    // Login / Register
    // -----------------------------------------------------------------------

    async login(name, password) {
        name = name.trim();
        if (!name) return { success: false, error: 'Skriv inn et navn.' };

        if (this._cloudOk) {
            try {
                const url = `${COURSE_CONFIG.appsScriptUrl}?action=login` +
                    `&name=${encodeURIComponent(name)}` +
                    `&password=${encodeURIComponent(password)}`;
                const res  = await fetch(url, { redirect: 'follow' });
                const data = await res.json();

                if (data.success) {
                    this._setUser(name, password);
                    if (data.progress) this._mergeProgress(JSON.parse(data.progress));
                    return { success: true };
                }
                return { success: false, error: data.error || 'Feil navn eller passord.' };
            } catch {
                // Cloud unreachable — fall back to local
                this._setUser(name, password);
                return { success: true, localOnly: true };
            }
        }

        // Local-only mode: just save the name (no password needed)
        this._setUser(name, password);
        return { success: true, localOnly: true };
    }

    async register(name, password) {
        name = name.trim();
        if (!name) return { success: false, error: 'Skriv inn et navn.' };

        if (this._cloudOk) {
            try {
                const url = `${COURSE_CONFIG.appsScriptUrl}?action=register` +
                    `&name=${encodeURIComponent(name)}` +
                    `&password=${encodeURIComponent(password)}`;
                const res  = await fetch(url, { redirect: 'follow' });
                const data = await res.json();

                if (data.success) {
                    this._setUser(name, password);
                    return { success: true };
                }
                return { success: false, error: data.error || 'Kunne ikke opprette konto.' };
            } catch {
                this._setUser(name, password);
                return { success: true, localOnly: true };
            }
        }

        this._setUser(name, password);
        return { success: true, localOnly: true };
    }

    async logout() {
        const ok = await showConfirm(`Logge ut som ${this.currentUser?.name}?`, 'Logg ut');
        if (!ok) return;
        this.currentUser = null;
        localStorage.removeItem('py_course_user');
        this._updateUserBadge();
    }

    // -----------------------------------------------------------------------
    // Progress save / load
    // -----------------------------------------------------------------------

    async saveProgress() {
        const progress = this._gatherProgress();
        localStorage.setItem('py_course_progress_backup', JSON.stringify(progress));

        if (this._cloudOk && this.currentUser) {
            try {
                const url = `${COURSE_CONFIG.appsScriptUrl}?action=save` +
                    `&name=${encodeURIComponent(this.currentUser.name)}` +
                    `&password=${encodeURIComponent(this.currentUser.password)}` +
                    `&progress=${encodeURIComponent(JSON.stringify(progress))}`;
                await fetch(url, { redirect: 'follow' });
            } catch {
                // Silent failure — progress is already in localStorage
            }
        }
    }

    _gatherProgress() {
        const progress = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('modul')) {
                progress[key] = localStorage.getItem(key) === 'true';
            }
        }
        return progress;
    }

    _mergeProgress(cloudProgress) {
        // A lesson completed in the cloud overrides local (completed always wins)
        Object.entries(cloudProgress).forEach(([key, val]) => {
            if (val === true) localStorage.setItem(key, 'true');
        });
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    _setUser(name, password) {
        this.currentUser = { name, password };
        localStorage.setItem('py_course_user', JSON.stringify(this.currentUser));
        this._updateUserBadge();
    }

    _updateUserBadge() {
        const badge = document.getElementById('userBadge');
        if (!badge) return;
        if (this.currentUser) {
            badge.textContent = `👤 ${this.currentUser.name}`;
            badge.title = 'Klikk for å gå til profilen din';
        } else {
            badge.textContent = '👤 Logg inn';
            badge.title = 'Klikk for å logge inn';
        }
    }
}

// ============================================================
// Auth Modal UI
// ============================================================

function initAuthModal() {
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;

    const tabs       = overlay.querySelectorAll('.auth-tab');
    const loginForm  = overlay.querySelector('#loginForm');
    const regForm    = overlay.querySelector('#registerForm');
    const loginErr   = overlay.querySelector('#loginError');
    const regErr     = overlay.querySelector('#registerError');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loginForm.style.display = tab.dataset.tab === 'login'    ? 'block' : 'none';
            regForm.style.display   = tab.dataset.tab === 'register' ? 'block' : 'none';
        });
    });

    overlay.querySelector('#loginSubmit').addEventListener('click', async () => {
        loginErr.style.display = 'none';
        const name     = overlay.querySelector('#loginName').value;
        const password = overlay.querySelector('#loginPassword').value;
        const result   = await window.courseAuth.login(name, password);
        if (result.success) {
            closeAuthModal();
            if (typeof onAuthComplete === 'function') onAuthComplete();
        } else {
            loginErr.textContent = result.error;
            loginErr.style.display = 'block';
        }
    });

    overlay.querySelector('#registerSubmit').addEventListener('click', async () => {
        regErr.style.display = 'none';
        const name     = overlay.querySelector('#registerName').value;
        const password = overlay.querySelector('#registerPassword').value;
        const password2= overlay.querySelector('#registerPassword2').value;
        if (password !== password2) {
            regErr.textContent = 'Passordene stemmer ikke overens.';
            regErr.style.display = 'block';
            return;
        }
        const result = await window.courseAuth.register(name, password);
        if (result.success) {
            closeAuthModal();
            if (typeof onAuthComplete === 'function') onAuthComplete();
        } else {
            regErr.textContent = result.error;
            regErr.style.display = 'block';
        }
    });

    overlay.querySelector('#guestBtn').addEventListener('click', () => {
        closeAuthModal();
        if (typeof onAuthComplete === 'function') onAuthComplete();
    });
}

function showAuthModal() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.remove('hidden');
}

function closeAuthModal() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.add('hidden');
}

// ============================================================
// Bootstrap
// ============================================================

window.courseAuth = new CourseAuth();

document.addEventListener('DOMContentLoaded', () => {
    initAuthModal();

    const badge = document.getElementById('userBadge');
    if (badge) {
        badge.addEventListener('click', () => {
            if (window.courseAuth.currentUser) {
                window.location.href = 'user.html';
            } else {
                showAuthModal();
            }
        });
    }

    // Show login modal on first visit (no stored user) — only on pages that opt in
    if (document.body.dataset.requireAuth === 'true' && !window.courseAuth.currentUser) {
        showAuthModal();
    }
});
