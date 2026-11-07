// First-person weapon rendering + animation: bob, sway, kick, deploy, reload
// (left hand to the magazine), bolt/pump cycling, slide lock, inspect, grenade
// wind-up and throw. The arms are solved every frame from shoulders fixed to
// the camera to the weapon's grip points, so they never come apart from the gun.
import * as THREE from 'three';
import { buildGun, armMaterials } from './models.js';
import { applySkinAsync } from './items/render.js';
import { SKINS } from './items/catalog.js';
import { WEAPONS } from './weapons.js';
import { radialTexture } from './textures.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets } from './assets.js';

const POSE = {
  rifle: new THREE.Vector3(0.1, -0.105, -0.2),
  sniper: new THREE.Vector3(0.095, -0.105, -0.19),
  pistol: new THREE.Vector3(0.08, -0.085, -0.19),
  melee: new THREE.Vector3(0.09, -0.09, -0.17),
  grenade: new THREE.Vector3(0.1, -0.1, -0.18),
  bomb: new THREE.Vector3(0.0, -0.13, -0.24),
};
const poseOf = (type) => POSE[type] || POSE.rifle;
// How each hand holds each kind of weapon, in the weapon's own axes (+x right,
// +y up, -z toward the muzzle): k is the knuckle direction (wrist to knuckles),
// palm the way the palm faces. The same grips are used for third person (rig.js).
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const GRIP_R = {
  rifle: [V3(0, -0.34, -0.94), V3(-1, 0, 0)],          // pistol grip: knuckles forward-down, palm on its right side
  sniper: [V3(0, -0.34, -0.94), V3(-1, 0, 0)],
  pistol: [V3(0, -0.34, -0.94), V3(-1, 0, 0)],
  melee: [V3(0, 0.8, -0.6), V3(-1, 0, 0)],             // forward grip: a vertical fist, blade out of the thumb side
  grenade: [V3(0, 0.6, -0.8), V3(-0.6, 0, -0.4)],
  bomb: [V3(0, -0.2, -1), V3(-1, 0, 0)],
};
// Knives, CS-style: the blade angles across the lower right of the view with
// its tip toward the centre (inward) and up, edge down, back of the hand to you.
// tip / edge are view-space directions (+x right, +y up, -z ahead); k / palm the
// hand frame in the knife's own axes. The karambit is held in a reverse grip
// (blade out of the little-finger side), the push dagger punched forward.
const KNIFE_HOLD = {
  // a fist with the knuckles forward and the palm down; the blade comes out of
  // the thumb side and points in toward the centre, its flat tilted to you
  // (the handle sits diagonally across the palm, as in a real hammer grip)
  forward: { tip: V3(-0.9, 0.25, -0.35), edge: V3(0.38, 0.11, -0.92), k: V3(0, -0.94, -0.34), palm: V3(-1, 0, 0), pos: V3(0.1, -0.1, -0.24) },
  reverse: { tip: V3(-0.42, -0.62, -0.66), edge: V3(-0.5, 0.25, -0.8), k: V3(0, -1, 0), palm: V3(1, 0, 0), pos: V3(0.1, -0.08, -0.24) },
  punch: { tip: V3(-0.42, 0.18, -0.89), edge: V3(0, -1, 0), k: V3(0, 0, -1), palm: V3(0, -1, 0), pos: V3(0.1, -0.11, -0.26) },
};
const KNIFE_STYLE = { karambit: 'reverse', push: 'punch' };
// guns point a touch inward, toward the crosshair
const GUN_YAW = { rifle: 0.05, sniper: 0.04, pistol: 0.04, grenade: 0.0, bomb: 0.0 };

