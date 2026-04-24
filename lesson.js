// lesson.js
// Shared lesson completion logic used by all lesson pages.
// Requires auth.js (and config.js) to be loaded first.

// ============================================================
// Boss unlock data (mirrors boss-data.js / index.html MODULES)
// ============================================================

const _MODULE_LESSONS = {
    0: ['modul0_oppsett', 'modul0_terminal', 'modul0_foerste_program'],
    1: ['modul1_variabler', 'modul1_print_input', 'modul1_strenger', 'modul1_tall', 'modul1_kommentarer'],
    2: ['modul2_if', 'modul2_while', 'modul2_for', 'modul2_kombinert'],
    3: ['modul3_funksjoner', 'modul3_parametere', 'modul3_return', 'modul3_innebygde'],
    4: ['modul4_lister', 'modul4_liste_metoder', 'modul4_ordboker', 'modul4_loekker_data'],
    5: ['modul5_les_filer', 'modul5_skriv_filer', 'modul5_feilhandtering', 'modul5_moduler'],
};

const _BOSS_INFO = {
    0: { image: 'images/ghost.png',    name: 'Den Tomme Skjermen', subtitle: 'Hjemsøker alle som ikke kan print()' },
    1: { image: 'images/vampire.png',  name: 'Variabel-Vampyren',  subtitle: 'Mester i variabler og datatyper' },
    2: { image: 'images/leviathan.png',name: 'Løkke-Leviatan',     subtitle: 'Herre over if-setninger og løkker' },
    3: { image: 'images/pharaoh.png',  name: 'Funksjonenes Farao', subtitle: 'Voktere av alle funksjoner' },
    4: { image: 'images/dragon.png',   name: 'Datastruktur-Dragen',subtitle: 'Arkivaren av lister og ordbøker' },
    5: { image: 'images/phoenix.png',  name: 'Feil-Føniks',        subtitle: 'Mesteren av unntak og moduler' },
};

// ============================================================
// Lesson init
// ============================================================

function initLesson(lessonId) {
    const checkboxes    = document.querySelectorAll('.checklist input[type="checkbox"]');
    const completionBtn = document.getElementById('completionBtn');
    const completionMsg = document.getElementById('completionMsg');
    const alreadyNote   = document.getElementById('alreadyCompletedNote');

    const alreadyDone = localStorage.getItem(lessonId) === 'true';

    // If already completed, pre-check all boxes and show note
    if (alreadyDone) {
        checkboxes.forEach(cb => {
            cb.checked = true;
            cb.parentElement.classList.add('completed');
        });
        if (alreadyNote) alreadyNote.style.display = 'block';
        if (completionBtn) {
            completionBtn.textContent = '✓ Allerede fullført!';
            completionBtn.disabled = true;
        }
    } else {
        if (completionBtn) completionBtn.disabled = true;
    }

    // Listen for checkbox changes
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                cb.parentElement.classList.add('completed');
            } else {
                cb.parentElement.classList.remove('completed');
            }
            _updateCompletionBtn(checkboxes, completionBtn);
        });
    });

    // Completion button click
    if (completionBtn) {
        completionBtn.addEventListener('click', () => {
            if (!_allChecked(checkboxes)) return;

            if (!window.courseAuth?.currentUser) {
                showAlert('Du må logge inn for å lagre fremgangen din. Gå til forsiden og logg inn!', 'Logg inn for å lagre');
                return;
            }

            // Mark complete
            localStorage.setItem(lessonId, 'true');
            if (window.courseAuth) window.courseAuth.saveProgress();

            // Update UI
            completionBtn.textContent = '🎉 +1 poeng! Bra jobbet!';
            completionBtn.disabled = true;
            if (completionMsg) completionMsg.style.display = 'block';

            // Scroll to message
            if (completionMsg) completionMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Check if this was the final lesson that unlocks a boss
            setTimeout(() => _checkBossUnlock(lessonId), 700);
        });
    }
}

// ============================================================
// Boss unlock toast
// ============================================================

