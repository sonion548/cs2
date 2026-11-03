// Procedural weapon models. Parts are authored as 2D side profiles (smooth
// curves, bevelled extrusions) plus lathed round parts, in an "authoring
// space" where +X points out of the muzzle, +Y is up and +Z is the right side.
// The returned group is rotated so the muzzle faces -Z.
//
// Mesh userData.part:
//   'skin'   – painted surface that receives weapon finishes
//   'metal'  – bare steel (barrels, bolts, pins)
//   'detail' – polymer/rubber/wood bits that keep their own material
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { surface } from './textures.js';
import { assets } from './assets.js';
import { WEAPONS } from './weapons.js';

// ---------------------------------------------------------------- materials
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const metalTex = surface('metal', 9);
  MAT = {
    paint: new THREE.MeshStandardMaterial({ color: 0x2e3135, roughness: 0.55, metalness: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.32, metalness: 0.85, normalMap: metalTex.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.42, metalness: 0.75 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.78, metalness: 0.05 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161617, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9a5a2c, roughness: 0.5, metalness: 0.0, map: surface('crate', 7).map }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1a24, roughness: 0.05, metalness: 0.2, clearcoat: 1, transmission: 0 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x5a86a8, roughness: 0.05, metalness: 0.9, emissive: 0x0a1822 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xc4c8cd, roughness: 0.18, metalness: 1.0 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb58a3a, roughness: 0.3, metalness: 1.0 }),
    cord: new THREE.MeshStandardMaterial({ color: 0x3b3a30, roughness: 0.9 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.7 }),
    horn: new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.35, metalness: 0.05 }),
  };
  return MAT;
}

// ---------------------------------------------------------------- helpers
// Path mini-language: ['M',x,y] ['L',x,y] ['Q',cx,cy,x,y] ['C',c1x,c1y,c2x,c2y,x,y] ['A',cx,cy,r,a0,a1,ccw]
function path(cmds, target = new THREE.Shape()) {
  for (const c of cmds) {
    switch (c[0]) {
      case 'M': target.moveTo(c[1], c[2]); break;
      case 'L': target.lineTo(c[1], c[2]); break;
      case 'Q': target.quadraticCurveTo(c[1], c[2], c[3], c[4]); break;
      case 'C': target.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]); break;
      case 'A': target.absarc(c[1], c[2], c[3], c[4], c[5], !!c[6]); break;
    }
  }
  return target;
}

function holeFrom(cmds) { return path(cmds, new THREE.Path()); }

// Extruded side profile, centred on z (width), with rounded edges.
function profile(cmds, width, mat, part = 'skin', { bevel = 0.004, holes = [], z = 0, segs = 3, curveSegs = 16 } = {}) {
  const shape = path(cmds);
  for (const h of holes) shape.holes.push(holeFrom(h));
  const b = Math.min(bevel, width * 0.45);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, width - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9,
    bevelSegments: segs, curveSegments: curveSegs,
  });
  g.translate(0, 0, -width / 2 + b + z);
  g.computeVertexNormals();
  return mesh(g, mat, part);
}

// Round part along X from x0 to x1, profile = [[x, r], ...] absolute x positions.
function lathe(pts, y, mat, part = 'metal', { z = 0, seg = 28 } = {}) {
  const v = pts.map(([x, r]) => new THREE.Vector2(Math.max(0.0001, r), x));
  const g = new THREE.LatheGeometry(v, seg);
  g.rotateZ(-Math.PI / 2);         // lathe axis Y → X
  g.translate(0, y, z);
  return mesh(g, mat, part);
}

function tube(x0, x1, r, y, mat, part = 'metal', z = 0, seg = 24) {
  return lathe([[x0, 0], [x0, r * 0.92], [x0 + r * 0.08, r], [x1 - r * 0.08, r], [x1, r * 0.92], [x1, 0]], y, mat, part, { z, seg });
}

function rbox(w, h, d, x, y, z, mat, part = 'skin', r = 0.004) {
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
  g.translate(x, y, z);
  return mesh(g, mat, part);
}

function cylZ(r, len, x, y, z, mat, part = 'metal', seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2); g.translate(x, y, z);
  return mesh(g, mat, part);
}

function mesh(g, mat, part) {
  const m = new THREE.Mesh(g, mat);
  m.userData.part = part;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Toothed rail along the top: a strip with regular slots.
function rail(x0, x1, y, width, mat, pitch = 0.01) {
  const cmds = [['M', x0, y]];
  for (let x = x0; x < x1 - pitch; x += pitch) {
    cmds.push(['L', x + pitch * 0.15, y + 0.007], ['L', x + pitch * 0.55, y + 0.007], ['L', x + pitch * 0.7, y + 0.004], ['L', x + pitch, y + 0.004]);
  }
  cmds.push(['L', x1, y + 0.007], ['L', x1, y], ['L', x0, y]);
  return profile(cmds, width, mat, 'skin', { bevel: 0.0012, segs: 1 });
}

function triggerAndGuard(g, M, x0, x1, yTop, depth, part = 'skin', mat = M.paint) {
  // guard loop
  const outer = [['M', x0, yTop], ['L', x0, yTop - depth * 0.6], ['Q', x0, yTop - depth, x0 + depth * 0.4, yTop - depth], ['L', x1 - 0.004, yTop - depth], ['Q', x1, yTop - depth, x1, yTop - depth + 0.006], ['L', x1, yTop], ['Z']];
  const t = 0.0045;
  const inner = [['M', x0 + t, yTop], ['L', x1 - t, yTop], ['L', x1 - t, yTop - depth + t + 0.004], ['L', x0 + depth * 0.4, yTop - depth + t], ['Q', x0 + t, yTop - depth + t, x0 + t, yTop - depth * 0.6], ['L', x0 + t, yTop]];
  g.add(profile(outer.filter(c => c[0] !== 'Z'), 0.012, mat, part, { bevel: 0.0015, holes: [inner] }));
  // trigger blade
  const tx = (x0 + x1) / 2 + 0.002;
  g.add(profile([['M', tx - 0.003, yTop], ['Q', tx + 0.004, yTop - depth * 0.45, tx - 0.004, yTop - depth * 0.75], ['L', tx - 0.008, yTop - depth * 0.7], ['Q', tx - 0.002, yTop - depth * 0.45, tx - 0.009, yTop]], 0.006, M.darkSteel, 'metal', { bevel: 0.001 }));
}

function finish(inner, extras = {}) {
  const outer = new THREE.Group();
  inner.rotation.y = Math.PI / 2;          // +X (muzzle) → -Z
  outer.add(inner);
  outer.userData = { ...extras };
  if (extras.muzzle) outer.userData.muzzle = new THREE.Vector3(0, extras.muzzle[1], -extras.muzzle[0]);
  if (extras.grip) outer.userData.grip = new THREE.Vector3(0, extras.grip[1], -extras.grip[0]);
  if (extras.fore) outer.userData.fore = new THREE.Vector3(0, extras.fore[1], -extras.fore[0]);
  outer.userData.inner = inner;
  computeSkinUVs(inner);
  return outer;
}

// Planar side projection so a finish texture wraps the whole gun consistently.
// u runs along the barrel; the texture is 2:1 so v is scaled by 2 to keep texels square.
export function computeSkinUVs(inner) {
  inner.updateMatrixWorld(true);
  const toInner = new THREE.Matrix4();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const list = [];
  inner.traverse(o => { if (o.isMesh && o.userData.part === 'skin') list.push(o); });
  const invInner = inner.matrixWorld.clone().invert();
  for (const m of list) {
    toInner.multiplyMatrices(invInner, m.matrixWorld);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(toInner));
  }
  if (box.isEmpty()) return;
  const L = Math.max(box.max.x - box.min.x, 0.01);
  for (const m of list) {
    toInner.multiplyMatrices(invInner, m.matrixWorld);
    const p = m.geometry.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(toInner);
      uv[i * 2] = (v.x - box.min.x) / L;
      uv[i * 2 + 1] = 0.5 + (v.y - (box.min.y + box.max.y) / 2) * 2 / L;
    }
    m.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  inner.userData.skinBounds = { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, L };
}