// Where each hand's fingers close, relative to the gun's grip anchor (gun
// units: +x right, +y up, +z back toward you), for the skinned arms.
// The right hand sits far enough back that the back of the grip is inside the
// palm (before, it poked out behind the hand), the web of the hand up under
// the slide; the left hand follows it round.
const HAND_AT = {
  pistol: { R: V3(0.012, 0, 0.034), L: V3(-0.035, -0.036, 0.032) },
};
// Per-gun hand fits, measured by a fitting script: for each hand, an offset
// from its anchor (the grip for the right hand; the foregrip, or the grip on
// pistols, for the left) in gun units, and a pitch of the hand about the gun's
// x axis, chosen so as few hand vertices as possible end up inside the gun
// while the hand stays on its grip (comments: glove vertices inside the gun,
// right then left hand, before and after, out of about 2,550 per hand).
// Guns not listed use the defaults above.
const HAND_FIT = {
  glock: { R: [0.0315, 0.0005, 0.06, 0.1], L: [-0.0435, -0.0295, 0.045, 0.22] },   // clipping 786->1, 256->1
  usp: { R: [0.0315, -0.006, 0.0435, 0.16], L: [-0.0435, -0.028, 0.048, 0.16] },   // clipping 805->83, 281->1
  m1911: { R: [0.034, 0.003, 0.059, 0.08], L: [-0.046, -0.0345, 0.0475, 0.2] },   // clipping 983->12, 349->1
  fiveseven: { R: [0.0315, -0.0035, 0.057, 0.15], L: [-0.051, -0.0395, 0.0245, -0.16] },   // clipping 831->9, 301->34
  vz61: { R: [0.0225, 0.0055, 0.06, 0.16], L: [-0.044, -0.036, 0.039, 0.14] },   // clipping 537->48, 148->0
  deagle: { R: [0.034, -0.004, 0.054, 0.2], L: [-0.0465, -0.028, 0.048, 0.08] },   // clipping 1085->13, 403->18
  revolver: { R: [0.028, 0.007, 0.0515, 0.16], L: [-0.046, -0.0325, 0.035, 0.08] },   // clipping 599->25, 222->1
  mac10: { R: [0.026, -0.0235, -0.018, 0], L: [-0.013, -0.014, 0.004, 0.02] },   // clipping 1374->28, 126->40
  mp5: { R: [0.006, -0.021, -0.0205, 0.08], L: [-0.002, -0.022, 0, -0.16] },   // clipping 937->80, 582->1
  mp7: { R: [0.023, -0.024, -0.024, 0], L: [0.0245, -0.018, 0.004, -0.22] },   // clipping 1244->14, 287->17
  ump45: { R: [0.02, -0.016, -0.0115, -0.08], L: [0.0115, -0.0255, -0.0075, -0.16] },   // clipping 532->14, 722->71
  vector: { R: [0.013, -0.016, -0.014, -0.09], L: [0, -0.026, -0.007, -0.11] },   // clipping 784->69, 530->12
  p90: { R: [-0.04, -0.025, 0.024, 0.25], L: [-0.0075, -0.0095, 0, -0.08] },   // clipping 1004->106, 128->6
  galil: { R: [0.011, -0.023, -0.019, -0.1], L: [0.0055, -0.0245, 0.009, -0.2] },   // clipping 904->62, 774->66
  famas: { R: [0.019, -0.021, -0.016, -0.14], L: [-0.005, -0.0205, -0.0075, -0.12] },   // clipping 1105->119, 576->11
  ak47: { R: [0.02, -0.023, -0.0115, -0.08], L: [0.011, -0.026, 0, -0.24] },   // clipping 951->44, 946->144
  m4a1: { R: [0.015, -0.021, -0.014, 0.14], L: [-0.0095, -0.027, 0, -0.14] },   // clipping 998->242, 865->4
  scarh: { R: [0.0205, -0.025, -0.0115, -0.16], L: [-0.0075, -0.018, 0, -0.23] },   // clipping 762->29, 717->14
  sg550: { R: [0.012, -0.008, -0.0075, 0.1], L: [0.003, -0.0255, -0.001, -0.18] },   // clipping 636->201, 801->89
  aug: { R: [0.02, 0.002, -0.012, 0.18], L: [0.019, -0.016, -0.012, -0.19] },   // clipping 1108->329, 335->8
  scout: { R: [-0.0335, -0.0215, -0.026, -0.03], L: [0.056, -0.004, 0.0045, 0.12] },   // clipping 1479->118, 1235->92
  dmr: { R: [0.0155, -0.008, -0.008, 0.08], L: [-0.008, -0.034, 0.003, -0.24] },   // clipping 782->268, 929->23
  awp: { R: [-0.034, -0.036, -0.032, 0.13], L: [0.045, 0.022, 0, 0.28] },   // clipping 1875->138, 1576->176
  dbarrel: { R: [-0.0075, -0.004, 0.013, 0.01], L: [-0.0025, -0.0295, 0, -0.14] },   // clipping 254->140, 777->3
  pump: { R: [-0.02, -0.0125, 0.002, 0.08], L: [0.012, -0.02, 0, -0.2] },   // clipping 303->87, 668->90
  m1014: { R: [0.0215, -0.0155, -0.01, -0.08], L: [-0.005, -0.025, -0.0005, -0.14] },   // clipping 880->56, 722->5
  m4a1s: { R: [0.015, -0.021, -0.014, 0.14], L: [-0.007, -0.026, 0.008, -0.16] },   // clipping 997->242, 714->6
  negev: { R: [0.0385, -0.016, -0.005, -0.08], L: [0.012, -0.006, -0.0155, -0.21] },   // clipping 1087->61, 294->59
};
const _pitch = new THREE.Quaternion();
const pitched = (v, a) => (a ? v.clone().applyQuaternion(_pitch.setFromAxisAngle(V3(1, 0, 0), a)) : v);

const GRIP_L = {
  rifle: [V3(0.75, 0.15, -0.6), V3(0.35, 0.95, 0)],    // under the handguard, fingers up its right side
  sniper: [V3(0.75, 0.15, -0.6), V3(0.35, 0.95, 0)],
  pistol: [V3(0.25, -0.4, -0.88), V3(1, 0.25, 0)],     // wrapped round the shooting hand, thumbs forward
  mag: [V3(0.2, 0.9, 0.1), V3(1, 0, 0)],
  bomb: [V3(0, -0.2, -1), V3(1, 0, 0)],
};

