// First-person weapon rendering + animation (bob, sway, kick, reload, deploy, inspect).
import * as THREE from 'three';
import { buildGun, buildArms } from './models.js';
import { applySkin } from './items/render.js';
import { SKINS } from './items/catalog.js';
import { radialTexture } from './textures.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const POSE = {
  rifle: new THREE.Vector3(0.1, -0.105, -0.2),
  sniper: new THREE.Vector3(0.095, -0.105, -0.19),
  pistol: new THREE.Vector3(0.08, -0.085, -0.19),
  melee: new THREE.Vector3(0.09, -0.09, -0.17),
};

// Inspect keyframes: [t, rotX, rotY, rotZ, dx, dy, dz]
const INSPECT = {
  default: [
    [0, 0, 0, 0, 0, 0, 0],
    [0.5, 0.15, 0.9, 0.55, -0.08, 0.04, 0.06],
    [1.6, 0.2, 1.1, 0.7, -0.09, 0.05, 0.07],
    [2.2, -0.25, -0.5, -1.35, -0.05, 0.03, 0.03],
    [3.1, -0.3, -0.6, -1.5, -0.05, 0.04, 0.03],
    [3.7, 0, 0, 0, 0, 0, 0],
  ],
  melee: [
    [0, 0, 0, 0, 0, 0, 0],
    [0.4, 0.2, 0.9, 1.4, -0.08, 0.05, 0.04],
    [1.2, 0.2, 1.0, 1.55, -0.08, 0.06, 0.04],
    [1.7, 0.0, 0.6, Math.PI * 2 + 0.2, -0.04, 0.04, 0.02],
    [2.6, -0.2, -0.4, Math.PI * 2 - 0.4, -0.04, 0.03, 0.02],
    [3.2, 0, 0, Math.PI * 2, 0, 0, 0],
  ],
};

