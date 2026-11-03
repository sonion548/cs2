// Characters and first-person arms. The real models are the Blender-built,
// skinned files in public/models/characters (see blender/characters.py); the
// primitive-built versions below are only a fallback if those fail to load.
// Weapons live in gunmodels.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fbm, hexToRgb } from './noise.js';
import { assets } from './assets.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildGun } from './gunmodels.js';
import { Rig, poseRig, startRagdoll as ragdollStart, stepRagdoll as ragdollStep } from './rig.js';
export { buildGun };

// Woven fabric texture with optional camo tint, shared per palette.
const fabricCache = new Map();
function fabric(base, camo) {
  const key = base + (camo || []).join();
  if (fabricCache.has(key)) return fabricCache.get(key);
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S);
  // canvas pixels are sRGB, so use the raw hex values (THREE.Color would linearise them)
  const b = hexToRgb(base);
  const cam = (camo || []).map(h => hexToRgb(h));
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const weave = ((i >> 1) + (j >> 1)) % 2 ? 1.04 : 0.96;
    const n = fbm(i / S * 6, j / S * 6, 3, 3, 6);
    let col = b;
    if (cam.length) {
      const m = fbm(i / S * 3, j / S * 3, 11, 4, 3);
      if (m > 0.58) col = cam[0]; else if (m < 0.4 && cam[1]) col = cam[1];
    }
    const k = (j * S + i) * 4, f = weave * (0.9 + n * 0.2);
    img.data[k] = col[0] * f; img.data[k + 1] = col[1] * f; img.data[k + 2] = col[2] * f; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(3, 3);
  fabricCache.set(key, t);
  return t;
}

const PALETTE = {
  T: { shirt: '#8b7a58', camo: ['#6d5d40', '#a39270'], pants: '#5d5240', vest: '#4a4536', head: '#3a342b', skin: 0xb98a68, glove: 0x2a2620 },
  CT: { shirt: '#36435e', camo: ['#2a3449', '#4a5674'], pants: '#2b3243', vest: '#20283a', head: '#1e2533', skin: 0xc79c7c, glove: 0x18191c },
};

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function rbox(w, h, d, mat, r = 0.03) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// Limb segment hanging down from its joint (joint at the group origin).
function limb(r0, r1, len, mat) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r0, r1, len, 16, 1);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true;
  const capT = new THREE.Mesh(new THREE.SphereGeometry(r0, 16, 10), mat); capT.castShadow = true;
  const capB = new THREE.Mesh(new THREE.SphereGeometry(r1, 16, 10), mat); capB.position.y = -len; capB.castShadow = true;
  g.add(m, capT, capB);
  return g;
}

// Blender-built character (public/models/characters/<team>.glb): a skinned
// mesh on one skeleton, posed every frame by rig.js (walk, crouch, aim, arm IK
// onto the weapon) and turned into a ragdoll when the character dies. Its
// materials (baked colour, normal and roughness atlas) come with the file.
function characterFromAsset(team, src) {
  const root = cloneSkinned(src);
  const lods = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    o.frustumCulled = false;   // skinned bounds don't follow the pose
    if (o.isSkinnedMesh) lods.push(o);
  });
  // level-of-detail versions (name_lod1, name_lod2) share the skeleton; the
  // game shows one of them depending on distance
  lods.sort((a, b) => (+(a.name.match(/lod(\d)/)?.[1] || 0)) - (+(b.name.match(/lod(\d)/)?.[1] || 0)));
  lods.forEach((m, i) => { m.visible = i === 0; });
  const rig = new Rig(root);
  const gunHolder = new THREE.Group();
  root.add(gunHolder);
  const backBomb = buildGun('c4');
  backBomb.scale.setScalar(0.85); backBomb.visible = false;
  root.add(backBomb);
  root.userData = { rig, gunHolder, backBomb, skinned: true, lods: lods.length > 1 ? lods : null };
  return root;
}

