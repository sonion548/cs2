// Weapon definitions. Stats and spray patterns are this project's own design.
//
// Spray patterns are authored as keyframes [shotIndex, pitchUpDeg, yawRightDeg]
// (cumulative offset of the bullet from the crosshair) and linearly interpolated
// per shot. Every gun always sprays the same shape, so the pattern can be learned
// and pulled against with the mouse.

function buildPattern(keys, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1][0] <= i) k++;
    const [i0, p0, y0] = keys[k], [i1, p1, y1] = keys[Math.min(k + 1, keys.length - 1)];
    const t = i1 === i0 ? 0 : Math.min(1, Math.max(0, (i - i0) / (i1 - i0)));
    out.push([p0 + (p1 - p0) * t, y0 + (y1 - y0) * t]);
  }
  return out;
}

export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Knife', slot: 3, type: 'melee',
    damage: 40, heavyDamage: 65, range: 2.0, fireInterval: 0.42, heavyInterval: 1.0,
    moveSpeed: 1.0, magSize: 0, reserve: 0,
  },
  glock: {
    id: 'glock', name: 'Glock-18', slot: 2, type: 'pistol', team: 'T',
    damage: 29, armorPen: 0.47, rangeMod: 0.86, rpm: 400, auto: false,
    magSize: 20, reserve: 120, reloadTime: 2.2, deployTime: 0.5,
    moveSpeed: 0.96, baseSpread: 0.0055, moveSpread: 0.028, airSpread: 0.11, crouchMul: 0.8,
    recoilRecovery: 7.5, viewKick: 0.55,
    pattern: buildPattern([[0, 0, 0], [1, 1.4, 0.1], [5, 4.2, -0.6], [10, 5.6, 0.9], [20, 6.0, 0]], 20),
    sound: { freq: 1400, body: 160, decay: 0.12, gain: 0.55 },
  },
  usp: {
    id: 'usp', name: 'USP', slot: 2, type: 'pistol', team: 'CT',
    damage: 34, armorPen: 0.5, rangeMod: 0.9, rpm: 352, auto: false,
    magSize: 12, reserve: 24, reloadTime: 2.2, deployTime: 0.5,
    moveSpeed: 0.96, baseSpread: 0.0042, moveSpread: 0.026, airSpread: 0.11, crouchMul: 0.8,
    recoilRecovery: 7.5, viewKick: 0.6, suppressed: true,
    pattern: buildPattern([[0, 0, 0], [1, 1.6, -0.1], [4, 4.0, 0.5], [8, 5.2, -0.6], [12, 5.6, 0]], 12),
    sound: { freq: 2600, body: 90, decay: 0.07, gain: 0.25 },
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', slot: 2, type: 'pistol',
    damage: 60, armorPen: 0.92, rangeMod: 0.81, rpm: 267, auto: false,
    magSize: 7, reserve: 35, reloadTime: 2.2, deployTime: 0.6,
    moveSpeed: 0.92, baseSpread: 0.004, moveSpread: 0.06, airSpread: 0.18, crouchMul: 0.8,
    recoilRecovery: 3.2, viewKick: 1.6,
    pattern: buildPattern([[0, 0, 0], [1, 4.6, 0.4], [3, 9.0, -0.8], [7, 11.5, 0.6]], 7),
    sound: { freq: 700, body: 90, decay: 0.25, gain: 0.85 },
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 1, type: 'rifle', team: 'T',
    damage: 36, armorPen: 0.77, rangeMod: 0.98, rpm: 600, auto: true,
    magSize: 30, reserve: 90, reloadTime: 2.45, deployTime: 0.9,
    moveSpeed: 0.86, baseSpread: 0.0024, moveSpread: 0.075, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.2, viewKick: 0.9,
    // Hard vertical climb, swings left, cuts back right, then a smaller left drift.
    pattern: buildPattern([
      [0, 0, 0], [1, 0.9, 0.05], [3, 3.4, 0.2], [6, 7.6, 0.5], [9, 10.4, -0.4],
      [12, 11.4, -2.6], [15, 11.8, -1.2], [18, 12.2, 1.9], [21, 12.4, 3.0],
      [24, 12.7, 1.4], [27, 12.9, -0.6], [30, 13.1, 0.2],
    ], 30),
    sound: { freq: 900, body: 110, decay: 0.2, gain: 0.8 },
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1', slot: 1, type: 'rifle', team: 'CT',
    damage: 32, armorPen: 0.7, rangeMod: 0.97, rpm: 666, auto: true,
    magSize: 30, reserve: 90, reloadTime: 3.0, deployTime: 0.9,
    moveSpeed: 0.9, baseSpread: 0.0021, moveSpread: 0.068, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.6, viewKick: 0.75,
    // Smoother climb, gentle right lean, wide left sweep, settles to centre-right.
    pattern: buildPattern([
      [0, 0, 0], [1, 0.7, -0.05], [4, 3.6, 0.3], [7, 6.9, 0.7], [10, 8.6, 1.3],
      [13, 9.2, -0.7], [16, 9.6, -2.2], [19, 9.9, -1.0], [22, 10.1, 1.0],
      [26, 10.3, 1.8], [30, 10.4, 0.6],
    ], 30),
    sound: { freq: 1200, body: 120, decay: 0.16, gain: 0.7 },
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 1, type: 'sniper',
    damage: 115, armorPen: 0.97, rangeMod: 0.99, rpm: 41, auto: false,
    magSize: 5, reserve: 30, reloadTime: 3.6, deployTime: 1.1,
    moveSpeed: 0.8, baseSpread: 0.0008, moveSpread: 0.12, airSpread: 0.35, crouchMul: 0.9,
    unscopedSpread: 0.09, scope: [40, 15], scopedSpeed: 0.4,
    recoilRecovery: 2.5, viewKick: 3.5,
    pattern: buildPattern([[0, 0, 0], [1, 6, 0]], 5),
    sound: { freq: 500, body: 70, decay: 0.45, gain: 1.0 },
  },
};

