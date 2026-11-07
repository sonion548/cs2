// Hand-drawn rendering layer.
//
// HandCtx wraps a CanvasRenderingContext2D and mimics its API, so existing
// drawing code can be passed a HandCtx unchanged. Paths are recorded as point
// lists (in device space), then:
//   fill()   → layered watercolour/gouache wash: jittered edges, uneven
//              pigment, granulation and darker pooled edges
//   stroke() → ink brush: wobbling line with pressure taper and dry-brush gaps
// Finally paper() adds paper grain, fibres and slight pigment bleed.
import { makeCanvas } from './canvas.js';
import { rng, valueNoise, fbm } from '../noise.js';

const PROPS = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'lineCap', 'lineJoin', 'font', 'textAlign', 'textBaseline',
  'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'globalCompositeOperation', 'filter', 'miterLimit', 'lineDashOffset'];

function parseColor(c) {
  if (typeof c !== 'string') return null;
  if (c[0] === '#') {
    const n = parseInt(c.length === 4 ? c.slice(1).split('').map(v => v + v).join('') : c.slice(1, 7), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}
const rgba = (c, a = c[3]) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const tint = (c, d) => [c[0] + d * 255, c[1] + d * 255, c[2] + d * 255, c[3]].map((v, i) => i < 3 ? Math.max(0, Math.min(255, v)) : v);

export class HandCtx {
  constructor(ctx, { seed = 1, wobble = 1, ink = '#1c1418', style = 'wash' } = {}) {
    this.ctx = ctx;
    this.canvas = ctx.canvas;
    this.r = rng(seed * 7 + 3);
    this.seed = seed;
    this.wobble = wobble;
    this.inkColor = ink;
    this.style = style;        // 'wash' (watercolour) | 'gouache' (flatter, opaque) | 'marker'
    this.polys = [];
    for (const p of PROPS) Object.defineProperty(this, p, { get: () => this.ctx[p], set: (v) => { this.ctx[p] = v; } });
  }

  // ---------------------------------------------------------------- passthrough
  save() { this.ctx.save(); } restore() { this.ctx.restore(); }
  translate(a, b) { this.ctx.translate(a, b); } rotate(a) { this.ctx.rotate(a); } scale(a, b) { this.ctx.scale(a, b); }
  setTransform(...a) { this.ctx.setTransform(...a); } getTransform() { return this.ctx.getTransform(); } resetTransform() { this.ctx.resetTransform(); }
  setLineDash(d) { this.ctx.setLineDash(d); } getLineDash() { return this.ctx.getLineDash(); }
  createLinearGradient(...a) { return this.ctx.createLinearGradient(...a); }
  createRadialGradient(...a) { return this.ctx.createRadialGradient(...a); }
  createPattern(...a) { return this.ctx.createPattern(...a); }
  measureText(t) { return this.ctx.measureText(t); }
  drawImage(...a) { this.ctx.drawImage(...a); }
  getImageData(...a) { return this.ctx.getImageData(...a); } putImageData(...a) { this.ctx.putImageData(...a); }
  createImageData(...a) { return this.ctx.createImageData(...a); }
  clearRect(...a) { this.ctx.clearRect(...a); }

  // Hand-lettered text: slight per-call rotation/offset jitter.
  fillText(t, x, y, mw) { const c = this.ctx; c.save(); c.translate(x, y); c.rotate((this.r() - 0.5) * 0.04); c.fillText(t, (this.r() - 0.5) * 2, (this.r() - 0.5) * 2, mw); c.restore(); }
  strokeText(t, x, y, mw) { const c = this.ctx; c.save(); c.translate(x, y); c.rotate((this.r() - 0.5) * 0.04); c.strokeText(t, 0, 0, mw); c.restore(); }

  // ---------------------------------------------------------------- path recording
  _pt(x, y) { const m = this.ctx.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; }
  _scale() { const m = this.ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; }
  _cur() { return this.polys[this.polys.length - 1]; }
  beginPath() { this.polys = []; this.last = null; }
  moveTo(x, y) { const p = { pts: [this._pt(x, y)], closed: false }; this.polys.push(p); this.last = [x, y]; }
  lineTo(x, y) {
    if (!this._cur()) return this.moveTo(x, y);
    const [x0, y0] = this.last;
    const len = Math.hypot(x - x0, y - y0) * this._scale();
    const n = Math.max(1, Math.ceil(len / 6));
    for (let i = 1; i <= n; i++) this._cur().pts.push(this._pt(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n));
    this.last = [x, y];
  }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this._cur()) this.moveTo(cx, cy);
    const [x0, y0] = this.last;
    const n = Math.max(4, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x - cx, y - cy)) * this._scale() / 6));
    for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; this._cur().pts.push(this._pt(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y)); }
    this.last = [x, y];
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this._cur()) this.moveTo(c1x, c1y);
    const [x0, y0] = this.last;
    const n = Math.max(6, Math.ceil((Math.hypot(c1x - x0, c1y - y0) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y)) * this._scale() / 6));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this._cur().pts.push(this._pt(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y));
    }
    this.last = [x, y];
  }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) {
    // match canvas semantics: sweep clockwise (or counter-clockwise) from a0 to a1
    const T = Math.PI * 2;
    let span;
    if (Math.abs(a1 - a0) >= T) span = ccw ? -T : T;
    else if (ccw) span = -((((a0 - a1) % T) + T) % T);
    else span = (((a1 - a0) % T) + T) % T;
    const n = Math.max(10, Math.ceil(Math.abs(span) * Math.max(rx, ry) * this._scale() / 6));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const a = a0 + span * i / n, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      const x = cx + ex * cr - ey * sr, y = cy + ex * sr + ey * cr;
      if (i === 0 && (!this._cur() || this._cur().closed)) this.moveTo(x, y); else if (i === 0) this.lineTo(x, y);
      else { this._cur().pts.push(this._pt(x, y)); this.last = [x, y]; }
    }
  }
  arc(cx, cy, r, a0, a1, ccw) { this.ellipse(cx, cy, r, r, 0, a0, a1, ccw); }
  absarc(...a) { this.arc(...a); }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  roundRect(x, y, w, h, r = 0) {
    r = Math.min(typeof r === 'number' ? r : r[0] || 0, w / 2, h / 2);
    this.moveTo(x + r, y); this.lineTo(x + w - r, y); this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r); this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h); this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r); this.quadraticCurveTo(x, y, x + r, y); this.closePath();
  }
  closePath() { const c = this._cur(); if (c) { c.closed = true; const p0 = c.pts[0]; this.last = null; this._cur().pts.push([p0[0], p0[1]]); } }

  // Replays the recorded path on the real context (identity transform).
  _trace(polys, jitter = 0) {
    const c = this.ctx;
    c.beginPath();
    for (const p of polys) {
      p.pts.forEach(([x, y], i) => {
        const jx = jitter ? (valueNoise(x * 0.05, y * 0.05, this.seed) - 0.5) * jitter : 0;
        const jy = jitter ? (valueNoise(x * 0.05 + 9, y * 0.05, this.seed) - 0.5) * jitter : 0;
        i ? c.lineTo(x + jx, y + jy) : c.moveTo(x + jx, y + jy);
      });
      if (p.closed) c.closePath();
    }
  }
  clip() { const c = this.ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); this._trace(this.polys); c.restore(); c.clip(); }

  // ---------------------------------------------------------------- painting
  fill() {
    const c = this.ctx, style = c.fillStyle, col = parseColor(style), polys = this.polys;
    if (!polys.length) return;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const p of polys) for (const [x, y] of p.pts) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    const size = Math.max(bx1 - bx0, by1 - by0);
    const W = this.wobble * Math.min(6, 1.5 + size * 0.02);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    const baseAlpha = c.globalAlpha;
    if (!col) {
      // gradients/patterns: single slightly wobbled fill + texture
      this._trace(polys, W); c.fill();
      this._texture(polys, null, bx0, by0, bx1, by1);
      c.restore(); return;
    }
    // layered washes: each pass slightly offset, building uneven pigment
    const passes = this.style === 'gouache' ? 2 : 3;
    for (let k = 0; k < passes; k++) {
      c.globalAlpha = baseAlpha * col[3] * (this.style === 'gouache' ? 0.75 : 0.5);
      c.fillStyle = rgba(tint(col, (this.r() - 0.5) * 0.05), 1);
      c.save(); c.translate((this.r() - 0.5) * W * 0.6, (this.r() - 0.5) * W * 0.6);
      this._trace(polys, W * (0.8 + k * 0.3)); c.fill(); c.restore();
    }
    c.globalAlpha = baseAlpha * col[3] * 0.35;
    c.fillStyle = rgba(col, 1);
    this._trace(polys, W * 0.4); c.fill();
    c.globalAlpha = baseAlpha;
    this._texture(polys, col, bx0, by0, bx1, by1);
    // pigment pooling at the edges (watercolour edge darkening)
    if (size > 6) {
      c.globalAlpha = baseAlpha * col[3] * 0.32;
      c.strokeStyle = rgba(tint(col, -0.22), 1);
      c.lineWidth = Math.min(5, 1 + size * 0.015);
      c.filter = 'blur(1px)';
      this._trace(polys, W * 0.6); c.stroke();
      c.filter = 'none';
    }
    c.restore();
  }

  // Granulation, brush streaks and light/dark blooms inside the shape.
  _texture(polys, col, x0, y0, x1, y1) {
    const c = this.ctx, w = x1 - x0, h = y1 - y0;
    if (w < 4 || h < 4) return;
    c.save();
    this._trace(polys); c.clip();
    const base = c.globalAlpha;
    // blooms
    const blooms = Math.min(14, 2 + Math.floor(w * h / 6000));
    for (let i = 0; i < blooms; i++) {
      const bx = x0 + this.r() * w, by = y0 + this.r() * h, br = 6 + this.r() * Math.max(w, h) * 0.35;
      const g = c.createRadialGradient(bx, by, 0, bx, by, br);
      const dark = this.r() < 0.55;
      const tone = col ? rgba(tint(col, dark ? -0.12 : 0.12), 1) : (dark ? 'rgb(0,0,0)' : 'rgb(255,255,255)');
      g.addColorStop(0, tone); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = base * (col ? 0.28 : 0.1);
      c.fillStyle = g; c.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    // directional brush streaks
    const ang = -0.6 + this.r() * 0.3;
    c.globalAlpha = base * 0.07;
    c.strokeStyle = col ? rgba(tint(col, -0.2), 1) : '#000';
    c.lineWidth = 1.2;
    const n = Math.min(160, Math.floor((w + h) * 0.5));
    for (let i = 0; i < n; i++) {
      const sx = x0 + this.r() * w, sy = y0 + this.r() * h, L = 10 + this.r() * 40;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(ang) * L, sy + Math.sin(ang) * L); c.stroke();
    }
    c.restore();
  }

  stroke() {
    const c = this.ctx, polys = this.polys;
    if (!polys.length) return;
    const scale = this._scale();
    const baseW = Math.max(0.6, c.lineWidth * scale);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const col = c.strokeStyle;
    for (const p of polys) {
      const pts = p.pts;
      if (pts.length < 2) continue;
      // two passes: main stroke + faint offset "second line" like a sketch
      for (let pass = 0; pass < 2; pass++) {
        const off = pass ? (this.r() - 0.5) * baseW * 0.8 : 0;
        const amp = this.wobble * Math.min(2.5, 0.6 + baseW * 0.25) * (pass ? 1.6 : 1);
        c.globalAlpha = (pass ? 0.25 : 0.9) * (this.ctx.globalAlpha || 1);
        let prev = null;
        for (let i = 0; i < pts.length; i++) {
          const t = i / (pts.length - 1);
          const [x, y] = pts[i];
          const nx = (valueNoise(x * 0.03, y * 0.03, this.seed + pass) - 0.5) * amp * 2 + off;
          const ny = (valueNoise(x * 0.03 + 5, y * 0.03, this.seed + pass) - 0.5) * amp * 2 + off;
          const cur = [x + nx, y + ny];
          if (prev) {
            // pressure: taper in/out (open strokes), vary along the line
            const taper = p.closed ? 1 : Math.min(1, t * 6, (1 - t) * 6) * 0.7 + 0.3;
            const press = 0.75 + valueNoise(i * 0.3, pass * 3, this.seed) * 0.5;
            // dry-brush gaps on thick strokes
            if (baseW > 3 && valueNoise(i * 0.8, 1, this.seed + 3) > 0.86) { prev = cur; continue; }
            c.lineWidth = baseW * taper * press * (pass ? 0.5 : 1);
            c.strokeStyle = col;
            c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(cur[0], cur[1]); c.stroke();
          }
          prev = cur;
        }
      }
    }
    c.restore();
  }

  fillRect(x, y, w, h) {
    // full-canvas backgrounds: paint edge to edge (no wobble gaps), then add texture
    const m = this.ctx.getTransform();
    if (m.a === 1 && m.d === 1 && m.b === 0 && m.c === 0 && x + m.e <= 0 && y + m.f <= 0 && x + w + m.e >= this.canvas.width && y + h + m.f >= this.canvas.height) {
      this.ctx.fillRect(x, y, w, h);
      this.beginPath(); this.rect(x, y, w, h);
      this._texture(this.polys, parseColor(this.ctx.fillStyle), 0, 0, this.canvas.width, this.canvas.height);
      this.beginPath(); return;
    }
    this.beginPath(); this.rect(x, y, w, h); this.fill(); this.beginPath();
  }
  strokeRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.beginPath(); }
}