// ---------------------------------------------------------------- rifles
function ak47() {
  const M = mats(), g = new THREE.Group();
  const P = M.paint, W = M.wood;
  // stamped receiver with rounded dust cover
  g.add(profile([['M', -0.08, -0.008], ['L', 0.235, -0.008], ['L', 0.235, 0.052], ['L', 0.21, 0.058], ['L', -0.02, 0.058],
    ['Q', -0.07, 0.058, -0.08, 0.04], ['Z']].filter(c => c[0] !== 'Z'), 0.046, P, 'skin', { bevel: 0.003 }));
  g.add(profile([['M', -0.06, 0.056], ['L', 0.21, 0.056], ['Q', 0.215, 0.07, 0.2, 0.074], ['L', -0.03, 0.074], ['Q', -0.06, 0.072, -0.06, 0.056]], 0.042, P, 'skin', { bevel: 0.006 }));
  // receiver detail: ejection port, rivets, selector lever on right side
  g.add(rbox(0.07, 0.016, 0.004, 0.08, 0.04, 0.024, M.darkSteel, 'metal', 0.002));
  const sel = profile([['M', -0.05, 0.035], ['L', 0.09, 0.03], ['L', 0.095, 0.022], ['L', 0.0, 0.022], ['L', -0.05, 0.028]], 0.003, M.darkSteel, 'metal', { bevel: 0.0008, z: 0.025 });
  g.add(sel);
  for (const x of [-0.05, 0.0, 0.17, 0.21]) for (const s of [-1, 1]) g.add(cylZ(0.0025, 0.004, x, 0.008, 0.023 * s, M.steel));
  // charging handle
  g.add(cylZ(0.004, 0.03, 0.17, 0.047, 0.03, M.steel));
  // stock (wood)
  g.add(profile([['M', -0.07, 0.042], ['L', -0.37, 0.022], ['Q', -0.405, 0.02, -0.41, -0.005], ['L', -0.415, -0.1], ['Q', -0.41, -0.118, -0.39, -0.116],
    ['L', -0.13, -0.04], ['Q', -0.09, -0.028, -0.07, -0.006]], 0.042, W, 'skin', { bevel: 0.008 }));
  g.add(profile([['M', -0.408, 0.016], ['L', -0.42, 0.016], ['L', -0.425, -0.108], ['L', -0.412, -0.114]], 0.044, M.darkSteel, 'metal', { bevel: 0.003 }));
  // pistol grip (wood, raked back)
  g.add(profile([['M', -0.03, -0.006], ['L', 0.005, -0.006], ['Q', -0.005, -0.06, -0.025, -0.115], ['Q', -0.035, -0.128, -0.055, -0.122], ['L', -0.062, -0.116],
    ['Q', -0.045, -0.06, -0.03, -0.006]], 0.032, W, 'skin', { bevel: 0.007 }));
  triggerAndGuard(g, M, 0.005, 0.07, -0.006, 0.034);
  // curved magazine with ribs
  g.add(profile([['M', 0.082, -0.008], ['L', 0.14, -0.008], ['Q', 0.158, -0.11, 0.215, -0.205], ['L', 0.17, -0.232], ['Q', 0.115, -0.13, 0.082, -0.008]],
    0.034, P, 'skin', { bevel: 0.004 }), );
  g.children.at(-1).name = 'mag';
  // lower handguard with finger groove
  g.add(profile([['M', 0.235, -0.012], ['L', 0.44, -0.004], ['Q', 0.455, 0.0, 0.455, 0.018], ['L', 0.455, 0.045], ['L', 0.235, 0.045], ['L', 0.235, -0.012]],
    0.052, W, 'skin', { bevel: 0.01 }));
  for (let i = 0; i < 3; i++) g.add(rbox(0.05, 0.005, 0.054, 0.28 + i * 0.05, 0.012, 0, M.darkSteel, 'detail', 0.002));
  // upper handguard + gas tube
  g.add(profile([['M', 0.24, 0.05], ['L', 0.43, 0.05], ['Q', 0.445, 0.07, 0.43, 0.08], ['L', 0.25, 0.08], ['Q', 0.235, 0.068, 0.24, 0.05]], 0.038, W, 'skin', { bevel: 0.01 }));
  g.add(tube(0.43, 0.53, 0.011, 0.066, M.darkSteel));
  // rear sight block
  g.add(profile([['M', 0.22, 0.072], ['L', 0.28, 0.072], ['L', 0.28, 0.082], ['L', 0.235, 0.09], ['L', 0.22, 0.086]], 0.03, M.darkSteel, 'metal', { bevel: 0.002 }));
  // barrel, front sight, muzzle brake
  g.add(tube(0.44, 0.7, 0.0105, 0.03, M.darkSteel));
  g.add(profile([['M', 0.52, 0.02], ['L', 0.55, 0.02], ['L', 0.55, 0.075], ['L', 0.53, 0.075], ['L', 0.52, 0.06]], 0.022, M.darkSteel, 'metal', { bevel: 0.002 }));
  g.add(profile([['M', 0.635, 0.018], ['L', 0.66, 0.018], ['L', 0.655, 0.06], ['Q', 0.65, 0.085, 0.645, 0.085], ['L', 0.64, 0.085], ['L', 0.635, 0.06]], 0.02, M.darkSteel, 'metal', { bevel: 0.002 }));
  g.add(lathe([[0.69, 0], [0.69, 0.014], [0.735, 0.0145], [0.742, 0.012], [0.742, 0.006], [0.742, 0]], 0.03, M.darkSteel));
  g.add(cylZ(0.004, 0.001, 0.725, 0.03, 0.0, M.rubber)); // bore hint
  return finish(g, { muzzle: [0.745, 0.03], grip: [-0.025, -0.05], fore: [0.33, 0.0] });
}

