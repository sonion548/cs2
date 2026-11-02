// Procedural weapon and character models built from primitives.
// Weapon parts are named ('body', 'accent', 'grip', ...) so later skin
// finishes can be applied per part.
import * as THREE from 'three';
import { tex } from './textures.js';

const M = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x4a4e54, metalness: 0.45, roughness: 0.42, map: tex('metal', 9) }),
  darkSteel: () => new THREE.MeshStandardMaterial({ color: 0x2a2c2f, metalness: 0.35, roughness: 0.5 }),
  polymer: () => new THREE.MeshStandardMaterial({ color: 0x34363a, metalness: 0.1, roughness: 0.7 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x8a4a22, roughness: 0.55, map: tex('crate', 4) }),
  tan: () => new THREE.MeshStandardMaterial({ color: 0x5a6343, roughness: 0.7, metalness: 0.15 }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0x1d2a35, metalness: 0.6, roughness: 0.1 }),
  blade: () => new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.22 }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0, part = 'body') {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.userData.part = part; m.castShadow = true;
  return m;
}
function cyl(r, len, mat, x = 0, y = 0, z = 0, part = 'body', seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z); m.userData.part = part; m.castShadow = true;
  return m;
}

// Guns face -Z (forward). Origin is roughly at the grip. Units: metres.
export function buildGun(id) {
  const g = new THREE.Group();
  const steel = M.steel(), dark = M.darkSteel(), poly = M.polymer();
  let muzzle = new THREE.Vector3(0, 0.04, -0.5);
  switch (id) {
    case 'ak47': {
      const wood = M.wood();
      g.add(box(0.05, 0.07, 0.42, steel, 0, 0.03, -0.08));            // receiver
      g.add(box(0.045, 0.02, 0.36, dark, 0, 0.075, -0.08, 'accent'));  // dust cover
      g.add(box(0.055, 0.06, 0.24, wood, 0, 0.02, -0.38, 'grip'));     // handguard
      g.add(box(0.04, 0.03, 0.2, wood, 0, 0.07, -0.38, 'grip'));       // upper handguard
      g.add(cyl(0.011, 0.36, dark, 0, 0.035, -0.65));                   // barrel
      g.add(cyl(0.008, 0.3, dark, 0, 0.075, -0.56, 'accent'));          // gas tube
      g.add(box(0.012, 0.04, 0.012, dark, 0, 0.065, -0.8));             // front sight
      g.add(box(0.03, 0.035, 0.05, dark, 0, 0.035, -0.83));             // muzzle brake
      const mag = new THREE.Group();
      mag.add(box(0.035, 0.12, 0.07, steel, 0, -0.06, 0, 'mag'));
      const m2 = box(0.035, 0.1, 0.065, steel, 0, -0.15, 0.03, 'mag'); m2.rotation.x = -0.35; mag.add(m2);
      mag.position.set(0, -0.01, -0.17); mag.name = 'mag'; g.add(mag);
      const grip = box(0.035, 0.11, 0.05, wood, 0, -0.06, 0.06, 'grip'); grip.rotation.x = 0.3; g.add(grip);
      const stock = box(0.045, 0.08, 0.3, wood, 0, -0.01, 0.27, 'grip'); stock.rotation.x = 0.12; g.add(stock);
      muzzle.set(0, 0.035, -0.87);
      break;
    }
    case 'm4a1': {
      g.add(box(0.05, 0.075, 0.36, poly, 0, 0.03, -0.08));               // lower/upper
      g.add(box(0.03, 0.02, 0.3, dark, 0, 0.08, -0.1, 'accent'));        // rail
      g.add(box(0.012, 0.05, 0.03, dark, 0, 0.1, 0.04, 'accent'));       // rear sight
      g.add(box(0.06, 0.06, 0.26, poly, 0, 0.03, -0.38));                // handguard
      g.add(cyl(0.011, 0.3, dark, 0, 0.035, -0.64));
      g.add(box(0.012, 0.07, 0.015, dark, 0, 0.08, -0.5));               // front sight post
      g.add(cyl(0.017, 0.12, dark, 0, 0.035, -0.82, 'accent'));          // suppressor-like flash hider
      const mag = new THREE.Group();
      const m1 = box(0.03, 0.17, 0.065, steel, 0, -0.08, 0.01, 'mag'); m1.rotation.x = -0.12; mag.add(m1);
      mag.position.set(0, -0.01, -0.15); mag.name = 'mag'; g.add(mag);
      const grip = box(0.035, 0.11, 0.045, poly, 0, -0.06, 0.06, 'grip'); grip.rotation.x = 0.35; g.add(grip);
      g.add(cyl(0.015, 0.2, dark, 0, 0.04, 0.2, 'accent'));             // buffer tube
      g.add(box(0.045, 0.1, 0.12, poly, 0, 0.0, 0.3, 'grip'));           // stock
      muzzle.set(0, 0.035, -0.9);
      break;
    }
    case 'awp': {
      const body = M.tan();
      g.add(box(0.06, 0.09, 0.7, body, 0, 0.02, -0.05));
      g.add(box(0.07, 0.13, 0.3, body, 0, -0.01, 0.42));                 // stock
      g.add(box(0.03, 0.05, 0.05, dark, 0, -0.06, 0.62));                // butt pad
      g.add(cyl(0.013, 0.55, dark, 0, 0.04, -0.68));
      g.add(cyl(0.022, 0.1, dark, 0, 0.04, -0.98, 'accent'));
      g.add(cyl(0.028, 0.34, dark, 0, 0.13, -0.05, 'accent'));           // scope tube
      g.add(cyl(0.036, 0.07, dark, 0, 0.13, -0.24, 'accent'));
      g.add(cyl(0.032, 0.06, dark, 0, 0.13, 0.12, 'accent'));
      g.add(cyl(0.03, 0.005, M.glass(), 0, 0.13, -0.28, 'accent'));
      g.add(box(0.015, 0.05, 0.02, dark, 0, 0.08, -0.12));
      g.add(box(0.015, 0.05, 0.02, dark, 0, 0.08, 0.02));
      const mag = box(0.04, 0.08, 0.08, dark, 0, -0.06, -0.05, 'mag'); mag.name = 'mag'; g.add(mag);
      const bolt = cyl(0.008, 0.06, steel, 0.05, 0.05, 0.1, 'accent'); bolt.rotation.y = Math.PI / 2; g.add(bolt);
      muzzle.set(0, 0.04, -1.04);
      break;
    }
    case 'glock': case 'usp': case 'deagle': {
      const big = id === 'deagle' ? 1.3 : 1;
      const slideMat = id === 'deagle' ? M.steel() : dark;
      const slide = box(0.032 * big, 0.04 * big, 0.2 * big, slideMat, 0, 0.04, -0.05);
      slide.name = 'slide'; g.add(slide);
      g.add(box(0.03 * big, 0.03, 0.15 * big, poly, 0, 0.005, -0.04, 'accent'));
      const grip = box(0.03 * big, 0.11 * big, 0.05 * big, poly, 0, -0.05, 0.02, 'grip'); grip.rotation.x = 0.22; g.add(grip);
      g.add(box(0.008, 0.012, 0.008, dark, 0, 0.066 * big, -0.14 * big));
      const mag = box(0.024, 0.02, 0.04, steel, 0, -0.11 * big, 0.035, 'mag'); mag.name = 'mag'; g.add(mag);
      if (id === 'usp') { g.add(cyl(0.017, 0.14, dark, 0, 0.04, -0.23, 'accent')); muzzle.set(0, 0.04, -0.3); }
      else muzzle.set(0, 0.04, -0.17 * big);
      break;
    }
    case 'knife': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.035, 0.19), M.blade());
      blade.position.set(0, 0.01, -0.13); blade.userData.part = 'body'; g.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), M.blade());
      tip.rotation.x = -Math.PI / 2; tip.position.set(0, 0.01, -0.245); tip.scale.x = 0.2; tip.userData.part = 'body'; g.add(tip);
      g.add(box(0.03, 0.012, 0.012, dark, 0, 0.01, -0.03, 'accent'));
      g.add(box(0.022, 0.03, 0.11, poly, 0, 0.005, 0.03, 'grip'));
      muzzle.set(0, 0, -0.25);
      break;
    }
  }
  g.userData.muzzle = muzzle;
  return g;
}

