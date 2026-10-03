/*
 * Сборка зала: общий баланс, статистика сессии, таблицы выплат,
 * клавиатура, звук и запуск трёх автоматов.
 */
(function (root) {
  'use strict';

  const fmt = new Intl.NumberFormat('ru-RU');
  const pct = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const START_BALANCE = 1000;
  const REFILL = 1000;
  const STORE = 'aurum.balance';

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* приватный режим — играем без сохранения */ }
    return null;
  }

  /* ---------- Баланс ---------- */

  const wallet = {
    balance: START_BALANCE,
    shown: START_BALANCE,
    listeners: [],
    raf: 0,
    load() {
      const v = Number(store(STORE));
      if (Number.isFinite(v) && v >= 0 && store(STORE) !== null) this.balance = Math.floor(v);
      this.shown = this.balance;
      this.emit();
    },
    save() { store(STORE, String(this.balance)); },
    canAfford(x) { return this.balance >= x; },
    debit(x) { this.balance -= x; this.save(); this.animate(220); },
    credit(x, ms = 600) { this.balance += x; this.save(); this.animate(ms); },
    onChange(fn) { this.listeners.push(fn); fn(this.shown, this.balance); },
    emit() { this.listeners.forEach((fn) => fn(this.shown, this.balance)); },
    animate(ms) {
      cancelAnimationFrame(this.raf);
      const from = this.shown;
      const to = this.balance;
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / Math.max(1, ms));
        this.shown = Math.round(from + (to - from) * t);
        this.emit();
        if (t < 1) this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },
  };

  /* ---------- Статистика сессии ---------- */

  const stats = {
    spins: 0,
    bet: 0,
    won: 0,
    best: 0,
    spin(bet) { this.spins++; this.bet += bet; this.render(); },
    win(x) { this.won += x; this.best = Math.max(this.best, x); this.render(); },
    render() {
      const set = (k, v) => { const el = document.querySelector(`[data-stat="${k}"]`); if (el) el.textContent = v; };
      set('spins', fmt.format(this.spins));
      set('bet', fmt.format(this.bet));
      set('won', fmt.format(this.won));
      set('best', fmt.format(this.best));
      set('rtp', this.bet ? pct.format((this.won / this.bet) * 100) + ' %' : '—');
    },
  };

  /* ---------- Таблицы выплат ---------- */

  function icon(id, size = 40) {
    const img = document.createElement('img');
    img.src = Symbols.dataURL(id, size * 2);
    img.width = size;
    img.height = size;
    img.alt = '';
    img.decoding = 'async';
    return img;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Табличка выплат на «брюхе» Lucky 7.
  function renderBelly(machine, box) {
    box.textContent = '';
    machine.pays.forEach((p) => {
      const row = el('div', 'belly-row');
      const icons = el('span', 'belly-icons');
      p.combo.forEach((s) => {
        if (s === '*') {
          const any = el('span', 'belly-any', '—');
          any.title = 'любой символ';
          icons.appendChild(any);
        }
        else icons.appendChild(icon(s, 26));
      });
      row.append(icons, el('span', 'belly-dots'), el('b', 'belly-pay', fmt.format(p.pay)));
      box.appendChild(row);
    });
  }

  function linesDiagram(machine) {
    const wrap = el('div', 'pt-lines');
    const cols = machine.reels;
    const rows = machine.rows;
    machine.lines.forEach((line, i) => {
      const fig = el('figure', 'pt-line');
      const w = cols * 12;
      const h = rows * 12;
      const color = Reels.LINE_COLORS[i % Reels.LINE_COLORS.length];
      let cells = '';
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const on = line[c] === r;
          cells += `<rect x="${c * 12 + 1.5}" y="${r * 12 + 1.5}" width="9" height="9" rx="2" fill="${on ? color : 'currentColor'}" fill-opacity="${on ? 1 : 0.18}"/>`;
        }
      }
      fig.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w * 2.4}" height="${h * 2.4}" aria-hidden="true">${cells}</svg><figcaption>${i + 1}</figcaption>`;
      wrap.appendChild(fig);
    });
    return wrap;
  }

  function renderPaytable(slot) {
    const m = slot.m;
    const body = document.getElementById('pt-body');
    const title = document.getElementById('pt-title');
    const sub = document.getElementById('pt-sub');
    title.textContent = m.name;
    body.textContent = '';
    const dialog = document.getElementById('paytable');
    dialog.dataset.machine = m.id;

    if (m.id === 'classic') {
      sub.textContent = `Множитель за 1 кредит ставки; справа — выигрыш при текущей ставке ${fmt.format(slot.totalBet)}. Прочерк — любой символ.`;
      const list = el('div', 'pt-grid pt-grid--classic');
      m.pays.forEach((p) => {
        const row = el('div', 'pt-row');
        const icons = el('span', 'pt-icons');
        p.combo.forEach((s) => icons.appendChild(s === '*' ? el('span', 'pt-any', '—') : icon(s, 34)));
        row.append(icons, el('b', 'pt-pay', `× ${fmt.format(p.pay)}`), el('span', 'pt-credit', fmt.format(p.pay * slot.totalBet)));
        list.appendChild(row);
      });
      body.appendChild(list);
      body.appendChild(el('p', 'pt-note', 'Комбинация считается на центральной линии слева направо. Вишня на первом барабане выигрывает всегда. Механика барабанов — 22 физические остановки, вероятности задаёт «виртуальный барабан» на 64 позиции, как в настоящих автоматах.'));
    } else if (m.id === 'jewels') {
      sub.textContent = `Выплаты × ставка на линию (сейчас ${fmt.format(slot.lineBet)}). Три одинаковых символа на линии.`;
      const list = el('div', 'pt-grid');
      Object.keys(m.pays).forEach((s) => {
        const row = el('div', 'pt-row');
        const name = el('span', 'pt-name', m.symbols[s]);
        if (s === m.wild) name.appendChild(el('small', null, 'заменяет любой камень'));
        row.append(icon(s, 44), name, el('b', 'pt-pay', `× ${fmt.format(m.pays[s])}`));
        list.appendChild(row);
      });
      body.appendChild(list);
      body.appendChild(el('h3', 'pt-h', 'Линии выплат'));
      body.appendChild(linesDiagram(m));
    } else {
      sub.textContent = `Выплаты × ставка на линию (сейчас ${fmt.format(slot.lineBet)}) за 3, 4 и 5 символов подряд слева направо.`;
      const list = el('div', 'pt-grid pt-grid--cosmic');
      const head = el('div', 'pt-row pt-head');
      head.append(el('span'), el('span'), el('span', null, '×3'), el('span', null, '×4'), el('span', null, '×5'));
      list.appendChild(head);
      Object.keys(m.pays).forEach((s) => {
        const row = el('div', 'pt-row');
        row.append(icon(s, 40), el('span', 'pt-name', m.symbols[s]));
        [3, 4, 5].forEach((n) => row.appendChild(el('b', 'pt-pay', fmt.format(m.pays[s][n]))));
        list.appendChild(row);
      });
      body.appendChild(list);
      const specials = el('div', 'pt-specials');
      const wild = el('div', 'pt-special');
      wild.append(icon('STAR', 52), el('p', null, 'Сверхновая — дикий символ. Появляется на барабанах 2–4 стопками по три и заменяет все символы, кроме галактики.'));
      const scat = el('div', 'pt-special');
      scat.append(icon('GALAXY', 52), el('p', null, `Галактика — бонус. Выпадает на барабанах 1, 3 и 5. Три галактики в любом месте: ${m.scatterPays[3]} × общая ставка и ${m.freeSpinsAward} бесплатных вращений, в которых выигрыши на линиях удваиваются. Бонус может запуститься повторно.`));
      specials.append(wild, scat);
      body.appendChild(specials);
      body.appendChild(el('h3', 'pt-h', 'Линии выплат'));
      body.appendChild(linesDiagram(m));
    }
  }

  /* ---------- Гирлянда ламп по контуру вывески ---------- */

  function placeBulbs(box) {
    const host = box.parentElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    const cs = getComputedStyle(host);
    let rx = parseFloat(cs.borderTopLeftRadius) || 0;
    let ry = parseFloat(cs.borderTopLeftRadius.split(' ')[1] || cs.borderTopLeftRadius) || 0;
    // браузер пропорционально уменьшает радиусы, если они не помещаются
    const bw = parseFloat(cs.borderLeftWidth) || 0;
    const f = Math.min(1, (w + 2 * bw) / (2 * rx), (h + bw) / ry);
    rx = rx * f - bw;
    ry = ry * f - bw;
    const inset = 11;
    // контур: левая сторона снизу вверх → верхняя дуга → правая сторона вниз
    const pts = [];
    const ax = rx - inset;
    const ay = ry - inset;
    const steps = 400;
    const path = [];
    path.push([inset, h - inset]);
    path.push([inset, ry]);
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (i / steps) * (Math.PI / 2);
      path.push([rx + Math.cos(a) * ax, ry + Math.sin(a) * ay]);
    }
    path.push([w - rx, inset]);
    for (let i = 0; i <= steps; i++) {
      const a = 1.5 * Math.PI + (i / steps) * (Math.PI / 2);
      path.push([w - rx + Math.cos(a) * ax, ry + Math.sin(a) * ay]);
    }
    path.push([w - inset, h - inset]);
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const count = Math.max(12, Math.round(total / 24));
    const spacing = total / (count - 1);
    let acc = 0;
    let next = 0;
    for (let i = 1; i < path.length && pts.length < count; i++) {
      const [x0, y0] = path[i - 1];
      const [x1, y1] = path[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      while (next <= acc + seg && pts.length < count) {
        const t = seg ? (next - acc) / seg : 0;
        pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
        next += spacing;
      }
      acc += seg;
    }
    box.textContent = '';
    pts.forEach(([x, y], i) => {
      const b = document.createElement('i');
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
      b.style.setProperty('--i', i % 3);
      box.appendChild(b);
    });
  }

  /* ---------- Приложение ---------- */

  const app = {
    wallet,
    stats,
    machines: [],
    active: null,
    setActive(m) {
      if (this.active === m) return;
      this.machines.forEach((x) => x.el.classList.toggle('is-active', x === m));
      this.active = m;
    },
    openPaytable(slot) {
      renderPaytable(slot);
      const d = document.getElementById('paytable');
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    },
    announce(text) {
      const a = document.getElementById('announcer');
      a.textContent = '';
      setTimeout(() => { a.textContent = text; }, 30);
    },
    nudgeRefill() {
      const b = document.getElementById('refill');
      b.hidden = false;
      b.classList.remove('nudge');
      void b.offsetWidth;
      b.classList.add('nudge');
    },
  };

  function initHeader() {
    const bal = document.getElementById('balance');
    const refill = document.getElementById('refill');
    wallet.onChange((shown, real) => {
      bal.textContent = fmt.format(shown);
      app.machines.forEach((m) => m.setCredit(shown));
      refill.hidden = real >= 100;
    });
    refill.addEventListener('click', () => {
      Sound.unlock();
      Sound.play('coin');
      wallet.credit(REFILL, 900);
      app.announce(`Демо-счёт пополнен на ${fmt.format(REFILL)} кредитов`);
    });

    const snd = document.getElementById('sound-toggle');
    const syncSound = () => {
      snd.setAttribute('aria-pressed', String(!Sound.muted));
      snd.setAttribute('aria-label', Sound.muted ? 'Включить звук' : 'Выключить звук');
      snd.title = Sound.muted ? 'Звук выключен' : 'Звук включён';
    };
    snd.addEventListener('click', () => { Sound.setMuted(!Sound.muted); syncSound(); });
    syncSound();

    const dialog = document.getElementById('paytable');
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-close]')) dialog.close ? dialog.close() : dialog.removeAttribute('open');
    });
  }

  function initKeyboard() {
    root.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target;
      if (t && (t.closest('button, a, input, select, textarea, dialog[open]'))) return;
      e.preventDefault();
      const m = app.active || app.machines[0];
      if (m) m.press();
    });
  }

  function start() {
    FX.init(document.getElementById('fx'));
    initHeader();
    initKeyboard();
    const ids = { classic: 'lucky-7', cosmic: 'cosmic-fortune', jewels: 'crown-jewels' };
    Object.keys(ids).forEach((key) => {
      const node = document.getElementById(ids[key]);
      if (!node) return;
      const slot = new SlotMachine(node, Engine.machines[key], app);
      app.machines.push(slot);
    });
    app.setActive(app.machines[0]);
    wallet.load();
    stats.render();

    document.querySelectorAll('img[data-sym]').forEach((img) => {
      img.src = Symbols.dataURL(img.dataset.sym, (Number(img.getAttribute('width')) || 64) * 2);
    });

    const belly = document.querySelector('[data-belly]');
    if (belly) renderBelly(Engine.machines.classic, belly);

    document.querySelectorAll('[data-bulbs]').forEach((box) => {
      placeBulbs(box);
      new ResizeObserver(() => placeBulbs(box)).observe(box.parentElement);
    });

    // Первый жест на странице разблокирует звук.
    const unlock = () => { Sound.unlock(); root.removeEventListener('pointerdown', unlock); root.removeEventListener('keydown', unlock); };
    root.addEventListener('pointerdown', unlock);
    root.addEventListener('keydown', unlock);
    document.documentElement.classList.add('is-ready');
  }

  Symbols.ready().then(start);
  root.CasinoApp = app;
})(window);
