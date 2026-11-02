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

export function modelFor(item) {
  if (!item) return buildGun('ak47');
  const d = SKINS[item.defId];
  const gun = buildGun(d.knife ? `knife:${d.knife}` : d.weapon);
  applySkin(gun, item);
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
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}

// Thumbnail renderer: one shared WebGL context, results cached as data URLs.
let thumbR = null, thumbScene, thumbCam;
const thumbCache = new Map();
const queue = [];
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

function renderThumb(item) {
  if (!thumbR) thumbSetup();
  const obj = modelFor(item);
  // side view, slight tilt for knives
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
  const url = thumbR.domElement.toDataURL('image/png');
  thumbScene.remove(holder);
  holder.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  return url;
}

// Calls cb(url) once the thumbnail is ready (async, one per frame).
export function thumbnail(item, cb) {
  const k = thumbKey(item);
  if (thumbCache.has(k)) { cb(thumbCache.get(k)); return; }
  queue.push([item, k, cb]);
  if (!busy) pump();
}
function pump() {
  busy = true;
  const next = queue.shift();
  if (!next) { busy = false; return; }
  const [item, k, cb] = next;
  if (!thumbCache.has(k)) thumbCache.set(k, renderThumb({ ...item, stickers: item.stickers }));
  cb(thumbCache.get(k));
  setTimeout(pump, 0);
}
