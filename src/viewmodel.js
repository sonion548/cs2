// First-person weapon rendering + animation: bob, sway, kick, deploy, reload
// (left hand to the magazine), bolt/pump cycling, slide lock, inspect, grenade
// wind-up and throw. The arms are solved every frame from shoulders fixed to
// the camera to the weapon's grip points, so they never come apart from the gun.
import * as THREE from 'three';
import { buildGun, armMaterials } from './models.js';
import { applySkinAsync, skinTextureAsync, gloveMaterial, glovePartVisible } from './items/render.js';
import { SKINS } from './items/catalog.js';
import { WEAPONS } from './weapons.js';
import { radialTexture } from './textures.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets } from './assets.js';
import { inspectFor, gunInspectFor, samplePose, channelRate, channelRateSmooth, BLUR_TAIL, BS as BALI_END } from './inspects.js';

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
const TAU = Math.PI * 2;
// knife channels that are angles (a whole turn looks the same as none)
const SPIN_CH = new Set(['twirl', 'flip', 'ring', 'bb', 'bh', 'ltwirl', 'rev']);
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
  // push daggers: low fists, the T-bar across the palm and the blade out
  // between the middle and ring fingers, angled up and in with its flat to
  // you, one in each hand
  punch: { tip: V3(-0.35, 0.72, -0.6), edge: V3(-0.93, -0.19, 0.31), k: V3(0, 0, -1), palm: V3(1, 0, 0), pos: V3(0.125, -0.133, -0.25) },
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

// Gun inspects (a turn of the gun to each side) are in inspects.js too.
// Knives have their own inspects, with the hand and fingers moving (inspects.js).
const DEF_GRIP = new THREE.Vector3(0, -0.04, 0.03);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1), ONE = new THREE.Vector3(1, 1, 1);
const _km = new THREE.Matrix4(), _kt = new THREE.Matrix4(), _kr = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _kv = new THREE.Vector3();
const _ge = new THREE.Euler();

// A turn of a knife hand about its own axes (h: the hold): roll about the
// knuckle line, flex about the axis across the hand, yaw about the palm's.
function handTurn(h, roll = 0, flex = 0, yaw = 0) {
  const across = new THREE.Vector3().crossVectors(h.k, h.palm).normalize();
  return new THREE.Quaternion().setFromAxisAngle(h.k, roll || 0)
    .multiply(new THREE.Quaternion().setFromAxisAngle(across, flex || 0))
    .multiply(new THREE.Quaternion().setFromAxisAngle(h.palm, yaw || 0));
}

// A ringed knife's finger ring (karambit, skeleton knife): its centre and the
// direction through its hole, in the knife's own frame. The hole runs along
// the ring's thinnest side.
function ringOf(gun) {
  let ring = null;
  gun.traverse(o => { if (!ring && o.isMesh && /^ring(\.\d+)?$/.test(o.name)) ring = o; });
  if (!ring) return null;
  gun.updateMatrixWorld(true);
  ring.geometry.computeBoundingBox();
  const bb = ring.geometry.boundingBox, size = bb.getSize(new THREE.Vector3());
  const axis = size.x <= size.y && size.x <= size.z ? V3(1, 0, 0) : size.y <= size.z ? V3(0, 1, 0) : V3(0, 0, 1);
  const toGun = gun.matrixWorld.clone().invert().multiply(ring.matrixWorld);
  return { c: bb.getCenter(new THREE.Vector3()).applyMatrix4(toGun), n: axis.transformDirection(toGun) };
}

// A balisong's pin: where its handles turn and the axis, in the knife's frame.
function pinOf(gun, handle) {
  gun.updateMatrixWorld(true);
  const toGun = gun.matrixWorld.clone().invert().multiply(handle.parent.matrixWorld);
  return { p: handle.position.clone().applyMatrix4(toGun), n: V3(0, 0, 1).applyQuaternion(handle.quaternion).transformDirection(toGun) };
}

