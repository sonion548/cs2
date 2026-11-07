// Weapons lying on the ground: dropped by hand, on death, or replaced by a
// purchase. Walk over one to take it if that slot is empty, or look at it and
// press Use to swap.
import * as THREE from 'three';
import { buildGun } from '../gunmodels.js';
import { applySkinAsync } from '../items/render.js';

export class Drops {
  constructor(game) { this.g = game; this.list = []; }

  // ws: WeaponState (keeps its ammo); skin: inventory item for the finish (or null)
  add(ws, pos, vel = new THREE.Vector3(), skin = null) {
    if (!ws || ws.def.type === 'melee') return null;
    const mesh = buildGun(ws.id, { lod: true });
    if (skin) applySkinAsync(mesh, skin, { size: 256 });
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    mesh.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2);
    this.g.scene.add(mesh);
    const d = { ws, skin, mesh, pos: pos.clone(), vel: vel.clone(), t: 0, settled: false };
    this.list.push(d);
    if (this.list.length > 40) this.remove(this.list[0]);
    return d;
  }

  remove(d) {
    this.g.scene.remove(d.mesh);
    const i = this.list.indexOf(d); if (i >= 0) this.list.splice(i, 1);
  }

  update(dt) {
    const g = this.g;
    for (const d of [...this.list]) {
      d.t += dt;
      if (!d.settled) {
        d.vel.y -= 18 * dt;
        const step = d.vel.clone().multiplyScalar(dt);
        const len = step.length();
        const hit = len > 1e-6 ? g.level.world.raycast(d.pos, step.clone().divideScalar(len), len + 0.06) : null;
        if (hit) {
          d.pos.copy(hit.point).addScaledVector(hit.normal, 0.04);
          if (hit.normal.y > 0.7) { d.settled = true; d.vel.set(0, 0, 0); } else d.vel.multiplyScalar(-0.25);
        } else d.pos.add(step);
      }
      d.mesh.position.copy(d.pos);
      if (d.t < 0.6) continue;   // can't instantly re-grab what you just threw
      for (const ch of g.characters) {
        if (!ch.alive || !ch.weapons) continue;
        const slot = d.ws.def.slot;
        if (ch.weapons[slot]) continue;
        if (Math.hypot(ch.pos.x - d.pos.x, ch.pos.z - d.pos.z) < 0.85 && Math.abs(ch.pos.y + 0.3 - d.pos.y) < 1.2) { this.take(ch, d); break; }
      }
    }
  }

  take(ch, d) {
    const slot = d.ws.def.slot;
    ch.weapons[slot] = d.ws;
    if (d.skin && ch.isBot) { ch.skins ||= {}; ch.skins[d.ws.id] = d.skin; }
    this.remove(d);
    this.g.onPickup(ch, slot);
  }

  // Nearest drop the character is looking at within reach.
  aimed(ch, reach = 1.8) {
    const eye = ch.eyePos(), fwd = ch.forward();
    let best = null, bd = 0.82;
    for (const d of this.list) {
      const to = d.pos.clone().sub(eye), dist = to.length();
      if (dist > reach + 1.2) continue;
      const dot = to.divideScalar(dist).dot(fwd);
      if (dot > bd) { bd = dot; best = d; }
    }
    return best;
  }

  clear() { for (const d of [...this.list]) this.remove(d); }
}