// Third-person character. Origin at feet, facing -Z.
export function buildCharacter(team) {
  const src = assets.characters[team === 'CT' ? 'ct' : 't'];
  if (src) return characterFromAsset(team, src);
  const pal = PALETTE[team] || PALETTE.T;
  const T = team === 'T';
  const shirt = new THREE.MeshStandardMaterial({ map: fabric(pal.shirt, pal.camo), roughness: 0.92 });
  const pants = new THREE.MeshStandardMaterial({ map: fabric(pal.pants, T ? pal.camo : null), roughness: 0.92 });
  const vest = new THREE.MeshStandardMaterial({ map: fabric(pal.vest), roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: pal.skin, roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ map: fabric(pal.head), roughness: 0.85 });
  const helmet = new THREE.MeshStandardMaterial({ color: T ? 0x4d4636 : 0x262d3b, roughness: 0.55, metalness: 0.1 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.75 });
  const glove = new THREE.MeshStandardMaterial({ color: pal.glove, roughness: 0.8 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x22201c, roughness: 0.9 });
  const lensM = new THREE.MeshStandardMaterial({ color: 0x0f1418, roughness: 0.1, metalness: 0.6 });

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  const mkLeg = (side) => {
    const hip = new THREE.Group(); hip.position.set(0.1 * side, 0.92, 0);
    hip.add(limb(0.085, 0.07, 0.42, pants));
    const kneePad = rbox(0.11, 0.1, 0.06, strap, 0.025); kneePad.position.set(0, -0.44, -0.06); hip.add(kneePad);
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    knee.add(limb(0.068, 0.055, 0.38, pants));
    const boot = rbox(0.12, 0.11, 0.27, boots, 0.04); boot.position.set(0, -0.42, -0.04); knee.add(boot);
    const sole = rbox(0.125, 0.025, 0.28, strap, 0.01); sole.position.set(0, -0.47, -0.04); knee.add(sole);
    hip.userData.knee = knee;
    return hip;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  body.add(legL, legR);

  // torso: lathed shell (wider chest, narrow waist)
  const torso = new THREE.Group(); torso.position.y = 0.92; body.add(torso);
  const shellPts = [[0.0, 0.0], [0.15, 0.0], [0.17, 0.08], [0.16, 0.2], [0.2, 0.36], [0.21, 0.46], [0.17, 0.56], [0.07, 0.6], [0.0, 0.6]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const shellGeo = new THREE.LatheGeometry(shellPts, 24);
  shellGeo.scale(1, 1, 0.68);
  torso.add(new THREE.Mesh(shellGeo, shirt));
  const plate = rbox(0.36, 0.34, 0.26, vest, 0.05); plate.position.set(0, 0.36, 0); torso.add(plate);
  for (let i = -1; i <= 1; i++) { const p = rbox(0.09, 0.11, 0.06, vest, 0.02); p.position.set(i * 0.1, 0.24, -0.15); torso.add(p); }
  const belt = rbox(0.36, 0.06, 0.25, strap, 0.025); belt.position.set(0, 0.03, 0); torso.add(belt);
  const holster = rbox(0.06, 0.16, 0.08, strap, 0.02); holster.position.set(0.19, -0.06, 0.02); torso.add(holster);
  if (T) { const pack = rbox(0.28, 0.32, 0.12, vest, 0.05); pack.position.set(0, 0.36, 0.18); torso.add(pack); }
  else { const radio = rbox(0.07, 0.18, 0.05, strap, 0.015); radio.position.set(-0.13, 0.44, 0.15); torso.add(radio); }

  // head
  const neck = new THREE.Group(); neck.position.y = 0.6; torso.add(neck);
  const neckM = capsule(0.055, 0.05, T ? headMat : skin); neckM.position.y = 0.04; neck.add(neckM);
  const h = new THREE.Group(); h.position.y = 0.1; neck.add(h);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), T ? headMat : skin);
  skull.scale.set(0.95, 1.1, 1.0); skull.position.y = 0.09; h.add(skull);
  if (T) {
    const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.106, 24, 6, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.42, Math.PI * 0.12), skin);
    eyes.scale.set(0.96, 1.1, 1.01); eyes.position.y = 0.09; h.add(eyes);
    const tail = capsule(0.03, 0.12, headMat); tail.position.set(0.04, 0.06, 0.1); tail.rotation.x = 0.6; h.add(tail);
  } else {
    const shellH = new THREE.Mesh(new THREE.SphereGeometry(0.125, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet);
    shellH.position.y = 0.11; shellH.scale.set(1, 0.95, 1.08); h.add(shellH);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.008, 8, 32), helmet); rim.rotation.x = Math.PI / 2; rim.position.y = 0.095; rim.scale.set(1, 1.08, 1); h.add(rim);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 18), strap); ear.rotation.z = Math.PI / 2; ear.position.set(0.1 * s, 0.07, 0.0); h.add(ear); }
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 8, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.55, Math.PI * 0.35), headMat);
    mask.scale.set(0.97, 1.1, 1.03); mask.position.y = 0.09; h.add(mask);
  }
  const goggle = rbox(0.16, 0.045, 0.04, strap, 0.018); goggle.position.set(0, 0.11, -0.09); h.add(goggle);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.02, 18), lensM); l.position.set(0.04 * s, 0.11, -0.111); l.rotation.y = Math.PI; h.add(l); }

  // arms (shoulder → elbow → hand), posed holding a rifle
  const mkArm = (side) => {
    const sh = new THREE.Group(); sh.position.set(0.22 * side, 0.52, 0);
    sh.add(limb(0.06, 0.05, 0.28, shirt));
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), vest); sh.add(pad);
    const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
    el.add(limb(0.05, 0.042, 0.26, shirt));
    const hand = rbox(0.06, 0.09, 0.05, glove, 0.02); hand.position.y = -0.3; el.add(hand);
    sh.userData.elbow = el;
    return sh;
  };
  const armR = mkArm(1), armL = mkArm(-1);
  torso.add(armR, armL);
  armR.rotation.set(0.75, 0, -0.1); armR.userData.elbow.rotation.x = 1.3;
  armL.rotation.set(1.15, 0, 0.55); armL.userData.elbow.rotation.x = 0.65;

  const gunHolder = new THREE.Group(); gunHolder.position.set(0.12, 0.38, -0.3); torso.add(gunHolder);
  root.userData = { body, legL, legR, torso, head: h, gunHolder, armL, armR };
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// Materials for the first-person arms (sleeve fabric matches the team uniform).
export function armMaterials(team) {
  const pal = PALETTE[team] || PALETTE.T;
  return {
    sleeve: new THREE.MeshStandardMaterial({ map: fabric(pal.shirt, pal.camo), roughness: 0.9 }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x1d1d1b, roughness: 0.85 }),
    glove: new THREE.MeshStandardMaterial({ color: pal.glove, roughness: 0.75 }),
    knuckle: new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6 }),
  };
}

