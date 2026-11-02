// The bomb objective: one attacker carries it, plants it on a bombsite, and
// the defenders have to defuse it before the fuse runs out.
import * as THREE from 'three';
import { buildGun } from '../gunmodels.js';

export const BOMB = { plantTime: 3.2, defuseTime: 10, kitDefuseTime: 5, fuse: 40, radius: 24, damage: 520, reach: 1.7 };

export class Bomb {
  constructor(game) {
    this.g = game;
    this.mesh = buildGun('c4');
    this.mesh.visible = false;
    this.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.light = new THREE.PointLight(0xff2a2a, 0, 4, 2);
    this.mesh.add(this.light);
    game.scene.add(this.mesh);
    this.reset();
  }

  reset() {
    if (this.carrier) this.carrier.hasBomb = false;
    this.state = 'none';          // none | carried | dropped | planted | defused | exploded
    this.carrier = null; this.site = null;
    this.pos = new THREE.Vector3();
    this.timer = 0; this.plant = null; this.defuse = null;
    this.beepT = 0; this.vel = new THREE.Vector3();
    this.mesh.visible = false; this.light.intensity = 0;
  }

  give(ch) {
    if (this.carrier && this.carrier !== ch) this.carrier.hasBomb = false;
    this.state = 'carried'; this.carrier = ch; ch.hasBomb = true;
    this.mesh.visible = false; this.plant = null;
  }

