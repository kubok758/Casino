/*
 * Звук автоматов: всё синтезируется через Web Audio, без внешних файлов.
 * Контекст создаётся после первого действия игрока (требование браузеров).
 */
(function (root) {
  'use strict';

  const STORE_KEY = 'aurum.sound';
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  try { muted = localStorage.getItem(STORE_KEY) === 'off'; } catch (e) { /* хранилище недоступно */ }

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function live() {
    return ctx && !muted && ctx.state === 'running';
  }

  function env(g, t, peak, attack, dur, curve = 'exp') {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }

  function tone(o) {
    const t = o.at != null ? o.at : ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.glide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    env(g, t, o.gain || 0.1, o.attack || 0.004, o.dur);
    let node = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.dest || master);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    return osc;
  }

  function noise(o) {
    const t = o.at != null ? o.at : ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
    f.Q.value = o.Q || 1;
    const g = ctx.createGain();
    env(g, t, o.gain || 0.1, o.attack || 0.002, o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest || master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* ---------- Библиотека звуков ---------- */

  const sounds = {
    button() {
      tone({ type: 'square', freq: 1900, dur: 0.035, gain: 0.025 });
      noise({ filter: 'highpass', freq: 3500, dur: 0.025, gain: 0.08 });
    },

    lever() {
      const t = ctx.currentTime;
      for (let i = 0; i < 9; i++) {
        noise({ at: t + i * 0.026, freq: 3200 + i * 120, Q: 4, dur: 0.014, gain: 0.32 });
        tone({ at: t + i * 0.026, freq: 900 - i * 30, dur: 0.02, gain: 0.03, type: 'square' });
      }
      tone({ at: t + 0.25, freq: 110, freqEnd: 45, dur: 0.2, gain: 0.5 });
      noise({ at: t + 0.25, freq: 700, Q: 1.5, dur: 0.07, gain: 0.35 });
      // пружина
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t + 0.3);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.75);
      lfo.frequency.value = 28;
      lfoGain.gain.value = 30;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      env(g, t + 0.3, 0.06, 0.01, 0.5);
      osc.connect(g);
      g.connect(master);
      osc.start(t + 0.3);
      lfo.start(t + 0.3);
      osc.stop(t + 0.85);
      lfo.stop(t + 0.85);
    },

    reelStop(kind) {
      const t = ctx.currentTime;
      if (kind === 'cosmic') {
        tone({ freq: 120, freqEnd: 42, dur: 0.22, gain: 0.42 });
        noise({ freq: 900, freqEnd: 200, Q: 1.2, dur: 0.12, gain: 0.18 });
        tone({ at: t + 0.005, type: 'triangle', freq: 1320, dur: 0.07, gain: 0.03 });
        return;
      }
      tone({ freq: kind === 'classic' ? 150 : 180, freqEnd: 55, dur: 0.13, gain: 0.5 });
      noise({ freq: kind === 'classic' ? 1300 : 1800, Q: 2.2, dur: 0.05, gain: 0.4 });
      noise({ filter: 'highpass', freq: 5000, dur: 0.012, gain: 0.25 });
      if (kind === 'jewels') tone({ at: t + 0.01, freq: 2637, dur: 0.18, gain: 0.025 });
    },

    coin() {
      const base = 1700 + Math.random() * 900;
      [1, 2.76, 5.4, 8.93].forEach((p, i) => {
        if (base * p > 16000) return;
        tone({ freq: base * p, dur: 0.35 / (i + 1) + 0.05, gain: 0.05 / (i + 1), attack: 0.001 });
      });
    },

    tick() {
      tone({ freq: 2900 + Math.random() * 300, dur: 0.03, gain: 0.03, attack: 0.001 });
    },

    win(level) {
      const t = ctx.currentTime;
      const seq = level > 1 ? [72, 76, 79, 84, 79, 84, 88] : [72, 76, 79, 84];
      seq.forEach((n, i) => {
        tone({ at: t + i * 0.085, type: 'triangle', freq: NOTE(n), dur: 0.28, gain: 0.09 });
        tone({ at: t + i * 0.085, type: 'sine', freq: NOTE(n + 12), dur: 0.2, gain: 0.03 });
      });
    },

    bigWin() {
      const t = ctx.currentTime;
      const fan = [60, 64, 67, 72, 76, 79, 84];
      fan.forEach((n, i) => {
        tone({ at: t + i * 0.09, type: 'sawtooth', freq: NOTE(n), dur: 0.3, gain: 0.05, lowpass: 2600 });
        tone({ at: t + i * 0.09, type: 'triangle', freq: NOTE(n + 12), dur: 0.25, gain: 0.05 });
      });
      const c = t + fan.length * 0.09;
      [72, 76, 79, 84].forEach((n) => {
        tone({ at: c, type: 'sawtooth', freq: NOTE(n), dur: 1.6, gain: 0.04, attack: 0.02, lowpass: 2200 });
        tone({ at: c, type: 'sawtooth', freq: NOTE(n), detune: 9, dur: 1.6, gain: 0.03, attack: 0.02, lowpass: 2200 });
      });
      for (let i = 0; i < 14; i++) {
        tone({ at: c + i * 0.07, freq: NOTE(96 + [0, 4, 7, 12][i % 4]), dur: 0.25, gain: 0.02 });
      }
    },

    scatter(index = 0) {
      const t = ctx.currentTime;
      const base = [76, 79, 84][Math.min(2, index)];
      [0, 7, 12].forEach((d, i) => tone({ at: t + i * 0.06, freq: NOTE(base + d), dur: 0.6, gain: 0.06 }));
    },

    freeSpins() {
      const t = ctx.currentTime;
      const scale = [0, 2, 4, 7, 9];
      for (let i = 0; i < 22; i++) {
        const n = 67 + scale[i % 5] + Math.floor(i / 5) * 12;
        tone({ at: t + i * 0.045, type: 'triangle', freq: NOTE(n), dur: 0.4, gain: 0.05 });
      }
    },
  };

  /* ---------- Длительные звуки с ручной остановкой ---------- */

  function spinLoop(kind) {
    if (!live()) return { stop() {} };
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(1, t + 0.12);
    out.connect(master);
    const nodes = [];
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(out);
    nodes.push(src);
    if (kind === 'cosmic') {
      f.type = 'lowpass';
      f.frequency.value = 500;
      g.gain.value = 0.09;
      const pad = [55, 82.5].map((fr, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = i * 7;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 380;
        const pg = ctx.createGain();
        pg.gain.value = 0.035;
        o.connect(lp);
        lp.connect(pg);
        pg.connect(out);
        return o;
      });
      nodes.push(...pad);
    } else {
      // щелчки механизма: шум, промодулированный прямоугольным LFO
      f.type = 'bandpass';
      f.frequency.value = kind === 'classic' ? 1100 : 1500;
      f.Q.value = 0.9;
      g.gain.value = 0.11;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = kind === 'classic' ? 17 : 22;
      const depth = ctx.createGain();
      depth.gain.value = 0.11;
      lfo.connect(depth);
      depth.connect(g.gain);
      const hum = ctx.createOscillator();
      hum.frequency.value = 58;
      const hg = ctx.createGain();
      hg.gain.value = 0.05;
      hum.connect(hg);
      hg.connect(out);
      nodes.push(lfo, hum);
    }
    nodes.forEach((n) => n.start(t));
    let stopped = false;
    return {
      stop() {
        if (stopped || !ctx) return;
        stopped = true;
        const s = ctx.currentTime;
        out.gain.cancelScheduledValues(s);
        out.gain.setValueAtTime(out.gain.value, s);
        out.gain.linearRampToValueAtTime(0.0001, s + 0.18);
        nodes.forEach((n) => n.stop(s + 0.2));
      },
    };
  }

  // Электромеханический звонок классических автоматов.
  function bell(duration) {
    if (!live()) return { stop() {} };
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.09, t + 0.02);
    out.gain.setValueAtTime(0.09, t + Math.max(0.05, duration - 0.25));
    out.gain.linearRampToValueAtTime(0.0001, t + duration);
    out.connect(master);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    am.connect(out);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 24;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(am.gain);
    const oscs = [1650, 2480, 4120].map((fr, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = fr;
      const og = ctx.createGain();
      og.gain.value = 1 / (i + 1.5);
      o.connect(og);
      og.connect(am);
      return o;
    });
    [lfo, ...oscs].forEach((n) => { n.start(t); n.stop(t + duration + 0.05); });
    return {
      stop() {
        const s = ctx.currentTime;
        out.gain.cancelScheduledValues(s);
        out.gain.setValueAtTime(out.gain.value, s);
        out.gain.linearRampToValueAtTime(0.0001, s + 0.06);
      },
    };
  }

  function anticipation(duration) {
    if (!live()) return { stop() {} };
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.07, t + 0.2);
    out.connect(master);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(720, t + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + duration);
    const trem = ctx.createOscillator();
    trem.frequency.value = 9;
    const tg = ctx.createGain();
    tg.gain.value = 0.5;
    const amp = ctx.createGain();
    amp.gain.value = 0.5;
    trem.connect(tg);
    tg.connect(amp.gain);
    o.connect(lp);
    lp.connect(amp);
    amp.connect(out);
    o.start(t);
    trem.start(t);
    o.stop(t + duration + 0.5);
    trem.stop(t + duration + 0.5);
    return {
      stop() {
        const s = ctx.currentTime;
        out.gain.cancelScheduledValues(s);
        out.gain.setValueAtTime(out.gain.value, s);
        out.gain.linearRampToValueAtTime(0.0001, s + 0.12);
      },
    };
  }

  function play(name, arg) {
    if (!live()) return;
    try { sounds[name](arg); } catch (e) { /* звук не должен ломать игру */ }
  }

  function setMuted(v) {
    muted = v;
    try { localStorage.setItem(STORE_KEY, v ? 'off' : 'on'); } catch (e) { /* ignore */ }
    if (v) {
      if (master) master.gain.value = 0;
    } else {
      unlock();
      if (master) master.gain.value = 0.7;
    }
  }

  root.Sound = {
    unlock,
    play,
    spinLoop,
    bell,
    anticipation,
    setMuted,
    get muted() { return muted; },
  };
})(window);