// Paper grain, fibres, a soft wash of warm tone and pigment bleed over a finished illustration.
export function paper(canvas, seed = 1, strength = 1) {
  const x = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  // slight bleed: blend a blurred copy back in
  const tmp = makeCanvas(W, H);
  const t = tmp.getContext('2d');
  t.filter = 'blur(1.4px)'; t.drawImage(canvas, 0, 0);
  x.save();
  x.globalAlpha = 0.35 * strength; x.drawImage(tmp, 0, 0);
  x.restore();
  // grain
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4;
    const g = (valueNoise(i * 0.9, j * 0.9, seed) - 0.5) * 22 * strength;
    const tooth = (fbm(i / 60, j / 60, seed + 4, 3) - 0.5) * 18 * strength;
    const n = g + tooth;
    d[k] = d[k] + n + 3 * strength; d[k + 1] = d[k + 1] + n + 1 * strength; d[k + 2] = d[k + 2] + n - 3 * strength;
  }
  x.putImageData(img, 0, 0);
  // fibres
  const r = rng(seed + 99);
  x.save();
  x.globalAlpha = 0.08 * strength; x.strokeStyle = '#5a4a3a'; x.lineWidth = 0.6;
  for (let i = 0; i < 260; i++) {
    const sx = r() * W, sy = r() * H, a = r() * Math.PI * 2, L = 4 + r() * 14;
    x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a + 0.5) * L / 2, sy + Math.sin(a + 0.5) * L / 2, sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke();
  }
  x.restore();
}

// Pencil/ink hatching inside the current HandCtx path region.
export function hatch(h, x0, y0, x1, y1, { angle = -0.8, gap = 7, color = 'rgba(30,20,30,0.35)', width = 1 } = {}) {
  const c = h.ctx;
  c.save();
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
  const dx = Math.cos(angle), dy = Math.sin(angle), L = Math.hypot(x1 - x0, y1 - y0);
  for (let s = -L; s < L; s += gap) {
    const cx = (x0 + x1) / 2 - dy * s, cy = (y0 + y1) / 2 + dx * s;
    c.beginPath();
    c.moveTo(cx - dx * L + (h.r() - 0.5) * 3, cy - dy * L);
    c.lineTo(cx + dx * L, cy + dy * L + (h.r() - 0.5) * 3);
    c.stroke();
  }
  c.restore();
}
