// Game types besides bomb defusal, played against bots:
//   Team Deathmatch  one long round with respawns and free weapons; the
//                    first team to the kill limit (or ahead at the time
//                    limit) wins
//   Arms Race        respawns, and every kill moves you on to the next gun
//                    on a ladder; whoever gets a kill with the last one (the
//                    knife) wins it for their team
//   Retakes          rounds that start with the bomb already planted: the
//                    attackers hold the site, the defenders retake it, with
//                    random loadouts and no buying
// Each mode is a set of hooks the game calls at round start, on kills, on
// going live, when time runs out and every tick.
import * as THREE from 'three';
import { WEAPONS, WeaponState } from '../weapons.js';

export const GAME_TYPES = [
  ['defusal', 'Bomb defusal', 'Plant or defuse the bomb. First to 5 rounds.'],
  ['tdm', 'Team Deathmatch', 'Respawns and free weapons. First team to the kill limit.'],
  ['armsrace', 'Arms Race', 'Every kill moves you to the next gun. A knife kill wins.'],
  ['retakes', 'Retakes', 'Every round starts with the bomb planted. Hold it or retake it.'],
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const RIFLES = { T: ['ak47', 'ak47', 'galil', 'sg550'], CT: ['m4a1', 'm4a1s', 'famas', 'aug'] };
const FORCE = { T: ['mac10', 'mp7', 'ump45', 'pump', 'galil'], CT: ['mp5', 'mp7', 'ump45', 'famas', 'm1014'] };
const PISTOLS = { T: ['glock', 'deagle', 'fiveseven', 'vz61'], CT: ['usp', 'deagle', 'fiveseven', 'm1911'] };
const SIDEARM = { T: 'glock', CT: 'usp' };
const NADES = ['flash', 'smoke', 'he', 'flash'];
const ok = (id) => !!WEAPONS[id];

// Arms Race: the guns in order, the knife last.
export const LADDER = ['m4a1s', 'ak47', 'famas', 'sg550', 'p90', 'mp7', 'pump', 'negev', 'awp', 'deagle', 'glock', 'knife'].filter(id => id === 'knife' || ok(id));

export function makeMode(game) {
  const t = game.opts.gameType || 'defusal';
  if (t === 'tdm') return new Deathmatch(game);
  if (t === 'armsrace') return new ArmsRace(game);
  if (t === 'retakes') return new Retakes(game);
  return null;
}

// Gives a character exactly this kit (no money involved).
function kit(ch, primary, secondary, { armor = 100, helmet = true, nades = [], defuser = false } = {}) {
  ch.weapons = { 1: primary ? new WeaponState(primary) : null, 2: secondary ? new WeaponState(secondary) : null, 3: new WeaponState('knife'), 4: null, 5: null };
  ch.armor = armor; ch.helmet = helmet && armor > 0; ch.hasKit = defuser;
  ch.nades = [];
  for (const n of nades) if (ok(n)) ch.nades.push(n);
  ch.hasBomb = false;
  ch.slot = primary ? 1 : secondary ? 2 : 3;
}

// ---------------------------------------------------------------- respawn modes
class Respawns {
  constructor(g) {
    this.g = g;
    this.noRounds = true;          // eliminations don't end anything
    this.usesStrategy = false;     // no bomb: the bots hunt instead
    this.freeze = 4;
    this.respawnDelay = 2.5;
    this.timeLimit = 300;
    this.pending = new Map();      // character -> when it comes back
    this.huntT = 0;
    const nav = g.level.nav;
    this.cells = [];
    for (let z = 0; z < nav.H; z++) for (let x = 0; x < nav.W; x++) if (nav.walkable(x, z)) this.cells.push([x, z]);
  }

  get roundTime() { return this.timeLimit; }

  onRoundStart() {
    const g = this.g;
    g.bomb.reset();
    for (const ch of g.characters) { ch.hasBomb = false; this.equip(ch, true); ch.spawnedAt = g.time; }
    this.pending.clear();
  }

  onLive() { for (const b of this.g.bots) if (b.alive) this.hunt(b); }

  onKill(victim, killer) {
    if (victim === this.g.player) this.lastPrimary = victim.weapons?.[1]?.id || this.lastPrimary;
    this.pending.set(victim, this.g.time + this.respawnDelay);
  }

  // A place to come back: walkable, far from living enemies and out of their sight.
  spawnPoint(ch) {
    const g = this.g, nav = g.level.nav, world = g.level.world;
    const foes = g.characters.filter(c => c.alive && c.team !== ch.team);
    let best = null, bs = -1e9;
    for (let k = 0; k < 28; k++) {
      const [x, z] = pick(this.cells), p = nav.center(x, z);
      let dmin = 1e9, seen = false;
      const eye = p.clone(); eye.y += 1.6;
      for (const f of foes) {
        const d = f.pos.distanceTo(p);
        dmin = Math.min(dmin, d);
        if (d < 40 && world.lineOfSight(eye, f.eyePos(new THREE.Vector3()))) seen = true;
      }
      const s = Math.min(dmin, 45) - (seen ? 40 : 0) + Math.random() * 4;
      if (s > bs) { bs = s; best = p; }
    }
    return best || g.level.spawns[ch.team][0].clone();
  }

  respawn(ch) {
    const g = this.g;
    const p = this.spawnPoint(ch), c = new THREE.Vector3(g.level.width / 2, 0, g.level.depth / 2);
    const yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z));
    if (ch === g.player) {
      g.netRespawn(p, yaw, true);
      this.equip(ch, false);
      ch.switchTo(ch.bestSlot());
      g.vm.setWeapon(ch.weapon.id, ch.weapon.def.type, 0.3, g.skinFor(ch.weapon.id));
      g.hud.notice(this.respawnNote?.() || 'Respawned');
    } else {
      ch.spawn(p, yaw);
      ch.bought = true;
      this.equip(ch, false);
      ch.slot = 0; ch.switchTo(ch.bestSlot()); ch.equip();
      this.hunt(ch);
    }
    ch.spawnedAt = g.time;
  }

  // Bots go looking: toward roughly where an enemy is, or anywhere on the map.
  hunt(b) {
    const g = this.g, nav = g.level.nav;
    const foes = g.characters.filter(c => c.alive && c.team !== b.team);
    let p;
    if (foes.length && Math.random() < 0.55) {
      const f = pick(foes), q = f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18));
      const [x, z] = nav.cellOf(q);
      p = nav.walkable(x, z) ? nav.center(x, z) : f.pos.clone();
    } else { const [x, z] = pick(this.cells); p = nav.center(x, z); }
    b.setGoal(p, 'hunt');
  }

  update(dt) {
    const g = this.g;
    for (const [ch, at] of this.pending) if (g.time >= at && g.state === 'live') { this.pending.delete(ch); this.respawn(ch); }
    // keep the bots moving: anyone idle goes hunting again
    this.huntT -= dt;
    if (this.huntT <= 0 && g.state === 'live') {
      this.huntT = 1.5;
      for (const b of g.bots) if (b.alive && !b.target && !b.puppet && (!b.path || b.pathIdx >= b.path.length) && g.time - (b.arrivedAt ?? g.time) > 1.5) this.hunt(b);
    }
  }

  onTimeUp() {
    const g = this.g, s = this.standing();
    if (s.T === s.CT) { g.endMatch(g.playerTeam === 'T' ? 'CT' : 'T', 'Time ran out: a draw counts as a loss'); return; }
    const w = s.T > s.CT ? 'T' : 'CT';
    g.endMatch(w, `Time ran out · ${s.T} – ${s.CT}`);
  }
}

