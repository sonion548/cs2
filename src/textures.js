// Procedural surface textures. Each generator works per pixel and returns colour
// plus height; the height field is turned into a normal map so surfaces show
// mortar joints, chips and grain under the sun instead of looking flat.
import * as THREE from 'three';
import { fbm, voronoi, valueNoise, heightToNormal, clamp01, mix, smooth, rng } from './noise.js';

export { rng };

const cache = new Map();

function toTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Runs a per-pixel generator fn(u, v, out) where out = [r, g, b, height].
function generate(size, fn, normalStrength) {
  const col = document.createElement('canvas'); col.width = col.height = size;
  const ctx = col.getContext('2d');
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, o);
    const i = y * size + x;
    img.data[i * 4] = o[0]; img.data[i * 4 + 1] = o[1]; img.data[i * 4 + 2] = o[2]; img.data[i * 4 + 3] = 255;
    h[i] = o[3];
  }
  ctx.putImageData(img, 0, 0);
  const nc = document.createElement('canvas'); nc.width = nc.height = size;
  const nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(size, size);
  nimg.data.set(heightToNormal(h, size, size, normalStrength * size / 512));
  nctx.putImageData(nimg, 0, 0);
  return { map: toTexture(col), normalMap: toTexture(nc, false) };
}

// Brick/block courses: returns {edge (0 at mortar → 1 inside), id, bx, by}.
function blocks(u, v, rows, cols, offset = 0.5, mortar = 0.012) {
  const r = Math.floor(v * rows);
  const shift = (r % 2) * offset;
  const cu = u * cols + shift;
  const c = Math.floor(cu);
  const fu = cu - c, fv = v * rows - r;
  const ex = Math.min(fu, 1 - fu) / cols, ey = Math.min(fv, 1 - fv) / rows;
  const e = Math.min(ex, ey);
  return { edge: smooth(mortar * 0.4, mortar * 1.6, e), id: ((c % cols) + cols) % cols + r * 97, fu, fv };
}

