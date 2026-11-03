// Skeleton posing for third-person characters: model-space forward
// kinematics, two-bone arm IK onto the held weapon, procedural walk / crouch /
// aim / reload / recoil, and a Verlet ragdoll for dead bodies.
//
// Model space: feet at the origin, character faces -Z, +X is its right.
import * as THREE from 'three';

const ORDER = ['hips', 'spine', 'chest', 'neck', 'head',
  'upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'forearm_R', 'hand_R',
  'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'];
const CHILD = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head',
  upperarm_L: 'forearm_L', forearm_L: 'hand_L', upperarm_R: 'forearm_R', forearm_R: 'hand_R',
  thigh_L: 'shin_L', shin_L: 'foot_L', thigh_R: 'shin_R', shin_R: 'foot_R' };

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const qAxis = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis, a);
const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4();
function basisOf(m, a, b) {
  const x = a.clone().normalize();
  const y = b.clone().sub(x.clone().multiplyScalar(b.dot(x)));
  if (y.lengthSq() < 1e-10) y.set(0, 0, 1);
  y.normalize();
  return m.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y));
}
// rotation taking the frame (a0, b0) onto (a1, b1)
function frameQ(a0, b0, a1, b1) {
  basisOf(_m0, a0, b0); basisOf(_m1, a1, b1);
  return new THREE.Quaternion().setFromRotationMatrix(_m1.multiply(_m0.transpose()));
}

export class Rig {
  constructor(root) {
    this.root = root;
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    this.b = {};
    for (const name of ORDER) {
      const bone = root.getObjectByName(name);
      if (!bone) throw new Error('missing bone ' + name);
      const m = inv.clone().multiply(bone.matrixWorld);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      m.decompose(p, q, s);
      this.b[name] = { bone, restQ: bone.quaternion.clone(), restP: bone.position.clone(), restMQ: q, restMP: p, mq: q.clone(), mp: p.clone() };
    }
    // the hips' parent (armature node) never moves relative to the model
    const par = this.b.hips.bone.parent;
    const pm = inv.clone().multiply(par.matrixWorld);
    this.parentQ = new THREE.Quaternion(); this.parentP = new THREE.Vector3();
    pm.decompose(this.parentP, this.parentQ, new THREE.Vector3());
    this.parentInvQ = this.parentQ.clone().invert();
    // each bone's pointing direction in its own local frame, and its length
    for (const [name, child] of Object.entries(CHILD)) {
      const a = this.b[name], c = this.b[child];
      const d = c.restMP.clone().sub(a.restMP);
      a.len = d.length();
      a.dirLocal = d.normalize().applyQuaternion(a.restMQ.clone().invert());
    }
    for (const end of ['head', 'hand_L', 'hand_R', 'foot_L', 'foot_R']) {
      const a = this.b[end];
      a.dirLocal = new THREE.Vector3(0, 1, 0);   // Blender bones point along their local +Y
      a.len = end === 'head' ? 0.25 : end.startsWith('hand') ? 0.12 : 0.14;
    }
    this.parentOf = {};
    for (const name of ORDER) { const p = this.b[name].bone.parent?.name; this.parentOf[name] = this.b[p] ? p : null; }
  }

  // ---- forward kinematics, parents first
  inherited(name) {
    const p = this.parentOf[name];
    if (!p) return this.parentQ.clone().multiply(this.b[name].restQ);
    return this.b[p].mq.clone().multiply(this.b[name].restQ);
  }
  place(name) {
    const p = this.parentOf[name], b = this.b[name];
    if (p) b.mp.copy(b.restP).applyQuaternion(this.b[p].mq).add(this.b[p].mp);
  }
  // set the bone's model-space rotation and write its local quaternion
  setMQ(name, mq) {
    const b = this.b[name], p = this.parentOf[name];
    b.mq.copy(mq);
    const pq = p ? this.b[p].mq : this.parentQ;
    b.bone.quaternion.copy(_q.copy(pq).invert().multiply(mq));
  }
  // rotate the inherited orientation by a model-space delta
  turn(name, delta) { this.place(name); this.setMQ(name, delta.clone().multiply(this.inherited(name))); }
  rest(name) { this.place(name); this.setMQ(name, this.inherited(name)); }
  // point the bone along a model-space direction, keeping its inherited twist
  aim(name, dir) {
    this.place(name);
    const base = this.inherited(name);
    const cur = this.b[name].dirLocal.clone().applyQuaternion(base);
    this.setMQ(name, _q2.setFromUnitVectors(cur, _v.copy(dir).normalize()).multiply(base));
  }
  setHips(p, q) {
    const b = this.b.hips;
    b.mp.copy(p);
    b.bone.position.copy(_v.copy(p).sub(this.parentP).applyQuaternion(this.parentInvQ));
    this.setMQ('hips', q);
  }
  tip(name) { const b = this.b[name]; return b.dirLocal.clone().applyQuaternion(b.mq).multiplyScalar(b.len).add(b.mp); }

