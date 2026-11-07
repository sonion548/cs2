// Weapon definitions. Stats, prices and spray patterns are this project's own design.
//
// Spray patterns are authored as keyframes [shotIndex, pitchUpDeg, yawRightDeg]
// (cumulative offset of the bullet from the crosshair) and linearly interpolated
// per shot. Every gun always sprays the same shape, so the pattern can be learned
// and pulled against with the mouse.
//
// type   behaviour class: pistol, smg, rifle, sniper, shotgun, lmg, melee, grenade, bomb
// cls    buy-menu category
// price  match-economy cost; reward = cash for a kill with it

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
const P = buildPattern;

// sound presets: band-pass noise burst + low body tone
const S = {
  pistol: { freq: 1400, body: 160, decay: 0.12, gain: 0.55 },
  heavyPistol: { freq: 700, body: 90, decay: 0.25, gain: 0.85 },
  smg: { freq: 1600, body: 140, decay: 0.1, gain: 0.55 },
  rifle: { freq: 1000, body: 115, decay: 0.18, gain: 0.75 },
  battle: { freq: 800, body: 95, decay: 0.24, gain: 0.85 },
  sniper: { freq: 500, body: 70, decay: 0.45, gain: 1.0 },
  shotgun: { freq: 450, body: 80, decay: 0.32, gain: 0.95 },
  lmg: { freq: 850, body: 100, decay: 0.2, gain: 0.8 },
  suppressed: { freq: 2600, body: 90, decay: 0.07, gain: 0.25 },
};