function m4a1() {
  const M = mats(), g = new THREE.Group();
  const P = M.paint;
  // upper receiver
  g.add(profile([['M', -0.06, 0.02], ['L', 0.175, 0.02], ['L', 0.175, 0.075], ['L', -0.05, 0.075], ['Q', -0.06, 0.07, -0.06, 0.055]], 0.05, P, 'skin', { bevel: 0.004 }));
  g.add(rail(-0.055, 0.175, 0.075, 0.03, P));
  g.add(rbox(0.06, 0.018, 0.004, 0.07, 0.045, 0.026, M.darkSteel, 'metal', 0.002)); // ejection port cover
  g.add(cylZ(0.008, 0.02, 0.0, 0.055, 0.03, M.darkSteel)); // forward assist
  // lower receiver with magwell
  g.add(profile([['M', -0.06, 0.022], ['L', 0.135, 0.022], ['L', 0.135, -0.015], ['L', 0.115, -0.04], ['L', 0.05, -0.04], ['L', 0.045, -0.015], ['L', -0.035, -0.012], ['Q', -0.06, -0.01, -0.06, 0.01]],
    0.048, P, 'skin', { bevel: 0.004 }));
  // charging handle
  g.add(profile([['M', -0.07, 0.07], ['L', -0.04, 0.07], ['L', -0.04, 0.078], ['L', -0.07, 0.078]], 0.04, M.darkSteel, 'metal', { bevel: 0.002 }));
  // buffer tube + collapsible stock
  g.add(tube(-0.27, -0.055, 0.016, 0.045, M.darkSteel));
  g.add(profile([['M', -0.17, 0.068], ['L', -0.3, 0.068], ['Q', -0.315, 0.066, -0.318, 0.05], ['L', -0.322, -0.07], ['Q', -0.31, -0.08, -0.295, -0.07], ['L', -0.2, 0.0], ['Q', -0.175, 0.02, -0.17, 0.04]],
    0.046, P, 'skin', { bevel: 0.006 }));
  g.add(profile([['M', -0.318, 0.06], ['L', -0.332, 0.06], ['L', -0.336, -0.072], ['L', -0.322, -0.075]], 0.048, M.rubber, 'detail', { bevel: 0.004 }));
  // pistol grip with finger groove
  g.add(profile([['M', -0.022, -0.012], ['L', 0.008, -0.012], ['Q', 0.0, -0.06, -0.012, -0.112], ['Q', -0.018, -0.124, -0.04, -0.12], ['L', -0.048, -0.112],
    ['Q', -0.04, -0.08, -0.03, -0.06], ['Q', -0.034, -0.04, -0.022, -0.012]], 0.03, M.polymer, 'skin', { bevel: 0.006 }));
  triggerAndGuard(g, M, 0.008, 0.06, -0.01, 0.03);
  // STANAG magazine
  const mag = profile([['M', 0.052, -0.035], ['L', 0.112, -0.035], ['Q', 0.122, -0.12, 0.135, -0.195], ['L', 0.078, -0.205], ['Q', 0.064, -0.12, 0.052, -0.035]], 0.028, P, 'skin', { bevel: 0.003 });
  mag.name = 'mag'; g.add(mag);
  // ribbed round handguard
  const hg = [];
  for (let i = 0; i <= 12; i++) { const x = 0.18 + i * 0.019; hg.push([x, 0.028], [x + 0.008, 0.031], [x + 0.016, 0.028]); }
  g.add(lathe([[0.175, 0], [0.175, 0.032], ...hg, [0.41, 0.032], [0.41, 0]], 0.042, P, 'skin', { seg: 20 }));
  g.add(lathe([[0.17, 0], [0.17, 0.036], [0.182, 0.036], [0.182, 0]], 0.042, M.darkSteel)); // delta ring
  // front sight base
  g.add(profile([['M', 0.405, 0.02], ['L', 0.44, 0.02], ['L', 0.44, 0.06], ['L', 0.432, 0.06], ['L', 0.43, 0.115], ['L', 0.418, 0.115], ['L', 0.415, 0.06], ['L', 0.405, 0.06]], 0.024, M.darkSteel, 'metal', { bevel: 0.002 }));
  g.add(rbox(0.012, 0.006, 0.026, 0.424, 0.118, 0, M.darkSteel, 'metal', 0.002));
  // rear flip sight
  g.add(profile([['M', -0.03, 0.083], ['L', 0.0, 0.083], ['L', -0.005, 0.11], ['L', -0.022, 0.11]], 0.026, M.darkSteel, 'metal', { bevel: 0.002 }));
  // barrel + flash hider
  g.add(tube(0.41, 0.58, 0.0095, 0.042, M.darkSteel));
  g.add(lathe([[0.575, 0], [0.575, 0.012], [0.58, 0.0125], [0.625, 0.0125], [0.63, 0.011], [0.63, 0]], 0.042, M.darkSteel));
  for (let i = 0; i < 4; i++) { const s = rbox(0.03, 0.003, 0.03, 0.61, 0.042, 0, M.rubber, 'detail', 0.001); s.rotation.x = i * Math.PI / 4; g.add(s); }
  return finish(g, { muzzle: [0.635, 0.042], grip: [-0.02, -0.05], fore: [0.29, 0.015] });
}

