// Third pass on the finishes, after the second skin review: every finish type
// brought up to the standard of the best Counter-Strike skins in its tier.
// Same names and colours as before; the drawings get real structure, depth
// and one clear graphic idea each (see the review document for what changed).
import { fbm, valueNoise, rng, hexToRgb, mixRgb, smooth, clamp01 } from '../noise.js';
import { makeCanvas } from './canvas.js';

const C = (h) => hexToRgb(h);
const set = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const add = (c, k) => [c[0] + k, c[1] + k, c[2] + k];
const fr = (v) => v - Math.floor(v);
const WHITE = [255, 255, 255];
// mixing in linear light keeps fades bright through the middle instead of muddy
const lin = (a, b, t) => [
  Math.sqrt(a[0] * a[0] + (b[0] * b[0] - a[0] * a[0]) * t),
  Math.sqrt(a[1] * a[1] + (b[1] * b[1] - a[1] * a[1]) * t),
  Math.sqrt(a[2] * a[2] + (b[2] * b[2] - a[2] * a[2]) * t),
];
function ramp(cols, t) {
  const seg = clamp01(t) * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(seg));
  return lin(cols[i], cols[i + 1], smooth(0, 1, seg - i));
}
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Per-pixel helper: fn(x, y, out, i, j) with x in [0, 2), y in [0, 1).
function pixels(ctx, W, H, fn) {
  const img = ctx.createImageData(W, H), o = [0, 0, 0];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    fn(i / H, j / H, o, i, j);
    const k = (j * W + i) * 4;
    img.data[k] = o[0]; img.data[k + 1] = o[1]; img.data[k + 2] = o[2]; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Sparse glints on a jittered grid (0..1): metal flake catching the light.
function glint(x, y, seed, cell, chance, size) {
  const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy);
  let best = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const cx = ix + di, cy = iy + dj;
    if (hash(cx, cy, seed) > chance) continue;
    const px = cx + hash(cx, cy, seed + 1), py = cy + hash(cx, cy, seed + 2);
    const d = Math.hypot(gx - px, gy - py) * cell / size;
    const b = Math.exp(-d * d) * (0.45 + 0.55 * hash(cx, cy, seed + 3));
    if (b > best) best = b;
  }
  return best;
}


const hex = (c) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;

// Spray-stencilled markings (unit code, ruler ticks, a big outlined number
// or chevrons), the kind of graphic a real issued finish carries. `col` is
// an [r,g,b]; style picked from the seed.
function stencil(ctx, W, H, seed, col, { alpha = 0.6, at = null } = {}) {
  const r = rng(seed + 401), style = Math.floor(r() * 3);
  const x0 = at ? at[0] * W : W * (0.05 + r() * 0.12), y0 = at ? at[1] * H : H * (0.14 + r() * 0.08);
  ctx.save();
  ctx.globalAlpha = alpha; ctx.fillStyle = hex(col); ctx.strokeStyle = hex(col);
  ctx.font = `bold ${Math.round(H * 0.05)}px monospace`;
  const code = `VNT-${String(10 + (seed % 89)).padStart(2, '0')}`;
  if (style === 0) {
    ctx.fillText(`${code}  //  ${['5.56', '7.62', '9MM', '.45'][seed % 4]}`, x0, y0);
    for (let i = 0; i < 22; i++) ctx.fillRect(x0 + i * H * 0.018, y0 + H * 0.02, H * 0.005, i % 5 ? H * 0.018 : H * 0.036);
  } else if (style === 1) {
    // a big outlined stencil number with bridges, like a crate marking
    const num = String(1 + (seed % 9)).padStart(2, '0');
    ctx.font = `900 ${Math.round(H * 0.34)}px sans-serif`;
    ctx.lineWidth = H * 0.012;
    ctx.strokeText(num, W * (0.68 + r() * 0.1), H * 0.62);
    ctx.fillRect(W * 0.66, H * 0.66, H * 0.42, H * 0.012);
    ctx.font = `bold ${Math.round(H * 0.045)}px monospace`;
    ctx.fillText(code, x0, y0);
  } else {
    ctx.lineWidth = H * 0.026; ctx.lineJoin = 'miter';
    for (let i = 0; i < 3; i++) {
      const cx = W * 0.82 + i * H * 0.06, cy = H * 0.5;
      ctx.beginPath(); ctx.moveTo(cx - H * 0.045, cy - H * 0.1); ctx.lineTo(cx + H * 0.02, cy); ctx.lineTo(cx - H * 0.045, cy + H * 0.1); ctx.stroke();
    }
    ctx.fillText(code, x0, y0);
  }
  ctx.restore();
}

// Nearest feature point of a jittered grid: distance, the offset to it, the
// second distance and a per-cell id (0..1).
function cell(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, dx = 0, dy = 0, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const px = cx + 0.15 + 0.7 * hash(cx, cy, seed), py = cy + 0.15 + 0.7 * hash(cx, cy, seed + 7);
    const ex = x - px, ey = y - py, d = Math.hypot(ex, ey);
    if (d < d1) { d2 = d1; d1 = d; dx = ex; dy = ey; id = hash(cx, cy, seed + 13); } else if (d < d2) d2 = d;
  }
  return { d1, d2, dx, dy, id };
}