// Inspect keyframes. Guns: [t, rotX, rotY, rotZ, dx, dy, dz], turns of the
// gun in view space. Knives, one set per grip: [t, roll, flex, 0, dx, dy, dz],
// turns about the hand's own axes through the grip (roll is the forearm
// turning over, flex the wrist bending, which for a knife held across the palm
// turns the flat of the blade to you). All of it stays inside what a wrist and
// forearm can do: the old keys rolled guns 90 degrees and spun knives a full
// turn with the hand attached, which wrung the arms. Showing the other face of
// a blade, the karambit spin and the butterfly flip happen in the fingers.
const INSPECT = {
  default: [
    [0, 0, 0, 0, 0, 0, 0],
    [0.45, 0.06, 0.5, 0.55, -0.075, 0.04, 0.05],
    [1.5, 0.1, 0.58, 0.62, -0.08, 0.045, 0.055],
    [2.05, 0.08, 0.2, -0.6, -0.05, 0.03, 0.035],
    [2.9, 0.1, 0.24, -0.66, -0.05, 0.035, 0.035],
    [3.5, 0, 0, 0, 0, 0, 0],
  ],
  forward: [
    [0, 0, 0, 0, 0, 0, 0],
    [0.4, 0.12, -0.5, 0, -0.09, 0.0585, 0.03],
    [1.2, 0.18, -0.55, 0, -0.0975, 0.065, 0.035],
    [1.65, 0.08, -0.5, 0, -0.09, 0.065, 0.035],
    [2.6, 0.2, -0.56, 0, -0.0975, 0.065, 0.035],
    [3.05, 0.04, -0.1, 0, -0.015, 0.013, 0.005],
    [3.3, 0, 0, 0, 0, 0, 0],
  ],
  reverse: [
    [0, 0, 0, 0, 0, 0, 0],
    [0.4, 0.6, 0.05, 0, -0.09, 0.0585, 0.03],
    [1.6, 0.7, 0.1, 0, -0.0975, 0.065, 0.035],
    [2.5, 0.75, 0.15, 0, -0.09, 0.065, 0.035],
    [3.3, 0, 0, 0, 0, 0, 0],
  ],
  punch: [
    [0, 0, 0, 0, 0, 0, 0],
    [0.45, 0.55, -0.25, 0, -0.09, 0.0585, 0.03],
    [1.4, 0.62, -0.3, 0, -0.0975, 0.065, 0.035],
    [2, -0.35, 0.15, 0, -0.075, 0.052, 0.03],
    [2.8, -0.4, 0.2, 0, -0.075, 0.052, 0.03],
    [3.3, 0, 0, 0, 0, 0, 0],
  ],
};
// forward-grip knives flip half a turn in the fingers to show the other face, then back
const twirlAt = (T) => T < 1.2 ? 0 : T < 1.65 ? Math.PI * ease((T - 1.2) / 0.45) : T < 2.6 ? Math.PI : T < 3.05 ? Math.PI * (1 + ease((T - 2.6) / 0.45)) : 0;
const DEF_GRIP = new THREE.Vector3(0, -0.04, 0.03);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function sampleKeys(keys, t) {
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1].slice(1);
  let i = 0; while (keys[i + 1][0] < t) i++;
  const a = keys[i], b = keys[i + 1];
  let f = (t - a[0]) / (b[0] - a[0]);
  f = f * f * (3 - 2 * f);
  return a.slice(1).map((v, k) => v + (b[k + 1] - v) * f);
}
const ease = (x) => x * x * (3 - 2 * x);
const bump = (x, a, b) => (x <= a || x >= b ? 0 : Math.sin((x - a) / (b - a) * Math.PI));

// One arm: upper arm + forearm (unit cylinders scaled each frame) and a gloved hand.
class Arm {
  constructor(M, side) {
    this.side = side;
    this.group = new THREE.Group();
    const cyl = (r0, r1, mat) => { const g = new THREE.CylinderGeometry(r0, r1, 1, 18, 1); g.translate(0, 0.5, 0); return new THREE.Mesh(g, mat); };
    this.upper = cyl(0.052, 0.046, M.sleeve);
    this.fore = cyl(0.044, 0.034, M.sleeve);
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 18), M.cuff);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.047, 14, 10), M.sleeve);
    this.hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.066, 0.028), M.glove);
    this.hand.add(palm);
    this.fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group();
      const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0078, 0.022, 4, 8), M.glove); seg1.position.y = 0.015;
      const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0072, 0.018, 4, 8), M.glove); seg2.position.y = 0.012;
      const j = new THREE.Group(); j.position.y = 0.03; j.add(seg2);
      f.add(seg1, j); f.userData.j = j;
      f.position.set(-0.018 + i * 0.012, 0.03, 0);
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.008, 0.012), M.knuckle); k.position.set(-0.018 + i * 0.012, 0.028, -0.014);
      this.hand.add(f, k); this.fingers.push(f);
    }
    this.thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.03, 4, 8), M.glove);
    this.thumb.position.set(0.028 * side, 0.01, 0.006); this.thumb.rotation.z = -0.8 * side;
    this.hand.add(this.thumb);
    this.group.add(this.upper, this.fore, this.cuff, this.elbow, this.hand);
    this.group.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }

  // shoulder S, hand target T, elbow pole direction, in the arms' space
  solve(S, T, pole, palmIn, grip = 0.9) {
    const L1 = 0.34, L2 = 0.32;
    const to = T.clone().sub(S);
    let d = to.length();
    const dir = to.clone().normalize();
    let a, h, scale = 1;
    if (d >= L1 + L2 - 1e-3) { scale = d / (L1 + L2 - 1e-3); a = L1 * scale; h = 0; }
    else { d = Math.max(d, Math.abs(L1 - L2) + 1e-3); a = (L1 * L1 - L2 * L2 + d * d) / (2 * d); h = Math.sqrt(Math.max(0, L1 * L1 - a * a)); }
    const pv = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pv, h);
    const W = T.clone().addScaledVector(T.clone().sub(E).normalize(), -0.05);   // wrist sits behind the grip point
    this.place(this.upper, S, E);
    this.place(this.fore, E, W);
    this.elbow.position.copy(E);
    const fd = T.clone().sub(E).normalize();
    this.cuff.position.copy(W); this.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fd);
    this.hand.position.copy(T);
    this.hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fd);
    this.hand.rotateY(palmIn);
    for (const f of this.fingers) { f.rotation.x = grip * 1.1; f.userData.j.rotation.x = grip * 1.2; }
  }

  place(mesh, a, b) {
    const d = b.clone().sub(a);
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    mesh.scale.set(1, d.length(), 1);
  }
}

