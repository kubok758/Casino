#!/usr/bin/env node
/*
 * Точный расчёт RTP (процент возврата) и частоты выигрышей для всех автоматов.
 * Перебирает все комбинации остановок барабанов; для Cosmic Fortune
 * дополнительно учитывает бесплатные вращения с повторным запуском.
 *
 *   node tools/rtp.js            — точный расчёт
 *   node tools/rtp.js --sim 2e6  — плюс проверка симуляцией через Engine.spin
 */
'use strict';

const Engine = require('../js/engine.js');

const { classic, jewels, cosmic } = Engine.machines;

function pct(x) { return (x * 100).toFixed(2) + '%'; }

/* ---------- Lucky 7 ---------- */
function classicRtp() {
  const W = classic.weights;
  const totals = W.map((w) => w.reduce((a, b) => a + b, 0));
  let ev = 0;
  let hit = 0;
  const S = classic.strips;
  for (let a = 0; a < S[0].length; a++) {
    for (let b = 0; b < S[1].length; b++) {
      for (let c = 0; c < S[2].length; c++) {
        const p = (W[0][a] / totals[0]) * (W[1][b] / totals[1]) * (W[2][c] / totals[2]);
        if (p === 0) continue;
        const r = classic.evaluate([[S[0][a]], [S[1][b]], [S[2][c]]], 1);
        ev += p * r.total;
        if (r.total > 0) hit += p;
      }
    }
  }
  return { rtp: ev, hit };
}

/* ---------- Crown Jewels ---------- */
function jewelsRtp() {
  const S = jewels.strips;
  const n = S.map((s) => s.length);
  let ev = 0;
  let hit = 0;
  const count = n[0] * n[1] * n[2];
  for (let a = 0; a < n[0]; a++) {
    for (let b = 0; b < n[1]; b++) {
      for (let c = 0; c < n[2]; c++) {
        const grid = Engine.gridFromStops(jewels, [a, b, c]);
        const r = jewels.evaluate(grid, 1);
        ev += r.total;
        if (r.total > 0) hit++;
      }
    }
  }
  return { rtp: ev / count / jewels.linesPlayed, hit: hit / count };
}

/* ---------- Cosmic Fortune ---------- */
function cosmicRtp() {
  const M = cosmic;
  const names = Object.keys(M.symbols);
  const code = Object.fromEntries(names.map((s, i) => [s, i]));
  const WILD = code[M.wild];
  const SCAT = code[M.scatter];
  const payTable = names.map((s) => (M.pays[s] ? M.pays[s] : [0, 0, 0, 0, 0, 0]));
  const strips = M.strips.map((s) => s.map((x) => code[x]));
  const n = strips.map((s) => s.length);
  // Окна 3 символа для каждой остановки каждого барабана.
  const win = strips.map((s, r) => {
    const out = [];
    for (let i = 0; i < n[r]; i++) out.push([s[i], s[(i + 1) % n[r]], s[(i + 2) % n[r]]]);
    return out;
  });
  const scatCount = win.map((w) => w.map((col) => col.filter((x) => x === SCAT).length));
  const lines = M.lines;
  const L = lines.length;

  let lineSum = 0;
  let scatterSum = 0;
  let trig = 0;
  let hit = 0;
  const g = [null, null, null, null, null];
  for (let a = 0; a < n[0]; a++) {
    g[0] = win[0][a];
    for (let b = 0; b < n[1]; b++) {
      g[1] = win[1][b];
      for (let c = 0; c < n[2]; c++) {
        g[2] = win[2][c];
        for (let d = 0; d < n[3]; d++) {
          g[3] = win[3][d];
          for (let e = 0; e < n[4]; e++) {
            g[4] = win[4][e];
            let spinPay = 0;
            for (let li = 0; li < L; li++) {
              const rowsOf = lines[li];
              const first = g[0][rowsOf[0]];
              if (first === SCAT || first === WILD) continue;
              let k = 1;
              while (k < 5) {
                const s = g[k][rowsOf[k]];
                if (s === first || s === WILD) k++;
                else break;
              }
              spinPay += payTable[first][k];
            }
            const sc = scatCount[0][a] + scatCount[1][b] + scatCount[2][c] + scatCount[3][d] + scatCount[4][e];
            let scatPay = 0;
            if (sc >= 3) {
              trig++;
              scatPay = M.scatterPays[sc] * L;
            }
            lineSum += spinPay;
            scatterSum += scatPay;
            if (spinPay + scatPay > 0) hit++;
          }
        }
      }
    }
  }
  const combos = n.reduce((x, y) => x * y, 1);
  const lineRtp = lineSum / combos / L;
  const scatRtp = scatterSum / combos / L;
  const p = trig / combos;
  // Ожидаемая отдача одной серии бесплатных вращений (с повторными запусками).
  const fsSpins = M.freeSpinsAward / (1 - M.freeSpinsAward * p);
  const fsValue = fsSpins * (M.freeSpinsMultiplier * lineRtp + scatRtp);
  const rtp = lineRtp + scatRtp + p * fsValue;
  return { rtp, lineRtp, scatRtp, trigger: p, fsValue, hit: hit / combos };
}

function simulate(machine, spins) {
  const lineBet = 1;
  const totalBet = lineBet * machine.linesPlayed;
  let paid = 0;
  let fsLeft = 0;
  let bet = 0;
  for (let i = 0; i < spins || fsLeft > 0; i++) {
    const free = fsLeft > 0;
    if (free) fsLeft--;
    else bet += totalBet;
    const { result } = Engine.spin(machine, lineBet);
    let win = result.total;
    if (free && machine.freeSpinsMultiplier) {
      const scat = result.scatter ? result.scatter.pay : 0;
      win = (result.total - scat) * machine.freeSpinsMultiplier + scat;
    }
    paid += win;
    fsLeft += result.freeSpins;
  }
  return paid / bet;
}

const c = classicRtp();
console.log(`Lucky 7        RTP ${pct(c.rtp)}  попаданий ${pct(c.hit)}`);
const j = jewelsRtp();
console.log(`Crown Jewels   RTP ${pct(j.rtp)}  попаданий ${pct(j.hit)}`);
const k = cosmicRtp();
console.log(`Cosmic Fortune RTP ${pct(k.rtp)}  попаданий ${pct(k.hit)}  ` +
  `(линии ${pct(k.lineRtp)}, скаттер ${pct(k.scatRtp)}, бонус 1 из ${Math.round(1 / k.trigger)}, ` +
  `серия бонуса ≈ ${k.fsValue.toFixed(1)}× ставки)`);

const simIdx = process.argv.indexOf('--sim');
if (simIdx > -1) {
  const spins = Number(process.argv[simIdx + 1] || 1e6);
  for (const m of [classic, jewels, cosmic]) {
    console.log(`  симуляция ${m.name}: ${pct(simulate(m, spins))} на ${spins} вращениях`);
  }
}