function awp() {
  const M = mats(), g = new THREE.Group();
  const P = M.paint;
  // one-piece thumbhole chassis
  g.add(profile([
    ['M', 0.32, 0.03], ['L', -0.12, 0.03], ['L', -0.14, 0.05], ['Q', -0.3, 0.068, -0.62, 0.062], ['Q', -0.64, 0.06, -0.642, 0.04],
    ['L', -0.65, -0.11], ['Q', -0.64, -0.13, -0.62, -0.126], ['L', -0.3, -0.06], ['Q', -0.2, -0.045, -0.17, -0.1], ['L', -0.15, -0.13],
    ['Q', -0.13, -0.142, -0.105, -0.13], ['L', -0.07, -0.04], ['L', 0.32, -0.035], ['Q', 0.335, -0.03, 0.335, 0.0], ['L', 0.335, 0.015], ['Q', 0.333, 0.03, 0.32, 0.03],
  ], 0.064, P, 'skin', { bevel: 0.01, holes: [[['M', -0.25, 0.03], ['Q', -0.2, 0.04, -0.15, 0.025], ['Q', -0.13, 0.0, -0.15, -0.03], ['Q', -0.2, -0.035, -0.25, -0.03], ['Q', -0.27, 0.0, -0.25, 0.03]]] }));
  g.add(profile([['M', -0.64, 0.058], ['L', -0.665, 0.058], ['L', -0.675, -0.118], ['L', -0.648, -0.124]], 0.066, M.rubber, 'detail', { bevel: 0.005 }));
  // cheek riser
  g.add(profile([['M', -0.33, 0.065], ['L', -0.58, 0.064], ['Q', -0.6, 0.075, -0.58, 0.09], ['L', -0.36, 0.088], ['Q', -0.33, 0.08, -0.33, 0.065]], 0.05, P, 'skin', { bevel: 0.008 }));
  triggerAndGuard(g, M, -0.075, -0.015, -0.035, 0.032, 'skin');
  // receiver + bolt
  g.add(tube(-0.13, 0.17, 0.024, 0.052, M.darkSteel));
  g.add(tube(-0.16, -0.12, 0.015, 0.052, M.steel));
  const bolt = new THREE.Group();
  bolt.add(cylZ(0.004, 0.05, 0, 0, 0.025, M.steel));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), M.darkSteel); knob.position.set(0, 0, 0.052); knob.userData.part = 'metal';
  bolt.add(knob); bolt.position.set(-0.09, 0.05, 0.0); bolt.rotation.x = -0.4; bolt.name = 'bolt'; g.add(bolt);
  // magazine
  const mag = profile([['M', -0.03, -0.035], ['L', 0.06, -0.035], ['L', 0.058, -0.085], ['L', -0.028, -0.085]], 0.044, M.darkSteel, 'metal', { bevel: 0.003 });
  mag.name = 'mag'; g.add(mag);
  // fluted barrel + muzzle brake
  g.add(lathe([[0.16, 0], [0.16, 0.018], [0.25, 0.0165], [0.7, 0.0125], [0.7, 0]], 0.052, M.darkSteel));
  g.add(lathe([[0.695, 0], [0.695, 0.02], [0.78, 0.02], [0.785, 0.017], [0.785, 0]], 0.052, M.darkSteel));
  for (let i = 0; i < 3; i++) g.add(rbox(0.012, 0.045, 0.044, 0.72 + i * 0.022, 0.052, 0, M.rubber, 'detail', 0.002));
  // scope
  const sy = 0.128;
  g.add(lathe([[-0.17, 0], [-0.17, 0.023], [-0.12, 0.024], [-0.1, 0.016], [0.17, 0.016], [0.21, 0.029], [0.27, 0.03], [0.27, 0]], sy, M.darkSteel, 'skin', { seg: 32 }));
  g.add(cylZ(0.022, 0.001, -0.171, sy, 0, M.lens));
  const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.027, 32), M.lens); lensF.rotation.y = Math.PI / 2; lensF.position.set(0.271, sy, 0); lensF.userData.part = 'metal'; g.add(lensF);
  const lensB = new THREE.Mesh(new THREE.CircleGeometry(0.02, 32), M.lens); lensB.rotation.y = -Math.PI / 2; lensB.position.set(-0.171, sy, 0); lensB.userData.part = 'metal'; g.add(lensB);
  g.add(rbox(0.05, 0.034, 0.034, 0.03, sy, 0, M.darkSteel, 'skin', 0.005));
  const turT = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 20), M.darkSteel); turT.position.set(0.03, sy + 0.025, 0); turT.userData.part = 'metal'; g.add(turT);
  g.add(cylZ(0.012, 0.03, 0.03, sy, 0.025, M.darkSteel));
  for (const x of [-0.06, 0.12]) {
    g.add(lathe([[x - 0.01, 0], [x - 0.01, 0.021], [x + 0.01, 0.021], [x + 0.01, 0]], sy, M.darkSteel));
    g.add(rbox(0.02, sy - 0.06, 0.03, x, (sy + 0.06) / 2, 0, M.darkSteel, 'metal', 0.003));
  }
  return finish(g, { muzzle: [0.79, 0.052], grip: [-0.12, -0.06], fore: [0.2, -0.01], scope: true });
}

