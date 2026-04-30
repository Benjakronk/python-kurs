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

    _joltBoss() {
        const img = this.bossSpriteEl.querySelector('img');
        if (!img) return;
        img.classList.remove('boss-img-jolt');
        void img.offsetWidth; // restart animation
        img.classList.add('boss-img-jolt');
        setTimeout(() => img.classList.remove('boss-img-jolt'), 500);
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
        this._resetTimer();
        this._playHitParticle(() => {
            this._updateHpBars();
            this._playHitAnimation();
            this._shake(this.playerEl, 'shake-light');
            if (this.playerHp <= 0) this._defeat();
        });
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
            this._playAttackAnimation();
            setTimeout(() => this._playSlashEffect(), 180);
            this.resultEl.textContent = '✅ Riktig! Bossens HP synker!';
            this.resultEl.className   = 'boss-result correct';
            this._log(`⚔️ Du traff! Bossen tar ${BOSS_DAMAGE_CORRECT} skade!`, 'log-success');
            this._shake(this.bossSpriteEl, 'shake');
            setTimeout(() => this._joltBoss(), 315);
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
            this._playHitParticle(() => {
                if (!this._running) return;
                this._updateHpBars();
                this._playHitAnimation();
                this._shake(this.playerEl, 'shake-light');
                if (this.playerHp <= 0) setTimeout(() => this._defeat(), 400);
            });

            let feedback = `❌ Ikke helt riktig. `;
            if (result.output) feedback += `Output: "${result.output}"`;
            this.resultEl.textContent = feedback;
            this.resultEl.className   = 'boss-result wrong';

            if (this.wrongCount >= 2) {
                this.hintText.style.display = 'block';
                this.hintText.textContent   = '💡 Hint: ' + ch.hint;
            }

            this._resetTimer();
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

    _playSlashEffect() {
        const rect = this.bossSpriteEl.getBoundingClientRect();
        const cx  = rect.left + rect.width  / 2;
        const cy  = rect.top  + rect.height / 2;
        const len = Math.max(rect.width, rect.height) * 1.15;

        const slashes = [
            { angle: -50, delay:  0, color: '#ffffff' },
            { angle: -35, delay: 55, color: '#ffc107' },
            { angle: -60, delay: 28, color: '#ffffffbb' },
        ];

        slashes.forEach(({ angle, delay, color }) => {
            setTimeout(() => {
                const rad    = angle * Math.PI / 180;
                const startX = cx - Math.cos(rad) * len * 0.5;
                const startY = cy - Math.sin(rad) * len * 0.5;

                const el = document.createElement('div');
                el.style.cssText = `
                    position:fixed; z-index:9999; pointer-events:none;
                    left:${startX}px; top:${startY}px;
                    width:${len}px; height:3px; border-radius:2px;
                    background:linear-gradient(90deg,transparent,${color} 30%,${color} 70%,transparent);
                    box-shadow:0 0 8px ${color},0 0 16px ${color}88;
                    transform-origin:left center;
                    transform:rotate(${angle}deg) scaleX(0); opacity:1;
                `;
                document.body.appendChild(el);

                const duration = 270;
                const t0 = performance.now();
                const tick = now => {
                    const t = Math.min((now - t0) / duration, 1);
                    el.style.transform = `rotate(${angle}deg) scaleX(${Math.min(t / 0.4, 1)})`;
                    el.style.opacity   = t < 0.45 ? '1' : String(1 - (t - 0.45) / 0.55);
                    t < 1 ? requestAnimationFrame(tick) : el.remove();
                };
                requestAnimationFrame(tick);
            }, delay);
        });
    }

    _playHitParticle(onImpact) {
        const attacks = [
            this._attackGhost,
            this._attackVampire,
            this._attackLeviathan,
            this._attackPharaoh,
            this._attackDragon,
            this._attackPhoenix,
        ];
        (attacks[this.moduleId] || this._attackGhost).call(this, onImpact);
    }

    _combatantPositions() {
        const b = this.bossSpriteEl.getBoundingClientRect();
        const p = this.playerEl.getBoundingClientRect();
        return {
            bossX:   b.left + b.width  / 2,
            bossY:   b.top  + b.height / 2,
            playerX: p.left + p.width  / 2,
            playerY: p.top  + p.height / 2,
        };
    }

    // Ghost — flickering orb that phases in and out as it drifts toward the player
    _attackGhost(onImpact) {
        const { bossX, bossY, playerX, playerY } = this._combatantPositions();
        const duration = 700;

        const orb = document.createElement('div');
        orb.style.cssText = `
            position:fixed;z-index:9999;pointer-events:none;
            left:${bossX}px;top:${bossY}px;
            width:26px;height:26px;border-radius:50%;
            background:radial-gradient(circle at 35% 35%,#e8f0ff,#7799cc);
            box-shadow:0 0 14px #aabbff,0 0 30px #aabbff55;
            transform:translate(-50%,-50%);
            transition:left ${duration}ms ease-in,top ${duration}ms ease-in;
        `;
        document.body.appendChild(orb);

        const flicker = setInterval(() => {
            orb.style.opacity = Math.random() > 0.35 ? '1' : String(0.05 + Math.random() * 0.3);
        }, 70);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            orb.style.left = playerX + 'px';
            orb.style.top  = playerY + 'px';
        }));

        setTimeout(() => {
            clearInterval(flicker);
            orb.style.opacity    = '1';
            orb.style.transition = 'transform 0.18s ease-out,opacity 0.18s ease-out';
            orb.style.transform  = 'translate(-50%,-50%) scale(3.5)';
            orb.style.opacity    = '0';
            setTimeout(() => orb.remove(), 220);
            onImpact();
        }, duration);
    }

    // Vampire — blood particles drain outward from the player and get sucked to the boss
    _attackVampire(onImpact) {
        const { bossX, bossY, playerX, playerY } = this._combatantPositions();
        const count     = 10;
        const travelMs  = 650;

        setTimeout(onImpact, 80);

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const angle  = Math.random() * Math.PI * 2;
                const radius = 20 + Math.random() * 55;
                const sx     = playerX + Math.cos(angle) * radius;
                const sy     = playerY + Math.sin(angle) * radius;
                const size   = 5 + Math.random() * 9;

                const p = document.createElement('div');
                p.style.cssText = `
                    position:fixed;z-index:9999;pointer-events:none;
                    left:${sx}px;top:${sy}px;
                    width:${size}px;height:${size}px;border-radius:50%;
                    background:radial-gradient(circle at 35% 35%,#ff9999,#660000);
                    box-shadow:0 0 8px #cc0000;
                    transform:translate(-50%,-50%);
                    transition:left ${travelMs}ms cubic-bezier(0.6,0,1,1),
                               top ${travelMs}ms cubic-bezier(0.6,0,1,1),
                               width ${travelMs}ms ease-in,
                               height ${travelMs}ms ease-in,
                               opacity ${travelMs}ms ease-in;
                `;
                document.body.appendChild(p);

                requestAnimationFrame(() => requestAnimationFrame(() => {
                    p.style.left    = bossX + 'px';
                    p.style.top     = bossY + 'px';
                    p.style.width   = '3px';
                    p.style.height  = '3px';
                    p.style.opacity = '0';
                }));

                setTimeout(() => p.remove(), travelMs + 60);
            }, i * 45);
        }
    }

    // Leviathan — orbs orbit the player in a tightening spiral, then all hit at once
    _attackLeviathan(onImpact) {
        const { playerX, playerY } = this._combatantPositions();
        const orbCount  = 4;
        const orbitMs   = 1400;
        const convergeMs = 240;
        const start     = performance.now();

        const orbs = Array.from({ length: orbCount }, (_, i) => {
            const el = document.createElement('div');
            el.style.cssText = `
                position:fixed;z-index:9999;pointer-events:none;
                width:14px;height:14px;border-radius:50%;
                background:radial-gradient(circle at 35% 35%,#88ffff,#0033cc);
                box-shadow:0 0 10px #00aaff,0 0 20px #00aaff55;
                transform:translate(-50%,-50%);
            `;
            document.body.appendChild(el);
            return { el, phase: (i / orbCount) * Math.PI * 2 };
        });

        const tick = now => {
            const t      = Math.min((now - start) / orbitMs, 1);
            const radius = 80 * (1 - t * 0.88);
            const speed  = 2 + t * 5;
            const angle  = (now / 300) * speed;

            for (const o of orbs) {
                const a  = angle + o.phase;
                o.el.style.left = (playerX + Math.cos(a) * radius) + 'px';
                o.el.style.top  = (playerY + Math.sin(a) * radius) + 'px';
            }

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                for (const o of orbs) {
                    o.el.style.transition = `left ${convergeMs}ms ease-in,top ${convergeMs}ms ease-in`;
                    o.el.style.left = playerX + 'px';
                    o.el.style.top  = playerY + 'px';
                }
                setTimeout(() => {
                    onImpact();
                    for (const o of orbs) {
                        o.el.style.transition = 'transform 0.18s ease-out,opacity 0.18s ease-out';
                        o.el.style.transform  = 'translate(-50%,-50%) scale(3)';
                        o.el.style.opacity    = '0';
                        setTimeout(() => o.el.remove(), 220);
                    }
                }, convergeMs);
            }
        };
        requestAnimationFrame(tick);
    }

    // Pharaoh — a slow golden beam sweeps from the boss across to the player
    _attackPharaoh(onImpact) {
        const { bossX, bossY, playerX, playerY } = this._combatantPositions();
        const dx    = playerX - bossX;
        const dy    = playerY - bossY;
        const dist  = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const beam = document.createElement('div');
        beam.style.cssText = `
            position:fixed;z-index:9999;pointer-events:none;
            left:${bossX}px;top:${bossY}px;
            width:${dist}px;height:8px;border-radius:4px;
            background:linear-gradient(90deg,transparent,#ffcc00 15%,#fff8a0 55%,transparent);
            box-shadow:0 0 14px #ffcc00,0 0 30px #ffcc0055;
            transform-origin:left center;
            transform:translate(0,-50%) rotate(${angle}deg) scaleX(0);
            transition:transform 0.5s cubic-bezier(0.2,0,0.4,1);
        `;
        document.body.appendChild(beam);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            beam.style.transform = `translate(0,-50%) rotate(${angle}deg) scaleX(1)`;
        }));

        setTimeout(() => {
            onImpact();
            beam.style.transition = 'opacity 0.35s ease-out';
            beam.style.opacity    = '0';
            setTimeout(() => beam.remove(), 400);
        }, 600);
    }

    // Dragon — a spray of ink blobs arc from the boss and splatter on the player
    _attackDragon(onImpact) {
        const { bossX, bossY, playerX, playerY } = this._combatantPositions();
        const count    = 5;
        let   impacted = false;

        for (let i = 0; i < count; i++) {
            const delay    = i * 90;
            const wobX     = (Math.random() - 0.5) * 80;
            const wobY     = (Math.random() - 0.5) * 60;
            const size     = 10 + Math.random() * 14;
            const rx1      = 40 + Math.random() * 30;
            const rx2      = 30 + Math.random() * 40;
            const travelMs = 480 + i * 40;

            setTimeout(() => {
                const blob = document.createElement('div');
                blob.style.cssText = `
                    position:fixed;z-index:9999;pointer-events:none;
                    left:${bossX}px;top:${bossY}px;
                    width:${size}px;height:${size * (0.7 + Math.random() * 0.6)}px;
                    border-radius:${rx1}% ${100 - rx1}% ${rx2}% ${100 - rx2}%;
                    background:radial-gradient(circle at 30% 30%,#cc66ff,#330055);
                    box-shadow:0 0 8px #aa00cc;
                    transform:translate(-50%,-50%);
                    transition:left ${travelMs}ms cubic-bezier(0.25,0.46,0.45,0.94),
                               top ${travelMs}ms cubic-bezier(0.25,0.46,0.45,0.94);
                `;
                document.body.appendChild(blob);

                requestAnimationFrame(() => requestAnimationFrame(() => {
                    blob.style.left = (playerX + wobX * (1 - i / count)) + 'px';
                    blob.style.top  = (playerY + wobY * (1 - i / count)) + 'px';
                }));

                setTimeout(() => {
                    blob.style.transition = 'transform 0.18s ease-out,opacity 0.2s';
                    blob.style.transform  = `translate(-50%,-50%) scale(${1.8 + Math.random()})`;
                    blob.style.opacity    = '0';
                    setTimeout(() => blob.remove(), 250);
                    if (!impacted) { impacted = true; onImpact(); }
                }, travelMs);
            }, delay);
        }
    }

    // Phoenix — a fast fireball with a lingering ember trail
    _attackPhoenix(onImpact) {
        const { bossX, bossY, playerX, playerY } = this._combatantPositions();
        const duration = 260;
        const start    = performance.now();

        const orb = document.createElement('div');
        orb.style.cssText = `
            position:fixed;z-index:9999;pointer-events:none;
            width:24px;height:24px;border-radius:50%;
            background:radial-gradient(circle at 35% 35%,#ffee44,#cc2200);
            box-shadow:0 0 18px #ff6600,0 0 36px #ff660055;
            transform:translate(-50%,-50%);
        `;
        document.body.appendChild(orb);

        const spawnEmber = (x, y) => {
            const e    = document.createElement('div');
            const size = 3 + Math.random() * 5;
            e.style.cssText = `
                position:fixed;z-index:9998;pointer-events:none;
                left:${x}px;top:${y}px;
                width:${size}px;height:${size}px;border-radius:50%;
                background:radial-gradient(circle,#ffaa00,#ff3300);
                box-shadow:0 0 6px #ff6600;
                transform:translate(-50%,-50%);opacity:1;
            `;
            document.body.appendChild(e);
            let ex = x, ey = y, op = 1;
            const vx = (Math.random() - 0.5) * 3;
            const vy = -0.5 - Math.random() * 2;
            const fade = () => {
                ex += vx; ey += vy; op -= 0.05;
                e.style.left    = ex + 'px';
                e.style.top     = ey + 'px';
                e.style.opacity = String(Math.max(0, op));
                op > 0 ? requestAnimationFrame(fade) : e.remove();
            };
            requestAnimationFrame(fade);
        };

        const tick = now => {
            const t = Math.min((now - start) / duration, 1);
            const x = bossX + (playerX - bossX) * t;
            const y = bossY + (playerY - bossY) * t;
            orb.style.left = x + 'px';
            orb.style.top  = y + 'px';
            if (Math.random() > 0.25) spawnEmber(x, y);

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                orb.style.transition = 'transform 0.18s ease-out,opacity 0.18s ease-out';
                orb.style.transform  = 'translate(-50%,-50%) scale(4)';
                orb.style.opacity    = '0';
                setTimeout(() => orb.remove(), 220);
                onImpact();
            }
        };
        requestAnimationFrame(tick);
    }

    _playHitAnimation() {
        this._stopPlayerAnimation();
        const frames = [
            'images/hit1.png',
            'images/hit2.png',
            'images/hit3.png',
            'images/hit4.png',
            'images/hit5.png',
            'images/hit6.png',
        ];
        const img = this.playerEl?.querySelector('img');
        if (!img) { this._startPlayerAnimation(); return; }
        let frame = 0;
        const advance = () => {
            img.src = frames[frame++];
            if (frame < frames.length) {
                setTimeout(advance, 70);
            } else {
                this._startPlayerAnimation();
            }
        };
        advance();
    }

    _playAttackAnimation() {
        this._stopPlayerAnimation();
        const frames = [
            'images/attack1.png',
            'images/attack2.png',
            'images/attack3.png',
            'images/attack4.png',
            'images/attack5.png',
        ];
        const img = this.playerEl?.querySelector('img');
        if (!img) { this._startPlayerAnimation(); return; }
        let frame = 0;
        const advance = () => {
            img.src = frames[frame++];
            if (frame < frames.length) {
                setTimeout(advance, 80);
            } else {
                this._startPlayerAnimation();
            }
        };
        advance();
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

    _launchConfetti(originEl) {
        const rect   = originEl.getBoundingClientRect();
        const cx     = rect.left + rect.width  / 2;
        const cy     = rect.top  + rect.height / 2;
        const colors = ['#ffc107','#ff6b6b','#51cf66','#74c0fc','#f06595','#a9e34b','#ffffff'];
        const particles = [];

        for (let i = 0; i < 90; i++) {
            const el    = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size  = 6 + Math.random() * 7;
            const rect_ = Math.random() > 0.45;
            el.style.cssText = `
                position:fixed; z-index:10000; pointer-events:none;
                left:${cx}px; top:${cy}px;
                width:${size}px; height:${rect_ ? size * 0.45 : size}px;
                background:${color}; border-radius:${rect_ ? '1px' : '50%'};
            `;
            document.body.appendChild(el);

            const angle = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 9;
            particles.push({
                el, x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 7,
                gravity: 0.28,
                rot: Math.random() * 360,
                rotV: (Math.random() - 0.5) * 14,
                opacity: 1,
            });
        }

        const tick = () => {
            let alive = false;
            for (const p of particles) {
                if (p.opacity <= 0) continue;
                p.x  += p.vx;
                p.y  += p.vy;
                p.vy += p.gravity;
                p.rot    += p.rotV;
                p.opacity -= 0.011;
                const o = Math.max(0, p.opacity);
                p.el.style.left      = p.x + 'px';
                p.el.style.top       = p.y + 'px';
                p.el.style.opacity   = o;
                p.el.style.transform = `translate(-50%,-50%) rotate(${p.rot}deg)`;
                if (o > 0) alive = true; else p.el.remove();
            }
            if (alive) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
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
                <div class="end-icon" id="victoryTrophy">🏆</div>
                <h2>Boss beseiret!</h2>
                <p><strong>${this.data.name}</strong> er nedkjempet!</p>
                <p>Du fullførte alle utfordringene. Imponerende!</p>
                ${!loggedIn ? `<p style="color:#ffc107;font-size:0.9em;">⚠️ Logg inn for å lagre seieren din!</p>` : ''}
                <a href="index.html" class="end-btn">← Tilbake til kursoversikten</a>
            </div>`);

        requestAnimationFrame(() => {
            const trophy = document.getElementById('victoryTrophy');
            if (trophy) this._launchConfetti(trophy);
        });
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
