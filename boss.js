// boss.js — Boss fight engine
// Requires: Skulpt (CDN), boss-data.js, modal.js, config.js, auth.js

const BOSS_PLAYER_HP      = 100;
const BOSS_DAMAGE_CORRECT = 80;   // HP removed from boss per correct answer
const PLAYER_DAMAGE_WRONG = 25;   // HP removed from player per wrong answer
const TIMER_ATTACK_HP     = 20;   // HP removed from player per timer attack
const TIMER_INTERVAL_MS   = 45000;// ms between timer attacks

class BossFight {
    constructor(moduleId) {
        this.moduleId   = moduleId;
        this.data       = BOSS_DATA[moduleId];
        this.challenges = this.data.challenges;

        this.bossHp     = this.data.bossHp;
        this.bossMaxHp  = this.data.bossHp;
        this.playerHp   = BOSS_PLAYER_HP;

        this.currentIdx = 0;
        this.wrongCount = 0;  // wrong attempts on current challenge
        this._timer     = null;
        this._running   = false;

        this._bindElements();
        this._start();
    }

    // ------------------------------------------------------------------
    // DOM helpers
    // ------------------------------------------------------------------

    _bindElements() {
        this.bossHpBar    = document.getElementById('bossHpBar');
        this.bossHpText   = document.getElementById('bossHpText');
        this.playerHpBar  = document.getElementById('playerHpBar');
        this.playerHpText = document.getElementById('playerHpText');
        this.bossSpriteEl = document.getElementById('bossSprite');
        this.playerEl     = document.getElementById('playerSprite');
        this.challengeNum = document.getElementById('challengeNum');
        this.challengeTitle= document.getElementById('challengeTitle');
        this.challengeDesc= document.getElementById('challengeDesc');
        this.editor       = document.getElementById('bossEditor');
        this.submitBtn    = document.getElementById('bossSubmit');
        this.hintBtn      = document.getElementById('bossHintBtn');
        this.hintText     = document.getElementById('bossHint');
        this.resultEl     = document.getElementById('bossResult');
        this.logEl        = document.getElementById('battleLog');
        this.timerBar     = document.getElementById('timerBar');
        this.timerFill    = document.getElementById('timerFill');
        this.screenOverlay= document.getElementById('bossScreenOverlay');
    }

    _updateHpBars() {
        const bossPct   = Math.max(0, this.bossHp   / this.bossMaxHp * 100);
        const playerPct = Math.max(0, this.playerHp / BOSS_PLAYER_HP * 100);

        this.bossHpBar.style.width   = bossPct   + '%';
        this.playerHpBar.style.width = playerPct + '%';
        this.bossHpText.textContent  = Math.max(0, this.bossHp);
        this.playerHpText.textContent= Math.max(0, this.playerHp);

        this.bossHpBar.className   = 'hp-fill boss-hp-fill'   + (bossPct   < 25 ? ' critical' : '');
        this.playerHpBar.className = 'hp-fill player-hp-fill' + (playerPct < 25 ? ' critical' : '');
    }

    _log(msg, cls = '') {
        const p = document.createElement('p');
        p.className = cls;
        p.textContent = msg;
        this.logEl.prepend(p);
        // Keep log tidy
        while (this.logEl.children.length > 8) this.logEl.removeChild(this.logEl.lastChild);
    }

