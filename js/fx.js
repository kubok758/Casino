/*
 * Эффекты поверх страницы: золотые монеты при выигрыше.
 * Монета — заранее отрисованный спрайт; переворот в воздухе имитируется
 * сжатием по горизонтали (|cos| фазы) и затемнением обратной стороны.
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  let canvas;
  let ctx;
  let dpr = 1;
  let coins = [];
  let running = false;
  let sprite = null;
  const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function makeCoin(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const r = size / 2;
    const g = x.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.35, '#f5c842');
    g.addColorStop(0.8, '#b97f0e');
    g.addColorStop(1, '#6e4703');
    x.fillStyle = g;
    x.beginPath();
    x.arc(r, r, r - 1, 0, TAU);
    x.fill();
    x.strokeStyle = 'rgba(110,70,0,0.9)';
    x.lineWidth = size * 0.05;
    x.beginPath();
    x.arc(r, r, r * 0.78, 0, TAU);
    x.stroke();
    // рифление гурта
    x.strokeStyle = 'rgba(255,240,180,0.55)';
    x.lineWidth = size * 0.02;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      x.beginPath();
      x.moveTo(r + Math.cos(a) * r * 0.84, r + Math.sin(a) * r * 0.84);
      x.lineTo(r + Math.cos(a) * r * 0.96, r + Math.sin(a) * r * 0.96);
      x.stroke();
    }
    // звезда в центре
    x.fillStyle = 'rgba(255,248,210,0.9)';
    x.strokeStyle = 'rgba(120,75,0,0.8)';
    x.lineWidth = size * 0.025;
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r * 0.48 : r * 0.2;
      x.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
    x.stroke();
    return c;
  }

  function resize() {
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(root.innerWidth * dpr);
    canvas.height = Math.round(root.innerHeight * dpr);
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    sprite = makeCoin(64);
    resize();
    root.addEventListener('resize', resize);
  }

  // x, y — координаты во viewport (CSS-пиксели)
  function burst(x, y, count, spread = 1) {
    if (!canvas || reduced) return;
    count = Math.min(count, 220);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5 * spread;
      const v = 650 + Math.random() * 900;
      coins.push({
        x: x + (Math.random() - 0.5) * 60,
        y: y + (Math.random() - 0.5) * 16,
        vx: Math.cos(a) * v * 0.65,
        vy: Math.sin(a) * v,
        phase: Math.random() * TAU,
        spin: 6 + Math.random() * 14,
        size: 20 + Math.random() * 18,
        delay: Math.random() * Math.min(1.6, count / 60),
        rot: (Math.random() - 0.5) * 0.6,
      });
    }
    start();
  }

  function rain(count) {
    if (!canvas || reduced) return;
    for (let i = 0; i < count; i++) {
      coins.push({
        x: Math.random() * root.innerWidth,
        y: -40 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 120,
        vy: 150 + Math.random() * 300,
        phase: Math.random() * TAU,
        spin: 6 + Math.random() * 12,
        size: 22 + Math.random() * 20,
        delay: Math.random() * 2.2,
        rot: (Math.random() - 0.5) * 0.6,
      });
    }
    start();
  }

  function start() {
    if (running) return;
    running = true;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const H = root.innerHeight;
      coins = coins.filter((c) => {
        if (c.delay > 0) { c.delay -= dt; return true; }
        c.vy += 1700 * dt;
        c.vx *= 0.995;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.phase += c.spin * dt;
        if (c.y > H + 60) return false;
        const sx = Math.cos(c.phase);
        const w = Math.max(0.08, Math.abs(sx));
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        if (w < 0.3) {
          // ребро монеты
          ctx.fillStyle = '#8a5c08';
          ctx.fillRect(-1.5, -c.size / 2, 3, c.size);
        }
        ctx.scale(w, 1);
        ctx.drawImage(sprite, -c.size / 2, -c.size / 2, c.size, c.size);
        if (sx < 0) {
          ctx.fillStyle = 'rgba(90,50,0,0.35)';
          ctx.beginPath();
          ctx.arc(0, 0, c.size / 2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        return true;
      });
      if (coins.length) requestAnimationFrame(step);
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        running = false;
      }
    };
    requestAnimationFrame(step);
  }

  root.FX = { init, burst, rain };
})(window);
