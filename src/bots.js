// Bot AI. A single `skill` value in [0, 1] drives reaction time, aim speed,
// aim error, spray control, head-shot preference and tactics, so bots can be
// scaled to the player's rank. Bots only know about enemies they have seen,
// heard (gunfire, footsteps, grenades, the bomb) or been shot by.
import * as THREE from 'three';
import { Character } from './character.js';
import { findPath } from './level.js';
import { buildCharacter, buildGun, poseCharacter, startRagdoll, stepRagdoll } from './models.js';
import { applySkinAsync, randomItemFor } from './items/render.js';
import { WEAPONS } from './weapons.js';

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
    reaction: 0.62 - 0.42 * s,           // seconds before shooting at a newly seen enemy
    turnSpeed: (200 + 520 * s) * DEG,     // rad/s
    aimError: (4.5 - 3.3 * s) * DEG,      // first-look error even with the crosshair already on them
    flickError: 0.2 - 0.13 * s,           // plus this share of how far the aim had to swing
    errorDecay: 2.2 + 4 * s,              // how fast that settles
    tremor: (1.1 - 0.82 * s) * DEG,       // aim never settles perfectly (hand shake, tracking)
    trackLag: 0.18 - 0.12 * s,            // how stale the read on a moving target is (s)
    flinch: (0.7 - 0.5 * s) * DEG,        // aim knocked off by each shot fired
    headPref: 0.1 + 0.4 * s,              // chance to aim for the head
    sprayControl: 0.15 + 0.7 * s,         // fraction of recoil compensated
    burstLen: Math.round(2 + s * 3),
    peek: 0.1 + 0.35 * s,                 // chance to side-step between bursts
    fov: (95 + 30 * s) * DEG,
    hearing: 10 + 18 * s,
    hearingMul: 0.7 + 0.5 * s,
    nadeUse: 0.25 + 0.6 * s,              // chance to use utility when it makes sense
  };
}

const T_RIFLES = [['ak47', 0.66], ['sg550', 0.12], ['scarh', 0.1], ['galil', 0.12]];
const CT_RIFLES = [['m4a1', 0.32], ['m4a1s', 0.3], ['aug', 0.14], ['scarh', 0.1], ['famas', 0.14]];
const T_FORCE = ['mac10', 'galil', 'ump45', 'mp7', 'pump', 'dbarrel', 'mp5'];
const CT_FORCE = ['vector', 'famas', 'mp5', 'ump45', 'mp7', 'm1014', 'pump'];
const ECO_PISTOLS = ['deagle', 'fiveseven', 'm1911', 'vz61', 'revolver'];

