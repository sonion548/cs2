// Shared state + movement physics for the player and bots.
import * as THREE from 'three';
import { WeaponState } from './weapons.js';

export const MOVE = {
  maxSpeed: 6.35, walkMul: 0.52, crouchMul: 0.34,
  accel: 5.5, airAccel: 12, airCap: 0.76, friction: 5.2, stopSpeed: 2.0,
  gravity: 20.3, jump: 7.4, step: 0.46,
  half: 0.32, standHeight: 1.8, crouchHeight: 1.35,
  eyeStand: 1.64, eyeCrouch: 1.18,
};

let nextId = 1;

export class Character {
  constructor(team, name, isBot) {
    this.id = nextId++;
    this.team = team; this.name = name; this.isBot = isBot;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.crouch = 0; this.crouching = false; this.walking = false;
    this.onGround = true;
    this.stats = { kills: 0, deaths: 0, assists: 0, damage: 0, hs: 0, mvps: 0 };
    this.damageBy = new Map();
    this.reset();
  }

  reset() {
    this.health = 100; this.armor = 100; this.helmet = true;
    this.alive = true;
    this.vel.set(0, 0, 0);
    this.damageBy.clear();
  }

  giveLoadout(primary, secondary) {
    this.weapons = { 1: primary ? new WeaponState(primary) : null, 2: new WeaponState(secondary), 3: new WeaponState('knife') };
    this.slot = primary ? 1 : 2;
    this.weapon.deploying = 0;
  }

  get weapon() { return this.weapons[this.slot]; }

  switchTo(slot) {
    if (!this.weapons[slot] || slot === this.slot) return false;
    const w = this.weapon;
    if (w) { w.reloading = 0; }
    this.slot = slot;
    this.weapon.deploying = this.weapon.def.deployTime ?? 0.4;
    this.scoped = 0;
    return true;
  }

  get height() { return MOVE.standHeight - (MOVE.standHeight - MOVE.crouchHeight) * this.crouch; }
  get eyeHeight() { return MOVE.eyeStand - (MOVE.eyeStand - MOVE.eyeCrouch) * this.crouch; }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  speed2D() { return Math.hypot(this.vel.x, this.vel.z); }

  maxSpeed() {
    const w = this.weapon;
    let s = MOVE.maxSpeed * (w ? w.def.moveSpeed : 1);
    if (this.scoped && w?.def.scopedSpeed) s = MOVE.maxSpeed * w.def.scopedSpeed;
    if (this.crouch > 0.5) s *= MOVE.crouchMul;
    else if (this.walking) s *= MOVE.walkMul;
    return s;
  }

  // Hitboxes as {group, min:[x,y,z], max:[x,y,z]} in world space.
  hitboxes() {
    const p = this.pos, h = this.height, k = h / MOVE.standHeight;
    const fx = -Math.sin(this.yaw) * 0.04, fz = -Math.cos(this.yaw) * 0.04;
    const b = (g, r, y0, y1, ox = 0, oz = 0) => ({ group: g, min: [p.x - r + ox, p.y + y0 * k, p.z - r + oz], max: [p.x + r + ox, p.y + y1 * k, p.z + r + oz] });
    return [
      b('head', 0.13, 1.55, 1.82, fx, fz),
      b('chest', 0.24, 1.18, 1.55),
      b('stomach', 0.22, 0.9, 1.18),
      b('legs', 0.2, 0.0, 0.9),
    ];
  }

  // CS-style ground/air acceleration. wish is a horizontal unit vector (or zero).
  simulate(dt, wish, wantJump, world) {
    // crouch transitions (can't stand up under a ceiling)
    const target = this.crouching ? 1 : 0;
    if (target < this.crouch) {
      const clear = !world.overlaps(this.pos.x - MOVE.half, this.pos.y + 0.05, this.pos.z - MOVE.half,
        this.pos.x + MOVE.half, this.pos.y + MOVE.standHeight, this.pos.z + MOVE.half);
      if (clear) this.crouch = Math.max(0, this.crouch - dt * 8);
    } else this.crouch = Math.min(1, this.crouch + dt * 8);

    const v = this.vel;
    const wishSpeed = wish.lengthSq() > 0 ? this.maxSpeed() : 0;
    if (this.onGround) {
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const control = Math.max(sp, MOVE.stopSpeed);
        const ns = Math.max(0, sp - control * MOVE.friction * dt);
        v.x *= ns / sp; v.z *= ns / sp;
      }
      if (wishSpeed > 0) {
        const cur = v.x * wish.x + v.z * wish.z;
        const add = wishSpeed - cur;
        if (add > 0) {
          const a = Math.min(MOVE.accel * wishSpeed * dt, add);
          v.x += wish.x * a; v.z += wish.z * a;
        }
      }
      if (wantJump) { v.y = MOVE.jump; this.onGround = false; this.justJumped = true; }
    } else {
      if (wishSpeed > 0) {
        const ws = Math.min(wishSpeed, MOVE.airCap);
        const cur = v.x * wish.x + v.z * wish.z;
        const add = ws - cur;
        if (add > 0) {
          const a = Math.min(MOVE.airAccel * wishSpeed * dt, add);
          v.x += wish.x * a; v.z += wish.z * a;
        }
      }
    }
    v.y -= MOVE.gravity * dt;
    const res = world.moveCharacter(this.pos, v, dt, MOVE.half, this.height, this.onGround ? MOVE.step : 0, this.onGround);
    const landed = !this.onGround && res.onGround;
    this.onGround = res.onGround;
    return landed;
  }

  // Current inaccuracy (radians, cone half-angle) for the held weapon.
  inaccuracy() {
    const d = this.weapon.def;
    if (d.type === 'melee') return 0;
    let s = d.baseSpread;
    if (d.scope && !this.scoped) s += d.unscopedSpread;
    const frac = Math.min(1, this.speed2D() / (MOVE.maxSpeed * d.moveSpeed));
    // standing still-ish (≤ ~34%) keeps nearly full accuracy, like counter-strafing
    s += d.moveSpread * Math.max(0, (frac - 0.34) / 0.66) ** 1.3;
    if (!this.onGround) s += d.airSpread;
    if (this.crouch > 0.5 && this.onGround) s *= d.crouchMul;
    return s;
  }
}
