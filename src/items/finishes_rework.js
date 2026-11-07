// Finishes rebuilt after a review against the best skins of each tier (see
// the skin review document): the first versions read as flat colour, faint
// lines or blobs from a few metres away. Same names, colours and feel, drawn
// from scratch with real structure: panels and stencils on cerakote, a woven
// twill on carbon, engine turning on anodised metal, layered pattern-welding
// on damascus, contour maps, shaded overlapping scales, veined marble, sumi-e
// brushwork, hot-rod flames, branching storm lightning and case-hardened steel.
import { fbm, voronoi, valueNoise, rng, hexToRgb, mixRgb, smooth, clamp01 } from '../noise.js';

const C = (h) => hexToRgb(h);
const set = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const hex = (c) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
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
  // Two-tone cerakote: slanted accent panels with pinlines, a chevron pair,
  // stencilled markings and a powder-coat grain. Without an accent colour the
  // panels are a quiet tone-on-tone (stealth).
  paint: { metal: 0.18, rough: 0.58, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 31), base = C(p.base);
    const lum = (base[0] * 0.3 + base[1] * 0.59 + base[2] * 0.11) / 255;
    const tone = hex(mul(base, lum < 0.35 ? 1.45 : 0.72));
    const acc = p.accent || tone, pin = p.accent ? hex(mul(C(p.accent), 0.6)) : hex(mul(base, lum < 0.35 ? 2 : 0.55));
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    // soft tonal cloud so the base isn't flat
    const g0 = ctx.createLinearGradient(0, 0, W, H);
    g0.addColorStop(0, 'rgba(255,255,255,0.05)'); g0.addColorStop(0.5, 'rgba(0,0,0,0.06)'); g0.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    const band = (x0, w, k, fill, alpha = 1) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w - k, H); ctx.lineTo(x0 - k, H); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    };
    const k = H * (0.35 + r() * 0.25);
    const x1 = W * (0.22 + r() * 0.12), w1 = W * (0.13 + r() * 0.06);
    band(x1, w1, k, acc);
    band(x1 + w1 + W * 0.012, W * 0.008, k, pin);
    band(x1 - W * 0.02, W * 0.006, k, pin);
    const x2 = W * (0.62 + r() * 0.1), w2 = W * 0.05;
    band(x2, w2, -k, acc, 0.9);
    // chevrons
    ctx.strokeStyle = acc; ctx.lineWidth = H * 0.028; ctx.lineJoin = 'miter';
    for (let i = 0; i < 2; i++) {
      const cx = W * 0.86 + i * H * 0.07, cy = H * 0.5;
      ctx.beginPath(); ctx.moveTo(cx - H * 0.05, cy - H * 0.11); ctx.lineTo(cx + H * 0.02, cy); ctx.lineTo(cx - H * 0.05, cy + H * 0.11); ctx.stroke();
    }
    // stencilled markings
    ctx.fillStyle = pin; ctx.globalAlpha = 0.55;
    ctx.font = `bold ${Math.round(H * 0.055)}px monospace`;
    ctx.fillText(`VT-${100 + (seed % 900)}  CAL 7.62`, W * 0.04, H * 0.16);
    ctx.fillText(`LOT ${String.fromCharCode(65 + (seed % 26))}${(seed * 7) % 100}`, W * 0.47, H * 0.86);
    for (let i = 0; i < 18; i++) ctx.fillRect(W * 0.04 + i * H * 0.02, H * 0.2, H * 0.006, i % 5 ? H * 0.02 : H * 0.04);
    ctx.globalAlpha = 1;
    grain(ctx, W, H, seed, 14);
  } },

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

  // Anodised aluminium with engine turning: overlapping machined swirls in
  // staggered rows (later rows over earlier), brushed micro-lines and the
  // colour deepening toward the edge tone.
  anodized: { metal: 0.92, rough: 0.2, draw(ctx, W, H, p, seed) {
    const a = C(p.base), e = C(p.edge || '#101820'), s = p.cells || 11, R = 0.72;
    pixels(ctx, W, H, (x, y, o) => {
      const cx = x * s, cy = y * s;
      let best = null;
      for (let j = Math.floor(cy) + 1; j >= Math.floor(cy) - 1; j--) {
        const offx = (j & 1) * 0.5;
        const i0 = Math.round(cx - offx);
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const dx = cx - (i + offx), dy = cy - j, d = Math.hypot(dx, dy);
          if (d < R && (!best || j > best.j)) best = { j, d, a: Math.atan2(dy, dx) };
        }
      }
      let k = 0.75;
      if (best) {
        const ring = 0.5 + 0.5 * Math.sin(best.d / R * Math.PI * 9 + best.a * 0.5);
        const streak = 0.65 + 0.35 * Math.cos(best.a * 2 + 0.6);
        k = 0.55 + 0.45 * ring * streak - smooth(R * 0.9, R, best.d) * 0.25;
      }
      const brushed = 0.95 + 0.05 * valueNoise(x * 3, y * 700, seed);
      const depth = smooth(0.2, 1.1, Math.hypot(x - 1, (y - 0.5) * 2) / 1.1 + (fbm(x * 2, y * 2, seed, 3) - 0.5) * 0.3);
      set(o, mul(mixRgb(a, e, depth * 0.7), k * brushed * 1.1));
    });
  } },

  // Pattern-welded (damascus) steel: dozens of folded layers warped through
  // the billet, etched dark and polished bright, in one of three patterns by
  // seed: ladder ripples, raindrop rings or a diagonal twist.
  damascus: { metal: 0.88, rough: 0.28, draw(ctx, W, H, p, seed) {
    const L = C(p.light || '#c0c4cc'), D = C(p.dark || '#24262c'), n = p.layers || 24, style = seed % 3;
    pixels(ctx, W, H, (x, y, o) => {
      let v = y * n + fbm(x * 1.6, y * 1.3, seed, 5) * 7 + Math.sin(x * 2.4 + fbm(x, y, seed + 5, 3) * 3) * 1.2;
      if (style === 0) v += Math.sin(x * 22 + y * 3) * 1.1 * (0.6 + 0.4 * valueNoise(x * 4, y * 4, seed + 2));
      else if (style === 1) { const c = voronoi(x * 5, y * 5, seed + 9); v += smooth(0.55, 0.0, c.d1) * 1.3; }
      else v += (x * 5 + y * 2) * 1.3 + Math.sin(x * 7) * 0.6;
      const s = Math.sin(v * Math.PI * 2), t = smooth(-0.55, 0.55, s);
      const fine = 0.94 + 0.06 * valueNoise(x * 60, y * 60, seed);
      const c = mixRgb(D, L, t);
      set(o, mul(c, fine * (0.92 + 0.12 * t)));
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

  // Overlapping scales like roof tiles, each rounded and shaded from its
  // root to a lit rim, casting a shadow on the one below, with a slight
  // colour shift scale to scale.
  scales: { metal: 0.5, rough: 0.32, draw(ctx, W, H, p, seed) {
    const a = C(p.base), b = C(p.edge), s = (p.size || 16) * 0.55, R = 0.66;
    pixels(ctx, W, H, (x, y, o) => {
      const cx = x * s, cy = y * s * 1.15;
      let best = null, shadow = 0;
      for (let j = Math.floor(cy) - 1; j <= Math.floor(cy) + 1; j++) {
        const offx = (j & 1) * 0.5, i0 = Math.round(cx - offx);
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const dx = cx - (i + offx), dy = cy - j, d = Math.hypot(dx, dy * 1.1);
          if (dy < -0.1) continue;                 // scales hang downward from their root
          if (d < R && (!best || j < best.j)) best = { i, j, d, dy };
        }
      }
      if (!best) { set(o, mul(b, 0.5)); return; }
      // the scale above throws a shadow just past its rim
      for (let i = Math.round(cx) - 1; i <= Math.round(cx) + 1; i++) {
        const j = best.j - 1, offx = (j & 1) * 0.5, d = Math.hypot(cx - (i + offx), (cy - j) * 1.1);
        if (d >= R && d < R + 0.12) shadow = Math.max(shadow, 1 - (d - R) / 0.12);
      }
      const t = best.d / R;
      const tint = valueNoise(best.i * 3.1, best.j * 2.3, seed), shift = valueNoise(best.i * 1.7 + 9, best.j * 1.3, seed + 4);
      const hue = mixRgb(a, mixRgb(a, b, 0.5), shift * 0.6);
      let c = mixRgb(mul(hue, 0.5), mul(hue, 1.12), smooth(0, 0.85, t) * (0.6 + 0.4 * tint));
      c = mixRgb(c, mixRgb(a, [255, 255, 255], 0.35), smooth(0.8, 0.95, t));
      c = mixRgb(c, b, smooth(0.95, 1.0, t));
      set(o, mul(c, 1 - shadow * 0.35));
    });
  } },

  // Polished marble: a clouded base, sweeping primary veins with thinner
  // offshoots, and faint secondary veins in the second colour.
  marble: { metal: 0.06, rough: 0.1, draw(ctx, W, H, p, seed) {
    const base = C(p.base), vein = C(p.vein), v2 = C(p.vein2 || p.vein);
    pixels(ctx, W, H, (x, y, o) => {
      const t = fbm(x * 1.6, y * 1.6, seed, 6);
      const cloud = fbm(x * 3 + 5, y * 3, seed + 3, 4);
      let c = mixRgb(base, v2, smooth(0.35, 0.8, cloud) * 0.35);
      const s1 = Math.abs(Math.sin((x * 1.1 + y * 2.3 + t * 5.5) * Math.PI));
      const s2 = Math.abs(Math.sin((x * 3.4 - y * 1.2 + fbm(x * 3, y * 3, seed + 7, 5) * 6) * Math.PI));
      const s3 = Math.abs(Math.sin((x * 7 + y * 5 + fbm(x * 6, y * 6, seed + 13, 4) * 7) * Math.PI));
      c = mixRgb(c, v2, Math.pow(1 - s3, 26) * 0.55);
      c = mixRgb(c, vein, Math.pow(1 - s2, 40) * 0.7);
      c = mixRgb(c, vein, Math.pow(1 - s1, 18) * 0.95);
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

  // Hot-rod flames: tapering licks swept back from one end, each a gradient
  // from the hot core to its tip colour, pinstriped dark outside and light in.
  flames: { metal: 0.3, rough: 0.38, draw(ctx, W, H, p, seed) {
    const r = rng(seed + 3), cols = p.colors || ['#ff3a1a', '#ffa01a', '#fff0a0'];
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    const g0 = ctx.createLinearGradient(0, 0, 0, H);
    g0.addColorStop(0, 'rgba(255,255,255,0.06)'); g0.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    const licks = 9;
    for (let k = 0; k < licks; k++) {
      const yc = H * (0.08 + 0.84 * (k + r() * 0.6) / licks), len = W * (0.35 + r() * 0.4), wid = H * (0.09 + r() * 0.07);
      const x0 = W * 1.02, tip = x0 - len, wave = H * (0.06 + r() * 0.08) * (r() < 0.5 ? -1 : 1);
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(x0, yc - wid);
        ctx.bezierCurveTo(x0 - len * 0.35, yc - wid * 1.1 + wave, x0 - len * 0.7, yc - wid * 0.4 - wave, tip, yc + wave * 0.6);
        ctx.bezierCurveTo(x0 - len * 0.6, yc + wid * 0.3 - wave * 0.4, x0 - len * 0.3, yc + wid * 1.05 + wave, x0, yc + wid);
        ctx.closePath();
      };
      const g = ctx.createLinearGradient(x0, 0, tip, 0);
      g.addColorStop(0, cols[2]); g.addColorStop(0.35, cols[1]); g.addColorStop(0.8, cols[0]); g.addColorStop(1, cols[0]);
      path(); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = H * 0.012; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke();
      ctx.lineWidth = H * 0.004; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
    }
    grain(ctx, W, H, seed, 6);
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

  // Case-hardened steel: brushed steel with heat colours mottled through it
  // (gold, bronze, purple and blue). params.blue (from the pattern template)
  // sets how much of it is blue: a Blue Gem is nearly all blue.
  tempered: { metal: 0.95, rough: 0.24, draw(ctx, W, H, p, seed) {
    const steel = [150, 152, 158], gold = C('#c8963a'), bronze = C('#8a5a2a'), purple = C('#5a3a8a'), blue = C('#2848b0'), deep = C('#142a78');
    const bl = p.blue ?? 0.4, t0 = 0.5 + (0.5 - bl) * 0.36;
    pixels(ctx, W, H, (x, y, o) => {
      const w = fbm(x * 1.3, y * 1.3, seed + 2, 3);
      const n = fbm(x * 2.4 + w * 1.2, y * 2.4 - w, seed, 5) * 0.8 + fbm(x * 9, y * 9, seed + 7, 3) * 0.2;
      let c;
      if (n > t0) c = mixRgb(blue, deep, smooth(t0, t0 + 0.2, n));
      else if (n > t0 - 0.05) c = mixRgb(purple, blue, smooth(t0 - 0.05, t0, n));
      else if (n > t0 - 0.12) c = mixRgb(bronze, purple, smooth(t0 - 0.12, t0 - 0.05, n));
      else if (n > t0 - 0.2) c = mixRgb(gold, bronze, smooth(t0 - 0.2, t0 - 0.12, n));
      else c = mixRgb(steel, gold, smooth(t0 - 0.32, t0 - 0.2, n));
      const brush = 0.9 + 0.1 * valueNoise(x * 2.5, y * 520, seed + 3);
      set(o, mul(c, brush));
    });
  } },
};
