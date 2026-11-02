// Bot AI. A single `skill` value in [0, 1] drives reaction time, aim speed,
// aim error, spray control, head-shot preference and tactics, so bots can later
// be scaled to the player's rank.
import * as THREE from 'three';
import { Character } from './character.js';
import { findPath } from './level.js';
import { buildCharacter, buildGun } from './models.js';
import { applySkin, randomItemFor } from './items/render.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const DEG = Math.PI / 180;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function skillProfile(skill) {
  const s = Math.max(0, Math.min(1, skill));
  return {
    skill: s,
    reaction: 0.8 - 0.62 * s,            // seconds before reacting to a new enemy
    turnSpeed: (200 + 700 * s) * DEG,     // rad/s
    aimError: (7 - 6.2 * s) * DEG,        // initial aim offset
    errorDecay: 1.5 + 5 * s,              // how fast aim settles
    headPref: 0.12 + 0.7 * s,             // chance to aim for the head
    sprayControl: 0.15 + 0.8 * s,         // fraction of recoil compensated
    counterStrafe: s > 0.35,
    burstLen: Math.round(3 + s * 4),
    fov: (100 + 30 * s) * DEG,
    hearing: 10 + 18 * s,
  };
}

export class Bot extends Character {
  constructor(team, name, skill, game) {
    super(team, name, true);
    this.game = game;
    this.setSkill(skill);
    this.model = buildCharacter(team);
    this.gunModel = null;
    this.path = null; this.pathIdx = 0;
    this.goal = null; this.role = null;
    this.target = null; this.spottedAt = 0; this.lastSeen = null; this.lastSeenTime = -99;
    this.aimErr = new THREE.Vector2();
    this.burst = 0; this.burstPause = 0;
    this.thinkTimer = 0; this.stuckTimer = 0; this.lastPos = new THREE.Vector3();
    this.holdUntil = 0; this.lookYaw = 0;
    this.walkPhase = 0; this.deathAnim = 0;
    this.stepTimer = 0;
  }

  setSkill(skill) { this.prof = skillProfile(skill); }

  equip() {
    const holder = this.model.userData.gunHolder;
    if (this.gunModel) holder.remove(this.gunModel);
    const id = this.weapon.id;
    this.gunModel = buildGun(id === 'knife' ? 'knife:standard' : id);
    // bots keep one random finish per weapon for the whole match
    this.skins ||= {};
    if (!(id in this.skins)) this.skins[id] = Math.random() < 0.55 && id !== 'knife' ? randomItemFor(id) : null;
    if (this.skins[id]) applySkin(this.gunModel, this.skins[id], { size: 512 });
    holder.add(this.gunModel);
  }

  spawn(pos, yaw) {
    this.reset();
    this.pos.copy(pos); this.yaw = yaw; this.pitch = 0;
    this.path = null; this.target = null; this.lastSeen = null;
    this.deathAnim = 0; this.crouching = false; this.crouch = 0;
    this.model.visible = true;
    this.model.userData.body.rotation.set(0, 0, 0);
    this.model.userData.body.position.set(0, 0, 0);
    this.equip();
  }

  setGoal(p, role) {
    this.goal = p.clone(); this.role = role;
    this.path = findPath(this.game.level.nav, this.pos, this.goal);
    this.pathIdx = 0;
  }