export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Knife', slot: 3, type: 'melee', cls: 'melee', reward: 1500,
    damage: 40, heavyDamage: 65, range: 2.0, fireInterval: 0.42, heavyInterval: 1.0,
    moveSpeed: 1.0, magSize: 0, reserve: 0,
  },

  // ------------------------------------------------------------ pistols
  glock: {
    id: 'glock', name: 'Glock-18', slot: 2, type: 'pistol', cls: 'pistol', team: 'T', price: 200, reward: 300,
    damage: 29, armorPen: 0.47, rangeMod: 0.86, rpm: 400, auto: false,
    magSize: 20, reserve: 120, reloadTime: 2.2, deployTime: 0.5,
    moveSpeed: 0.96, baseSpread: 0.0055, moveSpread: 0.028, airSpread: 0.11, crouchMul: 0.8,
    recoilRecovery: 7.5, viewKick: 0.55,
    pattern: P([[0, 0, 0], [1, 1.4, 0.1], [5, 4.2, -0.6], [10, 5.6, 0.9], [20, 6.0, 0]], 20),
    sound: S.pistol,
  },
  usp: {
    id: 'usp', name: 'USP', slot: 2, type: 'pistol', cls: 'pistol', team: 'CT', price: 200, reward: 300,
    damage: 34, armorPen: 0.5, rangeMod: 0.9, rpm: 352, auto: false,
    magSize: 12, reserve: 24, reloadTime: 2.2, deployTime: 0.5,
    moveSpeed: 0.96, baseSpread: 0.0042, moveSpread: 0.026, airSpread: 0.11, crouchMul: 0.8,
    recoilRecovery: 7.5, viewKick: 0.6, suppressed: true,
    pattern: P([[0, 0, 0], [1, 1.6, -0.1], [4, 4.0, 0.5], [8, 5.2, -0.6], [12, 5.6, 0]], 12),
    sound: S.suppressed,
  },
  m1911: {
    id: 'm1911', name: 'M1911', slot: 2, type: 'pistol', cls: 'pistol', price: 400, reward: 300,
    // Slow, hard-hitting single stack: each shot climbs a lot, so pace it.
    damage: 38, armorPen: 0.6, rangeMod: 0.84, rpm: 300, auto: false,
    magSize: 8, reserve: 32, reloadTime: 2.1, deployTime: 0.5,
    moveSpeed: 0.96, baseSpread: 0.0045, moveSpread: 0.03, airSpread: 0.12, crouchMul: 0.8,
    recoilRecovery: 5.5, viewKick: 0.9,
    pattern: P([[0, 0, 0], [1, 2.0, 0.1], [3, 4.6, -0.4], [6, 6.6, 0.4], [8, 7.0, 0]], 8),
    sound: { freq: 1100, body: 120, decay: 0.16, gain: 0.7 },
  },
  fiveseven: {
    id: 'fiveseven', name: 'Five-seveN', slot: 2, type: 'pistol', cls: 'pistol', price: 500, reward: 300,
    // Armour-piercing and flat-shooting: the pistol for punishing armoured rushes.
    damage: 30, armorPen: 0.86, rangeMod: 0.88, rpm: 400, auto: false,
    magSize: 20, reserve: 80, reloadTime: 2.2, deployTime: 0.5,
    moveSpeed: 0.96, baseSpread: 0.0045, moveSpread: 0.03, airSpread: 0.11, crouchMul: 0.8,
    recoilRecovery: 7, viewKick: 0.6,
    pattern: P([[0, 0, 0], [1, 1.4, 0.1], [5, 3.8, 0.6], [10, 5.2, -0.4], [15, 5.8, 0.6], [20, 6.0, 0]], 20),
    sound: { freq: 1700, body: 150, decay: 0.11, gain: 0.55 },
  },
  vz61: {
    id: 'vz61', name: 'Skorpion', slot: 2, type: 'pistol', cls: 'pistol', price: 500, reward: 300,
    // Full-auto machine pistol: brutal up close, falls apart past a few metres.
    damage: 25, armorPen: 0.5, rangeMod: 0.8, rpm: 850, auto: true,
    magSize: 20, reserve: 80, reloadTime: 2.4, deployTime: 0.55,
    moveSpeed: 0.95, baseSpread: 0.008, moveSpread: 0.03, airSpread: 0.12, crouchMul: 0.85,
    recoilRecovery: 6, viewKick: 0.35,
    pattern: P([[0, 0, 0], [1, 0.6, 0.1], [5, 2.8, -0.6], [10, 4.6, 0.8], [15, 5.4, -1.2], [20, 5.8, 0.4]], 20),
    sound: { freq: 1900, body: 170, decay: 0.08, gain: 0.5 },
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', slot: 2, type: 'pistol', cls: 'pistol', price: 700, reward: 300,
    damage: 60, armorPen: 0.92, rangeMod: 0.81, rpm: 267, auto: false,
    magSize: 7, reserve: 35, reloadTime: 2.2, deployTime: 0.6,
    moveSpeed: 0.92, baseSpread: 0.004, moveSpread: 0.06, airSpread: 0.18, crouchMul: 0.8,
    recoilRecovery: 3.2, viewKick: 1.6,
    pattern: P([[0, 0, 0], [1, 4.6, 0.4], [3, 9.0, -0.8], [7, 11.5, 0.6]], 7),
    sound: S.heavyPistol,
  },
  revolver: {
    id: 'revolver', name: '.357 Revolver', slot: 2, type: 'pistol', cls: 'pistol', price: 650, reward: 300,
    // Pin-point first shot, slow double-action trigger, big kick.
    damage: 70, armorPen: 0.9, rangeMod: 0.86, rpm: 140, auto: false,
    magSize: 6, reserve: 24, reloadTime: 2.4, deployTime: 0.6,
    moveSpeed: 0.92, baseSpread: 0.0026, moveSpread: 0.07, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 2.8, viewKick: 1.9,
    pattern: P([[0, 0, 0], [1, 5.0, 0.2], [3, 10.0, -0.6], [6, 13.0, 0.4]], 6),
    sound: { freq: 620, body: 85, decay: 0.3, gain: 0.9 },
  },

  // ------------------------------------------------------------ SMGs
  mac10: {
    id: 'mac10', name: 'MAC-10', slot: 1, type: 'smg', cls: 'smg', team: 'T', price: 1000, reward: 600,
    // Cheap bullet hose that drags hard to the right.
    damage: 26, armorPen: 0.55, rangeMod: 0.78, rpm: 800, auto: true,
    magSize: 30, reserve: 100, reloadTime: 2.6, deployTime: 0.5,
    moveSpeed: 0.95, baseSpread: 0.0085, moveSpread: 0.03, airSpread: 0.12, crouchMul: 0.85,
    recoilRecovery: 5.5, viewKick: 0.35,
    pattern: P([[0, 0, 0], [1, 0.8, 0.3], [5, 3.4, 1.4], [10, 5.6, 2.8], [15, 6.4, 1.6], [20, 6.9, 3.4], [25, 7.2, 2.2], [30, 7.4, 3.6]], 30),
    sound: { freq: 1800, body: 150, decay: 0.08, gain: 0.5 },
  },
  mp5: {
    id: 'mp5', name: 'MP5', slot: 1, type: 'smg', cls: 'smg', price: 1400, reward: 600,
    // Gentle, predictable climb: the most controllable SMG.
    damage: 27, armorPen: 0.62, rangeMod: 0.84, rpm: 750, auto: true,
    magSize: 30, reserve: 120, reloadTime: 2.7, deployTime: 0.55,
    moveSpeed: 0.94, baseSpread: 0.0045, moveSpread: 0.032, airSpread: 0.13, crouchMul: 0.8,
    recoilRecovery: 5.2, viewKick: 0.35,
    pattern: P([[0, 0, 0], [1, 0.5, 0], [5, 2.6, 0.4], [10, 4.6, 0.9], [15, 5.4, -0.4], [20, 5.8, -1.1], [25, 6.0, 0.2], [30, 6.1, 0.8]], 30),
    sound: S.smg,
  },
  mp7: {
    id: 'mp7', name: 'MP7', slot: 1, type: 'smg', cls: 'smg', price: 1500, reward: 600,
    // Armour-piercing and fast-firing; sways left mid-spray.
    damage: 26, armorPen: 0.7, rangeMod: 0.85, rpm: 800, auto: true,
    magSize: 30, reserve: 120, reloadTime: 2.6, deployTime: 0.55,
    moveSpeed: 0.94, baseSpread: 0.0042, moveSpread: 0.034, airSpread: 0.13, crouchMul: 0.8,
    recoilRecovery: 5, viewKick: 0.4,
    pattern: P([[0, 0, 0], [1, 0.6, -0.1], [4, 2.8, -0.5], [8, 5.2, -1.2], [12, 6.2, 0.3], [16, 6.6, 1.4], [22, 6.9, 0.2], [30, 7.1, -0.8]], 30),
    sound: { freq: 1500, body: 135, decay: 0.1, gain: 0.55 },
  },
  ump45: {
    id: 'ump45', name: 'UMP-45', slot: 1, type: 'smg', cls: 'smg', price: 1200, reward: 600,
    // Slow, heavy rounds; steep vertical kick that flattens out.
    damage: 35, armorPen: 0.6, rangeMod: 0.8, rpm: 600, auto: true,
    magSize: 25, reserve: 100, reloadTime: 2.9, deployTime: 0.6,
    moveSpeed: 0.93, baseSpread: 0.005, moveSpread: 0.034, airSpread: 0.13, crouchMul: 0.8,
    recoilRecovery: 4.6, viewKick: 0.5,
    pattern: P([[0, 0, 0], [1, 1.0, 0.1], [4, 4.0, 0.3], [8, 6.8, -0.2], [12, 7.6, -1.6], [18, 8.0, 0.6], [25, 8.3, 1.4]], 25),
    sound: { freq: 1200, body: 120, decay: 0.13, gain: 0.6 },
  },
  vector: {
    id: 'vector', name: 'Vector', slot: 1, type: 'smg', cls: 'smg', team: 'CT', price: 1900, reward: 600,
    // Extreme fire rate with very little muzzle climb, but a small magazine.
    damage: 24, armorPen: 0.6, rangeMod: 0.82, rpm: 1100, auto: true,
    magSize: 25, reserve: 100, reloadTime: 2.4, deployTime: 0.5,
    moveSpeed: 0.95, baseSpread: 0.0048, moveSpread: 0.03, airSpread: 0.12, crouchMul: 0.8,
    recoilRecovery: 6, viewKick: 0.25,
    pattern: P([[0, 0, 0], [1, 0.3, 0], [6, 1.8, 0.3], [12, 3.2, -0.4], [18, 3.9, 0.5], [25, 4.3, 0]], 25),
    sound: { freq: 1700, body: 145, decay: 0.08, gain: 0.5 },
  },
  p90: {
    id: 'p90', name: 'P90', slot: 1, type: 'smg', cls: 'smg', price: 2300, reward: 300,
    // 50 rounds and run-and-gun accuracy; wanders side to side instead of climbing.
    damage: 26, armorPen: 0.69, rangeMod: 0.86, rpm: 857, auto: true,
    magSize: 50, reserve: 100, reloadTime: 3.3, deployTime: 0.6,
    moveSpeed: 0.93, baseSpread: 0.0055, moveSpread: 0.026, airSpread: 0.12, crouchMul: 0.85,
    recoilRecovery: 5, viewKick: 0.3,
    pattern: P([[0, 0, 0], [1, 0.4, 0], [6, 2.4, 0.8], [12, 3.8, 2.0], [18, 4.4, 0.2], [24, 4.8, -1.8], [32, 5.1, -0.4], [40, 5.3, 1.6], [50, 5.5, 0.4]], 50),
    sound: { freq: 1650, body: 140, decay: 0.09, gain: 0.55 },
  },

  // ------------------------------------------------------------ rifles
  galil: {
    id: 'galil', name: 'Galil', slot: 1, type: 'rifle', cls: 'rifle', team: 'T', price: 1900, reward: 300,
    // Budget rifle with a long magazine and a big left swing.
    damage: 30, armorPen: 0.77, rangeMod: 0.97, rpm: 666, auto: true,
    magSize: 35, reserve: 90, reloadTime: 2.9, deployTime: 0.85,
    moveSpeed: 0.88, baseSpread: 0.0034, moveSpread: 0.07, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.4, viewKick: 0.75,
    pattern: P([[0, 0, 0], [1, 0.8, -0.1], [4, 3.6, -0.4], [8, 7.0, -1.0], [12, 8.6, -2.6], [17, 9.2, -0.6], [22, 9.6, 2.0], [28, 9.9, 0.6], [35, 10.1, -1.2]], 35),
    sound: { freq: 950, body: 112, decay: 0.18, gain: 0.75 },
  },
  famas: {
    id: 'famas', name: 'FAMAS', slot: 1, type: 'rifle', cls: 'rifle', team: 'CT', price: 2000, reward: 300,
    // Budget bullpup: tight first shots, then a right-then-left drift.
    damage: 29, armorPen: 0.7, rangeMod: 0.96, rpm: 700, auto: true,
    magSize: 25, reserve: 90, reloadTime: 3.0, deployTime: 0.85,
    moveSpeed: 0.88, baseSpread: 0.003, moveSpread: 0.068, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.6, viewKick: 0.7,
    pattern: P([[0, 0, 0], [1, 0.8, 0.1], [4, 3.4, 0.6], [8, 6.4, 1.2], [12, 7.6, -0.6], [16, 8.2, -1.8], [20, 8.6, -0.4], [25, 8.8, 1.0]], 25),
    sound: { freq: 1150, body: 118, decay: 0.16, gain: 0.7 },
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 1, type: 'rifle', cls: 'rifle', team: 'T', price: 2700, reward: 300,
    damage: 36, armorPen: 0.77, rangeMod: 0.98, rpm: 600, auto: true,
    magSize: 30, reserve: 90, reloadTime: 2.45, deployTime: 0.9,
    moveSpeed: 0.86, baseSpread: 0.0024, moveSpread: 0.075, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.2, viewKick: 0.9,
    // Hard vertical climb, swings left, cuts back right, then a smaller left drift.
    pattern: P([
      [0, 0, 0], [1, 0.9, 0.05], [3, 3.4, 0.2], [6, 7.6, 0.5], [9, 10.4, -0.4],
      [12, 11.4, -2.6], [15, 11.8, -1.2], [18, 12.2, 1.9], [21, 12.4, 3.0],
      [24, 12.7, 1.4], [27, 12.9, -0.6], [30, 13.1, 0.2],
    ], 30),
    sound: { freq: 900, body: 110, decay: 0.2, gain: 0.8 },
  },
  m4a1: {
    // shown as the M4A4 (the id stays 'm4a1' so everyone's skins keep working)
    id: 'm4a1', name: 'M4A4', slot: 1, type: 'rifle', cls: 'rifle', team: 'CT', price: 3000, reward: 300,
    damage: 32, armorPen: 0.7, rangeMod: 0.97, rpm: 666, auto: true,
    magSize: 30, reserve: 90, reloadTime: 3.0, deployTime: 0.9,
    moveSpeed: 0.9, baseSpread: 0.0021, moveSpread: 0.068, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.6, viewKick: 0.75,
    // Smoother climb, gentle right lean, wide left sweep, settles to centre-right.
    pattern: P([
      [0, 0, 0], [1, 0.7, -0.05], [4, 3.6, 0.3], [7, 6.9, 0.7], [10, 8.6, 1.3],
      [13, 9.2, -0.7], [16, 9.6, -2.2], [19, 9.9, -1.0], [22, 10.1, 1.0],
      [26, 10.3, 1.8], [30, 10.4, 0.6],
    ], 30),
    sound: { freq: 1200, body: 120, decay: 0.16, gain: 0.7 },
  },
  m4a1s: {
    id: 'm4a1s', name: 'M4A1-S', slot: 1, type: 'rifle', cls: 'rifle', team: 'CT', price: 2900, reward: 300,
    // Silenced: harder hitting and steadier than the M4A4, but a 20-round
    // magazine and a slower rate of fire. Quiet: shots carry less far.
    damage: 38, armorPen: 0.7, rangeMod: 0.97, rpm: 600, auto: true,
    magSize: 20, reserve: 80, reloadTime: 3.1, deployTime: 1.0,
    moveSpeed: 0.9, baseSpread: 0.0017, moveSpread: 0.064, airSpread: 0.19, crouchMul: 0.74,
    recoilRecovery: 5.2, viewKick: 0.55, suppressed: true,
    pattern: P([
      [0, 0, 0], [1, 0.6, -0.04], [4, 3.0, 0.25], [7, 5.6, 0.5], [10, 7.0, 0.9],
      [13, 7.6, -0.5], [16, 7.9, -1.4], [20, 8.1, -0.4],
    ], 20),
    sound: S.suppressed,
  },
  scarh: {
    id: 'scarh', name: 'SCAR-H', slot: 1, type: 'rifle', cls: 'rifle', price: 3100, reward: 300,
    // Battle rifle: 20 heavy rounds and a harsh straight kick. Tap and burst it.
    damage: 41, armorPen: 0.8, rangeMod: 0.98, rpm: 550, auto: true,
    magSize: 20, reserve: 80, reloadTime: 2.8, deployTime: 0.95,
    moveSpeed: 0.85, baseSpread: 0.0022, moveSpread: 0.08, airSpread: 0.22, crouchMul: 0.72,
    recoilRecovery: 3.8, viewKick: 1.1,
    pattern: P([[0, 0, 0], [1, 1.4, 0.1], [3, 4.2, 0.4], [6, 8.2, 0.2], [10, 11.0, -1.0], [15, 12.4, 0.8], [20, 13.0, -0.2]], 20),
    sound: S.battle,
  },
  sg550: {
    id: 'sg550', name: 'SG 550', slot: 1, type: 'rifle', cls: 'rifle', team: 'T', price: 3000, reward: 300,
    // Scoped rifle: zoom for long angles, swings left before settling right.
    damage: 33, armorPen: 0.8, rangeMod: 0.98, rpm: 600, auto: true,
    magSize: 30, reserve: 90, reloadTime: 2.9, deployTime: 0.95,
    moveSpeed: 0.84, baseSpread: 0.0022, moveSpread: 0.072, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.3, viewKick: 0.8, scope: [48], scopedSpeed: 0.7, scopedSpread: 0.0012,
    pattern: P([[0, 0, 0], [1, 0.8, 0], [4, 3.2, -0.3], [8, 6.4, -0.9], [12, 8.2, -2.0], [16, 8.8, -0.6], [22, 9.3, 1.2], [30, 9.6, 0.4]], 30),
    sound: { freq: 1050, body: 115, decay: 0.17, gain: 0.72 },
  },
  aug: {
    id: 'aug', name: 'AUG', slot: 1, type: 'rifle', cls: 'rifle', team: 'CT', price: 3300, reward: 300,
    // Scoped bullpup: near-vertical climb with a late right lean.
    damage: 31, armorPen: 0.82, rangeMod: 0.98, rpm: 600, auto: true,
    magSize: 30, reserve: 90, reloadTime: 3.4, deployTime: 0.95,
    moveSpeed: 0.86, baseSpread: 0.002, moveSpread: 0.07, airSpread: 0.2, crouchMul: 0.75,
    recoilRecovery: 4.5, viewKick: 0.75, scope: [48], scopedSpeed: 0.72, scopedSpread: 0.0011,
    pattern: P([[0, 0, 0], [1, 0.7, 0], [4, 3.0, 0.2], [8, 6.0, 0.6], [12, 7.8, 1.4], [16, 8.4, 0.4], [22, 8.8, -0.8], [30, 9.1, 0.2]], 30),
    sound: { freq: 1250, body: 122, decay: 0.15, gain: 0.7 },
  },

  // ------------------------------------------------------------ snipers
  scout: {
    id: 'scout', name: 'Scout', slot: 1, type: 'sniper', cls: 'sniper', price: 1700, reward: 300, bolt: true,
    // Light bolt-action: one-shot headshots, fast to move with, accurate at the top of a jump.
    damage: 88, armorPen: 0.85, rangeMod: 0.98, rpm: 48, auto: false,
    magSize: 10, reserve: 90, reloadTime: 3.0, deployTime: 0.9,
    moveSpeed: 0.95, baseSpread: 0.0009, moveSpread: 0.07, airSpread: 0.04, crouchMul: 0.9,
    unscopedSpread: 0.05, scope: [40, 15], scopedSpeed: 0.62,
    recoilRecovery: 3, viewKick: 2.2,
    pattern: P([[0, 0, 0], [1, 4, 0]], 10),
    sound: { freq: 650, body: 85, decay: 0.35, gain: 0.9 },
  },
  dmr: {
    id: 'dmr', name: 'SR-25', slot: 1, type: 'sniper', cls: 'sniper', price: 4800, reward: 150,
    // Semi-auto marksman rifle: fast follow-ups, but each shot kicks you off target.
    damage: 72, armorPen: 0.88, rangeMod: 0.98, rpm: 240, auto: false,
    magSize: 20, reserve: 80, reloadTime: 3.2, deployTime: 1.0,
    moveSpeed: 0.84, baseSpread: 0.0012, moveSpread: 0.1, airSpread: 0.3, crouchMul: 0.85,
    unscopedSpread: 0.07, scope: [40, 15], scopedSpeed: 0.5,
    recoilRecovery: 3.4, viewKick: 1.6,
    pattern: P([[0, 0, 0], [1, 2.0, 0.2], [3, 5.0, -0.4], [6, 8.0, 0.6], [10, 9.5, 0], [20, 10, 0]], 20),
    sound: { freq: 600, body: 80, decay: 0.32, gain: 0.95 },
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 1, type: 'sniper', cls: 'sniper', price: 4750, reward: 100, bolt: true,
    damage: 115, armorPen: 0.97, rangeMod: 0.99, rpm: 41, auto: false,
    magSize: 5, reserve: 30, reloadTime: 3.6, deployTime: 1.1,
    moveSpeed: 0.8, baseSpread: 0.0008, moveSpread: 0.12, airSpread: 0.35, crouchMul: 0.9,
    unscopedSpread: 0.09, scope: [40, 15], scopedSpeed: 0.4,
    recoilRecovery: 2.5, viewKick: 3.5,
    pattern: P([[0, 0, 0], [1, 6, 0]], 5),
    sound: S.sniper,
  },

  // ------------------------------------------------------------ shotguns
  dbarrel: {
    id: 'dbarrel', name: 'Double Barrel', slot: 1, type: 'shotgun', cls: 'shotgun', team: 'T', price: 1000, reward: 900,
    // Two shots, wide spread: deletes anyone within a few metres.
    damage: 21, pellets: 10, pelletSpread: 0.11, armorPen: 0.6, rangeMod: 0.55, rpm: 420, auto: false,
    magSize: 2, reserve: 32, reloadTime: 2.6, deployTime: 0.6,
    moveSpeed: 0.9, baseSpread: 0.0, moveSpread: 0.02, airSpread: 0.06, crouchMul: 0.95,
    recoilRecovery: 3, viewKick: 2.6,
    pattern: P([[0, 0, 0], [1, 4.5, 0.6], [2, 6, 0]], 2),
    sound: { freq: 400, body: 70, decay: 0.38, gain: 1.0 },
  },
  pump: {
    id: 'pump', name: 'M870', slot: 1, type: 'shotgun', cls: 'shotgun', price: 1100, reward: 900, pump: true,
    // Pump-action: hard-hitting, tighter spread, rack between shots.
    damage: 24, pellets: 8, pelletSpread: 0.065, armorPen: 0.6, rangeMod: 0.62, rpm: 68, auto: false,
    magSize: 8, reserve: 32, reloadTime: 0.5, shellReload: true, deployTime: 0.7,
    moveSpeed: 0.88, baseSpread: 0.0, moveSpread: 0.02, airSpread: 0.06, crouchMul: 0.95,
    recoilRecovery: 3, viewKick: 2.4,
    pattern: P([[0, 0, 0], [1, 4, 0]], 8),
    sound: S.shotgun,
  },
  m1014: {
    id: 'm1014', name: 'M1014', slot: 1, type: 'shotgun', cls: 'shotgun', price: 2000, reward: 900,
    // Semi-auto: quick follow-up blasts, wider spread than the pump.
    damage: 20, pellets: 6, pelletSpread: 0.08, armorPen: 0.75, rangeMod: 0.66, rpm: 240, auto: false,
    magSize: 7, reserve: 32, reloadTime: 0.45, shellReload: true, deployTime: 0.75,
    moveSpeed: 0.87, baseSpread: 0.0, moveSpread: 0.02, airSpread: 0.06, crouchMul: 0.95,
    recoilRecovery: 3.4, viewKick: 1.8,
    pattern: P([[0, 0, 0], [1, 3, 0.3], [3, 5, -0.3], [7, 6, 0]], 7),
    sound: { freq: 480, body: 85, decay: 0.3, gain: 0.92 },
  },

  // ------------------------------------------------------------ machine guns
  m249: {
    id: 'm249', name: 'M249', slot: 1, type: 'lmg', cls: 'lmg', team: 'CT', price: 5000, reward: 300,
    // 100-round belt: climbs then plateaus with wide horizontal sweeps.
    damage: 32, armorPen: 0.8, rangeMod: 0.97, rpm: 750, auto: true,
    magSize: 100, reserve: 200, reloadTime: 5.6, deployTime: 1.2,
    moveSpeed: 0.72, baseSpread: 0.004, moveSpread: 0.09, airSpread: 0.25, crouchMul: 0.6,
    recoilRecovery: 3.6, viewKick: 0.65,
    pattern: P([[0, 0, 0], [1, 0.8, 0], [6, 4.4, 0.6], [12, 7.0, -0.8], [20, 7.8, 1.8], [30, 8.2, -1.6], [45, 8.4, 1.0], [60, 8.5, -0.8], [80, 8.6, 0.8], [100, 8.7, 0]], 100),
    sound: S.lmg,
  },
  pkm: {
    id: 'pkm', name: 'PKM', slot: 1, type: 'lmg', cls: 'lmg', team: 'T', price: 4900, reward: 300,
    // Heavier rounds, slower, harsher climb than the M249.
    damage: 38, armorPen: 0.82, rangeMod: 0.97, rpm: 650, auto: true,
    magSize: 100, reserve: 200, reloadTime: 5.8, deployTime: 1.25,
    moveSpeed: 0.68, baseSpread: 0.0045, moveSpread: 0.1, airSpread: 0.26, crouchMul: 0.6,
    recoilRecovery: 3.3, viewKick: 0.85,
    pattern: P([[0, 0, 0], [1, 1.0, 0.1], [6, 5.0, 1.0], [12, 8.4, -0.6], [20, 9.6, 2.2], [30, 10.0, -2.0], [45, 10.3, 1.2], [60, 10.4, -1.0], [80, 10.5, 0.8], [100, 10.6, 0]], 100),
    sound: { freq: 780, body: 92, decay: 0.22, gain: 0.85 },
  },

  negev: {
    id: 'negev', name: 'Negev', slot: 1, type: 'lmg', cls: 'lmg', price: 1700, reward: 300,
    // 150-round belt at a high rate: wild for the first dozen shots, then the
    // spray settles into a tight, steady stream (hold it to lay down fire).
    damage: 35, armorPen: 0.71, rangeMod: 0.96, rpm: 800, auto: true,
    magSize: 150, reserve: 300, reloadTime: 5.7, deployTime: 1.2,
    moveSpeed: 0.62, baseSpread: 0.0055, moveSpread: 0.1, airSpread: 0.26, crouchMul: 0.6,
    recoilRecovery: 3.4, viewKick: 0.7,
    pattern: P([[0, 0, 0], [1, 1.2, 0.1], [5, 5.4, 0.9], [10, 6.8, -1.4], [14, 4.2, 0.8], [20, 2.0, 0.3], [30, 1.4, -0.2], [60, 1.3, 0.2], [150, 1.3, 0]], 150),
    sound: S.lmg,
  },

  // ------------------------------------------------------------ grenades (slot 4)
  he: { id: 'he', name: 'HE Grenade', slot: 4, type: 'grenade', cls: 'grenade', price: 300, reward: 300, max: 1, moveSpeed: 1, magSize: 0, reserve: 0, deployTime: 0.5 },
  flash: { id: 'flash', name: 'Flashbang', slot: 4, type: 'grenade', cls: 'grenade', price: 200, reward: 300, max: 2, moveSpeed: 1, magSize: 0, reserve: 0, deployTime: 0.5 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', slot: 4, type: 'grenade', cls: 'grenade', price: 300, reward: 300, max: 1, moveSpeed: 1, magSize: 0, reserve: 0, deployTime: 0.5 },
  molotov: { id: 'molotov', name: 'Molotov', slot: 4, type: 'grenade', cls: 'grenade', team: 'T', price: 400, reward: 300, max: 1, moveSpeed: 1, magSize: 0, reserve: 0, deployTime: 0.5 },
  incendiary: { id: 'incendiary', name: 'Incendiary', slot: 4, type: 'grenade', cls: 'grenade', team: 'CT', price: 550, reward: 300, max: 1, moveSpeed: 1, magSize: 0, reserve: 0, deployTime: 0.5 },
  decoy: { id: 'decoy', name: 'Decoy', slot: 4, type: 'grenade', cls: 'grenade', price: 50, reward: 300, max: 1, moveSpeed: 1, magSize: 0, reserve: 0, deployTime: 0.5 },

  // ------------------------------------------------------------ objective (slot 5)
  c4: { id: 'c4', name: 'Bomb', slot: 5, type: 'bomb', cls: 'bomb', moveSpeed: 1, magSize: 0, reserve: 0, deployTime: 0.6 },
};