  // Rest-pose hand frames in model space: knuckle direction (wrist to knuckles) and palm
  // direction. The palms face the thighs at rest, a touch forward.
  restHand(side) {
    const h = this.b[`hand_${side}`];
    const k0 = h.dirLocal.clone().applyQuaternion(h.restMQ).normalize();
    const p0 = new THREE.Vector3(side === 'R' ? -1 : 1, 0, -0.15);
    p0.sub(k0.clone().multiplyScalar(p0.dot(k0))).normalize();
    return { k0, p0 };
  }

  // Put a hand round a grip: `grip` is the point the fingers close on, `k` the
  // knuckle direction and `palm` the way the palm faces (model space). The arm
  // reaches the wrist by IK, the hand takes the frame, and the forearm takes
  // most of the roll so the wrist doesn't wring.
  hold(side, grip, k, palm, pole) {
    const ua = `upperarm_${side}`, fa = `forearm_${side}`, hd = `hand_${side}`;
    const kk = k.clone().normalize();
    const pp = palm.clone().sub(kk.clone().multiplyScalar(palm.dot(kk))).normalize();
    const wrist = grip.clone().addScaledVector(kk, -0.068).addScaledVector(pp, -0.026);
    this.reach(side, wrist, pole);
    const { k0, p0 } = this.restHand(side);
    const q = frameQ(k0, p0, kk, pp);
    // forearm roll toward the hand's
    const f = this.b[fa];
    const v = this.b[hd].mp.clone().sub(f.mp).normalize();
    const pf = p0.clone().applyQuaternion(f.mq.clone().multiply(f.restMQ.clone().invert()));
    pf.sub(v.clone().multiplyScalar(pf.dot(v)));
    const ph = pp.clone().sub(v.clone().multiplyScalar(pp.dot(v)));
    if (pf.lengthSq() > 1e-6 && ph.lengthSq() > 1e-6) {
      pf.normalize(); ph.normalize();
      const ang = Math.atan2(_v2.crossVectors(pf, ph).dot(v), pf.dot(ph));
      this.setMQ(fa, qAxis(v, ang * 0.65).multiply(f.mq.clone()));
    }
    this.place(hd);
    this.setMQ(hd, q.multiply(this.b[hd].restMQ.clone()));
  }

  // Two-bone IK: shoulder→elbow→hand reaching `target`, elbow bent toward `pole`.
  reach(side, target, pole) {
    const ua = `upperarm_${side}`, fa = `forearm_${side}`, hd = `hand_${side}`;
    this.place(ua);
    const S = this.b[ua].mp, L1 = this.b[ua].len, L2 = this.b[fa].len;
    const to = target.clone().sub(S);
    let d = to.length();
    d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-3, d));
    const dir = to.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pv = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (pv.lengthSq() < 1e-6) pv.set(0, -1, 0);
    pv.normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pv, h);
    this.aim(ua, E.clone().sub(S));
    this.place(fa);
    const T = S.clone().addScaledVector(dir, d);
    this.aim(fa, T.sub(this.b[fa].mp));
    this.rest(hd);
  }
}

// ---------------------------------------------------------------- live pose
const holdOf = (def) => !def ? 'rifle' : def.type === 'pistol' ? 'pistol' : def.type === 'melee' ? 'melee' : def.type === 'grenade' ? 'grenade' : def.type === 'bomb' ? 'bomb' : 'rifle';

