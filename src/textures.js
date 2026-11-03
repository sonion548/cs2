// Procedural surface textures. Each generator works per pixel and returns colour
// plus height; the height field is turned into a normal map so surfaces show
// mortar joints, chips and grain under the sun instead of looking flat.
import * as THREE from 'three';
import { fbm, valueNoise, clamp01, mix, smooth, rng } from './noise.js';
import { GEN, generateArrays, MATCH_SURFACES } from './texgen.js';

export { rng };

const cache = new Map();

// ---------------------------------------------------------------- surfaces
// Generated per pixel (src/texgen.js). preloadSurfaces() spreads the work over
// several workers while the game loads; surface() returns what's ready and
// falls back to generating on the spot.
let surfaceScale = 1;
export function setSurfaceScale(s) { surfaceScale = s; }

function dataTexture(size, data, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// detail and macro are data (not colour), so they stay linear
const LINEAR = new Set(['detail', 'macro']);
function store(name, seed, { size, rgba, normal }) {
  const out = { map: dataTexture(size, rgba, !LINEAR.has(name)), normalMap: normal ? dataTexture(size, normal, false) : null };
  cache.set(name + ':' + seed, out);
  return out;
}

// Returns { map, normalMap } for a named surface.
export function surface(name, seed = 1) {
  const key = name + ':' + seed;
  if (!cache.has(key)) store(name, seed, generateArrays(name, seed, surfaceScale));
  return cache.get(key);
}

export { MATCH_SURFACES };

const TEX_BASE = (import.meta.env?.BASE_URL || '/') + 'textures/';

function imageTexture(url, srgb) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.flipY = false;   // baked with the same row order as the generated DataTextures
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => reject(new Error('missing ' + url));
    img.src = url;
  });
}

// Loads the baked surfaces (public/textures/), generating any that are
// missing in workers, or here if workers aren't available.
export async function preloadSurfaces(list = MATCH_SURFACES, onEach = () => {}) {
  let todo = list.filter(([n, s]) => !cache.has(n + ':' + s));
  if (!todo.length) return;
  const baked = await Promise.allSettled(todo.map(async ([name, seed]) => {
    const base = `${TEX_BASE}${name}-${seed}`;
    const [map, normalMap] = await Promise.all([
      imageTexture(base + '.webp', !LINEAR.has(name)),
      GEN[name].normal ? imageTexture(base + '-n.webp', false) : null,
    ]);
    cache.set(name + ':' + seed, { map, normalMap });
    onEach();
  }));
  todo = todo.filter((_, i) => baked[i].status !== 'fulfilled');
  if (!todo.length) return;
  let workers = [];
  try {
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1, todo.length));
    for (let i = 0; i < n; i++) workers.push(new Worker(new URL('./texworker.js', import.meta.url), { type: 'module' }));
  } catch { workers.forEach(w => w.terminate()); workers = []; }
  if (!workers.length) {
    // no workers: make them here, yielding between surfaces so the page stays responsive
    for (const [n, s] of todo) { surface(n, s); onEach(); await new Promise(r => setTimeout(r, 0)); }
    return;
  }
  // biggest first, so the pool finishes together
  const order = [...todo].sort((a, b) => GEN[b[0]].size - GEN[a[0]].size);
  let next = 0;
  await Promise.all(workers.map(w => new Promise((resolve) => {
    const run = () => {
      if (next >= order.length) { w.terminate(); resolve(); return; }
      const [name, seed] = order[next++];
      w.onmessage = (e) => {
        if (e.data.error) surface(name, seed); else store(name, seed, e.data);
        onEach(); run();
      };
      w.onerror = () => { w.onerror = null; surface(name, seed); onEach(); run(); };
      w.postMessage({ id: name + ':' + seed, name, seed, scale: surfaceScale });
    };
    run();
  })));
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

// ---------------------------------------------------------------- map decals
// Canvas textures for the Blender map's decal quads. They use flipY = false:
// the map's UVs come through glTF upside down, so canvas-up stays world-up.
function decalCanvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
const fbm2 = (x, y, seed) => valueNoise(x, y, seed) * 0.62 + valueNoise(x * 2.1, y * 2.1, seed + 7) * 0.38;