const GEN = {
  sandstone: { size: 1024, normal: 3.2, fn(seed) {
    return (u, v, o) => {
      const b = blocks(u, v, 6, 3, 0.5, 0.01);
      const tint = valueNoise(b.id, 3, seed) - 0.5;
      const n = fbm(u * 8, v * 8, seed, 5, 8);
      const fine = fbm(u * 64, v * 64, seed + 9, 3, 64);
      const erosion = smooth(0.55, 0.75, fbm(u * 4, v * 4, seed + 4, 4, 4));
      const strata = Math.sin((v * 6 * 9 + n * 4) * Math.PI) * 0.5 + 0.5;
      let r = 196 + tint * 40 + (n - 0.5) * 50 + strata * 8 - fine * 18;
      let g = 160 + tint * 32 + (n - 0.5) * 42 + strata * 6 - fine * 16;
      let bl = 112 + tint * 22 + (n - 0.5) * 30 - fine * 12;
      // mortar
      const m = b.edge;
      r = mix(122, r, m); g = mix(104, g, m); bl = mix(82, bl, m);
      // darker weathering toward the bottom of each block + soot
      const shade = 1 - b.fv * 0.08 - erosion * 0.12;
      o[0] = r * shade; o[1] = g * shade; o[2] = bl * shade;
      o[3] = m * (0.75 + n * 0.25) - erosion * 0.25 - fine * 0.05;
    };
  } },
  plaster: { size: 1024, normal: 1.6, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 6, v * 6, seed, 5, 6);
      const fine = fbm(u * 80, v * 80, seed + 3, 2, 80);
      // patches where plaster has fallen off revealing brick
      const patch = smooth(0.62, 0.66, fbm(u * 3, v * 3, seed + 11, 4, 3));
      const br = blocks(u, v, 28, 9, 0.5, 0.006);
      const btint = valueNoise(br.id, 1, seed) * 30;
      const crackMask = smooth(0.6, 0.7, fbm(u * 4, v * 4, seed + 30, 3, 4));
      const crack = smooth(0.0045, 0.0, Math.abs(fbm(u * 5, v * 5, seed + 20, 5, 5) - 0.5)) * crackMask;
      let r = 214 + (n - 0.5) * 40 - fine * 14, g = 192 + (n - 0.5) * 36 - fine * 12, b = 158 + (n - 0.5) * 26 - fine * 10;
      const brick = [mix(110, 150 + btint, br.edge), mix(96, 86 + btint * 0.5, br.edge), mix(80, 62, br.edge)];
      r = mix(r, brick[0], patch); g = mix(g, brick[1], patch); b = mix(b, brick[2], patch);
      r -= crack * 70; g -= crack * 66; b -= crack * 60;
      // grime gradient (bottom of the tile is the bottom of the wall)
      const grime = smooth(0.6, 1, v) * 0.18;
      o[0] = r * (1 - grime); o[1] = g * (1 - grime); o[2] = b * (1 - grime * 1.2);
      o[3] = (1 - patch) * 0.6 + patch * br.edge * 0.4 - crack * 0.3 + fine * 0.06 + n * 0.1;
    };
  } },
  paving: { size: 1024, normal: 3.5, fn(seed) {
    return (u, v, o) => {
      const vo = voronoi(u * 7, v * 7, seed, 7);
      const edge = smooth(0.0, 0.09, vo.d2 - vo.d1);
      const n = fbm(u * 16, v * 16, seed + 2, 4, 16);
      const tint = vo.id;
      const sand = smooth(0.5, 0.75, fbm(u * 5, v * 5, seed + 8, 4, 5)) * (1 - edge * 0.6);
      let r = 150 + tint * 45 + (n - 0.5) * 40, g = 138 + tint * 38 + (n - 0.5) * 36, b = 118 + tint * 30 + (n - 0.5) * 30;
      r = mix(96, r, edge); g = mix(84, g, edge); b = mix(66, b, edge);
      r = mix(r, 200, sand * 0.5); g = mix(g, 172, sand * 0.5); b = mix(b, 128, sand * 0.5);
      o[0] = r; o[1] = g; o[2] = b;
      o[3] = edge * (0.8 + vo.id * 0.2) + n * 0.12 - sand * 0.1;
    };
  } },
  tiles: { size: 1024, normal: 3, fn(seed) {
    return (u, v, o) => {
      const b = blocks(u, v, 4, 4, 0, 0.008);
      const n = fbm(u * 12, v * 12, seed, 4, 12);
      const t = valueNoise(b.id, 5, seed);
      const crack = (t > 0.75) ? smooth(0.01, 0, Math.abs(fbm(u * 10, v * 10, seed + b.id, 3, 10) - 0.5)) : 0;
      // simple painted border motif on every tile
      const fu = b.fu, fv = b.fv;
      const border = Math.min(fu, 1 - fu, fv, 1 - fv);
      const band = smooth(0.1, 0.11, border) * (1 - smooth(0.14, 0.15, border));
      const centre = 1 - smooth(0.12, 0.14, Math.hypot(fu - 0.5, fv - 0.5));
      let r = 184 + t * 30 + (n - 0.5) * 40, g = 160 + t * 24 + (n - 0.5) * 34, bl = 126 + t * 18 + (n - 0.5) * 26;
      const motif = Math.max(band, centre) * 0.65 * (0.6 + n * 0.6);
      r = mix(r, 86, motif); g = mix(g, 102, motif); bl = mix(bl, 116, motif);
      r = mix(80, r, b.edge); g = mix(70, g, b.edge); bl = mix(58, bl, b.edge);
      r -= crack * 70; g -= crack * 60; bl -= crack * 50;
      o[0] = r; o[1] = g; o[2] = bl;
      o[3] = b.edge * 0.9 + n * 0.05 - crack * 0.4;
    };
  } },
  sand: { size: 1024, normal: 2.2, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 6, v * 6, seed, 5, 6);
      const ripple = Math.sin((u * 40 + fbm(u * 3, v * 3, seed + 5, 3, 3) * 10) * Math.PI * 2) * 0.5 + 0.5;
      const grains = valueNoise(u * 512, v * 512, seed + 9, 512);
      const pebbles = smooth(0.82, 0.86, valueNoise(u * 90, v * 90, seed + 3, 90));
      let r = 205 + (n - 0.5) * 46 + (grains - 0.5) * 30, g = 172 + (n - 0.5) * 40 + (grains - 0.5) * 26, b = 124 + (n - 0.5) * 30 + (grains - 0.5) * 20;
      r = mix(r, 130, pebbles * 0.6); g = mix(g, 114, pebbles * 0.6); b = mix(b, 92, pebbles * 0.6);
      o[0] = r - ripple * 8; o[1] = g - ripple * 7; o[2] = b - ripple * 5;
      o[3] = n * 0.4 + ripple * 0.15 + grains * 0.06 + pebbles * 0.3;
    };
  } },
  crate: { size: 512, normal: 3, fn(seed) {
    return (u, v, o) => {
      const plank = Math.floor(v * 6), pv = v * 6 - plank;
      const grain = fbm(u * 3, (v * 6 + plank * 3.7) * 6 + fbm(u * 6, v * 6, seed, 3, 6) * 2, seed + plank, 4, 0);
      const ring = Math.sin((grain * 18) * Math.PI) * 0.5 + 0.5;
      const t = valueNoise(plank, 1, seed) * 30;
      let r = 150 + t + ring * 24 - 20, g = 108 + t * 0.7 + ring * 16 - 14, b = 64 + ring * 8;
      const gap = smooth(0, 0.05, Math.min(pv, 1 - pv));
      // frame and diagonal brace
      const frame = Math.min(u, 1 - u, v, 1 - v) < 0.085;
      const diag = Math.abs(u - v) < 0.06;
      if (frame || diag) { r *= 0.78; g *= 0.74; b *= 0.7; }
      const nail = [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]].some(([a, c]) => Math.hypot(u - a, v - c) < 0.014);
      if (nail) { r = g = b = 60; }
      o[0] = r * (0.55 + gap * 0.45); o[1] = g * (0.55 + gap * 0.45); o[2] = b * (0.55 + gap * 0.45);
      o[3] = gap * 0.6 + ring * 0.08 + (frame || diag ? 0.35 : 0) + (nail ? 0.5 : 0);
    };
  } },
  metal: { size: 512, normal: 1.5, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 8, v * 8, seed, 4, 8);
      const brushed = valueNoise(u * 2, v * 400, seed + 1, 0) * 0.5 + valueNoise(u * 4, v * 900, seed + 2, 0) * 0.5;
      const rust = smooth(0.6, 0.72, fbm(u * 5, v * 5, seed + 3, 5, 5));
      let r = 100 + n * 30 + brushed * 20, g = 104 + n * 30 + brushed * 20, b = 110 + n * 30 + brushed * 20;
      r = mix(r, 120, rust); g = mix(g, 68, rust); b = mix(b, 38, rust);
      o[0] = r; o[1] = g; o[2] = b; o[3] = brushed * 0.1 + rust * 0.3;
    };
  } },
  wallTrim: { size: 512, normal: 3, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 10, v * 10, seed, 4, 10);
      const groove = smooth(0.02, 0.0, Math.abs(v - 0.3)) + smooth(0.02, 0.0, Math.abs(v - 0.7));
      const b = blocks(u, v, 1, 4, 0, 0.01);
      let r = 150 + (n - 0.5) * 40, g = 122 + (n - 0.5) * 34, bl = 86 + (n - 0.5) * 24;
      r = mix(96, r, b.edge) - groove * 40; g = mix(80, g, b.edge) - groove * 36; bl = mix(60, bl, b.edge) - groove * 30;
      o[0] = r; o[1] = g; o[2] = bl; o[3] = b.edge * 0.6 - groove * 0.4 + n * 0.1;
    };
  } },
  concrete: { size: 1024, normal: 2, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 6, v * 6, seed, 5, 6);
      const pits = smooth(0.78, 0.8, valueNoise(u * 140, v * 140, seed + 4, 140));
      const stain = smooth(0.55, 0.8, fbm(u * 3, v * 2, seed + 6, 4, 3));
      const seam = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)) < 0.003 ? 1 : 0;
      const formwork = Math.sin(v * Math.PI * 16) * 0.5 + 0.5;
      let c = 146 + (n - 0.5) * 50 - pits * 40 - stain * 36 - seam * 50 + formwork * 5;
      o[0] = c; o[1] = c * 0.97; o[2] = c * 0.92;
      o[3] = n * 0.3 - pits * 0.4 - seam * 0.5 + formwork * 0.05;
    };
  } },
};