// ---------------------------------------------------------------- pistols
function pistolBase(g, M, { len, slideH, frameLen, rake, gripLen, slideMat, rounded }) {
  const P = M.paint;
  // slide with rear serrations
  const sTop = 0.016 + slideH;
  g.add(profile([['M', -0.03, 0.016], ['L', len, 0.016], ['L', len, sTop - 0.006], ['Q', len, sTop, len - 0.008, sTop], ['L', -0.024, sTop], ['Q', -0.03, sTop, -0.03, sTop - 0.006]],
    0.028, slideMat || P, 'skin', { bevel: rounded ? 0.007 : 0.0035 }));
  const slide = g.children.at(-1); slide.name = 'slide';
  for (let i = 0; i < 6; i++) slide.add(rbox(0.0025, slideH * 0.7, 0.03, -0.022 + i * 0.006, 0.016 + slideH * 0.5, 0, M.darkSteel, 'detail', 0.0008));
  slide.add(rbox(0.006, 0.006, 0.006, len - 0.01, sTop + 0.003, 0, M.darkSteel, 'metal', 0.001));
  slide.add(rbox(0.008, 0.006, 0.016, -0.018, sTop + 0.003, 0, M.darkSteel, 'metal', 0.001));
  slide.add(rbox(0.03, 0.01, 0.002, 0.04, 0.016 + slideH * 0.6, 0.015, M.darkSteel, 'metal', 0.001)); // ejection port
  g.add(cylZ(0.0055, 0.002, len + 0.0005, 0.03, 0, M.rubber)); // muzzle bore
  // frame with dust-cover rail
  g.add(profile([['M', -0.03, 0.018], ['L', frameLen, 0.018], ['L', frameLen, 0.004], ['L', 0.05, 0.0], ['L', 0.0, -0.002], ['L', -0.035, 0.004], ['Q', -0.04, 0.012, -0.03, 0.018]],
    0.026, M.polymer, 'skin', { bevel: 0.003 }));
  // raked grip with texture panel
  const bx = -0.004, gl = gripLen;
  g.add(profile([['M', bx, 0.0], ['Q', bx - gl * rake * 0.4, -gl * 0.5, bx - gl * rake, -gl], ['L', bx - gl * rake - 0.036, -gl], ['Q', bx - gl * rake - 0.042, -gl * 0.5, -0.038, 0.004], ['L', bx, 0.0]],
    0.03, M.polymer, 'skin', { bevel: 0.006 }));
  const mag = rbox(0.034, 0.008, 0.028, bx - gl * rake - 0.018, -gl - 0.004, 0, M.darkSteel, 'metal', 0.002); mag.name = 'mag'; g.add(mag);
  triggerAndGuard(g, M, -0.002, 0.045, -0.002, 0.026, 'skin', M.polymer);
}

function glock() {
  const M = mats(), g = new THREE.Group();
  pistolBase(g, M, { len: 0.16, slideH: 0.034, frameLen: 0.14, rake: 0.32, gripLen: 0.1 });
  return finish(g, { muzzle: [0.165, 0.03], grip: [-0.02, -0.04], pistol: true });
}

function usp() {
  const M = mats(), g = new THREE.Group();
  pistolBase(g, M, { len: 0.165, slideH: 0.032, frameLen: 0.15, rake: 0.28, gripLen: 0.102, rounded: true });
  // suppressor
  g.add(lathe([[0.165, 0], [0.165, 0.012], [0.172, 0.0175], [0.33, 0.0175], [0.336, 0.014], [0.336, 0]], 0.03, mats().paint, 'skin', { seg: 32 }));
  return finish(g, { muzzle: [0.34, 0.03], grip: [-0.02, -0.04], pistol: true });
}

function deagle() {
  const M = mats(), g = new THREE.Group();
  pistolBase(g, M, { len: 0.2, slideH: 0.046, frameLen: 0.19, rake: 0.2, gripLen: 0.11, slideMat: M.steel });
  // triangular barrel top rib + ports
  g.add(profile([['M', 0.06, 0.062], ['L', 0.2, 0.062], ['L', 0.2, 0.072], ['L', 0.075, 0.072]], 0.012, M.steel, 'skin', { bevel: 0.002 }));
  for (let i = 0; i < 3; i++) g.add(rbox(0.012, 0.004, 0.03, 0.12 + i * 0.022, 0.05, 0, M.darkSteel, 'detail', 0.001));
  return finish(g, { muzzle: [0.2, 0.038], grip: [-0.02, -0.045], pistol: true });
}

// ---------------------------------------------------------------- knives
// Blade = thin lens-shaped extrusion. Origin sits where the hand grips.
function blade(cmds, thick = 0.0045, holes = []) {
  return profile(cmds, thick, mats().blade, 'skin', { bevel: thick * 0.45, segs: 2, holes, curveSegs: 24 });
}

function wrappedHandle(g, x0, x1, h, w, mat, wrapMat, turns = 7) {
  g.add(profile([['M', x0, h / 2], ['L', x1, h / 2], ['Q', x1 + 0.006, 0, x1, -h / 2], ['L', x0, -h / 2], ['Q', x0 - 0.008, 0, x0, h / 2]], w, mat, 'detail', { bevel: w * 0.4 }));
  for (let i = 0; i < turns; i++) {
    const x = x0 + (i + 0.5) * (x1 - x0) / turns;
    const band = rbox(0.008, h + 0.003, w + 0.003, x, 0, 0, wrapMat, 'detail', 0.003);
    band.rotation.z = 0.35; g.add(band);
  }
}