export function poseRig(ch, rig, dt) {
  const st = ch.anim ||= { phase: 0, kick: 0, reload: 0, lean: 0, air: 0 };
  const model = ch.model, gun = ch.gunModel, holder = model.userData.gunHolder;
  const sp = ch.speed2D(), moving = Math.min(1, sp / 4.5);
  st.phase += dt * (3.2 + sp * 1.25) * (sp > 0.3 ? 1 : 0);
  st.kick = Math.max(0, (st.kick || 0) * Math.exp(-dt * 14));
  if (ch.fireKick) { st.kick = Math.min(1, st.kick + ch.fireKick); ch.fireKick = 0; }
  st.air += ((ch.onGround ? 0 : 1) - st.air) * Math.min(1, dt * 10);
  // local-space velocity for strafe lean
  const cy = Math.cos(ch.yaw), sy = Math.sin(ch.yaw);
  const lateral = ch.vel.x * cy - ch.vel.z * sy;
  st.lean += ((-lateral * 0.035) - st.lean) * Math.min(1, dt * 6);
  const c = ch.crouch, busy = ch.planting || ch.defusing;

  // hips: crouch drop, stride bob, strafe lean
  const hips = rig.b.hips;
  const drop = 0.42 * c + (busy ? 0.08 : 0);
  const bob = Math.abs(Math.sin(st.phase)) * 0.035 * moving * (1 - c * 0.5);
  const hp = hips.restMP.clone(); hp.y += -drop + bob - 0.02 * moving;
  rig.setHips(hp, qAxis(Z, st.lean).multiply(qAxis(X, -0.08 * moving - 0.12 * c)).multiply(rig.parentQ.clone().multiply(hips.restQ)));

  // legs: stride swing, knee bend, crouch fold, tucked in the air
  const sw = Math.sin(st.phase) * 0.55 * moving;
  for (const [L, s] of [['L', 1], ['R', -1]]) {
    const swing = sw * s;
    const knee = (0.1 + 0.85 * Math.max(0, Math.sin(st.phase * 1 + (s > 0 ? 0.6 : 0.6 + Math.PI)))) * moving;
    rig.turn(`thigh_${L}`, qAxis(X, swing + 1.05 * c + 0.12 * c * s + 0.5 * st.air));
    rig.turn(`shin_${L}`, qAxis(X, -(knee + 1.95 * c + 0.9 * st.air)));
    rig.turn(`foot_${L}`, qAxis(X, 0.9 * c * 0.9 + Math.max(0, -swing) * 0.3));
  }

  // Upper body. Aim pitch is shared down the spine (torso 70%, neck and head the
  // rest) so the eyes always look where the gun points. Long guns blade the
  // shoulders and sit in the right shoulder pocket, which moves with the chest;
  // pistols are held out in both hands at eye level (isosceles); the knife in a
  // forward grip at chest height with the other hand up as a guard.
  const P = Math.max(-1.0, Math.min(1.0, ch.pitch));
  const def = ch.weapon?.def;
  const hold = holdOf(def);
  const long = !busy && hold === 'rifle';
  st.blade = (st.blade || 0) + ((long ? 1 : 0) - (st.blade || 0)) * Math.min(1, dt * 8);
  const B = st.blade;
  rig.turn('spine', qAxis(Y, -0.2 * B).multiply(qAxis(X, P * 0.3 - 0.04 * moving - (busy ? 0.35 : 0))));
  rig.turn('chest', qAxis(Y, -0.24 * B).multiply(qAxis(X, P * 0.4)));
  rig.turn('neck', qAxis(Y, 0.2 * B).multiply(qAxis(X, P * 0.12)));
  rig.turn('head', qAxis(Y, 0.24 * B).multiply(qAxis(Z, -0.12 * B)).multiply(qAxis(X, P * 0.18 - (busy ? 0.4 : 0))));

  const chest = rig.b.chest;
  const dq = chest.mq.clone().multiply(chest.restMQ.clone().invert());       // how the chest has turned from rest
  const onChest = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(dq).add(chest.mp);
  const aimQ = qAxis(X, P);
  const reloading = ch.weapon?.reloading > 0 && def?.pattern;
  st.reload += ((reloading ? 1 : 0) - st.reload) * Math.min(1, dt * 8);
  const R = st.reload, K = st.kick;
  // weapon orientation: along the aim, rolled and dipped while reloading, kicked up by recoil
  const gq = aimQ.clone().multiply(qAxis(Z, -0.45 * R)).multiply(qAxis(X, -0.25 * R + K * (hold === 'pistol' ? 0.16 : 0.08)));
  const gun3 = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(gq);
  const sh = rig.b.upperarm_R.restMP.clone().sub(chest.restMP);           // right shoulder, chest-relative at rest
  let gripPt = null;
  if (holder) {
    holder.visible = !busy && !!gun;
    holder.quaternion.copy(gq);
    const grip = gun?.userData.grip || new THREE.Vector3();
    if (hold === 'rifle' && gun?.userData.rear) {
      // stock in the shoulder pocket: in from the joint, a little low and in front of it
      const pocket = onChest(sh.x - 0.05, sh.y - 0.035, sh.z - 0.075);
      pocket.z += K * 0.03;
      holder.position.copy(pocket).sub(gun.userData.rear.clone().applyQuaternion(gq));
    } else {
      let hand;
      if (hold === 'pistol') {
        // both arms out, the gun on the centre line just under the eyes
        const head = rig.b.head.mp;
        hand = head.clone().add(new THREE.Vector3(0.025, -0.13 - R * 0.12, -0.44 + K * 0.05 + R * 0.12).applyQuaternion(aimQ));
      } else if (hold === 'melee') hand = onChest(0.2, 0.12, -0.3);
      else if (hold === 'grenade') hand = onChest(0.21, 0.13, -0.24);
      else hand = onChest(0.0, -0.32, -0.3);
      holder.position.copy(hand).sub(grip.clone().applyQuaternion(gq));
    }
    holder.updateMatrix();
    gripPt = gun?.userData.grip ? grip.clone().applyQuaternion(gq).add(holder.position) : null;
  }
  const toModel = (local) => local.clone().applyQuaternion(holder.quaternion).add(holder.position);

  // right hand
  const poleR = new THREE.Vector3(0.7, -0.75, 0.3), poleL = new THREE.Vector3(-0.6, -0.9, 0.15);
  if (busy) {
    rig.hold('R', onChest(0.1, -0.85, -0.42), new THREE.Vector3(0, -0.3, -1), new THREE.Vector3(0, -1, 0), poleR);
  } else if (hold === 'melee') {
    // forward grip, blade out of the thumb side: a vertical fist, knuckles forward and up
    rig.hold('R', gripPt || onChest(0.2, 0.12, -0.3), gun3(0, 0.8, -0.6), gun3(-1, 0, 0), poleR);
  } else if (hold === 'grenade') {
    rig.hold('R', gripPt || onChest(0.21, 0.13, -0.24), gun3(0, 0.6, -0.8), gun3(-0.6, 0, -0.4), poleR);
  } else if (hold === 'bomb') {
    rig.hold('R', gripPt || onChest(0.06, -0.32, -0.3), new THREE.Vector3(0, -0.2, -1), new THREE.Vector3(-1, 0, 0), poleR);
  } else {
    // pistol grip: knuckles forward and a little down, palm against the grip's right side
    rig.hold('R', gripPt || onChest(0.15, -0.1, -0.3), gun3(0, -0.34, -0.94), gun3(-1, 0, 0), poleR);
  }
  // left hand
  if (busy) {
    rig.hold('L', onChest(-0.1, -0.85, -0.42), new THREE.Vector3(0, -0.3, -1), new THREE.Vector3(0, -1, 0), poleL);
  } else if (gun?.userData.fore && hold === 'rifle') {
    let fore = toModel(gun.userData.fore);
    let k = gun3(0.75, 0.15, -0.6), palm = gun3(0.35, 0.95, 0);
    if (R > 0.01) {
      // to the magazine and back
      const mag = gun.getObjectByName('mag');
      const magP = mag ? model.worldToLocal(mag.getWorldPosition(new THREE.Vector3())) : fore.clone().add(new THREE.Vector3(0, -0.12, 0.1));
      const f = Math.sin(Math.min(1, (1 - ch.weapon.reloading / def.reloadTime)) * Math.PI) * R;
      fore = fore.lerp(magP, f);
      k = k.lerp(gun3(0.2, 0.9, 0.1), f); palm = palm.lerp(gun3(1, 0, 0), f);
    }
    rig.hold('L', fore, k, palm, poleL);
  } else if (hold === 'pistol' && gripPt) {
    // support hand wraps the shooting hand, thumbs forward
    rig.hold('L', gripPt.clone().add(gun3(-0.028, -0.012, 0.01)), gun3(0.25, -0.4, -0.88), gun3(1, 0.25, 0), poleL);
  } else if (hold === 'melee') {
    // guard hand up in front of the chest
    rig.hold('L', onChest(-0.12, 0.08, -0.26), new THREE.Vector3(0.1, 0.9, -0.4), new THREE.Vector3(0.6, 0, -0.8), poleL);
  } else if (hold === 'bomb') {
    rig.hold('L', onChest(-0.06, -0.32, -0.3), new THREE.Vector3(0, -0.2, -1), new THREE.Vector3(1, 0, 0), poleL);
  } else {
    // free hand relaxed by the side, swinging a little with the stride
    rig.hold('L', onChest(-0.27, -0.5, -0.06 - 0.08 * Math.sin(st.phase) * moving), new THREE.Vector3(0, -1, -0.15), new THREE.Vector3(1, 0, -0.1), poleL);
  }

  // bomb strapped to the carrier's back
  const back = model.userData.backBomb;
  if (back) {
    back.visible = !!ch.hasBomb && ch.slot !== 5;
    if (back.visible) {
      const dq = chest.mq.clone().multiply(chest.restMQ.clone().invert());
      back.position.copy(chest.mp).add(new THREE.Vector3(0, 0.05, 0.2).applyQuaternion(dq));
      back.quaternion.copy(dq).multiply(qAxis(X, Math.PI / 2));
    }
  }
}