export const POLISHED = {

  // Doppler: mirror-polished candy coat over black steel. Smoke-like streams
  // of colour run along the blade with deep black voids between them, thin
  // bright and dark threads where the streams fold over each other, pastel
  // crests where the coat is thinnest, and a scatter of glinting flake.
  doppler: { metal: 0.95, rough: 0.11, draw(ctx, W, H, p, seed) {
    const cols = (p.palette || ['#05030a', '#3a1a5a', '#c04ab0', '#ffb0e0']).map(C);
    const black = mul(cols[0], 0.7), deep = cols[1], mid = cols[2], hi = cols[3];
    const pastel = lin(hi, WHITE, 0.4);
    const ox = (seed % 97) * 0.41, oy = (seed % 89) * 0.33;
    pixels(ctx, W, H, (x, y, o) => {
      const X = x * 0.75 + ox, Y = y * 1.45 + oy;
      const a = fbm(X * 1.25, Y * 1.25, seed, 4), b = fbm(X * 1.25 + 5.2, Y * 1.25 + 1.3, seed + 7, 4);
      const c2 = fbm(X * 2.3 + a * 2.8, Y * 2.3 + b * 2.8, seed + 13, 5);
      const d2 = fbm(X * 5.5 + c2 * 3, Y * 5.5 - c2 * 2.2, seed + 21, 3);
      const v = c2 * 0.82 + d2 * 0.18;
      const t = smooth(0.32, 0.74, v);
      let col = t < 0.33 ? lin(black, deep, smooth(0, 1, t / 0.33)) : t < 0.7 ? lin(deep, mid, smooth(0, 1, (t - 0.33) / 0.37)) : lin(mid, hi, smooth(0, 1, (t - 0.7) / 0.3));
      // threads following the flow: bright where the stream is lit, dark in the voids
      const th = Math.pow(Math.abs(Math.sin(v * 26 + a * 4)), 22) * smooth(0.38, 0.62, v);
      const dk = Math.pow(Math.abs(Math.cos(v * 17 + b * 5)), 26) * (1 - smooth(0.5, 0.78, v));
      col = lin(col, lin(hi, pastel, 0.35), th * 0.8);
      col = mixRgb(col, black, dk * 0.55);
      // crest: the coat thins to pastel on the brightest ridges
      col = lin(col, pastel, smooth(0.8, 0.95, v) * 0.6);
      const g = glint(x, y, seed + 31, 0.016, 0.05, 0.0014);
      set(o, lin(col, lin(hi, WHITE, 0.6), g * 0.8));
    });
  } },

  // Fade: candy paint airbrushed over polished metal in a curved sweep. Each
  // colour arrives as spray (a speckled edge, as a real airbrushed fade has),
  // a faint pearl sheen rides along the sweep, and the brushed metal under
  // the coat shows as fine lines.
  gradient: { metal: 0.7, rough: 0.2, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C);
    const shift = p.fade != null ? (p.fade - 0.9) * 3 : ((seed % 1000) / 1000) * 0.6 - 0.3;
    const r = rng(seed + 5);
    const ang = -0.42 + r() * 0.16, curve = 0.5 + r() * 0.3;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const u = (x - 1) * ca + (y - 0.5) * sa, v = -(x - 1) * sa + (y - 0.5) * ca;
      const t = clamp01(0.5 + u * 0.56 + shift * 0.32 - curve * v * v * 0.6 + (fbm(x * 2.2, y * 2.2, seed, 3) - 0.5) * 0.05);
      const seg = t * (cols.length - 1), k = Math.min(cols.length - 2, Math.floor(seg)), f = seg - k;
      const spray = 4 * f * (1 - f);
      const f2 = clamp01(f + (hash(i >> 1, j >> 1, seed) - 0.5) * 0.16 * spray);
      let c = lin(cols[k], cols[k + 1], smooth(0, 1, f2));
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      const brush = 1 + (fbm(x * 1.4, y * 300, seed + 9, 2) - 0.5) * 0.06 * (1 - lum);
      const pearl = Math.exp(-Math.pow((u + 0.12 - shift * 0.3) * 6, 2)) * 22;
      c = [c[0] * brush + pearl, c[1] * brush + pearl, c[2] * brush + pearl];
      set(o, c);
    });
  } },

  // Marbled candy swirl: the colours are combed through each other into
  // flowing flame-like bands with crisp edges, soft lit insides and thin dark
  // seams where two colours meet, then coated (pastel crests, glinting flake).
  // Phases change which colour leads; gem phases use one jewel tone.
  swirl: { metal: 0.65, rough: 0.17, draw(ctx, W, H, p, seed) {
    const cols = (p.gem || p.colors).map(C);
    const bias = p.phase ? [0.6, 1, 1.7, 2.6][p.phase - 1] : 1;
    const n = cols.length;
    const ox = (seed % 83) * 0.31, oy = (seed % 79) * 0.27;
    pixels(ctx, W, H, (x, y, o) => {
      const X = x * 0.8 + ox, Y = y * 1.3 + oy;
      const a = fbm(X * 1.5, Y * 1.5, seed, 4), b = fbm(X * 1.5 + 3.1, Y * 1.5 + 7.7, seed + 1, 4);
      const w = fbm(X * 2.1 + a * 3.4, Y * 2.1 + b * 3.4, seed + 3, 5);
      const s = Math.sin((w * 6.5 + x * 0.35) * Math.PI) * 0.5 + 0.5;
      const tt = Math.pow(s, bias);
      // posterise into bands with a soft inside: crisp where colours meet
      const q = tt * (n - 1), k = Math.min(n - 2, Math.floor(q)), f = q - k;
      const edge = smooth(0, 0.16, f);
      let c = lin(cols[k], cols[k + 1], edge);
      c = lin(c, lin(cols[k + 1], WHITE, 0.18), smooth(0.45, 1, f) * 0.5);
      // dark seam just where the next colour starts
      const seam = Math.exp(-Math.pow(f / 0.035, 2)) * (k > 0 || f > 0.02 ? 1 : 0);
      c = mul(c, 1 - seam * 0.45);
      c = lin(c, lin(cols[n - 1], WHITE, 0.5), smooth(0.93, 1, tt) * 0.55);
      const g = glint(x, y, seed + 17, 0.016, 0.06, 0.0013);
      set(o, lin(c, WHITE, g * 0.6));
    });
  } },

  // Camouflage, printed the way real camo is: big lobed shapes in three or
  // four tones with rough, brushed edges, a second scale of small shapes
  // breaking them up, a darker print rim inside each shape, a fabric weave
  // under it all and an issued marking stencilled on top.
  camo: { metal: 0.05, rough: 0.78, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C), sc = (p.scale || 5) * 0.85, n = cols.length;
    const ox = (seed % 61) * 0.7, oy = (seed % 53) * 0.9;
    pixels(ctx, W, H, (x, y, o, i, j) => {
      let k = 0, e = 1;
      for (let m = 1; m < n; m++) {
        const s = sc * (1 + (m - 1) * 0.2);
        const X = x * s + ox + m * 13.1, Y = y * s * 1.15 + oy + m * 7.7;
        const w = (fbm(X * 0.45, Y * 0.45, seed + m * 7, 2) - 0.5) * 2.2;
        const v = fbm(X + w, Y - w * 0.6, seed + m * 101, 4) + (fbm(X * 7, Y * 7, seed + m * 211, 2) - 0.5) * 0.1;
        const th = 0.52 + (m - 1) * 0.022;
        if (v > th) { k = m; e = v - th; }
      }
      let c = cols[k];
      // small shapes of another tone break up the big ones
      const mk = fbm(x * sc * 4.4 + 50, y * sc * 5, seed + 77, 3) + (fbm(x * sc * 16, y * sc * 16, seed + 78, 1) - 0.5) * 0.08;
      if (mk > 0.69) c = cols[(k + 1 + (k === 0 ? 1 : 0)) % n];
      c = mul(c, 1 - smooth(0.035, 0.0, e) * (k > 0 ? 0.13 : 0));
      const weave = ((i + j) % 4 < 2 ? 1 : -1) * 3 + (hash(i, j, seed) - 0.5) * 9;
      set(o, add(c, weave));
    });
    const dark = cols.reduce((a, b) => (lum(a) < lum(b) ? a : b)), light = cols.reduce((a, b) => (lum(a) > lum(b) ? a : b));
    stencil(ctx, W, H, seed, lum(cols[0]) > 0.45 ? mul(dark, 0.55) : lin(light, WHITE, 0.25), { alpha: 0.78 });
  } },

  // Digital camo at two pixel sizes, the way issued pixel patterns are drawn:
  // blocky shapes whose edges are nibbled by single half-size pixels, a slight
  // print variation cell to cell, a fabric grain and a stencilled marking.
  digital: { metal: 0.05, rough: 0.74, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C), px = p.pixel || 0.025, n = cols.length;
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const qx = Math.floor(x / px), qy = Math.floor(y / px);
      const sx = Math.floor(x / (px * 0.5)), sy = Math.floor(y / (px * 0.5));
      let c = cols[0], top = 0;
      for (let k = 1; k < n; k++) {
        const v = fbm(qx * px * 4 + k * 9, qy * px * 4.8, seed + k * 37, 4);
        const nib = (hash(sx, sy, seed + k * 3) - 0.5) * 0.07;
        if (v + nib > 0.5 + k * 0.028) { c = cols[k]; top = k; }
      }
      c = mul(c, 1 + (hash(qx, qy, seed + 9) - 0.5) * 0.07);
      set(o, add(c, (hash(i, j, seed) - 0.5) * 9));
    });
    const dark = cols.reduce((a, b) => (lum(a) < lum(b) ? a : b)), light = cols.reduce((a, b) => (lum(a) > lum(b) ? a : b));
    stencil(ctx, W, H, seed, lum(cols[0]) > 0.45 ? mul(dark, 0.55) : lin(light, WHITE, 0.25), { alpha: 0.78 });
  } },

  // Two-tone cerakote: a slanted accent panel with crisp masked edges and a
  // lit lip, a halftone dot fade spilling out of it, a thin second band and
  // pinline, chevrons, a machined bevel line, and the maker's microtext and
  // barcode. Without an accent colour it is tone-on-tone (stealth).
  paint: { metal: 0.2, rough: 0.55, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 31), base = C(p.base);
    const L = lum(base);
    const tone = mul(base, L < 0.35 ? 1.5 : 0.7);
    const acc = p.accent ? C(p.accent) : tone, pin = p.accent ? mul(C(p.accent), 0.62) : mul(base, L < 0.35 ? 2.1 : 0.5);
    // mottled cerakote base: a slow tonal cloud and a fine powder grain
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const m = (fbm(x * 2.2, y * 2.2, seed, 4) - 0.5) * 0.12 + (fbm(x * 40, y * 40, seed + 3, 2) - 0.5) * 0.05;
      set(o, add(mul(base, 1 + m), (hash(i, j, seed) - 0.5) * 6));
    });
    const k = H * (0.35 + r() * 0.25);
    const slab = (x0, w, kk, fill, alpha = 1) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = hex(fill);
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w - kk, H); ctx.lineTo(x0 - kk, H); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    };
    const x1 = W * (0.2 + r() * 0.1), w1 = W * (0.12 + r() * 0.05);
    // halftone fade out of the panel's trailing edge
    ctx.fillStyle = hex(acc);
    const step = H * 0.034, spread = W * 0.2;
    for (let yy = step / 2; yy < H; yy += step) {
      const edge = x1 + w1 - k * (yy / H);
      for (let d = step * 0.6; d < spread; d += step) {
        const rr = step * 0.48 * Math.pow(1 - d / spread, 1.3);
        if (rr < 0.6) continue;
        ctx.beginPath(); ctx.arc(edge + d + ((Math.round(yy / step) & 1) ? step / 2 : 0), yy, rr, 0, Math.PI * 2); ctx.fill();
      }
    }
    slab(x1, w1, k, acc);
    // lit lip along the panel's leading edge, shadow along the trailing edge
    slab(x1, W * 0.004, k, mul(acc, 1.35));
    slab(x1 + w1 - W * 0.004, W * 0.004, k, mul(acc, 0.6));
    slab(x1 - W * 0.022, W * 0.006, k, pin);
    const x2 = W * (0.6 + r() * 0.1);
    slab(x2, W * 0.045, -k, acc, 0.92);
    slab(x2 + W * 0.055, W * 0.006, -k, pin, 0.9);
    // machined bevel line along the length
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = hex(mul(base, 0.6)); ctx.fillRect(0, H * 0.74, W, H * 0.004);
    ctx.fillStyle = hex(mul(base, 1.4)); ctx.fillRect(0, H * 0.744, W, H * 0.003);
    ctx.globalAlpha = 1;
    // chevrons
    ctx.strokeStyle = hex(acc); ctx.lineWidth = H * 0.028; ctx.lineJoin = 'miter';
    for (let i = 0; i < 2; i++) {
      const cx = W * 0.88 + i * H * 0.07, cy = H * 0.42;
      ctx.beginPath(); ctx.moveTo(cx - H * 0.05, cy - H * 0.11); ctx.lineTo(cx + H * 0.02, cy); ctx.lineTo(cx - H * 0.05, cy + H * 0.11); ctx.stroke();
    }
    // maker's microtext, serial and barcode
    ctx.fillStyle = hex(pin); ctx.globalAlpha = 0.7;
    ctx.font = `bold ${Math.round(H * 0.048)}px monospace`;
    ctx.fillText(`VT-${100 + (seed % 900)}  CAL ${['7.62', '5.56', '9MM'][seed % 3]}`, W * 0.04, H * 0.14);
    ctx.font = `${Math.round(H * 0.032)}px monospace`;
    ctx.fillText(`LOT ${String.fromCharCode(65 + (seed % 26))}${(seed * 7) % 100}  ·  CERAKOTE H-SERIES`, W * 0.46, H * 0.86);
    for (let i = 0, xx = W * 0.04; i < 30; i++) { const bw = H * (0.004 + ((seed >> (i % 9)) & 1) * 0.006); ctx.fillRect(xx, H * 0.18, bw, H * 0.05); xx += bw + H * 0.006; }
    ctx.globalAlpha = 1;
  } },

  // Figured wood under lacquer: growth rings bending round knots, flame
  // figure shimmering across the grain, medullary flecks, open pores, a
  // slow heartwood-to-sapwood drift and a warm lacquer depth.
  woodgrain: { metal: 0.0, rough: 0.36, draw(ctx, W, H, p, seed) {
    const light = C(p.light), dark = C(p.dark), rings = p.rings || 22;
    const deep = mul(dark, 0.7), warm = lin(light, [255, 214, 150], 0.18);
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const w = fbm(x * 0.8, y * 4, seed, 4) * 1.8;
      const knot = Math.exp(-((x - 0.6 - (seed % 7) * 0.12) ** 2 * 40 + (y - 0.45) ** 2 * 60));
      const ringPos = y * rings + w * 6 + Math.sin(x * 3 + seed) * 0.6 + knot * 3;
      const ring = fr(ringPos);
      const late = smooth(0.0, 0.55, ring) * smooth(1.0, 0.72, ring);
      let c = lin(deep, light, late * 0.82 + fbm(x * 30, y * 3, seed + 2, 2) * 0.18);
      // flame figure: soft wavy bands across the grain that catch the light
      const fl = Math.sin(x * 17 + (fbm(x * 2.2, y * 5, seed + 4, 3) - 0.5) * 7 + y * 2.5) * 0.5 + 0.5;
      const flame = smooth(0.35, 0.95, fl);
      c = lin(c, warm, flame * 0.2);
      c = mul(c, 0.94 + flame * 0.08);
      // heartwood drift, flecks and pores
      c = mul(c, 0.9 + fbm(x * 0.7, y * 0.9, seed + 6, 3) * 0.2);
      const pore = valueNoise(x * 24, y * 300, seed + 5) > 0.84 ? 0.86 : 1;
      set(o, mul(c, pore));
    });
  } },

  // Hydro-dip / acrylic pour: films of colour dragged one way and folded
  // over, breaking into round cells where the film thins (each cell ringed in
  // a darker lace and showing the colour underneath), thin white lacing
  // along some of the colour edges, under a glossy clear coat.
  hydro: { metal: 0.22, rough: 0.28, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C), n = cols.length;
    const ox = (seed % 71) * 0.53, oy = (seed % 67) * 0.41;
    pixels(ctx, W, H, (x, y, o) => {
      const X = x + ox, Y = y + oy;
      const a = fbm(X * 1.3, Y * 2.1, seed, 4), b = fbm(X * 1.3 + 4.7, Y * 2.1 + 2.1, seed + 5, 4);
      const u = X * 1.1 + a * 2.4, v = Y * 2.2 + b * 1.9;
      const f = fbm(u, v, seed + 9, 5) + Math.sin(u * 3.1 + v * 0.8) * 0.05;
      const band = f * n * 2.8, bi = Math.floor(band), bf = band - bi;
      const ci = ((bi % n) + n) % n, cn = (ci + 1) % n;
      let c = lin(cols[ci], cols[cn], smooth(0.84, 1, bf));
      // white lacing on every third edge
      if (bi % 3 === 0) c = lin(c, lin(cols[cn], WHITE, 0.75), Math.exp(-Math.pow((bf - 0.8) / 0.025, 2)) * 0.85);
      // cells where the film thins
      const thin = smooth(0.42, 0.64, fbm(u * 1.4 + 9, v * 1.4, seed + 31, 3));
      if (thin > 0.01) {
        const k = cell(u * 4.6, v * 4.6, seed + 21);
        const r = (0.2 + 0.24 * k.id) * thin;
        const inside = smooth(r, r - 0.025, k.d1);
        const rim = Math.exp(-Math.pow((k.d1 - r) / 0.03, 2)) * (r > 0.05 ? 1 : 0);
        c = lin(c, lin(cols[(ci + 2) % n], WHITE, 0.1), inside);
        c = mul(c, 1 - rim * 0.45);
      }
      set(o, c);
    });
  } },

  // Tiger: stripes that taper to points, fork and break, their edges
  // feathered by fur; the coat darker along the back and pale underneath,
  // with fine fur strokes running along the body.
  tiger: { metal: 0.08, rough: 0.6, draw(ctx, W, H, p, seed) {
    const base = C(p.base), stripe = C(p.stripe), f = (p.freq || 9) * 0.85;
    const belly = lin(base, WHITE, 0.5), back = mul(base, 0.74);
    const ox = (seed % 37) * 0.31;
    pixels(ctx, W, H, (x, y, o) => {
      const fur = fbm(x * 26, y * 240, seed + 13, 2) - 0.5;
      const warp = (fbm(x * 1.5 + ox, y * 2.4, seed, 4) - 0.5) * 2.4;
      const u = x * f + warp * 2 + Math.sin(y * 4.5 + seed) * 0.3;
      const sv = Math.cos(u * Math.PI) + fur * 0.22;
      const w = 0.38 + (fbm(x * 3.2 + ox, y * 2.6, seed + 5, 3) - 0.5) * 1.5 + Math.abs(y - 0.5) * 0.5;
      let t = smooth(w, w + 0.1, sv);
      // a thin stripe splits off beside some stripes
      const fork = smooth(0.6, 0.66, fbm(x * 4 + 3, y * 3.5, seed + 9, 2)) * smooth(0.07, 0.0, Math.abs(sv - w + 0.32));
      t = Math.max(t, fork);
      const yy = y + (fbm(x * 2, y, seed + 2, 2) - 0.5) * 0.25;
      let c = lin(back, base, smooth(0.0, 0.42, yy));
      c = lin(c, belly, smooth(0.7, 1.0, yy));
      c = lin(c, stripe, t);
      set(o, mul(c, 1 + fur * 0.18));
    });
  } },

  // Leopard: rosettes as broken, uneven rings round a darker tan centre,
  // small solid spots between them, a fur texture and a paler underside.
  spots: { metal: 0.06, rough: 0.66, draw(ctx, W, H, p, seed) {
    const base = C(p.base), spot = C(p.spot), ring = C(p.ring || '#151210');
    const belly = lin(base, WHITE, 0.35), back = mul(base, 0.85);
    pixels(ctx, W, H, (x, y, o) => {
      const fur = fbm(x * 26, y * 240, seed + 13, 2) - 0.5;
      const wx = x + (fbm(x * 3, y * 3, seed, 3) - 0.5) * 0.1, wy = y + (fbm(x * 3 + 7, y * 3, seed + 1, 3) - 0.5) * 0.1;
      const k = cell(wx * 7.2, wy * 8, seed);
      let c = lin(back, base, smooth(0.0, 0.4, y));
      c = lin(c, belly, smooth(0.72, 1.0, y));
      if (k.id < 0.22) {
        // small solid spot
        c = lin(c, ring, smooth(0.2, 0.15, k.d1 + fur * 0.05));
      } else {
        const R = 0.27 + k.id * 0.1;
        const ang = Math.atan2(k.dy, k.dx);
        const gap = fbm(Math.cos(ang) * 1.3 + k.id * 17, Math.sin(ang) * 1.3, seed + 3, 2);
        const th = 0.06 + 0.05 * fbm(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + k.id * 9, seed + 4, 2);
        const inner = smooth(R - th * 0.4, R - th * 1.2, k.d1);
        c = lin(c, lin(base, spot, 0.75), inner);
        const onRing = smooth(th, th * 0.6, Math.abs(k.d1 - R) + fur * 0.03) * smooth(0.38, 0.46, gap);
        c = lin(c, ring, onRing);
      }
      set(o, mul(c, 1 + fur * 0.16));
    });
  } },

  // Folded steel: layer lines of a forge-folded billet, polished bright and
  // etched dark, swirling into eyes round the bumps (mokume), with a frosty
  // temper line (hamon) wandering along one edge and its sparkle (nie).
  folded: { metal: 0.9, rough: 0.22, draw(ctx, W, H, p, seed) {
    const a = C(p.base || '#9aa0a8'), b = C(p.dark || '#3a3e44');
    const hi = lin(a, WHITE, 0.4);
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const h = fbm(x * 1.7, y * 2.8, seed, 5) + fbm(x * 7, y * 10, seed + 3, 2) * 0.05 + y * 0.55;
      const L = h * 19;
      const sn = Math.sin(L * Math.PI);
      let c = lin(b, a, Math.pow(Math.abs(sn), 0.55));
      c = mul(c, 1 - Math.exp(-Math.pow(sn / 0.1, 2)) * 0.3);
      const hy = 0.74 + (fbm(x * 3, 0.5, seed + 7, 3) - 0.5) * 0.16 + Math.sin(x * 8 + seed) * 0.03;
      const hm = smooth(hy - 0.03, hy + 0.03, y);
      c = lin(c, hi, hm * 0.5);
      const nie = glint(x, y, seed + 11, 0.007, 0.3, 0.0011) * (1 - Math.min(1, Math.abs(y - hy) / 0.05));
      c = lin(c, WHITE, nie * 0.8);
      set(o, add(c, (hash(i, j, seed) - 0.5) * 6));
    });
  } },

  // Hex armour: bevelled hexagonal plates lit from one side, each a slightly
  // different tone, deep grooves between them in the line colour, a lit lip
  // where the bevel meets the face, and a scatter of powered plates glowing.
  hex: { metal: 0.5, rough: 0.3, draw(ctx, W, H, p, seed) {
    const base = C(p.base), line = C(p.line), glow = C(p.glow || p.line), sz = (p.size || 18) * 0.55;
    const r3 = Math.sqrt(3), ap = r3 / 2;
    pixels(ctx, W, H, (x, y, o) => {
      const gx = x * sz * 1.7, gy = y * sz * 1.7;
      const aI = Math.round(gx / 3), aJ = Math.round(gy / r3);
      const ax = gx - aI * 3, ay = gy - aJ * r3;
      const bI = Math.round((gx - 1.5) / 3), bJ = Math.round((gy - r3 / 2) / r3);
      const bx = gx - (bI * 3 + 1.5), by = gy - (bJ * r3 + r3 / 2);
      const useA = ax * ax + ay * ay < bx * bx + by * by;
      const dx = useA ? ax : bx, dy = useA ? ay : by, ci = useA ? aI * 2 : bI * 2 + 1, cj = useA ? aJ : bJ;
      const hd = Math.max(Math.abs(dy), Math.abs(dx) * ap + Math.abs(dy) * 0.5);
      const e = 1 - hd / ap;
      const len = Math.hypot(dx, dy) || 1;
      const light = (-dx * 0.6 - dy * 0.8) / len;
      const bev = smooth(0.0, 0.2, e);
      const tone = 0.82 + hash(ci, cj, seed) * 0.32;
      let c = mul(lin(base, lin(base, line, 0.25), 0.5), tone * (1 + (1 - bev) * light * 1.1));
      c = lin(c, lin(base, line, 0.35), Math.exp(-Math.pow((e - 0.2) / 0.025, 2)) * (0.35 + 0.35 * Math.max(0, light)));
      const lit = hash(ci, cj, seed + 5) > 0.88;
      if (lit) c = lin(c, glow, smooth(0.15, 0.7, e) * 0.8);
      c = lin(c, mul(line, 0.45), smooth(0.07, 0.025, e));
      set(o, c);
    });
  } },

  // Seigaiha: rows of overlapping fans of concentric wave rings (the
  // traditional wave pattern), deepening toward the bottom, with foam on the
  // crest ring of some fans and sea spray flecked across the top.
  waves: { metal: 0.12, rough: 0.45, draw(ctx, W, H, p, seed) {
    const deep = C(p.deep || '#0d2a4a'), mid = C(p.mid || '#1f6aa0'), foam = C(p.foam || '#e8f4f8');
    const R = 0.14;
    pixels(ctx, W, H, (x, y, o) => {
      // the fan on top here: the lowest row whose circle covers the point
      const jr = Math.floor(y / (R * 0.5)) + 2;
      let hit = null;
      for (let j = jr; j >= jr - 4 && !hit; j--) {
        const cy = j * R * 0.5, off = (j & 1) ? R : 0;
        const i = Math.round((x - off) / (2 * R)), cx = i * 2 * R + off;
        const d = Math.hypot(x - cx, y - cy);
        if (d < R) hit = { d, i, j };
      }
      if (!hit) { set(o, deep); return; }
      const ringW = R / 4.5, rk = Math.floor(hit.d / ringW), rf = hit.d / ringW - rk;
      const depth = smooth(0.0, 1.0, y);
      let c = lin(lin(mid, deep, depth * 0.6), lin(deep, mid, 0.25), rk % 2);
      c = lin(c, lin(foam, mid, 0.35), Math.exp(-Math.pow((rf - 0.5) / 0.12, 2)) * 0.5);
      if (rk === 4 && hash(hit.i, hit.j, seed) > 0.6) c = lin(c, foam, 0.85);
      c = lin(c, foam, smooth(0.86, 0.95, hit.d / R) * 0.9);
      const spray = glint(x, y, seed + 3, 0.02, 0.2, 0.0025) * smooth(0.5, 0.0, y);
      set(o, lin(c, foam, spray));
    });
  } },

  // Neon signs on a dark brick wall: glass tubes bent into rings, a triangle,
  // lightning zigzags and a word, each tube a white-hot core inside its
  // colour with a wide glow, mounting clips along it and its light spilling
  // onto the wall behind.
  neon: { metal: 0.25, rough: 0.35, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 11), base = C(p.base), cols = p.colors;
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const row = Math.floor(y * 14), bx = x * 7 + (row & 1) * 0.5, fx = bx - Math.floor(bx), fy = y * 14 - row;
      const mortar = fx < 0.04 || fy < 0.08 ? 0.6 : 1;
      const tone = 0.85 + hash(Math.floor(bx), row, seed) * 0.35;
      set(o, add(mul(base, tone * mortar * 1.6), (hash(i, j, seed) - 0.5) * 5));
    });
    const tube = (draw, col, w) => {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col; ctx.shadowColor = col;
      ctx.globalAlpha = 0.35; ctx.shadowBlur = w * 6; ctx.lineWidth = w * 3; draw(); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.shadowBlur = w * 2; ctx.lineWidth = w; draw(); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.32; draw(); ctx.stroke();
      ctx.restore();
    };
    const spill = (cx, cy, rad, col) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); ctx.restore();
    };
    const w = H * 0.016;
    const motifs = [];
    let x0 = W * (0.04 + r() * 0.05);
    while (x0 < W * 0.9) {
      const kind = Math.floor(r() * 4), col = cols[motifs.length % cols.length], cy = H * (0.3 + r() * 0.4), sz = H * (0.16 + r() * 0.1);
      // words are wider than the shapes: leave room for the longest
      const half = kind === 3 ? sz * 1.9 : sz;
      motifs.push({ kind, col, cx: x0 + half, cy, sz });
      x0 += half * 2 + W * (0.04 + r() * 0.06);
    }
    for (const m of motifs) spill(m.cx, m.cy, m.sz * 2.2, m.col);
    for (const m of motifs) {
      const { cx, cy, sz, col } = m;
      if (m.kind === 0) tube(() => { ctx.beginPath(); ctx.arc(cx, cy, sz, 0, Math.PI * 2); }, col, w);
      else if (m.kind === 1) tube(() => { ctx.beginPath(); ctx.moveTo(cx, cy - sz); ctx.lineTo(cx + sz * 0.95, cy + sz * 0.7); ctx.lineTo(cx - sz * 0.95, cy + sz * 0.7); ctx.closePath(); }, col, w);
      else if (m.kind === 2) tube(() => { ctx.beginPath(); ctx.moveTo(cx - sz * 0.4, cy - sz); ctx.lineTo(cx + sz * 0.15, cy - sz * 0.1); ctx.lineTo(cx - sz * 0.2, cy - sz * 0.05); ctx.lineTo(cx + sz * 0.4, cy + sz); }, col, w);
      else {
        const pool = ['OPEN', 'NIGHT', '24H', 'LIVE', 'BAR', 'LATE'].filter(wd => !motifs.used?.includes(wd));
        const word = pool[Math.floor(r() * pool.length)];
        (motifs.used ||= []).push(word);
        ctx.save(); ctx.font = `italic 700 ${Math.round(sz * 0.9)}px "Brush Script MT", cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = col;
        ctx.strokeStyle = col; ctx.lineWidth = w * 0.9; ctx.shadowBlur = w * 5; ctx.globalAlpha = 0.9; ctx.strokeText(word, cx, cy);
        ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.3; ctx.strokeText(word, cx, cy);
        ctx.restore();
      }
      // mounting clips
      ctx.fillStyle = 'rgba(20,20,24,0.9)';
      for (let k = 0; k < 3; k++) { const a = r() * Math.PI * 2; ctx.fillRect(cx + Math.cos(a) * sz - w * 0.5, cy + Math.sin(a) * sz - w * 0.9, w, w * 1.8); }
    }
  } },

  // Fish scales lying head to tail, each overlapping the one behind it: dark
  // at the root, bright toward its free edge with a lit rim, faint ridges
  // fanning out, a shadow on the scale beneath, an iridescent drift between
  // the two colours and a darker back fading to a pale belly.
  scales: { metal: 0.55, rough: 0.27, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.edge), s = (p.size || 16) * 0.5, R = 0.64;
    const sheen = lin(a, WHITE, 0.5);
    pixels(ctx, W, H, (x, y, o) => {
      const cu = x * s, cv = y * s * 1.7;
      let best = null, bu = 1e9;
      const cands = [];
      for (let j = Math.floor(cv) - 1; j <= Math.floor(cv) + 1; j++) {
        const off = (j & 1) * 0.5, i0 = Math.round(cu - off);
        for (let i = i0 - 2; i <= i0 + 1; i++) {
          const ux = i + off, du = cu - ux, dv = (cv - j) * 0.74;
          const d = Math.hypot(du, dv);
          cands.push([ux, d]);
          if (du < -0.15) continue;
          if (d < R && ux < bu) { bu = ux; best = { i, j, d, du, dv }; }
        }
      }
      if (!best) { set(o, mul(b, 0.4)); return; }
      let shadow = 0;
      for (const [ux, d] of cands) if (ux < bu && d >= R && d < R + 0.13) shadow = Math.max(shadow, 1 - (d - R) / 0.13);
      const t = best.d / R, ang = Math.atan2(best.dv, best.du);
      const shift = fbm(x * 1.3, y * 1.3, seed + 4, 3);
      let hue = lin(a, lin(a, b, 0.6), shift * 0.75);
      hue = lin(mul(hue, 0.72), lin(hue, WHITE, 0.18), smooth(0.05, 0.95, y));
      let c = lin(mul(hue, 0.5), mul(hue, 1.15), smooth(0.05, 0.85, t));
      c = mul(c, 1 - Math.pow(Math.abs(Math.sin(ang * 8 + best.i * 1.7)), 10) * smooth(0.3, 0.8, t) * 0.14);
      c = lin(c, sheen, smooth(0.8, 0.94, t) * (0.45 + 0.4 * Math.cos(ang + 0.7)));
      c = lin(c, b, smooth(0.95, 1.0, t));
      set(o, mul(c, 1 - shadow * 0.4));
    });
  } },

  // Lava: crust plates domed and cooling dark in the middle, glowing where
  // they meet the cracks, the cracks opening into wider molten rivers in
  // places, gas holes in the crust and embers flecked across it.
  lava: { metal: 0.15, rough: 0.62, draw(ctx, W, H, p, seed) {
    const rock = C(p.base || '#1e1a18'), hot = C(p.hot || '#ff6a1a'), core = C(p.core || '#ffd36a');
    const crust = lin(rock, [96, 86, 78], 0.4), ember = lin(hot, core, 0.5);
    pixels(ctx, W, H, (x, y, o) => {
      const wx = x + (fbm(x * 2.5, y * 2.5, seed, 3) - 0.5) * 0.25, wy = y + (fbm(x * 2.5 + 7, y * 2.5, seed + 1, 3) - 0.5) * 0.25;
      const k = cell(wx * 5.2, wy * 5.2, seed);
      const gap = k.d2 - k.d1;
      const river = smooth(0.55, 0.8, fbm(x * 1.6, y * 1.6, seed + 4, 3));
      const cw = 0.03 + river * 0.12;
      const crack = smooth(cw, cw * 0.15, gap);
      const dome = smooth(0.0, 0.45, gap);
      const tex = fbm(x * 18, y * 18, seed + 2, 3);
      let c = lin(mul(rock, 0.75), crust, tex * 0.55 + dome * 0.3);
      const heat = Math.exp(-gap / (0.05 + river * 0.09));
      c = lin(c, mul(hot, 0.6), heat * 0.6);
      c = lin(c, hot, crack);
      c = lin(c, core, smooth(0.5, 1, crack) * 0.9);
      c = lin(c, ember, glint(x, y, seed + 9, 0.02, 0.08, 0.0018) * (1 - crack) * 0.9);
      c = mul(c, 1 - smooth(0.12, 0.07, cell(x * 40, y * 40, seed + 3).d1) * (1 - heat) * 0.3);
      set(o, c);
    });
  } },

  // Polished marble: a clouded, mottled ground; a few long sweeping veins
  // that swell, thin and fade out, each with a soft halo; finer secondary
  // veins branching across them; a faint crackle; a deep polish.
  marble: { metal: 0.05, rough: 0.08, draw(ctx, W, H, p, seed) {
    const base = C(p.base), vein = C(p.vein), v2 = C(p.vein2 || p.vein);
    const e = 1 / H;
    const F = (x, y) => { const q = fbm(x * 0.8 + 1.7, y * 0.8, seed + 1, 3); return fbm(x * 1.2 + q * 1.6, y * 1.2 - q * 1.2, seed, 4); };
    pixels(ctx, W, H, (x, y, o) => {
      const cl = fbm(x * 2.2, y * 2.2, seed + 3, 5);
      let c = lin(base, lin(base, v2, 0.5), smooth(0.4, 0.85, cl) * 0.35);
      c = mul(c, 0.93 + fbm(x * 9, y * 9, seed + 5, 3) * 0.14);
      // primary veins: two level lines of a folded field, kept to an even
      // width by its gradient, swelling and fading along their length
      const f = F(x, y), gx = (F(x + e, y) - f) / e, gy = (F(x, y + e) - f) / e, gl = Math.max(0.08, Math.hypot(gx, gy));
      // soft cloud veins first (the classic turbulent marble bands, faint and wide)
      const cv = Math.abs(Math.sin((x * 0.7 + y * 1.6 + f * 4.5) * Math.PI));
      c = lin(c, lin(v2, base, 0.55), Math.pow(1 - cv, 6) * 0.45);
      const d = Math.min(Math.abs(f - 0.5), Math.abs(f - 0.3) * 1.15) / gl;
      const w = 0.002 + 0.006 * smooth(0.5, 0.8, fbm(x * 3, y * 3, seed + 11, 3));
      const fade = smooth(0.22, 0.45, fbm(x * 1.2 + 5, y * 1.2, seed + 9, 3));
      c = lin(c, lin(vein, base, 0.6), Math.exp(-d / (w * 2.5)) * fade * 0.22);
      c = lin(c, vein, smooth(w, w * 0.35, d) * fade);
      // secondary veins: thin, broken, crossing the main ones
      for (const [sc, sd, amt] of [[3, 13, 0.85], [5.5, 29, 0.6]]) {
        const g = fbm(x * sc + f * 2, y * sc, seed + sd, 4), d2 = Math.abs(g - 0.5);
        const f2 = smooth(0.38, 0.58, fbm(x * 2.5 + sd, y * 2.5 + 3, seed + 17 + sd, 3));
        c = lin(c, lin(v2, base, 0.5), smooth(0.025, 0.0, d2) * f2 * 0.25);
        c = lin(c, v2, smooth(0.009, 0.0035, d2) * f2 * amt);
      }
      const k = cell(x * 14, y * 14, seed + 21);
      c = lin(c, v2, smooth(0.02, 0.0, k.d2 - k.d1) * smooth(0.62, 0.75, fbm(x * 3, y * 3, seed + 23, 2)) * 0.28);
      set(o, c);
    });
  } },

  // Kintsugi: a glazed ceramic (glaze pooling, a fine crackle) broken along
  // a few long meandering cracks with thinner branches, the breaks filled
  // with gold that pools wider in places, bright down the middle of each
  // seam and shadowed at its edges, with gold dust beside it.
  kintsugi: { metal: 0.4, rough: 0.27, draw(ctx, W, H, p, seed) {
    const base = C(p.base), gold = C(p.gold || '#e8b84a');
    const goldHi = lin(gold, WHITE, 0.55), goldLo = mul(gold, 0.55), glazeHi = lin(base, WHITE, 0.14);
    const e = 1 / H;
    const fA = (x, y) => fbm(x * 1.1 + 2, y * 1.1, seed, 5);
    pixels(ctx, W, H, (x, y, o) => {
      let c = lin(mul(base, 0.9), glazeHi, smooth(0.35, 0.8, fbm(x * 2.5, y * 2.5, seed + 3, 4)) * 0.28);
      const cr = cell(x * 22, y * 22, seed + 5);
      c = mul(c, 1 - smooth(0.015, 0.0, cr.d2 - cr.d1) * 0.16);
      // main crack: the 0.5 level of a smooth field, its width kept even by the gradient
      const a = fA(x, y), gx = (fA(x + e, y) - a) / e, gy = (fA(x, y + e) - a) / e;
      const dist = Math.min(Math.abs(a - 0.5), Math.abs(a - 0.36), Math.abs(a - 0.64)) / Math.max(0.05, Math.hypot(gx, gy));
      const wv = 0.003 + 0.007 * smooth(0.55, 0.8, fbm(x * 4, y * 4, seed + 11, 3));
      const seam1 = smooth(wv, wv * 0.5, dist);
      // branches: a second field, only where a mask lets them through
      const b = fbm(x * 2.4, y * 2.4 + 5, seed + 7, 4);
      const mask = smooth(0.42, 0.52, fbm(x * 1.3 + 9, y * 1.3, seed + 13, 2));
      const seam2 = smooth(0.012, 0.005, Math.abs(b - 0.5)) * mask;
      // a network of smaller breaks: edges of shards, only where the pot shattered
      const sh = cell(x * 4.2 + (b - 0.5) * 1.5, y * 4.2, seed + 25);
      const net = smooth(0.03, 0.012, sh.d2 - sh.d1) * smooth(0.45, 0.55, fbm(x * 1.6 + 3, y * 1.6, seed + 27, 3));
      const seam = Math.max(seam1, seam2, net);
      const mid = seam1 >= Math.max(seam2, net) ? 1 - clamp01(dist / wv) : seam2 >= net ? 1 - clamp01(Math.abs(b - 0.5) / 0.012) : 1 - clamp01((sh.d2 - sh.d1) / 0.03);
      c = mul(c, 1 - smooth(wv * 2.2, wv, dist) * (1 - seam1) * 0.35);
      c = lin(c, lin(goldLo, goldHi, Math.pow(mid, 1.4)), seam);
      c = lin(c, goldHi, glint(x, y, seed + 19, 0.01, 0.35, 0.0011) * smooth(0.03, 0.006, dist) * 0.9);
      set(o, c);
    });
  } },

  // Damascus: pattern-welded steel etched so the layers show, hard layers
  // bright and narrow, soft layers dark, each layer its own shade. Three
  // patterns by seed: wild (twisted and folded), ladder (rungs pressed across
  // the layers) and raindrop (rings round drilled dimples).
  damascus: { metal: 0.88, rough: 0.26, draw(ctx, W, H, p, seed) {
    const Lc = C(p.light || '#c0c4cc'), Dc = C(p.dark || '#24262c'), n = (p.layers || 24) * 0.9, style = seed % 3;
    pixels(ctx, W, H, (x, y, o, i, j) => {
      let v = y * n + (fbm(x * 1.4, y * 1.2, seed, 5) - 0.5) * 9 + Math.sin(x * 2.2 + fbm(x, y, seed + 5, 3) * 3) * 1.1;
      if (style === 0) v += (fbm(x * 3.2 + v * 0.05, y * 3.2, seed + 2, 4) - 0.5) * 6;
      else if (style === 1) { const u = fr(x * 3.2 + fbm(x, y, seed + 6, 2) * 0.3); v += Math.exp(-Math.pow((u - 0.5) / 0.14, 2)) * 3.2; }
      else { const k = cell(x * 4.5, y * 4.5, seed + 9); v += smooth(0.6, 0.0, k.d1) * 3.4; }
      const li = Math.floor(v), f = v - li;
      const bright = smooth(0.52, 0.6, f) * smooth(0.98, 0.9, f);
      const shade = 0.82 + hash(li, 0, seed) * 0.3;
      let c = lin(mul(Dc, 0.9 + hash(li, 1, seed) * 0.2), mul(Lc, shade), bright);
      c = mul(c, 0.95 + valueNoise(x * 60, y * 60, seed) * 0.08);
      set(o, add(c, (hash(i, j, seed) - 0.5) * 5));
    });
  } },

  // Case-hardened steel: heat colours from bright steel through straw, gold
  // and bronze to purple and deep blue, mottled at three scales so they come
  // in swirls and flecks with feathered edges, silver flecks scattered
  // through, under fine brushing. `blue` (from the pattern) sets how much
  // turns blue.
  tempered: { metal: 0.95, rough: 0.22, draw(ctx, W, H, p, seed) {
    const steel = [166, 168, 174], straw = C('#dcb868'), gold = C('#c48c2e'), bronze = C('#8c542a'), purple = C('#5c3a94'), blue = C('#2848bc'), deep = C('#12287c');
    const bl = p.blue ?? 0.4, t0 = 0.5 + (0.5 - bl) * 0.36;
    pixels(ctx, W, H, (x, y, o) => {
      const w = fbm(x * 1.2, y * 1.2, seed + 2, 3);
      const n0 = fbm(x * 3.4 + w * 1.7, y * 3.4 - w * 1.3, seed, 5);
      const n1 = fbm(x * 8 + n0 * 2.5, y * 8 - n0, seed + 7, 3);
      const n2 = fbm(x * 26, y * 26, seed + 9, 2);
      const nn = n0 * 0.64 + n1 * 0.27 + n2 * 0.09;
      let c;
      if (nn > t0) c = lin(blue, deep, smooth(t0, t0 + 0.18, nn));
      else if (nn > t0 - 0.045) c = lin(purple, blue, smooth(t0 - 0.045, t0, nn));
      else if (nn > t0 - 0.1) c = lin(bronze, purple, smooth(t0 - 0.1, t0 - 0.045, nn));
      else if (nn > t0 - 0.17) c = lin(gold, bronze, smooth(t0 - 0.17, t0 - 0.1, nn));
      else if (nn > t0 - 0.24) c = lin(straw, gold, smooth(t0 - 0.24, t0 - 0.17, nn));
      else c = lin(steel, straw, smooth(t0 - 0.36, t0 - 0.24, nn));
      c = lin(c, steel, 0.22 + smooth(0.52, 0.78, fbm(x * 12, y * 12, seed + 15, 3)) * 0.38);
      c = mul(c, 0.84 + fbm(x * 5, y * 5, seed + 17, 3) * 0.32);
      c = lin(c, lin(steel, WHITE, 0.2), smooth(0.8, 0.88, n2) * 0.35);
      set(o, mul(c, 1 + (valueNoise(x * 2.5, y * 520, seed + 3) - 0.5) * 0.07));
    });
  } },

  // Hot-rod flames: licks of fire sweeping back from the front, each with a
  // white-hot inner lick, colour running from core to tip, a dark drop shadow
  // and a contrasting pinstripe traced round it, over a metal-flake base.
  flames: { metal: 0.35, rough: 0.34, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 3), cols = p.colors || ['#ff3a1a', '#ffa01a', '#fff0a0'];
    const base = C(p.base);
    pixels(ctx, W, H, (x, y, o) => {
      const g = glint(x, y, seed + 5, 0.008, 0.35, 0.0011);
      set(o, lin(mul(base, 0.9 + fbm(x * 3, y * 3, seed, 3) * 0.2), lin(base, WHITE, 0.5), g * 0.6));
    });
    const pinCol = p.pin || (lum(C(cols[0])) > 0.45 ? '#1a3aff' : '#7ad8ff');
    const licks = 8;
    const shapes = [];
    for (let k = 0; k < licks; k++) {
      const yc = H * (0.06 + 0.88 * (k + r() * 0.6) / licks), len = W * (0.35 + r() * 0.42), wid = H * (0.08 + r() * 0.06);
      const x0 = W * 1.03, tip = x0 - len, wave = H * (0.05 + r() * 0.08) * (r() < 0.5 ? -1 : 1), curl = H * 0.05 * (r() < 0.5 ? -1 : 1);
      shapes.push((sc) => {
        const L = len * sc, Wd = wid * sc, tp = x0 - L;
        ctx.beginPath();
        ctx.moveTo(x0, yc - Wd);
        ctx.bezierCurveTo(x0 - L * 0.35, yc - Wd * 1.15 + wave, x0 - L * 0.72, yc - Wd * 0.35 - wave, tp, yc + wave * 0.6 + curl);
        ctx.quadraticCurveTo(tp + L * 0.06, yc + wave * 0.6 + curl * 1.6, tp + L * 0.1, yc + wave * 0.5);
        ctx.bezierCurveTo(x0 - L * 0.6, yc + Wd * 0.3 - wave * 0.4, x0 - L * 0.3, yc + Wd * 1.05 + wave, x0, yc + Wd);
        ctx.closePath();
        return tp;
      });
    }
    // shadows first, then the flames, so later licks overlap earlier ones cleanly
    ctx.save(); ctx.translate(H * 0.012, H * 0.018); ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (const sh of shapes) { sh(1); ctx.fill(); }
    ctx.restore();
    for (const sh of shapes) {
      const tp = sh(1);
      const g = ctx.createLinearGradient(W * 1.03, 0, tp, 0);
      g.addColorStop(0, cols[2]); g.addColorStop(0.3, cols[1]); g.addColorStop(0.75, cols[0]); g.addColorStop(1, cols[0]);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = H * 0.008; ctx.strokeStyle = pinCol; ctx.stroke();
      const tp2 = sh(0.55);
      const g2 = ctx.createLinearGradient(W * 1.03, 0, tp2, 0);
      g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.6, cols[2]); g2.addColorStop(1, cols[1] + '00');
      ctx.fillStyle = g2; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    }
  } },

  // Snakeskin: keeled scales in a staggered lattice, domed with a ridge down
  // each and dark skin between them, carrying the pattern (saddle blotches
  // ringed in black, bright flecks), with wide belly scutes along the bottom.
  snake: { metal: 0.12, rough: 0.46, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.mark), d = C(p.dark || '#1a1612');
    const belly = lin(b, WHITE, 0.45);
    pixels(ctx, W, H, (x, y, o) => {
      // pattern colour at this point
      // saddles: irregular blotches stretched across the body, edged in black
      const wx = x + (fbm(x * 3, y * 3, seed, 3) - 0.5) * 0.18, wy = y + (fbm(x * 3 + 5, y * 3, seed + 1, 3) - 0.5) * 0.18;
      const k = cell(wx * 4.2, wy * 2.2, seed + 3);
      const R = 0.3 + k.id * 0.14 + (fbm(x * 9, y * 9, seed + 7, 2) - 0.5) * 0.12;
      const blot = k.d1 < R;
      const ring = Math.abs(k.d1 - R) < 0.05;
      let pc = blot ? lin(mul(a, 0.55), a, fbm(x * 8, y * 8, seed + 11, 2) * 0.5) : lin(a, b, 0.5 + fbm(x * 6, y * 6, seed + 9, 2) * 0.35);
      if (ring) pc = d;
      // scutes along the belly
      if (y > 0.84) {
        const sc = fr(x * 22 + Math.sin(y * 9) * 0.05);
        pc = lin(mul(belly, 0.75), belly, smooth(0.0, 0.5, sc) * smooth(1.0, 0.75, sc));
        set(o, mul(pc, 1 - smooth(0.86, 0.84, y) * 0.5));
        return;
      }
      // keeled scales: a staggered diamond lattice
      const su = x * 30, sv = y * 30 * 1.6;
      const j = Math.round(sv), off = (j & 1) * 0.5;
      let best = 9, bdu = 0, bdv = 0;
      for (let jj = j - 1; jj <= j + 1; jj++) {
        const of = (jj & 1) * 0.5, ii = Math.round(su - of);
        for (let i2 = ii - 1; i2 <= ii + 1; i2++) {
          const du = su - (i2 + of), dv = (sv - jj) / 1.6;
          const dd = Math.abs(du) * 0.9 + Math.abs(dv) * 1.6;
          if (dd < best) { best = dd; bdu = du; bdv = dv; }
        }
      }
      const edge = smooth(0.5, 0.4, best);
      const dome = 1 - best * 0.9 - bdv * 0.6;
      const keel = Math.exp(-Math.pow(bdv / 0.03, 2)) * smooth(0.5, 0.1, Math.abs(bdu)) * 0.18;
      let c = mul(pc, 0.62 + dome * 0.45 + keel);
      c = lin(mul(d, 0.8), c, edge);
      set(o, c);
    });
  } },

  // Crystal shards: a low-poly field of facets in a colour sweep, each facet
  // lit from its own angle with a gradient across it, crisp bright edges and
  // glints where facets meet.
  shards: { metal: 0.3, rough: 0.2, draw(ctx, W, H, p, seed) {
    const cols = p.colors.map(C), r = rng(seed + 3);
    ctx.fillStyle = hex(cols[0]); ctx.fillRect(0, 0, W, H);
    const nx = 16, ny = 8, pts = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const e = i === 0 || j === 0 || i === nx || j === ny;
      pts.push([i / nx * W + (e ? 0 : (r() - 0.5) * W / nx * 0.85), j / ny * H + (e ? 0 : (r() - 0.5) * H / ny * 0.85)]);
    }
    const P = (i, j) => pts[j * (nx + 1) + i];
    const ang = r() * Math.PI * 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const flip = (i + j) & 1;
      const tris = flip ? [[P(i, j), P(i + 1, j), P(i + 1, j + 1)], [P(i, j), P(i + 1, j + 1), P(i, j + 1)]] : [[P(i, j), P(i + 1, j), P(i, j + 1)], [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]];
      for (const t of tris) {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const sw = clamp01(cx / W * 0.85 + (cy / H - 0.5) * 0.25 + (r() - 0.5) * 0.28);
        const colr = ramp(cols, sw);
        const tilt = Math.cos(ang + r() * 2.4) * 0.3;
        const g = ctx.createLinearGradient(t[0][0], t[0][1], (t[1][0] + t[2][0]) / 2, (t[1][1] + t[2][1]) / 2);
        g.addColorStop(0, hex(mul(colr, 1.18 + tilt))); g.addColorStop(1, hex(mul(colr, 0.78 + tilt)));
        ctx.beginPath(); ctx.moveTo(...t[0]); ctx.lineTo(...t[1]); ctx.lineTo(...t[2]); ctx.closePath();
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = Math.max(1, H * 0.0025); ctx.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.3})`; ctx.stroke();
      }
    }
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 24; k++) {
      const q = pts[Math.floor(r() * pts.length)], sz = H * (0.01 + r() * 0.02);
      ctx.globalAlpha = 0.5 + r() * 0.5;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - sz); ctx.lineTo(q[0] + sz * 0.2, q[1]); ctx.lineTo(q[0], q[1] + sz); ctx.lineTo(q[0] - sz * 0.2, q[1]); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(q[0] - sz, q[1]); ctx.lineTo(q[0], q[1] + sz * 0.2); ctx.lineTo(q[0] + sz, q[1]); ctx.lineTo(q[0], q[1] - sz * 0.2); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } },

  // Paint splatter: thrown paint in layers, each splat a ragged blob with
  // satellite drops flung outward (teardrops pointing away), fine spikes,
  // drips running down and a glossy highlight on the wet paint.
  splatter: { metal: 0.12, rough: 0.35, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 5), base = C(p.base);
    pixels(ctx, W, H, (x, y, o, i, j) => set(o, add(mul(base, 0.94 + fbm(x * 4, y * 4, seed, 3) * 0.12), (hash(i, j, seed) - 0.5) * 6)));
    const blob = (cx, cy, rad) => {
      ctx.beginPath();
      const n = 40, ph = r() * 10;
      for (let k = 0; k <= n; k++) {
        const a = k / n * Math.PI * 2, rr = rad * (0.82 + 0.3 * valueNoise(Math.cos(a) * 2 + ph, Math.sin(a) * 2, seed));
        k ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    };
    for (let k = 0; k < 26; k++) {
      const col = p.colors[Math.floor(r() * p.colors.length)];
      const cx = r() * W, cy = r() * H, s0 = H * (0.03 + r() * r() * 0.14);
      ctx.fillStyle = col;
      blob(cx, cy, s0);
      for (let d = 0; d < 18; d++) {
        const a = r() * Math.PI * 2, dist = s0 * (1.1 + r() * 2.4), rr = s0 * (0.05 + r() * 0.14);
        const px = cx + Math.cos(a) * dist, py = cy + Math.sin(a) * dist;
        ctx.save(); ctx.translate(px, py); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, 0, rr * 1.8, rr, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-rr * 1.6, -rr * 0.5); ctx.lineTo(-rr * 4, 0); ctx.lineTo(-rr * 1.6, rr * 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.lineWidth = Math.max(1, s0 * 0.04); ctx.strokeStyle = col;
      for (let d = 0; d < 8; d++) { const a = r() * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * s0 * 0.8, cy + Math.sin(a) * s0 * 0.8); ctx.lineTo(cx + Math.cos(a) * s0 * (1.5 + r()), cy + Math.sin(a) * s0 * (1.5 + r())); ctx.stroke(); }
      if (r() < 0.55) {
        const dx = cx + (r() - 0.5) * s0, dl = s0 * (1 + r() * 3), dw = s0 * (0.1 + r() * 0.12);
        ctx.fillRect(dx - dw / 2, cy, dw, dl); ctx.beginPath(); ctx.arc(dx, cy + dl, dw * 0.75, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(cx - s0 * 0.3, cy - s0 * 0.35, s0 * 0.28, s0 * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
    }
  } },

  // Graffiti: throw-ups on a brick wall. Bubble letters with a dark 3D
  // extrusion, a white outline and a highlight stroke, drips off the bottom,
  // overspray mist round them and scribbled tags in between.
  graffiti: { metal: 0.05, rough: 0.72, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 17), base = C(p.base), cols = p.colors;
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const row = Math.floor(y * 12), bx = x * 6 + (row & 1) * 0.5, fx = bx - Math.floor(bx), fy = y * 12 - row;
      const mortar = fx < 0.035 || fy < 0.07;
      const tone = 0.88 + hash(Math.floor(bx), row, seed) * 0.22 + (fbm(x * 30, y * 30, seed + 2, 2) - 0.5) * 0.12;
      set(o, add(mul(base, mortar ? 0.72 : tone), (hash(i, j, seed) - 0.5) * 10));
    });
    // overspray mist
    for (let k = 0; k < 6; k++) {
      const cx = r() * W, cy = r() * H, rad = H * (0.2 + r() * 0.3), col = C(cols[k % cols.length]);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.35)`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = g; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    // tags
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 9; k++) {
      ctx.strokeStyle = k % 3 ? '#151515' : cols[k % cols.length]; ctx.lineWidth = H * (0.006 + r() * 0.006);
      let tx = r() * W, ty = r() * H;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      for (let s2 = 0; s2 < 7; s2++) { const nx2 = tx + H * (0.03 + r() * 0.05), ny2 = ty + (r() - 0.5) * H * 0.12; ctx.quadraticCurveTo((tx + nx2) / 2, ty - H * 0.08 * (r() - 0.3), nx2, ny2); tx = nx2; ty = ny2; }
      ctx.stroke();
    }
    // throw-ups
    const words = p.words || ['VANTAGE', 'NO RETREAT', 'HOLD'];
    const fs = H * 0.3;
    ctx.font = `900 ${fs}px "Barlow Condensed", Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 3; k++) {
      const w = words[k % words.length], cx = W * (0.18 + k * 0.32 + (r() - 0.5) * 0.06), cy = H * (0.3 + (k % 2) * 0.38);
      const fill = cols[k % cols.length], dark = hex(mul(C(fill), 0.35));
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((r() - 0.5) * 0.3);
      for (let e = 10; e > 0; e--) { ctx.fillStyle = dark; ctx.fillText(w, e * fs * 0.007, e * fs * 0.009); }
      ctx.lineWidth = fs * 0.09; ctx.strokeStyle = '#ffffff'; ctx.strokeText(w, 0, 0);
      ctx.lineWidth = fs * 0.03; ctx.strokeStyle = '#111111'; ctx.strokeText(w, 0, 0);
      ctx.fillStyle = fill; ctx.fillText(w, 0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = fs * 0.018; ctx.strokeText(w, -fs * 0.015, -fs * 0.02);
      // drips
      ctx.fillStyle = fill;
      const tw = ctx.measureText(w).width;
      for (let d = 0; d < 4; d++) { const dx = (r() - 0.5) * tw * 0.8, dl = fs * (0.15 + r() * 0.45), dw = fs * 0.03; ctx.fillRect(dx - dw / 2, fs * 0.3, dw, dl); ctx.beginPath(); ctx.arc(dx, fs * 0.3 + dl, dw * 0.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  } },

  // Anodised aluminium in two tones: engine-turned swirls (crisp machined
  // rings, each overlapping the last) in the main colour, a second anodised
  // panel split off by a polished chamfer, and laser-etched maker's marks.
  anodized: { metal: 0.92, rough: 0.18, draw(ctx, W, H, p, seed) {
    const a = C(p.base), e = C(p.edge || '#101820'), s = (p.cells || 11) * 0.85, R = 0.72;
    const k0 = 0.42 + (seed % 7) * 0.03;
    pixels(ctx, W, H, (x, y, o) => {
      const cx = x * s, cy = y * s;
      let best = null;
      for (let j = Math.floor(cy) + 1; j >= Math.floor(cy) - 1; j--) {
        const offx = (j & 1) * 0.5, i0 = Math.round(cx - offx);
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const dx = cx - (i + offx), dy = cy - j, d = Math.hypot(dx, dy);
          if (d < R && (!best || j > best.j)) best = { j, d, a: Math.atan2(dy, dx) };
        }
      }
      let k = 0.75;
      if (best) {
        const ring = 0.5 + 0.5 * Math.sin(best.d / R * Math.PI * 14 + best.a * 0.6);
        const streak = 0.6 + 0.4 * Math.cos(best.a * 2 + 0.6);
        k = 0.5 + 0.55 * ring * streak - smooth(R * 0.88, R, best.d) * 0.3;
      }
      const brushed = 0.95 + 0.05 * valueNoise(x * 3, y * 700, seed);
      // the second panel: below a slanted line, in the edge tone
      const line = y - (k0 + (x - 1) * 0.18);
      let c = line > 0 ? lin(e, a, 0.12) : a;
      c = mul(c, k * brushed * 1.08);
      // polished chamfer along the split
      const ch = Math.abs(line);
      if (ch < 0.018) c = lin(c, lin(a, WHITE, 0.65), smooth(0.018, 0.004, ch) * (line < 0 ? 1 : 0.55));
      set(o, c);
    });
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = hex(lin(a, WHITE, 0.7));
    ctx.font = `600 ${Math.round(H * 0.034)}px monospace`;
    ctx.fillText(`VNT · ANODISED 7075-T6 · ${String(seed % 10000).padStart(4, '0')}`, W * 0.05, H * 0.93);
    ctx.restore();
  } },

  // Woven leather: broad strips over and under each other, each with a
  // rounded profile, shadowed where it dives under the crossing strip and lit
  // along its crown, with a fine leather grain and pores.
  weave: { metal: 0.04, rough: 0.46, draw(ctx, W, H, p, seed) {
    const base = C(p.base), dark = C(p.dark || '#111111'), alt = C(p.alt || p.base);
    const ang = p.straight ? 0 : Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang);
    const cell = (p.cell || 0.05) * 1.7;
    pixels(ctx, W, H, (x, y, o, i, j) => {
      const u = (x * ca - y * sa) / cell + 100, v = (x * sa + y * ca) / cell + 100;
      const iu = Math.floor(u), iv = Math.floor(v);
      const horiz = ((iu + iv) & 1) === 0;
      const across = horiz ? v - iv : u - iu, along = horiz ? u - iu : v - iv;
      const gap = smooth(0.03, 0.08, Math.min(across, 1 - across));
      const crown = Math.sin(across * Math.PI);
      const dive = smooth(0.0, 0.22, Math.min(along, 1 - along));
      const tone = 0.92 + hash(iu, iv, seed) * 0.12;
      const grain = (valueNoise(x * 260, y * 260, seed) - 0.5) * 0.1 + (fbm(x * 10, y * 10, seed + 1, 3) - 0.5) * 0.12;
      const lumv = (0.5 + 0.5 * crown) * (0.6 + 0.4 * dive) * tone + grain + Math.exp(-Math.pow((across - 0.38) / 0.08, 2)) * 0.12 * dive;
      const c = horiz ? base : alt;
      set(o, lin(dark, mul(c, lumv), gap));
    });
  } },

  // Hedge maze: a perfect maze cut through clipped hedges (leafy texture, a
  // lit top, a shadow on the gravel), gravel paths, and a fountain at its
  // heart.
  maze: { metal: 0.04, rough: 0.6, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 11);
    const ny = p.rows || 9, nx = ny * 2, cs = H / ny;
    const right = new Uint8Array(nx * ny).fill(1), down = new Uint8Array(nx * ny).fill(1), seen = new Uint8Array(nx * ny);
    const stack = [Math.floor(r() * nx * ny)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1], cx = c % nx, cy = (c / nx) | 0, opts = [];
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
    const base = C(p.base), line = C(p.line), line2 = C(p.line2 || p.line);
    // gravel
    pixels(ctx, W, H, (x, y, o, i, j) => set(o, add(mul(base, 0.9 + fbm(x * 8, y * 8, seed, 2) * 0.12), (hash(i, j, seed) - 0.5) * 22)));
    // leafy hedge texture as a pattern
    const T = 128, tc = makeCanvas(T, T), tx = tc.getContext('2d'), img = tx.createImageData(T, T);
    for (let yy = 0; yy < T; yy++) for (let xx = 0; xx < T; xx++) {
      const v = fbm(xx / 10, yy / 10, seed + 3, 3, T / 10) * 0.6 + valueNoise(xx / 3, yy / 3, seed + 4, T / 3) * 0.4;
      const cc = lin(mul(line, 0.6), lin(line2, WHITE, 0.15), smooth(0.3, 0.8, v)), k = (yy * T + xx) * 4;
      img.data[k] = cc[0]; img.data[k + 1] = cc[1]; img.data[k + 2] = cc[2]; img.data[k + 3] = 255;
    }
    tx.putImageData(img, 0, 0);
    const pat = ctx.createPattern(tc, 'repeat');
    const lw = cs * (p.wall || 0.42);
    const pass = (style, width, dx, dy) => {
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'square';
      ctx.beginPath();
      for (const [a, b, c, d] of seg) { ctx.moveTo(a + dx, b + dy); ctx.lineTo(c + dx, d + dy); }
      ctx.stroke();
    };
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = cs * 0.3;
    pass('rgba(0,0,0,0.35)', lw, cs * 0.08, cs * 0.1);
    ctx.shadowBlur = 0;
    pass(pat, lw, 0, 0);
    pass(`rgba(${line2.map(Math.round).join(',')},0.35)`, lw * 0.35, -lw * 0.15, -lw * 0.15);
    // fountain at the heart
    const fx = W / 2, fy = H / 2, fr2 = cs * 0.38;
    ctx.fillStyle = hex(lin(base, WHITE, 0.4)); ctx.beginPath(); ctx.arc(fx, fy, fr2 * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a9ad0'; ctx.beginPath(); ctx.arc(fx, fy, fr2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, cs * 0.03);
    for (let k = 1; k <= 2; k++) { ctx.beginPath(); ctx.arc(fx, fy, fr2 * k * 0.33, 0, Math.PI * 2); ctx.stroke(); }
  } },

  // Blueprint: technical drawings of parts on blue paper: a gear with its
  // teeth, a bolt, a sectioned cylinder with hatching, centre lines,
  // dimension lines with arrowheads and figures, a fine grid and a title block.
  blueprint: { metal: 0.1, rough: 0.6, draw(x, W, H, p, seed) {
    const r = rng(seed + 19), u = H / 512, line = p.line || '#e8f2ff';
    const raw = x.ctx || x;
    raw.fillStyle = p.base || '#1d4a86'; raw.fillRect(0, 0, W, H);
    raw.strokeStyle = 'rgba(255,255,255,0.1)'; raw.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 16 * u) { raw.beginPath(); raw.moveTo(gx, 0); raw.lineTo(gx, H); raw.stroke(); }
    for (let gy = 0; gy < H; gy += 16 * u) { raw.beginPath(); raw.moveTo(0, gy); raw.lineTo(W, gy); raw.stroke(); }
    x.strokeStyle = line; x.fillStyle = line; x.lineCap = 'round';
    const dim = (x0, y0, x1, y1, label) => {
      x.lineWidth = 1.5 * u; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0), ah = 9 * u;
      for (const [px, py, s2] of [[x0, y0, 1], [x1, y1, -1]]) {
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a + 0.35) * ah * s2, py + Math.sin(a + 0.35) * ah * s2); x.lineTo(px + Math.cos(a - 0.35) * ah * s2, py + Math.sin(a - 0.35) * ah * s2); x.closePath(); x.fill();
      }
      x.font = `600 ${Math.round(14 * u)}px monospace`; x.fillText(label, (x0 + x1) / 2 - 18 * u, (y0 + y1) / 2 - 6 * u);
    };
    const centre = (x0, y0, x1, y1) => { raw.save(); raw.strokeStyle = line; raw.globalAlpha = 0.6; raw.lineWidth = 1.2 * u; raw.setLineDash([18 * u, 5 * u, 3 * u, 5 * u]); raw.beginPath(); raw.moveTo(x0, y0); raw.lineTo(x1, y1); raw.stroke(); raw.restore(); };
    // gear
    const gx = W * 0.2, gy = H * 0.45, gr = H * 0.22, teeth = 14;
    x.lineWidth = 2.2 * u; x.beginPath();
    for (let k = 0; k < teeth * 2; k++) {
      const a0 = k / (teeth * 2) * Math.PI * 2, a1 = (k + 1) / (teeth * 2) * Math.PI * 2, rr = k % 2 ? gr : gr * 1.14;
      if (!k) x.moveTo(gx + Math.cos(a0) * rr, gy + Math.sin(a0) * rr); else x.lineTo(gx + Math.cos(a0) * rr, gy + Math.sin(a0) * rr);
      x.lineTo(gx + Math.cos(a1) * rr, gy + Math.sin(a1) * rr);
    }
    x.closePath(); x.stroke();
    x.beginPath(); x.arc(gx, gy, gr * 0.3, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(gx, gy, gr * 0.72, 0, Math.PI * 2); x.stroke();
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; x.beginPath(); x.arc(gx + Math.cos(a) * gr * 0.5, gy + Math.sin(a) * gr * 0.5, gr * 0.09, 0, Math.PI * 2); x.stroke(); }
    centre(gx - gr * 1.4, gy, gx + gr * 1.4, gy); centre(gx, gy - gr * 1.4, gx, gy + gr * 1.4);
    dim(gx - gr * 1.14, gy + gr * 1.35, gx + gr * 1.14, gy + gr * 1.35, `Ø${(40 + seed % 20).toFixed(1)}`);
    // sectioned cylinder (barrel) with hatching
    const bx0 = W * 0.42, bx1 = W * 0.86, by = H * 0.32, bh = H * 0.13;
    x.lineWidth = 2.2 * u;
    x.beginPath(); x.rect(bx0, by - bh / 2, bx1 - bx0, bh); x.stroke();
    x.beginPath(); x.rect(bx0, by - bh * 0.22, bx1 - bx0, bh * 0.44); x.stroke();
    raw.save(); raw.beginPath(); raw.rect(bx0, by - bh / 2, (bx1 - bx0) * 0.45, bh * 0.28); raw.rect(bx0, by + bh * 0.22, (bx1 - bx0) * 0.45, bh * 0.28); raw.clip();
    raw.strokeStyle = line; raw.globalAlpha = 0.7; raw.lineWidth = 1.2 * u;
    for (let k = -40; k < 80; k++) { raw.beginPath(); raw.moveTo(bx0 + k * 9 * u, by + bh); raw.lineTo(bx0 + k * 9 * u + bh * 2, by - bh); raw.stroke(); }
    raw.restore();
    centre(bx0 - 20 * u, by, bx1 + 20 * u, by);
    dim(bx0, by + bh * 0.95, bx1, by + bh * 0.95, `${(180 + seed % 60).toFixed(0)}.0`);
    // bolt
    const hx = W * 0.5, hy = H * 0.72, hs = H * 0.07;
    x.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2; k ? x.lineTo(hx + Math.cos(a) * hs, hy + Math.sin(a) * hs) : x.moveTo(hx + Math.cos(a) * hs, hy + Math.sin(a) * hs); } x.stroke();
    x.beginPath(); x.arc(hx, hy, hs * 0.6, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.rect(hx + hs * 1.6, hy - hs * 0.45, hs * 4.2, hs * 0.9); x.stroke();
    for (let k = 0; k < 16; k++) { x.beginPath(); x.moveTo(hx + hs * (2.2 + k * 0.22), hy - hs * 0.45); x.lineTo(hx + hs * (2.05 + k * 0.22), hy + hs * 0.45); x.stroke(); }
    dim(hx + hs * 1.6, hy + hs * 0.9, hx + hs * 5.8, hy + hs * 0.9, 'M8×1.25');
    // title block
    const tx = W * 0.76, ty = H * 0.64, tw = W * 0.21, th = H * 0.3;
    x.lineWidth = 2 * u; x.beginPath(); x.rect(tx, ty, tw, th); x.stroke();
    for (const f of [0.3, 0.55, 0.78]) { x.beginPath(); x.moveTo(tx, ty + th * f); x.lineTo(tx + tw, ty + th * f); x.stroke(); }
    x.font = `700 ${Math.round(16 * u)}px monospace`; x.fillText('VANTAGE ARMS', tx + 10 * u, ty + th * 0.2);
    x.font = `600 ${Math.round(12 * u)}px monospace`;
    x.fillText(`DWG No. ${String(seed % 1000).padStart(3, '0')}-A`, tx + 10 * u, ty + th * 0.46);
    x.fillText('SCALE 1:2   SHEET 1/3', tx + 10 * u, ty + th * 0.7);
    x.fillText('DRAWN: R&D', tx + 10 * u, ty + th * 0.92);
  } },
};
