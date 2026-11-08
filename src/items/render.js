// Turns an inventory item into textures/materials: paints the finish, applies
// wear for the item's float value, and attaches sticker decals.
import * as THREE from 'three';
import { attachKillscribe, detachKillscribe } from './killscribe.js';
import { SKINS, STICKERS } from './catalog.js';
import { paintFinish } from './finishes.js';
import { wornSticker } from './stickers.js';
import { applyWear } from './wear.js';

const texCache = new Map();

// Returns { map, metal, rough } for a skin + float + seed, cached.
export function skinTexture(defId, float, seed, size = 1024) {
  const key = `${defId}|${float.toFixed(4)}|${seed}|${size}`;
  if (texCache.has(key)) return texCache.get(key);
  const def = SKINS[defId];
  const { canvas, metal, rough } = paintFinish(def, seed, size, size / 2);
  applyWear(canvas, float, seed + (def.seedOffset || 0));
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const out = { map, metal: Math.max(0, metal - float * 0.18), rough: Math.min(1, rough + float * 0.25), canvas };
  texCache.set(key, out);
  if (texCache.size > 80) { const first = texCache.keys().next().value; texCache.get(first).map.dispose(); texCache.delete(first); }
  return out;
}

// ---------------------------------------------------------------- off the main thread
// In a match, skins are painted by a worker and put on the gun when ready
// (the stock finish shows until then), so equipping a skinned gun never
// stalls a frame. Menus keep the immediate skinTexture/applySkin above.
const keyOf = (defId, float, seed) => `${defId}|${float.toFixed(4)}|${seed}`;
const pending = new Map();      // key|size -> promise
let worker = null, jobId = 0;
const jobs = new Map();
function paintWorker() {
  if (worker === null) {
    try {
      worker = new Worker(new URL('./paint.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(e.data); };
      worker.onerror = () => { worker = false; for (const j of jobs.values()) j.reject(new Error('paint worker failed')); jobs.clear(); };
    } catch { worker = false; }
  }
  return worker;
}
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 30));

// Promise of { map, metal, rough } for a skin at a size, painted in the background.
export function skinTextureAsync(defId, float, seed, size = 1024) {
  const key = `${keyOf(defId, float, seed)}|${size}`;
  if (texCache.has(key)) return Promise.resolve(texCache.get(key));
  if (pending.has(key)) return pending.get(key);
  const w = paintWorker();
  const pr = (w ? new Promise((resolve, reject) => { const id = ++jobId; jobs.set(id, { resolve, reject }); w.postMessage({ id, defId, float, seed, size }); })
    .then(({ bitmap, metal, rough }) => {
      const map = new THREE.Texture(bitmap);
      map.flipY = false; map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; map.needsUpdate = true;
      const out = { map, metal: Math.max(0, metal - float * 0.18), rough: Math.min(1, rough + float * 0.25), size };
      texCache.set(key, out);
      if (texCache.size > 80) { const first = texCache.keys().next().value; texCache.get(first).map.dispose(); texCache.delete(first); }
      return out;
    })
    // no worker (old browser): paint on the page in idle time, at most 256 px
    : new Promise((resolve) => idle(() => resolve(skinTexture(defId, float, seed, Math.min(size, 256))))))
    .finally(() => pending.delete(key));
  pending.set(key, pr);
  return pr;
}

function setSkinMaterial(gun, t, def) {
  if (def?.gloves) return setGloveMaterial(gun, t, def);
  const mat = new THREE.MeshStandardMaterial({ map: t.map, metalness: t.metal, roughness: t.rough });
  gun.userData.inner.traverse(o => { if (o.isMesh && o.userData.part === 'skin') o.material = mat; });
}