// Returns { map, normalMap } for a named surface.
export function surface(name, seed = 1) {
  const key = name + ':' + seed;
  if (!cache.has(key)) {
    const g = GEN[name];
    cache.set(key, generate(g.size, g.fn(seed * 7919 + name.length), g.normal));
  }
  return cache.get(key);
}

export function tex(name, seed = 1) { return surface(name, seed).map; }

function canvasTex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Big painted site letter used as a floor decal.
export function letterTexture(letter) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.font = 'bold 400px "Barlow Condensed", Impact, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(176,36,28,0.88)';
  x.fillText(letter, S / 2, S / 2 + 20);
  const r = rng(letter.charCodeAt(0));
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = `rgba(0,0,0,${(r() * 0.7).toFixed(2)})`;
    x.fillRect(r() * S, r() * S, r() * 5, r() * 5);
  }
  return canvasTex(c);
}

export function radialTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,140,40,0)') {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.35, 'rgba(255,200,90,0.8)'); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return canvasTex(c);
}

export function decalTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(10,8,6,0.95)'); g.addColorStop(0.3, 'rgba(30,25,20,0.8)');
  g.addColorStop(0.6, 'rgba(60,50,40,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return canvasTex(c);
}

export function skyTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f6aae'); g.addColorStop(0.42, '#86b2dc');
  g.addColorStop(0.5, '#e6d6b8'); g.addColorStop(1, '#a88a62');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // soft high clouds
  const img = x.getImageData(0, 0, W, H / 2);
  for (let y = 0; y < H / 2; y++) for (let i = 0; i < W; i++) {
    const n = fbm(i / W * 8, y / H * 24, 5, 5, 8);
    const a = smooth(0.55, 0.8, n) * smooth(0.0, 0.3, y / (H / 2)) * 0.7;
    const k = (y * W + i) * 4;
    img.data[k] = mix(img.data[k], 255, a); img.data[k + 1] = mix(img.data[k + 1], 250, a); img.data[k + 2] = mix(img.data[k + 2], 244, a);
  }
  x.putImageData(img, 0, 0);
  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export { clamp01 };