// Rotation taking the frame (a0, b0) onto (a1, b1): a's line up exactly, b's
// as closely as they can.
const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4();
function basis(m, a, b) {
  const x = a.clone().normalize();
  const y = b.clone().sub(x.clone().multiplyScalar(b.dot(x)));
  if (y.lengthSq() < 1e-10) y.set(0, 0, 1).sub(x.clone().multiplyScalar(x.z));
  y.normalize();
  return m.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y));
}
function mapFrame(a0, b0, a1, b1) {
  basis(_m0, a0, b0); basis(_m1, a1, b1);
  return new THREE.Quaternion().setFromRotationMatrix(_m1.multiply(_m0.transpose()));
}

// One arm of the Blender-built first-person arms: sleeve and glove skinned to
// three free bones (upper arm, forearm, hand) that are placed directly each
// frame: shoulder fixed to the camera, hand on the weapon, elbow toward a pole.
class SkinnedArm {
  constructor(root, side) {
    this.side = side;
    const s = side > 0 ? 'R' : 'L';
    this.bones = ['upperarm', 'forearm', 'hand'].map(n => root.getObjectByName(`${n}_${s}`));
    this.rest = this.bones.map(b => ({ p: b.position.clone(), q: b.quaternion.clone() }));
    const [ru, rf, rh] = this.rest;
    this.L1 = rf.p.distanceTo(ru.p);
    this.L2 = rh.p.distanceTo(rf.p);
    this.u0 = rf.p.clone().sub(ru.p).normalize();
    this.v0 = rh.p.clone().sub(rf.p).normalize();
    this.h0 = new THREE.Vector3(0, 1, 0).applyQuaternion(rh.q);      // wrist toward the knuckles
    this.p0 = new THREE.Vector3(-side, 0, 0);                          // palms face the thighs at rest
    this.n0 = new THREE.Vector3().crossVectors(this.u0, this.v0);
    if (this.n0.lengthSq() < 1e-8) this.n0.set(0, 0, 1);
    this.n0.normalize();
    this._vis = true;
  }

  get reach() { return this.L1 + this.L2; }

  set visible(v) {
    if (v === this._vis) return;
    this._vis = v;
    for (const b of this.bones) b.scale.setScalar(v ? 1 : 1e-4);
  }

  // S shoulder, T the point the fingers close on, pole elbow direction,
  // k knuckle direction (wrist to knuckles) and palm: the hand's frame.
  solve(S, T, pole, k, palm) {
    const ik = (W) => {
      const to = W.clone().sub(S);
      let d = to.length();
      const dir = to.normalize();
      const L = this.L1 + this.L2;
      let k = 1;
      if (d > L * 0.999) { k = Math.min(1.12, d / (L * 0.999)); d = Math.min(d, L * 0.999 * k); }
      const L1 = this.L1 * k, L2 = this.L2 * k;
      d = Math.max(d, Math.abs(L1 - L2) + 1e-3);
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const pv = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
      if (pv.lengthSq() < 1e-8) pv.set(0, -1, 0);
      pv.normalize();
      return { E: S.clone().addScaledVector(dir, a).addScaledVector(pv, h), W: S.clone().addScaledVector(dir, d) };
    };
    // the wrist sits behind and to the back of the hand from where the fingers close
    const fd = k.clone().normalize();
    const pl = palm.clone().sub(fd.clone().multiplyScalar(palm.dot(fd))).normalize();
    const Wt = T.clone().addScaledVector(fd, -0.066).addScaledVector(pl, -0.025);
    const { E, W } = ik(Wt);
    const u = E.clone().sub(S).normalize(), v = W.clone().sub(E).normalize();
    let n = new THREE.Vector3().crossVectors(u, v);
    if (n.lengthSq() < 1e-8) n = new THREE.Vector3().crossVectors(u, pole);
    n.normalize();
    const [bu, bf, bh] = this.bones, [ru, rf, rh] = this.rest;
    bu.position.copy(S); bu.quaternion.copy(mapFrame(this.u0, this.n0, u, n).multiply(ru.q));
    const qh = mapFrame(this.h0, this.p0, fd, pl);
    // the forearm takes most of the hand's roll so the wrist doesn't wring
    const qf = mapFrame(this.v0, this.n0, v, n);
    const pf = this.p0.clone().applyQuaternion(qf);
    const ph = this.p0.clone().applyQuaternion(qh);
    const proj = (x) => x.sub(v.clone().multiplyScalar(x.dot(v))).normalize();
    proj(pf); proj(ph);
    const ang = Math.atan2(new THREE.Vector3().crossVectors(pf, ph).dot(v), pf.dot(ph));
    qf.premultiply(new THREE.Quaternion().setFromAxisAngle(v, ang * 0.7));
    bf.position.copy(E); bf.quaternion.copy(qf.multiply(rf.q));
    bh.position.copy(W); bh.quaternion.copy(qh.multiply(rh.q));
  }
}