// Grime for the foot of walls and the floor along them: dark at the bottom of
// the image, fading upward in ragged runs. Tiles left to right.
export function grimeTexture() {
  if (cache.has('grime')) return cache.get('grime');
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const img = x.createImageData(W, H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const u = px / W, t = 1 - (py + 0.5) / H;
    const n = fbm(u * 8, t * 3, 41, 4, 8);
    const drip = smooth(0.58, 0.85, fbm(u * 40, t * 1.2, 43, 3, 40));
    const reach = 0.6 + n * 0.3 + drip * 0.35;
    const fall = smooth(reach, 0, t);
    const a = Math.max(Math.pow(fall, 0.7) * (0.62 + n * 0.38), smooth(0.3, 0, t) * 0.8);
    const speck = smooth(0.8, 0.9, valueNoise(px * 0.25, py * 0.25, 47, W * 0.25)) * smooth(0.7, 0, t) * 0.3;
    const i = (py * W + px) * 4;
    img.data[i] = 58 + n * 22; img.data[i + 1] = 46 + n * 18; img.data[i + 2] = 33 + n * 12;
    img.data[i + 3] = clamp01(a + speck) * 255;
  }
  x.putImageData(img, 0, 0);
  const t = decalCanvasTex(c);
  cache.set('grime', t);
  return t;
}

// 4x4 atlas of floor and wall stains (tile = row * 4 + column, row 0 at the top):
//  0-1 oil  2 water ring  3 sand drift  4-7 cracks  8-9 scorch  10 drain ring
//  11 grit and leaves  12 rust run  13 dirt  14 dusty footprints  15 puddle
export function decalAtlas() {
  if (cache.has('decals')) return cache.get('decals');
  const S = 1024, T = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  const line = (n, w) => smooth(w, 0, Math.abs(n - 0.5));
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const k = (py >> 8) * 4 + (px >> 8);
    const s = ((px & 255) + 0.5) / T, t = 1 - ((py & 255) + 0.5) / T;
    const dx = s - 0.5, dy = t - 0.5, r = Math.hypot(dx, dy);
    const sd = 100 + k * 17;
    const n = fbm2(s * 5, t * 5, sd);
    let col = [30, 26, 22], a = 0;
    if (k <= 1) {
      a = smooth(0.42, 0.28, r + (n - 0.5) * 0.36) * (0.5 + n * 0.35);
      if (k === 1) a = Math.max(a * 0.8, smooth(0.84, 0.9, valueNoise(s * 34, t * 34, sd + 3)) * smooth(0.48, 0.3, r) * 0.6);
      col = [24, 21, 18];
    } else if (k === 2) {
      const ring = smooth(0.05, 0, Math.abs(r - (0.31 + (n - 0.5) * 0.12)));
      a = ring * 0.45 + smooth(0.36, 0.2, r + (n - 0.5) * 0.2) * 0.22;
      col = [40, 43, 44];
    } else if (k === 3) {
      a = smooth(0.48, 0.08, r + (n - 0.5) * 0.3) * 0.7 * (0.75 + valueNoise(s * 90, t * 90, sd) * 0.25);
      col = [214, 186, 142];
    } else if (k <= 7) {
      const c1 = line(fbm2(s * 2.4, t * 2.4, sd), 0.008), c2 = line(fbm2(s * 6, t * 6, sd + 5), 0.005) * smooth(0.35, 0.65, fbm2(s * 3, t * 3, sd + 9));
      a = Math.max(c1, c2 * 0.8) * smooth(0.5, 0.32, r) * 0.85;
      col = [28, 24, 20];
    } else if (k <= 9) {
      const ang = (Math.atan2(dy, dx) / (Math.PI * 2) + 0.5) * (k === 8 ? 18 : 30);
      const spike = valueNoise(ang, 0.5, sd, k === 8 ? 18 : 30);
      a = smooth(0.5, 0.02, r / ((k === 8 ? 0.62 : 0.45) + spike * 0.5)) * (0.7 + n * 0.25);
      col = [16, 14, 12];
    } else if (k === 10) {
      a = smooth(0.1, 0, Math.abs(r - 0.3 - (n - 0.5) * 0.06)) * 0.55 + smooth(0.34, 0.18, r) * 0.18;
      col = [34, 30, 26];
    } else if (k === 11) {
      const grit = smooth(0.85, 0.9, valueNoise(s * 26, t * 26, sd)), leaf = smooth(0.9, 0.93, valueNoise(s * 11, t * 15, sd + 4));
      a = Math.max(grit * 0.8, leaf * 0.9) * smooth(0.5, 0.3, r);
      col = leaf > grit ? [78, 70, 36] : [96, 84, 68];
    } else if (k === 12) {
      a = smooth(0.42, 0.06, Math.abs(dx) * 2.2 + (n - 0.5) * 0.35) * smooth(0.0, 0.9, t) * smooth(0.5, 0.42, Math.abs(dx)) * 0.7;
      col = [118, 62, 30];
    } else if (k === 13) {
      a = smooth(0.46, 0.12, r + (n - 0.5) * 0.4) * (0.35 + n * 0.3);
      col = [72, 58, 42];
    } else if (k === 14) {
      for (let j = 0; j < 4; j++) {
        const fx = j % 2 ? 0.62 : 0.38, fy = 0.13 + j * 0.245;
        const ex = (s - fx) / 0.065, ey = (t - fy) / 0.12;
        const e = Math.hypot(ex, ey * (ey > 0.2 ? 1 : 1.25));
        a = Math.max(a, smooth(1.05, 0.85, e) * (0.35 + valueNoise(s * 60, t * 60, sd) * 0.3));
      }
      col = [150, 126, 96];
    } else {
      a = smooth(0.4, 0.33, r + (n - 0.5) * 0.3) * 0.6;
      col = [30, 32, 34];
    }
    const i = (py * S + px) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
    img.data[i + 3] = clamp01(a) * 255;
  }
  x.putImageData(img, 0, 0);
  const t = decalCanvasTex(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  cache.set('decals', t);
  return t;
}