function weighted(list) { let r = Math.random(); for (const [id, w] of list) { if ((r -= w) <= 0) return id; } return list[0][0]; }

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
    this.fireKick = 0;
    this.resetGear();
  }

  setSkill(skill) { this.prof = skillProfile(skill); }

  equip() {
    const holder = this.model.userData.gunHolder;
    if (this.gunModel) holder.remove(this.gunModel);
    const w = this.weapon;
    if (!w) return;
    const id = w.id;
    this.gunModel = buildGun(id === 'knife' ? 'knife:standard' : id, { lod: true });
    // bots keep one random finish per weapon for the whole match
    this.skins ||= {};
    if (!(id in this.skins)) this.skins[id] = Math.random() < 0.55 && w.def.pattern ? randomItemFor(id) : null;
    // painted in the background at a size that suits a gun seen from metres away
    if (this.skins[id]) applySkinAsync(this.gunModel, this.skins[id], { size: 256 });
    // the point that sits in the shoulder: back end of the stock, at bore height
    const bb = new THREE.Box3().setFromObject(this.gunModel);
    this.gunModel.userData.rear = new THREE.Vector3(0, this.gunModel.userData.muzzle?.y ?? 0.03, bb.max.z - 0.02);
    holder.add(this.gunModel);
    this.heldId = id;
  }

  switchTo(slot) {
    const ok = super.switchTo(slot);
    if (ok) this.equip();
    return ok;
  }

  spawn(pos, yaw) {
    this.reset();
    this.pos.copy(pos); this.yaw = yaw; this.pitch = 0;
    this.path = null; this.target = null; this.lastSeen = null; this.lastSeenTime = -99;
    this.deathAnim = 0; this.crouching = false; this.crouch = 0;
    this.bought = false; this.buyDelay = 0.3 + Math.random() * 3;
    this.nadeUsedAt = -99; this.planting = false; this.defusing = false;
    this.model.visible = true; this.despawned = false;
    this.clearRagdoll();
    this.slot = 0; super.switchTo(this.bestSlot());
    this.equip();
  }

  setGoal(p, role) {
    this.goal = p.clone(); this.role = role;
    this.path = findPath(this.game.level.nav, this.pos, this.goal);
    this.pathIdx = 0;
  }

  // ---------------------------------------------------------------- economy
  buyGear() {
    const g = this.game, T = this.team === 'T';
    const buy = (id) => !!g.buy(this, id).ok;
    if (!this.weapons[1]) {
      const full = this.money >= (T ? 3700 : 4100);
      const force = !full && this.money >= 2100 && (g.lossStreak[this.team] >= 2 || Math.random() < 0.35);
      if (full) {
        const awper = this.money >= 5900 && Math.random() < 0.16 && !g.characters.some(c => c !== this && c.team === this.team && c.weapons?.[1]?.id === 'awp');
        buy(awper ? 'awp' : weighted(T ? T_RIFLES : CT_RIFLES));
      } else if (force) {
        const opts = (T ? T_FORCE : CT_FORCE).filter(id => WEAPONS[id].price <= this.money - 650);
        if (opts.length) buy(opts[Math.floor(Math.random() * opts.length)]);
      } else if (this.money >= 900 && Math.random() < 0.45) {
        buy(ECO_PISTOLS[Math.floor(Math.random() * ECO_PISTOLS.length)]);
      }
    }
    if (this.armor < 100 || !this.helmet) { if (!buy('vesthelm') && this.armor < 100) buy('vest'); }
    if (!T && !this.hasKit && this.money >= 400 && Math.random() < 0.55) buy('kit');
    const nades = ['flash', 'smoke', 'he', T ? 'molotov' : 'incendiary', 'flash'].sort(() => Math.random() - 0.5);
    for (const n of nades) if (this.money >= 600 || (this.weapons[1] && this.money >= 300)) buy(n);
  }

  // ---------------------------------------------------------------- senses
  // Look for visible enemies (not through walls or smoke, not while flashed).
  perceive(now) {
    const g = this.game;
    if (now < this.blindUntil) return;
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
      const heard = d < this.prof.hearing && e.speed2D() > 3.5 && e.onGround && !e.walking;
      if (!inFov && !heard && e !== this.target) continue;
      const seeChest = g.level.world.lineOfSight(eye, chest) && !g.grenades.blocksSight(eye, chest);
      const seeHead = g.level.world.lineOfSight(eye, head) && !g.grenades.blocksSight(eye, head);
      if (!seeChest && !seeHead) {
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
      const to = best.pos.clone().sub(this.pos);
      const off = Math.abs(angleDiff(Math.atan2(-to.x, -to.z), this.yaw));
      this.spottedAt = now + this.prof.reaction * (0.8 + Math.random() * 0.4) + (bestD > 30 ? 0.08 : 0) + Math.min(0.15, off * 0.15);
      this.trackPt = null;
      // good crosshair placement pays off: the first look is off by a little,
      // plus a share of however far the aim had to swing to get there
      const e = (this.prof.aimError + off * this.prof.flickError) * (0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2;
      this.aimErr.set(Math.cos(a) * e, Math.sin(a) * e);
      this.aimHead = Math.random() < this.prof.headPref;
      g.radarSpot(best);
      g.strategy?.report(this, best.pos, best.hasBomb);
    }
    if (!best && this.target) {
      this.lastSeen = this.target.pos.clone(); this.lastSeenTime = now;
      this.target = null;
    }
    if (best) { this.lastSeen = best.pos.clone(); this.lastSeenTime = now; g.radarSpot(best); }
  }

  // A sound from the other team: remember roughly where it came from.
  hear(pos, now, frac = 0.5) {
    if (this.target) return;
    if (frac < 0.6) this.game.strategy?.report(this, pos, false);
    const fuzz = 1 + frac * 5;
    this.lastSeen = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * fuzz, 0, (Math.random() - 0.5) * fuzz));
    this.lastSeenTime = now;
  }

  onHurt(attacker, now) {
    if (this.target) return;
    this.lastSeen = attacker.pos.clone(); this.lastSeenTime = now;
    this.lookYaw = Math.atan2(-(attacker.pos.x - this.pos.x), -(attacker.pos.z - this.pos.z));
    this.holdUntil = now + 2;
    // shot from somewhere it wasn't looking: spin round to find the shooter
    this.alert = { until: now + 1.6, yaw: this.lookYaw };
  }

  onBombPlanted(bomb) {
    if (!this.alive || this.puppet) return;
    if (this.team === 'CT') this.setGoal(bomb.pos.clone(), 'retake');
    else if (this.game.strategy?.enabled) return;   // the team plan places the guards
    else {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 7;
      const p = bomb.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      const nav = this.game.level.nav, [cx, cz] = nav.cellOf(p);
      this.setGoal(nav.walkable(cx, cz) ? nav.center(cx, cz) : bomb.pos.clone(), 'guard');
    }
  }

  // Network-driven character (remote human on the host, or anyone on a client):
  // ease toward the latest reported state and animate.
  updatePuppet(dt) {
    if (!this.alive) { this.animateDeath(dt); return; }
    const t = this.netTarget;
    if (t) {
      const k = 1 - Math.exp(-dt * 14);
      const px = this.pos.x, pz = this.pos.z;
      this.pos.lerp(t.pos, k);
      if (dt > 0) { this.vel.x = this.vel.x * 0.8 + (this.pos.x - px) / dt * 0.2; this.vel.z = this.vel.z * 0.8 + (this.pos.z - pz) / dt * 0.2; }
      let dy = t.yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * k; this.pitch += (t.pitch - this.pitch) * k;
      this.crouch = t.crouch;
    }
    this.onGround = true;
    if (this.speed2D() > 3.6) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.game.audio.step(this.pos, 0.8); this.stepTimer = 0.36; this.game.noise(this.pos, 18, this); }
    }
    // host: remote humans plant/defuse through the same bomb logic
    const g = this.game;
    if (this.human && g.net?.isHost && this.useHeld && !g.freeze) {
      if (this.hasBomb) g.bomb.holdPlant(this, dt); else if (this.team === 'CT') g.bomb.holdDefuse(this, dt);
    }
    this.animate(dt);
  }

  update(dt, now) {
    if (this.puppet || (this.game.net && !this.game.net.isHost)) { this.updatePuppet(dt); return; }
    if (!this.alive) { this.animateDeath(dt); return; }
    const g = this.game;
    if (g.state === 'freeze' && !this.bought) { this.buyDelay -= dt; if (this.buyDelay <= 0) { this.bought = true; this.buyGear(); } }
    const w = this.weapon;
    w.update(dt, now);

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this.perceive(now); this.thinkTimer = 0.08 + Math.random() * 0.05; }
    if (this.target && !this.target.alive) this.target = null;

    const wish = new THREE.Vector3();
    let wantYaw = this.yaw, wantPitch = 0;
    this.walking = false;
    this.planting = this.defusing = false;
    const blind = now < this.blindUntil;

    if (this.target && !g.freeze) {
      // --- combat: make sure a gun is out
      if ((w.def.type === 'grenade' || w.def.type === 'bomb' || (w.def.type === 'melee' && (this.weapons[1] || this.weapons[2]))) && this.slot !== this.bestSlot()) this.switchTo(this.bestSlot());
      const t = this.target;
      const eye = this.eyePos(new THREE.Vector3());
      const P = this.prof;
      // Tracking like a person: aim from where the target was a moment ago
      // (trackLag), carried forward along the way it was moving then. Steady
      // movement is led correctly; a change of direction fools the aim for
      // that moment, which is what makes strafing worth doing.
      const lag = P.trackLag;
      const hist = this.trackHist ||= [];
      // start over for a new target, or after losing sight of this one for a moment
      if (this.trackFor !== t || !this.trackPt || (hist.length && now - hist[hist.length - 4] > 0.2)) { hist.length = 0; this.trackFor = t; }
      hist.push(now, t.pos.x, t.pos.y, t.pos.z);
      while (hist.length > 8 && hist[0] < now - 0.6) hist.splice(0, 4);
      const at = (when, out) => {
        if (when <= hist[0]) return out.set(hist[1], hist[2], hist[3]);
        for (let i = 4; i < hist.length; i += 4) {
          if (hist[i] >= when) {
            const t0 = hist[i - 4], k = (when - t0) / Math.max(1e-6, hist[i] - t0);
            return out.set(hist[i - 3] + (hist[i + 1] - hist[i - 3]) * k, hist[i - 2] + (hist[i + 2] - hist[i - 2]) * k, hist[i - 1] + (hist[i + 3] - hist[i - 1]) * k);
          }
        }
        return out.set(hist[hist.length - 3], hist[hist.length - 2], hist[hist.length - 1]);
      };
      const seen = at(now - lag, new THREE.Vector3()), before = at(now - lag - 0.06, new THREE.Vector3());
      const goal = seen.addScaledVector(seen.clone().sub(before), lag / 0.06);
      goal.y = t.pos.y + (this.aimHead ? t.height * 0.93 : t.height * 0.68);
      this.trackPt = goal;
      const dir = this.trackPt.clone().sub(eye);
      const dist = dir.length();
      wantYaw = Math.atan2(-dir.x, -dir.z);
      wantPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      // first-look error settles over time; a small wobble never goes away
      this.aimErr.multiplyScalar(Math.exp(-P.errorDecay * dt));
      const ph = this.id * 1.7;
      wantYaw += this.aimErr.x + P.tremor * (Math.sin(now * 1.9 + ph) * 0.6 + Math.sin(now * 3.7 + ph * 2) * 0.4);
      wantPitch += this.aimErr.y + P.tremor * 0.7 * (Math.sin(now * 2.3 + ph * 3) * 0.6 + Math.sin(now * 4.1 + ph) * 0.4);
      if (blind) { wantYaw += Math.sin(now * 3.1) * 0.5; wantPitch += Math.sin(now * 2.3) * 0.15; }
      const comp = P.sprayControl;
      wantPitch -= this.weapon.recoil[0] * DEG * comp;
      wantYaw += this.weapon.recoil[1] * DEG * comp;
      const cw = this.weapon;
      // stand still to shoot (counter-strafe); now and then side-step between bursts
      if (cw.def.type === 'melee') wish.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      else if (this.strafe && now < this.strafe.until) wish.set(Math.cos(this.yaw) * this.strafe.dir, 0, -Math.sin(this.yaw) * this.strafe.dir);
      this.crouching = P.skill > 0.6 && dist > 22 && cw.def.auto && cw.shotIndex > 4;
      const err = Math.abs(angleDiff(this.yaw, wantYaw)) + Math.abs(this.pitch - wantPitch);
      const tol = Math.max(0.6 * DEG, Math.atan2(0.22, dist)) * (cw.def.type === 'sniper' ? 0.5 : 1.3);
      const still = this.speed2D() < this.maxSpeed() * 0.38;
      if (cw.reloading > 0 && cw.def.type !== 'melee') {
        // reloading in the open: back away and to the side instead of standing there
        this.reloadSide ||= Math.random() < 0.5 ? -1 : 1;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        wish.set(-fx * 0.7 + Math.cos(this.yaw) * this.reloadSide * 0.7, 0, -fz * 0.7 - Math.sin(this.yaw) * this.reloadSide * 0.7);
      } else this.reloadSide = 0;
      if (cw.def.pattern && cw.ammo <= 0) {
        if (!cw.startReload() && cw.reloading <= 0) this.switchTo(this.weapons[2]?.ammo > 0 && this.slot !== 2 ? 2 : 3);
      } else if (now >= this.spottedAt && (still || cw.def.type === 'melee') && (!this.strafe || now >= this.strafe.until) && (err < tol || blind)) {
        this.tryFire(now, dist);
      }
      if (cw.def.scope) this.scoped = now >= this.spottedAt - 0.2 ? 1 : 0;
    } else {
      this.scoped = 0;
      this.crouching = false;
      if (!g.freeze) {
        const nav = this.objective(dt, now);
        if (nav === 'rooted') { wish.set(0, 0, 0); this.crouching = true; }
        else {
          // players holding a spot (or waiting for the team) only turn toward far-off
          // sounds; they go after something only when it's close
          const holding = this.role === 'hold' || this.role === 'default' || this.role === 'gather' || this.role === 'split' || this.role === 'guard';
          const chase = this.lastSeen && now - this.lastSeenTime < 6 && this.role !== 'retake' && this.role !== 'deny' && !this.hasBomb &&
            (!holding || this.pos.distanceTo(this.lastSeen) < 9);
          if (chase && (!this.path || this.chasing !== this.lastSeenTime)) {
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
            else if (g.grenades.burning(wp) && this.role !== 'retake') {
              wantYaw = Math.atan2(-tmp.x, -tmp.z);   // wait for the fire to burn out
            } else {
              wish.copy(tmp.normalize());
              wantYaw = Math.atan2(-wish.x, -wish.z);
              // a recent sighting or sound nearby: walk with the crosshair on it
              if (this.lastSeen && now - this.lastSeenTime < 5) {
                const lx = this.lastSeen.x - this.pos.x, lz = this.lastSeen.z - this.pos.z, ld = Math.hypot(lx, lz);
                if (ld > 3 && ld < 35) wantYaw = Math.atan2(-lx, -lz);
              }
            }
            this.walking = this.role === 'hold' && this.goal && this.pos.distanceTo(this.goal) < 10 && this.prof.skill > 0.5;
            this.stuckTimer += dt;
            if (this.stuckTimer > 1) {
              if (this.pos.distanceTo(this.lastPos) < 0.5) {
                // blocked (a teammate, a prop): step aside and find the way again, no jumping
                this.path = findPath(g.level.nav, this.pos, this.goal || this.pos); this.pathIdx = 0;
                this.nudge = { until: now + 0.45, dir: Math.random() < 0.5 ? -1 : 1 };
              }
              this.lastPos.copy(this.pos); this.stuckTimer = 0;
            }
            if (this.nudge && now < this.nudge.until) {
              const sx = -wish.z * this.nudge.dir, sz = wish.x * this.nudge.dir;
              wish.set(wish.x * 0.3 + sx, 0, wish.z * 0.3 + sz).normalize();
            }
          } else {
            // reached the goal: hold and scan, then pick a new one
            if (this.lastSeen && now - this.lastSeenTime < 3) {
              wantYaw = Math.atan2(-(this.lastSeen.x - this.pos.x), -(this.lastSeen.z - this.pos.z));
            } else {
              if (now > this.holdUntil) {
                // hold the spot's angle with small sweeps, or look around if it has none
                this.lookYaw = this.holdLook != null ? this.holdLook + (Math.random() - 0.5) * 0.7 : this.yaw + (Math.random() - 0.5) * 2.4;
                this.holdUntil = now + 1.5 + Math.random() * 2.5;
                const planned = g.strategy?.enabled;
                const strategic = this.role === 'hold' || this.role === 'default' || this.role === 'gather' || this.role === 'split';
                const late = planned ? g.roundTime > 60 : g.roundTime > 45;
                if (this.role !== 'guard' && this.role !== 'retake' && this.role !== 'deny' && !this.hasBomb && !(planned && strategic) && (late || (!planned && Math.random() < 0.25))) g.assignHunt(this);
              }
              wantYaw = this.lookYaw;
            }
            if (this.weapon.def.pattern && this.weapon.ammo < this.weapon.def.magSize * 0.5) this.weapon.startReload();
          }
        }
        if (this.aimNade) { wantYaw = this.aimNade.yaw; wantPitch = this.aimNade.pitch; }
        // just got shot by someone unseen: face that way and ease off to spot them
        if (this.alert && now < this.alert.until && nav !== 'rooted') {
          wantYaw = this.alert.yaw; wantPitch = 0;
          wish.multiplyScalar(0.25);
        }
      }
    }
    if (this.target) this.alert = null;

    // turn toward desired angles at a limited rate. While tracking a target the
    // aim also moves with it (feed-forward), the way a person follows a runner,
    // instead of always trailing behind it.
    const maxTurn = this.prof.turnSpeed * dt;
    let ffYaw = 0, ffPitch = 0;
    if (this.target && this.prevWant && this.prevWant.t === this.target && dt > 0) {
      ffYaw = angleDiff(wantYaw, this.prevWant.yaw);
      ffPitch = wantPitch - this.prevWant.pitch;
      if (Math.abs(ffYaw) > 0.2 || Math.abs(ffPitch) > 0.2) ffYaw = ffPitch = 0;   // a jump, not motion
    }
    this.prevWant = this.target ? { t: this.target, yaw: wantYaw, pitch: wantPitch } : null;
    const dy = angleDiff(wantYaw, this.yaw + ffYaw);
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, ffYaw + dy * Math.min(1, dt * 14)));
    const dp = wantPitch - (this.pitch + ffPitch);
    this.pitch += Math.max(-maxTurn, Math.min(maxTurn, ffPitch + dp * Math.min(1, dt * 14)));

    if (g.freeze) wish.set(0, 0, 0);
    this.simulate(dt, wish, false, g.level.world);

    // footsteps
    if (this.onGround && this.speed2D() > 3.6) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { g.audio.step(this.pos, 0.8); this.stepTimer = 0.36; g.noise(this.pos, 18, this); }
    }
    this.animate(dt);
  }

  // Bomb duties and utility. Returns 'rooted' while planting or defusing.
  objective(dt, now) {
    const g = this.game, bomb = g.bomb;
    // throwing a grenade lined up earlier
    if (this.aimNade) {
      if (this.weapon.def.type === 'grenade' && Math.abs(angleDiff(this.yaw, this.aimNade.yaw)) < 0.08 && this.weapon.deploying <= 0) {
        g.throwNade(this, this.aimNade.power); this.aimNade = null;
      } else if (now > this.aimNade.until) this.aimNade = null;
      return 'aim';
    }
    if (this.hasBomb) {
      const site = bomb.siteAt(this.pos);
      if (site && g.state === 'live' && (!this.lastSeen || now - this.lastSeenTime > 2)) {
        if (this.slot !== 5) this.switchTo(5);
        const pr = bomb.holdPlant(this, dt);
        if (pr >= 0) { this.planting = true; return 'rooted'; }
      }
      const planSite = g.strategy?.enabled ? g.strategy.carrierGoalSite() : (g.tSite || 'A');
      if (planSite && (this.role !== 'attack' || !this.goal || !bomb.siteAt(this.goal))) this.setGoal(g.siteGoal(planSite), 'attack');
    }
    if (this.team === 'T' && bomb.state === 'dropped' && this.role !== 'fetch') {
      // the closest attacker fetches a dropped bomb
      const ts = g.characters.filter(c => c.alive && c.team === 'T' && c.isBot && !c.puppet);
      const near = ts.sort((a, b) => a.pos.distanceTo(bomb.pos) - b.pos.distanceTo(bomb.pos))[0];
      if (near === this) this.setGoal(bomb.pos.clone(), 'fetch');
    }
    if (this.team === 'CT' && bomb.state === 'planted') {
      if (this.role !== 'retake') this.setGoal(bomb.pos.clone(), 'retake');
      if (this.pos.distanceTo(bomb.pos) < 1.5 && (!this.lastSeen || now - this.lastSeenTime > 1.5 || bomb.timer < (this.hasKit ? 6 : 11))) {
        const pr = bomb.holdDefuse(this, dt);
        if (pr >= 0) { this.defusing = true; return 'rooted'; }
      }
    }
    // utility: attackers smoke/flash the site they're pushing; defenders burn or frag where they heard enemies
    if (this.nades.length && now - this.nadeUsedAt > 8 && Math.random() < this.prof.nadeUse * dt) {
      let at = null, want = null;
      if (this.team === 'T' && this.goal && this.role === 'attack') {
        const d = this.pos.distanceTo(this.goal);
        if (d < 22 && d > 8) { at = this.goal; want = ['smoke', 'flash', 'molotov', 'he']; }
      } else if (this.team === 'CT' && this.lastSeen && now - this.lastSeenTime < 3) {
        const d = this.pos.distanceTo(this.lastSeen);
        if (d < 24 && d > 6) { at = this.lastSeen; want = ['incendiary', 'he', 'flash']; }
      }
      const type = want?.find(t => this.nades.includes(t));
      if (type && at && g.level.world.lineOfSight(this.eyePos(), at.clone().add(new THREE.Vector3(0, 1.4, 0)))) {
        const to = at.clone().sub(this.pos), dist = Math.hypot(to.x, to.z);
        this.slot !== 4 && this.switchTo(4);
        this.selectNade(type); this.equip();
        this.weapons[4].deploying = 0.4;
        this.aimNade = { yaw: Math.atan2(-to.x, -to.z), pitch: Math.min(0.75, 0.12 + dist * 0.018), power: Math.min(1, 0.45 + dist / 26), until: now + 2.5 };
        this.nadeUsedAt = now;
        return 'aim';
      }
    }
    return null;
  }

  tryFire(now, dist) {
    const w = this.weapon, d = w.def;
    if (!w.canFire(now)) return;
    if (now < this.burstPause) return;
    if (d.type === 'melee') { if (dist < d.range + 0.5) this.game.fire(this, now); return; }
    if (d.type === 'shotgun' && dist > 16) return;
    const P = this.prof;
    const flinch = () => {
      const a = Math.random() * Math.PI * 2, e = P.flinch * (0.5 + Math.random());
      this.aimErr.x += Math.cos(a) * e; this.aimErr.y += Math.sin(a) * e * 0.6;
    };
    const afterBurst = (pause) => {
      this.burstPause = now + pause;
      // between bursts, sometimes take a short side-step and re-settle
      if (Math.random() < P.peek && d.type !== 'sniper') this.strafe = { until: now + 0.2 + Math.random() * 0.18, dir: Math.random() < 0.5 ? -1 : 1 };
    };
    if (d.auto) {
      const len = dist < 10 ? 6 + Math.round(P.skill * 6) : dist < 25 ? P.burstLen : 2;
      this.game.fire(this, now);
      flinch();
      this.burst++;
      if (this.burst >= len) { this.burst = 0; afterBurst(0.3 + (1 - P.skill) * 0.35); }
    } else {
      this.game.fire(this, now);
      flinch();
      afterBurst(d.type === 'sniper' ? 0.2 : 0.16 + (1 - P.skill) * 0.3);
    }
  }

  onFire() { this.fireKick = 1; }

  muzzleWorld() {
    const m = this.gunModel?.userData.muzzle;
    if (!m) return this.eyePos().addScaledVector(this.forward(), 0.8);
    this.model.updateMatrixWorld(true);
    return this.gunModel.localToWorld(m.clone());
  }

  animate(dt) { poseCharacter(this, dt); }

  onDeath(dir) { startRagdoll(this, dir); }

  animateDeath(dt) { stepRagdoll(this, dt); }

  clearRagdoll() { this.ragdoll = null; }
}
