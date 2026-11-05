// 3D "studio" renderers for menus: an interactive viewer (drag to rotate,
// wheel to zoom) and an offscreen thumbnail renderer for inventory tiles.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun } from '../gunmodels.js';
import { applySkin } from '../items/render.js';
import { SKINS } from '../items/catalog.js';

function studioScene(renderer) {
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.7;
  pm.dispose();
  const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(1.5, 2, 2.5);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 1.6); rim.position.set(-2, 1, -2);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.15));
  return scene;
}

export function modelFor(item, { size = 1024 } = {}) {
  if (!item) return buildGun('ak47');
  const d = SKINS[item.defId];
  const gun = buildGun(d.knife ? `knife:${d.knife}` : d.weapon);
  applySkin(gun, item, { size });
  return gun;
}

// Centres a model and returns its radius so cameras can frame it.
function frame(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  return box.getSize(new THREE.Vector3()).length() / 2;
}

export class Viewer {
  constructor(container, { autoRotate = false, background = null } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !background });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene = studioScene(this.renderer);
    if (background) this.scene.background = new THREE.Color(background);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.rot = { x: 0.15, y: -Math.PI / 2 + 0.35 }; this.target = { ...this.rot };
    this.zoom = 1; this.autoRotate = autoRotate;
    this.radius = 0.5;
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); this.autoRotate = false; });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.target.y += (e.clientX - this.drag.x) * 0.01;
      this.target.x = Math.max(-1.3, Math.min(1.3, this.target.x + (e.clientY - this.drag.y) * 0.01));
      this.drag = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', () => { this.drag = null; });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.35, Math.min(1.6, this.zoom * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.resize();
    this.running = true;
    const loop = () => { if (!this.running) return; requestAnimationFrame(loop); this.render(); };
    loop();
  }
  setItem(item) { this.setObject(modelFor(item)); }
  setObject(obj) {
    this.pivot.clear();
    this.radius = frame(obj);
    this.pivot.add(obj);
  }
  view(name) {
    // preset angles: 'left', 'right', 'top', 'muzzle'
    const presets = { left: { x: 0.1, y: Math.PI / 2 }, right: { x: 0.1, y: -Math.PI / 2 }, top: { x: 1.2, y: -Math.PI / 2 }, muzzle: { x: 0.1, y: 0.0 } };
    if (presets[name]) { this.target = { ...presets[name] }; this.autoRotate = false; }
  }
  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  render() {
    if (this.autoRotate) this.target.y += 0.004;
    this.rot.x += (this.target.x - this.rot.x) * 0.15;
    this.rot.y += (this.target.y - this.rot.y) * 0.15;
    this.pivot.rotation.set(this.rot.x, this.rot.y, 0, 'XYZ');
    const fit = this.radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.min(1, this.camera.aspect);
    this.camera.position.set(0, 0, fit * 1.08 * this.zoom);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.running = false; this.ro.disconnect();
    // release the WebGL context right away: browsers only allow ~16 at once and
    // drop the oldest (possibly the game's) when there are more
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}

// Thumbnail renderer: one shared WebGL context. Results are cached in memory
// and in IndexedDB (so they survive reloads), visible requests jump the queue,
// and pages can warm previews in idle time before they're needed.
let thumbR = null, thumbScene, thumbCam;
const THUMB_VERSION = 'v4|';            // bump when models or finishes change so old previews are dropped
const thumbCache = new Map();
const pending = new Map();              // key -> callbacks waiting for it
const queue = [], idleQueue = [];
let busy = false;

function thumbSetup() {
  thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbR.setSize(320, 200);
  thumbR.toneMapping = THREE.ACESFilmicToneMapping;
  thumbR.outputColorSpace = THREE.SRGBColorSpace;
  thumbScene = studioScene(thumbR);
  thumbCam = new THREE.PerspectiveCamera(22, 320 / 200, 0.01, 50);
}

