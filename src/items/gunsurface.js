// Surface detail for gun models: small tiling normal and roughness maps that
// give each kind of material its real finish (the fine grain of a
// parkerized or Cerakoted receiver, brushed steel, the stippling moulded
// into polymer, pebbled rubber, wood grain), so a gun doesn't read as flat
// plastic. They're mapped by a box projection of their own (uv1, worked out
// for every part when the model is built, about a 6 cm tile), so a skin's
// own mapping (uv) is left alone and a skinned gun keeps the same surface.
import * as THREE from 'three';

const N = 256;
const cache = {};

// tiling value noise: cx cells across and cy down, wrapping at the edges
function noise(seed, cx, cy = cx) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const f = (t) => t * t * (3 - 2 * t);
  const at = (i, j) => g[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)];
  return (x, y) => {
    const fx = (x / N) * cx, fy = (y / N) * cy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = f(fx - x0), ty = f(fy - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}
// a fixed random value per grid cell (wrapping), for scattering things
function cellRand(seed, cells) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const g = new Float32Array(cells * cells * 2);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (i, j, k) => g[((((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)) * 2 + k];
}

// heights for each finish (0..1)
const HEIGHT = {
  // fine even grain, a few sizes of it
  grain: () => { const a = noise(11, 256), b = noise(23, 128); return (x, y) => 0.7 * a(x, y) + 0.3 * b(x, y); },
  // fine lines along u (the barrel's length), from turning or brushing
  brushed: () => { const a = noise(5, 16, 256), b = noise(9, 16); return (x, y) => 0.75 * a(x, y) + 0.25 * b(x, y); },
  // moulded stippling: close-packed small bumps, each a little off its grid point
  stipple: () => {
    const p = 4, cells = N / p, j = cellRand(71, cells);   // bump pitch, texels (about 1 mm)
    return (x, y) => {
      const cx = Math.floor(x / p), cy = Math.floor(y / p);
      let h = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ox = (cx + dx) * p + p * 0.5 + (j(cx + dx, cy + dy, 0) - 0.5) * p * 0.6;
        const oy = (cy + dy) * p + p * 0.5 + (j(cx + dx, cy + dy, 1) - 0.5) * p * 0.6;
        const d = Math.hypot(x - ox, y - oy) / (p * 0.55);
        h = Math.max(h, d < 1 ? Math.cos(d * Math.PI / 2) : 0);
      }
      return h;
    };
  },
  // pebbled rubber: soft, larger bumps
  pebble: () => { const a = noise(3, 24), b = noise(7, 48); return (x, y) => Math.pow(0.65 * a(x, y) + 0.35 * b(x, y), 1.6); },
  // chequering / knurling: grooves crossing at right angles, about 1.25 mm
  // apart, leaving rows of little pyramids
  knurl: () => {
    const n = 48;   // diamonds across a tile
    const tri = (t) => 1 - Math.abs(2 * (t - Math.floor(t)) - 1);
    return (x, y) => { const u = (x / N) * n, v = (y / N) * n; return Math.min(tri(u + v), tri(u - v)); };
  },
  // wood grain: long wavy lines along u
  wood: () => { const w = noise(13, 8), f = noise(29, 64); return (x, y) => 0.5 + 0.5 * Math.sin((y / N) * Math.PI * 2 * 22 + w(x, y) * 7) * 0.8 + 0.2 * (f(x, y) - 0.5); },
};

function normalFrom(h, strength) {
  const data = new Uint8Array(N * N * 4), H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = h(x, y);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = H[y * N + ((x + N - 1) % N)], r = H[y * N + ((x + 1) % N)], u = H[((y + N - 1) % N) * N + x], d = H[((y + 1) % N) * N + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * N + x) * 4;
    data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  return { data, H };
}

function tex(data, srgb = false) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4;
  t.channel = 1;   // the box projection (uv1)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// normal map + a roughness map that varies with it (raised grain a touch
// shinier, worn smooth; hollows hold a little more dull)
export function finishMaps(kind) {
  if (cache[kind]) return cache[kind];
  const strength = { grain: 3, brushed: 2.2, stipple: 2.6, pebble: 4, wood: 1.6, knurl: 1.1 }[kind] || 2;
  const { data, H } = normalFrom(HEIGHT[kind](), strength);
  const rough = new Uint8Array(N * N * 4);
  const span = { grain: 0.22, brushed: 0.06, stipple: 0.3, pebble: 0.18, wood: 0.25, knurl: 0.3 }[kind] || 0.2;
  for (let i = 0; i < N * N; i++) {
    const v = Math.max(0, Math.min(1, 1 - span / 2 + span * (1 - H[i])));
    rough[i * 4 + 1] = v * 255; rough[i * 4] = rough[i * 4 + 2] = v * 255; rough[i * 4 + 3] = 255;
  }
  return (cache[kind] = { normalMap: tex(data), roughnessMap: tex(rough) });
}

// The box projection: each vertex mapped from the side its normal faces most,
// about 6 cm to a tile, in the model's own frame (so every part of a gun
// lines up and the grain runs along the barrel).
const TILE = 0.06;
export function addDetailUVs(inner) {
  inner.updateMatrixWorld(true);
  const inv = inner.matrixWorld.clone().invert(), m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  inner.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position || o.geometry.attributes.uv1) return;
    const g = o.geometry, p = g.attributes.position, nrm = g.attributes.normal;
    m.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(m);
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (nrm) n.fromBufferAttribute(nrm, i).applyMatrix3(nm); else n.set(0, 0, 1);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      // the gun's length runs along x (u along it wherever it can)
      if (az >= ax && az >= ay) { uv[i * 2] = v.x / TILE; uv[i * 2 + 1] = v.y / TILE; }
      else if (ay >= ax) { uv[i * 2] = v.x / TILE; uv[i * 2 + 1] = v.z / TILE; }
      else { uv[i * 2] = v.z / TILE; uv[i * 2 + 1] = v.y / TILE; }
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  });
}

// Puts a finish on a material (normal + roughness maps, how strong).
export function applyFinish(mat, kind, scale = 0.5) {
  if (!mat || !kind) return mat;
  const f = finishMaps(kind);
  mat.normalMap = f.normalMap; mat.normalScale = new THREE.Vector2(scale, scale);
  mat.roughnessMap = f.roughnessMap;
  mat.needsUpdate = true;
  return mat;
}

// The same material with another finish (one copy per material and finish):
// for parts whose surface differs from the rest of their material, picked by
// the part's name.
const variants = new WeakMap();
export function finishVariant(mat, kind, scale) {
  if (!mat) return mat;
  let m = variants.get(mat);
  if (!m) variants.set(mat, (m = {}));
  const key = kind + ':' + scale;
  return m[key] || (m[key] = applyFinish(mat.clone(), kind, scale));
}
