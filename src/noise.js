// Seeded noise helpers used by texture, skin and wear generators.

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

// Tileable value noise with integer period (p = cells across one tile).
export function valueNoise(x, y, seed = 0, p = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (v) => (p ? ((v % p) + p) % p : v);
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal noise in [0,1]. If period is given the result tiles over [0, period).
export function fbm(x, y, seed = 0, octaves = 4, period = 0) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 31, period ? period * freq : 0);
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

// Distance to nearest / second nearest feature point (cellular noise).
export function voronoi(x, y, seed = 0, p = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    let cx = xi + i, cy = yi + j;
    const wx = p ? ((cx % p) + p) % p : cx, wy = p ? ((cy % p) + p) % p : cy;
    const px = cx + hash(wx, wy, seed), py = cy + hash(wx, wy, seed + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = hash(wx, wy, seed + 13); } else if (d < d2) d2 = d;
  }
  return { d1, d2, id };
}

export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function mix(a, b, t) { return a + (b - a) * t; }
export function smooth(e0, e1, x) { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }

export function hexToRgb(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixRgb(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

// Converts a height field into a tangent-space normal map (RGBA bytes).
export function heightToNormal(h, w, hgt, strength = 2, wrap = true) {
  const out = new Uint8ClampedArray(w * hgt * 4);
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + hgt) % hgt; } else { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(hgt - 1, y)); }
    return h[y * w + x];
  };
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    out[i] = (-dx / len * 0.5 + 0.5) * 255;
    out[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    out[i + 3] = 255;
  }
  return out;
}
