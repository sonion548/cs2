// Multiplayer layer for a Game.
//
// Model: one player's machine is the host. The host runs the full simulation
// (bots, rounds, damage) and broadcasts snapshots + events through the server.
// Other players ("clients") move and aim locally for responsiveness, send their
// state and shots to the host, and render everyone else from snapshots.
//
// Reconnecting: the host also sends the server a save of the whole match every
// couple of seconds. A player who drops out is played by a bot until they're
// back; when they rejoin, the host hands them their character as it is now
// (resume). A host that drops comes back to the match (or another player
// takes it over) from the save: the game is built from it instead of
// starting a new match.
import * as THREE from 'three';
import { Bot } from '../bots.js';
import { WEAPONS, WeaponState } from '../weapons.js';
import { net } from './client.js';
import { BOMB } from '../match/bomb.js';

const SNAP_HZ = 20, INPUT_HZ = 30;
// how often the host saves the match to the server, and how long a dropped
// player stands still before a bot takes over their character (a blip of a
// few seconds shouldn't hand it over)
const SAVE_EVERY = 2, AWAY_BOT_AFTER = 4;
const r2 = (v) => Math.round(v * 100) / 100;

export class NetMatch {
  constructor(game, { room, role, you, resume }) {
    this.g = game; this.room = room; this.role = role; this.me = you;
    this.isHost = role === 'host';
    this.resume = this.isHost && resume?.ch ? resume : null;   // a save to go on from
    this.saveT = 0.5;
    this.byId = new Map();
    this.loadouts = new Map();     // host: remote human → {p, s}
    this.events = [];
    this.snapT = 0; this.inT = 0;
    this.off = net.on('room.msg', (m) => this.onMessage(m.from, m.data));
  }

  dispose() { this.off?.(); }
  send(data) { net.send('room.msg', data); }
  member(id) { return this.room.members.find(m => m.id === id); }

  // ---------------------------------------------------------------- roster
  // Host: build bots + puppets for remote humans. Client: puppets come from the roster message.
  buildRoster() {
    const g = this.g;
    g.player.netId = this.me;
    this.byId.set(this.me, g.player);
    if (!this.isHost) return;
    if (this.resume) { this.rosterFromSave(this.resume); this.sendRoster(); return; }
    const size = this.room.size;
    const names = ['Viper', 'Rook', 'Mako', 'Sable', 'Kestrel', 'Onyx', 'Drift', 'Talon', 'Ember', 'Quill'];
    for (const m of this.room.members) {
      if (m.id === this.me) continue;
      const b = new Bot(m.team, m.name, 0.5, g);
      b.puppet = true; b.human = true; b.netId = m.id;
      b.skins = { ...(m.equipped || {}) };
      this.add(b);
    }
    let n = 0;
    for (const team of ['T', 'CT']) {
      const have = g.characters.filter(c => c.team === team).length;
      for (let i = have; i < size; i++) {
        const b = new Bot(team, `${names[n % names.length]} (bot)`, this.room.botSkill, g);
        b.netId = 'b' + n++;
        this.add(b);
      }
    }
    this.sendRoster();
  }
  // Going on from a save: the same characters (bots at their own skill,
  // the other players as puppets; one who has left stays out, one who is
  // away is played by a bot until they're back).
  rosterFromSave(save) {
    const g = this.g, away = new Set(this.room.away || []), left = new Set(this.room.left || []);
    for (const c of save.ch) {
      if (c.id === this.me) continue;
      const m = this.member(c.id);
      const b = new Bot(c.t, c.nm, m ? 0.5 : (c.sk ?? this.room.botSkill), g);
      b.netId = c.id;
      if (m) {
        b.human = true; b.puppet = true; b.skins = { ...(m.equipped || {}) };
        if (left.has(c.id) || c.left) b.left = true;
        else if (away.has(c.id)) { b.away = true; b.awaySince = -1e9; }
      }
      this.add(b);
    }
  }
  add(b) {
    const g = this.g;
    g.bots.push(b); g.characters.push(b); g.scene.add(b.model);
    this.byId.set(b.netId, b);
  }

