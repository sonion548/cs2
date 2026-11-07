// Procedural weapon finishes. Each finish type paints a 2:1 canvas from a set
// of parameters plus the item's pattern seed (0–999), which shifts, rotates
// or recolours the pattern so no two seeds look exactly alike. The types are
// spread over four files: this one (the Grip Case looks and a few others),
// finishes_art.js (illustrated), finishes_rework.js (the first rebuild) and
// finishes_v3.js (everything rebuilt after the second review).
import { makeCanvas } from './canvas.js';
import { patternInfo } from './patterns.js';
import { fbm, valueNoise, rng, hexToRgb, mixRgb, smooth } from '../noise.js';
import { ART_FINISHES } from './finishes_art.js';
import { REWORKED } from './finishes_rework.js';
import { POLISHED } from './finishes_v3.js';
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

Object.assign(FINISH_TYPES, ART_FINISHES, REWORKED, POLISHED);

// Illustrated finishes are painted through the hand-drawn renderer (ink lines,
// layered washes) and finished with paper grain. Value: brush style.
export const HAND_DRAWN = {
  anime: 'gouache', landscape: 'wash', koi: 'wash', wildstyle: 'gouache', comic: 'gouache', tattoo: 'gouache',
  mecha: 'gouache', blueprint: 'wash',
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