const KNIVES = {
  standard() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.02, 0.012], ['L', 0.15, 0.012], ['Q', 0.19, 0.008, 0.215, -0.004], ['Q', 0.16, -0.018, 0.02, -0.014]]));
    g.add(rbox(0.012, 0.042, 0.02, 0.016, 0, 0, M.darkSteel, 'metal', 0.004));
    g.add(profile([['M', 0.012, 0.014], ['L', -0.1, 0.012], ['Q', -0.11, 0, -0.1, -0.014], ['L', 0.012, -0.015]], 0.022, M.polymer, 'detail', { bevel: 0.008 }));
    return { g, tip: 0.215 };
  },
  bayonet() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.02, 0.013], ['L', 0.17, 0.013], ['L', 0.2, 0.002], ['Q', 0.215, -0.002, 0.225, -0.004], ['Q', 0.17, -0.02, 0.02, -0.016]]));
    g.add(profile([['M', 0.012, 0.03], ['L', 0.022, 0.03], ['L', 0.022, -0.026], ['L', 0.012, -0.026]], 0.024, M.darkSteel, 'metal', { bevel: 0.003 }));
    g.add(lathe([[0.013, 0], [0.013, 0.009], [0.021, 0.009], [0.021, 0]], 0.03, M.darkSteel)); // muzzle ring
    wrappedHandle(g, -0.1, 0.012, 0.028, 0.024, M.polymer, M.rubber, 6);
    g.add(rbox(0.012, 0.03, 0.026, -0.104, 0, 0, M.steel, 'metal', 0.004));
    return { g, tip: 0.225 };
  },
  combat() {
    const M = mats(), g = new THREE.Group();
    const teeth = [];
    for (let x = 0.12; x > 0.05; x -= 0.01) teeth.push(['L', x, 0.019], ['L', x - 0.005, 0.014]);
    g.add(blade([['M', 0.02, -0.018], ['Q', 0.17, -0.02, 0.23, 0.0], ['L', 0.2, 0.014], ['L', 0.13, 0.014], ...teeth, ['L', 0.02, 0.014]], 0.006,
      [[['M', 0.04, -0.002], ['Q', 0.055, 0.004, 0.07, -0.002], ['Q', 0.055, -0.008, 0.04, -0.002]]]));
    g.add(profile([['M', 0.008, 0.032], ['Q', 0.02, 0.028, 0.02, 0.0], ['L', 0.02, -0.03], ['L', 0.008, -0.03]], 0.026, M.darkSteel, 'metal', { bevel: 0.003 }));
    wrappedHandle(g, -0.11, 0.01, 0.03, 0.026, M.polymer, M.rubber, 8);
    return { g, tip: 0.23 };
  },
  karambit() {
    const M = mats(), g = new THREE.Group();
    // hooked blade swept on an arc
    g.add(blade([['M', 0.015, 0.012], ['Q', 0.09, 0.03, 0.13, -0.02], ['Q', 0.14, -0.05, 0.12, -0.075], ['Q', 0.11, -0.04, 0.085, -0.022], ['Q', 0.05, -0.004, 0.015, -0.012]], 0.005));
    // curved handle with finger ring
    g.add(profile([['M', 0.016, 0.014], ['Q', -0.04, 0.02, -0.07, 0.0], ['L', -0.075, -0.012], ['Q', -0.04, 0.0, 0.016, -0.014]], 0.022, M.polymer, 'detail', { bevel: 0.006 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.006, 14, 32), M.darkSteel);
    ring.position.set(-0.088, -0.012, 0); ring.userData.part = 'metal'; g.add(ring);
    g.position.x = 0.03;
    const pivot = new THREE.Group(); pivot.add(g); pivot.name = 'karambitPivot';
    return { g: pivot, tip: 0.17, ring: true };
  },
  butterfly() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.0, 0.01], ['L', 0.15, 0.01], ['Q', 0.18, 0.008, 0.2, -0.002], ['Q', 0.15, -0.015, 0.0, -0.012]], 0.005));
    const mkHandle = (side) => {
      const h = new THREE.Group();
      // channel handle with cut-outs
      h.add(profile([['M', 0.0, 0.0], ['L', -0.125, 0.0], ['Q', -0.132, 0.007, -0.125, 0.013], ['L', 0.0, 0.013]], 0.008, M.steel, 'detail',
        { bevel: 0.002, holes: [[['M', -0.02, 0.004], ['L', -0.05, 0.004], ['L', -0.05, 0.009], ['L', -0.02, 0.009]], [['M', -0.065, 0.004], ['L', -0.1, 0.004], ['L', -0.1, 0.009], ['L', -0.065, 0.009]]] }));
      h.position.set(0.003, side > 0 ? -0.0005 : -0.0125, side * 0.0065);
      h.children[0].position.y = side > 0 ? 0 : 0;
      return h;
    };
    const A = new THREE.Group(); A.name = 'bfA'; A.add(mkHandle(1)); A.position.set(0.0, 0.0, 0);
    const B = new THREE.Group(); B.name = 'bfB'; B.add(mkHandle(-1)); B.position.set(0.0, 0.0, 0);
    g.add(A, B);
    g.add(cylZ(0.004, 0.02, 0.003, 0.0, 0, M.brass));
    return { g, tip: 0.2, butterfly: true };
  },
  flip() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.012, 0.012], ['L', 0.12, 0.014], ['Q', 0.17, 0.01, 0.19, -0.004], ['Q', 0.14, -0.02, 0.012, -0.014]], 0.005,
      [[['M', 0.03, 0.004], ['A', 0.035, 0.004, 0.005, 0, Math.PI * 2]]]));
    g.add(profile([['M', 0.016, 0.014], ['L', -0.095, 0.012], ['Q', -0.108, 0.0, -0.095, -0.014], ['L', 0.016, -0.016], ['Q', 0.024, 0.0, 0.016, 0.014]], 0.02, M.polymer, 'detail', { bevel: 0.006 }));
    g.add(cylZ(0.004, 0.022, 0.008, 0.0, 0, M.steel));
    return { g, tip: 0.19 };
  },
  gut() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.012, 0.014], ['L', 0.08, 0.016], ['Q', 0.09, 0.0, 0.1, 0.012], ['L', 0.11, 0.02], ['Q', 0.16, 0.02, 0.185, -0.002], ['Q', 0.13, -0.022, 0.012, -0.016]], 0.005));
    wrappedHandle(g, -0.1, 0.012, 0.028, 0.022, M.polymer, M.rubber, 5);
    g.add(rbox(0.01, 0.034, 0.024, 0.012, 0, 0, M.darkSteel, 'metal', 0.003));
    return { g, tip: 0.185 };
  },
  bowie() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.02, 0.016], ['L', 0.17, 0.016], ['L', 0.21, 0.008], ['Q', 0.24, 0.002, 0.255, -0.002], ['Q', 0.2, -0.026, 0.02, -0.02]], 0.006));
    g.add(profile([['M', 0.012, 0.03], ['Q', 0.02, 0.034, 0.024, 0.03], ['L', 0.024, -0.034], ['Q', 0.02, -0.038, 0.012, -0.034]], 0.024, M.brass, 'metal', { bevel: 0.003 }));
    g.add(profile([['M', 0.012, 0.016], ['Q', -0.05, 0.022, -0.105, 0.014], ['Q', -0.118, 0.0, -0.105, -0.02], ['Q', -0.05, -0.022, 0.012, -0.02]], 0.024, M.wood, 'detail', { bevel: 0.008 }));
    g.add(rbox(0.012, 0.036, 0.026, -0.11, -0.003, 0, M.brass, 'metal', 0.005));
    return { g, tip: 0.255 };
  },
  push() {
    const M = mats(), g = new THREE.Group();
    // T-handle held in the fist; blade sticks out between fingers
    g.add(blade([['M', 0.0, 0.016], ['L', 0.06, 0.012], ['Q', 0.1, 0.004, 0.12, 0.0], ['Q', 0.1, -0.004, 0.06, -0.012], ['L', 0.0, -0.016]], 0.005));
    g.add(profile([['M', -0.012, 0.045], ['Q', 0.004, 0.05, 0.004, 0.03], ['L', 0.004, -0.03], ['Q', 0.004, -0.05, -0.012, -0.045], ['Q', -0.022, 0, -0.012, 0.045]], 0.026, M.polymer, 'detail', { bevel: 0.008 }));
    return { g, tip: 0.12 };
  },
  navaja() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.012, 0.008], ['Q', 0.12, 0.016, 0.22, 0.006], ['Q', 0.12, -0.016, 0.012, -0.01]], 0.004));
    g.add(profile([['M', 0.016, 0.01], ['Q', -0.06, 0.02, -0.13, -0.004], ['Q', -0.136, -0.016, -0.124, -0.02], ['Q', -0.06, -0.006, 0.016, -0.012]], 0.018, M.horn, 'detail', { bevel: 0.006 }));
    g.add(lathe([[0.008, 0], [0.008, 0.012], [0.02, 0.011], [0.02, 0]], 0.0, M.brass));
    return { g, tip: 0.22 };
  },
  stiletto() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.015, 0.008], ['L', 0.21, 0.004], ['Q', 0.225, 0.0, 0.232, 0.0], ['Q', 0.225, -0.002, 0.21, -0.004], ['L', 0.015, -0.008]], 0.004));
    g.add(rbox(0.01, 0.028, 0.016, 0.012, 0, 0, M.steel, 'metal', 0.003));
    g.add(profile([['M', 0.008, 0.012], ['L', -0.11, 0.01], ['Q', -0.118, 0, -0.11, -0.01], ['L', 0.008, -0.012]], 0.016, M.horn, 'detail', { bevel: 0.006 }));
    g.add(rbox(0.012, 0.022, 0.018, -0.114, 0, 0, M.steel, 'metal', 0.004));
    return { g, tip: 0.232 };
  },
  kukri() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.015, 0.014], ['Q', 0.12, 0.03, 0.24, -0.025], ['Q', 0.245, -0.045, 0.22, -0.045], ['Q', 0.14, -0.05, 0.05, -0.02], ['L', 0.035, -0.024], ['L', 0.03, -0.016], ['L', 0.015, -0.014]], 0.007));
    g.add(rbox(0.008, 0.04, 0.026, 0.012, 0, 0, M.brass, 'metal', 0.003));
    g.add(profile([['M', 0.008, 0.016], ['Q', -0.05, 0.022, -0.1, 0.012], ['Q', -0.122, 0.0, -0.11, -0.022], ['Q', -0.05, -0.012, 0.008, -0.016]], 0.026, M.wood, 'detail', { bevel: 0.009 }));
    return { g, tip: 0.24 };
  },
  tanto() {
    const M = mats(), g = new THREE.Group();
    g.add(blade([['M', 0.015, 0.014], ['L', 0.19, 0.014], ['L', 0.215, 0.002], ['L', 0.195, -0.016], ['L', 0.015, -0.016]], 0.006));
    g.add(profile([['M', 0.006, 0.026], ['Q', 0.018, 0.03, 0.018, 0.0], ['Q', 0.018, -0.03, 0.006, -0.03]], 0.03, M.darkSteel, 'metal', { bevel: 0.004 }));
    wrappedHandle(g, -0.12, 0.006, 0.028, 0.022, M.polymer, M.cord, 9);
    return { g, tip: 0.215 };
  },
  survival() {
    const M = mats(), g = new THREE.Group();
    const teeth = [];
    for (let x = 0.11; x > 0.04; x -= 0.009) teeth.push(['L', x, 0.019], ['L', x - 0.0045, 0.014]);
    g.add(blade([['M', 0.012, -0.016], ['Q', 0.15, -0.018, 0.195, 0.002], ['L', 0.16, 0.014], ['L', 0.115, 0.014], ...teeth, ['L', 0.012, 0.014]], 0.006));
    g.add(profile([['M', 0.012, 0.016], ['L', -0.1, 0.014], ['L', -0.1, -0.016], ['L', 0.012, -0.018]], 0.012, M.darkSteel, 'metal', { bevel: 0.002 }));
    wrappedHandle(g, -0.098, 0.006, 0.024, 0.02, M.cord, M.cord, 11);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, 10, 20), M.cord); loop.position.set(-0.112, 0, 0); loop.userData.part = 'detail'; g.add(loop);
    return { g, tip: 0.195 };
  },
};