  // ---------------------------------------------------------------- saves
  // Everything about a character a restored match needs (and a rejoining
  // player gets back): where they are, health, armour, kit, money, stats,
  // the guns in each slot with their ammo, grenades.
  charState(c) {
    const w = [];
    for (const slot of [1, 2, 3]) { const x = c.weapons?.[slot]; if (x) w.push([slot, x.id, x.ammo, x.reserve]); }
    return {
      id: c.netId, nm: c.name, t: c.team, h: c === this.g.player || c.human ? 1 : 0, sk: c.isBot && !c.human ? c.prof?.skill ?? null : null,
      p: [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z)], y: r2(c.yaw), pi: r2(c.pitch), al: c.alive ? 1 : 0, hp: Math.max(0, c.health | 0),
      ar: c.armor | 0, he: c.helmet ? 1 : 0, kit: c.hasKit ? 1 : 0, m: c.money | 0, sts: { ...c.stats }, sv: c.survived ? 1 : 0,
      w, n: [...(c.nades || [])], sl: c.slot, left: c.left ? 1 : 0,
    };
  }
  applyState(ch, c) {
    ch.pos.set(c.p[0], c.p[1], c.p[2]); ch.vel.set(0, 0, 0); ch.yaw = c.y; ch.pitch = c.pi || 0;
    ch.alive = !!c.al && c.hp > 0; ch.health = ch.alive ? c.hp : 0;
    ch.armor = c.ar | 0; ch.helmet = !!c.he; ch.hasKit = !!c.kit; ch.money = c.m | 0;
    Object.assign(ch.stats, c.sts || {}); ch.survived = !!c.sv;
    ch.weapons = { 1: null, 2: null, 3: null, 4: null, 5: null };
    for (const [slot, id, ammo, reserve] of c.w || []) {
      if (!WEAPONS[id]) continue;
      const w = new WeaponState(id);
      if (ammo != null) w.ammo = ammo;
      if (reserve != null) w.reserve = reserve;
      ch.weapons[slot] = w;
    }
    ch.weapons[3] ||= new WeaponState('knife');
    ch.nades = [...(c.n || [])];
    ch.slot = 0; ch.switchTo(ch.weapons[c.sl] && c.sl <= 3 ? c.sl : ch.bestSlot());
    if (ch.weapon) ch.weapon.deploying = 0;
    if (ch.isBot) {
      ch.deathAnim = 0; ch.clearRagdoll?.(); ch.path = null; ch.target = null; ch.goal = null; ch.netTarget = null;
      ch.model.visible = ch.alive; ch.despawned = !ch.alive;   // the fallen are already gone
      ch.equip();
    }
  }
  sendSave() {
    const g = this.g, b = g.bomb;
    this.send({
      k: 'save', rd: g.round, sc: { ...g.score }, ls: { ...g.lossStreak }, wr: g.winRounds, st: g.state, tm: r2(g.stateTimer), rt: r2(g.roundTime || 0), mo: g.matchOver || null,
      bomb: { st: b.state, car: b.carrier?.netId ?? null, p: [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z)], tm: r2(b.timer), site: b.site ?? null, wp: b.wasPlanted ? 1 : 0, yaw: r2(b.mesh.rotation.y) },
      ch: g.characters.map(c => this.charState(c)),
    });
  }
  // The match as the save left it: score, round and its clock, everyone's
  // state, the bomb; the bots make their plan again.
  restore() {
    const g = this.g, s = this.resume;
    g.round = s.rd; g.score = { ...s.sc }; g.lossStreak = { ...(s.ls || g.lossStreak) }; g.winRounds = s.wr || g.winRounds;
    g.state = s.st; g.stateTimer = s.tm; g.roundTime = s.rt || 0;
    if (s.mo) g.matchOver = s.mo;
    for (const c of g.characters) c.buys = [];
    g.bomb.reset(); g.bomb.wasPlanted = !!s.bomb?.wp;
    for (const c of s.ch) { const ch = this.byId.get(c.id); if (ch) this.applyState(ch, c); }
    const bs = s.bomb;
    if (bs?.st === 'carried') { const car = this.byId.get(bs.car); if (car?.alive) g.bomb.give(car); }
    else if (bs?.st === 'dropped' || bs?.st === 'planted') {
      const bomb = g.bomb;
      bomb.state = bs.st; bomb.pos.set(...bs.p); bomb.mesh.visible = true; bomb.mesh.position.copy(bomb.pos);
      if (bs.st === 'planted') { bomb.site = bs.site; bomb.timer = bs.tm; bomb.mesh.position.y += 0.04; bomb.mesh.rotation.set(0, bs.yaw || 0, 0); }
    } else if (bs) g.bomb.state = bs.st;
    const p = g.player;
    g.deathCam = null; g.spec.target = null;
    if (p.alive) g.vm.setWeapon(p.weapon.id, p.weapon.def.type, 0.3, g.vmSkin(p.weapon.id));
    for (const b of g.bots) { b.bought = g.state !== 'freeze'; b.buyAt = b.human && !b.away ? Infinity : 0; }
    g.planRound();
    g.hud.notice('Back in the match', 3);
    this.sendRoster();
    this.sendSnapshot();
    this.sendSave();
  }

  // ---------------------------------------------------------------- away / back
  // Host: a player who dropped out is played by a bot (after a moment, so a
  // blip doesn't hand it over); when they're back it's theirs again, as it is.
  setAway(b, away) {
    b.away = away;
    if (away) { b.awaySince = performance.now(); return; }   // real time: a slow host's game clock runs behind
    b.puppet = true; b.target = null; b.path = null; b.goal = null; b.netTarget = null; b.useHeld = false;
  }
  botTakeover(b) {
    const g = this.g;
    b.puppet = false; b.netTarget = null; b.useHeld = false;
    b.bought = g.state !== 'freeze'; b.buyDelay = 0.5;
    if (b.alive && g.state === 'live') g.assignHunt(b);
  }
  sendResume(id) {
    const c = this.byId.get(id), g = this.g;
    if (!c) return;
    this.send({ k: 'resume', to: id, s: this.charState(c), st: g.state, tm: r2(g.stateTimer), sc: { ...g.score }, rd: g.round });
  }
  // Client: our character as the host has it (rejoining, or after a bot
  // played it): put back where it is with what it has.
  applyResume(d) {
    const g = this.g, p = g.player;
    g.state = d.st; g.stateTimer = d.tm; g.score = d.sc; g.round = d.rd;
    this.applyState(p, d.s);
    g.deathCam = null; g.spec.target = null; p.scoped = 0; g.hud.setScope(0);
    if (p.alive) g.vm.setWeapon(p.weapon.id, p.weapon.def.type, 0.3, g.vmSkin(p.weapon.id));
    g.hud.notice(p.alive ? 'Reconnected' : 'Reconnected: you play again next round', 3);
  }
  sendRoster(to) {
    const list = this.g.characters.map(c => [c.netId, c.name, c.team, c.human || c === this.g.player ? 1 : 0]);
    this.send({ k: 'roster', list, to });
  }
  applyRoster(list) {
    const g = this.g, added = [];
    for (const [id, name, team, human] of list) {
      if (this.byId.has(id)) continue;
      const b = new Bot(team, name, 0.5, g);
      b.puppet = true; b.netId = id; b.human = !!human;
      const m = this.member(id);
      if (m) b.skins = { ...(m.equipped || {}) };
      b.giveLoadout(team === 'T' ? 'ak47' : 'm4a1', team === 'T' ? 'glock' : 'usp');
      b.spawn(new THREE.Vector3(0, -50, 0), 0);
      this.add(b);
      added.push(b);
    }
    // compile the new players' outline shaders now (in the background where
    // the browser can), not the first time one of them comes into view
    if (added.length) { g.outlines.prewarm(added); g.renderer.compileAsync(g.scene, g.camera).catch(() => {}); }
  }

  // ---------------------------------------------------------------- per-frame
  tick(dt) {
    const g = this.g;
    if (this.isHost) {
      this.snapT -= dt;
      if (this.snapT <= 0) { this.snapT = 1 / SNAP_HZ; this.sendSnapshot(); }
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = SAVE_EVERY; this.sendSave(); }
      for (const b of g.bots) if (b.away && b.puppet && !b.left && performance.now() - b.awaySince > AWAY_BOT_AFTER * 1000) this.botTakeover(b);
    } else {
      this.inT -= dt;
      if (this.inT <= 0) {
        this.inT = 1 / INPUT_HZ;
        const p = g.player;
        const use = g.down('use') || (p.slot === 5 && g.down('fire'));
        this.send({ k: 'in', p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], v: [r2(p.vel.x), r2(p.vel.y), r2(p.vel.z)], y: r2(p.yaw), pi: r2(p.pitch), c: r2(p.crouch), w: p.weapon?.id, s: p.scoped || 0, u: use ? 1 : 0 });
      }
    }
  }

  sendSnapshot() {
    const g = this.g;
    const c = g.characters.map(ch => [ch.netId, r2(ch.pos.x), r2(ch.pos.y), r2(ch.pos.z), r2(ch.yaw), r2(ch.pitch), r2(ch.crouch), Math.max(0, ch.health | 0), ch.armor | 0, ch.alive ? 1 : 0, ch.weapon?.id || 'knife', ch.stats.kills, ch.stats.deaths, ch.stats.assists, ch.stats.damage | 0,
      ch.money | 0, (ch.hasBomb ? 1 : 0) | (ch.helmet ? 2 : 0) | (ch.hasKit ? 4 : 0)]);
    const b = g.bomb;
    const bomb = [b.state, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.timer), b.plant?.ch.netId ?? null, b.plant ? r2(b.plant.t / BOMB.plantTime) : 0,
      b.defuse?.ch.netId ?? null, b.defuse ? r2(b.defuse.t / b.defuse.dur) : 0, b.defuse?.ch.hasKit ? 1 : 0];
    const msg = { k: 'snap', st: g.state, tm: r2(g.stateTimer), sc: g.score, rd: g.round, c, b: bomb };
    if (this.events.length) { msg.e = this.events; this.events = []; }
    this.send(msg);
  }

  // Host: queue an event for the next snapshot (or send now if urgent).
  event(e, now = false) { if (!this.isHost) return; if (now) this.send({ k: 'ev', e: [e] }); else this.events.push(e); }

  // ---------------------------------------------------------------- inbound
  onMessage(from, d) {
    if (!d) return;
    if (this.isHost) this.hostMessage(from, d);
    else this.clientMessage(d);
  }

  hostMessage(from, d) {
    const g = this.g, b = this.byId.get(from);
    // a player (re)joining asks for the roster; they also get their own
    // character as it stands (at the start of a match, where it spawned)
    if (d.k === 'hello') { this.sendRoster(from); this.sendResume(from); return; }
    if (d.k === 'left') { if (b) { b.left = true; b.away = false; b.puppet = true; if (b.alive) { b.alive = false; b.health = 0; g.checkRoundEnd(); } } return; }
    if (d.k === 'away') { if (b && !b.left) this.setAway(b, true); return; }
    if (d.k === 'back') { if (b && !b.left) { this.setAway(b, false); this.sendRoster(from); this.sendResume(from); } return; }
    if (!b || b.away) return;
    if (d.k === 'in') {
      b.netTarget = { pos: new THREE.Vector3(...d.p), yaw: d.y, pitch: d.pi, crouch: d.c };
      b.vel.set(...d.v);
      b.scoped = d.s;
      b.useHeld = !!d.u;
      if (d.w && b.weapon?.id !== d.w) b.setNetWeapon(d.w);
    } else if (d.k === 'loadout') {
      this.loadouts.set(from, { p: d.p, s: d.s });
    } else if (d.k === 'buy' && b.alive) {
      g.buy(b, d.id);
    } else if (d.k === 'refund' && b.alive) {
      g.refund(b, d.id);
    } else if (d.k === 'nade' && b.alive && !g.freeze) {
      b.yaw = d.y; b.pitch = d.pi;
      const i = b.nades.indexOf(d.t);
      if (i >= 0) b.nades.splice(i, 1);
      g.grenades.throw(b, d.t, Math.max(0.2, Math.min(1, +d.pw || 1)));
    } else if (d.k === 'shot' && b.alive && !g.freeze) {
      const def = WEAPONS[d.w]; if (!def || def.type === 'melee') return;
      const origin = new THREE.Vector3(...d.o), dir = new THREE.Vector3(...d.d).normalize();
      // basic sanity: shots must start near the shooter's head
      if (origin.distanceTo(b.eyePos()) > 2.5) return;
      g.traceBullet(b, origin, dir, def);
      g.audio.shot(def, b.pos);
      g.muzzleFlash(b);
    } else if (d.k === 'melee' && b.alive && !g.freeze) {
      if (b.weapon?.id !== 'knife') b.setNetWeapon('knife');
      b.yaw = d.y; b.pitch = d.pi;
      g.fire(b, g.time, !!d.h);
    }
  }

  clientMessage(d) {
    const g = this.g;
    if (d.k === 'roster') { this.applyRoster(d.list); return; }
    if (d.k === 'resume') { this.applyResume(d); return; }
    if (d.k === 'hostaway') { g.hud.notice('The host lost connection: waiting for them to come back', 8); return; }
    if (d.k === 'hostback') { g.hud.notice('The host is back', 3); return; }
    if (d.k === 'hostchange') { g.hud.notice(`The host dropped out: the match carries on in ${d.name}'s game`, 5); return; }
    if (d.k === 'snap') {
      g.state = d.st; g.stateTimer = d.tm; g.score = d.sc; g.round = d.rd;
      for (const row of d.c) this.applyRow(row);
      if (d.b) this.applyBomb(d.b);
      if (d.e) for (const e of d.e) this.applyEvent(e);
      return;
    }
    if (d.k === 'ev') for (const e of d.e) this.applyEvent(e);
  }

  applyRow([id, x, y, z, yaw, pitch, crouch, hp, armor, alive, w, k, dth, a, dmg, money, flags = 0]) {
    const g = this.g;
    let ch = this.byId.get(id);
    if (!ch) { this.send({ k: 'hello' }); return; }
    Object.assign(ch.stats, { kills: k, deaths: dth, assists: a, damage: dmg });
    if (money != null) ch.money = money;
    ch.hasBomb = !!(flags & 1); ch.helmet = !!(flags & 2); ch.hasKit = !!(flags & 4);
    if (ch === g.player) {
      const p = g.player;
      p.health = hp; p.armor = armor;
      if (p.alive && !alive) g.netDeath();
      if (!p.hasBomb && p.slot === 5) { p.slot = 0; g.switchWeapon(p.bestSlot()); }
      return;
    }
    ch.netTarget = { pos: new THREE.Vector3(x, y, z), yaw, pitch, crouch };
    ch.health = hp; ch.armor = armor;
    if (ch.weapon?.id !== w) ch.setNetWeapon(w);
    if (ch.alive && !alive) { ch.alive = false; ch.deathAnim = 0; ch.deathDir = Math.random() < 0.5 ? 1 : -1; ch.onDeath?.(null); }
    else if (!ch.alive && alive) { ch.spawn(new THREE.Vector3(x, y, z), yaw); ch.setNetWeapon(w); }
  }

  applyEvent(e) {
    const g = this.g;
    const [type] = e;
    if (type === 'shot') {
      const [, id, ox, oy, oz, ex, ey, ez, w] = e;
      const ch = this.byId.get(id);
      if (!ch || ch === g.player) return;
      g.addTracer(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(ex, ey, ez));
      if (WEAPONS[w]) g.audio.shot(WEAPONS[w], ch.pos);
      g.muzzleFlash(ch);
    } else if (type === 'kill') {
      const [, kid, vid, w, hs] = e;
      const killer = kid == null ? null : this.byId.get(kid), victim = this.byId.get(vid);
      if (!victim || (kid != null && !killer)) return;
      g.hud.killfeed(killer, victim, WEAPONS[w] || { name: 'Bomb' }, !!hs);
      if (victim === g.player) g.lastKiller = killer;
      if (killer === g.player) g.hud.hitmarker(!!hs, true);
    } else if (type === 'hit') {
      const [, aid, vid, head] = e;
      const att = this.byId.get(aid), vic = this.byId.get(vid);
      if (att === g.player) { g.hud.hitmarker(!!head, false); g.audio.hit(!!head); }
      if (vic === g.player && att) { g.audio.hurt(); g.hud.damageFrom(att.pos); g.viewPunch = (g.viewPunch || 0) + (head ? 4 : 1.4); }
    } else if (type === 'spawn') {
      const [, id, x, y, z, yaw] = e;
      if (id !== this.me) return;
      g.netRespawn(new THREE.Vector3(x, y, z), yaw);
    } else if (type === 'round') {
      const [, phase, a, b, over] = e;
      if (phase === 'start') { g.round = a; g.clearEffects(); g.hud.roundStart(); }
      else if (phase === 'live') g.hud.goLive();
      else if (phase === 'end') { g.hud.roundEnd(a, b, !!over); g.audio.ui(a === g.playerTeam ? 'win' : 'lose'); if (over) g.matchOver = a; }
    } else if (type === 'nadethrow') {
      const [, t, px, py, pz, vx, vy, vz] = e;
      g.grenades.throwVisual(t, new THREE.Vector3(px, py, pz), new THREE.Vector3(vx, vy, vz));
    } else if (type === 'nadefx') {
      const [, t, x, y, z] = e;
      g.grenades.replay(t, new THREE.Vector3(x, y, z));
    } else if (type === 'bomb') {
      const [, what, a, b2, c, d2] = e;
      if (what === 'plant') g.hud.message('Bomb planted', `Site ${a}`, 3, g.playerTeam === 'T' ? 'win' : 'lose');
      else if (what === 'exploded') g.bomb.explodeVisual();
      else if (what === 'defused') g.bomb.state = 'defused';
    } else if (type === 'over') {
      g.matchOver = e[1];
      setTimeout(() => g.finishNet(), 5000);
    }
  }

  // ---------------------------------------------------------------- client → host
  shot(origin, dir, weaponId) { this.send({ k: 'shot', o: [r2(origin.x), r2(origin.y), r2(origin.z)], d: [+dir.x.toFixed(4), +dir.y.toFixed(4), +dir.z.toFixed(4)], w: weaponId }); }
  melee(heavy) { const p = this.g.player; this.send({ k: 'melee', h: heavy ? 1 : 0, y: r2(p.yaw), pi: r2(p.pitch) }); }
  loadout(p, s) { this.send({ k: 'loadout', p, s }); }
  buy(id) { this.send({ k: 'buy', id }); }
  refund(id) { this.send({ k: 'refund', id }); }

  // Client: mirror the host's bomb (mesh, timer, and our own plant/defuse progress).
  applyBomb([st, x, y, z, timer, pid, pp, did, dp, kit]) {
    const g = this.g, b = g.bomb;
    if (st === 'planted' || st === 'dropped') {
      b.pos.set(x, y, z); b.mesh.position.copy(b.pos); b.mesh.visible = true;
    } else if (st !== 'exploded') b.mesh.visible = false;
    b.state = st; b.timer = timer;
    g.netUse = pid === this.me ? { kind: 'plant', pr: pp } : did === this.me ? { kind: 'defuse', pr: dp, kit: !!kit } : null;
  }

  // Host: result for the server.
  report() {
    const g = this.g, stats = {}, players = [];
    for (const ch of g.characters) {
      if (ch === g.player || ch.human) stats[ch.netId] = { ...ch.stats };
      players.push({ name: ch.name, team: ch.team, ...ch.stats, human: ch === g.player || !!ch.human, id: ch.netId });
    }
    return net.rpc('room.report', {
      winner: g.matchOver, score: { ...g.score }, rounds: g.round, stats, players,
      left: g.characters.filter(c => c.left || c.away).map(c => c.netId),
      weaponKills: { [this.me]: { ...g.weaponKills } },
    });
  }
}

// Puppet support on Bot: weapon switching driven by the network.
Bot.prototype.setNetWeapon = function (id) {
  if (!WEAPONS[id]) return;
  if (!this.weapons) this.weapons = {};
  this.weapons[1] = new WeaponState(id);
  this.slot = 1;
  this.equip();
};