function _checkBossUnlock(lessonId) {
    const match = lessonId.match(/^modul(\d+)_/);
    if (!match) return;
    const moduleId = parseInt(match[1]);
    const lessons  = _MODULE_LESSONS[moduleId];
    if (!lessons) return;

    const allDone = lessons.every(l => localStorage.getItem(l) === 'true');
    if (!allDone) return;

    if (sessionStorage.getItem(`boss_seen_${moduleId}`) === 'true') return;
    sessionStorage.setItem(`boss_seen_${moduleId}`, 'true');

    _showBossUnlockToast(moduleId);
}

function _showBossUnlockToast(moduleId) {
    const boss = _BOSS_INFO[moduleId];
    if (!boss) return;

    _injectBossToastStyles();
    document.querySelector('.boss-unlock-toast')?.remove();

    const el = document.createElement('div');
    el.className = 'boss-unlock-toast';
    el.innerHTML = `
        <div class="boss-toast-label">⚡ Boss låst opp!</div>
        <div class="boss-toast-body">
            <div class="boss-toast-sprite">${boss.image ? `<img src="${boss.image}" style="height:46px;width:auto;">` : ''}</div>
            <div>
                <div class="boss-toast-name">${boss.name}</div>
                <div class="boss-toast-sub">${boss.subtitle}</div>
            </div>
        </div>
        <div class="boss-toast-actions">
            <a href="boss.html?module=${moduleId}" class="boss-toast-fight">⚔️ Til kamp!</a>
            <button class="boss-toast-dismiss" onclick="this.closest('.boss-unlock-toast').remove()">Lukk</button>
        </div>`;

    document.body.appendChild(el);
    setTimeout(() => el?.remove(), 12000);
}

function _injectBossToastStyles() {
    if (document.getElementById('_bossToastStyles')) return;
    const s = document.createElement('style');
    s.id = '_bossToastStyles';
    s.textContent = `
        .boss-unlock-toast {
            position: fixed; bottom: 30px; right: 30px; z-index: 1000;
            background: linear-gradient(135deg, #1a2a3a 0%, #0d1b2a 100%);
            border: 2px solid #ffc107; border-radius: 16px;
            padding: 20px 22px; max-width: 310px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 0 40px rgba(255,193,7,0.18);
            animation: bossToastIn 0.55s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            font-family: 'Segoe UI', sans-serif;
        }
        @keyframes bossToastIn {
            from { transform: translateX(130%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }
        .boss-toast-label {
            color: #ffc107; font-size: 0.72em; font-weight: 800;
            text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 12px;
        }
        .boss-toast-body {
            display: flex; align-items: center; gap: 14px; margin-bottom: 16px;
        }
        .boss-toast-sprite { font-size: 2.8em; line-height: 1; }
        .boss-toast-name   { color: white; font-weight: 800; font-size: 1.05em; margin-bottom: 2px; }
        .boss-toast-sub    { color: #aaa; font-size: 0.78em; line-height: 1.4; }
        .boss-toast-actions { display: flex; gap: 8px; }
        .boss-toast-fight {
            flex: 1; padding: 9px 14px;
            background: linear-gradient(135deg, #b8860b, #ffc107);
            color: #1a1a1a; border-radius: 8px; font-weight: 800;
            font-size: 0.88em; text-decoration: none; text-align: center;
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .boss-toast-fight:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(255,193,7,0.35); }
        .boss-toast-dismiss {
            padding: 9px 14px; background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15); color: #ccc;
            border-radius: 8px; font-size: 0.88em; font-weight: 600;
            cursor: pointer; transition: background 0.15s;
        }
        .boss-toast-dismiss:hover { background: rgba(255,255,255,0.15); color: white; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// Helpers
// ============================================================

function _allChecked(checkboxes) {
    return Array.from(checkboxes).every(cb => cb.checked);
}

function _updateCompletionBtn(checkboxes, btn) {
    if (!btn) return;
    btn.disabled = !_allChecked(checkboxes);
}