// 4x4 atlas of paper and paint on walls (row 0 at the top):
//  row 0: posters   row 1: A <-, A ->, B <-, B -> painted direction signs
//  row 2: shop boards and plates   row 3: spray paint and stencils
export function posterAtlas() {
  if (cache.has('posters')) return cache.get('posters');
  const S = 1024, T = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const r = rng(424242);
  const font = (px, w = 700) => `${w} ${px}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
  const tile = (col, row, draw) => { x.save(); x.translate(col * T, row * T); x.beginPath(); x.rect(0, 0, T, T); x.clip(); draw(); x.restore(); };
  const bars = (x0, y0, w, n, h, gap, color) => { x.fillStyle = color; for (let i = 0; i < n; i++) x.fillRect(x0, y0 + i * (h + gap), w * (0.55 + r() * 0.45), h); };
  // torn paper: a jagged outline inside the tile
  const paper = (fill, x0 = 22, y0 = 10, x1 = 234, y1 = 246) => {
    x.beginPath(); x.moveTo(x0, y0);
    for (let k = 0; k <= 12; k++) x.lineTo(x0 + (x1 - x0) * k / 12, y0 + r() * 5);
    for (let k = 0; k <= 12; k++) x.lineTo(x1 - r() * 5, y0 + (y1 - y0) * k / 12);
    for (let k = 0; k <= 12; k++) x.lineTo(x1 - (x1 - x0) * k / 12, y1 - r() * 6 - (k > 8 ? (k - 8) * 7 * r() : 0));
    for (let k = 0; k <= 12; k++) x.lineTo(x0 + r() * 5, y1 - (y1 - y0) * k / 12);
    x.closePath(); x.fillStyle = fill; x.fill(); x.save(); x.clip();
  };
  const wear = (n, alpha = 0.55) => {
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) { x.fillStyle = `rgba(0,0,0,${(r() * alpha).toFixed(2)})`; x.fillRect(r() * T, r() * T, 1 + r() * 4, 1 + r() * 4); }
    x.globalCompositeOperation = 'source-over';
  };
  const fade = (color = 'rgba(235,220,190,0.22)') => { x.fillStyle = color; x.fillRect(0, 0, T, T); };
  // posters
  tile(0, 0, () => { paper('#d9772e'); x.fillStyle = '#f4e6c8'; x.beginPath(); x.arc(128, 104, 58, 0, 7); x.fill(); x.fillStyle = '#2a1d16'; x.font = font(46); x.textAlign = 'center'; x.fillText('FESTIVAL', 128, 206); bars(52, 218, 150, 2, 6, 6, '#2a1d16'); fade(); x.restore(); wear(500); });
  tile(1, 0, () => { paper('#2d6f6a'); x.fillStyle = '#e9d9b0'; for (let i = 0; i < 3; i++) { x.save(); x.translate(60 + i * 36, 40); x.rotate(0.5); x.fillRect(0, 0, 22, 150); x.restore(); } x.font = font(110); x.textAlign = 'right'; x.fillText('07', 214, 214); bars(36, 36, 90, 3, 7, 7, '#e9d9b0'); fade(); x.restore(); wear(500); });
  tile(2, 0, () => { paper('#eadfc6'); x.fillStyle = '#b3332a'; x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? 26 : 62; x.lineTo(128 + Math.cos(a) * rr, 100 + Math.sin(a) * rr); } x.fill(); x.fillStyle = '#3a2a20'; x.font = font(40); x.textAlign = 'center'; x.fillText('GRAND BAZAAR', 128, 200); bars(48, 214, 160, 2, 6, 7, '#7a6450'); fade(); x.restore(); wear(500); });
  tile(3, 0, () => { paper('#26365c'); x.fillStyle = '#f1c64a'; x.font = font(64); x.textAlign = 'center'; x.fillText('MARKET', 128, 92); x.fillText('DAY', 128, 150); bars(44, 176, 168, 4, 7, 8, '#c9b48a'); fade('rgba(235,220,190,0.15)'); x.restore(); wear(700); });
  // painted direction signs
  [['A', -1], ['A', 1], ['B', -1], ['B', 1]].forEach(([L, d], i) => tile(i, 1, () => {
    x.fillStyle = 'rgba(150,34,26,0.92)'; x.strokeStyle = 'rgba(150,34,26,0.92)';
    x.font = font(170); x.textAlign = 'center'; x.textBaseline = 'middle';
    const lx = d < 0 ? 168 : 88;
    x.fillText(L, lx, 120);
    // arrow
    const ax = d < 0 ? 96 : 160;
    x.lineWidth = 16; x.beginPath(); x.moveTo(ax - d * 0, 128); x.lineTo(ax - d * -0, 128); x.stroke();
    x.beginPath(); x.moveTo(d < 0 ? 104 : 152, 128); x.lineTo(d < 0 ? 26 : 230, 128); x.stroke();
    x.beginPath(); const tip = d < 0 ? 14 : 242; x.moveTo(tip, 128); x.lineTo(tip - d * 44, 98); x.lineTo(tip - d * 44, 158); x.closePath(); x.fill();
    // drips
    x.lineWidth = 3;
    for (let k = 0; k < 7; k++) { const dxp = 30 + r() * 196, y0 = 150 + r() * 30; x.beginPath(); x.moveTo(dxp, y0); x.lineTo(dxp, y0 + 12 + r() * 40); x.stroke(); }
    wear(1400, 0.8);
  }));
  // boards and plates
  tile(0, 2, () => { x.fillStyle = '#6b4526'; x.fillRect(6, 52, 244, 152); for (let i = 0; i < 4; i++) { x.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`; x.fillRect(6, 52 + i * 38, 244, 3); } x.fillStyle = '#efe0bd'; x.font = font(104); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SOUK', 128, 132); wear(900); });
  tile(1, 2, () => { x.fillStyle = '#244a3a'; x.fillRect(6, 52, 244, 152); x.strokeStyle = '#d9b54a'; x.lineWidth = 6; x.strokeRect(18, 64, 220, 128); x.fillStyle = '#d9b54a'; x.font = font(96); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CHAI', 128, 130); wear(900); });
  tile(2, 2, () => { x.fillStyle = '#e8c02c'; x.beginPath(); x.moveTo(128, 30); x.lineTo(232, 214); x.lineTo(24, 214); x.closePath(); x.fill(); x.strokeStyle = '#1d1a16'; x.lineWidth = 10; x.stroke(); x.fillStyle = '#1d1a16'; x.beginPath(); x.moveTo(140, 82); x.lineTo(104, 150); x.lineTo(130, 150); x.lineTo(114, 196); x.lineTo(156, 126); x.lineTo(130, 126); x.closePath(); x.fill(); wear(500); });
  tile(3, 2, () => { x.fillStyle = '#1f4f8c'; x.fillRect(40, 70, 176, 116); x.strokeStyle = '#f2efe6'; x.lineWidth = 6; x.strokeRect(50, 80, 156, 96); x.fillStyle = '#f2efe6'; x.font = font(84); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('17', 128, 130); wear(400); });
  // spray paint and stencils
  const spray = (pts, w, color) => { x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); };
  tile(0, 3, () => {
    const p = [[30, 170], [60, 80], [90, 170], [118, 96], [150, 176], [176, 84], [224, 150]];
    spray(p, 30, 'rgba(25,25,30,0.9)'); spray(p, 18, 'rgba(46,158,170,0.92)');
    x.filter = 'blur(2px)'; spray([[40, 200], [210, 196]], 6, 'rgba(240,240,240,0.7)'); x.filter = 'none'; wear(600);
  });
  tile(1, 3, () => {
    x.save(); x.translate(128, 128); x.rotate(-0.12);
    x.font = font(120, 800); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 14; x.strokeStyle = 'rgba(20,20,20,0.9)'; x.strokeText('ZEF', 0, 0);
    x.fillStyle = 'rgba(214,72,52,0.95)'; x.fillText('ZEF', 0, 0);
    x.restore(); wear(700);
  });
  tile(2, 3, () => { x.fillStyle = 'rgba(30,28,26,0.85)'; x.font = font(76, 700); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('KEEP', 128, 92); x.fillText('OUT', 128, 164); x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 5; i++) x.fillRect(40 + i * 40, 40, 5, 180); x.globalCompositeOperation = 'source-over'; wear(1200, 0.8); });
  tile(3, 3, () => { x.fillStyle = 'rgba(232,220,192,0.8)'; x.fillRect(8, 80, 240, 96); x.fillStyle = 'rgba(140,46,30,0.85)'; x.font = font(78); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BAKERY', 128, 130); wear(1600, 0.7); });
  const t = decalCanvasTex(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  cache.set('posters', t);
  return t;
}

export { clamp01 };
