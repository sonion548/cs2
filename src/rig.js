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
const AIM = {
  // right-hand position (relative to the shoulder pivot, before aim pitch) per hold style
  rifle: new THREE.Vector3(0.15, -0.2, -0.27),
  pistol: new THREE.Vector3(0.07, -0.11, -0.42),
  melee: new THREE.Vector3(0.22, -0.3, -0.3),
  grenade: new THREE.Vector3(0.22, -0.12, -0.26),
  bomb: new THREE.Vector3(0.0, -0.5, -0.32),
};
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

  // torso follows aim pitch (split across spine, chest and head)
  const pitch = Math.max(-1.1, Math.min(1.1, ch.pitch));
  const def0 = ch.weapon?.def, shouldered = !busy && holdOf(def0) === 'rifle';
  st.blade = (st.blade || 0) + ((shouldered ? 1 : 0) - (st.blade || 0)) * Math.min(1, dt * 8);
  rig.turn('spine', qAxis(Y, -0.28 * st.blade).multiply(qAxis(X, pitch * 0.22 - 0.04 * moving - (busy ? 0.35 : 0))));
  rig.turn('chest', qAxis(Y, -0.32 * st.blade).multiply(qAxis(X, pitch * 0.28)));
  rig.turn('neck', qAxis(X, pitch * 0.18));
  rig.turn('head', qAxis(X, pitch * 0.25 - (busy ? 0.4 : 0)));

  // weapon in front of the chest, pitched with aim
  const def = ch.weapon?.def;
  const hold = holdOf(def);
  const chest = rig.b.chest;
  const pivot = chest.mp.clone().add(new THREE.Vector3(0, 0.14, 0));
  const aimQ = qAxis(X, hold === 'bomb' ? 0 : hold === 'melee' ? pitch * 0.6 - 0.25 : pitch);
  const reloading = ch.weapon?.reloading > 0 && def?.pattern;
  st.reload += ((reloading ? 1 : 0) - st.reload) * Math.min(1, dt * 8);
  const handR = AIM[hold].clone();
  handR.z += st.kick * (hold === 'pistol' ? 0.05 : 0.035);
  handR.y += -st.reload * 0.06;
  if (holder) {
    holder.visible = !busy && !!gun;
    const grip = gun?.userData.grip || new THREE.Vector3();
    const gq = aimQ.clone().multiply(qAxis(X, -st.reload * 0.35 + st.kick * 0.12));
    holder.quaternion.copy(gq);
    if (hold === 'rifle' && gun?.userData.rear) {
      // stock seated in the right shoulder pocket, bore pitched with aim
      const pocket = pivot.clone().add(new THREE.Vector3(0.11, -0.07, 0.05 + st.kick * 0.03 + st.reload * 0.02));
      holder.position.copy(pocket).sub(gun.userData.rear.clone().applyQuaternion(gq));
    } else holder.position.copy(pivot).add(handR.clone().applyQuaternion(aimQ)).sub(grip.clone().applyQuaternion(gq));
    holder.updateMatrix();
  }
  const toModel = (local) => local.clone().applyQuaternion(holder.quaternion).add(holder.position);
  const R = busy ? pivot.clone().add(new THREE.Vector3(0.1, -0.85, -0.42)) : gun?.userData.grip ? toModel(gun.userData.grip) : pivot.clone().add(handR.clone().applyQuaternion(aimQ));
  let Lh;
  if (busy) Lh = pivot.clone().add(new THREE.Vector3(-0.1, -0.85, -0.42));
  else if (gun?.userData.fore && hold !== 'melee' && hold !== 'grenade') {
    Lh = toModel(gun.userData.fore);
    if (st.reload > 0.01) {
      // left hand goes down to the magazine and back
      const mag = gun.getObjectByName('mag');
      const magP = mag ? model.worldToLocal(mag.getWorldPosition(new THREE.Vector3())) : Lh.clone().add(new THREE.Vector3(0, -0.12, 0.1));
      Lh.lerp(magP, Math.sin(Math.min(1, (1 - ch.weapon.reloading / def.reloadTime)) * Math.PI) * st.reload);
    }
  } else if (hold === 'pistol') Lh = R.clone().add(new THREE.Vector3(-0.035, -0.02, 0.02).applyQuaternion(aimQ));
  else Lh = rig.b.chest.mp.clone().add(new THREE.Vector3(-0.27, -0.55, -0.12 - 0.08 * Math.sin(st.phase) * moving));
  rig.reach('R', R, new THREE.Vector3(0.6, -0.8, 0.3));
  rig.reach('L', Lh, new THREE.Vector3(-0.7, -0.8, 0.2));
  // hands roll to grip along the weapon
  rig.turn('hand_R', qAxis(Z, hold === 'pistol' ? 0.3 : 0.8));
  rig.turn('hand_L', qAxis(Z, -0.6));

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
  for (const b of world.boxes) {
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
