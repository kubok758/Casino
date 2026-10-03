/*
 * Контроллер автомата: ставки, вращение, показ выигрышей, автоигра,
 * бесплатные вращения и рычаг у Lucky 7.
 */
(function (root) {
  'use strict';

  const fmt = new Intl.NumberFormat('ru-RU');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const VIEW = {
    classic: {
      curved: true, stopAngle: 360 / 22, viewAngle: 31, symbolScale: 1.5, fill: 0.9, gap: 0.035, slices: 12,
      speed: 24, accel: 0.16, windup: 0.14, windupAmt: 0.25, decel: 0.5, overshoot: 0.12, stagger: 0.07,
      bg: 'paper', dim: false, minSpin: 950, stopGap: 420, anticipation: 1500,
    },
    jewels: {
      curved: true, stopAngle: 19, viewAngle: 31, symbolScale: 0.92, fill: 0.8, gap: 0.03, slices: 10,
      speed: 15, accel: 0.18, windup: 0.13, windupAmt: 0.2, decel: 0.45, overshoot: 0.1, stagger: 0.06,
      bg: 'velvet', dim: true, minSpin: 850, stopGap: 340, anticipation: 1400,
    },
    cosmic: {
      curved: false, cellAspect: 0.92, fill: 0.92, gap: 0.012,
      speed: 18, accel: 0.15, windup: 0.12, windupAmt: 0.22, decel: 0.36, overshoot: 0.18, stagger: 0.05,
      bg: 'space', dim: true, minSpin: 700, stopGap: 220, anticipation: 1700,
    },
  };

  const IDLE_TEXT = {
    classic: 'Потяните рычаг или нажмите «Крутить»',
    jewels: '5 линий · корона заменяет любой камень',
    cosmic: '10 линий · 3 галактики дают 10 бесплатных вращений',
  };

  function animateNumber(from, to, ms, onFrame, onDone) {
    const t0 = performance.now();
    let raf = 0;
    let done = false;
    const step = (now) => {
      const t = ms <= 0 ? 1 : clamp((now - t0) / ms, 0, 1);
      onFrame(Math.round(from + (to - from) * t));
      if (t < 1) raf = requestAnimationFrame(step);
      else { done = true; if (onDone) onDone(); }
    };
    raf = requestAnimationFrame(step);
    return {
      finish() {
        if (done) return;
        cancelAnimationFrame(raf);
        done = true;
        onFrame(to);
        if (onDone) onDone();
      },
      get done() { return done; },
    };
  }

  class SlotMachine {
    constructor(el, machine, app) {
      this.el = el;
      this.m = machine;
      this.app = app;
      this.kind = machine.id;
      this.opts = VIEW[machine.id];
      this.betIndex = machine.bets.indexOf(machine.defaultBet);
      this.state = 'idle';
      this.auto = false;
      this.fs = null;
      this.rollup = null;
      this.timers = new Set();

      this.$ = (sel) => el.querySelector(sel);
      this.canvas = this.$('.reels-canvas');
      this.windowEl = this.$('.window');
      this.status = this.$('[data-status]');
      this.ledCredit = this.$('[data-credit] .led-val');
      this.ledBet = this.$('[data-bet] .led-val');
      this.ledWin = this.$('[data-win] .led-val');
      this.winLabel = this.$('[data-win] .meter-label');
      this.spinBtn = this.$('[data-act="spin"]');
      this.overlay = this.$('[data-overlay]');
      this.fsBadge = this.$('[data-fs]');

      this.view = new Reels.ReelView(this.canvas, machine, this.opts);
      this.view.setStops(this.initialStops());
      this.view.onReelStop = (i) => this.handleReelStop(i);
      this.view.onAllStopped = () => this.handleAllStopped();
      Reels.register(this.view);

      const ro = new ResizeObserver(() => this.layout());
      ro.observe(this.windowEl);
      this.layout();

      this.bindControls();
      if (this.kind === 'classic') this.setupLever();
      this.setStatus(IDLE_TEXT[this.kind]);
      this.updateMeters();
    }

    // Начальная картинка: на линии стоят символы (не пробелы).
    initialStops() {
      const stops = Engine.randomStops(this.m);
      if (this.m.blank) {
        return stops.map((s, r) => (this.m.strips[r][s] === this.m.blank ? (s + 1) % this.m.strips[r].length : s));
      }
      return stops;
    }

    get lineBet() { return this.m.bets[this.betIndex]; }
    get totalBet() { return this.lineBet * this.m.linesPlayed; }

    layout() {
      const w = this.windowEl.clientWidth;
      if (!w) return;
      this.view.layout(w);
      this.placeBadges();
      Reels.kick();
    }

    /* ---------- Подписи линий по краям окна ---------- */

    placeBadges() {
      const left = this.$('[data-badges="left"]');
      const right = this.$('[data-badges="right"]');
      if (!left || !right) return;
      const build = (box, side) => {
        box.textContent = '';
        const groups = {};
        this.m.lines.forEach((rows, i) => {
          const row = side === 'left' ? rows[0] : rows[rows.length - 1];
          (groups[row] = groups[row] || []).push(i);
        });
        const pitch = this.m.rows > 1 ? Math.abs(this.view.rowY(1) - this.view.rowY(0)) : 40;
        Object.keys(groups).forEach((row) => {
          const y = this.view.rowY(Number(row));
          const ids = groups[row];
          const step = Math.min(17, pitch / (ids.length + 0.25));
          box.style.setProperty('--badge-h', `${Math.min(15, step - 1.5)}px`);
          ids.forEach((li, k) => {
            const b = document.createElement('span');
            b.className = 'badge';
            b.dataset.line = li;
            b.textContent = li + 1;
            b.style.setProperty('--c', Reels.LINE_COLORS[li % Reels.LINE_COLORS.length]);
            const offset = (k - (ids.length - 1) / 2) * step;
            b.style.top = `${y + offset}px`;
            box.appendChild(b);
          });
        });
      };
      build(left, 'left');
      build(right, 'right');
    }

    lightBadges(lines) {
      this.el.querySelectorAll('.badge').forEach((b) => {
        b.classList.toggle('on', lines.includes(Number(b.dataset.line)));
      });
    }

    /* ---------- Управление ---------- */

    bindControls() {
      this.el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.disabled) return;
        Sound.unlock();
        this.app.setActive(this);
        const act = btn.dataset.act;
        if (act !== 'spin') Sound.play('button');
        if (act === 'spin') this.press();
        else if (act === 'bet-up') this.changeBet(1);
        else if (act === 'bet-down') this.changeBet(-1);
        else if (act === 'max') this.maxBet();
        else if (act === 'auto') this.toggleAuto();
        else if (act === 'info') this.app.openPaytable(this);
      });
      this.windowEl.addEventListener('click', () => {
        if (this.state === 'spinning') this.view.slam();
      });
      this.overlay.addEventListener('click', () => this.skipOverlay());
      this.el.addEventListener('pointerdown', () => this.app.setActive(this));
    }

    changeBet(d) {
      if (this.state !== 'idle' || this.fs) return;
      this.betIndex = clamp(this.betIndex + d, 0, this.m.bets.length - 1);
      this.updateMeters();
      this.setStatus(this.betText());
    }

    betText() {
      if (this.m.linesPlayed === 1) return `Ставка ${fmt.format(this.totalBet)}`;
      return `Ставка ${fmt.format(this.lineBet)} × ${this.m.linesPlayed} линий = ${fmt.format(this.totalBet)}`;
    }

    maxBet() {
      if (this.state !== 'idle' || this.fs) return;
      this.betIndex = this.m.bets.length - 1;
      this.updateMeters();
      this.press();
    }

    toggleAuto() {
      this.auto = !this.auto;
      this.updateMeters();
      if (this.auto && this.state === 'idle' && !this.fs) this.press();
    }

    stopAuto() {
      if (!this.auto) return;
      this.auto = false;
      this.updateMeters();
    }

    updateMeters() {
      this.ledBet.textContent = this.totalBet;
      const spinning = this.state === 'spinning';
      const locked = this.state !== 'idle' || !!this.fs;
      const q = (a) => this.$(`[data-act="${a}"]`);
      q('bet-down').disabled = locked || this.betIndex === 0;
      q('bet-up').disabled = locked || this.betIndex === this.m.bets.length - 1;
      q('max').disabled = locked;
      const auto = q('auto');
      auto.setAttribute('aria-pressed', String(this.auto));
      auto.disabled = !!this.fs;
      this.spinBtn.classList.toggle('is-stop', spinning);
      this.spinBtn.querySelector('.spin-label').textContent = spinning ? 'Стоп' : (this.fs ? 'Бонус' : 'Крутить');
      this.spinBtn.disabled = !!this.fs && !spinning;
      this.el.classList.toggle('is-spinning', spinning);
      this.el.classList.toggle('is-auto', this.auto);
    }

    setCredit(v) {
      this.ledCredit.textContent = v;
    }

    setStatus(text, tone) {
      this.status.textContent = text;
      this.status.dataset.tone = tone || '';
    }

    later(fn, ms) {
      const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
      this.timers.add(id);
      return id;
    }

    /* ---------- Вращение ---------- */

    press() {
      Sound.unlock();
      if (this.state === 'spinning') { this.view.slam(); return; }
      if (this.state === 'overlay') { this.skipOverlay(); return; }
      if (this.state === 'rollup') { this.rollup && this.rollup.finish(); return; }
      if (this.fs) return;
      this.spin(false);
    }

    spin(free) {
      if (!free) {
        if (!this.app.wallet.canAfford(this.totalBet)) {
          this.stopAuto();
          this.setStatus('Не хватает кредитов на ставку — уменьшите её или пополните демо-счёт', 'warn');
          this.app.nudgeRefill();
          return;
        }
        this.app.wallet.debit(this.totalBet);
      }
      this.app.stats.spin(free ? 0 : this.totalBet);
      this.view.clearWin();
      this.lightBadges([]);
      this.el.classList.remove('is-win');
      if (!this.fs) this.ledWin.textContent = 0;
      this.outcome = Engine.spin(this.m, this.lineBet);
      this.outcome.free = free;
      const plan = this.plan(this.outcome);
      this.view.spin(plan);
      Reels.kick();
      this.state = 'spinning';
      this.scattersSeen = 0;
      this.spinSound = Sound.spinLoop(this.kind);
      this.antSound = null;
      this.updateMeters();
      this.setStatus(free ? `Бесплатное вращение ${this.fs.total - this.fs.left} из ${this.fs.total}` : 'Удачи!');
    }

    plan(outcome) {
      const o = this.opts;
      const g = outcome.grid;
      const ant = [];
      if (this.kind === 'classic') {
        if (g[0][0] === g[1][0] && (g[0][0] === 'SEVEN' || g[0][0] === 'BAR')) ant.push(2);
      } else if (this.kind === 'jewels') {
        const hot = this.m.lines.some((rows) => {
          const a = g[0][rows[0]];
          const b = g[1][rows[1]];
          return (a === 'CROWN' || a === 'DIAMOND') && (b === a || b === 'CROWN');
        });
        if (hot) ant.push(2);
      } else if (this.kind === 'cosmic') {
        const has = (r) => g[r].includes('GALAXY');
        if (has(0) && has(2)) ant.push(4);
      }
      const base = reduced ? 350 : o.minSpin;
      const gap = reduced ? 120 : o.stopGap;
      let extra = 0;
      const stopAt = outcome.stops.map((_, i) => {
        if (ant.includes(i) && !reduced) extra += o.anticipation;
        return base + i * gap + extra;
      });
      this.antReels = ant;
      return { targets: outcome.stops, stopAt, anticipation: reduced ? [] : ant };
    }

    handleReelStop(i) {
      Sound.play('reelStop', this.kind);
      if (this.m.scatter && this.outcome.grid[i].includes(this.m.scatter)) {
        Sound.play('scatter', this.scattersSeen);
        this.scattersSeen++;
      }
      if (this.antSound) { this.antSound.stop(); this.antSound = null; }
      const next = i + 1;
      if (this.antReels.includes(next) && this.view.anticipation.has(next)) {
        this.antSound = Sound.anticipation(this.opts.anticipation / 1000 + 0.4);
        this.setStatus('Ещё один…', 'hot');
      }
      if (i === this.m.reels - 1 && this.spinSound) { this.spinSound.stop(); this.spinSound = null; }
    }

    handleAllStopped() {
      if (this.spinSound) { this.spinSound.stop(); this.spinSound = null; }
      if (this.antSound) { this.antSound.stop(); this.antSound = null; }
      this.present(this.outcome);
    }

    /* ---------- Выигрыш ---------- */

    tier(win) {
      const ratio = win / this.totalBet;
      if (this.kind === 'classic' && this.outcome.result.lines[0] && this.outcome.result.lines[0].symbol === 'SEVEN' && this.outcome.result.lines[0].count === 3) {
        return { level: 4, label: 'Джекпот' };
      }
      if (ratio >= 100) return { level: 3, label: 'Мега-выигрыш' };
      if (ratio >= 40) return { level: 2, label: 'Огромный выигрыш' };
      if (ratio >= 15) return { level: 1, label: 'Крупный выигрыш' };
      return { level: 0, label: '' };
    }

    present(outcome) {
      const res = outcome.result;
      let win = res.total;
      if (outcome.free && this.fs) {
        const scat = res.scatter ? res.scatter.pay : 0;
        win = (res.total - scat) * this.fs.mult + scat;
      }
      this.lastWin = win;
      const triggered = res.freeSpins > 0;

      if (win > 0) {
        const ratio = win / this.totalBet;
        const tier = this.tier(win);
        this.app.stats.win(win);
        const ms = tier.level ? 3800 + tier.level * 700 : clamp(450 + ratio * 110, 700, 3200);
        const prevWin = this.fs ? this.fs.won : 0;
        if (this.fs) this.fs.won += win;
        this.app.wallet.credit(win, ms);
        this.view.showWin(res, { onLine: (line) => this.describeLine(line, win) });
        this.lightBadges(res.lines.map((l) => l.line));
        this.el.classList.add('is-win');
        this.state = 'rollup';
        this.updateMeters();

        let bell = null;
        if (this.kind === 'classic') bell = Sound.bell(ms / 1000);
        else if (!tier.level) Sound.play('win', ratio >= 5 ? 2 : 1);
        let lastTick = 0;
        this.rollup = animateNumber(prevWin, prevWin + win, ms, (v) => {
          this.ledWin.textContent = v;
          const now = performance.now();
          if (!bell && !tier.level && now - lastTick > 70) { lastTick = now; Sound.play('tick'); }
        }, () => {
          if (bell) bell.stop();
          this.rollup = null;
          if (this.state === 'rollup') this.afterPresent(triggered);
        });

        const origin = this.coinOrigin();
        if (ratio >= 3) {
          FX.burst(origin.x, origin.y, clamp(Math.round(ratio * 3), 10, 160));
          const n = Math.min(10, Math.round(ratio / 3));
          for (let k = 0; k < n; k++) this.later(() => Sound.play('coin'), 120 + k * 110);
        }
        if (tier.level) this.showBigWin(tier, win, ms);
        this.setStatus(`Выигрыш ${fmt.format(win)}`, 'win');
        this.app.announce(`${this.m.name}: выигрыш ${fmt.format(win)} кредитов`);
      } else {
        this.setStatus(outcome.free ? 'Без выигрыша' : 'Без выигрыша — ещё попытка?');
        this.afterPresent(triggered);
      }
    }

    describeLine(line, total) {
      if (!line) {
        if (this.state !== 'spinning') this.setStatus(`Выигрыш ${fmt.format(total)}`, 'win');
        return;
      }
      const info = line.info;
      if (line.scatter) {
        this.setStatus(`${info.count} × ${this.m.symbols[this.m.scatter]} · ${fmt.format(info.pay)}`, 'win');
        return;
      }
      const name = this.m.symbols[info.symbol] || info.symbol;
      const mult = this.fs ? this.fs.mult : 1;
      const lineName = this.m.linesPlayed > 1 ? `Линия ${info.line + 1} · ` : '';
      this.setStatus(`${lineName}${info.count} × ${name} · ${fmt.format(info.pay * mult)}`, 'win');
    }

    coinOrigin() {
      const tray = this.$('.tray') || this.windowEl;
      const r = tray.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.4 };
    }

    afterPresent(triggered) {
      if (this.state === 'overlay') return; // продолжим после закрытия
      this.state = 'idle';
      if (triggered) {
        if (this.fs) {
          this.fs.left += this.m.freeSpinsAward;
          this.fs.total += this.m.freeSpinsAward;
          this.updateFsBadge();
          this.setStatus(`+${this.m.freeSpinsAward} бесплатных вращений!`, 'hot');
          Sound.play('freeSpins');
        } else {
          this.startBonus();
          return;
        }
      }
      if (this.fs) {
        this.later(() => this.nextFree(), this.lastWin > 0 ? 900 : 650);
      } else {
        this.updateMeters();
        if (this.auto) this.later(() => { if (this.auto && this.state === 'idle') this.press(); }, this.lastWin > 0 ? 1100 : 450);
      }
    }

    /* ---------- Оверлеи: крупный выигрыш и бонус ---------- */

    showOverlay(kind, kicker, amountText, note) {
      const ov = this.overlay;
      ov.dataset.kind = kind;
      ov.querySelector('.ov-kicker').textContent = kicker;
      ov.querySelector('.ov-amount').textContent = amountText;
      ov.querySelector('.ov-note').textContent = note || '';
      ov.hidden = false;
      requestAnimationFrame(() => ov.classList.add('show'));
    }

    hideOverlay() {
      const ov = this.overlay;
      ov.classList.remove('show');
      this.later(() => { if (!ov.classList.contains('show')) ov.hidden = true; }, 280);
    }

    showBigWin(tier, win, ms) {
      this.state = 'overlay';
      this.overlayKind = 'win';
      this.el.dataset.tier = tier.level;
      Sound.play('bigWin');
      this.showOverlay('win', tier.label, '0', 'Нажмите, чтобы продолжить');
      const amountEl = this.overlay.querySelector('.ov-amount');
      this.ovCount = animateNumber(0, win, ms - 600, (v) => { amountEl.textContent = fmt.format(v); });
      if (tier.level >= 2) FX.rain(tier.level >= 3 ? 140 : 70);
      this.ovTimer = this.later(() => this.closeOverlay(), ms + 1400);
    }

    skipOverlay() {
      if (this.state !== 'overlay') return;
      if (this.overlayKind === 'win') {
        if (this.ovCount && !this.ovCount.done) { this.ovCount.finish(); if (this.rollup) this.rollup.finish(); return; }
        this.closeOverlay();
      } else if (this.overlayKind === 'bonus-start' || this.overlayKind === 'bonus-end') {
        this.closeOverlay();
      }
    }

    closeOverlay() {
      if (this.state !== 'overlay') return;
      clearTimeout(this.ovTimer);
      this.timers.delete(this.ovTimer);
      if (this.ovCount) this.ovCount.finish();
      if (this.rollup) { const r = this.rollup; this.rollup = null; r.finish(); }
      this.hideOverlay();
      delete this.el.dataset.tier;
      const kind = this.overlayKind;
      this.overlayKind = null;
      this.state = 'idle';
      if (kind === 'win') {
        this.afterPresent(this.outcome.result.freeSpins > 0);
      } else if (kind === 'bonus-start') {
        this.later(() => this.nextFree(), 300);
      } else if (kind === 'bonus-end') {
        this.updateMeters();
        if (this.auto) this.later(() => { if (this.auto && this.state === 'idle') this.press(); }, 700);
      }
    }

    startBonus() {
      const n = this.m.freeSpinsAward;
      this.fs = { left: n, total: n, won: 0, mult: this.m.freeSpinsMultiplier };
      this.el.classList.add('in-bonus');
      this.updateFsBadge();
      this.updateMeters();
      this.winLabel.textContent = 'Бонус';
      this.ledWin.textContent = 0;
      Sound.play('freeSpins');
      this.state = 'overlay';
      this.overlayKind = 'bonus-start';
      this.showOverlay('bonus', `${n} бесплатных вращений`, `×${this.fs.mult}`, 'Все выигрыши на линиях удваиваются');
      this.ovTimer = this.later(() => this.closeOverlay(), 2800);
    }

    nextFree() {
      if (!this.fs || this.state !== 'idle') return;
      if (this.fs.left <= 0) { this.endBonus(); return; }
      this.fs.left--;
      this.updateFsBadge();
      this.spin(true);
    }

    endBonus() {
      const won = this.fs.won;
      this.fs = null;
      this.el.classList.remove('in-bonus');
      this.updateFsBadge();
      this.winLabel.textContent = 'Выигрыш';
      this.ledWin.textContent = won;
      this.state = 'overlay';
      this.overlayKind = 'bonus-end';
      if (won > 0) Sound.play('win', 2);
      this.showOverlay('bonus', 'Бонус завершён', fmt.format(won), won > 0 ? 'Кредиты уже на балансе' : 'В этот раз без выигрыша');
      this.setStatus(`Бонус принёс ${fmt.format(won)}`, 'win');
      this.ovTimer = this.later(() => this.closeOverlay(), 3000);
    }

    updateFsBadge() {
      if (!this.fsBadge) return;
      if (!this.fs) { this.fsBadge.hidden = true; return; }
      this.fsBadge.hidden = false;
      const done = this.fs.total - this.fs.left;
      this.fsBadge.querySelector('[data-fs-count]').textContent = `${done} / ${this.fs.total}`;
    }

    /* ---------- Рычаг Lucky 7 ---------- */

    setupLever() {
      const lever = this.el.querySelector('.lever');
      if (!lever) return;
      const arm = lever.querySelector('.lever-arm');
      const MAX = 105;
      let angle = 0;
      let dragging = false;
      let startY = 0;
      let downAt = 0;
      let fired = false;
      let lastNotch = 0;
      let anim = 0;
      const set = (a) => {
        angle = a;
        lever.style.setProperty('--pull', `${-a}deg`);
      };
      const canPull = () => this.state === 'idle' && !this.fs;
      const springBack = () => {
        cancelAnimationFrame(anim);
        let v = 0;
        let x = angle;
        let last = performance.now();
        const step = (now) => {
          const dt = Math.min(0.032, (now - last) / 1000);
          last = now;
          const acc = -260 * x - 15 * v;
          v += acc * dt;
          x += v * dt;
          if (x < -12) { x = -12; v = -v * 0.3; }
          set(x);
          if (Math.abs(x) > 0.3 || Math.abs(v) > 3) anim = requestAnimationFrame(step);
          else set(0);
        };
        anim = requestAnimationFrame(step);
      };
      const pullFull = () => {
        cancelAnimationFrame(anim);
        Sound.play('lever');
        const from = angle;
        const t0 = performance.now();
        const dur = 200;
        const step = (now) => {
          const t = clamp((now - t0) / dur, 0, 1);
          set(from + (MAX - from) * (t * t));
          if (t < 1) anim = requestAnimationFrame(step);
          else { this.press(); setTimeout(springBack, 70); }
        };
        anim = requestAnimationFrame(step);
      };
      lever.addEventListener('pointerdown', (e) => {
        Sound.unlock();
        this.app.setActive(this);
        if (!canPull()) { if (this.state !== 'idle') this.press(); return; }
        dragging = true;
        fired = false;
        startY = e.clientY;
        downAt = performance.now();
        lastNotch = 0;
        cancelAnimationFrame(anim);
        lever.setPointerCapture(e.pointerId);
      });
      lever.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const len = arm.getBoundingClientRect().height || 140;
        const a = clamp(((e.clientY - startY) / (len * 1.15)) * MAX, 0, MAX);
        set(a);
        const notch = Math.floor(a / 18);
        if (notch > lastNotch) { lastNotch = notch; Sound.play('tick'); }
        if (a >= MAX * 0.8 && !fired) {
          fired = true;
          Sound.play('lever');
          this.press();
        }
      });
      const release = () => {
        if (!dragging) return;
        dragging = false;
        const quick = performance.now() - downAt < 260 && angle < 12;
        if (quick) { pullFull(); return; }
        springBack();
      };
      lever.addEventListener('pointerup', release);
      lever.addEventListener('pointercancel', release);
    }
  }

  root.SlotMachine = SlotMachine;
})(window);