// ---------------------------------------------------------------- ragdoll
const JOINTS = [
  ['pelvis', 'hips', 0], ['chest', 'chest', 0], ['head', 'head', 0.12],
  ['shL', 'upperarm_L', 0], ['elL', 'forearm_L', 0], ['haL', 'hand_L', 0.08],
  ['shR', 'upperarm_R', 0], ['elR', 'forearm_R', 0], ['haR', 'hand_R', 0.08],
  ['hiL', 'thigh_L', 0], ['knL', 'shin_L', 0], ['anL', 'foot_L', 0], ['toL', 'foot_L', 0.13],
  ['hiR', 'thigh_R', 0], ['knR', 'shin_R', 0], ['anR', 'foot_R', 0], ['toR', 'foot_R', 0.13],
];
const LINKS = [['pelvis', 'chest'], ['chest', 'head'], ['chest', 'shL'], ['chest', 'shR'], ['shL', 'shR'], ['pelvis', 'hiL'], ['pelvis', 'hiR'], ['hiL', 'hiR'],
  ['hiL', 'shL'], ['hiR', 'shR'], ['hiL', 'chest'], ['hiR', 'chest'], ['shL', 'head'], ['shR', 'head'],
  ['shL', 'elL'], ['elL', 'haL'], ['shR', 'elR'], ['elR', 'haR'], ['hiL', 'knL'], ['knL', 'anL'], ['anL', 'toL'], ['hiR', 'knR'], ['knR', 'anR'], ['anR', 'toR'],
  ['knL', 'hiR', 'min'], ['knR', 'hiL', 'min'], ['elL', 'chest', 'min'], ['elR', 'chest', 'min']];