// how far out from a balisong's pivot the index finger sits between its
// handles in a Chaplin (knife units)
const CROTCH = 0.04;
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
const FX = new THREE.Vector3(1, 0, 0), FY = new THREE.Vector3(0, 1, 0), FQ = new THREE.Quaternion();

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
    // finger bones (three a finger, thumb first) when the arms have them: each
    // segment's resting bend about its own X axis, so a pose can open the
    // hand part way (0 = the modelled grip, 1 = straight) or curl it further
    this.fingers = [];
    for (let fi = 1; fi <= 5; fi++) {
      const segs = [];
      for (let k = 1; k <= 3; k++) {
        const b = root.getObjectByName(`finger${fi}_${k}_${s}`);
        if (!b) break;
        const q0 = b.quaternion.clone();
        const y = FY.clone().applyQuaternion(q0), x = FX.clone().applyQuaternion(q0);
        const py = FY.clone().addScaledVector(x, -x.y);
        if (py.lengthSq() < 1e-8) py.copy(y); else py.normalize();
        const bend = Math.atan2(new THREE.Vector3().crossVectors(py, y).dot(x), py.dot(y));
        // the thumb's base sits at an angle to the hand: only ease it open
        segs.push({ b, q0, bend: fi === 1 && k === 1 ? bend * 0.35 : bend });
      }
      // each segment's length (to the next joint), for putting things on a finger
      for (let k = 0; k < segs.length; k++) segs[k].len = segs[k + 1] ? segs[k + 1].b.position.length() : (segs[k - 1]?.len || 0.02) * 0.8;
      if (segs.length) this.fingers.push(segs);
    }
  }

  // open: 0 keeps the modelled grip, 1 straightens the fingers (one number,
  // or one per finger, thumb first); curl adds a bend in radians per finger
  // (negative lifts it). Cheap enough to call every frame.
  setFingers(open = 0, curl = null) {
    for (let f = 0; f < this.fingers.length; f++) {
      const o = typeof open === 'number' ? open : open[f] || 0, c = curl ? curl[f] || 0 : 0;
      const segs = this.fingers[f];
      for (let k = 0; k < segs.length; k++) {
        const g = segs[k];
        g.b.quaternion.copy(g.q0).multiply(FQ.setFromAxisAngle(FX, -o * g.bend + c * (k ? 1 : 0.7)));
      }
    }
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
        let frameGeo = null;
        arms.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = false; o.frustumCulled = false;
          // the gloves are their own part, so a glove skin can replace them, and
          // so is each kind of construction part on them ('..._glove_knuckle')
          const g = /_glove(?:_([a-z]+))?$/.exec((o.material?.name || '').replace(/\.\d+$/, ''));
          if (!g) return;
          o.gloveBase = o.material; o.gloveKind = g[1] || 'body';
          if (o.gloveKind === 'body') frameGeo = o.geometry;
        });
        arms.traverse(o => { if (o.gloveKind) { o.gloveFrame = frameGeo; o.visible = glovePartVisible(o.gloveKind, team); } });
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

  // Puts a glove skin on both pairs of arms (null: the team's own gloves).
  // The finish is painted off the main thread and swapped in when ready.
  setGloves(item) {
    const def = item && SKINS[item.defId];
    const want = def?.gloves ? `${item.defId}|${item.float}|${item.seed}` : null;
    if (want === this.gloveWant) return;
    this.gloveWant = want;
    const type = def?.gloves ? def.gloveType : this.team;
    const apply = (t) => {
      for (const set of [this.fistArms, this.gunArms]) if (set) set.root.traverse(o => {
        if (!o.gloveBase) return;
        o.visible = glovePartVisible(o.gloveKind, t ? type : this.team);
        o.material = t ? gloveMaterial(t, o.geometry, { base: o.gloveBase, frameGeo: o.gloveFrame, kind: o.gloveKind, type }) : o.gloveBase;
      });
    };
    if (!want) return apply(null);
    skinTextureAsync(item.defId, item.float, item.seed, 1024).then(t => { if (this.gloveWant === want) apply(t); }).catch(() => {});
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
    // knives: their own inspect, the finger ring a karambit or skeleton knife
    // spins on, the pin a balisong's handles turn on, its balance point for tosses
    this.ins = type === 'melee' ? inspectFor(knifeType) : null;
    this.gunIns = type === 'melee' ? null : gunInspectFor(type);
    this.gunPivot = type === 'melee' ? null : this.gunWrist();
    this.ringInfo = type === 'melee' ? ringOf(this.gun) : null;
    this.pin = this.bfA ? pinOf(this.gun, this.bfA) : null;
    // a real balisong's handles turn on pins of their own, one near the edge
    // and one near the spine (the held handle's is this.pin): the blade turns
    // about the held handle's pin and the free handle about its own, which goes
    // round with the blade. pinGap: from the held handle's pin to the other one
    this.pinB = this.bfB ? pinOf(this.gun, this.bfB) : null;
    this.pinGap = this.pinB ? this.pinB.p.clone().sub(this.pin.p).projectOnPlane(this.pin.n) : null;
    if (this.pinGap && this.pinGap.lengthSq() < 1e-8) this.pinGap = null;   // one shared pin
    // a balisong spun round the index finger (a Chaplin): its "ring" is the
    // crotch between the handles, a little out from the pivot, worked out each
    // frame from where the handles are (applyKnifePose); balisongA: the
    // direction the handles lie in from the pivot, open
    this.balisongA = this.pin ? (this.gun.userData.grip || DEF_GRIP).clone().sub(this.gun.userData.muzzle || V3(0, 0, -0.1)).projectOnPlane(this.pin.n).normalize() : null;
    if (!this.ringInfo && this.pin) this.ringInfo = { c: new THREE.Vector3(), n: this.pin.n.clone(), crotch: true };
    // the balisong's latch belongs on a handle, not the blade (it would float off in a flip)
    if (this.bfA && part('latch')) this.bfA.attach(part('latch'));
    this.balance = (this.gun.userData.grip || DEF_GRIP).clone().add(V3(0, 0, -0.04));
    this.setDual(type === 'melee' && knifeType === 'push' ? item || {} : null);
    this.pose = null; this._insFrom = null;
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
  inspect() {
    if (this.deployT < 1 || this.reloadT >= 0 || this.throwT >= 0) return;
    if (this.inspectT >= 0) {
      // a balisong mid-flip (or held out by the ends of its handles) finishes
      // what it's doing: easing it back would swing the handle home through
      // the fingers
      // (or in the air, spinning on a finger, or dropped)
      if (this.pin && this.pose) {
        const off = (a) => Math.abs(a - TAU * Math.round(a / TAU)), P = this.pose;
        if ((P.slide || 0) < -0.002 || off(P.bh || 0) > 0.02 || off(P.bb || 0) > 0.02) return;
        if ((P.free || 0) > 0.01 || Math.abs(P.lift || 0) > 0.002 || (P.ringW || 0) > 0.01 || (P.y || 0) < -0.05) return;
      }
      // pressed again mid-inspect: a knife starts over from the pose it's in
      // (blended, so nothing jumps back to the start); a gun finishes its turn
      if (this.type === 'melee' && this.ins) {
        // the pose as the keys give it (the sway and the spin drive go on top again)
        const from = samplePose(this.ins, Math.min(this.inspectT, this.ins.len), {});
        if (this._insFrom) for (const k in from) from[k] = this.pose?.[k] ?? from[k];
        this._insFrom = from; this._insBlend = 0;
      }
      else if (this.gunIns && this.inspectT < this.gunIns.len - 0.3) return;
    }
    // one balisong inspect in twenty drops the knife (and picks it up);
    // balisongVariant ('drop' / 'normal') forces one
    if (this.knifeType === 'butterfly' && (this.ins === inspectFor('butterfly') || this.ins === inspectFor('butterflyDrop'))) {
      const v = this.balisongVariant || (Math.random() < 1 / 20 ? 'drop' : 'normal');
      this.ins = inspectFor(v === 'drop' ? 'butterflyDrop' : 'butterfly');
    }
    this.inspectT = 0;
  }
  // the count on the weapon's Killscribe (the readout on a gun, the etching on a knife)
  setKillscribe(n) { this.gun?.userData?.killscribe?.set(n); this.dual?.gun?.userData?.killscribe?.set(n); }
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

    // knife swing (push daggers stab straight out, one hand then the other)
    if (this.dual) this.dual.stab = 0;
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 3.2);
      const s = Math.sin((1 - this.swing) * Math.PI);
      if (this.dual) { if (this.swingDir < 0) this.dual.stab = s; else { pos.z -= s * 0.11; rot.x += s * 0.1; } }
      else {
        rot.y += s * 0.9 * this.swingDir; rot.z += s * 0.6 * this.swingDir;
        pos.x -= s * 0.08 * this.swingDir; pos.z -= s * 0.1;
      }
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
    let dropL = 0, P = null, gunInspect = 0;
    const iq = (this._iq ||= new THREE.Quaternion()).identity();
    const gq = (this._gq ||= new THREE.Quaternion()).identity();
    if (this.inspectT >= 0) {
      this.inspectT += dt;
      const T = this.inspectT;
      if (this.type === 'melee' && this.ins && this.knifeHold) {
        // the hand turns about its own axes through the grip; the knife and
        // fingers follow the same pose after the arms are placed
        const Tc = Math.min(T, this.ins.len);
        P = this.pose = samplePose(this.ins, Math.min(T, this.ins.len + BLUR_TAIL), this.pose || {});
        // the second push dagger moves with the view but not with the right hand
        if (this.dual) (this._posL ||= new THREE.Vector3()).copy(pos);
        // restarted mid-inspect: ease from the old pose into the new one (spins
        // take the short way round to an equivalent angle)
        if (this._insFrom) {
          this._insBlend += dt;
          const u = Math.min(1, this._insBlend / 0.3), e = u * u * (3 - 2 * u);
          for (const k of new Set([...Object.keys(this._insFrom), ...Object.keys(P)])) {
            const a = this._insFrom[k] || 0, b = P[k] || 0;
            P[k] = SPIN_CH.has(k) ? a + (b - a - TAU * Math.round((b - a) / TAU)) * e : a + (b - a) * e;
          }
          if (u >= 1) this._insFrom = null;
        }
        // the hand is never quite still while it shows the knife
        const env = Math.min(1, Tc / 0.35, Math.max(0, this.ins.len - Tc) / 0.35);
        P.roll = (P.roll || 0) + 0.03 * Math.sin(Tc * 2.3) * env;
        P.flex = (P.flex || 0) + 0.025 * Math.sin(Tc * 1.7 + 1.1) * env;
        pos.y += 0.0012 * Math.sin(Tc * 2.9 + 0.4) * env;
        // a ring spin is kept going by the hand: the wrist circles a little
        // ahead of the knife (in the plane it turns in, the faster it turns
        // the wider) and rocks with it; the index finger pumps (applyHands)
        this.ringDrive = 0;
        if ((P.ringW || 0) > 0.01 && this._ringAxis && this._ringCom) {
          // (by the spin's speed, rounded off through zero so the hand eases
          // through a change of direction instead of snapping round; and not
          // while the knife hangs: a pendulum swings by itself)
          const om = channelRate(this.ins, 'ring', Tc), sa = om * om / Math.sqrt(om * om + 9);
          const w = Math.min(1, P.ringW), k = Math.min(1, sa / 18) * w * w * (3 - 2 * w) * (1 - Math.min(1, P.hang || 0));
          if (k > 0.001) {
            const lead = (this._lead ||= new THREE.Vector3()).crossVectors(this._ringAxis, this._ringCom);
            if (lead.lengthSq() > 1e-12) pos.addScaledVector(lead.normalize(), 0.011 * k * Math.sign(om));
            P.roll += 0.14 * k * Math.sin(P.ring + 0.9);
            P.flex += 0.11 * k * Math.cos(P.ring + 0.9);
            this.ringDrive = k;
          }
        }
        // a balisong's flips come from the wrist, pumping once for each swing:
        // it turns in the plane the parts swing in (about the palm, which
        // faces along the pin) a moment ahead of them, one way to throw the
        // handle round and back the other way to send the blade over, the
        // forearm rocking and the hand bobbing with it
        // (none while the knife is out of the hand: in the air, falling or on a finger)
        if (this.pin) {
          const w = channelRateSmooth(this.ins, 'bh', Tc + 0.04) - 0.8 * channelRateSmooth(this.ins, 'bb', Tc + 0.04);
          const k = Math.tanh(w / 20) * (1 - Math.min(1, Math.max(0, P.free || 0)));
          P.yaw = (P.yaw || 0) - 0.25 * k;
          P.roll = (P.roll || 0) + 0.11 * k;
          pos.y += 0.0035 * k;
        }
        iq.copy(handTurn(this.knifeHold, P.roll, P.flex, P.yaw));
        pos.x += P.x || 0; pos.y += P.y || 0; pos.z += P.z || 0;
        if (T > this.ins.len + BLUR_TAIL) { this.inspectT = -1; P = null; iq.identity(); }
      } else {
        const gi = this.gunIns || gunInspectFor(this.type), end = gi.len;
        const G = this._gpose = samplePose(gi, Math.min(T, end + BLUR_TAIL), this._gpose || {});
        // turned about the grip in the shooting hand (below), so the hand stays
        // where it is and only the moves take it anywhere
        gq.setFromEuler(_ge.set(G.rx || 0, G.ry || 0, G.rz || 0));
        pos.x += G.dx || 0; pos.y += G.dy || 0; pos.z += G.dz || 0;
        // the trigger finger comes off while the gun is turned about
        gunInspect = ease(Math.max(0, Math.min(1, T / 0.3, (end - T) / 0.4)));
        dropL = Math.max(0, Math.min(1, G.drop || 0));
        if (T > end + BLUR_TAIL) { this.inspectT = -1; dropL = 0; gunInspect = 0; }
      }
    }
    if (!P) this.pose = null;

    this.root.position.copy(pos);
    this.root.quaternion.setFromEuler(rot).multiply(this.baseQ || new THREE.Quaternion());
    if (iq.w < 1) {
      // a turn of the hand pivots on the grip, so the fist stays where it is
      const g = (this.gun.userData.grip || DEF_GRIP).clone().multiplyScalar(this.holder.scale.x);
      const before = g.clone().applyQuaternion(this.root.quaternion);
      this.root.quaternion.multiply(iq);
      this.root.position.add(before.sub(g.applyQuaternion(this.root.quaternion)));
    }
    if (gq.w < 1) {
      // a gun inspect's turns are in view space, about the shooting hand's
      // wrist: turning the gun over is all forearm, and the arm reaches no
      // further for it (only the inspect's moves take the hand anywhere)
      const g = (this.gunPivot || DEF_GRIP).clone().multiplyScalar(this.holder.scale.x).applyQuaternion(this.root.quaternion);
      this.root.quaternion.premultiply(gq);
      this.root.position.add(g.clone().sub(g.applyQuaternion(gq)));
    }
    if (this.dual) this.placeDual(P && this._posL ? this._posL : pos, rot, P);
    this.solveArms(handR, magReach, dropL);
    this.applyHands(P, magReach, dropL, gunInspect);
    this.applyKnifePose(P);
  }

  // Push daggers come as a pair: a second one for the left hand, a mirror
  // image of the right (the dagger is symmetric, so the mirrored placement is
  // still a proper turn of the same model). item: the skin for it, or null.
  setDual(item) {
    if (this.dual) { this.scene.remove(this.dual.root); this.dual = null; }
    if (!item) return;
    const root = new THREE.Group(), holder = new THREE.Group();
    holder.scale.setScalar(this.holder.scale.x);
    root.add(holder); this.scene.add(root);
    const gun = buildGun('knife:push');
    if (item.defId) applySkinAsync(gun, item, { size: 1024 });
    gun.traverse(o => { if (o.isMesh) o.castShadow = false; });
    holder.add(gun);
    this.dual = { root, holder, gun, stab: 0 };
  }

  // The left dagger's place this frame: the right hand's pose with the left
  // channels, mirrored across the middle of the view.
  placeDual(pos, rot, P) {
    const d = this.dual, h = this.knifeHold;
    const q = new THREE.Quaternion().setFromEuler(rot).multiply(this.baseQ);
    const turn = P ? handTurn(h, P.lroll, P.lflex, P.lyaw) : null;
    const g = (this.gun.userData.grip || DEF_GRIP).clone().multiplyScalar(this.holder.scale.x);
    const p = pos.clone();
    if (turn) {
      // pivot on the grip, as the right hand does
      const before = g.clone().applyQuaternion(q);
      q.multiply(turn);
      p.add(before.sub(g.clone().applyQuaternion(q)));
    }
    p.z -= d.stab * 0.11;
    const m = new THREE.Matrix4().compose(p, q, ONE);
    m.premultiply(MIRROR).multiply(MIRROR);
    m.decompose(d.root.position, d.root.quaternion, d.root.scale);
    if (P) { d.root.position.x += P.lx || 0; d.root.position.y += P.ly || 0; d.root.position.z += P.lz || 0; }
    const tw = P?.ltwirl || 0;
    const gr = this.gun.userData.grip || DEF_GRIP;
    d.gun.quaternion.setFromAxisAngle(AXIS_Z, tw);
    d.gun.position.copy(gr).sub(gr.clone().applyQuaternion(d.gun.quaternion));
  }

  // The fingers: inspect poses (open, the travelling roll), the grip
  // closing as a weapon is drawn, a grenade let go, the support hand opening
  // to let go of a pistol or to take and seat a magazine.
  applyHands(P, magReach, dropL, gunInspect) {
    if (!this.skinned || !this.armR.fingers?.length) return;
    let R = [0, 0, 0, 0, 0], L = [0, 0, 0, 0, 0], cR = null, cL = null;
    if (P) {
      const th = P.th || 0, ix = P.ix || 0, mi = P.mi || 0, rp = P.rp || 0;
      R = [th, ix, mi, mi * 0.95 + rp, mi * 0.9 + rp];
      if (P.wave) { const ph = this.inspectT * 10; cR = [0, 1, 2, 3, 4].map(i => (i ? P.wave * Math.sin(ph - i * 0.95) : P.wave * 0.4 * Math.sin(ph))); }
      // ring spins: the index finger pumps with each turn of the knife
      if (this.ringDrive > 0) { cR ||= [0, 0, 0, 0, 0]; cR[1] += 0.38 * this.ringDrive * Math.sin(P.ring + 1.4); }
      if (this.dual) { L = R.slice(); cL = cR; }
    }
    if (gunInspect > 0) R[1] = Math.max(R[1], 0.32 * gunInspect);      // trigger finger off the gun while it's turned over
    if (this.type === 'grenade' && this.throwT >= 0) R = R.map(() => Math.min(1, Math.max(0, (this.throwT - 0.1) / 0.1)));
    if (this.deployT < 1) { const o = (1 - this.deployT) * 0.6; R = R.map(v => Math.max(v, o)); }
    if (dropL > 0) L = L.map(v => Math.max(v, dropL * 0.75));
    if (this.reloadT >= 0 && magReach > 0) {
      const f = this.reloadT / this.reloadDur;
      const o = f < 0.3 ? 0.65 * Math.min(1, (f - 0.12) / 0.12) : f < 0.62 ? 0 : f < 0.78 ? 0.5 : 0;
      L = L.map(v => Math.max(v, o));
    }
    this.armR.setFingers(R, cR);
    this.armL.setFingers(L, cL);
  }

  // Where the knife sits in the hand this frame: twirled in the fingers,
  // tossed end over end, a balisong's blade and free handle swung round the
  // pin (the handle in the palm stays put), or a ringed knife moved onto the
  // index finger and spun round it. The hand itself follows the holder.
  applyKnifePose(P) {
    const g = this.gun;
    if (!g || this.type !== 'melee') return;
    const grip = g.userData.grip || DEF_GRIP;
    const m = _km.identity();
    if (P) {
      // (the pin is in the knife's own frame, so its turn goes on first: a
      // balisong's blade and handles are set against each other, then the
      // whole knife is tossed end over end, twirled or slid as one piece)
      if (this.pin) {
        const bb = P.bb || 0, bh = P.bh || 0, pv = this.pin.p;
        if (bb) m.premultiply(_kt.makeTranslation(-pv.x, -pv.y, -pv.z)).premultiply(_kr.makeRotationAxis(this.pin.n, bb)).premultiply(_kt.makeTranslation(pv.x, pv.y, pv.z));
        this.bfA.rotation.z = -bb; this.bfB.rotation.z = bh - bb;
        if (this.pinGap) {
          // With a pin for each handle the held handle is only half of the
          // bar, and which half depends on whether the knife is open or shut
          // (shut, the other handle has come round to its other side). In the
          // fist the whole bar is held, so it's kept centred there; held out
          // by the end of the handle for the flips (slide), only the held
          // handle is, so that is centred in the pinch.
          const w = 1 - Math.min(1, Math.max(0, (P.slide || 0) / BALI_END));
          const half = _kv.copy(this.pinGap).multiplyScalar(0.5);
          const fist = half.clone().sub(half.clone().applyAxisAngle(this.pin.n, bb));
          const off = fist.multiplyScalar(w).addScaledVector(half, 1 - w);
          m.premultiply(_kt.makeTranslation(off.x, off.y, off.z));
        }
      }
      if (P.flip) m.premultiply(_kt.makeTranslation(-this.balance.x, -this.balance.y, -this.balance.z)).premultiply(_kr.makeRotationX(P.flip)).premultiply(_kt.makeTranslation(this.balance.x, this.balance.y, this.balance.z));
      // end over end about the grip, in the hand (a flip to a reverse grip and back)
      if (P.rev) m.premultiply(_kt.makeTranslation(-grip.x, -grip.y, -grip.z)).premultiply(_kr.makeRotationX(P.rev)).premultiply(_kt.makeTranslation(grip.x, grip.y, grip.z));
      if (P.twirl) m.premultiply(_kt.makeTranslation(-grip.x, -grip.y, -grip.z)).premultiply(_kr.makeRotationZ(P.twirl)).premultiply(_kt.makeTranslation(grip.x, grip.y, grip.z));
      if (P.slide) m.premultiply(_kt.makeTranslation(0, 0, P.slide));
      if (P.kx || P.ky) m.premultiply(_kt.makeTranslation(P.kx || 0, P.ky || 0, 0));
      if (P.lift) {
        const up = V3(0, P.lift / this.holder.scale.x, 0).applyQuaternion(this.holder.getWorldQuaternion(_kq).invert());
        m.premultiply(_kt.makeTranslation(up.x, up.y, up.z));
      }
    } else if (this.bfA) { this.bfA.rotation.z = 0; this.bfB.rotation.z = 0; }
    m.decompose(g.position, g.quaternion, g.scale);
    if (P && this.ringInfo?.crotch && (P.ringW || 0) > 0.001) {
      // the balisong's crotch: on the line halving the angle between its
      // handles, CROTCH out from the pivot (the finger fits between them there)
      // (with a pin for each handle, the crotch opens from between the two pins)
      const a = this.balisongA, n = this.pin.n;
      this.ringInfo.c.copy(this.pin.p);
      if (this.pinGap) this.ringInfo.c.addScaledVector(this.pinGap, 0.5);
      this.ringInfo.c.addScaledVector(a.clone().applyAxisAngle(n, (P.bh || 0) / 2 - (P.bb || 0)), CROTCH);
    }
    if (P && this.ringInfo && ((P.ringW || 0) > 0.001)) this.ringAttach(P);
    else { this._ringSide = 0; this._hangAng = null; }
  }

  // Ring spin: the knife's ring put round the index finger's middle segment,
  // its hole along the finger, then turned about the finger. ringW blends from
  // the knife in the fist to the knife on the finger.
  ringAttach(P) {
    const bone = this.armR.fingers?.[1]?.[1];
    if (!bone) return;
    const g = this.gun, ri = this.ringInfo;
    this.armSpace.updateMatrixWorld(true);
    g.updateWorldMatrix(true, false);
    const restQ = g.getWorldQuaternion(new THREE.Quaternion()), sc = g.getWorldScale(new THREE.Vector3()).x;
    const cW = ri.c.clone().applyMatrix4(g.matrixWorld);
    const nW = ri.n.clone().transformDirection(g.matrixWorld);
    const fy = V3(0, 1, 0).transformDirection(bone.b.matrixWorld);
    const target = bone.b.getWorldPosition(new THREE.Vector3()).addScaledVector(fy, bone.len * bone.b.getWorldScale(new THREE.Vector3()).x * 0.55);
    // which way the finger goes through the ring is settled once per spin: decided
    // afresh every frame, it flipped whenever the hand's rocking turned the ring
    // side-on to the finger (a half-turn jump of the knife every revolution)
    if (!this._ringSide) this._ringSide = nW.dot(fy) < 0 ? -1 : 1;
    const align = new THREE.Quaternion().setFromUnitVectors(nW.clone().multiplyScalar(this._ringSide), fy);
    const w = Math.min(1, Math.max(0, P.ringW));
    // a fixed path from the fist onto the finger, and the spin about the finger
    // put on top of it (blending to an orientation that already includes the
    // spin took the short way round, which swapped sides mid-turn); the spin
    // angle is taken to the nearest whole turn and eased in as the knife
    // leaves the fist, so it starts and finishes at no turn at all
    const base = restQ.clone().slerp(align.multiply(restQ.clone()), w);
    const ring = P.ring || 0, wrapped = ring - TAU * Math.round(ring / TAU);
    let spin = wrapped * Math.min(1, w / 0.15);
    // hang (0..1): turned about the finger until the knife's weight is straight
    // below it, so a swing (ring) is a pendulum the right way up whatever the
    // hand is doing (measured without the swing, which goes on top: measured
    // with it, the hang took the swing straight back out)
    if (P.hang) {
      const d = this.balance.clone().sub(ri.c).applyQuaternion(base), down = V3(0, -1, 0);
      d.addScaledVector(fy, -d.dot(fy)); down.addScaledVector(fy, -down.dot(fy));
      if (d.lengthSq() > 1e-10 && down.lengthSq() > 1e-10) {
        // kept continuous: let go standing up, its weight is near straight
        // above the finger, where the angle flips between +pi and -pi as the
        // hand moves (the knife jumped as it began to fall); it falls the way
        // it started to
        let ang = Math.atan2(d.clone().cross(down).dot(fy), d.dot(down));
        if (this._hangAng != null) ang += TAU * Math.round((this._hangAng - ang) / TAU);
        this._hangAng = ang;
        spin += Math.min(1, P.hang) * ang;
      }
    }
    const q = new THREE.Quaternion().setFromAxisAngle(fy, spin).multiply(base);
    const c = cW.lerp(target, w);
    const origin = c.sub(ri.c.clone().multiplyScalar(sc).applyQuaternion(q));
    const mw = new THREE.Matrix4().compose(origin, q, new THREE.Vector3(sc, sc, sc));
    // for the hand's drive next frame: the finger's axis, and from the ring
    // to the knife's weight across it
    const com = this.balance.clone().applyMatrix4(mw).sub(ri.c.clone().applyMatrix4(mw));
    this._ringAxis = (this._ringAxis || new THREE.Vector3()).copy(fy);
    this._ringCom = (this._ringCom || new THREE.Vector3()).copy(com).addScaledVector(fy, -com.dot(fy));
    mw.premultiply(this.holder.matrixWorld.clone().invert());
    mw.decompose(g.position, g.quaternion, g.scale);
  }

  // The shooting hand's wrist, in gun units, where solveArms puts it (the
  // grip, the hand's fitted offset, then back along the hand and out from the
  // palm, as in SkinnedArm.solve).
  gunWrist() {
    const t = this.type, grip = this.gun.userData.grip || DEF_GRIP;
    const at = (this.handAt || HAND_AT)[t];
    const fit = this.skinned ? (this.handFit || HAND_FIT)[this.id] : null;
    const off = fit?.R ? V3(fit.R[0], fit.R[1], fit.R[2]) : (at?.R || V3(0, 0, 0));
    const [k0, p0] = GRIP_R[t] || GRIP_R.rifle;
    const fd = pitched(k0, fit?.R?.[3]).clone().normalize();
    const pl = pitched(p0, fit?.R?.[3]).clone();
    pl.sub(fd.clone().multiplyScalar(pl.dot(fd))).normalize();
    return grip.clone().add(off).addScaledVector(fd, -0.066).addScaledVector(pl, -0.025);
  }

  // Hands go where the weapon is this frame; shoulders stay fixed to the camera.
  solveArms(handROverride, magReach, dropL = 0) {
    this.root.updateMatrixWorld(true);
    const ud = this.gun.userData;
    const local = (v) => this.armSpace.worldToLocal(v);
    // grip points through the holder: a knife twirled or tossed in the hand
    // moves on its own, the hand stays where the grip is
    const world = (p) => this.holder.localToWorld(p.clone());
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
    // the second push dagger: the left hand's grip mirrors the right's
    if (this.dual && this.skinned) {
      const d = this.dual;
      d.root.updateMatrixWorld(true);
      const gl = local(d.holder.localToWorld(grip.clone()));
      const qL = this.armSpace.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(d.holder.getWorldQuaternion(new THREE.Quaternion()));
      const h = this.knifeHold, mk = (v) => V3(-v.x, v.y, v.z).applyQuaternion(qL);
      this.armL.visible = true;
      this.armL.solve(SL, gl, new THREE.Vector3(-0.7, -1, 0.25), mk(h.k), mk(h.palm));
      return;
    }
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
