// Procedural weapon finishes. Each finish type paints a 2:1 canvas from a set
// of parameters plus the item's pattern seed (0–999), which shifts, rotates
// or recolours the pattern so no two seeds look exactly alike.
import { makeCanvas } from './canvas.js';
import { patternInfo } from './patterns.js';
import { fbm, voronoi, valueNoise, rng, hexToRgb, mixRgb, mix, smooth, clamp01 } from '../noise.js';
import { ART_FINISHES } from './finishes_art.js';
import { HandCtx, paper } from './handdrawn.js';

// Per-pixel helper: fn(x, y, out) with x ∈ [0, 2), y ∈ [0, 1).
function pixels(ctx, W, H, fn) {
  const img = ctx.createImageData(W, H);
  const o = [0, 0, 0];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    fn(i / H, j / H, o);
    const k = (j * W + i) * 4;
    img.data[k] = o[0]; img.data[k + 1] = o[1]; img.data[k + 2] = o[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const C = (h) => hexToRgb(h);
const set = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; };

export const FINISH_TYPES = {
  // Solid paint with soft tonal variation and an optional accent band.
  paint: { metal: 0.25, rough: 0.5, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.accent || p.base);
    pixels(ctx, W, H, (x, y, o) => {
      const n = fbm(x * 6, y * 6, seed, 3);
      let c = mixRgb(a, mixRgb(a, [0, 0, 0], 0.25), n * 0.5);
      if (p.accent) { const band = smooth(0.012, 0.0, Math.abs(y - 0.5 - Math.sin(x * 2) * 0.05) - 0.06); c = mixRgb(c, b, band); }
      set(o, c);
    });
  } },

  camo: { metal: 0.05, rough: 0.8, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C), sc = p.scale || 5;
    pixels(ctx, W, H, (x, y, o) => {
      let c = cols[0];
      for (let k = 1; k < cols.length; k++) {
        const n = fbm(x * sc + k * 13.1 + seed % 50, y * sc + k * 7.7, seed + k * 101, 4);
        if (n > 0.52 + k * 0.025) c = cols[k];
      }
      const grain = (valueNoise(x * 300, y * 300, seed) - 0.5) * 14;
      set(o, [c[0] + grain, c[1] + grain, c[2] + grain]);
    });
  } },

  digital: { metal: 0.05, rough: 0.75, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C), px = p.pixel || 0.025;
    pixels(ctx, W, H, (x, y, o) => {
      const qx = Math.floor(x / px) * px, qy = Math.floor(y / px) * px;
      let c = cols[0];
      for (let k = 1; k < cols.length; k++) if (fbm(qx * 4 + k * 9, qy * 4, seed + k * 37, 4) > 0.5 + k * 0.03) c = cols[k];
      set(o, c);
    });
  } },

  tiger: { metal: 0.15, rough: 0.55, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.stripe), f = p.freq || 9;
    pixels(ctx, W, H, (x, y, o) => {
      const warp = fbm(x * 2, y * 3, seed, 4) * 3;
      const s = Math.sin((x * f + warp * 2.2) * Math.PI);
      const t = smooth(0.35, 0.55, s * (0.6 + fbm(x * 4, y * 4, seed + 5, 3) * 0.6));
      set(o, mixRgb(a, b, t));
    });
  } },

  hex: { metal: 0.45, rough: 0.35, draw(ctx, W, H, p, seed) {
    const a = C(p.base), l = C(p.line), g = C(p.glow || p.line), s = p.size || 18;
    pixels(ctx, W, H, (x, y, o) => {
      // axial hex grid
      const q = (x * s * 0.57735 * 2) / 1.5, r = y * s - (x * s * 0.57735 * 2) / 3;
      let rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
      const dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz + q + r);
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
      const fx = q - rx, fy = r - ry, fz = -fx - fy;
      const edge = 1 - Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz)) * 2;
      const lit = valueNoise(rx * 3.1, ry * 2.7, seed) > 0.78 ? 1 : 0;
      const c = mixRgb(mixRgb(a, g, lit * 0.6), l, smooth(0.12, 0.04, edge));
      set(o, c);
    });
  } },

  gradient: { metal: 0.65, rough: 0.22, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C);
    // how far the fade runs (pattern template): 80% shows less of the far colours, a full fade all of them
    const shift = p.fade != null ? (p.fade - 0.9) * 3 : (seed % 1000) / 1000 * 0.6 - 0.3;
    pixels(ctx, W, H, (x, y, o) => {
      let t = clamp01((x / 2) * 1.2 - 0.1 + shift + (y - 0.5) * 0.35);
      const n = fbm(x * 3, y * 3, seed, 3) * 0.08;
      t = clamp01(t + n);
      const seg = t * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(seg));
      set(o, mixRgb(cols[i], cols[i + 1], smooth(0, 1, seg - i)));
    });
  } },

  swirl: { metal: 0.6, rough: 0.2, draw(ctx, W, H, p, seed) {
    // gem phases swap in one jewel tone; Phase 1-4 change which colour leads
    const cols = (p.gem || p.colors).map(C);
    const bias = p.phase ? [0.6, 1, 1.7, 2.6][p.phase - 1] : 1;
    pixels(ctx, W, H, (x, y, o) => {
      const w1 = fbm(x * 2 + seed * 0.01, y * 2, seed, 5);
      const w2 = fbm(x * 2 + w1 * 3, y * 2 + w1 * 2, seed + 3, 5);
      const t = Math.pow(Math.sin((w2 * 6 + x) * Math.PI) * 0.5 + 0.5, bias);
      const seg = t * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(seg));
      set(o, mixRgb(cols[i], cols[i + 1], seg - i));
    });
  } },

  folded: { metal: 0.9, rough: 0.28, draw(ctx, W, H, p, seed) {
    const a = C(p.base || '#9aa0a8'), b = C(p.dark || '#3a3e44');
    pixels(ctx, W, H, (x, y, o) => {
      const warp = fbm(x * 3, y * 3, seed, 4) * 2.5 + Math.sin(x * 9 + seed) * 0.15;
      const s = Math.sin((y * 40 + warp * 6) * Math.PI) * 0.5 + 0.5;
      set(o, mixRgb(b, a, Math.pow(s, 0.7)));
    });
  } },

  doppler: { metal: 0.95, rough: 0.14, draw(ctx, W, H, p, seed) {
    // candy-coloured anodised metal: smoky bands of colour flowing over dark
    // steel, with a fine metallic flake. The phase's palette comes from the
    // pattern template (patterns.js).
    const cols = (p.palette || p.colors || ['#05030a', '#3a1a5a', '#c04ab0', '#ffb0e0']).map(C);
    const white = C('#ffffff');
    pixels(ctx, W, H, (x, y, o) => {
      const w1 = fbm(x * 1.4, y * 1.4, seed, 5);
      const w2 = fbm(x * 2.6 + w1 * 2.4, y * 2.6 - w1 * 1.8, seed + 11, 5);
      const t = clamp01((w2 - 0.22) * 1.9);
      const seg = t * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(seg));
      let c = mixRgb(cols[i], cols[i + 1], smooth(0, 1, seg - i));
      const flake = fbm(x * 90, y * 90, seed + 5, 1);
      if (flake > 0.78) c = mixRgb(c, white, Math.min(0.35, (flake - 0.78) * 1.2));
      set(o, c);
    });
  } },

  tempered: { metal: 0.95, rough: 0.25, draw(ctx, W, H, p, seed) {
    // heat-treated steel: patches of blue, gold and violet. Seed sets how much blue.
    const blueAmt = p.blue ?? 0.25 + ((seed * 7919) % 1000) / 1000 * 0.55;   // from the pattern template (patterns.js)
    const blue = C('#2f58b8'), gold = C('#b88a3a'), vio = C('#6a3f8a'), steel = C('#8a8e94');
    pixels(ctx, W, H, (x, y, o) => {
      const n = fbm(x * 2.5, y * 2.5, seed, 5);
      const m = fbm(x * 6, y * 6, seed + 9, 4);
      let c = steel;
      if (n < blueAmt) c = mixRgb(blue, vio, smooth(0.3, 0.7, m));
      else c = mixRgb(gold, steel, smooth(0.4, 0.75, m));
      const edge = smooth(0.03, 0, Math.abs(n - blueAmt));
      set(o, mixRgb(c, vio, edge * 0.6));
    });
  } },

  carbon: { metal: 0.35, rough: 0.3, draw(ctx, W, H, p, seed) {
    const a = C(p.base || '#1b1c1f'), b = C(p.sheen || '#3c3f45');
    pixels(ctx, W, H, (x, y, o) => {
      const s = 60, ix = Math.floor(x * s), iy = Math.floor(y * s);
      const fx = x * s - ix, fy = y * s - iy;
      const horiz = (ix + iy) % 2 === 0;
      const t = horiz ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
      set(o, mixRgb(a, b, t * 0.8));
    });
  } },

  topo: { metal: 0.2, rough: 0.6, draw(ctx, W, H, p, seed) {
    const a = C(p.base), l = C(p.line);
    pixels(ctx, W, H, (x, y, o) => {
      const h = fbm(x * 2.5, y * 2.5, seed, 5) * 14;
      const line = smooth(0.08, 0.0, Math.abs(h - Math.round(h)));
      const major = Math.round(h) % 4 === 0 ? 1 : 0.55;
      set(o, mixRgb(a, l, line * major));
    });
  } },

  scales: { metal: 0.5, rough: 0.35, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.edge), s = p.size || 16;
    pixels(ctx, W, H, (x, y, o) => {
      const row = Math.floor(y * s), off = (row % 2) * 0.5;
      const cx = (Math.floor(x * s / 1 + off) - off + 0.5) / s, cy = (row + 0.9) / s;
      const d = Math.hypot((x - cx) * s, (y - cy) * s * 1.3);
      const t = smooth(0.35, 0.62, d);
      const tint = valueNoise(Math.floor(x * s + off), row, seed) * 0.4;
      set(o, mixRgb(mixRgb(a, b, tint), b, t));
    });
  } },

  lava: { metal: 0.2, rough: 0.6, draw(ctx, W, H, p, seed) {
    const rock = C(p.base || '#1e1a18'), hot = C(p.hot || '#ff6a1a'), core = C(p.core || '#ffd36a');
    pixels(ctx, W, H, (x, y, o) => {
      const v = voronoi(x * 6 + seed * 0.01, y * 6, seed);
      const crack = smooth(0.08, 0.0, v.d2 - v.d1);
      const n = fbm(x * 8, y * 8, seed + 2, 3);
      let c = mixRgb(rock, mixRgb(rock, [70, 60, 55], 0.5), n);
      c = mixRgb(c, hot, crack);
      c = mixRgb(c, core, smooth(0.6, 1, crack) * 0.8);
      set(o, c);
    });
  } },

  snake: { metal: 0.15, rough: 0.5, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.mark), d = C(p.dark || '#1a1612');
    pixels(ctx, W, H, (x, y, o) => {
      const v = voronoi(x * 22, y * 22, seed);
      const cell = smooth(0.05, 0.12, v.d2 - v.d1);
      const blot = fbm(x * 3, y * 6, seed + 4, 4);
      let c = blot > 0.55 ? b : a;
      if (blot > 0.52 && blot < 0.56) c = d;
      set(o, mixRgb(d, c, cell));
    });
  } },

  spots: { metal: 0.1, rough: 0.7, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.spot), r2 = C(p.ring || '#151210');
    pixels(ctx, W, H, (x, y, o) => {
      const v = voronoi(x * 9 + fbm(x * 4, y * 4, seed, 2) * 0.6, y * 9, seed);
      const ring = smooth(0.32, 0.26, v.d1) * smooth(0.14, 0.2, v.d1);
      const inner = smooth(0.2, 0.15, v.d1);
      set(o, mixRgb(mixRgb(a, b, inner), r2, ring));
    });
  } },

  galaxy: { metal: 0.3, rough: 0.3, draw(ctx, W, H, p, seed) {
    const cols = (p.colors || ['#08061a', '#3b1a6a', '#d13a9a', '#46c2ff']).map(C);
    const r = rng(seed + 1);
    pixels(ctx, W, H, (x, y, o) => {
      const n = fbm(x * 2, y * 2, seed, 6), m = fbm(x * 4 + 5, y * 4, seed + 7, 4);
      let c = mixRgb(cols[0], cols[1], smooth(0.4, 0.7, n));
      c = mixRgb(c, cols[2], smooth(0.62, 0.8, m) * 0.8);
      c = mixRgb(c, cols[3], smooth(0.7, 0.9, n * m * 1.6) * 0.7);
      set(o, c);
    });
    for (let i = 0; i < 700; i++) {
      const s = r() * r() * 2.4;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
      ctx.beginPath(); ctx.arc(r() * W, r() * H, s, 0, 7); ctx.fill();
    }
  } },

  // ---- vector-drawn finishes (canvas paths) ----
  shards: { metal: 0.2, rough: 0.45, draw(ctx, W, H, p, seed) {
    const cols = p.colors, r = rng(seed + 3);
    ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, W, H);
    const pts = [];
    const nx = 14, ny = 7;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const edge = i === 0 || j === 0 || i === nx || j === ny;
      pts.push([i / nx * W + (edge ? 0 : (r() - 0.5) * W / nx * 0.8), j / ny * H + (edge ? 0 : (r() - 0.5) * H / ny * 0.8)]);
    }
    const P = (i, j) => pts[j * (nx + 1) + i];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      for (const tri of [[P(i, j), P(i + 1, j), P(i, j + 1)], [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3 / W;
        const t = clamp01(cx + (r() - 0.5) * 0.5);
        const idx = Math.min(cols.length - 1, Math.floor(t * cols.length));
        ctx.fillStyle = cols[idx];
        ctx.globalAlpha = 0.75 + r() * 0.25;
        ctx.beginPath(); ctx.moveTo(...tri[0]); ctx.lineTo(...tri[1]); ctx.lineTo(...tri[2]); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  } },

  splatter: { metal: 0.1, rough: 0.6, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 5);
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 60; k++) {
      const col = p.colors[Math.floor(r() * p.colors.length)];
      const x = r() * W, y = r() * H, s = 6 + r() * r() * 70;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
      for (let d = 0; d < 14; d++) {
        const a = r() * 6.28, dist = s * (1 + r() * 2.2);
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, s * 0.08 + r() * s * 0.15, 0, 7); ctx.fill();
      }
      if (r() < 0.4) { ctx.fillRect(x - s * 0.08, y, s * 0.16, s * (1 + r() * 3)); }
    }
  } },

  circuit: { metal: 0.55, rough: 0.35, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 7);
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    const g = 16;
    ctx.lineCap = 'round';
    for (let k = 0; k < 140; k++) {
      let x = Math.floor(r() * W / g) * g, y = Math.floor(r() * H / g) * g;
      ctx.strokeStyle = r() < 0.15 ? p.glow : p.line;
      ctx.lineWidth = r() < 0.3 ? 4 : 2;
      ctx.shadowColor = p.glow; ctx.shadowBlur = ctx.strokeStyle === p.glow ? 10 : 0;
      ctx.beginPath(); ctx.moveTo(x, y);
      let dir = Math.floor(r() * 4);
      for (let s = 0; s < 6 + r() * 10; s++) {
        if (r() < 0.35) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
        const len = g * (1 + Math.floor(r() * 3));
        x += [len, 0, -len, 0][dir]; y += [0, len, 0, -len][dir];
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
  } },

  neon: { metal: 0.3, rough: 0.3, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 11);
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      const col = p.colors[k % p.colors.length];
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18;
      ctx.lineWidth = 3 + r() * 6;
      ctx.beginPath();
      const y0 = r() * H;
      ctx.moveTo(-20, y0);
      for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, y0 + Math.sin(x * 0.01 + k) * 40 * r() + (r() - 0.5) * 30);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } },

  flames: { metal: 0.3, rough: 0.4, draw(ctx, W, H, p, seed) {
    const base = C(p.base), cols = (p.colors || ['#ff3b12', '#ff9a1a', '#ffe36a']).map(C);
    pixels(ctx, W, H, (x, y, o) => {
      // flames lick backwards from the muzzle end (high x)
      const n = fbm(x * 3 - seed * 0.01, y * 5, seed, 5);
      const reach = x / 2 + (n - 0.5) * 0.7 - Math.abs(y - 0.5) * 0.6;
      const t = smooth(0.25, 0.75, reach);
      let c = base;
      if (t > 0) c = mixRgb(base, mixRgb(cols[0], mixRgb(cols[1], cols[2], smooth(0.6, 1, t)), smooth(0.2, 0.7, t)), smooth(0, 0.15, t));
      set(o, c);
    });
  } },

  lightning: { metal: 0.3, rough: 0.35, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 13);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p.base); g.addColorStop(1, p.base2 || p.base);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const bolt = (x, y, ang, len, w, depth) => {
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 10; s++) {
        ang += (r() - 0.5) * 0.9; x += Math.cos(ang) * len / 10; y += Math.sin(ang) * len / 10; ctx.lineTo(x, y);
        if (depth < 2 && r() < 0.2) { ctx.stroke(); bolt(x, y, ang + (r() - 0.5) * 1.5, len * 0.5, w * 0.6, depth + 1); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); }
      }
      ctx.stroke();
    };
    ctx.strokeStyle = p.bolt; ctx.shadowColor = p.bolt; ctx.shadowBlur = 20; ctx.lineJoin = 'round';
    for (let k = 0; k < 7; k++) bolt(r() * W, r() < 0.5 ? 0 : H, r() < 0.5 ? 1 : -1, 260 + r() * 260, 5, 0);
    ctx.shadowBlur = 0;
  } },

  graffiti: { metal: 0.05, rough: 0.7, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 17);
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 40; k++) {
      ctx.strokeStyle = p.colors[Math.floor(r() * p.colors.length)];
      ctx.lineWidth = 6 + r() * 26; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      let x = r() * W, y = r() * H; ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) { const cx = x + (r() - 0.5) * 300, cy = y + (r() - 0.5) * 200; x += (r() - 0.5) * 340; y += (r() - 0.5) * 200; ctx.quadraticCurveTo(cx, cy, x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = `900 ${H * 0.32}px "Barlow Condensed", Impact, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const words = p.words || ['VANTAGE', 'NO RETREAT', 'HOLD'];
    for (let k = 0; k < 4; k++) {
      ctx.save(); ctx.translate(r() * W, r() * H); ctx.rotate((r() - 0.5) * 0.5);
      ctx.lineWidth = 10; ctx.strokeStyle = '#111'; ctx.fillStyle = p.colors[k % p.colors.length];
      const w = words[k % words.length];
      ctx.strokeText(w, 0, 0); ctx.fillText(w, 0, 0); ctx.restore();
    }
  } },

  livery: { metal: 0.35, rough: 0.35, draw(ctx, W, H, p, seed) {
    // bold two-tone racing bands with a number
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.band;
    ctx.beginPath(); ctx.moveTo(W * 0.25, 0); ctx.lineTo(W * 0.48, 0); ctx.lineTo(W * 0.62, H); ctx.lineTo(W * 0.39, H); ctx.fill();
    ctx.fillStyle = p.band2 || p.band;
    ctx.beginPath(); ctx.moveTo(W * 0.52, 0); ctx.lineTo(W * 0.56, 0); ctx.lineTo(W * 0.7, H); ctx.lineTo(W * 0.66, H); ctx.fill();
    ctx.fillRect(0, H * 0.46, W, H * 0.02);
    ctx.font = `italic 900 ${H * 0.3}px "Barlow Condensed", Impact, sans-serif`;
    ctx.fillStyle = p.text || '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number ?? (seed % 99)), W * 0.12, H * 0.5);
  } },

  blueprint: { metal: 0.1, rough: 0.6, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 19);
    ctx.fillStyle = p.base || '#1d4a86'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = p.line || '#e8f2ff'; ctx.lineWidth = 2;
    for (let k = 0; k < 18; k++) {
      const x = r() * W, y = r() * H, s = 20 + r() * 90;
      ctx.beginPath();
      if (r() < 0.5) ctx.arc(x, y, s, 0, 7); else ctx.rect(x, y, s * 1.5, s);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s * 2, y); ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = p.line || '#e8f2ff'; ctx.font = '600 16px monospace';
    for (let k = 0; k < 12; k++) ctx.fillText(`${(r() * 90).toFixed(1)}mm`, r() * W, r() * H);
  } },

  ink: { metal: 0.05, rough: 0.6, draw(ctx, W, H, p, seed) {
    const paper = C(p.base || '#e8e0cf'), ink = C(p.ink || '#141414'), acc = C(p.accent || '#b8232a');
    pixels(ctx, W, H, (x, y, o) => {
      const n = fbm(x * 2.2, y * 2.2, seed, 6);
      const wash = smooth(0.48, 0.62, n);
      const sun = smooth(0.12, 0.1, Math.hypot(x - 1.45 - (seed % 10) * 0.02, y - 0.35));
      let c = mixRgb(paper, ink, wash * (0.6 + fbm(x * 20, y * 20, seed + 1, 2) * 0.4));
      c = mixRgb(c, acc, sun);
      set(o, c);
    });
  } },

  waves: { metal: 0.15, rough: 0.5, draw(ctx, W, H, p, seed) {
    const deep = C(p.deep || '#0d2a4a'), mid = C(p.mid || '#1f6aa0'), foam = C(p.foam || '#e8f4f8');
    pixels(ctx, W, H, (x, y, o) => {
      const row = y * 7 + fbm(x * 2, y * 2, seed, 3) * 1.5;
      const f = row - Math.floor(row);
      const crest = Math.sin((x * 6 + Math.floor(row) * 1.7 + seed * 0.01) * Math.PI) * 0.18;
      const t = f + crest;
      let c = mixRgb(deep, mid, smooth(0.2, 0.9, t));
      c = mixRgb(c, foam, smooth(0.92, 0.97, t) + smooth(0.06, 0.0, Math.abs(t - 0.85)) * 0.6);
      set(o, c);
    });
  } },

  // Pattern-welded steel: flowing layered bands that ripple around seed-placed knots.
  damascus: { metal: 0.85, rough: 0.28, draw(ctx, W, H, p, seed) {
    const a = C(p.light || '#c9ccd1'), b = C(p.dark || '#3a3d42'), layers = p.layers || 34;
    pixels(ctx, W, H, (x, y, o) => {
      const warp = fbm(x * 2.2, y * 2.2, seed, 4) * 2.6 + fbm(x * 7, y * 7, seed + 9, 3) * 0.35;
      const t = smooth(-0.3, 0.3, Math.sin(y * layers + warp * 6));
      const c = mixRgb(b, a, t);
      const g = (valueNoise(x * 400, y * 90, seed + 3) - 0.5) * 18;
      set(o, [c[0] + g, c[1] + g, c[2] + g]);
    });
  } },

  // Polished stone: soft clouding with thin dark veins.
  marble: { metal: 0.1, rough: 0.18, draw(ctx, W, H, p, seed) {
    const base = C(p.base), vein = C(p.vein), v2 = C(p.vein2 || p.vein);
    pixels(ctx, W, H, (x, y, o) => {
      const n = fbm(x * 3, y * 3, seed, 5);
      const v = Math.abs(Math.sin((x * 3 + y * 1.5 + n * 5) * Math.PI));
      const vb = Math.abs(Math.sin((x * 7 - y * 4 + fbm(x * 6, y * 6, seed + 8, 4) * 6) * Math.PI));
      let c = mixRgb(base, mixRgb(base, v2, 0.35), fbm(x * 1.5, y * 1.5, seed + 4, 4));
      c = mixRgb(c, vein, Math.min(1, smooth(0.06, 0.0, v) * 0.9 + smooth(0.03, 0.0, vb) * 0.35));
      set(o, c);
    });
  } },

  // Lacquered wood: growth rings that bend around knots, open pores along the grain.
  woodgrain: { metal: 0.0, rough: 0.42, draw(ctx, W, H, p, seed) {
    const light = C(p.light), dark = C(p.dark), rings = p.rings || 22;
    pixels(ctx, W, H, (x, y, o) => {
      const w = fbm(x * 0.8, y * 4, seed, 4) * 1.8;
      const ring = (((y * rings + w * 6 + Math.sin(x * 3 + seed) * 0.6) % 1) + 1) % 1;
      const t = smooth(0.0, 0.55, ring) * smooth(1.0, 0.7, ring);
      const c = mixRgb(dark, light, t * 0.85 + fbm(x * 30, y * 3, seed + 2, 2) * 0.15);
      const pore = valueNoise(x * 260, y * 30, seed + 5) > 0.82 ? 0.8 : 1;
      set(o, [c[0] * pore, c[1] * pore, c[2] * pore]);
    });
  } },

  // Anodised aluminium: deep metallic colour, machining swirls, darker toward the edges.
  anodized: { metal: 0.9, rough: 0.3, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.edge || p.base);
    pixels(ctx, W, H, (x, y, o) => {
      const sw = Math.sin(Math.hypot((x % 0.25) - 0.125, (y % 0.25) - 0.125) * 260 + seed) * 0.5 + 0.5;
      const c = mixRgb(a, b, smooth(0.2, 0.5, Math.abs(y - 0.5)));
      const k = 0.9 + sw * 0.1 + (valueNoise(x * 500, y * 3, seed) - 0.5) * 0.08;
      set(o, [c[0] * k, c[1] * k, c[2] * k]);
    });
  } },

  // Cracked glaze with metal-filled seams.
  kintsugi: { metal: 0.35, rough: 0.3, draw(ctx, W, H, p, seed) {
    const base = C(p.base), gold = C(p.gold || '#e8b84a');
    pixels(ctx, W, H, (x, y, o) => {
      const v = voronoi(x * 5 + fbm(x * 4, y * 4, seed, 3) * 0.6, y * 5, seed);
      const shade = 0.86 + v.id * 0.18;
      set(o, mixRgb([base[0] * shade, base[1] * shade, base[2] * shade], gold, smooth(0.035, 0.0, v.d2 - v.d1)));
    });
  } },

  // Hydro-dipped film: marbled bands of several colours dragged across the part.
  hydro: { metal: 0.2, rough: 0.4, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C);
    pixels(ctx, W, H, (x, y, o) => {
      const wx = x + fbm(x * 2, y * 2, seed, 4) * 0.8, wy = y + fbm(x * 2 + 5, y * 2, seed + 3, 4) * 0.8;
      const t = (Math.sin(wx * 9 + Math.sin(wy * 7) * 2) * 0.5 + 0.5) * (cols.length - 1);
      const i = Math.min(cols.length - 2, Math.floor(t));
      set(o, mixRgb(cols[i], cols[i + 1], smooth(0.35, 0.65, t - i)));
    });
  } },
};

Object.assign(FINISH_TYPES, ART_FINISHES);

// Illustrated finishes are painted through the hand-drawn renderer (ink lines,
// layered washes) and finished with paper grain. Value: brush style.
export const HAND_DRAWN = {
  anime: 'gouache', landscape: 'wash', koi: 'wash', wildstyle: 'gouache', comic: 'gouache', tattoo: 'gouache',
  mecha: 'gouache', shards: 'wash', splatter: 'wash', graffiti: 'gouache', livery: 'gouache', blueprint: 'wash',
};
const PAPER_ONLY = { ink: true };

// Paints the finish for `def` at the given size. Returns { canvas, metal, rough }.
export function paintFinish(def, seed, W = 1024, H = 512) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const type = def.finish.type;
  const pat = patternInfo(def, seed);
  const params = pat.params ? { ...def.finish, ...pat.params } : def.finish;
  const ft = FINISH_TYPES[type];
  const s = seed * 13 + (def.seedOffset || 0);
  if (HAND_DRAWN[type]) {
    // keep stroke widths consistent across texture sizes
    const k = W / 1024;
    const h = new HandCtx(ctx, { seed: s, style: HAND_DRAWN[type], wobble: 0.6 + k * 0.6 });
    ft.draw(h, W, H, params, s);
    paper(c, s, 0.9);
  } else {
    ft.draw(ctx, W, H, params, s);
    if (PAPER_ONLY[type]) paper(c, s, 0.7);
  }
  return { canvas: c, metal: def.finish.metal ?? ft.metal, rough: def.finish.rough ?? ft.rough };
}
