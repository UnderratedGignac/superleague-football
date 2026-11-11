// ============================================================================
//  Procedural audio: crowd bed, chants, impacts, whistle, woodwork, roars
// ============================================================================
export class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false; this.muted = false;
    this.crowdLevel = 0.32; this.target = 0.32;
    this._t = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(c.destination);

    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.85; this.sfxBus.connect(this.master);
    this.crowdBus = c.createGain(); this.crowdBus.gain.value = 0.0; this.crowdBus.connect(this.master);

    // ---- noise buffer ----
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2 + w * 0.25;
    }
    this.noiseBuf = buf;

    // ---- crowd bed: two filtered noise layers ----
    const mk = (freq, q, gain, rate) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(bp); bp.connect(g); g.connect(this.crowdBus);
      src.start();
      return { src, bp, g };
    };
    this.crowdA = mk(420, 0.7, 0.55, 0.85);
    this.crowdB = mk(1150, 0.9, 0.20, 1.13);
    this.crowdC = mk(220, 1.2, 0.35, 0.7);

    // roar layer (opened on big events)
    this.roar = c.createGain(); this.roar.gain.value = 0;
    const rsrc = c.createBufferSource(); rsrc.buffer = buf; rsrc.loop = true; rsrc.playbackRate.value = 1.0;
    const rbp = c.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 700; rbp.Q.value = 0.45;
    const rhp = c.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 260;
    rsrc.connect(rbp); rbp.connect(rhp); rhp.connect(this.roar); this.roar.connect(this.master);
    rsrc.start();

    this.ready = true;
    this.crowdBus.gain.setTargetAtTime(0.30, c.currentTime, 1.2);
  }

  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1); }

  update(dt, excitement) {
    if (!this.ready) return;
    this._t += dt;
    const t = this.ctx.currentTime;
    const base = 0.24 + excitement * 0.42;
    const wobble = Math.sin(this._t * 0.31) * 0.03 + Math.sin(this._t * 0.73 + 1.2) * 0.02;
    this.crowdBus.gain.setTargetAtTime(Math.max(0.05, base + wobble), t, 0.55);
    this.crowdA.bp.frequency.setTargetAtTime(400 + excitement * 300, t, 0.7);
    this.crowdB.g.gain.setTargetAtTime(0.16 + excitement * 0.30, t, 0.6);
  }

  _env(node, t, a, d, peak) {
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _noise(t, dur, freq, q, gain, type = 'bandpass') {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    this._env(g, t, 0.006, dur, gain);
    s.start(t); s.stop(t + dur + 0.06);
    return { s, f, g };
  }

  _tone(t, freq, freq2, dur, gain, type = 'sine') {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    const g = c.createGain();
    o.connect(g); g.connect(this.sfxBus);
    this._env(g, t, 0.004, dur, gain);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  kick(power = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(t, 190 + power * 90, 52, 0.13, 0.55 * power, 'sine');
    this._noise(t, 0.075, 1500 + power * 1400, 1.1, 0.30 * power);
  }
  pass() { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(t, 150, 60, 0.08, 0.24); this._noise(t, 0.05, 1700, 1.4, 0.14); }
  touch() { if (!this.ready) return; const t = this.ctx.currentTime; this._noise(t, 0.035, 2200, 1.6, 0.07); }
  bounce(v = 1) { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(t, 130, 55, 0.07, 0.14 * v); this._noise(t, 0.04, 900, 1.2, 0.08 * v); }
  post() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [1, 2.41, 3.83, 5.2].forEach((m, i) => this._tone(t, 620 * m, 610 * m, 0.55 - i * 0.09, 0.22 / (i + 1), 'sine'));
    this._noise(t, 0.09, 3200, 2.0, 0.16);
    this.crowdSwell(0.75, 1.4);
  }
  net() { if (!this.ready) return; this._noise(this.ctx.currentTime, 0.22, 3400, 0.7, 0.20, 'highpass'); }
  save() { if (!this.ready) return; const t = this.ctx.currentTime; this._noise(t, 0.10, 800, 0.8, 0.30); this._tone(t, 110, 48, 0.12, 0.24); }
  tackle() { if (!this.ready) return; const t = this.ctx.currentTime; this._noise(t, 0.20, 520, 0.6, 0.28); this._tone(t, 90, 40, 0.16, 0.20); }
  whistle(long = false) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime, dur = long ? 0.85 : 0.34;
    for (const f of [2180, 2680]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 24;
      const lg = c.createGain(); lg.gain.value = 55;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = c.createGain();
      o.connect(g); g.connect(this.sfxBus);
      this._env(g, t, 0.02, dur, 0.16);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.08); lfo.stop(t + dur + 0.08);
    }
    this._noise(t, dur * 0.8, 2400, 3, 0.05);
  }
  crowdSwell(amount = 0.6, dur = 1.6) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.roar.gain.cancelScheduledValues(t);
    this.roar.gain.setValueAtTime(Math.max(0.0001, this.roar.gain.value), t);
    this.roar.gain.linearRampToValueAtTime(amount * 0.55, t + 0.18);
    this.roar.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  goal() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.crowdSwell(1.0, 5.5);
    this.net();
    // stadium horn chord
    [110, 164.8, 220, 277.2].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = this.ctx.createGain();
      o.connect(lp); lp.connect(g); g.connect(this.sfxBus);
      this._env(g, t + i * 0.03, 0.10, 1.5, 0.075);
      o.start(t); o.stop(t + 1.8);
    });
  }
  chant() {
    if (!this.ready) return;
    const c = this.ctx, t0 = c.currentTime;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * 0.42;
      [98, 147, 196].forEach(f => {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * (b % 2 ? 1.06 : 1), t);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620;
        const g = c.createGain();
        o.connect(lp); lp.connect(g); g.connect(this.crowdBus);
        this._env(g, t, 0.09, 0.30, 0.05);
        o.start(t); o.stop(t + 0.5);
      });
      this._noise(t, 0.16, 300, 0.7, 0.07);
    }
  }
  click() { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(t, 880, 660, 0.05, 0.10, 'triangle'); }
  ui(up = true) { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(t, up ? 520 : 420, up ? 780 : 300, 0.09, 0.09, 'triangle'); }
  countdown(hi = false) { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(t, hi ? 1046 : 660, hi ? 1046 : 660, 0.14, 0.13, 'triangle'); }
}