    _shake(el, cls) {
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 500);
    }

    _loadChallenge(idx) {
        const ch = this.challenges[idx];
        this.wrongCount = 0;
        this.hintText.style.display = 'none';
        this.resultEl.textContent   = '';
        this.resultEl.className     = 'boss-result';

        this.challengeNum.textContent   = `Utfordring ${idx + 1} av ${this.challenges.length}`;
        this.challengeTitle.textContent = ch.title;
        this.challengeDesc.innerHTML    = ch.desc;
        this.editor.value               = ch.starter || '';
        this.editor.focus();

        this._resetTimer();
    }

    // ------------------------------------------------------------------
    // Timer attack
    // ------------------------------------------------------------------

    _resetTimer() {
        clearInterval(this._timer);
        if (this.timerFill) {
            this.timerFill.style.transition = 'none';
            this.timerFill.style.width = '100%';
            setTimeout(() => {
                this.timerFill.style.transition = `width ${TIMER_INTERVAL_MS}ms linear`;
                this.timerFill.style.width = '0%';
            }, 50);
        }
        this._timer = setInterval(() => this._timerAttack(), TIMER_INTERVAL_MS);
    }

    _timerAttack() {
        if (!this._running) return;
        const msgs = this.data.timerMessages;
        const msg  = msgs[Math.floor(Math.random() * msgs.length)].replace('{n}', TIMER_ATTACK_HP);
        this.playerHp -= TIMER_ATTACK_HP;
        this._playAttack();
        this._log(msg, 'log-danger');
        this._shake(this.playerEl, 'shake');
        this._updateHpBars();
        this._resetTimer();
        if (this.playerHp <= 0) this._defeat();
    }

    // ------------------------------------------------------------------
    // Code checking via Skulpt
    // ------------------------------------------------------------------

    async _checkCode(code, expectedOutput) {
        if (typeof Sk === 'undefined') return { ok: false, output: '[Skulpt ikke lastet]' };

        return new Promise(resolve => {
            let output = '';
            Sk.configure({
                output: t => { output += t; },
                inputfun: () => Promise.resolve(''),
                inputfunTakesPrompt: true,
                __future__: Sk.python3,
                execLimit: 8000,
            });
            Sk.misceval.asyncToPromise(() =>
                Sk.importMainWithBody('<stdin>', false, code, true)
            ).then(() => {
                const actual   = output.trim().replace(/\r\n/g, '\n');
                const expected = expectedOutput.trim().replace(/\r\n/g, '\n');
                resolve({ ok: actual === expected, output: actual });
            }).catch(err => {
                resolve({ ok: false, output: err.toString() });
            });
        });
    }

    // ------------------------------------------------------------------
    // Main submit handler
    // ------------------------------------------------------------------

    async submit() {
        if (!this._running) return;
        this.submitBtn.disabled = true;
        this.resultEl.textContent = '⏳ Sjekker…';
        this.resultEl.className   = 'boss-result';

        const ch    = this.challenges[this.currentIdx];
        const code  = this.editor.value;
        const result= await this._checkCode(code, ch.expectedOutput);

        this.submitBtn.disabled = false;

        if (result.ok) {
            // Correct!
            this.bossHp -= BOSS_DAMAGE_CORRECT;
            this._playAttack();
            this.resultEl.textContent = '✅ Riktig! Bossens HP synker!';
            this.resultEl.className   = 'boss-result correct';
            this._log(`⚔️ Du traff! Bossen tar ${BOSS_DAMAGE_CORRECT} skade!`, 'log-success');
            this._shake(this.bossSpriteEl, 'shake');
            this._updateHpBars();

            if (this.bossHp <= 0) {
                setTimeout(() => this._victory(), 700);
            } else {
                this.currentIdx++;
                if (this.currentIdx < this.challenges.length) {
                    setTimeout(() => this._loadChallenge(this.currentIdx), 1200);
                } else {
                    setTimeout(() => this._victory(), 700);
                }
            }
        } else {
            // Wrong
            this.wrongCount++;
            this.playerHp -= PLAYER_DAMAGE_WRONG;
            const msgs = this.data.attackMessages;
            const msg  = msgs[Math.floor(Math.random() * msgs.length)].replace('{n}', PLAYER_DAMAGE_WRONG);
            this._playAttack();
            this._log(msg, 'log-danger');
            this._shake(this.playerEl, 'shake');
            this._updateHpBars();

            let feedback = `❌ Ikke helt riktig. `;
            if (result.output) feedback += `Output: "${result.output}"`;
            this.resultEl.textContent = feedback;
            this.resultEl.className   = 'boss-result wrong';

            if (this.wrongCount >= 2) {
                this.hintText.style.display = 'block';
                this.hintText.textContent   = '💡 Hint: ' + ch.hint;
            }

            this._resetTimer();
            if (this.playerHp <= 0) setTimeout(() => this._defeat(), 600);
        }
    }

    // ------------------------------------------------------------------
    // Start / Victory / Defeat
    // ------------------------------------------------------------------

    _soundSettings() {
        return {
            musicOn:  localStorage.getItem('sound_music_enabled') !== 'false',
            sfxOn:    localStorage.getItem('sound_sfx_enabled')   !== 'false',
            musicVol: (parseInt(localStorage.getItem('sound_music_vol') ?? '100')) / 100,
            sfxVol:   (parseInt(localStorage.getItem('sound_sfx_vol')   ?? '100')) / 100,
        };
    }

    _playMusic() {
        const { musicOn, musicVol } = this._soundSettings();
        if (!musicOn) return;
        const id  = this.moduleId === 5 ? 'bossFinalBgm' : 'bossBgm';
        const bgm = document.getElementById(id);
        if (bgm) { bgm.volume = musicVol; bgm.play().catch(() => {}); }
    }

    _stopMusic() {
        ['bossBgm', 'bossFinalBgm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.pause(); el.currentTime = 0; }
        });
    }

    _playAttack() {
        const { sfxOn, sfxVol } = this._soundSettings();
        if (!sfxOn) return;
        const id  = Math.random() < 0.5 ? 'bossAttack1' : 'bossAttack2';
        const sfx = document.getElementById(id);
        if (sfx) { sfx.volume = sfxVol; sfx.currentTime = 0; sfx.play().catch(() => {}); }
    }

    _playExplosion() {
        const { sfxOn, sfxVol } = this._soundSettings();
        if (!sfxOn) return;
        const sfx = document.getElementById('bossExplosion');
        if (sfx) { sfx.volume = sfxVol; sfx.currentTime = 0; sfx.play().catch(() => {}); }
    }

    _startPlayerAnimation() {
        const frames = [
            'images/programmer1.png',
            'images/programmer2.png',
            'images/programmer3.png',
            'images/programmer4.png',
        ];
        let frame = 0;
        this._playerAnimTimer = setInterval(() => {
            const img = this.playerEl?.querySelector('img');
            if (img) { frame = (frame + 1) % frames.length; img.src = frames[frame]; }
        }, 180);
    }

    _stopPlayerAnimation() {
        clearInterval(this._playerAnimTimer);
        this._playerAnimTimer = null;
    }

    _start() {
        this._running = true;
        this._playMusic();
        this._startPlayerAnimation();
        if (this.data.image) {
            this.bossSpriteEl.innerHTML = `<img src="${this.data.image}" style="height:300px;width:auto;display:block;margin:0 auto;">`;
        } else {
            this.bossSpriteEl.textContent = this.data.sprite;
        }
        document.getElementById('bossName').textContent = this.data.name;
        document.getElementById('bossSubtitle').textContent = this.data.subtitle;
        this._updateHpBars();
        this._loadChallenge(0);

        this.submitBtn.addEventListener('click', () => this.submit());
        this.hintBtn.addEventListener('click', () => {
            this.hintText.style.display = 'block';
            this.hintText.textContent = '💡 Hint: ' + this.challenges[this.currentIdx].hint;
        });
        this.editor.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = this.editor.selectionStart;
                this.editor.value = this.editor.value.substring(0, s) + '    ' + this.editor.value.substring(s);
                this.editor.selectionStart = this.editor.selectionEnd = s + 4;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this.submit();
        });
    }

    _showScreen(html) {
        this._running = false;
        clearInterval(this._timer);
        this._stopPlayerAnimation();
        this.screenOverlay.innerHTML = html;
        this.screenOverlay.style.display = 'flex';
    }

    _victory() {
        this._stopMusic();
        this._playExplosion();
        const loggedIn = !!(window.courseAuth?.currentUser);
        if (loggedIn) {
            localStorage.setItem(`boss_modul${this.moduleId}_defeated`, 'true');
            if (window.courseAuth) courseAuth.saveProgress();
        }

        this._showScreen(`
            <div class="end-card victory">
                <div class="end-icon">🏆</div>
                <h2>Boss beseiret!</h2>
                <p><strong>${this.data.name}</strong> er nedkjempet!</p>
                <p>Du fullførte alle utfordringene. Imponerende!</p>
                ${!loggedIn ? `<p style="color:#ffc107;font-size:0.9em;">⚠️ Logg inn for å lagre seieren din!</p>` : ''}
                <a href="index.html" class="end-btn">← Tilbake til kursoversikten</a>
            </div>`);
    }

    _defeat() {
        this._stopMusic();
        this._playExplosion();
        this._showScreen(`
            <div class="end-card defeat">
                <div class="end-icon">💀</div>
                <h2>Du tapte!</h2>
                <p><strong>${this.data.name}</strong> vant denne gangen.</p>
                <p>Ikke gi deg — prøv igjen!</p>
                <button class="end-btn" onclick="location.reload()">🔄 Prøv igjen</button>
                <a href="index.html" class="end-btn secondary">← Tilbake</a>
            </div>`);
    }
}

// Bootstrap — called from boss.html after DOM ready
function initBoss(moduleId) {
    window._bossFight = new BossFight(moduleId);
}