// ---------------------------------------------------------------- gloves
// Glove finishes are projected onto each hand from three sides, in that
// hand's own frame (triplanar), from the resting-pose position and normal
// before skinning. So no UV layout is needed, the print stays put on the
// glove as the hand moves, and the first-person hands and the inventory model
// look alike. One hand fits inside one tile of the texture.
const frameCache = new WeakMap();
// Per hand (x < 0, x >= 0, or the whole mesh when `single`): the centre and a
// frame from the spread of the vertices (long axis first).
function handFrames(geo, single) {
  const key = single ? 's' : 'p';
  const cached = frameCache.get(geo)?.[key];
  if (cached) return cached;
  const pos = geo.attributes.position, v = new THREE.Vector3();
  const frame = (keep) => {
    const c = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (keep(v)) { c.add(v); n++; } }
    if (!n) return { c, f: new THREE.Matrix3() };
    c.divideScalar(n);
    const M = [0, 0, 0, 0, 0, 0];   // xx xy xz yy yz zz
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); if (!keep(v)) continue;
      const x = v.x - c.x, y = v.y - c.y, z = v.z - c.z;
      M[0] += x * x; M[1] += x * y; M[2] += x * z; M[3] += y * y; M[4] += y * z; M[5] += z * z;
    }
    const mul = (a) => new THREE.Vector3(M[0] * a.x + M[1] * a.y + M[2] * a.z, M[1] * a.x + M[3] * a.y + M[4] * a.z, M[2] * a.x + M[4] * a.y + M[5] * a.z);
    let a = new THREE.Vector3(0.3, 1, 0.2).normalize();
    for (let k = 0; k < 40; k++) a = mul(a).normalize();
    let b = new THREE.Vector3(1, 0.1, 0.3);
    for (let k = 0; k < 40; k++) { b.addScaledVector(a, -a.dot(b)).normalize(); b = mul(b); }
    b.addScaledVector(a, -a.dot(b)).normalize();
    const w = new THREE.Vector3().crossVectors(a, b);
    return { c, f: new THREE.Matrix3().set(a.x, a.y, a.z, b.x, b.y, b.z, w.x, w.y, w.z) };
  };
  const out = single ? [frame(() => true)] : [frame(p => p.x < 0), frame(p => p.x >= 0)];
  if (single) out.push(out[0]);
  frameCache.set(geo, { ...frameCache.get(geo), [key]: out });
  return out;
}

// The gloves are built with their construction parts as separate meshes
// (moulded knuckle guard, padded finger plates and back panel, palm pad, wrist
// strap with its tab, raised seams, cloth wraps). Each glove type shows the
// parts it is made with; with no glove skin the team's own gloves show theirs.
export const GLOVE_PARTS = {
  racer: ['seam', 'cuff', 'palm'],
  field: ['seam', 'cuff', 'panel', 'palm'],
  wraps: ['wrap'],
  rider: ['knuckle', 'pad', 'cuff', 'seam', 'panel'],
  tactical: ['knuckle', 'pad', 'cuff', 'seam', 'palm'],
  touring: ['seam', 'cuff'],
  CT: ['knuckle', 'pad', 'cuff', 'seam'],
  T: ['cuff', 'seam'],
};
export function glovePartVisible(kind, type) {
  return kind === 'body' || (GLOVE_PARTS[type] || GLOVE_PARTS.T).includes(kind);
}
// How a finish sits on each part: the moulded guard is a smoked, glossy
// version of the print, padding and the strap a shade darker, thread lighter.
const PART_LOOK = {
  knuckle: { tint: 0.5, rough: 0.3 }, pad: { tint: 0.72 }, panel: { tint: 0.86 }, palm: { tint: 0.6, rough: 0.8 },
  cuff: { tint: 0.55, rough: 0.7 }, seam: { tint: 1.45, rough: 0.75 }, wrap: { tint: 1.0, rough: 0.92 },
};