export const PRIMARIES = ['ak47', 'm4a1', 'awp'];
export const SECONDARIES = ['glock', 'usp', 'deagle'];

export const HITGROUP_MULT = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };

// Damage after distance falloff, hitgroup multiplier and armour.
export function computeDamage(w, dist, group, armor, helmet) {
  let dmg = w.damage * Math.pow(w.rangeMod ?? 1, dist / 12.7) * HITGROUP_MULT[group];
  let armorDmg = 0;
  const armored = armor > 0 && (group !== 'head' || helmet) && group !== 'legs';
  if (armored) {
    const reduced = dmg * (w.armorPen ?? 1);
    armorDmg = Math.min(armor, (dmg - reduced) * 0.5);
    dmg = reduced;
  }
  return { health: Math.round(dmg), armor: Math.round(armorDmg) };
}

// Runtime state for a weapon held by a player or bot.
export class WeaponState {
  constructor(id) {
    this.def = WEAPONS[id];
    this.id = id;
    this.ammo = this.def.magSize;
    this.reserve = this.def.reserve;
    this.nextFire = 0;
    this.reloading = 0;     // seconds remaining
    this.deploying = 0;
    this.shotIndex = 0;     // position in spray pattern (decays while not firing)
    this.recoil = [0, 0];   // current [pitch, yaw] offset in degrees
    this.lastShot = -10;
  }
  get interval() { return this.def.rpm ? 60 / this.def.rpm : this.def.fireInterval; }

  canFire(now) {
    return this.reloading <= 0 && this.deploying <= 0 && now >= this.nextFire && (this.def.type === 'melee' || this.ammo > 0);
  }

  startReload() {
    const d = this.def;
    if (d.type === 'melee' || this.reloading > 0 || this.ammo >= d.magSize || this.reserve <= 0) return false;
    this.reloading = d.reloadTime;
    return true;
  }

  // Advances timers; recovers recoil once the trigger is released.
  update(dt, now) {
    const d = this.def;
    if (this.deploying > 0) this.deploying -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = d.magSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take; this.reserve -= take;
        this.shotIndex = 0;
      }
    }
    if (d.pattern && now - this.lastShot > this.interval * 1.1) {
      const k = Math.exp(-d.recoilRecovery * dt);
      this.recoil[0] *= k; this.recoil[1] *= k;
      this.shotIndex = Math.max(0, this.shotIndex - dt * d.recoilRecovery * 2.4);
    }
  }

  // Registers a shot and returns the recoil offset [pitch, yaw] (degrees) for this bullet.
  fire(now) {
    const d = this.def;
    this.nextFire = now + this.interval;
    this.lastShot = now;
    if (d.type === 'melee') return [0, 0];
    this.ammo--;
    const idx = Math.min(d.pattern.length - 1, Math.floor(this.shotIndex));
    const target = d.pattern[idx];
    // Recoil eases toward the pattern position (so a partly recovered spray resumes smoothly).
    this.recoil[0] = target[0];
    this.recoil[1] = target[1];
    this.shotIndex = Math.min(d.pattern.length - 1, Math.floor(this.shotIndex) + 1);
    return [this.recoil[0], this.recoil[1]];
  }
}
