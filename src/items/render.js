// Turns an inventory item into textures/materials: paints the finish, applies
// wear for the item's float value, and attaches sticker decals.
import * as THREE from 'three';
import { SKINS, STICKERS } from './catalog.js';
import { paintFinish } from './finishes.js';
import { wornSticker } from './stickers.js';
import { fbm, valueNoise, rng, smooth } from '../noise.js';

const texCache = new Map();

// Wear: paint chips away to bare metal as the float rises, plus scratches and grime.
function applyWear(canvas, float, seed) {
  if (float <= 0.0) return;
  const W = canvas.width, H = canvas.height;
  const x = canvas.getContext('2d');
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const f = float;
  // threshold grows non-linearly; FN keeps almost everything
  const chip = Math.pow(f, 1.35) * 0.62;
  const grime = f * 0.28;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / H, v = j / H;
    const n = fbm(u * 7 + seed * 0.13, v * 7, seed, 4);
    // edges of the texture (top/bottom ≈ edges of the gun silhouette) wear first
    const edgeBias = Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.25;
    const fine = valueNoise(u * 180, v * 180, seed + 5);
    const m = n - edgeBias + (fine - 0.5) * 0.08;
    const worn = smooth(chip + 0.02, chip - 0.03, m);
    const k = (j * W + i) * 4;
    if (worn > 0) {
      const steel = 128 + (valueNoise(u * 2, v * 260, seed + 9) - 0.5) * 40;
      d[k] = d[k] + (steel - d[k]) * worn;
      d[k + 1] = d[k + 1] + (steel + 2 - d[k + 1]) * worn;
      d[k + 2] = d[k + 2] + (steel + 6 - d[k + 2]) * worn;
    }
    const g = 1 - grime * (0.5 + fbm(u * 3, v * 3, seed + 2, 3));
    d[k] *= g; d[k + 1] *= g; d[k + 2] *= g * 0.97;
  }
  x.putImageData(img, 0, 0);
  // scratches
  const r = rng(seed + 77);
  const n = Math.floor(f * f * 900 + f * 60);
  x.lineCap = 'round';
  for (let s = 0; s < n; s++) {
    x.strokeStyle = `rgba(${r() < 0.7 ? '190,192,196' : '30,28,26'},${0.15 + r() * 0.4})`;
    x.lineWidth = 0.6 + r() * 1.4;
    const sx = r() * W, sy = r() * H, len = 6 + r() * 40, a = (r() - 0.5) * 0.8 + (r() < 0.5 ? 0 : Math.PI / 2);
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
  }
}

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
  const out = { map, metal: Math.max(0, metal - float * 0.25), rough: Math.min(1, rough + float * 0.35), canvas };
  texCache.set(key, out);
  if (texCache.size > 80) { const first = texCache.keys().next().value; texCache.get(first).map.dispose(); texCache.delete(first); }
  return out;
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
  if (!item || !SKINS[item.defId]) return gun;
  const def = SKINS[item.defId];
  if (def.finish) {
    const t = skinTexture(item.defId, item.float, item.seed, size);
    const mat = new THREE.MeshStandardMaterial({ map: t.map, metalness: t.metal, roughness: t.rough });
    inner.traverse(o => { if (o.isMesh && o.userData.part === 'skin') o.material = mat; });
  }
  if (item.stickers?.length && !def.knife) addStickers(gun, def.weapon, item.stickers);
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
