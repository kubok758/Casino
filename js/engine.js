/*
 * Игровая математика: ленты барабанов, линии выплат, таблицы выплат.
 * Файл работает и в браузере (window.Engine), и в Node (require) —
 * так tools/rtp.js считает RTP по тем же данным, что использует игра.
 */
(function (root) {
  'use strict';

  /* ---------- Генератор случайных чисел ---------- */

  const cryptoObj = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
  const buf = new Uint32Array(1);

  // Равномерное целое в [0, n) без смещения по модулю.
  function randInt(n) {
    if (cryptoObj && cryptoObj.getRandomValues) {
      const limit = Math.floor(0x100000000 / n) * n;
      let x;
      do { cryptoObj.getRandomValues(buf); x = buf[0]; } while (x >= limit);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }

  // Выбор позиции по весам «виртуального барабана».
  function weightedIndex(weights, total) {
    let r = randInt(total);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /* ---------- Вспомогательные построители лент ---------- */

  // Классическая лента: символ, пробел, символ, пробел…
  function withBlanks(symbols) {
    const out = [];
    symbols.forEach((s) => { out.push(s); out.push('_'); });
    return out;
  }

  /* ---------- Автомат 1: Lucky 7 (механика 1960-х) ---------- */

  const classic = {
    id: 'classic',
    name: 'Lucky 7',
    reels: 3,
    rows: 1,
    blank: '_',
    lines: [[0, 0, 0]],
    bets: [1, 2, 5, 10, 20, 50],
    defaultBet: 2,
    linesPlayed: 1,
    symbols: {
      SEVEN: 'Семёрка',
      BAR: 'BAR',
      BELL: 'Колокол',
      PLUM: 'Слива',
      ORANGE: 'Апельсин',
      LEMON: 'Лимон',
      CHERRY: 'Вишня',
      _: 'Пусто',
    },
    // 22 физические остановки: 11 символов и 11 пробелов.
    strips: [
      withBlanks(['CHERRY', 'BELL', 'PLUM', 'BAR', 'ORANGE', 'LEMON', 'CHERRY', 'PLUM', 'SEVEN', 'ORANGE', 'BELL']),
      withBlanks(['BELL', 'ORANGE', 'CHERRY', 'BAR', 'PLUM', 'LEMON', 'BELL', 'SEVEN', 'ORANGE', 'BAR', 'PLUM']),
      withBlanks(['PLUM', 'LEMON', 'BELL', 'ORANGE', 'SEVEN', 'CHERRY', 'BAR', 'LEMON', 'ORANGE', 'BELL', 'PLUM']),
    ],
    // Виртуальный барабан: вес символа на каждом барабане из 64 виртуальных остановок,
    // пробелы делят оставшийся вес поровну. Из этих чисел строятся веса физических остановок.
    virtualStops: 64,
    symbolWeights: [
      { SEVEN: 2, BAR: 4, BELL: 6, PLUM: 8, ORANGE: 8, LEMON: 9, CHERRY: 11 },
      { SEVEN: 2, BAR: 4, BELL: 6, PLUM: 8, ORANGE: 9, LEMON: 9, CHERRY: 10 },
      { SEVEN: 2, BAR: 4, BELL: 6, PLUM: 8, ORANGE: 9, LEMON: 10, CHERRY: 9 },
    ],
    weights: null,
    pays: [
      { combo: ['SEVEN', 'SEVEN', 'SEVEN'], pay: 1000 },
      { combo: ['BAR', 'BAR', 'BAR'], pay: 200 },
      { combo: ['BELL', 'BELL', 'BELL'], pay: 80 },
      { combo: ['PLUM', 'PLUM', 'PLUM'], pay: 40 },
      { combo: ['ORANGE', 'ORANGE', 'ORANGE'], pay: 30 },
      { combo: ['LEMON', 'LEMON', 'LEMON'], pay: 25 },
      { combo: ['CHERRY', 'CHERRY', 'CHERRY'], pay: 30 },
      { combo: ['CHERRY', 'CHERRY', '*'], pay: 8 },
      { combo: ['CHERRY', '*', '*'], pay: 2 },
    ],
    evaluate(grid, bet) {
      const line = [grid[0][0], grid[1][0], grid[2][0]];
      for (const p of this.pays) {
        let ok = true;
        for (let i = 0; i < 3; i++) {
          if (p.combo[i] !== '*' && p.combo[i] !== line[i]) { ok = false; break; }
        }
        if (ok) {
          const count = p.combo.filter((c) => c !== '*').length;
          const cells = [];
          for (let i = 0; i < count; i++) cells.push([i, 0]);
          return {
            total: p.pay * bet,
            lines: [{ line: 0, symbol: line[0], count, cells, pay: p.pay * bet }],
            scatter: null,
            freeSpins: 0,
            multiplier: p.pay,
          };
        }
      }
      return { total: 0, lines: [], scatter: null, freeSpins: 0, multiplier: 0 };
    },
  };

  // Веса физических остановок по таблице symbolWeights.
  function buildVirtualWeights(machine) {
    machine.weights = machine.strips.map((strip, r) => {
      const symW = machine.symbolWeights[r];
      const occurrences = {};
      strip.forEach((s) => { occurrences[s] = (occurrences[s] || 0) + 1; });
      const w = strip.map((s) => (s === '_' ? 0 : symW[s] / occurrences[s]));
      const used = w.reduce((a, b) => a + b, 0);
      return w.map((x, i) => (strip[i] === '_' ? (machine.virtualStops - used) / occurrences._ : x));
    });
  }
  buildVirtualWeights(classic);

  /* ---------- Автомат 2: Crown Jewels (3×3, 5 линий) ---------- */

  const jewels = {
    id: 'jewels',
    name: 'Crown Jewels',
    reels: 3,
    rows: 3,
    wild: 'CROWN',
    lines: [
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
      [0, 1, 2],
      [2, 1, 0],
    ],
    bets: [1, 2, 4, 10, 20],
    defaultBet: 2,
    linesPlayed: 5,
    symbols: {
      CROWN: 'Корона',
      DIAMOND: 'Бриллиант',
      RUBY: 'Рубин',
      SAPPHIRE: 'Сапфир',
      EMERALD: 'Изумруд',
      AMETHYST: 'Аметист',
      TOPAZ: 'Топаз',
    },
    pays: {
      CROWN: 300,
      DIAMOND: 100,
      RUBY: 45,
      SAPPHIRE: 25,
      EMERALD: 15,
      AMETHYST: 11,
      TOPAZ: 8,
    },
    strips: [
      ['TOPAZ', 'RUBY', 'AMETHYST', 'EMERALD', 'TOPAZ', 'CROWN', 'SAPPHIRE', 'AMETHYST', 'TOPAZ', 'EMERALD',
        'DIAMOND', 'AMETHYST', 'TOPAZ', 'SAPPHIRE', 'EMERALD', 'TOPAZ', 'RUBY', 'AMETHYST', 'EMERALD', 'TOPAZ',
        'SAPPHIRE', 'AMETHYST', 'EMERALD', 'DIAMOND'],
      ['AMETHYST', 'TOPAZ', 'SAPPHIRE', 'EMERALD', 'AMETHYST', 'RUBY', 'TOPAZ', 'EMERALD', 'CROWN', 'AMETHYST',
        'TOPAZ', 'SAPPHIRE', 'EMERALD', 'DIAMOND', 'TOPAZ', 'AMETHYST', 'EMERALD', 'RUBY', 'TOPAZ', 'SAPPHIRE',
        'AMETHYST', 'EMERALD', 'TOPAZ', 'AMETHYST'],
      ['EMERALD', 'TOPAZ', 'AMETHYST', 'RUBY', 'EMERALD', 'TOPAZ', 'SAPPHIRE', 'AMETHYST', 'CROWN', 'TOPAZ',
        'EMERALD', 'AMETHYST', 'DIAMOND', 'TOPAZ', 'SAPPHIRE', 'EMERALD', 'AMETHYST', 'TOPAZ', 'RUBY', 'EMERALD',
        'AMETHYST', 'TOPAZ', 'SAPPHIRE', 'AMETHYST'],
    ],
    evaluate(grid, lineBet) {
      const res = { total: 0, lines: [], scatter: null, freeSpins: 0 };
      this.lines.forEach((rowsOfLine, li) => {
        const syms = rowsOfLine.map((row, r) => grid[r][row]);
        const nonWild = syms.filter((s) => s !== this.wild);
        let pay = 0;
        let symbol = null;
        if (nonWild.length === 0) {
          symbol = this.wild;
          pay = this.pays[this.wild];
        } else if (nonWild.every((s) => s === nonWild[0])) {
          symbol = nonWild[0];
          pay = this.pays[symbol];
        }
        if (pay > 0) {
          const amount = pay * lineBet;
          res.total += amount;
          res.lines.push({
            line: li, symbol, count: 3, pay: amount,
            cells: rowsOfLine.map((row, r) => [r, row]),
          });
        }
      });
      return res;
    },
  };

  /* ---------- Автомат 3: Cosmic Fortune (5×3, 10 линий) ---------- */

  const cosmic = {
    id: 'cosmic',
    name: 'Cosmic Fortune',
    reels: 5,
    rows: 3,
    wild: 'STAR',
    scatter: 'GALAXY',
    lines: [
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [2, 2, 2, 2, 2],
      [0, 1, 2, 1, 0],
      [2, 1, 0, 1, 2],
      [0, 0, 1, 2, 2],
      [2, 2, 1, 0, 0],
      [1, 0, 0, 0, 1],
      [1, 2, 2, 2, 1],
      [1, 0, 1, 2, 1],
    ],
    bets: [1, 2, 5, 10],
    defaultBet: 1,
    linesPlayed: 10,
    freeSpinsAward: 10,
    freeSpinsMultiplier: 2,
    symbols: {
      STAR: 'Сверхновая',
      GALAXY: 'Галактика',
      ROCKET: 'Ракета',
      SATURN: 'Сатурн',
      PLANET: 'Голубая планета',
      MARS: 'Марс',
      A: 'Туз',
      K: 'Король',
      Q: 'Дама',
      J: 'Валет',
      TEN: 'Десятка',
    },
    pays: {
      ROCKET: [0, 0, 0, 50, 300, 2500],
      SATURN: [0, 0, 0, 35, 150, 750],
      PLANET: [0, 0, 0, 25, 100, 450],
      MARS: [0, 0, 0, 20, 80, 350],
      A: [0, 0, 0, 12, 60, 250],
      K: [0, 0, 0, 10, 50, 200],
      Q: [0, 0, 0, 8, 35, 150],
      J: [0, 0, 0, 6, 30, 120],
      TEN: [0, 0, 0, 6, 30, 120],
    },
    scatterPays: [0, 0, 0, 5, 0, 0], // × общая ставка
    strips: [
      ['PLANET', 'K', 'GALAXY', 'Q', 'SATURN', 'A', 'TEN', 'J', 'TEN', 'J', 'K', 'ROCKET', 'MARS', 'PLANET',
        'A', 'Q', 'TEN', 'J', 'Q', 'K', 'GALAXY', 'TEN', 'SATURN', 'A', 'MARS', 'PLANET', 'Q', 'TEN', 'K', 'J',
        'ROCKET', 'J', 'A', 'Q', 'TEN', 'J', 'MARS'],
      ['PLANET', 'STAR', 'STAR', 'STAR', 'A', 'J', 'ROCKET', 'K', 'A', 'J', 'MARS', 'Q', 'TEN', 'TEN', 'Q',
        'SATURN', 'K', 'A', 'PLANET', 'J', 'TEN', 'Q', 'MARS', 'Q', 'ROCKET', 'K', 'A', 'J', 'TEN', 'Q', 'TEN',
        'J', 'TEN', 'SATURN', 'MARS', 'K'],
      ['A', 'SATURN', 'K', 'PLANET', 'TEN', 'Q', 'J', 'Q', 'TEN', 'Q', 'MARS', 'K', 'A', 'GALAXY', 'J',
        'ROCKET', 'TEN', 'Q', 'K', 'SATURN', 'PLANET', 'J', 'MARS', 'A', 'STAR', 'STAR', 'STAR', 'K', 'TEN',
        'J', 'GALAXY', 'TEN', 'Q', 'MARS', 'J'],
      ['K', 'Q', 'MARS', 'A', 'J', 'ROCKET', 'TEN', 'SATURN', 'Q', 'K', 'TEN', 'J', 'A', 'PLANET', 'MARS', 'Q',
        'TEN', 'TEN', 'K', 'J', 'TEN', 'A', 'Q', 'ROCKET', 'TEN', 'SATURN', 'MARS', 'K', 'J', 'Q', 'A',
        'PLANET', 'STAR', 'STAR', 'STAR', 'J'],
      ['J', 'GALAXY', 'PLANET', 'Q', 'A', 'TEN', 'K', 'J', 'J', 'J', 'Q', 'SATURN', 'MARS', 'ROCKET', 'PLANET',
        'K', 'A', 'TEN', 'Q', 'GALAXY', 'TEN', 'J', 'TEN', 'MARS', 'A', 'K', 'Q', 'PLANET', 'TEN', 'J',
        'SATURN', 'ROCKET', 'A', 'Q', 'K', 'TEN', 'MARS'],
    ],
    evaluate(grid, lineBet) {
      const res = { total: 0, lines: [], scatter: null, freeSpins: 0 };
      this.lines.forEach((rowsOfLine, li) => {
        const first = grid[0][rowsOfLine[0]];
        if (first === this.scatter || first === this.wild) return;
        let count = 1;
        for (let r = 1; r < this.reels; r++) {
          const s = grid[r][rowsOfLine[r]];
          if (s === first || s === this.wild) count++;
          else break;
        }
        const pay = this.pays[first][count];
        if (pay > 0) {
          const amount = pay * lineBet;
          res.total += amount;
          const cells = [];
          for (let r = 0; r < count; r++) cells.push([r, rowsOfLine[r]]);
          res.lines.push({ line: li, symbol: first, count, pay: amount, cells });
        }
      });
      const scatterCells = [];
      for (let r = 0; r < this.reels; r++) {
        for (let row = 0; row < this.rows; row++) {
          if (grid[r][row] === this.scatter) scatterCells.push([r, row]);
        }
      }
      if (scatterCells.length >= 3) {
        const amount = this.scatterPays[scatterCells.length] * lineBet * this.linesPlayed;
        res.total += amount;
        res.scatter = { count: scatterCells.length, cells: scatterCells, pay: amount };
        res.freeSpins = this.freeSpinsAward;
      }
      return res;
    },
  };

  /* ---------- Общие функции ---------- */

  function gridFromStops(machine, stops) {
    const grid = [];
    for (let r = 0; r < machine.reels; r++) {
      const strip = machine.strips[r];
      const col = [];
      for (let row = 0; row < machine.rows; row++) {
        col.push(strip[(stops[r] + row) % strip.length]);
      }
      grid.push(col);
    }
    return grid;
  }

  function randomStops(machine) {
    return machine.strips.map((strip, r) => {
      if (machine.weights) {
        const w = machine.weights[r];
        const total = w.reduce((a, b) => a + b, 0);
        // Веса могут быть дробными — переводим в целые «виртуальные» остановки.
        const scaled = w.map((x) => Math.round(x * 1000));
        return weightedIndex(scaled, scaled.reduce((a, b) => a + b, 0) || total);
      }
      return randInt(strip.length);
    });
  }

  function spin(machine, lineBet) {
    const stops = randomStops(machine);
    const grid = gridFromStops(machine, stops);
    const result = machine.evaluate(grid, lineBet);
    return { stops, grid, result };
  }

  const Engine = {
    machines: { classic, jewels, cosmic },
    spin,
    gridFromStops,
    randomStops,
    randInt,
    buildVirtualWeights,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