export { KNIFE_TYPES } from './shared/knives.js';

function knife(type) {
  const k = (KNIVES[type] || KNIVES.standard)();
  return finish(k.g, { muzzle: [k.tip, 0], grip: [-0.04, 0], knifeType: type, butterfly: !!k.butterfly, ring: !!k.ring });
}

// ---------------------------------------------------------------- grenades and the bomb
// Upright throwables (axis = Y) with a fuse, spoon and pull ring.
const NADE_LOOK = {
  he: { body: 0x4a5236, band: 0xc8a032, shape: 'frag' },
  flash: { body: 0x8a9096, band: 0x2a2c30, shape: 'can', holes: true },
  smoke: { body: 0x3e4a3a, band: 0xd8d8d0, shape: 'can' },
  incendiary: { body: 0x7a2a1a, band: 0xe8c02a, shape: 'can' },
  decoy: { body: 0x2a2c30, band: 0xe8632b, shape: 'can', short: true },
  molotov: { body: 0x3a5a2a, band: 0xc8b08a, shape: 'bottle' },
};
function nade(type) {
  const M = mats(), look = NADE_LOOK[type] || NADE_LOOK.he;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: look.body, roughness: 0.6, metalness: 0.25 });
  const band = new THREE.MeshStandardMaterial({ color: look.band, roughness: 0.5, metalness: 0.2 });
  const lathe = (pts, mat, part = 'detail') => mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24), mat, part);
  let top = 0.05;
  if (look.shape === 'frag') {
    g.add(lathe([[0, -0.042], [0.02, -0.04], [0.03, -0.022], [0.033, 0], [0.03, 0.022], [0.02, 0.036], [0.013, 0.042], [0, 0.042]], paint, 'skin'));
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0315 - Math.abs(i - 2.5) * 0.002, 0.0012, 6, 24), paint); r.rotation.x = Math.PI / 2; r.position.y = -0.026 + i * 0.011; g.add(r); }
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0018, 6, 20), band); b.rotation.x = Math.PI / 2; b.position.y = 0.04; g.add(b);
    top = 0.044;
  } else if (look.shape === 'bottle') {
    const glass = new THREE.MeshStandardMaterial({ color: look.body, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 });
    g.add(lathe([[0, -0.07], [0.03, -0.07], [0.032, -0.06], [0.032, 0.02], [0.028, 0.035], [0.012, 0.055], [0.011, 0.085], [0, 0.085]], glass, 'detail'));
    const fuel = new THREE.MeshStandardMaterial({ color: 0x8a5a1a, roughness: 0.2, transparent: true, opacity: 0.7 });
    g.add(lathe([[0, -0.068], [0.029, -0.068], [0.029, 0.0], [0, 0.0]], fuel));
    const rag = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 8, 1, true), new THREE.MeshStandardMaterial({ color: look.band, roughness: 1, side: THREE.DoubleSide }));
    rag.position.y = 0.1; rag.rotation.z = 0.3; g.add(rag);
    g.userData.wick = rag;
    return finish(g, { muzzle: [0, 0.12], grip: [0, -0.02] });
  } else {
    const h = look.short ? 0.075 : 0.1;
    const body = mesh(new THREE.CylinderGeometry(0.023, 0.023, h, 24), paint, 'skin'); g.add(body);
    const bnd = mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.012, 24), band, 'detail'); bnd.position.y = h * 0.25; g.add(bnd);
    if (look.holes) for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const hl = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 8), M.darkSteel, 'metal');
      hl.rotation.z = Math.PI / 2; hl.rotation.y = a; hl.position.set(Math.cos(a) * 0.023, -h * 0.2, Math.sin(a) * 0.023); g.add(hl);
    }
    top = h / 2;
  }
  // fuse, spoon and ring
  const fuse = mesh(new THREE.CylinderGeometry(0.01, 0.011, 0.016, 16), M.steel, 'metal'); fuse.position.y = top + 0.008; g.add(fuse);
  const spoon = rbox(0.007, 0.07, 0.014, -0.022, top - 0.022, 0, M.steel, 'metal', 0.002); spoon.rotation.z = -0.12; g.add(spoon);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0016, 6, 20), M.steel); ring.position.set(0.016, top + 0.012, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
  return finish(g, { muzzle: [0, top + 0.02], grip: [0, -0.02] });
}