// Simple first-person arms holding the weapon.
export function buildArms(team) {
  const sleeve = new THREE.MeshStandardMaterial({ color: team === 'CT' ? 0x2a3550 : 0x5b4a33, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const arms = new THREE.Group();
  const right = new THREE.Group();
  const ra = box(0.07, 0.07, 0.4, sleeve, 0, 0, 0.2, 'arm'); right.add(ra);
  right.add(box(0.06, 0.05, 0.08, glove, 0, 0, -0.02, 'arm'));
  right.position.set(0.02, -0.07, 0.07); right.rotation.set(0.3, 0.2, 0);
  const left = new THREE.Group();
  left.add(box(0.07, 0.07, 0.45, sleeve, 0, 0, 0.22, 'arm'));
  left.add(box(0.06, 0.05, 0.08, glove, 0, 0, -0.02, 'arm'));
  left.position.set(-0.05, -0.03, -0.3); left.rotation.set(0.25, -0.45, 0);
  left.name = 'left';
  arms.add(right, left);
  return arms;
}

// Third-person character. Origin at feet, facing -Z.
export function buildCharacter(team) {
  const T = team === 'T';
  const cloth = new THREE.MeshStandardMaterial({ color: T ? 0x7a6a4c : 0x2f3c5a, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: T ? 0x4b4234 : 0x252c3c, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: T ? 0x3c3a30 : 0x1c2433, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc69a7a, roughness: 0.7 });
  const head = new THREE.MeshStandardMaterial({ color: T ? 0x2a2622 : 0x1b2130, roughness: 0.7 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x1b1814, roughness: 0.8 });

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const mkLeg = (side) => {
    const hip = new THREE.Group(); hip.position.set(0.11 * side, 0.9, 0);
    hip.add(box(0.15, 0.48, 0.17, pants, 0, -0.24, 0));
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    knee.add(box(0.14, 0.42, 0.15, pants, 0, -0.21, 0));
    knee.add(box(0.15, 0.08, 0.26, boots, 0, -0.42, -0.04));
    hip.userData.knee = knee;
    return hip;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  body.add(legL, legR);
  const torso = new THREE.Group(); torso.position.y = 0.9; body.add(torso);
  torso.add(box(0.42, 0.56, 0.24, cloth, 0, 0.3, 0));
  torso.add(box(0.44, 0.38, 0.28, vest, 0, 0.34, 0));
  const h = new THREE.Group(); h.position.y = 0.66; torso.add(h);
  h.add(box(0.2, 0.24, 0.22, skin, 0, 0.12, 0));
  h.add(box(0.215, 0.12, 0.235, head, 0, 0.2, 0.0));           // helmet / balaclava top
  if (!T) h.add(box(0.23, 0.04, 0.25, head, 0, 0.14, 0));
  else h.add(box(0.205, 0.08, 0.04, head, 0, 0.06, -0.1));      // face wrap
  h.add(box(0.16, 0.035, 0.02, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }), 0, 0.13, -0.115));
  const armR = new THREE.Group(); armR.position.set(0.26, 0.52, 0); torso.add(armR);
  armR.add(box(0.11, 0.11, 0.42, cloth, 0, -0.05, -0.18));
  const armL = new THREE.Group(); armL.position.set(-0.26, 0.52, 0); torso.add(armL);
  armL.add(box(0.11, 0.11, 0.5, cloth, 0.12, -0.05, -0.24));
  armL.rotation.y = -0.5;
  const gunHolder = new THREE.Group(); gunHolder.position.set(0.16, 0.42, -0.32); torso.add(gunHolder);
  root.userData = { body, legL, legR, torso, head: h, gunHolder };
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}
