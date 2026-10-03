/*
 * Символы барабанов. Каждый рисуется кодом на canvas в системе координат 200×200
 * и кешируется как спрайт нужного размера (обычный и «смазанный» для вращения).
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const BASE = 200;

  const FONT_UI = '"Jost", "Futura", "Century Gothic", "Arial Black", sans-serif';
  const FONT_HEAVY = '"Unbounded", "Arial Black", sans-serif';

  /* ---------- Утилиты рисования ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }

  function rad(ctx, x0, y0, r0, x1, y1, r1, stops) {
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }

  // Тень не масштабируется трансформацией — умножаем на k вручную.
  function shadowed(ctx, k, blur, color, ox, oy, fn) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * k;
    ctx.shadowOffsetX = ox * k;
    ctx.shadowOffsetY = oy * k;
    fn();
    ctx.restore();
  }

  function gloss(ctx, cx, cy, rx, ry, rot, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Плавная палитра из нескольких опорных цветов.
  function ramp(colors) {
    const rgb = colors.map(hexToRgb);
    return function (t) {
      t = Math.max(0, Math.min(1, t)) * (rgb.length - 1);
      const i = Math.min(rgb.length - 2, Math.floor(t));
      const f = t - i;
      const a = rgb[i];
      const b = rgb[i + 1];
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
    };
  }

  // Четырёхлучевой блик.
  function glint(ctx, x, y, s, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.09, s, 0);
      ctx.quadraticCurveTo(0, s * 0.09, -s, 0);
      ctx.fill();
      ctx.rotate(Math.PI / 2);
    }
    ctx.restore();
  }

  function leaf(ctx, x0, y0, x1, y1, w) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.28, -w, len * 0.78, -w * 0.85, len, 0);
    ctx.bezierCurveTo(len * 0.72, w * 0.9, len * 0.3, w * 0.95, 0, 0);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -w, 0, w, [[0, '#a6e05f'], [0.45, '#4f9a2a'], [1, '#1f5212']]);
    ctx.fill();
    ctx.strokeStyle = '#173a0a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,255,190,0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.quadraticCurveTo(len * 0.5, -w * 0.12, len * 0.94, 0);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const mx = len * t;
      const my = -w * 0.12 * Math.sin(Math.PI * t);
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + len * 0.12, my - w * 0.62 * Math.sin(Math.PI * t));
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + len * 0.12, my + w * 0.6 * Math.sin(Math.PI * t));
      ctx.stroke();
    }
    ctx.restore();
  }

  function pores(ctx, seed, count, cx, cy, r, dark, light) {
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * r;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      ctx.fillStyle = rnd() > 0.5 ? dark : light;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + rnd() * 1.1, 0, TAU);
      ctx.fill();
    }
  }

  function banner(ctx, k, text, y, opts) {
    const w = opts.width || 120;
    const h = 30;
    const x = 100 - w / 2;
    shadowed(ctx, k, 6, 'rgba(0,0,0,0.6)', 0, 3, () => {
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = lin(ctx, 0, y, 0, y + h, opts.fill);
      ctx.fill();
    });
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = lin(ctx, 0, y, 0, y + h, opts.rim);
    ctx.stroke();
    ctx.font = `800 21px ${opts.font || FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.lineWidth = 4;
    ctx.strokeStyle = opts.textStroke;
    ctx.strokeText(text, 101, y + h / 2 + 1);
    ctx.fillStyle = lin(ctx, 0, y + 4, 0, y + h - 4, opts.text);
    ctx.fillText(text, 101, y + h / 2 + 1);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  /* ---------- Классика: фрукты, колокол, BAR, семёрка ---------- */

  function berry(ctx, k, cx, cy, r) {
    shadowed(ctx, k, 9, 'rgba(40,0,0,0.45)', 0, 5, () => {
      ctx.fillStyle = rad(ctx, cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r * 1.05,
        [[0, '#ffb0a8'], [0.2, '#f52c3e'], [0.68, '#a4031e'], [1, '#43000b']]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
    });
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,110,120,0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0.15 * Math.PI, 0.62 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(70,0,12,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy - r + 7, 8, 3.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    gloss(ctx, cx - r * 0.36, cy - r * 0.42, r * 0.34, r * 0.2, -0.65, 0.95);
    gloss(ctx, cx + r * 0.38, cy + r * 0.34, r * 0.12, r * 0.06, -0.65, 0.35);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(55,0,8,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }

  function cherry(ctx, k) {
    const stems = () => {
      ctx.beginPath();
      ctx.moveTo(124, 34);
      ctx.bezierCurveTo(106, 58, 84, 88, 70, 118);
      ctx.moveTo(124, 34);
      ctx.bezierCurveTo(134, 64, 140, 96, 141, 126);
    };
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b2a07';
    ctx.lineWidth = 11;
    stems();
    ctx.stroke();
    ctx.strokeStyle = lin(ctx, 60, 30, 150, 130, [[0, '#9cc444'], [0.5, '#5f8c1f'], [1, '#3d5c12']]);
    ctx.lineWidth = 7;
    stems();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,255,170,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(121, 38);
    ctx.bezierCurveTo(104, 60, 84, 88, 72, 112);
    ctx.stroke();
    leaf(ctx, 124, 34, 178, 22, 17);
    ctx.fillStyle = '#3a2408';
    ctx.beginPath();
    ctx.ellipse(124, 34, 6, 4.5, -0.4, 0, TAU);
    ctx.fill();
    berry(ctx, k, 69, 141, 36);
    berry(ctx, k, 140, 151, 37);
  }

  function lemon(ctx, k) {
    ctx.save();
    ctx.translate(100, 104);
    ctx.rotate(-0.32);
    const path = new Path2D();
    const ang = (a, b) => {
      let d = Math.abs(a - b) % TAU;
      return d > Math.PI ? TAU - d : d;
    };
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * TAU;
      const d0 = ang(t, 0);
      const d1 = ang(t, Math.PI);
      const tip = 1 + 0.2 * Math.exp(-(d0 * d0) / 0.011) + 0.18 * Math.exp(-(d1 * d1) / 0.011);
      const x = 70 * tip * Math.cos(t);
      const y = 53 * Math.sin(t) * (1 - 0.06 * Math.cos(t));
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
    shadowed(ctx, k, 10, 'rgba(60,40,0,0.45)', 0, 6, () => {
      ctx.fillStyle = rad(ctx, -22, -24, 6, 0, 0, 86,
        [[0, '#fffbd8'], [0.3, '#ffeb4f'], [0.72, '#f0c000'], [1, '#9c7200']]);
      ctx.fill(path);
    });
    ctx.save();
    ctx.clip(path);
    pores(ctx, 11, 160, 0, 0, 72, 'rgba(150,105,0,0.16)', 'rgba(255,255,220,0.22)');
    ctx.fillStyle = rad(ctx, 30, 40, 10, 30, 40, 70, [[0, 'rgba(120,80,0,0.25)'], [1, 'rgba(120,80,0,0)']]);
    ctx.fillRect(-90, -70, 180, 140);
    ctx.restore();
    gloss(ctx, -24, -24, 30, 13, -0.2, 0.9);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#6e5200';
    ctx.stroke(path);
    ctx.restore();
    leaf(ctx, 154, 74, 184, 46, 10);
  }

  function orange(ctx, k) {
    const cx = 100;
    const cy = 110;
    const r = 64;
    shadowed(ctx, k, 10, 'rgba(70,25,0,0.45)', 0, 6, () => {
      ctx.fillStyle = rad(ctx, cx - 24, cy - 26, 6, cx, cy, r * 1.05,
        [[0, '#ffe2a6'], [0.25, '#ffad2e'], [0.7, '#ea6c00'], [1, '#7e2e00']]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
    });
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    pores(ctx, 23, 260, cx, cy, r, 'rgba(140,50,0,0.18)', 'rgba(255,230,180,0.22)');
    ctx.restore();
    gloss(ctx, cx - 24, cy - 28, 26, 15, -0.6, 0.85);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#6a2800';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    leaf(ctx, 104, 50, 160, 28, 15);
    // чашелистик
    ctx.fillStyle = '#2f5d14';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.ellipse(100 + Math.cos(a) * 5, 50 + Math.sin(a) * 3, 6, 2.6, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#5a3a12';
    ctx.beginPath();
    ctx.arc(100, 50, 3, 0, TAU);
    ctx.fill();
  }

  function plum(ctx, k) {
    ctx.save();
    ctx.translate(98, 112);
    ctx.rotate(0.38);
    const path = new Path2D('M0,-60 C40,-72 62,-30 60,6 C58,48 30,68 0,68 C-30,68 -58,48 -60,6 C-62,-30 -40,-72 0,-60 Z');
    shadowed(ctx, k, 10, 'rgba(30,0,40,0.5)', 0, 6, () => {
      ctx.fillStyle = rad(ctx, -22, -24, 5, 0, 0, 80,
        [[0, '#e3b5ff'], [0.22, '#9a46d6'], [0.62, '#55127e'], [1, '#1d0430']]);
      ctx.fill(path);
    });
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = rad(ctx, -18, -10, 4, -18, -10, 60, [[0, 'rgba(235,225,255,0.28)'], [1, 'rgba(235,225,255,0)']]);
    ctx.fillRect(-70, -70, 140, 140);
    ctx.strokeStyle = 'rgba(25,0,40,0.55)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(2, -60);
    ctx.bezierCurveTo(20, -22, 20, 28, 6, 68);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -58);
    ctx.bezierCurveTo(14, -22, 14, 28, 0, 66);
    ctx.stroke();
    ctx.restore();
    gloss(ctx, -26, -26, 22, 12, -0.7, 0.85);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1c0330';
    ctx.stroke(path);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a2a0c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(1, -60);
    ctx.quadraticCurveTo(4, -76, 14, -84);
    ctx.stroke();
    ctx.restore();
    leaf(ctx, 112, 32, 162, 20, 13);
  }

  function bell(ctx, k) {
    const metal = (x0, x1) => lin(ctx, x0, 0, x1, 0, [
      [0, '#5c3b00'], [0.14, '#b98300'], [0.3, '#ffe9a0'], [0.4, '#ffd43b'],
      [0.62, '#d29a00'], [0.85, '#8a5c00'], [1, '#4a2f00'],
    ]);
    // ушко
    ctx.lineWidth = 7;
    ctx.strokeStyle = metal(86, 114);
    ctx.beginPath();
    ctx.arc(100, 28, 10, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#3c2600';
    ctx.beginPath();
    ctx.arc(100, 28, 13.5, 0, TAU);
    ctx.stroke();
    // язычок
    shadowed(ctx, k, 6, 'rgba(0,0,0,0.4)', 0, 3, () => {
      ctx.fillStyle = rad(ctx, 95, 172, 2, 100, 176, 16, [[0, '#fff2b8'], [0.4, '#e0a400'], [1, '#5c3b00']]);
      ctx.beginPath();
      ctx.arc(100, 176, 14, 0, TAU);
      ctx.fill();
    });
    const body = new Path2D('M100,34 C142,34 150,66 150,98 C150,126 158,144 176,156 L24,156 C42,144 50,126 50,98 C50,66 58,34 100,34 Z');
    shadowed(ctx, k, 10, 'rgba(50,30,0,0.5)', 0, 6, () => {
      ctx.fillStyle = metal(40, 160);
      ctx.fill(body);
    });
    ctx.save();
    ctx.clip(body);
    ctx.fillStyle = lin(ctx, 0, 34, 0, 156, [[0, 'rgba(255,255,255,0.25)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(60,30,0,0.35)']]);
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(76, 92, 6, 48, 0.06, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#4a2f00';
    ctx.stroke(body);
    // обод
    shadowed(ctx, k, 6, 'rgba(0,0,0,0.35)', 0, 3, () => {
      roundRect(ctx, 16, 148, 168, 22, 11);
      ctx.fillStyle = metal(16, 184);
      ctx.fill();
    });
    roundRect(ctx, 16, 148, 168, 22, 11);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#4a2f00';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    roundRect(ctx, 26, 151, 120, 5, 2.5);
    ctx.fill();
    // декоративный пояс
    ctx.strokeStyle = 'rgba(90,55,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(53, 112);
    ctx.quadraticCurveTo(100, 122, 147, 112);
    ctx.stroke();
    glint(ctx, 72, 60, 14, 0.9);
  }

  function bar(ctx, k) {
    shadowed(ctx, k, 10, 'rgba(0,0,0,0.55)', 0, 6, () => {
      roundRect(ctx, 14, 60, 172, 80, 14);
      ctx.fillStyle = lin(ctx, 0, 60, 0, 140, [[0, '#4a4a4a'], [0.45, '#121212'], [1, '#262626']]);
      ctx.fill();
    });
    roundRect(ctx, 14, 60, 172, 80, 14);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    roundRect(ctx, 21, 67, 158, 66, 9);
    ctx.lineWidth = 4;
    ctx.strokeStyle = lin(ctx, 0, 67, 0, 133, [[0, '#fff1b8'], [0.5, '#d4a531'], [1, '#8a6210']]);
    ctx.stroke();
    ctx.font = `800 58px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#7d0010';
    ctx.strokeText('BAR', 103, 102);
    ctx.fillStyle = lin(ctx, 0, 78, 0, 126, [[0, '#ffffff'], [0.5, '#f2f2f2'], [0.52, '#c9c9c9'], [1, '#ffffff']]);
    ctx.fillText('BAR', 103, 102);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, 24, 70, 152, 28, 7);
    ctx.fill();
  }

  function seven(ctx, k) {
    const path = new Path2D('M36,34 L170,34 L170,64 C142,94 120,132 111,178 L64,178 C74,128 98,92 124,68 L36,68 Z');
    ctx.lineJoin = 'round';
    shadowed(ctx, k, 10, 'rgba(60,0,0,0.5)', 0, 6, () => {
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#2b0004';
      ctx.stroke(path);
    });
    ctx.lineWidth = 11;
    ctx.strokeStyle = lin(ctx, 0, 30, 0, 182, [[0, '#fff4c4'], [0.35, '#e8b53a'], [0.7, '#a8740d'], [1, '#ffe08a']]);
    ctx.stroke(path);
    ctx.fillStyle = lin(ctx, 0, 34, 0, 178, [[0, '#ff6b6b'], [0.4, '#e3001b'], [1, '#7a000e']]);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(30, 36, 150, 13);
    ctx.fillStyle = lin(ctx, 60, 0, 130, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]);
    ctx.beginPath();
    ctx.moveTo(126, 66);
    ctx.lineTo(140, 66);
    ctx.lineTo(96, 178);
    ctx.lineTo(82, 178);
    ctx.fill();
    ctx.restore();
    glint(ctx, 160, 40, 16, 0.95);
    glint(ctx, 70, 168, 10, 0.6);
  }

  /* ---------- Драгоценности ---------- */

  // Огранка «бриллиант» для многоугольника из n главных вершин (вид сверху).
  function brilliant(ctx, k, o) {
    const { n, rx, ry, rot = 0, midR = 0.92, tableR = 0.5, starR = 0.74, colors, seed = 1 } = o;
    const shade = ramp(colors);
    const rnd = mulberry32(seed);
    ctx.save();
    ctx.translate(100, o.cy || 100);
    const at = (j, r) => {
      const a = rot + (j * Math.PI) / n - Math.PI / 2;
      return [Math.cos(a) * rx * r, Math.sin(a) * ry * r];
    };
    const O = [];
    for (let j = 0; j < 2 * n; j++) O.push(at(j, j % 2 === 0 ? 1 : midR));
    const T = [];
    const S = [];
    for (let i = 0; i < n; i++) {
      T.push(at(2 * i, tableR));
      S.push(at(2 * i + 1, starR * midR));
    }
    // тень и основа
    shadowed(ctx, k, 12, 'rgba(0,0,0,0.6)', 0, 7, () => {
      poly(ctx, O);
      ctx.fillStyle = shade(0.15);
      ctx.fill();
    });
    const light = -2.3; // свет сверху слева
    const facet = (pts, bias) => {
      let cx = 0;
      let cy = 0;
      pts.forEach((p) => { cx += p[0]; cy += p[1]; });
      cx /= pts.length;
      cy /= pts.length;
      const a = Math.atan2(cy, cx);
      let b = 0.5 + 0.38 * Math.cos(a - light) + bias + (rnd() - 0.5) * 0.28;
      poly(ctx, pts);
      ctx.fillStyle = shade(b);
      ctx.fill();
    };
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      const im = (i - 1 + n) % n;
      facet([T[i], S[im], O[2 * i], S[i]], -0.08);
      facet([S[i], O[2 * i], O[2 * i + 1]], 0.12);
      facet([S[i], O[2 * i + 1], O[(2 * i + 2) % (2 * n)]], -0.18);
      facet([T[i], T[i1], S[i]], 0.18);
    }
    poly(ctx, T);
    ctx.fillStyle = lin(ctx, -rx * tableR, -ry * tableR, rx * tableR, ry * tableR,
      [[0, shade(0.95)], [0.45, shade(0.62)], [1, shade(0.35)]]);
    ctx.fill();
    // отражение в площадке
    ctx.save();
    poly(ctx, T);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(-rx, -ry * 0.1);
    ctx.lineTo(rx * 0.1, -ry);
    ctx.lineTo(rx * 0.4, -ry);
    ctx.lineTo(-rx, ry * 0.25);
    ctx.fill();
    ctx.restore();
    // рёбра
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      poly(ctx, [T[i], S[i], T[i1]]);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(S[i][0], S[i][1]);
      ctx.lineTo(O[2 * i + 1][0], O[2 * i + 1][1]);
      ctx.moveTo(S[i][0], S[i][1]);
      ctx.lineTo(O[2 * i][0], O[2 * i][1]);
      ctx.moveTo(S[i][0], S[i][1]);
      ctx.lineTo(O[(2 * i + 2) % (2 * n)][0], O[(2 * i + 2) % (2 * n)][1]);
      ctx.moveTo(T[i][0], T[i][1]);
      ctx.lineTo(O[2 * i][0], O[2 * i][1]);
      ctx.stroke();
    }
    poly(ctx, O);
    ctx.lineWidth = 3;
    ctx.strokeStyle = shade(0.02);
    ctx.stroke();
    poly(ctx, O);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke();
    ctx.restore();
  }

  function ruby(ctx, k) {
    brilliant(ctx, k, {
      n: 8, rx: 60, ry: 76, rot: Math.PI / 8, midR: 0.97, seed: 5,
      colors: ['#2a0008', '#7a0019', '#d0102f', '#ff4a62', '#ffd0d6'],
    });
    glint(ctx, 72, 52, 18);
    glint(ctx, 128, 140, 9, 0.7);
  }

  function sapphire(ctx, k) {
    brilliant(ctx, k, {
      n: 8, rx: 74, ry: 74, rot: Math.PI / 8, midR: 0.97, seed: 9,
      colors: ['#020a2e', '#0b2a86', '#1f5fe0', '#62a8ff', '#e2f1ff'],
    });
    glint(ctx, 64, 60, 18);
    glint(ctx, 140, 132, 8, 0.7);
  }

  function amethyst(ctx, k) {
    brilliant(ctx, k, {
      n: 3, rx: 86, ry: 86, rot: 0, midR: 0.62, tableR: 0.42, starR: 0.86, seed: 3, cy: 112,
      colors: ['#1c0433', '#561390', '#9b45e0', '#d49bff', '#f6e8ff'],
    });
    glint(ctx, 84, 74, 16);
  }

  function topaz(ctx, k) {
    brilliant(ctx, k, {
      n: 4, rx: 82, ry: 82, rot: Math.PI / 4, midR: 0.74, tableR: 0.46, starR: 0.86, seed: 21,
      colors: ['#3d1a00', '#a65400', '#f39a12', '#ffd36a', '#fff6d6'],
    });
    glint(ctx, 68, 66, 16);
  }

  function emerald(ctx, k) {
    const shade = ramp(['#011a0c', '#06582b', '#16a653', '#6ff0a2', '#e6fff0']);
    const rnd = mulberry32(17);
    const oct = (s) => {
      const w = 66 * s;
      const h = 80 * s;
      const c = 20 * s;
      return [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]];
    };
    ctx.save();
    ctx.translate(100, 100);
    const rings = [1, 0.8, 0.62, 0.46];
    shadowed(ctx, k, 12, 'rgba(0,0,0,0.6)', 0, 7, () => {
      poly(ctx, oct(1));
      ctx.fillStyle = shade(0.1);
      ctx.fill();
    });
    const sideLight = [0.75, 0.95, 0.6, 0.3, 0.15, 0.25, 0.4, 0.85];
    for (let ri = 0; ri < rings.length - 1; ri++) {
      const A = oct(rings[ri]);
      const B = oct(rings[ri + 1]);
      for (let j = 0; j < 8; j++) {
        const j1 = (j + 1) % 8;
        let b = sideLight[j] * 0.8 + (ri % 2 === 0 ? 0.08 : -0.08) + (rnd() - 0.5) * 0.12;
        if (ri === 1) b = 1 - b * 0.9;
        poly(ctx, [A[j], A[j1], B[j1], B[j]]);
        ctx.fillStyle = shade(b);
        ctx.fill();
      }
    }
    const tbl = oct(rings[rings.length - 1]);
    poly(ctx, tbl);
    ctx.fillStyle = lin(ctx, -30, -37, 30, 37, [[0, shade(0.88)], [0.5, shade(0.55)], [1, shade(0.38)]]);
    ctx.fill();
    ctx.save();
    poly(ctx, tbl);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-40, -40, 22, 80);
    ctx.restore();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    rings.forEach((s) => { poly(ctx, oct(s)); ctx.stroke(); });
    const outer = oct(1);
    const inner = oct(rings[rings.length - 1]);
    for (let j = 0; j < 8; j++) {
      ctx.beginPath();
      ctx.moveTo(outer[j][0], outer[j][1]);
      ctx.lineTo(inner[j][0], inner[j][1]);
      ctx.stroke();
    }
    poly(ctx, outer);
    ctx.lineWidth = 3;
    ctx.strokeStyle = shade(0.0);
    ctx.stroke();
    ctx.restore();
    glint(ctx, 62, 44, 17);
    glint(ctx, 136, 150, 9, 0.7);
  }

  function diamond(ctx, k) {
    const ty = 54;
    const gy = 90;
    const T = [60, 86.7, 113.3, 140].map((x) => [x, ty]);
    const G = [18, 59, 100, 141, 182].map((x) => [x, gy]);
    const C = [100, 184];
    const outline = [[60, ty], [140, ty], [182, gy], C, [18, gy]];
    shadowed(ctx, k, 12, 'rgba(0,30,60,0.55)', 0, 7, () => {
      poly(ctx, outline);
      ctx.fillStyle = '#9fcff0';
      ctx.fill();
    });
    const crown = [
      [[G[0], T[0], G[1]], '#e9f8ff'],
      [[T[0], T[1], G[1]], '#ffffff'],
      [[G[1], T[1], G[2]], '#bfe6ff'],
      [[T[1], T[2], G[2]], '#f3fbff'],
      [[G[2], T[2], G[3]], '#a9d9fb'],
      [[T[2], T[3], G[3]], '#dff3ff'],
      [[G[3], T[3], G[4]], '#8cc6ee'],
    ];
    crown.forEach(([pts, c]) => { poly(ctx, pts); ctx.fillStyle = c; ctx.fill(); });
    const pav = [];
    for (let i = 0; i < 4; i++) {
      const a = G[i];
      const b = G[i + 1];
      const m = [(a[0] + b[0]) / 2, gy];
      pav.push([a, m, C], [m, b, C]);
    }
    const pavColors = ['#d9f1ff', '#9bd0f5', '#ffffff', '#7fbde9', '#c7e9ff', '#6aaee0', '#b1dcfa', '#5c9fd4'];
    pav.forEach((pts, i) => { poly(ctx, pts); ctx.fillStyle = pavColors[i]; ctx.fill(); });
    // «огонь» камня
    ctx.save();
    poly(ctx, outline);
    ctx.clip();
    ctx.globalAlpha = 0.35;
    const fire = lin(ctx, 30, 70, 170, 160, [[0, '#ff9ad5'], [0.3, '#fff3a3'], [0.55, '#9effd8'], [0.8, '#9ab8ff'], [1, '#ff9ad5']]);
    ctx.fillStyle = fire;
    poly(ctx, [G[2], [120, gy], C]);
    ctx.fill();
    poly(ctx, [T[1], T[2], G[2]]);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    poly(ctx, [[64, ty + 2], [80, ty + 2], [40, gy - 2], [28, gy - 2]]);
    ctx.fill();
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(40,90,140,0.55)';
    crown.forEach(([pts]) => { poly(ctx, pts); ctx.stroke(); });
    pav.forEach((pts) => { poly(ctx, pts); ctx.stroke(); });
    ctx.beginPath();
    ctx.moveTo(G[0][0], gy);
    ctx.lineTo(G[4][0], gy);
    ctx.lineWidth = 2;
    ctx.stroke();
    poly(ctx, outline);
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = '#173f66';
    ctx.stroke();
    glint(ctx, 70, 54, 22);
    glint(ctx, 150, 92, 12, 0.85);
    glint(ctx, 104, 150, 8, 0.6);
  }

  function crown(ctx, k) {
    const gold = (y0, y1) => lin(ctx, 0, y0, 0, y1, [
      [0, '#fff4c2'], [0.25, '#f2c645'], [0.55, '#c08a12'], [0.8, '#8a5a06'], [1, '#e9bb47'],
    ]);
    const goldH = lin(ctx, 20, 0, 180, 0, [
      [0, '#7a4e04'], [0.18, '#d9a62a'], [0.36, '#fff0b0'], [0.52, '#e2b23a'], [0.78, '#a06c0a'], [1, '#5e3a02'],
    ]);
    // бархатная шапка
    ctx.fillStyle = rad(ctx, 88, 82, 6, 100, 104, 70, [[0, '#d0283f'], [0.6, '#7c0a1d'], [1, '#33020b']]);
    ctx.beginPath();
    ctx.ellipse(100, 108, 62, 50, 0, Math.PI, TAU);
    ctx.fill();
    const body = new Path2D('M30,132 L20,62 L62,98 L100,38 L138,98 L180,62 L170,132 Z');
    shadowed(ctx, k, 10, 'rgba(40,20,0,0.55)', 0, 6, () => {
      ctx.fillStyle = goldH;
      ctx.fill(body);
    });
    ctx.save();
    ctx.clip(body);
    ctx.fillStyle = gold(38, 132);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, 200, 200);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(100, 44);
    ctx.lineTo(106, 54);
    ctx.lineTo(70, 132);
    ctx.lineTo(60, 132);
    ctx.fill();
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#4e3000';
    ctx.stroke(body);
    // жемчужины на зубцах
    [[20, 60, 10], [100, 34, 12], [180, 60, 10], [62, 96, 6], [138, 96, 6]].forEach(([x, y, r]) => {
      shadowed(ctx, k, 4, 'rgba(0,0,0,0.4)', 0, 2, () => {
        ctx.fillStyle = rad(ctx, x - r * 0.35, y - r * 0.4, 1, x, y, r, [[0, '#ffffff'], [0.5, '#efe6d6'], [1, '#9c8e78']]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      });
    });
    // обруч
    shadowed(ctx, k, 8, 'rgba(0,0,0,0.5)', 0, 4, () => {
      roundRect(ctx, 22, 124, 156, 34, 8);
      ctx.fillStyle = goldH;
      ctx.fill();
    });
    roundRect(ctx, 22, 124, 156, 34, 8);
    ctx.fillStyle = gold(124, 158);
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#4e3000';
    ctx.stroke();
    const gem = (x, y, rx, ry, c1, c2, c3) => {
      ctx.fillStyle = rad(ctx, x - rx * 0.3, y - ry * 0.35, 1, x, y, Math.max(rx, ry), [[0, c1], [0.5, c2], [1, c3]]);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#4e3000';
      ctx.stroke();
      gloss(ctx, x - rx * 0.35, y - ry * 0.38, rx * 0.4, ry * 0.25, -0.4, 0.9);
    };
    gem(100, 141, 13, 11, '#ffd0d8', '#e0102f', '#5a0010');
    gem(58, 141, 9, 8, '#d8ecff', '#2160e0', '#081c5c');
    gem(142, 141, 9, 8, '#d8ffe8', '#14a050', '#03401c');
    ctx.fillStyle = '#fff6da';
    [36, 78, 122, 164].forEach((x) => { ctx.beginPath(); ctx.arc(x, 141, 3, 0, TAU); ctx.fill(); });
    glint(ctx, 100, 34, 18);
    banner(ctx, k, 'WILD', 164, {
      width: 112,
      fill: [[0, '#8c0a20'], [1, '#3a0008']],
      rim: [[0, '#fff1b8'], [0.5, '#d4a531'], [1, '#7a5208']],
      text: [[0, '#fff8d8'], [1, '#f1c24a']],
      textStroke: '#2a0005',
    });
  }

  /* ---------- Космос ---------- */

  function sphereShade(ctx, cx, cy, r, strength = 0.75) {
    ctx.fillStyle = rad(ctx, cx - r * 0.45, cy - r * 0.5, r * 0.2, cx - r * 0.1, cy - r * 0.1, r * 1.25,
      [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.08)'], [1, `rgba(0,0,8,${strength})`]]);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  function saturn(ctx, k) {
    ctx.save();
    ctx.translate(100, 100);
    ctx.rotate(-0.38);
    const ring = (front) => {
      ctx.save();
      ctx.beginPath();
      if (front) ctx.rect(-120, 0, 240, 120); else ctx.rect(-120, -120, 240, 120);
      ctx.clip();
      [[92, 25, 9, 'rgba(232,206,160,0.92)'], [80, 21, 6, 'rgba(178,140,92,0.85)'], [70, 18, 4, 'rgba(240,222,186,0.7)']].forEach(([rx, ry, w, c]) => {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.stroke();
      });
      ctx.restore();
    };
    ring(false);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, TAU);
    ctx.clip();
    const bands = ['#f7e4b8', '#e6be7e', '#f3d7a2', '#c99452', '#ecc88e', '#b37d3e', '#e8c38a', '#d4a467', '#f2d9a8'];
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(-60, -50 + i * (100 / bands.length), 120, 100 / bands.length + 1);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-60, -12, 120, 4);
    sphereShade(ctx, 0, 0, 50, 0.85);
    ctx.restore();
    // тень кольца на планете
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,20,0,0.35)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(0, 8, 86, 23, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    ring(true);
    ctx.restore();
    gloss(ctx, 78, 76, 16, 10, -0.6, 0.4);
  }

  function planet(ctx, k) {
    const cx = 100;
    const cy = 100;
    const r = 60;
    ctx.fillStyle = rad(ctx, cx, cy, r * 0.9, cx, cy, r * 1.28, [[0, 'rgba(90,200,255,0.55)'], [1, 'rgba(90,200,255,0)']]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.28, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = rad(ctx, cx - 20, cy - 24, 4, cx, cy, r, [[0, '#8fe0ff'], [0.5, '#2386d8'], [1, '#0a3478']]);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const rnd = mulberry32(42);
    const land = ['#4ea94a', '#6fbf4a', '#3e8c3c', '#c9b46a'];
    for (let c = 0; c < 4; c++) {
      const bx = cx - 40 + rnd() * 80;
      const by = cy - 40 + rnd() * 80;
      ctx.fillStyle = land[c % land.length];
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(bx + (rnd() - 0.5) * 34, by + (rnd() - 0.5) * 26, 6 + rnd() * 12, 0, TAU);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      ctx.lineWidth = 3 + rnd() * 4;
      const y = cy - 45 + rnd() * 90;
      const x = cx - 50 + rnd() * 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 20, y - 6, x + 40, y + 6, x + 30 + rnd() * 40, y - 2);
      ctx.stroke();
    }
    sphereShade(ctx, cx, cy, r, 0.9);
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(160,230,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.95, Math.PI * 1.65);
    ctx.stroke();
    gloss(ctx, cx - 26, cy - 30, 18, 11, -0.6, 0.45);
  }

  function mars(ctx, k) {
    const cx = 100;
    const cy = 102;
    const r = 58;
    ctx.fillStyle = rad(ctx, cx, cy, r * 0.9, cx, cy, r * 1.2, [[0, 'rgba(255,120,60,0.4)'], [1, 'rgba(255,120,60,0)']]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.2, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = rad(ctx, cx - 22, cy - 24, 4, cx, cy, r, [[0, '#ffc08a'], [0.45, '#e0602a'], [1, '#7a240c']]);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const rnd = mulberry32(7);
    ctx.fillStyle = 'rgba(120,40,10,0.35)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(cx - 50 + rnd() * 100, cy - 40 + rnd() * 80, 14 + rnd() * 18, 6 + rnd() * 8, rnd(), 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      const x = cx - 45 + rnd() * 90;
      const y = cy - 45 + rnd() * 90;
      const cr = 3 + rnd() * 7;
      ctx.fillStyle = 'rgba(90,25,5,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,160,0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x + 0.8, y + 0.8, cr, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - 6, cy - r + 6, 20, 8, -0.15, 0, TAU);
    ctx.fill();
    sphereShade(ctx, cx, cy, r, 0.85);
    ctx.restore();
    gloss(ctx, cx - 24, cy - 28, 16, 10, -0.6, 0.4);
  }

  function rocket(ctx, k) {
    ctx.save();
    ctx.translate(100, 104);
    ctx.rotate(0.62);
    // пламя
    shadowed(ctx, k, 22, 'rgba(255,140,40,0.9)', 0, 0, () => {
      ctx.fillStyle = rad(ctx, 0, 58, 2, 0, 66, 40, [[0, '#ffffff'], [0.25, '#fff2a0'], [0.55, '#ff9a2a'], [1, 'rgba(255,60,20,0)']]);
      ctx.beginPath();
      ctx.moveTo(-17, 52);
      ctx.quadraticCurveTo(-14, 84, 0, 108);
      ctx.quadraticCurveTo(14, 84, 17, 52);
      ctx.closePath();
      ctx.fill();
    });
    const steel = lin(ctx, -34, 0, 34, 0, [[0, '#6f7a90'], [0.3, '#ffffff'], [0.55, '#dfe4ee'], [1, '#6b7488']]);
    const red = lin(ctx, -34, 0, 34, 0, [[0, '#7a0010'], [0.35, '#ff4b5c'], [0.6, '#d8102a'], [1, '#5a000c']]);
    // стабилизаторы
    const fin = (s) => {
      ctx.beginPath();
      ctx.moveTo(30 * s, 8);
      ctx.quadraticCurveTo(58 * s, 26, 58 * s, 62);
      ctx.lineTo(32 * s, 48);
      ctx.closePath();
      ctx.fillStyle = red;
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#3a0008';
      ctx.stroke();
    };
    fin(-1);
    fin(1);
    const body = new Path2D('M0,-86 C26,-62 34,-30 34,8 L32,50 L-32,50 L-34,8 C-34,-30 -26,-62 0,-86 Z');
    shadowed(ctx, k, 8, 'rgba(0,0,0,0.45)', 0, 4, () => {
      ctx.fillStyle = steel;
      ctx.fill(body);
    });
    ctx.save();
    ctx.clip(body);
    ctx.fillStyle = red;
    ctx.fillRect(-40, -90, 80, 44);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-40, -47, 80, 3);
    ctx.fillStyle = red;
    ctx.fillRect(-40, 34, 80, 20);
    ctx.restore();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#2a2f3c';
    ctx.stroke(body);
    // сопло
    ctx.fillStyle = lin(ctx, -18, 0, 18, 0, [[0, '#3b3f4a'], [0.5, '#a9b0bf'], [1, '#2b2f38']]);
    ctx.beginPath();
    ctx.moveTo(-16, 50);
    ctx.lineTo(16, 50);
    ctx.lineTo(19, 60);
    ctx.lineTo(-19, 60);
    ctx.closePath();
    ctx.fill();
    // иллюминатор
    ctx.fillStyle = lin(ctx, 0, -30, 0, 2, [[0, '#d7dce6'], [1, '#6c7486']]);
    ctx.beginPath();
    ctx.arc(0, -14, 17, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rad(ctx, -5, -20, 1, 0, -14, 13, [[0, '#d6f6ff'], [0.4, '#3fb6ff'], [1, '#0a2f6e']]);
    ctx.beginPath();
    ctx.arc(0, -14, 12.5, 0, TAU);
    ctx.fill();
    gloss(ctx, -5, -19, 6, 3.5, -0.6, 0.95);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#2a2f3c';
    ctx.beginPath();
    ctx.arc(0, -14, 17, 0, TAU);
    ctx.stroke();
    // центральный стабилизатор
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(-4, 16);
    ctx.lineTo(4, 16);
    ctx.lineTo(4, 62);
    ctx.lineTo(-4, 62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    glint(ctx, 130, 52, 12, 0.8);
  }

  function star(ctx, k) {
    const cx = 100;
    const cy = 86;
    ctx.fillStyle = rad(ctx, cx, cy, 10, cx, cy, 96, [[0, 'rgba(255,240,170,0.75)'], [0.4, 'rgba(255,170,60,0.25)'], [1, 'rgba(255,120,40,0)']]);
    ctx.fillRect(0, 0, 200, 200);
    // лучи
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.fillStyle = 'rgba(255,236,170,0.22)';
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(0, -96);
      ctx.lineTo(3, 0);
      ctx.fill();
    }
    ctx.restore();
    const outerR = 70;
    const innerR = 30;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    shadowed(ctx, k, 16, 'rgba(255,170,30,0.9)', 0, 0, () => {
      poly(ctx, pts);
      ctx.fillStyle = '#ffb300';
      ctx.fill();
    });
    // скосы граней
    for (let i = 0; i < 10; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % 10];
      poly(ctx, [[cx, cy], p0, p1]);
      const a = Math.atan2((p0[1] + p1[1]) / 2 - cy, (p0[0] + p1[0]) / 2 - cx);
      const b = 0.5 + 0.5 * Math.cos(a + 2.2);
      ctx.fillStyle = ramp(['#b85a00', '#ff9d00', '#ffd23f', '#fff6c8'])(b * 0.9 + (i % 2) * 0.1);
      ctx.fill();
    }
    poly(ctx, pts);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#7a3a00';
    ctx.stroke();
    glint(ctx, cx, cy, 26, 0.95);
    glint(ctx, cx - 40, cy - 30, 10, 0.8);
    banner(ctx, k, 'WILD', 160, {
      width: 116,
      fill: [[0, '#2a0b5a'], [1, '#0d0428']],
      rim: [[0, '#ff7bf0'], [0.5, '#9a5bff'], [1, '#33e6ff']],
      text: [[0, '#ffffff'], [1, '#ffd84a']],
      textStroke: '#14002e',
      font: FONT_HEAVY,
    });
  }

  function galaxy(ctx, k) {
    const cx = 100;
    const cy = 88;
    ctx.fillStyle = rad(ctx, cx, cy, 4, cx, cy, 92, [[0, 'rgba(255,220,255,0.9)'], [0.2, 'rgba(220,90,255,0.45)'], [0.6, 'rgba(90,40,200,0.18)'], [1, 'rgba(40,0,90,0)']]);
    ctx.fillRect(0, 0, 200, 200);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.45);
    ctx.scale(1, 0.62);
    const rnd = mulberry32(99);
    const colors = ['#ffffff', '#ffd6ff', '#d59bff', '#9f7bff', '#7fd8ff', '#ff8fd8'];
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 900; i++) {
        const t = rnd();
        const theta = t * 3.4 * Math.PI + arm * Math.PI;
        const r = 6 + 78 * t;
        const spread = 4 + 14 * t;
        const x = Math.cos(theta) * r + (rnd() - 0.5) * spread;
        const y = Math.sin(theta) * r + (rnd() - 0.5) * spread;
        const s = 0.5 + rnd() * (1.6 - t);
        ctx.globalAlpha = 0.35 + rnd() * 0.6;
        ctx.fillStyle = colors[Math.min(colors.length - 1, Math.floor(t * colors.length + rnd() * 1.5))];
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, 26, [[0, '#ffffff'], [0.35, 'rgba(255,240,220,0.9)'], [1, 'rgba(255,180,255,0)']]);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.restore();
    glint(ctx, cx, cy, 30, 1);
    glint(ctx, 44, 44, 7, 0.8);
    glint(ctx, 160, 130, 6, 0.7);
    banner(ctx, k, 'BONUS', 160, {
      width: 130,
      fill: [[0, '#6b0b7a'], [1, '#22002e']],
      rim: [[0, '#ffe08a'], [0.5, '#ff7bf0'], [1, '#a64bff']],
      text: [[0, '#ffffff'], [1, '#ffc6f5']],
      textStroke: '#22002e',
      font: FONT_HEAVY,
    });
  }

  function neonLetter(text, color, size = 112) {
    return function (ctx, k) {
      ctx.font = `800 ${size}px ${FONT_HEAVY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const x = 100;
      const y = 104;
      ctx.lineJoin = 'round';
      shadowed(ctx, k, 26, color, 0, 0, () => {
        ctx.lineWidth = 12;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.strokeText(text, x, y);
      });
      ctx.globalAlpha = 1;
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#0a0418';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = lin(ctx, 0, y - size * 0.45, 0, y + size * 0.45, [[0, '#ffffff'], [0.4, color], [1, color]]);
      shadowed(ctx, k, 14, color, 0, 0, () => ctx.fillText(text, x, y));
    };
  }

  const DRAW = {
    CHERRY: cherry,
    LEMON: lemon,
    ORANGE: orange,
    PLUM: plum,
    BELL: bell,
    BAR: bar,
    SEVEN: seven,
    _: () => {},
    RUBY: ruby,
    SAPPHIRE: sapphire,
    EMERALD: emerald,
    AMETHYST: amethyst,
    TOPAZ: topaz,
    DIAMOND: diamond,
    CROWN: crown,
    ROCKET: rocket,
    SATURN: saturn,
    PLANET: planet,
    MARS: mars,
    STAR: star,
    GALAXY: galaxy,
    A: neonLetter('A', '#ff3d9a'),
    K: neonLetter('K', '#33e4ff'),
    Q: neonLetter('Q', '#7dff5c'),
    J: neonLetter('J', '#ffb13d'),
    TEN: neonLetter('10', '#b27dff', 92),
  };

  /* ---------- Кеш спрайтов ---------- */

  const cache = new Map();

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function render(id, size) {
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const k = size / BASE;
    ctx.scale(k, k);
    (DRAW[id] || DRAW._)(ctx, k);
    return c;
  }

  // Вертикальный «смаз» для быстрого вращения: среднее нескольких сдвинутых копий.
  function blurred(src, amount) {
    const c = makeCanvas(src.width, src.height);
    const ctx = c.getContext('2d');
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const off = ((i / (steps - 1)) - 0.5) * amount * src.height;
      ctx.globalAlpha = 1 / (i + 1);
      ctx.drawImage(src, 0, off);
    }
    ctx.globalAlpha = 1;
    return c;
  }

  function get(id, size) {
    size = Math.round(size);
    const key = id + '@' + size;
    let entry = cache.get(key);
    if (!entry) {
      const normal = render(id, size);
      entry = { normal, blur: null };
      cache.set(key, entry);
    }
    return entry;
  }

  function getBlur(id, size) {
    const entry = get(id, size);
    if (!entry.blur) entry.blur = blurred(entry.normal, 0.22);
    return entry.blur;
  }

  function dataURL(id, size) {
    return get(id, size).normal.toDataURL('image/png');
  }

  function clear() { cache.clear(); }

  let fontsReady = null;
  function ready() {
    if (fontsReady) return fontsReady;
    if (!document.fonts || !document.fonts.load) return (fontsReady = Promise.resolve());
    const loads = Promise.all([
      document.fonts.load(`800 60px ${FONT_UI}`),
      document.fonts.load(`800 60px ${FONT_HEAVY}`),
    ]).catch(() => {});
    const timeout = new Promise((r) => setTimeout(r, 2500));
    fontsReady = Promise.race([loads, timeout]);
    return fontsReady;
  }

  root.Symbols = { get, getBlur, dataURL, clear, ready, ids: Object.keys(DRAW) };
})(window);