class Deathmatch extends Respawns {
  constructor(g) {
    super(g);
    this.type = 'tdm';
    this.limit = Math.max(15, 8 * (g.opts.teamSize || 5));
  }

  // free weapons: anywhere, for a few seconds after (re)spawning
  canBuy(ch) { return ch.alive && this.g.time - (ch.spawnedAt ?? -99) < 10; }

  equip(ch, first) {
    ch.money = 16000;
    if (ch.isBot) { kit(ch, pick(Math.random() < 0.8 ? RIFLES[ch.team] : FORCE[ch.team]), SIDEARM[ch.team], { nades: Math.random() < 0.5 ? [pick(NADES)] : [] }); return; }
    // you come back with the gun you last had (change it in the buy menu)
    kit(ch, first ? RIFLES[ch.team][0] : this.lastPrimary || RIFLES[ch.team][0], SIDEARM[ch.team]);
  }

  onKill(victim, killer) {
    super.onKill(victim, killer);
    const g = this.g;
    if (!killer || killer === victim || killer.team === victim.team || g.matchOver) return;
    g.score[killer.team]++;
    if (g.score[killer.team] >= this.limit) g.endMatch(killer.team, `First to ${this.limit} kills · ${g.score.T} – ${g.score.CT}`);
  }

  standing() { return { ...this.g.score }; }
  hudText() { return `Team Deathmatch · first to ${this.limit} kills`; }
  roundMessage() { return [`Team Deathmatch`, `First team to ${this.limit} kills wins · free weapons for 10 s after each spawn`]; }
  respawnNote() { return `Respawned · ${this.g.binds ? 'buy menu open for 10 s' : ''}`; }
}

class ArmsRace extends Respawns {
  constructor(g) {
    super(g);
    this.type = 'armsrace';
    this.level = new Map();      // character -> rung on the ladder
  }

  canBuy() { return false; }

  equip(ch) {
    const rung = this.level.get(ch) || 0, id = LADDER[Math.min(rung, LADDER.length - 1)];
    const d = WEAPONS[id];
    if (id === 'knife') kit(ch, null, null);
    else if (d.slot === 1) kit(ch, id, null);
    else kit(ch, null, id);
    ch.money = 0;
  }