// First-person arms: sleeve + glove stretched from an off-screen shoulder to
// anchor points on the weapon (grip / foregrip), in the gun's parent space.
export function buildArms(team, gun) {
  const pal = PALETTE[team] || PALETTE.T;
  const sleeve = new THREE.MeshStandardMaterial({ map: fabric(pal.shirt, pal.camo), roughness: 0.9 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x1d1d1b, roughness: 0.85 });
  const glove = new THREE.MeshStandardMaterial({ color: pal.glove, roughness: 0.75 });
  const knuckle = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6 });
  const arms = new THREE.Group();

  const mkArm = (from, to, palmDown) => {
    const a = new THREE.Group();
    const dir = to.clone().sub(from), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, len, 18), sleeve);
    fore.position.copy(from).addScaledVector(dir, 0.5); fore.quaternion.copy(q);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 18), cuff);
    c.position.copy(to).addScaledVector(dir.clone().normalize(), -0.035); c.quaternion.copy(q);
    const hand = new THREE.Group();
    hand.position.copy(to); hand.quaternion.copy(q);
    hand.add(rbox(0.05, 0.065, 0.028, glove, 0.012));
    for (let i = 0; i < 4; i++) {
      const f = capsule(0.0075, 0.03, glove); f.position.set(-0.018 + i * 0.012, 0.045, palmDown ? 0.012 : -0.012); f.rotation.x = palmDown ? 0.9 : -0.9; hand.add(f);
      const k = rbox(0.011, 0.008, 0.012, knuckle, 0.003); k.position.set(-0.018 + i * 0.012, 0.03, palmDown ? -0.015 : 0.015); hand.add(k);
    }
    const th = capsule(0.008, 0.03, glove); th.position.set(0.028, 0.012, 0.0); th.rotation.z = -0.7; hand.add(th);
    a.add(fore, c, hand);
    a.traverse(o => { if (o.isMesh) o.castShadow = false; });
    return a;
  };

  const ud = gun.userData;
  const grip = ud.grip ? ud.grip.clone() : new THREE.Vector3(0, -0.04, 0.03);
  const right = mkArm(new THREE.Vector3(0.2, -0.36, 0.5), grip.clone().add(new THREE.Vector3(0.012, -0.01, 0)), false);
  right.name = 'right';
  arms.add(right);
  if (ud.fore) {
    const left = mkArm(new THREE.Vector3(-0.34, -0.4, 0.25), ud.fore.clone().add(new THREE.Vector3(-0.02, -0.025, 0)), true);
    left.name = 'left'; arms.add(left);
  } else if (ud.pistol) {
    const left = mkArm(new THREE.Vector3(-0.26, -0.38, 0.42), grip.clone().add(new THREE.Vector3(-0.022, -0.02, 0.01)), false);
    left.name = 'left'; arms.add(left);
  }
  return arms;
}