  // Look for visible enemies.
  perceive(now) {
    const g = this.game;
    const eye = this.eyePos(tmp);
    const fwd = this.forward(tmp2);
    let best = null, bestD = Infinity;
    for (const e of g.characters) {
      if (!e.alive || e.team === this.team) continue;
      const head = e.eyePos(new THREE.Vector3());
      const chest = e.pos.clone(); chest.y += e.height * 0.7;
      const d = eye.distanceTo(chest);
      const dir = chest.clone().sub(eye).normalize();
      const inFov = dir.dot(fwd) > Math.cos(this.prof.fov / 2);
      const heard = d < this.prof.hearing && e.speed2D() > 3.5 && e.onGround;
      if (!inFov && !heard && e !== this.target) continue;
      if (!g.level.world.lineOfSight(eye, chest) && !g.level.world.lineOfSight(eye, head)) {
        if (heard) { this.lastSeen = e.pos.clone(); this.lastSeenTime = now; }
        continue;
      }
      if (!inFov && heard) { // turn toward the sound but don't instantly engage
        this.lastSeen = e.pos.clone(); this.lastSeenTime = now;
        continue;
      }
      if (d < bestD) { best = e; bestD = d; }
    }
    if (best && best !== this.target) {
      this.target = best;
      this.spottedAt = now + this.prof.reaction * (0.75 + Math.random() * 0.5);
      const e = this.prof.aimError * (0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2;
      this.aimErr.set(Math.cos(a) * e, Math.sin(a) * e);
      this.aimHead = Math.random() < this.prof.headPref;
      g.radarSpot(best);
    }
    if (!best && this.target) {
      this.lastSeen = this.target.pos.clone(); this.lastSeenTime = now;
      this.target = null;
    }
    if (best) { this.lastSeen = best.pos.clone(); this.lastSeenTime = now; g.radarSpot(best); }
  }

  update(dt, now) {
    if (!this.alive) { this.animateDeath(dt); return; }
    const g = this.game;
    const w = this.weapon;
    w.update(dt, now);

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this.perceive(now); this.thinkTimer = 0.08 + Math.random() * 0.05; }
    if (this.target && !this.target.alive) this.target = null;

    const wish = new THREE.Vector3();
    let wantYaw = this.yaw, wantPitch = 0;
    this.walking = false;

    if (this.target && !g.freeze) {
      // --- combat ---
      const t = this.target;
      const eye = this.eyePos(new THREE.Vector3());
      const aimPt = t.pos.clone();
      aimPt.y += this.aimHead ? t.height * 0.93 : t.height * 0.68;
      // lead slightly for moving targets
      aimPt.addScaledVector(t.vel, 0.05 * (1 - this.prof.skill));
      const dir = aimPt.sub(eye);
      const dist = dir.length();
      wantYaw = Math.atan2(-dir.x, -dir.z);
      wantPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      // settle aim error over time
      this.aimErr.multiplyScalar(Math.exp(-this.prof.errorDecay * dt));
      wantYaw += this.aimErr.x; wantPitch += this.aimErr.y;
      // spray compensation: pull down against our own recoil
      const comp = this.prof.sprayControl;
      wantPitch -= w.recoil[0] * DEG * comp;
      wantYaw += w.recoil[1] * DEG * comp;

      // strafe a little while shooting if unskilled, stop dead if skilled
      if (!this.prof.counterStrafe || w.def.type === 'melee') {
        const side = Math.sin(now * 2 + this.id) > 0 ? 1 : -1;
        wish.set(Math.cos(this.yaw) * side, 0, -Math.sin(this.yaw) * side);
        if (w.def.type === 'melee') wish.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      }
      this.crouching = this.prof.skill > 0.6 && dist > 18 && w.def.type === 'rifle' && w.shotIndex > 3;

      const err = Math.abs(angleDiff(this.yaw, wantYaw)) + Math.abs(this.pitch - wantPitch);
      const tol = Math.max(0.6 * DEG, Math.atan2(0.25, dist)) * (w.def.type === 'sniper' ? 0.5 : 1.4);
      if (w.ammo <= 0 && w.def.type !== 'melee') {
        if (!w.startReload() && w.reloading <= 0) this.switchTo(this.weapons[2].ammo > 0 ? 2 : 3);
      } else if (now >= this.spottedAt && err < tol + this.prof.aimError * 0.3) {
        this.tryFire(now, dist);
      }
      if (w.def.scope) this.scoped = now >= this.spottedAt - 0.2 ? 1 : 0;
    } else {
      this.scoped = 0;
      this.crouching = false;
      // --- navigation ---
      if (!g.freeze) {
        if (this.lastSeen && now - this.lastSeenTime < 6 && (!this.path || this.chasing !== this.lastSeenTime)) {
          if (this.pos.distanceTo(this.lastSeen) > 2) {
            this.path = findPath(g.level.nav, this.pos, this.lastSeen); this.pathIdx = 0;
            this.chasing = this.lastSeenTime;
          }
        }
        if (this.path && this.pathIdx < this.path.length) {
          // skip waypoints we can see past
          while (this.pathIdx + 1 < this.path.length) {
            const a = this.pos.clone(); a.y += 0.5;
            const b = this.path[this.pathIdx + 1].clone(); b.y = a.y;
            const side = b.clone().sub(a).normalize().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.35);
            if (g.level.world.lineOfSight(a.clone().add(side), b.clone().add(side)) &&
                g.level.world.lineOfSight(a.clone().sub(side), b.clone().sub(side))) this.pathIdx++;
            else break;
          }
          const wp = this.path[this.pathIdx];
          tmp.set(wp.x - this.pos.x, 0, wp.z - this.pos.z);
          const d = tmp.length();
          if (d < 0.7) this.pathIdx++;
          else {
            wish.copy(tmp.normalize());
            wantYaw = Math.atan2(-wish.x, -wish.z);
          }
          // walk silently when close to the goal on attack
          this.walking = this.role === 'hold' && this.goal && this.pos.distanceTo(this.goal) < 10 && this.prof.skill > 0.5;
          // stuck detection
          this.stuckTimer += dt;
          if (this.stuckTimer > 1) {
            if (this.pos.distanceTo(this.lastPos) < 0.5) {
              this.path = findPath(g.level.nav, this.pos, this.goal || this.pos); this.pathIdx = 0;
              this.vel.y = this.onGround ? 7 : this.vel.y; this.onGround = false;
            }
            this.lastPos.copy(this.pos); this.stuckTimer = 0;
          }
        } else {
          // reached goal: hold and scan, then pick a new one
          if (this.lastSeen && now - this.lastSeenTime < 3) {
            wantYaw = Math.atan2(-(this.lastSeen.x - this.pos.x), -(this.lastSeen.z - this.pos.z));
          } else {
            if (now > this.holdUntil) {
              this.lookYaw = this.yaw + (Math.random() - 0.5) * 2.4;
              this.holdUntil = now + 1.5 + Math.random() * 2.5;
              if (Math.random() < 0.25 || g.roundTime > 45) g.assignHunt(this);
            }
            wantYaw = this.lookYaw;
          }
          if (w.ammo < w.def.magSize * 0.5) w.startReload();
        }
      }
    }