const RAD = 0.08;

export function startRagdoll(ch, rig, world, dir) {
  const model = ch.model;
  model.updateMatrixWorld(true);
  const mw = model.matrixWorld;
  const P = {};
  for (const [id, bone, ext] of JOINTS) {
    const p = ext ? rig.tip(bone).sub(rig.b[bone].mp).normalize().multiplyScalar(ext).add(rig.b[bone].mp) : rig.b[bone].mp.clone();
    const w = p.applyMatrix4(mw);
    P[id] = { p: w, o: w.clone() };
  }
  const impulse = (dir || new THREE.Vector3()).clone().setY(0).normalize().multiplyScalar(2.6);
  const v = ch.vel.clone().multiplyScalar(0.7).setY(Math.max(0, ch.vel.y) * 0.5);
  const dt = 1 / 120;
  for (const [id, j] of Object.entries(P)) {
    const up = ['chest', 'head', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR'].includes(id) ? 1 : 0.35;
    j.o.copy(j.p).sub(v.clone().add(impulse.clone().multiplyScalar(up)).multiplyScalar(dt));
  }
  const L = LINKS.map(([a, b, kind]) => ({ a, b, kind, len: P[a].p.distanceTo(P[b].p) }));
  ch.ragdoll = { P, L, world, t: 0, inv: mw.clone().invert() };
}

export function stepRagdoll(ch, rig, dt) {
  const r = ch.ragdoll;
  if (!r) return;
  r.t += dt;
  if (r.t > 12) { ch.despawned = true; ch.model.visible = false; return; }
  if (r.t < 4 || !r.rest) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    let motion = 0;
    for (let s = 0; s < steps; s++) {
      for (const j of Object.values(r.P)) {
        const vx = (j.p.x - j.o.x) * 0.992, vy = (j.p.y - j.o.y) * 0.992, vz = (j.p.z - j.o.z) * 0.992;
        j.o.copy(j.p);
        j.p.x += vx; j.p.y += vy - 18 * h * h; j.p.z += vz;
        motion += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
      }
      for (let it = 0; it < 6; it++) {
        for (const l of r.L) {
          const A = r.P[l.a].p, B = r.P[l.b].p;
          _v.copy(B).sub(A);
          const d = _v.length() || 1e-6;
          if (l.kind === 'min' && d >= l.len * 0.7) continue;
          const target = l.kind === 'min' ? l.len * 0.7 : l.len;
          _v.multiplyScalar((d - target) / d * 0.5);
          A.add(_v); B.sub(_v);
        }
        for (const j of Object.values(r.P)) collide(j, r.world);
      }
    }
    r.rest = r.t > 1.5 && motion < 0.002;
  }
  // drive the bones from the joint positions (model space)
  const M = (id) => r.P[id].p.clone().applyMatrix4(r.inv);
  const pelvis = M('pelvis'), chest = M('chest'), head = M('head');
  const up = chest.clone().sub(pelvis).normalize();
  const right = M('hiR').sub(M('hiL'));
  right.sub(up.clone().multiplyScalar(right.dot(up))).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, up);
  const basis = new THREE.Matrix4().makeBasis(right, up, fwd);
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  rig.setHips(pelvis.clone().sub(up.clone().multiplyScalar(0.0)), q.multiply(rig.parentQ.clone().multiply(rig.b.hips.restQ)));
  rig.aim('spine', chest.clone().sub(pelvis));
  rig.aim('chest', head.clone().sub(chest));
  rig.aim('neck', head.clone().sub(chest));
  rig.aim('head', head.clone().sub(chest));
  for (const [L, s] of [['L', 'L'], ['R', 'R']]) {
    rig.aim(`upperarm_${L}`, M(`el${s}`).sub(M(`sh${s}`)));
    rig.aim(`forearm_${L}`, M(`ha${s}`).sub(M(`el${s}`)));
    rig.rest(`hand_${L}`);
    rig.aim(`thigh_${L}`, M(`kn${s}`).sub(M(`hi${s}`)));
    rig.aim(`shin_${L}`, M(`an${s}`).sub(M(`kn${s}`)));
    rig.aim(`foot_${L}`, M(`to${s}`).sub(M(`an${s}`)));
  }
}