function sampleKeys(keys, t) {
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1].slice(1);
  let i = 0; while (keys[i + 1][0] < t) i++;
  const a = keys[i], b = keys[i + 1];
  let f = (t - a[0]) / (b[0] - a[0]);
  f = f * f * (3 - 2 * f);
  return a.slice(1).map((v, k) => v + (b[k + 1] - v) * f);
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
    this.team = team;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.18);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2);
    this.scene.add(this.flashLight);
    this.id = null;
    this.t = 0;
    this.kick = 0; this.kickRot = 0;
    this.sway = new THREE.Vector2(); this.swayVel = new THREE.Vector2();
    this.bob = 0;
    this.inspectT = -1;
    this.swing = 0; this.swingDir = 1;
    this.deployT = 1;
    this.reloadT = -1; this.reloadDur = 1;
  }

  // id: weapon id; item: equipped inventory item for this weapon (or null).
  setWeapon(id, type, deployTime = 0.5, item = null) {
    if (this.gun) this.holder.remove(this.gun);
    if (this.arms) this.holder.remove(this.arms);
    this.id = id; this.type = type;
    const modelId = id === 'knife' ? `knife:${item ? SKINS[item.defId]?.knife || 'standard' : 'standard'}` : id;
    this.gun = buildGun(modelId);
    if (item) applySkin(this.gun, item);
    this.gun.traverse(o => { if (o.isMesh) o.castShadow = false; });
    this.arms = buildArms(this.team, this.gun);
    this.holder.add(this.gun, this.arms);
    this.gun.add(this.flash);
    this.flash.position.copy(this.gun.userData.muzzle);
    this.flash.visible = false;
    this.mag = this.gun.getObjectByName('mag');
    this.magBase = this.mag ? this.mag.position.clone() : null;
    this.slide = this.gun.getObjectByName('slide');
    this.slideBase = this.slide ? this.slide.position.x : 0;
    this.bfA = this.gun.getObjectByName('bfA');
    this.bfB = this.gun.getObjectByName('bfB');
    this.kPivot = this.gun.getObjectByName('karambitPivot');
    this.deployT = 0; this.deployDur = Math.max(0.2, deployTime);
    this.inspectT = -1; this.reloadT = -1;
  }

  fire() {
    this.kick = this.type === 'sniper' ? 1.4 : this.type === 'pistol' ? 0.8 : 0.55;
    this.flash.visible = this.type !== 'melee';
    this.flash.material.rotation = Math.random() * 6.28;
    this.flash.scale.setScalar(0.2 + Math.random() * 0.15);
    this.flashTime = 0.04;
    this.inspectT = -1;
    if (this.type === 'melee') { this.swing = 1; this.swingDir *= -1; }
  }
  reload(dur) { this.reloadT = 0; this.reloadDur = dur; this.inspectT = -1; }
  cancelReload() { this.reloadT = -1; }
  inspect() { if (this.deployT >= 1 && this.reloadT < 0) this.inspectT = 0; }
  look(dx, dy) { this.swayVel.x += dx * 0.00012; this.swayVel.y += dy * 0.00012; }

  update(dt, speed, onGround, aspect, cameraWorld) {
    this.t += dt;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    // keep viewmodel lighting aligned with the world sun direction relative to view
    if (cameraWorld) {
      const inv = cameraWorld.clone().invert();
      this.sun.position.set(0.55, 1, 0.35).transformDirection(inv);
    }
    const base = POSE[this.type] || POSE.rifle;
    const pos = base.clone();
    const rot = new THREE.Euler(0, 0, 0);

    // bob
    const moving = onGround ? Math.min(1, speed / 6) : 0;
    this.bob += dt * (6 + speed * 1.2) * (moving > 0.05 ? 1 : 0);
    pos.x += Math.sin(this.bob) * 0.008 * moving;
    pos.y += -Math.abs(Math.cos(this.bob)) * 0.012 * moving;
    if (!onGround) pos.y += 0.01;
    // sway (spring)
    this.swayVel.multiplyScalar(Math.exp(-10 * dt));
    this.sway.add(this.swayVel);
    this.sway.multiplyScalar(Math.exp(-8 * dt));
    this.sway.clampScalar(-0.05, 0.05);
    pos.x -= this.sway.x; pos.y += this.sway.y;
    rot.y += this.sway.x * 2; rot.x += this.sway.y * 1.5;
    // idle breathing
    pos.y += Math.sin(this.t * 1.6) * 0.002;

    // kick
    this.kick *= Math.exp(-14 * dt);
    pos.z += this.kick * 0.02;
    rot.x += this.kick * 0.09;
    if (this.slide) this.slide.position.x = this.slideBase - Math.min(this.kick, 0.6) * 0.05;
    if (this.flashTime > 0) { this.flashTime -= dt; if (this.flashTime <= 0) this.flash.visible = false; }
    this.flashLight.intensity = this.flash.visible ? 6 : 0;
    if (this.flash.visible) this.flashLight.position.copy(this.gun.localToWorld(this.gun.userData.muzzle.clone()));

    // knife swing
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 3.2);
      const s = Math.sin((1 - this.swing) * Math.PI);
      rot.y += s * 0.9 * this.swingDir; rot.z += s * 0.6 * this.swingDir;
      pos.x -= s * 0.08 * this.swingDir; pos.z -= s * 0.1;
    }

    // deploy
    if (this.deployT < 1) {
      this.deployT = Math.min(1, this.deployT + dt / this.deployDur);
      const e = 1 - (1 - this.deployT) ** 3;
      pos.y -= (1 - e) * 0.25; rot.x -= (1 - e) * 0.8;
    }

    // reload: tilt gun, drop mag, insert new one
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const f = this.reloadT / this.reloadDur;
      if (f >= 1) { this.reloadT = -1; if (this.mag) this.mag.position.copy(this.magBase); }
      else {
        const tilt = Math.sin(Math.min(1, f * 1.1) * Math.PI);
        rot.z += tilt * 0.55; rot.x += tilt * 0.25; pos.y -= tilt * 0.03;
        if (this.mag) {
          const drop = f < 0.25 ? f / 0.25 : f < 0.45 ? 1 : f < 0.7 ? 1 - (f - 0.45) / 0.25 : 0;
          this.mag.position.copy(this.magBase); this.mag.position.y -= drop * 0.25;
          this.mag.visible = !(f > 0.25 && f < 0.42);
        }
      }
    }

    // inspect
    if (this.inspectT >= 0) {
      const keys = this.type === 'melee' ? INSPECT.melee : INSPECT.default;
      this.inspectT += dt;
      const k = sampleKeys(keys, this.inspectT);
      rot.x += k[0]; rot.y += k[1]; rot.z += k[2];
      pos.x += k[3] * 0.6; pos.y += k[4] * 0.6; pos.z += k[5] * 0.6;
      const T = this.inspectT;
      // balisong: swing the two handle halves open and closed around the pivot
      if (this.bfA) {
        const open = T < 2.8 ? Math.abs(Math.sin(T * Math.PI * 1.2)) : 0;
        this.bfA.rotation.z = open * Math.PI;
        this.bfB.rotation.z = -open * Math.PI;
      }
      // karambit: spin around the finger ring
      if (this.kPivot) this.kPivot.rotation.z = T > 0.4 && T < 1.6 ? (T - 0.4) / 1.2 * Math.PI * 4 : 0;
      if (this.inspectT > keys[keys.length - 1][0]) { this.inspectT = -1; if (this.bfA) { this.bfA.rotation.z = 0; this.bfB.rotation.z = 0; } }
    }

    this.root.position.copy(pos);
    this.root.rotation.copy(rot);
  }
}