  drop(ch, toss = true) {
    if (this.state !== 'carried' || this.carrier !== ch) return;
    ch.hasBomb = false;
    if (ch.slot === 5) ch.switchTo(ch.weapons[1] ? 1 : 2);
    this.state = 'dropped'; this.carrier = null; this.plant = null;
    this.pos.copy(ch.pos); this.pos.y += 1.0;
    this.vel.set(0, 0, 0);
    if (toss) { const f = ch.forward(); this.vel.set(f.x * 3.5, 2, f.z * 3.5); }
    this.mesh.visible = true;
    this.g.net?.event(['bomb', 'drop', +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)]);
  }

  // Which bombsite (if any) a position stands in.
  siteAt(p) {
    const nav = this.g.level.nav, [x, z] = nav.cellOf(p);
    const c = nav.at(x, z);
    if (c === 'A' || c === 'B') return c;
    if (c === '^' || c === 's') {
      let best = null, bd = 10;
      for (const L of ['A', 'B']) { const cc = this.g.level.sites[L].center; if (cc) { const d = Math.hypot(cc.x - p.x, cc.z - p.z); if (d < bd) { bd = d; best = L; } } }
      return best;
    }
    return null;
  }

  // Called every tick while a character holds "use" (or fires with the bomb out).
  // Returns plant progress 0..1, or -1 if they can't plant here.
  holdPlant(ch, dt) {
    if (this.state !== 'carried' || this.carrier !== ch || !ch.onGround) return -1;
    const site = this.siteAt(ch.pos);
    if (!site) return -1;
    if (!this.plant || this.plant.ch !== ch) {
      this.plant = { ch, t: 0, site };
      this.g.noise(ch.pos, 12, ch);
      this.g.audio.bombArm?.(ch.pos);
    }
    this.plant.t += dt; this.plant.seen = this.g.time;
    if (this.plant.t >= BOMB.plantTime) { this.doPlant(ch, site); return 1; }
    return this.plant.t / BOMB.plantTime;
  }

  doPlant(ch, site) {
    this.state = 'planted'; this.site = site; this.carrier = null; ch.hasBomb = false;
    if (ch.slot === 5) ch.switchTo(ch.weapons[1] ? 1 : 2);
    this.pos.copy(ch.pos);
    const f = ch.forward(); f.y = 0; f.normalize();
    this.pos.addScaledVector(f, 0.35);
    this.timer = BOMB.fuse; this.plant = null; this.beepT = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos); this.mesh.position.y += 0.04;
    this.mesh.rotation.set(0, ch.yaw, 0);
    this.g.onBombPlanted(ch, site);
  }

  // CT holding "use" near the planted bomb. Returns progress 0..1 or -1.
  holdDefuse(ch, dt) {
    if (this.state !== 'planted' || ch.team !== 'CT' || !ch.alive) return -1;
    if (Math.hypot(ch.pos.x - this.pos.x, ch.pos.z - this.pos.z) > BOMB.reach || Math.abs(ch.pos.y - this.pos.y) > 1.4) return -1;
    if (this.defuse && this.defuse.ch !== ch && this.g.time - this.defuse.seen < 0.15) return -1;   // someone else is on it
    if (!this.defuse || this.defuse.ch !== ch) {
      this.defuse = { ch, t: 0, dur: ch.hasKit ? BOMB.kitDefuseTime : BOMB.defuseTime };
      this.g.noise(ch.pos, 14, ch);
      this.g.audio.defuse?.(this.pos);
    }
    this.defuse.t += dt; this.defuse.seen = this.g.time;
    if (this.defuse.t >= this.defuse.dur) {
      this.state = 'defused'; this.light.intensity = 0;
      this.g.onBombDefused(ch);
      return 1;
    }
    return this.defuse.t / this.defuse.dur;
  }

  update(dt) {
    const g = this.g;
    if (this.plant && g.time - this.plant.seen > 0.12) this.plant = null;
    if (this.defuse && g.time - this.defuse.seen > 0.12) this.defuse = null;
    if (this.state === 'dropped') {
      // settle on the ground, then any living attacker can walk over it
      if (this.vel.lengthSq() > 0 || this.pos.y > 0.02) {
        this.vel.y -= 18 * dt;
        const step = this.vel.clone().multiplyScalar(dt);
        const hit = step.lengthSq() > 1e-8 ? g.level.world.raycast(this.pos, step.clone().normalize(), step.length() + 0.05) : null;
        if (hit) { this.pos.copy(hit.point).addScaledVector(hit.normal, 0.03); if (hit.normal.y > 0.7) this.vel.set(0, 0, 0); else this.vel.multiplyScalar(0.3); }
        else this.pos.add(step);
      }
      this.mesh.position.copy(this.pos);
      for (const ch of g.characters) {
        if (ch.alive && ch.team === 'T' && Math.hypot(ch.pos.x - this.pos.x, ch.pos.z - this.pos.z) < 0.9 && Math.abs(ch.pos.y - this.pos.y) < 1.3) {
          this.give(ch); g.onBombPickup(ch); break;
        }
      }
    }
    if (this.state === 'planted') {
      this.timer -= dt;
      // beeps speed up as the fuse burns down
      this.beepT -= dt;
      if (this.beepT <= 0) {
        const f = Math.max(0, this.timer / BOMB.fuse);
        this.beepT = 0.12 + 0.88 * f * f;
        g.audio.beep?.(this.pos, this.timer < 2 ? 2 : this.timer < 10 ? 1 : 0);
        this.light.intensity = 3;
      }
      this.light.intensity *= Math.exp(-dt * 12);
      const lamp = this.mesh.userData.lamp; if (lamp) lamp.material.emissiveIntensity = this.light.intensity;
      if (this.timer <= 0) this.explode();
    }
  }

  // Online clients: beep and blink from the host's timer.
  updateClient(dt) {
    if (this.state !== 'planted') { this.light.intensity = 0; return; }
    this.timer -= dt;
    this.beepT -= dt;
    if (this.beepT <= 0) {
      const f = Math.max(0, this.timer / BOMB.fuse);
      this.beepT = 0.12 + 0.88 * f * f;
      this.g.audio.beep?.(this.pos, this.timer < 2 ? 2 : this.timer < 10 ? 1 : 0);
      this.light.intensity = 3;
    }
    this.light.intensity *= Math.exp(-dt * 12);
  }

  explodeVisual() {
    const g = this.g;
    this.state = 'exploded'; this.mesh.visible = false; this.light.intensity = 0;
    g.grenades.blast({ pos: this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), team: null, owner: null }, true);
    g.grenades.flashLight(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0xffb060, 400, 0.8, 60);
    g.audio.explosion?.(this.pos, 1.6);
  }

  explode() {
    const g = this.g;
    this.state = 'exploded'; this.mesh.visible = false; this.light.intensity = 0;
    g.grenades.blast({ pos: this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), team: null, owner: null }, true);
    for (let i = 0; i < 4; i++) g.grenades.sprite(g.grenades.glowTex, this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4)), 9 + Math.random() * 5, 0.6, { additive: true, grow: 1 });
    g.grenades.flashLight(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0xffb060, 400, 0.8, 60);
    g.audio.explosion?.(this.pos, 1.6);
    g.decals.scorch(this.pos, new THREE.Vector3(0, 1, 0), 7);
    for (const ch of g.characters) {
      if (!ch.alive) continue;
      const d = ch.pos.distanceTo(this.pos);
      if (d > BOMB.radius) continue;
      let dmg = BOMB.damage * Math.exp(-(d * d) / (2 * (BOMB.radius / 3.2) ** 2));
      if (ch.armor > 0) dmg *= 0.6;
      if (dmg >= 1) g.environmentDamage(ch, Math.round(dmg), 'Bomb', this.pos);
    }
    g.onBombExploded();
  }

  // UI helper: seconds left (planted) or null
  get fuseLeft() { return this.state === 'planted' ? Math.max(0, this.timer) : null; }
}