function thumbKey(item) { return `${item.defId}|${item.float}|${item.seed}|${(item.stickers || []).map(s => s.defId + s.slot + s.wear).join()}`; }

// The look used for case contents and the opening reel: one image per skin.
export function previewItem(defId) { return { defId, float: 0.05, seed: 1, stickers: [] }; }

// ---- persistent cache (best effort: private windows or blocked storage just skip it)
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res) => {
    try {
      const rq = indexedDB.open('vantage-thumbs', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('t');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
  return idbP;
}
async function idbGet(k) {
  const db = await idb();
  if (!db) return null;
  return new Promise((res) => {
    try { const r = db.transaction('t').objectStore('t').get(THUMB_VERSION + k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch { res(null); }
  });
}
function idbPut(k, url) { idb().then((db) => { try { db?.transaction('t', 'readwrite').objectStore('t').put(url, THUMB_VERSION + k); } catch { /* storage full or unavailable */ } }); }

function renderThumb(item) {
  if (!thumbR) thumbSetup();
  // a small finish texture is plenty at thumbnail size and paints far faster
  const obj = modelFor(item, { size: 256 });
  const holder = new THREE.Group(); holder.add(obj);
  obj.rotation.y = Math.PI / 2;
  if (SKINS[item.defId]?.knife) obj.rotation.z = -0.5;
  frame(holder);
  const size = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
  thumbScene.add(holder);
  const tan = Math.tan(THREE.MathUtils.degToRad(11));
  const dist = Math.max(size.y / 2 / tan, size.x / 2 / (tan * thumbCam.aspect)) * 1.12 + size.z / 2;
  thumbCam.position.set(0, 0, dist);
  thumbCam.lookAt(0, 0, 0);
  thumbR.render(thumbScene, thumbCam);
  const url = thumbR.domElement.toDataURL('image/webp', 0.9);
  thumbScene.remove(holder);
  holder.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  return url;
}

function deliver(k, url) {
  thumbCache.set(k, url);
  const cbs = pending.get(k) || [];
  pending.delete(k);
  for (const cb of cbs) cb(url);
}

// Calls cb(url) once the thumbnail is ready. Visible requests go first;
// background: true queues it behind them and renders in idle time.
// priority: render before anything else that's waiting (what's on screen right now)
export function thumbnail(item, cb, { background = false, priority = false } = {}) {
  const k = thumbKey(item);
  if (thumbCache.has(k)) { cb?.(thumbCache.get(k)); return; }
  if (pending.has(k)) {
    if (cb) pending.get(k).push(cb);
    // a visible request for something already waiting in the idle queue gets promoted
    if (!background) {
      const i = idleQueue.findIndex(q => q[1] === k);
      if (i >= 0) queue[priority ? 'unshift' : 'push'](...idleQueue.splice(i, 1));
      else if (priority) { const j = queue.findIndex(q => q[1] === k); if (j > 0) queue.unshift(...queue.splice(j, 1)); }
    }
    return;
  }
  pending.set(k, cb ? [cb] : []);
  idbGet(k).then((url) => {
    if (url) { deliver(k, url); return; }
    (background ? idleQueue : queue)[priority ? 'unshift' : 'push']([item, k]);
    if (!busy) pump();
  });
}

// Renders previews for these skins ahead of time (e.g. every case's contents).
export function warmThumbnails(defIds) { for (const id of defIds) thumbnail(previewItem(id), null, { background: true }); }

function pump() {
  busy = true;
  const next = queue.shift() || idleQueue.shift();
  if (!next) { busy = false; return; }
  const [item, k] = next;
  if (!thumbCache.has(k)) {
    const url = renderThumb({ ...item, stickers: item.stickers });
    deliver(k, url);
    idbPut(k, url);
  }
  // keep the page responsive: visible work runs back to back, warm-up waits for idle time
  if (queue.length) setTimeout(pump, 0);
  else if (window.requestIdleCallback) requestIdleCallback(pump, { timeout: 250 });
  else setTimeout(pump, 30);
}
