// Finishes rebuilt after the first review against the best skins of each
// tier (see the skin review document): a woven twill on carbon, contour maps,
// sumi-e brushwork, branching storm lightning, a full race livery and a
// layered nebula. (The rest of that rebuild was redone again in
// finishes_v3.js.)
import { fbm, valueNoise, rng, hexToRgb, mixRgb, smooth, clamp01 } from '../noise.js';

const C = (h) => hexToRgb(h);
const set = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const fr = (v) => v - Math.floor(v);

// Per-pixel helper: fn(x, y, out) with x in [0, 2), y in [0, 1).
function pixels(ctx, W, H, fn) {
  const img = ctx.createImageData(W, H), o = [0, 0, 0];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    fn(i / H, j / H, o);
    const k = (j * W + i) * 4;
    img.data[k] = o[0]; img.data[k + 1] = o[1]; img.data[k + 2] = o[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function grain(ctx, W, H, seed, amt) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data, r = rng(seed + 99);
  for (let i = 0; i < d.length; i += 4) { const g = (r() - 0.5) * amt; d[i] += g; d[i + 1] += g; d[i + 2] += g; }
  ctx.putImageData(img, 0, 0);
}

export const REWORKED = {

  // Carbon fibre: a 2x2 twill of rounded tows, the two directions catching
  // the light differently, fine fibres and a clear-coat sheen across it.
  carbon: { metal: 0.3, rough: 0.26, draw(ctx, W, H, p, seed) {
    const base = C(p.base), sheen = C(p.sheen || '#3a3f48'), n = p.tows || 30;
    const off = (seed % 13) * 0.07;
    pixels(ctx, W, H, (x, y, o) => {
      const u = x * n + off, v = y * n, iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
      const over = ((iu + iv) & 3) < 2;
      const across = over ? fv : fu, along = over ? fu : fv;
      const tow = Math.sin(across * Math.PI);
      const dip = 0.8 + 0.2 * Math.sin(along * Math.PI);
      const fib = 0.9 + 0.1 * Math.sin((over ? v : u) * 70);
      const k = (0.18 + 0.82 * tow ** 0.7) * (over ? 1 : 0.55) * dip * fib;
      const coat = Math.max(0, 1 - Math.abs(fr(x * 0.45 + y * 0.3 + off) - 0.5) * 6) * 0.22;
      const c = mixRgb(base, sheen, clamp01(k));
      set(o, [c[0] + coat * 255, c[1] + coat * 255, c[2] + coat * 255]);
    });
  } },

  // A topographic map: elevation bands shaded low to high, contour lines of
  // even width (every fifth one bold) and a faint survey grid.
  topo: { metal: 0.12, rough: 0.6, draw(ctx, W, H, p, seed) {
    const base = C(p.base), line = C(p.line), hi = mixRgb(base, line, 0.35), levels = 16, e2 = 1 / H;
    const elev = (x, y) => fbm(x * 1.7 + 3, y * 1.7 + 7, seed, 5) + 0.25 * fbm(x * 5, y * 5, seed + 11, 3);
    pixels(ctx, W, H, (x, y, o) => {
      const e = elev(x, y), gx = (elev(x + e2, y) - e) / e2, gy = (elev(x, y + e2) - e) / e2;
      const f = e * levels, k = Math.floor(f), d = Math.min(f - k, 1 - (f - k)) / Math.max(1e-4, Math.hypot(gx, gy) * levels * e2);
      const bold = (Math.round(f) % 5) === 0;
      const w = bold ? 1.6 : 0.8;
      let c = mixRgb(base, hi, clamp01((k / levels - 0.3) * 1.6));
      c = mixRgb(c, line, smooth(w + 0.8, w - 0.4, d) * (bold ? 1 : 0.75));
      const grid = Math.min(Math.abs(fr(x * 4) - 0.5), Math.abs(fr(y * 4) - 0.5));
      if (grid > 0.495) c = mixRgb(c, line, 0.25);
      set(o, c);
    });
  } },

  // Sumi-e: washed mountains fading into the paper, an enso brush circle with
  // dry-brush gaps, bamboo, ink spatter and a red seal stamp.
  ink: { metal: 0.04, rough: 0.62, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 5), ink = C(p.ink || '#141414');
    pixels(ctx, W, H, (x, y, o) => {
      const fib = (valueNoise(x * 220, y * 18, seed) - 0.5) * 10 + (fbm(x * 6, y * 6, seed + 1, 3) - 0.5) * 14;
      const pb = C(p.base);
      let c = [pb[0] + fib, pb[1] + fib, pb[2] + fib];
      // three ranges of mountains, nearer ones darker
      for (let m = 0; m < 3; m++) {
        const ridge = 0.42 + m * 0.14 - fbm(x * (1.2 + m * 0.6) + m * 7, m * 3.1, seed + m, 4) * (0.45 - m * 0.06);
        if (y > ridge) {
          const depth = clamp01((y - ridge) * 2.5);
          const wash = (0.18 + m * 0.2) * (1 - depth * 0.55) * (0.75 + 0.25 * fbm(x * 9, y * 9, seed + 20 + m, 3));
          c = mixRgb(c, ink, wash);
        }
      }
      set(o, c);
    });
    // enso: a single brush circle
    const cx = W * (0.62 + r() * 0.1), cy = H * 0.42, R = H * 0.3, a0 = r() * 6.28;
    for (let k = 0; k < 900; k++) {
      const f = k / 900, a = a0 + f * Math.PI * 1.85;
      if (r() < 0.08 * f) continue;                       // dry brush toward the end
      const w = H * (0.05 * (1 - f) + 0.012) * (0.8 + r() * 0.4);
      ctx.globalAlpha = 0.18 + 0.5 * (1 - f);
      ctx.fillStyle = p.ink || '#141414';
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R, cy + Math.sin(a) * R, w, w * 0.6, a, 0, 7); ctx.fill();
    }
    // bamboo
    ctx.globalAlpha = 0.85; ctx.strokeStyle = p.ink || '#141414'; ctx.lineCap = 'round';
    const bx = W * (0.12 + r() * 0.08);
    for (let s = 0; s < 2; s++) {
      const x0 = bx + s * H * 0.12;
      ctx.lineWidth = H * 0.03;
      for (let j = 0; j < 5; j++) { const y0 = H * (1 - j * 0.22), y1 = y0 - H * 0.2; ctx.beginPath(); ctx.moveTo(x0 + j * 2, y0); ctx.lineTo(x0 + j * 2 + 3, y1 + H * 0.01); ctx.stroke(); }
      ctx.lineWidth = H * 0.012;
      for (let j = 0; j < 4; j++) { const y0 = H * (0.78 - j * 0.22); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + H * 0.12, y0 - H * 0.04, x0 + H * 0.22, y0 + H * 0.02); ctx.stroke(); }
    }
    // spatter
    for (let k = 0; k < 40; k++) { ctx.globalAlpha = 0.3 + r() * 0.5; ctx.beginPath(); ctx.arc(r() * W, r() * H, r() * r() * H * 0.012, 0, 7); ctx.fill(); }
    // seal stamp
    ctx.globalAlpha = 0.9; ctx.fillStyle = p.accent || '#b01e24';
    const sx = W * 0.9, sy = H * 0.72, ss = H * 0.11;
    ctx.fillRect(sx, sy, ss, ss * 1.15);
    ctx.fillStyle = p.base; ctx.globalAlpha = 0.85;
    for (let k = 0; k < 7; k++) ctx.fillRect(sx + ss * (0.15 + r() * 0.6), sy + ss * (0.15 + r() * 0.8), ss * (0.08 + r() * 0.25), ss * 0.06);
    ctx.globalAlpha = 1;
    grain(ctx, W, H, seed, 8);
  } },

  // A storm: lit clouds over a dark sky and branching bolts, each a wide glow,
  // a bright halo and a white-hot core.
  lightning: { metal: 0.28, rough: 0.36, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 7), a = C(p.base), b = C(p.base2 || p.base), bolt = C(p.bolt || '#e8f4ff');
    pixels(ctx, W, H, (x, y, o) => {
      const cl = fbm(x * 2.2, y * 3, seed, 6), cl2 = fbm(x * 6, y * 6, seed + 4, 4);
      let c = mixRgb(a, b, smooth(0.35, 0.75, cl));
      c = mixRgb(c, mixRgb(b, bolt, 0.25), smooth(0.62, 0.85, cl * 0.7 + cl2 * 0.3) * 0.5);
      set(o, c);
    });
    const segs = [];
    const branch = (x0, y0, ang, len, depth) => {
      let x = x0, y = y0;
      const n = 10 + depth * 2;
      for (let i = 0; i < n; i++) {
        const a2 = ang + (r() - 0.5) * 1.1, step = len / n;
        const x1 = x + Math.cos(a2) * step, y1 = y + Math.sin(a2) * step;
        segs.push([x, y, x1, y1, depth]);
        if (depth < 2 && r() < 0.18) branch(x1, y1, ang + (r() < 0.5 ? -0.7 : 0.7), len * 0.45, depth + 1);
        x = x1; y = y1;
      }
    };
    for (let k = 0; k < 3; k++) branch(W * (0.1 + 0.35 * k + r() * 0.15), -H * 0.05, Math.PI / 2 + (r() - 0.5) * 0.8, H * 1.3, 0);
    const col = (al) => `rgba(${bolt[0] | 0},${bolt[1] | 0},${bolt[2] | 0},${al})`;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [wid, al, blur] of [[H * 0.05, 0.08, 0], [H * 0.018, 0.35, H * 0.03], [H * 0.006, 1, 0]]) {
      ctx.strokeStyle = wid < H * 0.01 ? 'rgba(255,255,255,0.95)' : col(al);
      ctx.shadowColor = col(0.9); ctx.shadowBlur = blur;
      for (const [x0, y0, x1, y1, d] of segs) { ctx.lineWidth = wid / (1 + d * 0.8); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    }
    ctx.shadowBlur = 0;
  } },

  // Race livery: a sweeping stripe package in the two band colours with a
  // pinline between, speed bars breaking up toward the back, a number roundel,
  // sponsor-style blocks, a checkered panel and a gloss sweep over the base.
  livery: { metal: 0.35, rough: 0.28, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 41), band = p.band || '#c41f2a', band2 = p.band2 || '#111111', txt = p.text || (band2 === '#111' ? '#111' : '#111111');
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    const sweep = (y0, y1, w, color) => {
      ctx.beginPath();
      ctx.moveTo(-W * 0.05, H * y0); ctx.bezierCurveTo(W * 0.32, H * y0, W * 0.48, H * y1, W * 1.05, H * y1);
      ctx.lineTo(W * 1.05, H * y1 + w); ctx.bezierCurveTo(W * 0.48, H * y1 + w, W * 0.32, H * y0 + w, -W * 0.05, H * y0 + w);
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    const lift = (r() - 0.5) * 0.12;
    sweep(0.66 + lift, 0.08 + lift, H * 0.22, band);
    sweep(0.9 + lift, 0.32 + lift, H * 0.012, band2);
    sweep(0.93 + lift, 0.35 + lift, H * 0.08, band2);
    // speed bars toward the back
    ctx.fillStyle = band;
    for (let i = 0; i < 8; i++) ctx.fillRect(W * (0.02 + i * 0.03), H * (0.68 + lift), W * 0.016 * (1 - i / 9), H * 0.2);
    // number roundel
    const cx = W * (0.66 + r() * 0.06), cy = H * 0.6, R = H * 0.19;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 7); ctx.fillStyle = band2; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = '#f4f2ec'; ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `italic 900 ${Math.round(R * 1.15)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number ?? 7), cx, cy + R * 0.05);
    // sponsor blocks and checkers
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < 3; i++) {
      const bx = W * (0.36 + i * 0.09), by = H * (0.72 + (i % 2) * 0.1), bw = W * 0.075, bh = H * 0.06;
      ctx.fillStyle = i === 1 ? band : band2; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#f4f2ec'; for (let k = 0; k < 3; k++) ctx.fillRect(bx + bw * (0.1 + k * 0.3), by + bh * 0.35, bw * 0.2, bh * 0.3);
    }
    const q = H * 0.035;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { ctx.fillStyle = (i + j) & 1 ? band2 : '#f4f2ec'; ctx.fillRect(W * 0.86 + i * q, H * 0.08 + j * q, q, q); }
    ctx.fillStyle = txt; ctx.globalAlpha = 0.6; ctx.font = `bold ${Math.round(H * 0.05)}px sans-serif`;
    ctx.fillText('VANTAGE RACING', W * 0.06, H * 0.14);
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, seed, 6);
  } },

  // Deep space: layered nebula clouds in two colours with dark dust lanes,
  // a dense field of faint stars and a few bright ones with cross glints.
  galaxy: { metal: 0.32, rough: 0.26, draw(ctx, W, H, p, seed) {
    const cols = (p.colors || ['#07061a', '#2c1360', '#e0389a', '#46c2ff']).map(C), r = rng(seed + 61);
    pixels(ctx, W, H, (x, y, o) => {
      const w = fbm(x * 1.1, y * 1.1, seed + 1, 4);
      const n = fbm(x * 2 + w * 1.6, y * 2 - w * 1.2, seed, 6);
      const m = fbm(x * 3.2 + 7, y * 3.2, seed + 5, 5);
      const dust = smooth(0.56, 0.76, fbm(x * 4.5 + 3, y * 4.5, seed + 9, 5));
      let c = mixRgb(cols[0], cols[1], smooth(0.3, 0.78, n));
      const neb = mixRgb(cols[2], cols[3], smooth(0.35, 0.68, m));
      c = mixRgb(c, neb, smooth(0.52, 0.86, n) * 0.85);
      c = mixRgb(c, [255, 255, 255], smooth(0.8, 0.95, n) * 0.25);
      c = mul(c, 1 - dust * 0.55);
      const st = valueNoise(x * 260, y * 260, seed + 17);
      if (st > 0.93) c = mixRgb(c, [255, 255, 255], (st - 0.93) / 0.07);
      set(o, c);
    });
    for (let k = 0; k < 14; k++) {
      const x = r() * W, y = r() * H, s = H * (0.006 + r() * 0.014);
      const g = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, s * 0.25);
      ctx.beginPath(); ctx.moveTo(x - s * 7, y); ctx.lineTo(x + s * 7, y); ctx.moveTo(x, y - s * 7); ctx.lineTo(x, y + s * 7); ctx.stroke();
    }
  } },
};