  onKill(victim, killer, weaponDef) {
    super.onKill(victim, killer);
    const g = this.g;
    if (!killer || killer === victim || killer.team === victim.team || g.matchOver) return;
    const rung = this.level.get(killer) || 0;
    if (LADDER[rung] === 'knife') { g.endMatch(killer.team, `${killer.name} won it with the knife`); return; }
    this.level.set(killer, rung + 1);
    // the next gun, straight away
    if (killer.alive) {
      this.equip(killer);
      killer.switchTo(killer.bestSlot());
      if (killer === g.player) { g.vm.setWeapon(killer.weapon.id, killer.weapon.def.type, 0.3, g.skinFor(killer.weapon.id)); g.hud.notice(`Level ${rung + 2}/${LADDER.length}: ${WEAPONS[LADDER[rung + 1]]?.name || 'Knife'}`); }
      else killer.equip?.();
    }
    for (const team of ['T', 'CT']) g.score[team] = Math.max(0, ...g.characters.filter(c => c.team === team).map(c => (this.level.get(c) || 0) + 1));
  }

  standing() { return { ...this.g.score }; }
  hudText() {
    const r = this.level.get(this.g.player) || 0;
    return `Arms Race · level ${r + 1}/${LADDER.length}: ${WEAPONS[LADDER[r]]?.name || 'Knife'}`;
  }
  roundMessage() { return ['Arms Race', `Every kill moves you to the next gun · a knife kill wins`]; }
  respawnNote() { return this.hudText(); }
}

// ---------------------------------------------------------------- retakes
class Retakes {
  constructor(g) {
    this.g = g;
    this.type = 'retakes';
    this.usesStrategy = true;     // post-plant angles and group retakes come from the bot tactics
    this.freeze = 5;
  }

  canBuy() { return false; }

  onRoundStart() {
    const g = this.g, P = g.map.points || {};
    g.bomb.reset();
    // a loadout for the round: mostly full buys, some pistol and force rounds
    const r = Math.random(), type = r < 0.18 ? 'pistol' : r < 0.36 ? 'force' : 'full';
    for (const ch of g.characters) {
      const T = ch.team;
      const primary = type === 'full' ? pick(RIFLES[T]) : type === 'force' ? pick(FORCE[T]) : null;
      const secondary = type === 'pistol' ? pick(PISTOLS[T]) : SIDEARM[T];
      const nades = [];
      for (let i = 0; i < (type === 'pistol' ? 1 : 2); i++) if (Math.random() < 0.7) nades.push(pick(NADES.concat(T === 'T' ? ['molotov'] : ['incendiary'])));
      kit(ch, primary, secondary, { armor: type === 'pistol' && Math.random() < 0.5 ? 0 : 100, helmet: type !== 'pistol', nades, defuser: T === 'CT' && Math.random() < (type === 'full' ? 0.8 : 0.4) });
      ch.money = 0;
      if (ch.isBot) { ch.bought = true; ch.slot = 0; ch.switchTo(ch.bestSlot()); ch.equip?.(); }
    }
    const p = g.player;
    p.switchTo(p.bestSlot());
    g.vm.setWeapon(p.weapon.id, p.weapon.def.type, 0.3, g.skinFor(p.weapon.id));
    // where the bomb goes, and the attackers already round it
    const sites = Object.keys(P.plant || {}).filter(L => g.level.sites[L]?.length);
    const L = pick(sites.length ? sites : ['A']);
    const spot = pick(P.plant?.[L] || []);
    const nav = g.level.nav;
    this.site = L;
    this.spot = spot ? nav.center(spot[0], spot[1]) : g.siteGoal(L);
    const cells = g.level.sites[L].filter(v => nav.walkable(...nav.cellOf(v)) && v.distanceTo(this.spot) < 14);
    for (const ch of g.characters.filter(c => c.team === 'T')) {
      const q = (pick(cells) || this.spot).clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
      const yaw = Math.random() * Math.PI * 2;
      if (ch === p) { p.pos.copy(q); p.yaw = yaw; } else ch.spawn(q, yaw);
      if (ch.isBot) { ch.bought = true; ch.slot = 0; ch.switchTo(ch.bestSlot()); ch.equip?.(); }
    }
  }

  // the clock starts with the bomb already ticking
  onLive() {
    const g = this.g, ts = g.characters.filter(c => c.team === 'T' && c.alive);
    const planter = ts[0];
    if (!planter) return;
    const back = planter.pos.clone(), slot = planter.slot;
    planter.pos.copy(this.spot);
    g.bomb.give(planter);
    g.bomb.doPlant(planter, this.site);
    planter.pos.copy(back);
    if (planter.weapons[slot]) planter.switchTo(slot);
    if (planter === g.player) g.vm.setWeapon(planter.weapon.id, planter.weapon.def.type, 0.2, g.skinFor(planter.weapon.id));
  }

  hudText() { return `Retakes · site ${this.site || '?'} · first to ${this.g.winRounds}`; }
  roundMessage() {
    const T = this.g.playerTeam === 'T';
    return [`Round ${this.g.round}`, `Retakes: the bomb goes down on ${this.site} at the start · ${T ? 'hold the site' : 'retake it and defuse'}`];
  }
}