function bomb() {
  const M = mats();
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x6a6448, roughness: 0.75 });
  g.add(rbox(0.22, 0.06, 0.13, 0, 0, 0, body, 'skin', 0.006));
  for (const z of [-0.035, 0.035]) g.add(rbox(0.226, 0.066, 0.014, 0, 0, z, M.rubber, 'detail', 0.002));
  const pad = rbox(0.075, 0.012, 0.055, 0.03, 0.035, 0, M.polymer, 'detail', 0.003); g.add(pad);
  const key = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.5 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.add(rbox(0.012, 0.006, 0.01, 0.006 + i * 0.016, 0.043, -0.016 + j * 0.016, key, 'detail', 0.0015));
  const screen = new THREE.MeshStandardMaterial({ color: 0x0e1a0e, emissive: 0x3aff6a, emissiveIntensity: 0.6, roughness: 0.3 });
  g.add(rbox(0.06, 0.006, 0.024, -0.06, 0.034, 0, screen, 'detail', 0.002));
  const wire = (col, z) => { const w = mesh(new THREE.TorusGeometry(0.035, 0.0025, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }), 'detail'); w.position.set(-0.03, 0.03, z); g.add(w); };
  wire(0xc83a2a, -0.05); wire(0x2a5ac8, -0.044); wire(0xe8c02a, 0.05);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 0 }));
  lamp.position.set(-0.095, 0.034, 0.04); g.add(lamp);
  const out = finish(g, { muzzle: [0.11, 0], grip: [-0.07, -0.03], fore: [0.07, -0.03] });
  out.userData.lamp = lamp;
  return out;
}

const BUILDERS = { ak47, m4a1, awp, glock, usp, deagle, c4: bomb, he: () => nade('he'), flash: () => nade('flash'), smoke: () => nade('smoke'),
  molotov: () => nade('molotov'), incendiary: () => nade('incendiary'), decoy: () => nade('decoy') };

// Blender-built model → the same structure the procedural builders produce.
// Material names from Blender decide each part's role and game material.
function fromAsset(key, lod = false) {
  const src = (lod && assets.weaponLods[key]) || assets.weapons[key];
  const M = mats();
  const inner = src.clone(true);
  const anchors = {};
  const byMat = {
    skin_paint: M.paint, skin_wood: M.wood, skin_polymer: M.polymer, skin_tan: new THREE.MeshStandardMaterial({ color: 0x5a6343, roughness: 0.7, metalness: 0.15 }), skin_blade: M.blade,
    metal_steel: M.steel, metal_dark: M.darkSteel, detail_rubber: M.rubber, detail_polymer: M.polymer, detail_lens: M.lens,
    detail_brass: M.brass, detail_cord: M.cord, detail_horn: M.horn, detail_wood: M.wood,
  };
  inner.traverse(o => {
    if (o.isMesh) {
      const name = (o.material?.name || '').replace(/\.\d+$/, '');
      o.userData.part = name.startsWith('skin') ? 'skin' : name.startsWith('metal') ? 'metal' : 'detail';
      o.material = byMat[name] || M.paint;
      o.castShadow = true; o.receiveShadow = true;
    } else {
      const a = /^(muzzle|grip|fore)$/.exec(o.name);
      if (a) anchors[a[1]] = [o.position.x, o.position.y];
    }
  });
  // geometry is shared between clones; give skin meshes their own copy so UVs can be rewritten safely
  inner.traverse(o => { if (o.isMesh && o.userData.part === 'skin') o.geometry = o.geometry.clone(); });
  const type = key.startsWith('knife:') ? key.split(':')[1] : null;
  return finish(inner, {
    muzzle: anchors.muzzle || [0.5, 0], grip: anchors.grip || [0, 0], fore: type ? undefined : anchors.fore,
    pistol: WEAPONS[key]?.type === 'pistol', scope: !!WEAPONS[key]?.scope,
    knifeType: type || undefined, butterfly: type === 'butterfly', ring: type === 'karambit',
  });
}

// opts.lod: the simplified model (other players' hands, dropped weapons)
export function buildGun(id, opts = {}) {
  const key = id.startsWith('knife') ? `knife:${id.split(':')[1] || 'standard'}` : id;
  if (assets.weapons[key]) return fromAsset(key, !!opts.lod);
  if (id.startsWith('knife')) return knife(id.split(':')[1] || 'standard');
  return (BUILDERS[id] || ak47)();
}