// ---------------------------------------------------------------- posing
export function poseCharacter(ch, dt) {
  const m = ch.model, u = m.userData;
  m.position.copy(ch.pos);
  m.rotation.y = ch.yaw;
  if (u.rig) { poseRig(ch, u.rig, dt); return; }
  // rigid fallback model
  const sp = ch.speed2D();
  ch.walkPhase = (ch.walkPhase || 0) + dt * sp * 1.6;
  const sw = Math.sin(ch.walkPhase) * Math.min(1, sp / 4) * 0.6;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.legL.userData.knee.rotation.x = Math.max(0, -sw) * 0.8;
  u.legR.userData.knee.rotation.x = Math.max(0, sw) * 0.8;
  const c = ch.crouch;
  u.torso.position.y = 0.9 - 0.42 * c;
  u.legL.position.y = u.legR.position.y = 0.9 - 0.42 * c;
  if (c > 0) {
    u.legL.rotation.x += -0.9 * c; u.legR.rotation.x += -0.9 * c;
    u.legL.userData.knee.rotation.x += 1.6 * c; u.legR.userData.knee.rotation.x += 1.6 * c;
  }
  u.torso.rotation.x = ch.pitch * 0.6;
  u.head.rotation.x = ch.pitch * 0.4;
}

export function startRagdoll(ch, dir) {
  const u = ch.model.userData;
  if (u.rig) { if (u.gunHolder) u.gunHolder.visible = false; if (u.backBomb) u.backBomb.visible = false; ragdollStart(ch, u.rig, ch.game.level.world, dir); }
  ch.deathAnim = 0;
}

export function stepRagdoll(ch, dt) {
  const u = ch.model.userData;
  if (u.rig) { ragdollStep(ch, u.rig, dt); return; }
  if (ch.deathAnim < 1) {
    ch.deathAnim = Math.min(1, ch.deathAnim + dt * 2.5);
    const e = 1 - (1 - ch.deathAnim) ** 3;
    u.body.rotation.x = e * (Math.PI / 2) * (ch.deathDir || 1);
    u.body.position.y = 0.1 * e;
  }
  if ((ch.deadFor = (ch.deadFor || 0) + dt) > 12) { ch.despawned = true; ch.model.visible = false; }
}
