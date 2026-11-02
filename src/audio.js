// Synthesised positional sound effects (no audio files).
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
  }
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.0;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setListener(pos, yaw) { this.listener = { x: pos.x, y: pos.y, z: pos.z, yaw }; }

  // Returns an output node panned/attenuated for a world position (or null = 2D).
  spatial(pos, range = 60) {
    const c = this.ctx;
    const gain = c.createGain();
    const pan = c.createStereoPanner();
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
      const dist = Math.hypot(dx, dz, pos.y - this.listener.y);
      gain.gain.value = Math.max(0, 1 / (1 + (dist / (range * 0.25)) ** 2));
      // angle relative to listener facing (-Z forward rotated by yaw)
      const ang = Math.atan2(dx, -dz) + this.listener.yaw;
      pan.pan.value = Math.max(-1, Math.min(1, Math.sin(ang) * 0.8));
    }
    gain.connect(pan); pan.connect(this.master);
    return gain;
  }

  burst({ freq = 1000, q = 0.8, decay = 0.15, gain = 0.6, type = 'bandpass' }, out, t0) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + decay);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0, Math.random() * 0.5, decay + 0.05);
  }

  tone(freq, endFreq, dur, gain, out, t0, type = 'sine') {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  shot(weaponDef, pos) {
    if (!this.ctx) return;
    const s = weaponDef.sound || { freq: 1000, body: 100, decay: 0.15, gain: 0.6 };
    const out = this.spatial(pos, 120), t = this.ctx.currentTime;
    this.burst({ freq: s.freq, q: 0.7, decay: s.decay, gain: s.gain }, out, t);
    this.burst({ freq: s.freq * 3, q: 1.5, decay: s.decay * 0.4, gain: s.gain * 0.5 }, out, t);
    this.tone(s.body, s.body * 0.4, s.decay * 1.2, s.gain * 0.9, out, t);
    if (pos) this.burst({ freq: 400, q: 0.5, decay: s.decay * 3, gain: s.gain * 0.15, type: 'lowpass' }, out, t + 0.04);
  }
  knife(pos) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 20), t = this.ctx.currentTime;
    this.burst({ freq: 3000, q: 2, decay: 0.12, gain: 0.25, type: 'highpass' }, out, t);
  }
  step(pos, loud = 1) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 30), t = this.ctx.currentTime;
    this.burst({ freq: 300 + Math.random() * 200, q: 1, decay: 0.08, gain: 0.35 * loud, type: 'lowpass' }, out, t);
    this.burst({ freq: 2200, q: 3, decay: 0.03, gain: 0.08 * loud }, out, t);
  }
  hit(head) {
    if (!this.ctx) return;
    const out = this.spatial(null), t = this.ctx.currentTime;
    if (head) { this.tone(1800, 1500, 0.18, 0.25, out, t, 'triangle'); this.tone(2700, 2400, 0.12, 0.12, out, t, 'sine'); }
    else this.burst({ freq: 900, q: 2, decay: 0.05, gain: 0.3 }, out, t);
  }
  hurt() {
    if (!this.ctx) return;
    const out = this.spatial(null), t = this.ctx.currentTime;
    this.tone(180, 90, 0.2, 0.4, out, t, 'sawtooth');
  }
  impact(pos) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 25), t = this.ctx.currentTime;
    this.burst({ freq: 2500 + Math.random() * 1500, q: 4, decay: 0.05, gain: 0.15 }, out, t);
  }
  reload(stage) {
    if (!this.ctx) return;
    const out = this.spatial(null), t = this.ctx.currentTime;
    this.burst({ freq: stage ? 1800 : 900, q: 6, decay: 0.06, gain: 0.3 }, out, t);
    this.tone(stage ? 600 : 300, 200, 0.05, 0.15, out, t, 'square');
  }
  explosion(pos, size = 1) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 160), t = this.ctx.currentTime;
    this.burst({ freq: 140, q: 0.5, decay: 1.1 * size, gain: 1.1, type: 'lowpass' }, out, t);
    this.burst({ freq: 900, q: 0.6, decay: 0.35 * size, gain: 0.7 }, out, t);
    this.tone(70, 28, 0.9 * size, 0.9, out, t);
  }
  flashbang(pos) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 90), t = this.ctx.currentTime;
    this.burst({ freq: 3500, q: 0.8, decay: 0.25, gain: 0.9, type: 'highpass' }, out, t);
    this.tone(200, 80, 0.3, 0.6, out, t);
  }
  // high whine after being flashed
  ring(strength, dur) {
    if (!this.ctx) return;
    const out = this.spatial(null), t = this.ctx.currentTime;
    this.tone(3400, 3200, Math.max(0.3, dur), 0.08 * strength, out, t);
  }
  smoke(pos) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 40), t = this.ctx.currentTime;
    this.burst({ freq: 2600, q: 0.4, decay: 1.6, gain: 0.25, type: 'highpass' }, out, t);
  }
  fire(pos) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 50), t = this.ctx.currentTime;
    this.burst({ freq: 500, q: 0.5, decay: 0.9, gain: 0.6, type: 'lowpass' }, out, t);
    this.burst({ freq: 2200, q: 1, decay: 0.15, gain: 0.3 }, out, t);
  }
  beep(pos, level = 0) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 45), t = this.ctx.currentTime;
    const f = [1900, 2300, 2700][level];
    this.tone(f, f, 0.07, 0.25, out, t, 'square');
  }
  bombArm(pos) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 25), t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this.tone(1100 + (i % 3) * 180, 1100 + (i % 3) * 180, 0.06, 0.12, out, t + i * 0.42, 'square');
  }
  defuse(pos) {
    if (!this.ctx) return;
    const out = this.spatial(pos, 25), t = this.ctx.currentTime;
    this.burst({ freq: 2400, q: 6, decay: 0.05, gain: 0.3 }, out, t);
    this.tone(700, 500, 0.08, 0.12, out, t + 0.06, 'square');
  }
  bombPlanted() {
    if (!this.ctx) return;
    const out = this.spatial(null), t = this.ctx.currentTime;
    [880, 660, 880].forEach((f, i) => this.tone(f, f, 0.18, 0.14, out, t + i * 0.2, 'triangle'));
  }
  ui(kind = 'click') {
    if (!this.ctx) return;
    const out = this.spatial(null), t = this.ctx.currentTime;
    if (kind === 'win') { [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.35, 0.15, out, t + i * 0.12, 'triangle')); }
    else if (kind === 'lose') { [392, 330, 262].forEach((f, i) => this.tone(f, f, 0.35, 0.15, out, t + i * 0.14, 'triangle')); }
    else this.tone(900, 700, 0.05, 0.1, out, t, 'square');
  }
}

export const audio = new Audio();
