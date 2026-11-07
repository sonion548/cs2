// Procedural weapon finishes. Each finish type paints a 2:1 canvas from a set
// of parameters plus the item's pattern seed (0–999), which shifts, rotates
// or recolours the pattern so no two seeds look exactly alike.
import { makeCanvas } from './canvas.js';
import { patternInfo } from './patterns.js';
import { fbm, voronoi, valueNoise, rng, hexToRgb, mixRgb, mix, smooth, clamp01 } from '../noise.js';
import { ART_FINISHES } from './finishes_art.js';
import { REWORKED } from './finishes_rework.js';
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

  // ---- Grip Case looks (gloves and the guns that match them)

  // Sport-glove bands: wide slanted stripes of colour over the base, a thin
  // pinstripe outside each edge and a perforated mesh in the base panels.
  stripes: { metal: 0.08, rough: 0.5, draw(ctx, W, H, p, seed) {
    const base = C(p.base), cols = p.colors.map(C), line = C(p.line || '#f2f2f2');
    const ang = (p.angle ?? 0.5) + ((seed % 97) / 97 - 0.5) * 0.25;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const period = p.period || 0.5, wid = (p.width || 0.5) * period;
    const off = (seed % 1000) / 1000 * period * cols.length;
    const px = 1 / H, pinW = Math.max(0.0035, px);
    pixels(ctx, W, H, (x, y, o) => {
      const d = x * ca + y * sa + off;
      const k = Math.floor(d / period), f = d - k * period;      // texture units into this period
      const inBand = smooth(-px, px, f) * smooth(wid + px, wid - px, f);
      let c = mixRgb(base, cols[((k % cols.length) + cols.length) % cols.length], inBand);
      const pin = Math.max(smooth(pinW + px, pinW - px, Math.abs(f - wid - 0.012)), smooth(pinW + px, pinW - px, Math.abs(f - period + 0.012)));
      c = mixRgb(c, line, pin);
      if (inBand < 0.5) {
        const gx = x * 70, row = Math.floor(gx), gy = y * 70 + (row % 2) * 0.5;
        const hole = smooth(0.24, 0.15, Math.hypot(gx - row - 0.5, gy - Math.floor(gy) - 0.5));
        c = mixRgb(c, [c[0] * 0.45, c[1] * 0.45, c[2] * 0.45], hole * (1 - pin));
      }
      const n = 1 + (fbm(x * 5, y * 5, seed, 3) - 0.5) * 0.18 + (valueNoise(x * 400, y * 400, seed + 3) - 0.5) * 0.06;
      set(o, [c[0] * n, c[1] * n, c[2] * n]);
    });
  } },

  // Tartan: a mirrored sett of coloured bands crossing at right angles,
  // woven as a 2/2 twill (alternate threads show the warp or the weft).
  plaid: { metal: 0.0, rough: 0.72, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C);
    const half = p.sett || [[0, 8], [1, 2], [0, 2], [2, 1], [0, 6], [3, 4], [1, 10]];
    const sett = [...half, ...half.slice().reverse()];
    const lut = [];
    for (const [ci, w] of sett) for (let i = 0; i < w; i++) lut.push(cols[ci]);
    const total = lut.length, unit = (p.scale || 0.45) / total;
    const thread = Math.max(1 / 170, 3 / H);
    const shift = (seed % 997) / 997 * total, rot = ((seed % 13) / 13 - 0.5) * 0.1;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const fr = (v) => v - Math.floor(v);
    pixels(ctx, W, H, (x, y, o) => {
      const u = x * cr - y * sr + 2, v = x * sr + y * cr + 2;
      const warp = lut[Math.floor(u / unit + shift) % total], weft = lut[Math.floor(v / unit + shift) % total];
      const tx = Math.floor(u / thread), ty = Math.floor(v / thread);
      const over = ((tx + ty) & 3) < 2;
      const c = over ? warp : weft;
      const sh = Math.sin((over ? fr(v / thread) : fr(u / thread)) * Math.PI);
      const k = 0.8 + sh * 0.2 + (valueNoise(x * 60, y * 60, seed) - 0.5) * 0.08;
      set(o, [c[0] * k, c[1] * k, c[2] * k]);
    });
  } },

  // Woven leather (or tape when `straight`): a basket weave of strips, each
  // rounded across its width and dipping where it passes under, dark gaps
  // between. `alt` colours the strips running the other way.
  weave: { metal: 0.04, rough: 0.48, draw(ctx, W, H, p, seed) {
    const base = C(p.base), dark = C(p.dark || '#111111'), alt = C(p.alt || p.base);
    const ang = p.straight ? 0 : Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang);
    const cell = p.cell || 0.05;
    pixels(ctx, W, H, (x, y, o) => {
      const u = (x * ca - y * sa) / cell + 100, v = (x * sa + y * ca) / cell + 100;
      const iu = Math.floor(u), iv = Math.floor(v);
      const horiz = ((iu + iv) & 1) === 0;
      const across = horiz ? v - iv : u - iu, along = horiz ? u - iu : v - iv;
      const s2 = across * 2, strip = Math.floor(s2), s = s2 - strip;
      const gap = smooth(0.05, 0.13, Math.min(s, 1 - s)) * smooth(0.0, 0.06, Math.min(along, 1 - along));
      const tone = 0.94 + ((iu * 7 + iv * 13 + strip * 5) % 5) * 0.03;
      const lum = (0.6 + 0.4 * Math.sin(s * Math.PI)) * (0.82 + 0.18 * Math.sin(along * Math.PI)) * tone
        + (valueNoise(x * 220, y * 220, seed) - 0.5) * 0.1 + (fbm(x * 8, y * 8, seed + 1, 3) - 0.5) * 0.12;
      const c = horiz ? base : alt;
      set(o, mixRgb(dark, [c[0] * lum, c[1] * lum, c[2] * lum], gap));
    });
  } },

  // A hedge maze: a perfect maze carved on a grid by a random depth-first
  // walk, its walls drawn as raised strips with a shadow and a lit top.
  maze: { metal: 0.04, rough: 0.6, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 11);
    const ny = p.rows || 9, nx = ny * 2, cs = H / ny;
    const right = new Uint8Array(nx * ny).fill(1), down = new Uint8Array(nx * ny).fill(1), seen = new Uint8Array(nx * ny);
    const stack = [Math.floor(r() * nx * ny)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1], cx = c % nx, cy = (c / nx) | 0;
      const opts = [];
      if (cx > 0 && !seen[c - 1]) opts.push(-1);
      if (cx < nx - 1 && !seen[c + 1]) opts.push(1);
      if (cy > 0 && !seen[c - nx]) opts.push(-nx);
      if (cy < ny - 1 && !seen[c + nx]) opts.push(nx);
      if (!opts.length) { stack.pop(); continue; }
      const d = opts[Math.floor(r() * opts.length)], n = c + d;
      if (d === 1) right[c] = 0; else if (d === -1) right[n] = 0; else if (d === nx) down[c] = 0; else down[n] = 0;
      seen[n] = 1; stack.push(n);
    }
    const seg = [];
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
      const c = cy * nx + cx, x0 = cx * cs, y0 = cy * cs;
      if (right[c] && cx < nx - 1) seg.push([x0 + cs, y0, x0 + cs, y0 + cs]);
      if (down[c] && cy < ny - 1) seg.push([x0, y0 + cs, x0 + cs, y0 + cs]);
    }
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    const lw = cs * (p.wall || 0.4);
    const pass = (color, width, dx, dy) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'square';
      ctx.beginPath();
      for (const [a, b, c, d] of seg) { ctx.moveTo(a + dx, b + dy); ctx.lineTo(c + dx, d + dy); }
      ctx.stroke();
    };
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = cs * 0.25;
    pass('rgba(0,0,0,0.3)', lw, cs * 0.07, cs * 0.09);
    ctx.shadowBlur = 0;
    pass(p.line, lw, 0, 0);
    pass(p.line2 || p.line, lw * 0.4, -lw * 0.14, -lw * 0.14);
    grain(ctx, W, H, seed, 16);
  } },

  // Kimono print: tone-on-tone wave scales behind scattered five-petal
  // blossoms with pale petals, a deep-coloured heart and fine gold outlines.
  floral: { metal: 0.08, rough: 0.42, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 17);
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    const R = H / 8, lw = Math.max(1, H / 340);
    ctx.lineWidth = lw;
    for (let row = -1; row * R * 0.5 < H + R; row++) {
      const y = row * R * 0.5, off = (row & 1) * R;
      for (let x = -R * 2 + off; x < W + R * 2; x += R * 2) {
        ctx.fillStyle = p.base; ctx.beginPath(); ctx.arc(x, y, R, Math.PI, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = p.wave || 'rgba(0,0,0,0.2)';
        for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(x, y, R * k / 4 - lw, Math.PI, 2 * Math.PI); ctx.stroke(); }
      }
    }
    const petal = (s) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-0.55 * s, -0.25 * s, -0.5 * s, -0.85 * s, -0.2 * s, -s);
      ctx.lineTo(0, -0.84 * s);
      ctx.lineTo(0.2 * s, -s);
      ctx.bezierCurveTo(0.5 * s, -0.85 * s, 0.55 * s, -0.25 * s, 0, 0);
      ctx.closePath();
    };
    const bloom = (x, y, s, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, p.heart || '#c8304a'); g.addColorStop(0.35, p.petal); g.addColorStop(1, p.petal);
      for (let i = 0; i < 5; i++) {
        ctx.rotate(Math.PI * 2 / 5);
        petal(s);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = p.line || '#e0b04a'; ctx.lineWidth = lw * 1.6; ctx.stroke();
      }
      ctx.fillStyle = p.line || '#e0b04a';
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, lw * 1.8, 0, 7); ctx.fill(); }
      ctx.restore();
    };
    const n = p.count || 26;
    for (let i = 0; i < n; i++) {
      const s = H * (0.045 + r() * r() * 0.1), x = r() * W, y = r() * H, rot = r() * 6.28;
      // drawn again across the edges so the print wraps
      for (const dx of [0, -W, W]) for (const dy of [0, -H, H]) if (x + dx > -s && x + dx < W + s && y + dy > -s && y + dy < H + s) bloom(x + dx, y + dy, s, rot);
    }
    for (let i = 0; i < n; i++) {
      ctx.save(); ctx.translate(r() * W, r() * H); ctx.rotate(r() * 6.28);
      petal(H * 0.025); ctx.fillStyle = p.petal; ctx.fill(); ctx.strokeStyle = p.line || '#e0b04a'; ctx.lineWidth = lw; ctx.stroke();
      ctx.restore();
    }
    grain(ctx, W, H, seed, 8);
  } },
};

// Fine noise over a canvas-drawn finish, so flat fills read as a material.
function grain(ctx, W, H, seed, amt) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data, r = rng(seed + 99);
  for (let i = 0; i < d.length; i += 4) { const g = (r() - 0.5) * amt; d[i] += g; d[i + 1] += g; d[i + 2] += g; }
  ctx.putImageData(img, 0, 0);
}

Object.assign(FINISH_TYPES, ART_FINISHES, REWORKED);

// Illustrated finishes are painted through the hand-drawn renderer (ink lines,
// layered washes) and finished with paper grain. Value: brush style.
export const HAND_DRAWN = {
  anime: 'gouache', landscape: 'wash', koi: 'wash', wildstyle: 'gouache', comic: 'gouache', tattoo: 'gouache',
  mecha: 'gouache', shards: 'wash', splatter: 'wash', graffiti: 'gouache', blueprint: 'wash',
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