// Buy-menu layout: category → ids, in display order.
export const BUY_MENU = [
  ['Pistols', ['glock', 'usp', 'm1911', 'fiveseven', 'vz61', 'revolver', 'deagle']],
  ['SMGs', ['mac10', 'vector', 'mp5', 'ump45', 'mp7', 'p90']],
  ['Rifles', ['galil', 'famas', 'ak47', 'm4a1', 'm4a1s', 'scarh', 'sg550', 'aug']],
  ['Heavy', ['scout', 'awp', 'dmr', 'dbarrel', 'pump', 'm1014', 'negev', 'pkm', 'm249']],
  ['Grenades', ['flash', 'smoke', 'he', 'molotov', 'incendiary', 'decoy']],
  ['Gear', ['vest', 'vesthelm', 'kit']],
];
export const GEAR = {
  vest: { id: 'vest', name: 'Kevlar Vest', price: 650 },
  vesthelm: { id: 'vesthelm', name: 'Kevlar + Helmet', price: 1000 },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400, team: 'CT' },
};

export const GUN_IDS = Object.values(WEAPONS).filter(w => w.slot === 1 || w.slot === 2).map(w => w.id);
export const PRIMARIES = Object.values(WEAPONS).filter(w => w.slot === 1).map(w => w.id);
export const SECONDARIES = Object.values(WEAPONS).filter(w => w.slot === 2).map(w => w.id);
export const GRENADES = Object.values(WEAPONS).filter(w => w.type === 'grenade').map(w => w.id);
export const DEFAULT_PISTOL = { T: 'glock', CT: 'usp' };
export const MAX_NADES = 4;
export const usableBy = (id, team) => { const d = WEAPONS[id] || GEAR[id]; return !!d && (!d.team || d.team === team); };

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
    this.reloading = 0;     // seconds remaining (per shell for shell-by-shell reloads)
    this.deploying = 0;
    this.shotIndex = 0;     // position in spray pattern (decays while not firing)
    this.recoil = [0, 0];   // current [pitch, yaw] offset in degrees
    this.lastShot = -10;
  }
  get interval() { return this.def.rpm ? 60 / this.def.rpm : this.def.fireInterval ?? 0.5; }
  get isGun() { return !!this.def.pattern; }

  canFire(now) {
    if (this.def.shellReload && this.reloading > 0 && this.ammo > 0) return now >= this.nextFire && this.deploying <= 0;
    return this.reloading <= 0 && this.deploying <= 0 && now >= this.nextFire && (this.def.type === 'melee' || this.ammo > 0);
  }

  startReload() {
    const d = this.def;
    if (!this.isGun || this.reloading > 0 || this.ammo >= d.magSize || this.reserve <= 0) return false;
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
        if (d.shellReload) {
          // one shell at a time; keeps going until full or out of reserve
          if (this.reserve > 0 && this.ammo < d.magSize) { this.ammo++; this.reserve--; }
          if (this.reserve > 0 && this.ammo < d.magSize) this.reloading = d.reloadTime;
        } else {
          const take = Math.min(d.magSize - this.ammo, this.reserve);
          this.ammo += take; this.reserve -= take;
        }
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
    this.used = true;            // a gun that has fired can't be refunded
    this.nextFire = now + this.interval;
    this.lastShot = now;
    if (!d.pattern) return [0, 0];
    if (d.shellReload) this.reloading = 0;   // firing interrupts a shell reload
    this.ammo--;
    const idx = Math.min(d.pattern.length - 1, Math.floor(this.shotIndex));
    const target = d.pattern[idx];
    this.recoil[0] = target[0];
    this.recoil[1] = target[1];
    this.shotIndex = Math.min(d.pattern.length - 1, Math.floor(this.shotIndex) + 1);
    return [this.recoil[0], this.recoil[1]];
  }
}
