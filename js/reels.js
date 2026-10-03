/*
 * Рендер барабанов на canvas.
 * Механические барабаны (Lucky 7, Crown Jewels) — цилиндры: символ на угле φ
 * проецируется в y = R·sin(φ), поэтому у краёв окна символы сжимаются.
 * Видеослот (Cosmic Fortune) — плоская лента.
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const LINE_COLORS = ['#ffd84a', '#ff4d6d', '#4dd2ff', '#7cff6b', '#ff9a3c', '#c77dff', '#3cffd6', '#ff6bd6', '#d4ff3c', '#7b93ff'];

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  class ReelView {
    constructor(canvas, machine, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.m = machine;
      this.o = opts;
      this.rows = machine.rows;
      this.n = machine.reels;
      this.reels = machine.strips.map((strip) => ({
        strip, N: strip.length, pos: 0, vel: 0, state: 'idle', target: 0,
      }));
      this.anticipation = new Set();
      this.win = null;
      this.dirty = true;
      this.cssW = 0;
      this.cssH = 0;
      this.dpr = 1;
      this.onReelStop = null;
      this.onAllStopped = null;
      this.reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    setStops(stops) {
      stops.forEach((s, i) => { this.reels[i].pos = s; this.reels[i].target = s; });
      this.dirty = true;
    }

    /* ---------- Геометрия ---------- */

    layout(cssWidth) {
      const o = this.o;
      const dpr = Math.min(root.devicePixelRatio || 1, 2.5);
      const W = Math.max(120, cssWidth);
      const gap = Math.round(W * o.gap);
      const colW = (W - gap * (this.n - 1)) / this.n;
      let H;
      const g = { W, gap, colW, dpr };
      if (o.curved) {
        g.alpha = o.stopAngle * DEG;
        g.view = o.viewAngle * DEG;
        g.ext = (o.symbolScale * g.alpha) / 2;
        g.S = colW * o.fill;
        g.R = g.S / 2 / Math.sin(g.ext);
        H = 2 * g.R * Math.sin(g.view);
        g.cy = H / 2;
        g.pitch = g.R * g.alpha;
      } else {
        g.cellH = colW * o.cellAspect;
        H = g.cellH * this.rows;
        g.S = Math.min(colW, g.cellH) * o.fill;
        g.pitch = g.cellH;
      }
      g.H = Math.round(H);
      g.uc = (this.rows - 1) / 2;
      g.sprite = Math.round(g.S * dpr);
      this.g = g;
      this.cssW = W;
      this.cssH = g.H;
      this.dpr = dpr;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(g.H * dpr);
      this.canvas.style.height = g.H + 'px';
      this.buildLayers();
      this.dirty = true;
      return g.H;
    }

    colX(r) { return r * (this.g.colW + this.g.gap); }

    // Центр строки (в CSS-пикселях) — для линий выплат и подписей.
    rowY(row) {
      const g = this.g;
      if (this.o.curved) return g.cy + g.R * Math.sin((row - g.uc) * g.alpha);
      return (row + 0.5) * g.cellH;
    }

    cellRect(r, row) {
      const g = this.g;
      const x = this.colX(r);
      if (this.o.curved) {
        const phi = (row - g.uc) * g.alpha;
        const y0 = g.cy + g.R * Math.sin(phi - g.ext);
        const y1 = g.cy + g.R * Math.sin(phi + g.ext);
        const pad = (g.colW - g.S) / 2;
        return { x: x + pad * 0.5, y: y0 - 4, w: g.colW - pad, h: y1 - y0 + 8 };
      }
      return { x: x + 3, y: row * g.cellH + 3, w: g.colW - 6, h: g.cellH - 6 };
    }

    /* ---------- Подложки ---------- */

    buildLayers() {
      const g = this.g;
      const dpr = this.dpr;
      const w = Math.ceil(g.colW * dpr);
      const h = Math.ceil(g.H * dpr);
      const bg = makeCanvas(w, h);
      const b = bg.getContext('2d');
      const shade = makeCanvas(w, h);
      const s = shade.getContext('2d');
      const kind = this.o.bg;

      if (kind === 'paper') {
        const lg = b.createLinearGradient(0, 0, w, 0);
        lg.addColorStop(0, '#cdbf9f');
        lg.addColorStop(0.18, '#f1e8d3');
        lg.addColorStop(0.5, '#fffaee');
        lg.addColorStop(0.82, '#efe5cd');
        lg.addColorStop(1, '#c4b591');
        b.fillStyle = lg;
        b.fillRect(0, 0, w, h);
        const img = b.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          const n = (Math.random() - 0.5) * 10;
          img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        b.putImageData(img, 0, 0);
      } else if (kind === 'velvet') {
        const lg = b.createLinearGradient(0, 0, w, 0);
        lg.addColorStop(0, '#04110c');
        lg.addColorStop(0.5, '#0f3527');
        lg.addColorStop(1, '#04110c');
        b.fillStyle = lg;
        b.fillRect(0, 0, w, h);
        b.strokeStyle = 'rgba(230,190,100,0.06)';
        b.lineWidth = 1 * dpr;
        const step = 18 * dpr;
        for (let x = -h; x < w + h; x += step) {
          b.beginPath(); b.moveTo(x, 0); b.lineTo(x + h, h); b.stroke();
          b.beginPath(); b.moveTo(x, h); b.lineTo(x + h, 0); b.stroke();
        }
      } else {
        b.fillStyle = 'rgba(8,10,34,0.55)';
        b.fillRect(0, 0, w, h);
        const lg = b.createLinearGradient(0, 0, w, 0);
        lg.addColorStop(0, 'rgba(120,160,255,0.10)');
        lg.addColorStop(0.5, 'rgba(120,160,255,0)');
        lg.addColorStop(1, 'rgba(120,160,255,0.10)');
        b.fillStyle = lg;
        b.fillRect(0, 0, w, h);
      }

      // Затенение цилиндра: тёмные края сверху и снизу, мягкий блик.
      const vg = s.createLinearGradient(0, 0, 0, h);
      if (this.o.curved) {
        const dark = kind === 'paper' ? 'rgba(40,20,0,' : 'rgba(0,0,0,';
        vg.addColorStop(0, dark + '0.88)');
        vg.addColorStop(0.16, dark + '0.35)');
        vg.addColorStop(0.3, 'rgba(255,255,255,0.08)');
        vg.addColorStop(0.42, 'rgba(255,255,255,0)');
        vg.addColorStop(0.72, dark + '0.06)');
        vg.addColorStop(0.86, dark + '0.4)');
        vg.addColorStop(1, dark + '0.9)');
      } else {
        vg.addColorStop(0, 'rgba(2,3,16,0.55)');
        vg.addColorStop(0.08, 'rgba(2,3,16,0)');
        vg.addColorStop(0.92, 'rgba(2,3,16,0)');
        vg.addColorStop(1, 'rgba(2,3,16,0.55)');
      }
      s.fillStyle = vg;
      s.fillRect(0, 0, w, h);
      const hg = s.createLinearGradient(0, 0, w, 0);
      hg.addColorStop(0, 'rgba(0,0,0,0.28)');
      hg.addColorStop(0.12, 'rgba(0,0,0,0)');
      hg.addColorStop(0.88, 'rgba(0,0,0,0)');
      hg.addColorStop(1, 'rgba(0,0,0,0.28)');
      s.fillStyle = hg;
      s.fillRect(0, 0, w, h);

      this.layerBg = bg;
      this.layerShade = shade;

      // Общий фон окна для видеослота: туманность и звёзды.
      if (kind === 'space') {
        const W = Math.ceil(g.W * dpr);
        const sp = makeCanvas(W, h);
        const c = sp.getContext('2d');
        const base = c.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#060818');
        base.addColorStop(1, '#0b0f2e');
        c.fillStyle = base;
        c.fillRect(0, 0, W, h);
        const blobs = [[0.2, 0.3, '#ff3bd4', 0.22], [0.75, 0.65, '#22b8ff', 0.2], [0.5, 0.15, '#7b4bff', 0.18], [0.9, 0.2, '#ff7a3b', 0.1]];
        blobs.forEach(([x, y, col, a]) => {
          const rg = c.createRadialGradient(x * W, y * h, 0, x * W, y * h, Math.max(W, h) * 0.45);
          rg.addColorStop(0, col);
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          c.globalAlpha = a;
          c.fillStyle = rg;
          c.fillRect(0, 0, W, h);
        });
        c.globalAlpha = 1;
        for (let i = 0; i < 260; i++) {
          const x = Math.random() * W;
          const y = Math.random() * h;
          const r = Math.random() < 0.08 ? 1.3 * dpr : 0.6 * dpr;
          c.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.fill();
        }
        this.layerSpace = sp;
      } else {
        this.layerSpace = null;
      }
    }

    /* ---------- Вращение ---------- */

    // plan: { targets, stopAt: [мс от сейчас], anticipation: [индексы] }
    spin(plan) {
      const now = performance.now() / 1000;
      const o = this.o;
      this.win = null;
      this.anticipation = new Set(plan.anticipation || []);
      this.reels.forEach((r, i) => {
        r.target = plan.targets[i];
        r.p0 = r.pos;
        r.t0 = now + i * (o.stagger || 0.06);
        r.stopAt = now + plan.stopAt[i] / 1000;
        r.state = 'windup';
        r.vel = 0;
        r.fast = false;
      });
      this.dirty = true;
    }

    // Мгновенная остановка по повторному нажатию «Крутить».
    slam() {
      const now = performance.now() / 1000;
      let order = 0;
      this.reels.forEach((r) => {
        if (r.state === 'windup' || r.state === 'accel' || r.state === 'spin') {
          r.stopAt = Math.min(r.stopAt, now + order * 0.07);
          r.fast = true;
          order++;
        }
      });
      this.anticipation.clear();
    }

    get spinning() {
      return this.reels.some((r) => r.state !== 'idle');
    }

    beginStop(r, now) {
      const o = this.o;
      const v = Math.max(r.vel, o.speed * 0.7);
      const tdec = r.fast ? o.decel * 0.55 : o.decel;
      const dNom = (v * tdec) / 3;
      const ob = o.overshoot;
      // Целевая позиция с подходящим числом оборотов, чтобы скачок фазы был минимальным.
      const m = Math.round((r.pos - r.target - dNom) / r.N);
      const final = r.target + m * r.N;
      const J = Math.ceil(dNom - (r.pos - final));
      r.pos += J;
      r.sp = r.pos;
      r.final = final;
      r.dist = r.sp - final + ob;
      r.tdec = (3 * r.dist) / v;
      r.ts = now;
      r.state = 'stopping';
    }

    update(now) {
      const o = this.o;
      let changed = false;
      this.reels.forEach((r, i) => {
        if (r.state === 'idle') return;
        changed = true;
        const prev = r.pos;
        switch (r.state) {
          case 'windup': {
            const t = now - r.t0;
            if (t < 0) return;
            const tw = o.windup;
            if (t < tw) {
              r.pos = r.p0 + o.windupAmt * Math.sin((Math.PI * t) / tw);
            } else {
              r.pos = r.p0;
              r.state = 'accel';
              r.tLast = r.t0 + tw;
            }
            break;
          }
          case 'accel':
          case 'spin': {
            const dt = Math.min(0.05, now - r.tLast);
            r.tLast = now;
            if (r.state === 'accel') {
              r.vel = Math.min(o.speed, r.vel + (o.speed * dt) / o.accel);
              if (r.vel >= o.speed) r.state = 'spin';
            }
            r.pos -= r.vel * dt;
            if (now >= r.stopAt) this.beginStop(r, now);
            break;
          }
          case 'stopping': {
            const t = now - r.ts;
            if (t < r.tdec) {
              r.pos = r.sp - r.dist * easeOutCubic(t / r.tdec);
              r.vel = (3 * r.dist / r.tdec) * Math.pow(1 - t / r.tdec, 2);
            } else {
              r.pos = r.final - o.overshoot;
              r.vel = 0;
              r.state = 'bounce';
              r.tb = now;
              this.anticipation.delete(i);
              if (this.onReelStop) this.onReelStop(i);
            }
            break;
          }
          case 'bounce': {
            const t = now - r.tb;
            const w = (2 * Math.PI) / 0.2;
            const z = 14;
            const x = -o.overshoot * Math.exp(-z * t) * (Math.cos(w * t) + (z / w) * Math.sin(w * t));
            r.pos = r.final + x;
            if (t > 0.32) {
              r.pos = mod(Math.round(r.final), r.N);
              r.state = 'idle';
              r.vel = 0;
              if (this.reels.every((q) => q.state === 'idle') && this.onAllStopped) this.onAllStopped();
            }
            break;
          }
          default:
        }
        if (r.state === 'spin' || r.state === 'accel') r.vel = Math.abs(r.vel);
        else if (r.state === 'windup') r.vel = Math.abs(r.pos - prev) * 60;
      });
      if (changed) this.dirty = true;
    }

    /* ---------- Подсветка выигрыша ---------- */

    showWin(result, opts = {}) {
      const lines = result.lines.map((l) => ({
        index: l.line,
        cells: l.cells,
        path: this.m.lines[l.line],
        color: this.n === 3 && this.rows === 1 ? '#ffd84a' : LINE_COLORS[l.line % LINE_COLORS.length],
        info: l,
      }));
      if (result.scatter) {
        lines.push({ index: -1, cells: result.scatter.cells, path: null, color: '#ff7bf0', info: result.scatter, scatter: true });
      }
      if (!lines.length) { this.win = null; return; }
      this.win = { lines, t0: performance.now() / 1000, onLine: opts.onLine || null, lastShown: -2 };
      this.dirty = true;
    }

    clearWin() {
      this.win = null;
      this.dirty = true;
    }

    /* ---------- Отрисовка ---------- */

    drawSymbol(ctx, r, u, id, scale, blurMix) {
      const g = this.g;
      if (id === this.m.blank) return;
      const x0 = this.colX(r) + (g.colW - g.S * scale) / 2;
      const w = g.S * scale;
      const sprites = [];
      if (blurMix < 0.98) sprites.push([Symbols.get(id, g.sprite).normal, 1 - (blurMix > 0.02 ? blurMix : 0)]);
      if (blurMix > 0.02) sprites.push([Symbols.getBlur(id, g.sprite), blurMix]);
      if (this.o.curved) {
        const phi = (u - g.uc) * g.alpha;
        const e = g.ext * scale;
        if (phi + e < -g.view - 0.02 || phi - e > g.view + 0.02) return;
        const slices = this.o.slices || 10;
        for (const [img, a] of sprites) {
          ctx.globalAlpha = a;
          const sh = img.height / slices;
          for (let j = 0; j < slices; j++) {
            const b0 = phi - e + (2 * e * j) / slices;
            const b1 = phi - e + (2 * e * (j + 1)) / slices;
            if (b1 < -1.5 || b0 > 1.5) continue;
            const y0 = g.cy + g.R * Math.sin(b0);
            const y1 = g.cy + g.R * Math.sin(b1);
            ctx.drawImage(img, 0, sh * j, img.width, sh, x0, y0, w, y1 - y0 + 0.6);
          }
        }
      } else {
        const cy = (u + 0.5) * g.cellH;
        if (cy + w / 2 < 0 || cy - w / 2 > g.H) return;
        for (const [img, a] of sprites) {
          ctx.globalAlpha = a;
          ctx.drawImage(img, x0, cy - w / 2, w, w);
        }
      }
      ctx.globalAlpha = 1;
    }

    draw(now) {
      const ctx = this.ctx;
      const g = this.g;
      if (!g) return;
      const dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (this.layerSpace) ctx.drawImage(this.layerSpace, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const margin = this.o.curved ? Math.ceil((g.view + g.ext) / g.alpha) + 1 : 2;
      for (let r = 0; r < this.n; r++) {
        const reel = this.reels[r];
        const x = this.colX(r);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, g.colW, g.H);
        ctx.clip();
        ctx.drawImage(this.layerBg, x, 0, g.colW, g.H);
        const speedPx = reel.vel * g.pitch;
        const blurMix = this.reduced ? 0 : clamp((speedPx - 450) / 900, 0, 1);
        const p = reel.pos;
        const from = Math.floor(p) - margin;
        const to = Math.ceil(p) + this.rows - 1 + margin;
        for (let k = from; k <= to; k++) {
          const id = reel.strip[mod(k, reel.N)];
          this.drawSymbol(ctx, r, k - p, id, 1, blurMix);
        }
        ctx.drawImage(this.layerShade, x, 0, g.colW, g.H);
        ctx.restore();
      }

      this.drawDividers(ctx);
      if (this.anticipation.size) this.drawAnticipation(ctx, now);
      if (this.win && !this.spinning) this.drawWin(ctx, now);
      this.dirty = false;
    }

    drawDividers(ctx) {
      const g = this.g;
      for (let r = 1; r < this.n; r++) {
        const x = this.colX(r) - g.gap;
        if (this.o.bg === 'space') {
          const lg = ctx.createLinearGradient(0, 0, 0, g.H);
          lg.addColorStop(0, 'rgba(120,200,255,0)');
          lg.addColorStop(0.5, 'rgba(160,210,255,0.45)');
          lg.addColorStop(1, 'rgba(120,200,255,0)');
          ctx.fillStyle = lg;
          ctx.fillRect(x + g.gap / 2 - 0.5, 0, 1, g.H);
          continue;
        }
        const lg = ctx.createLinearGradient(x, 0, x + g.gap, 0);
        if (this.o.bg === 'paper') {
          lg.addColorStop(0, '#3b3f45');
          lg.addColorStop(0.3, '#f4f6f8');
          lg.addColorStop(0.55, '#9aa1aa');
          lg.addColorStop(1, '#2e3238');
        } else {
          lg.addColorStop(0, '#3a2604');
          lg.addColorStop(0.35, '#ffe9a3');
          lg.addColorStop(0.6, '#b98a22');
          lg.addColorStop(1, '#2e1d02');
        }
        ctx.fillStyle = lg;
        ctx.fillRect(x, 0, g.gap, g.H);
      }
    }

    drawAnticipation(ctx, now) {
      const g = this.g;
      this.anticipation.forEach((r) => {
        const x = this.colX(r);
        const pulse = 0.55 + 0.45 * Math.sin(now * 14);
        ctx.save();
        ctx.shadowColor = '#ffcf3a';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = `rgba(255,214,90,${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, 2, g.colW - 4, g.H - 4);
        const sweep = ((now * 1.6) % 1) * (g.H + 80) - 40;
        const lg = ctx.createLinearGradient(0, sweep - 40, 0, sweep + 40);
        lg.addColorStop(0, 'rgba(255,230,140,0)');
        lg.addColorStop(0.5, 'rgba(255,230,140,0.35)');
        lg.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(x, sweep - 40, g.colW, 80);
        ctx.restore();
      });
    }

    drawWin(ctx, now) {
      const g = this.g;
      const w = this.win;
      const t = now - w.t0;
      const ALL = 1.7;
      const EACH = 1.25;
      let shown;
      let idx = -1;
      if (t < ALL || w.lines.length === 1) {
        shown = w.lines;
      } else {
        idx = Math.floor((t - ALL) / EACH) % w.lines.length;
        shown = [w.lines[idx]];
      }
      if (w.onLine && idx !== w.lastShown) {
        w.lastShown = idx;
        w.onLine(idx === -1 ? null : w.lines[idx]);
      }
      const cells = new Map();
      shown.forEach((l) => l.cells.forEach(([r, row]) => cells.set(r + ':' + row, l.color)));

      if (this.o.dim) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (let r = 0; r < this.n; r++) {
          for (let row = 0; row < this.rows; row++) {
            if (cells.has(r + ':' + row)) continue;
            const c = this.cellRect(r, row);
            ctx.fillRect(this.colX(r), c.y + 4, g.colW, c.h - 8);
          }
        }
      }

      // линии
      shown.forEach((l) => {
        if (!l.path) return;
        const pts = l.path.map((row, r) => [this.colX(r) + g.colW / 2, this.rowY(row)]);
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = l.color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = this.rows === 1 ? 3 : 4;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(0, pts[0][1]);
        pts.forEach((p) => ctx.lineTo(p[0], p[1]));
        ctx.lineTo(g.W, pts[pts.length - 1][1]);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      });

      // символы выигрыша — с пульсацией поверх линий
      const pulse = this.reduced ? 1 : 1 + 0.06 * Math.sin(t * Math.PI * 2 * 1.4);
      cells.forEach((color, key) => {
        const [r, row] = key.split(':').map(Number);
        const reel = this.reels[r];
        const id = reel.strip[mod(reel.pos + row, reel.N)];
        const c = this.cellRect(r, row);
        ctx.save();
        ctx.beginPath();
        ctx.rect(this.colX(r), 0, g.colW, g.H);
        ctx.clip();
        const glow = ctx.createRadialGradient(c.x + c.w / 2, c.y + c.h / 2, 0, c.x + c.w / 2, c.y + c.h / 2, Math.max(c.w, c.h) * 0.6);
        glow.addColorStop(0, this.o.bg === 'paper' ? 'rgba(255,214,90,0.55)' : 'rgba(255,220,120,0.32)');
        glow.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        this.drawSymbol(ctx, r, row, id, pulse, 0);
        ctx.restore();
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        const rr = 8;
        ctx.beginPath();
        ctx.moveTo(c.x + rr, c.y);
        ctx.arcTo(c.x + c.w, c.y, c.x + c.w, c.y + c.h, rr);
        ctx.arcTo(c.x + c.w, c.y + c.h, c.x, c.y + c.h, rr);
        ctx.arcTo(c.x, c.y + c.h, c.x, c.y, rr);
        ctx.arcTo(c.x, c.y, c.x + c.w, c.y, rr);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });
    }

    needsFrame(now) {
      // подсветка выигрыша пульсирует 20 секунд, потом остаётся статичной
      const winLive = !!this.win && now - this.win.t0 < 20;
      return this.dirty || this.spinning || winLive || this.anticipation.size > 0;
    }
  }

  /* ---------- Общий цикл анимации ---------- */

  const views = new Set();
  let running = false;
  function loop() {
    const now = performance.now() / 1000;
    let any = false;
    views.forEach((v) => {
      if (!v.g) return;
      v.update(now);
      if (v.needsFrame(now)) {
        v.draw(now);
        any = true;
      }
    });
    if (any || [...views].some((v) => v.spinning)) {
      requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }
  function kick() {
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  root.Reels = {
    ReelView,
    LINE_COLORS,
    register(v) { views.add(v); kick(); },
    kick,
  };
})(window);