export class ViewModel {
  constructor(team, renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    // image-based lighting so metal parts pick up reflections instead of going black
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x8a6a48, 1.8));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sun.position.set(0.4, 1, 0.3);
    this.scene.add(this.sun);
    this.scene.add(new THREE.DirectionalLight(0x9fb4ff, 0.5).translateX(-1));
    this.root = new THREE.Group();
    this.scene.add(this.root);
    // models are built at real-world scale; the viewmodel shows them smaller so
    // they don't cover the screen.
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.55);
    this.root.add(this.holder);
    // arms live outside the animated root so the shoulders stay put
    this.armSpace = new THREE.Group();
    this.armSpace.scale.setScalar(0.55);
    this.scene.add(this.armSpace);
    const key = team === 'CT' ? 'ct' : 't';
    const src = assets.arms?.[key];
    if (src) {
      // two pairs of arms: a closed fist (knives, grenades, the bomb) and hands
      // shaped for guns (index finger along the frame, fingers round the grip)
      const make = (s) => {
        const arms = cloneSkinned(s);
        arms.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
        this.armSpace.add(arms);
        return { root: arms, R: new SkinnedArm(arms, 1), L: new SkinnedArm(arms, -1) };
      };
      this.fistArms = make(src);
      this.gunArms = assets.arms[key + '_gun'] ? make(assets.arms[key + '_gun']) : null;
      this.useArms(this.fistArms);
      this.skinned = true;
    } else {
      const M = armMaterials(team);
      this.armR = new Arm(M, 1); this.armL = new Arm(M, -1);
      this.armSpace.add(this.armR.group, this.armL.group);
    }
    this.team = team;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.18);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2);
    this.scene.add(this.flashLight);
    this.id = null;
    this.t = 0;
    this.kick = 0;
    this.sway = new THREE.Vector2(); this.swayVel = new THREE.Vector2();
    this.bob = 0;
    this.inspectT = -1;
    this.swing = 0; this.swingDir = 1;
    this.deployT = 1;
    this.reloadT = -1; this.reloadDur = 1;
    this.cycleT = -1; this.throwT = -1; this.windT = -1;
  }

  useArms(set) {
    if (!set) return;
    for (const s of [this.fistArms, this.gunArms]) if (s) s.root.visible = s === set;
    this.armR = set.R; this.armL = set.L;
  }

  // id: weapon id; item: equipped inventory item for this weapon (or null).
  setWeapon(id, type, deployTime = 0.5, item = null) {
    if (this.gun) this.holder.remove(this.gun);
    this.id = id; this.type = type;
    if (this.skinned) this.useArms(['melee', 'grenade', 'bomb'].includes(type) ? this.fistArms : (this.gunArms || this.fistArms));
    this.def = WEAPONS[id];
    const knifeType = item?.knife || (item ? SKINS[item.defId]?.knife : null) || 'standard';
    const modelId = id === 'knife' ? `knife:${knifeType}` : id;
    this.knifeType = id === 'knife' ? knifeType : null;
    // resting orientation of the weapon in view (animations rotate on top of it)
    if (type === 'melee') {
      const h = this.knifeHold = KNIFE_HOLD[KNIFE_STYLE[knifeType] || 'forward'];
      this.baseQ = mapFrame(V3(0, 0, -1), V3(0, -1, 0), h.tip, h.edge);
      this.basePos = h.pos;
    } else {
      this.knifeHold = null;
      this.baseQ = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), GUN_YAW[type] ?? 0.05);
      this.basePos = null;
    }
    this.gun = buildGun(modelId);
    if (item?.defId) applySkinAsync(this.gun, item, { size: 1024 });
    this.gun.traverse(o => { if (o.isMesh) o.castShadow = false; });
    this.holder.add(this.gun);
    this.gun.add(this.flash);
    this.flash.position.copy(this.gun.userData.muzzle || new THREE.Vector3());
    this.flash.visible = false;
    const part = (n) => this.gun.getObjectByName(n);
    this.mag = part('mag');
    this.magBase = this.mag ? this.mag.position.clone() : null;
    this.magUp = this.mag && this.mag.position.y > 0.04;   // top-loading magazines lift out upward
    this.slide = part('slide');
    this.slideBase = this.slide ? this.slide.position.x : 0;
    this.bolt = part('bolt'); this.boltBase = this.bolt ? { p: this.bolt.position.clone(), r: this.bolt.rotation.x } : null;
    this.pump = part('pump'); this.pumpBase = this.pump ? this.pump.position.x : 0;
    this.cyl = part('cylinder'); this.cylTurn = 0; this.cylTarget = 0;
    this.bfA = part('bfA'); this.bfB = part('bfB');
    this.kPivot = part('karambitPivot');
    this.twirlA = 0;
    this.deployT = 0; this.deployDur = Math.max(0.2, deployTime);
    this.inspectT = -1; this.reloadT = -1; this.cycleT = -1; this.throwT = -1; this.windT = -1;
    this.gun.visible = true;
    this.empty = false;
    this.shoulders = null;
  }

  fire() {
    this.kick = this.type === 'sniper' || this.type === 'shotgun' ? 1.4 : this.type === 'pistol' ? 0.8 : 0.55;
    this.flash.visible = this.type !== 'melee';
    this.flash.material.rotation = Math.random() * 6.28;
    this.flash.scale.setScalar(0.2 + Math.random() * 0.15);
    this.flashTime = 0.04;
    this.inspectT = -1;
    if (this.type === 'melee') { this.swing = 1; this.swingDir *= -1; }
    if (this.def?.bolt || this.def?.pump) this.cycleT = 0;
    if (this.cyl) this.cylTarget += Math.PI / 3;
  }
  reload(dur) { this.reloadT = 0; this.reloadDur = dur; this.inspectT = -1; }
  cancelReload() { this.reloadT = -1; }
  inspect() { if (this.deployT >= 1 && this.reloadT < 0 && this.throwT < 0) this.inspectT = 0; }
  look(dx, dy) { this.swayVel.x += dx * 0.00012; this.swayVel.y += dy * 0.00012; }
  windup() { this.windT = 0; this.inspectT = -1; }
  throwNade() { this.throwT = 0; this.windT = -1; }
  setEmpty(v) { this.empty = v; }

  update(dt, speed, onGround, aspect, cameraWorld) {
    this.t += dt;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    if (cameraWorld) {
      const inv = cameraWorld.clone().invert();
      this.sun.position.set(0.55, 1, 0.35).transformDirection(inv);
    }
    const pos = (this.basePos || poseOf(this.type)).clone();
    const rot = new THREE.Euler(0, 0, 0);

    // bob
    const moving = onGround ? Math.min(1, speed / 6) : 0;
    this.bob += dt * (6 + speed * 1.2) * (moving > 0.05 ? 1 : 0);
    pos.x += Math.sin(this.bob) * 0.008 * moving;
    pos.y += -Math.abs(Math.cos(this.bob)) * 0.012 * moving;
    if (!onGround) pos.y += 0.01;
    // running lowers and tilts the weapon a little
    if (speed > 5) { const k = Math.min(1, (speed - 5) / 1.5); pos.y -= 0.012 * k; rot.z += 0.12 * k; rot.x -= 0.05 * k; }
    // sway (spring)
    this.swayVel.multiplyScalar(Math.exp(-10 * dt));
    this.sway.add(this.swayVel);
    this.sway.multiplyScalar(Math.exp(-8 * dt));
    this.sway.clampScalar(-0.05, 0.05);
    pos.x -= this.sway.x; pos.y += this.sway.y;
    rot.y += this.sway.x * 2; rot.x += this.sway.y * 1.5;
    pos.y += Math.sin(this.t * 1.6) * 0.002;

    // kick
    this.kick *= Math.exp(-14 * dt);
    pos.z += this.kick * 0.02;
    rot.x += this.kick * 0.09;
    if (this.slide) this.slide.position.x = this.slideBase - (this.empty ? 0.045 : Math.min(this.kick, 0.6) * 0.05);
    if (this.flashTime > 0) { this.flashTime -= dt; if (this.flashTime <= 0) this.flash.visible = false; }
    this.flashLight.intensity = this.flash.visible ? 6 : 0;
    if (this.flash.visible) this.flashLight.position.copy(this.gun.localToWorld(this.gun.userData.muzzle.clone()));

    // revolver cylinder turns one chamber per shot
    if (this.cyl) { this.cylTurn += (this.cylTarget - this.cylTurn) * Math.min(1, dt * 18); this.cyl.rotation.x = this.cylTurn; }

    // bolt / pump cycling after a shot
    let handR = null, handL = null;
    if (this.cycleT >= 0) {
      this.cycleT += dt;
      const dur = this.def.bolt ? 0.9 : 0.5, f = this.cycleT / dur;
      if (f >= 1) { this.cycleT = -1; if (this.bolt) { this.bolt.position.copy(this.boltBase.p); this.bolt.rotation.x = this.boltBase.r; } if (this.pump) this.pump.position.x = this.pumpBase; }
      else if (this.def.bolt && this.bolt) {
        // lift, pull back, push forward, lock down; the right hand works the knob
        const lift = Math.min(1, f / 0.2) * (f < 0.8 ? 1 : 1 - (f - 0.8) / 0.2);
        const back = bump(f, 0.2, 0.8);
        this.bolt.rotation.x = this.boltBase.r + lift * 1.1;
        this.bolt.position.x = this.boltBase.p.x - back * 0.07;
        rot.z += lift * 0.25; rot.x += lift * 0.08;
        handR = this.bolt.getWorldPosition(new THREE.Vector3());
      } else if (this.pump) {
        const back = bump(f, 0, 1);
        this.pump.position.x = this.pumpBase - back * 0.07;
        pos.z += back * 0.012;
      }
    }

    // knife swing
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 3.2);
      const s = Math.sin((1 - this.swing) * Math.PI);
      rot.y += s * 0.9 * this.swingDir; rot.z += s * 0.6 * this.swingDir;
      pos.x -= s * 0.08 * this.swingDir; pos.z -= s * 0.1;
    }

    // grenade: wind up (pin pulled, arm back) and throw
    if (this.windT >= 0) { this.windT += dt; const k = ease(Math.min(1, this.windT / 0.25)); pos.z += 0.08 * k; pos.y += 0.04 * k; rot.x -= 0.5 * k; }
    if (this.throwT >= 0) {
      this.throwT += dt;
      const f = Math.min(1, this.throwT / 0.35);
      pos.z -= Math.sin(f * Math.PI) * 0.18; pos.y += Math.sin(f * Math.PI) * 0.06; rot.x += f * 0.9;
      this.gun.visible = f < 0.35;
    }

    // deploy
    if (this.deployT < 1) {
      this.deployT = Math.min(1, this.deployT + dt / this.deployDur);
      const e = 1 - (1 - this.deployT) ** 3;
      pos.y -= (1 - e) * 0.25; rot.x -= (1 - e) * 0.8;
    }

    // reload: tilt the gun, mag out, left hand fetches a new one and seats it
    let magReach = 0;
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const f = this.reloadT / this.reloadDur;
      if (f >= 1) { this.reloadT = -1; if (this.mag) { this.mag.position.copy(this.magBase); this.mag.visible = true; } }
      else if (this.def?.shellReload) {
        // shell by shell: left hand bobs between belt and loading port
        rot.z += 0.35; pos.y -= 0.02;
        magReach = (Math.sin(this.reloadT * Math.PI * 2 / this.def.reloadTime) * 0.5 + 0.5);
      } else {
        // roll the magazine well toward the support hand, muzzle dipping a little
        const tilt = Math.sin(Math.min(1, f * 1.1) * Math.PI);
        rot.z -= tilt * 0.42; rot.x -= tilt * 0.1; pos.x -= tilt * 0.012; pos.y -= tilt * 0.028;
        if (this.mag) {
          const drop = f < 0.25 ? f / 0.25 : f < 0.45 ? 1 : f < 0.7 ? 1 - (f - 0.45) / 0.25 : 0;
          this.mag.position.copy(this.magBase); this.mag.position.y += (this.magUp ? 0.25 : -0.25) * drop;
          this.mag.visible = !(f > 0.25 && f < 0.42);
          magReach = bump(f, 0.15, 0.78);
        }
      }
    }

    // inspect
    let twirl = 0, dropL = 0;
    const iq = (this._iq ||= new THREE.Quaternion()).identity();
    if (this.inspectT >= 0) {
      const melee = this.type === 'melee', style = melee ? KNIFE_STYLE[this.knifeType] || 'forward' : null;
      const keys = melee ? INSPECT[style] : INSPECT.default;
      this.inspectT += dt;
      const k = sampleKeys(keys, this.inspectT);
      if (melee && this.knifeHold) {
        const h = this.knifeHold, across = new THREE.Vector3().crossVectors(h.k, h.palm).normalize();
        iq.setFromAxisAngle(h.k, k[0]).multiply(new THREE.Quaternion().setFromAxisAngle(across, k[1]));
      } else { rot.x += k[0]; rot.y += k[1]; rot.z += k[2]; }
      pos.x += k[3] * 0.6; pos.y += k[4] * 0.6; pos.z += k[5] * 0.6;
      const T = this.inspectT, end = keys[keys.length - 1][0];
      if (this.bfA) {
        const open = T < 2.8 ? Math.abs(Math.sin(T * Math.PI * 1.2)) : 0;
        this.bfA.rotation.z = open * Math.PI;
        this.bfB.rotation.z = -open * Math.PI;
      }
      if (this.kPivot) this.kPivot.rotation.z = T > 0.4 && T < 1.6 ? ease((T - 0.4) / 1.2) * Math.PI * 4 : 0;
      else if (melee && !this.bfA && style === 'forward') twirl = twirlAt(T);
      // pistols: the support hand lets go while the gun is turned over
      if (this.type === 'pistol') dropL = ease(Math.max(0, Math.min(1, T / 0.35, (end - T) / 0.45)));
      if (T > end) { this.inspectT = -1; twirl = 0; dropL = 0; iq.identity(); if (this.bfA) { this.bfA.rotation.z = 0; this.bfB.rotation.z = 0; } }
    }
    this.setTwirl(twirl);

    this.root.position.copy(pos);
    this.root.quaternion.setFromEuler(rot).multiply(this.baseQ || new THREE.Quaternion());
    if (iq.w < 0.999999) {
      // a turn of the hand pivots on the grip, so the fist stays where it is
      const g = (this.gun.userData.grip || DEF_GRIP).clone().multiplyScalar(this.holder.scale.x);
      const before = g.clone().applyQuaternion(this.root.quaternion);
      this.root.quaternion.multiply(iq);
      this.root.position.add(before.sub(g.applyQuaternion(this.root.quaternion)));
    }
    this.solveArms(handR, magReach, dropL);
  }

  // Spin the knife in the fingers, about its own length through the grip.
  // The hands follow the holder, not the knife, so they stay still.
  setTwirl(a) {
    if (a === (this.twirlA || 0)) return;
    this.twirlA = a;
    const g = this.gun.userData.grip || DEF_GRIP;
    this.gun.quaternion.setFromAxisAngle(AXIS_Z, a);
    this.gun.position.copy(g).sub(g.clone().applyQuaternion(this.gun.quaternion));
  }

  // Hands go where the weapon is this frame; shoulders stay fixed to the camera.
  solveArms(handROverride, magReach, dropL = 0) {
    this.root.updateMatrixWorld(true);
    const ud = this.gun.userData;
    const local = (v) => this.armSpace.worldToLocal(v);
    const world = (p) => this.gun.localToWorld(p.clone());
    const grip = ud.grip || new THREE.Vector3(0, -0.04, 0.03);
    const t = this.type;
    let SR = new THREE.Vector3(0.36, -0.62, 0.52), SL = new THREE.Vector3(-0.52, -0.66, 0.38);
    if (this.skinned) {
      // shoulders sit where real arms of this length reach the gun's resting grips
      this.shoulders ||= this.restShoulders();
      SR = this.shoulders.R; SL = this.shoulders.L;
    }
    const at = (this.handAt || HAND_AT)[t];
    const fit = this.skinned && t !== 'melee' ? (this.handFit || HAND_FIT)[this.id] : null;
    const offR = fit?.R ? V3(fit.R[0], fit.R[1], fit.R[2]) : (at?.R || V3(0, 0, 0));
    let R = local(world(this.skinned ? grip.clone().add(offR) : grip.clone().add(new THREE.Vector3(0.012, -0.01, 0))));
    if (handROverride) R.lerp(local(handROverride.clone()), 0.8);
    if (this.throwT >= 0 || (t === 'grenade' && !this.gun.visible)) R = local(world(grip.clone()));
    // the gun's axes in arm space, so the hands turn with it (kick, reload, inspect, swing);
    // taken from the holder so a knife twirling in the fingers doesn't turn the hand
    const gunQ = this.armSpace.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.holder.getWorldQuaternion(new THREE.Quaternion()));
    const inGun = (v) => v.clone().applyQuaternion(gunQ);
    if (this.skinned) {
      const [k, palm] = t === 'melee' && this.knifeHold ? [this.knifeHold.k, this.knifeHold.palm] : (GRIP_R[t] || GRIP_R.rifle);
      this.armR.solve(SR, R, new THREE.Vector3(0.7, -1, 0.25), inGun(pitched(k, fit?.R?.[3])), inGun(pitched(palm, fit?.R?.[3])));
    } else this.armR.solve(SR, R, new THREE.Vector3(0.6, -1, 0.1), 0.2, t === 'melee' || t === 'grenade' ? 1 : 0.9);
    // left hand: foregrip, pistol support, magazine during reloads, or out of view
    let L = null;
    const offL = fit?.L ? V3(fit.L[0], fit.L[1], fit.L[2]) : null;
    if (ud.fore && t !== 'melee' && t !== 'grenade') L = local(world(ud.fore.clone().add(this.skinned ? offL || new THREE.Vector3(0, -0.006, 0) : new THREE.Vector3(-0.02, -0.025, 0))));
    else if (t === 'pistol') L = local(world(grip.clone().add(this.skinned ? offL || at.L : new THREE.Vector3(-0.024, -0.022, 0.012))));
    if (L && magReach > 0) {
      const magP = this.mag ? local(this.mag.getWorldPosition(new THREE.Vector3())) : L.clone().add(new THREE.Vector3(0, -0.15, 0.08));
      L.lerp(magP, magReach);
    }
    // the support hand drops out of view (pistol inspect)
    if (L && dropL > 0) L.lerp(L.clone().add(new THREE.Vector3(-0.06, -0.42, 0.12)), dropL);
    if (L && dropL > 0.97) L = null;
    if (this.skinned) {
      this.armL.visible = !!L;
      if (L) {
        const [k0, p0] = GRIP_L[t] || GRIP_L.rifle, [k1, p1] = GRIP_L.mag;
        const f = Math.min(1, magReach * 1.4);
        const pl = fit?.L?.[3];
        this.armL.solve(SL, L, new THREE.Vector3(-0.8, -1, 0.15), inGun(pitched(k0, pl).clone().lerp(k1, f)), inGun(pitched(p0, pl).clone().lerp(p1, f)));
      }
      return;
    }
    this.armL.group.visible = !!L;
    if (L) this.armL.solve(SL, L, new THREE.Vector3(-0.6, -1, 0.1), -0.2, 0.85);
  }

  // Grip points with the weapon at rest, in arm space; shoulders go back from
  // them by most of the arm's length, out to the side and down.
  restShoulders() {
    const r = this.root, pos = r.position.clone(), rot = r.rotation.clone();
    r.position.copy(this.basePos || poseOf(this.type)); r.quaternion.copy(this.baseQ || new THREE.Quaternion());
    r.updateMatrixWorld(true);
    const ud = this.gun.userData;
    const local = (v) => this.armSpace.worldToLocal(this.gun.localToWorld(v.clone()));
    const grip = local(ud.grip || new THREE.Vector3(0, -0.04, 0.03));
    const fore = ud.fore ? local(ud.fore) : grip.clone().add(new THREE.Vector3(-0.04, -0.02, 0.02));
    r.position.copy(pos); r.rotation.copy(rot); r.updateMatrixWorld(true);
    const R = grip.clone().addScaledVector(new THREE.Vector3(0.42, -0.5, 0.76).normalize(), this.armR.reach * 0.86);
    const L = (ud.fore ? fore : grip).clone().addScaledVector(new THREE.Vector3(-0.5, -0.42, 0.76).normalize(), this.armL.reach * (ud.fore ? 0.94 : 0.88));
    return { R, L };
  }
}
