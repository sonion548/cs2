// Surface marks: bullet holes, blood spatter, knife cuts and scorch marks.
// Each kind keeps a ring buffer so old marks are recycled instead of piling up.
import * as THREE from 'three';
import { rng } from './textures.js';

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bulletHoleTex(seed) {
  const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), r = rng(seed);
  // scuffed ring of chipped material
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 10 + r() * 22, s = 2 + r() * 6;
    x.fillStyle = `rgba(${150 + r() * 40},${135 + r() * 30},${110 + r() * 30},${0.25 + r() * 0.35})`;
    x.beginPath(); x.ellipse(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, s, s * 0.6, a, 0, 7); x.fill();
  }
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 26);
  g.addColorStop(0, 'rgba(6,5,4,1)'); g.addColorStop(0.35, 'rgba(18,15,12,0.95)'); g.addColorStop(0.6, 'rgba(50,42,34,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, 26, 0, 7); x.fill();
  // cracks
  x.strokeStyle = 'rgba(20,16,12,0.55)'; x.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    let px = S / 2, py = S / 2, a = r() * Math.PI * 2;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 4; k++) { a += (r() - 0.5) * 0.9; px += Math.cos(a) * (5 + r() * 6); py += Math.sin(a) * (5 + r() * 6); x.lineTo(px, py); }
    x.stroke();
  }
  return canvasTex(c);
}

function bloodTex(seed) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), r = rng(seed);
  const red = () => `rgba(${90 + r() * 50},${4 + r() * 8},${6 + r() * 8},${0.75 + r() * 0.25})`;
  // main splat
  x.fillStyle = red();
  x.beginPath();
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, d = 38 + r() * 34;
    i ? x.lineTo(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d) : x.moveTo(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d);
  }
  x.fill();
  // streaks and droplets thrown outward
  const dir = r() * Math.PI * 2;
  for (let i = 0; i < 40; i++) {
    const a = dir + (r() - 0.5) * 1.6, d = 50 + r() * 70, s = 1 + r() * 7;
    x.fillStyle = red();
    x.beginPath(); x.ellipse(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, s * 1.6, s, a, 0, 7); x.fill();
  }
  // darker core
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 60);
  g.addColorStop(0, 'rgba(40,0,0,0.55)'); g.addColorStop(1, 'rgba(40,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return canvasTex(c);
}

function slashTex(seed) {
  const W = 256, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), r = rng(seed);
  for (let k = 0; k < 3; k++) {
    const y0 = H / 2 + (k - 1) * (7 + r() * 4);
    x.strokeStyle = `rgba(14,12,10,${0.75 - k * 0.15})`; x.lineWidth = 3.2 - k * 0.6; x.lineCap = 'round';
    x.beginPath(); x.moveTo(14 + r() * 20, y0 + (r() - 0.5) * 6);
    x.quadraticCurveTo(W / 2, y0 + (r() - 0.5) * 12, W - 14 - r() * 30, y0 + (r() - 0.5) * 8); x.stroke();
    // pale raised edge along the cut
    x.strokeStyle = 'rgba(210,195,170,0.35)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(20, y0 - 2.5); x.quadraticCurveTo(W / 2, y0 - 3, W - 24, y0 - 2); x.stroke();
  }
  return canvasTex(c);
}

function scorchTex(seed) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), r = rng(seed);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(8,6,5,0.95)'); g.addColorStop(0.45, 'rgba(20,16,12,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 80;
    x.fillStyle = `rgba(10,8,6,${0.2 + r() * 0.4})`;
    x.beginPath(); x.ellipse(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 4 + r() * 10, 2 + r() * 4, a, 0, 7); x.fill();
  }
  return canvasTex(c);
}

const mat = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

export class Decals {
  constructor(scene, cap = 220) {
    this.scene = scene;
    this.kinds = {
      bullet: { mats: [0, 1, 2].map(i => mat(bulletHoleTex(11 + i))), max: cap, list: [], pool: [] },
      blood: { mats: [0, 1, 2, 3].map(i => mat(bloodTex(31 + i))), max: Math.round(cap * 0.4), list: [], pool: [] },
      slash: { mats: [0, 1].map(i => mat(slashTex(51 + i))), max: 40, list: [], pool: [] },
      scorch: { mats: [mat(scorchTex(71))], max: 20, list: [], pool: [] },
    };
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.n = 0;
  }

  // point/normal in world space; w,h in metres; angle spins the mark around the normal.
  add(kind, point, normal, w, h = w, angle = Math.random() * Math.PI * 2) {
    const k = this.kinds[kind];
    let m;
    if (k.list.length >= k.max) m = k.list.shift();
    else if (k.pool.length) m = k.pool.pop();
    else { m = new THREE.Mesh(this.geo, k.mats[0]); m.receiveShadow = true; m.renderOrder = 2; this.scene.add(m); }
    m.material = k.mats[Math.floor(Math.random() * k.mats.length)];
    // tiny per-decal offset so overlapping marks don't flicker
    m.position.copy(point).addScaledVector(normal, 0.004 + (this.n++ % 8) * 0.0004);
    m.lookAt(point.clone().add(normal));
    m.rotateZ(angle);
    m.scale.set(w, h, 1);
    m.visible = true;
    k.list.push(m);
    return m;
  }

  bullet(p, n) { this.add('bullet', p, n, 0.07 + Math.random() * 0.04); }
  blood(p, n, size = 0.4) { this.add('blood', p, n, size * (0.8 + Math.random() * 0.4)); }
  scorch(p, n, size = 2.4) { this.add('scorch', p, n, size); }

  // dir: direction of the swing in world space (projected onto the surface)
  slash(p, n, dir) {
    const m = this.add('slash', p, n, 0.32, 0.08, 0);
    const local = dir.clone().applyQuaternion(m.quaternion.clone().invert());
    m.rotateZ(Math.atan2(local.y, local.x));
  }

  clear() { for (const k of Object.values(this.kinds)) { for (const m of k.list) { m.visible = false; k.pool.push(m); } k.list.length = 0; } }
}