// A material for glove faces: the finish texture projected as above. With
// `base` (the team's glove material on the first-person arms) its normal map
// and the fine shading of its colour map (stitching, creases) carry over.
// Parts take the projection frames of the glove they sit on (`frameGeo`), so
// the print runs on across them, and their `kind` sets the shade.
export function gloveMaterial(t, geo, { base = null, single = false, frameGeo = null, kind = 'body', type = null } = {}) {
  const fr = handFrames(frameGeo || geo, single);
  const m = base ? base.clone() : new THREE.MeshStandardMaterial();
  const baseMap = base?.map || null;
  const look = PART_LOOK[kind];
  m.map = t.map; m.color.setScalar(kind === 'body' && type === 'wraps' ? 0.62 : look?.tint ?? 1);
  m.roughnessMap = null; m.metalnessMap = null;
  m.roughness = look?.rough ?? t.rough; m.metalness = t.metal;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uGC0: { value: fr[0].c }, uGF0: { value: fr[0].f }, uGC1: { value: fr[1].c }, uGF1: { value: fr[1].f },
      uGK: { value: 2.0 }, uGBase: { value: baseMap },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uGC0; uniform vec3 uGC1; uniform mat3 uGF0; uniform mat3 uGF1;
varying vec3 vGP; varying vec3 vGN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ bool gl = position.x < 0.0; mat3 gf = gl ? uGF0 : uGF1; vGP = gf * (position - (gl ? uGC0 : uGC1)); vGN = gf * normal; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uGK; uniform sampler2D uGBase; varying vec3 vGP; varying vec3 vGN;`)
      .replace('#include <map_fragment>', `{
  vec3 gw = pow(abs(normalize(vGN)), vec3(6.0)); gw /= gw.x + gw.y + gw.z + 1e-5;
  vec2 gs = vec2(uGK, uGK * 2.0);
  vec4 gc = texture2D(map, vGP.xy * gs + 0.5) * gw.z + texture2D(map, vGP.xz * gs + 0.5) * gw.y + texture2D(map, vGP.yz * gs + 0.5) * gw.x;
  ${baseMap ? `vec3 gb0 = texture2D(uGBase, vMapUv).rgb, gb1 = textureLod(uGBase, vMapUv, 5.0).rgb;
  gc.rgb *= clamp(dot(gb0, vec3(0.3, 0.59, 0.11)) / max(dot(gb1, vec3(0.3, 0.59, 0.11)), 0.03), 0.55, 1.3);` : ''}
  diffuseColor *= gc;
}`);
  };
  m.customProgramCacheKey = () => (baseMap ? 'glove-b' : 'glove');
  m.needsUpdate = true;
  return m;
}

function setGloveMaterial(gun, t, def) {
  const type = def?.gloveType;
  gun.userData.inner.traverse(o => {
    if (!o.isMesh || o.userData.part !== 'skin') return;
    const kind = o.userData.gkind || 'body';
    o.visible = glovePartVisible(kind, type);
    o.material = gloveMaterial(t, o.geometry, { single: true, frameGeo: o.userData.frameGeo, kind, type });
  });
}

// applySkin for in-match use: puts on whatever size of this finish is already
// painted, asks the worker for the wanted size, and swaps it in when ready.
export function applySkinAsync(gun, item, { size = 1024 } = {}) {
  for (const s of [...(gun.userData.stickerMeshes || [])]) s.parent.remove(s);
  gun.userData.stickerMeshes = [];
  gun.userData.skinWant = null;
  if (!item || !SKINS[item.defId]) { detachKillscribe(gun); return gun; }
  const def = SKINS[item.defId];
  attachKillscribe(gun, item, def);
  if (def.finish) {
    const base = keyOf(item.defId, item.float, item.seed);
    gun.userData.skinWant = base;
    let have = null;
    for (const sz of [size, 1024, 512, 256, 128]) { const t = texCache.get(`${base}|${sz}`); if (t) { have = { ...t, size: sz }; break; } }
    if (have) setSkinMaterial(gun, have, def);
    if (!have || have.size !== size) {
      skinTextureAsync(item.defId, item.float, item.seed, size)
        .then(t => { if (gun.userData.skinWant === base) setSkinMaterial(gun, t, def); })
        .catch(() => {});
    }
  }
  if (item.stickers?.length && !def.knife && !def.gloves) addStickers(gun, def.weapon, item.stickers);
  return gun;
}

// Sticker slot anchors per weapon, in authoring space (x along barrel, y up).
export const STICKER_SLOTS = {
  ak47: [[-0.27, -0.03], [0.02, 0.025], [0.12, 0.025], [0.33, 0.02]],
  m4a1: [[-0.25, -0.0], [-0.01, 0.045], [0.09, 0.048], [0.28, 0.042]],
  awp: [[-0.48, -0.02], [-0.36, 0.0], [0.08, 0.0], [0.24, 0.0]],
  glock: [[0.02, 0.034], [0.07, 0.034], [0.12, 0.034], [-0.05, -0.055]],
  usp: [[0.02, 0.032], [0.08, 0.032], [0.24, 0.03], [-0.05, -0.055]],
  deagle: [[0.02, 0.042], [0.08, 0.042], [0.14, 0.042], [-0.05, -0.06]],
};

// Applies an item's finish + stickers to a gun built by buildGun.
// item: { defId, float, seed, stickers?: [{defId, wear, slot}] } or null for stock.
export function applySkin(gun, item, { size = 1024 } = {}) {
  const inner = gun.userData.inner;
  // remove previous stickers
  for (const s of [...(gun.userData.stickerMeshes || [])]) s.parent.remove(s);
  gun.userData.stickerMeshes = [];
  if (!item || !SKINS[item.defId]) { detachKillscribe(gun); return gun; }
  const def = SKINS[item.defId];
  if (def.finish) {
    setSkinMaterial(gun, skinTexture(item.defId, item.float, item.seed, size), def);
  }
  attachKillscribe(gun, item, def);
  if (item.stickers?.length && !def.knife && !def.gloves) addStickers(gun, def.weapon, item.stickers);
  return gun;
}

const ray = new THREE.Raycaster();
// Four evenly spaced slots along the painted parts, for guns without hand-placed ones.
function autoSlots(inner, targets) {
  const box = new THREE.Box3(), inv = inner.matrixWorld.clone().invert();
  for (const t of targets) box.union(new THREE.Box3().setFromObject(t).applyMatrix4(inv));
  if (box.isEmpty()) return [];
  const L = box.max.x - box.min.x, y = box.min.y + (box.max.y - box.min.y) * 0.62;
  return [0.22, 0.4, 0.58, 0.76].map(f => [box.min.x + L * f, y]);
}

function addStickers(gun, weapon, stickers) {
  const inner = gun.userData.inner;
  inner.updateMatrixWorld(true);
  const targets = [];
  inner.traverse(o => { if (o.isMesh && o.userData.part === 'skin') targets.push(o); });
  const slots = STICKER_SLOTS[weapon] || autoSlots(inner, targets);
  for (const st of stickers) {
    const sd = STICKERS[st.defId];
    const slot = slots[st.slot];
    if (!sd || !slot) continue;
    // cast from the left side (-Z in authoring space) toward the gun
    const originL = new THREE.Vector3(slot[0], slot[1], -1).applyMatrix4(inner.matrixWorld);
    const dirL = new THREE.Vector3(0, 0, 1).transformDirection(inner.matrixWorld);
    ray.set(originL, dirL);
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) continue;
    const local = inner.worldToLocal(hit.point.clone());
    const canvas = wornSticker(sd, st.wear || 0, st.slot + 3);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const metal = sd.finishType === 'foil' || sd.finishType === 'gold';
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034), new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.05, roughness: metal ? 0.25 : 0.6, metalness: metal ? 0.6 : 0,
      polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false,
    }));
    m.position.copy(local); m.position.z -= 0.0008;
    m.rotation.y = Math.PI; // face -Z (left side)
    m.userData.part = 'sticker';
    inner.add(m);
    gun.userData.stickerMeshes.push(m);
  }
}

// Builds a random cosmetic item (used to give bots skins).
export function randomItemFor(weapon, r = Math.random) {
  const pool = Object.values(SKINS).filter(s => s.weapon === weapon);
  if (!pool.length) return null;
  const def = pool[Math.floor(r() * pool.length)];
  const [lo, hi] = def.floatRange;
  return { defId: def.id, float: lo + r() * (hi - lo), seed: Math.floor(r() * 1000) };
}