// push a joint out of the floor and any box it sinks into, with friction
function collide(j, world) {
  if (j.p.y < RAD) { j.p.y = RAD; j.o.x += (j.p.x - j.o.x) * 0.4; j.o.z += (j.p.z - j.o.z) * 0.4; }
  const p0 = j.p;
  for (const b of world.near(p0.x - RAD, p0.z - RAD, p0.x + RAD, p0.z + RAD)) {
    const p = j.p;
    if (p.x > b.min.x - RAD && p.x < b.max.x + RAD && p.y > b.min.y - RAD && p.y < b.max.y + RAD && p.z > b.min.z - RAD && p.z < b.max.z + RAD) {
      const pen = [p.x - (b.min.x - RAD), (b.max.x + RAD) - p.x, p.y - (b.min.y - RAD), (b.max.y + RAD) - p.y, p.z - (b.min.z - RAD), (b.max.z + RAD) - p.z];
      let k = 0; for (let i = 1; i < 6; i++) if (pen[i] < pen[k]) k = i;
      if (k === 0) p.x = b.min.x - RAD; else if (k === 1) p.x = b.max.x + RAD;
      else if (k === 2) p.y = b.min.y - RAD; else if (k === 3) { p.y = b.max.y + RAD; j.o.x += (p.x - j.o.x) * 0.4; j.o.z += (p.z - j.o.z) * 0.4; }
      else if (k === 4) p.z = b.min.z - RAD; else p.z = b.max.z + RAD;
    }
  }
}