    // turn toward desired angles at a limited rate
    const maxTurn = this.prof.turnSpeed * dt;
    const dy = angleDiff(wantYaw, this.yaw);
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy * Math.min(1, dt * 14)));
    const dp = wantPitch - this.pitch;
    this.pitch += Math.max(-maxTurn, Math.min(maxTurn, dp * Math.min(1, dt * 14)));

    if (g.freeze) wish.set(0, 0, 0);
    this.simulate(dt, wish, false, g.level.world);

    // footsteps
    if (this.onGround && this.speed2D() > 3.6) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { g.audio.step(this.pos, 0.8); this.stepTimer = 0.36; }
    }
    this.animate(dt);
  }

  tryFire(now, dist) {
    const w = this.weapon, d = w.def;
    if (!w.canFire(now)) return;
    if (now < this.burstPause) return;
    if (d.type === 'melee') { if (dist < d.range + 0.5) this.game.fire(this, now); return; }
    if (d.type === 'rifle') {
      const len = dist < 12 ? 30 : dist < 25 ? this.prof.burstLen : 2;
      this.game.fire(this, now);
      this.burst++;
      if (this.burst >= len) { this.burst = 0; this.burstPause = now + 0.25 + (1 - this.prof.skill) * 0.3; }
    } else {
      this.game.fire(this, now);
      this.burstPause = now + (d.type === 'sniper' ? 0 : 0.12 + (1 - this.prof.skill) * 0.25);
    }
  }

  animate(dt) {
    const u = this.model.userData;
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    const sp = this.speed2D();
    this.walkPhase += dt * sp * 1.6;
    const sw = Math.sin(this.walkPhase) * Math.min(1, sp / 4) * 0.6;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.legL.userData.knee.rotation.x = Math.max(0, -sw) * 0.8;
    u.legR.userData.knee.rotation.x = Math.max(0, sw) * 0.8;
    // crouch: drop torso and bend legs
    const c = this.crouch;
    u.torso.position.y = 0.9 - 0.42 * c;
    u.legL.position.y = u.legR.position.y = 0.9 - 0.42 * c;
    if (c > 0) {
      u.legL.rotation.x += -0.9 * c; u.legR.rotation.x += -0.9 * c;
      u.legL.userData.knee.rotation.x += 1.6 * c; u.legR.userData.knee.rotation.x += 1.6 * c;
    }
    u.torso.rotation.x = this.pitch * 0.6;
    u.head.rotation.x = this.pitch * 0.4;
  }

  animateDeath(dt) {
    if (this.deathAnim < 1) {
      this.deathAnim = Math.min(1, this.deathAnim + dt * 2.5);
      const u = this.model.userData;
      const e = 1 - (1 - this.deathAnim) ** 3;
      u.body.rotation.x = e * (Math.PI / 2) * this.deathDir;
      u.body.position.y = 0.1 * e;
    }
  }
}
