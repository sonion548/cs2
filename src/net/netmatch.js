// Multiplayer layer for a Game.
//
// Model: one player's machine is the host. The host runs the full simulation
// (bots, rounds, damage) and broadcasts snapshots + events through the server.
// Other players ("clients") move and aim locally for responsiveness, send their
// state and shots to the host, and render everyone else from snapshots.
import * as THREE from 'three';
import { Bot } from '../bots.js';
import { WEAPONS, WeaponState } from '../weapons.js';
import { net } from './client.js';
import { BOMB } from '../match/bomb.js';

const SNAP_HZ = 20, INPUT_HZ = 30;
const r2 = (v) => Math.round(v * 100) / 100;

export class NetMatch {
  constructor(game, { room, role, you }) {
    this.g = game; this.room = room; this.role = role; this.me = you;
    this.isHost = role === 'host';
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
  add(b) {
    const g = this.g;
    g.bots.push(b); g.characters.push(b); g.scene.add(b.model);
    this.byId.set(b.netId, b);
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
    if (d.k === 'hello') { this.sendRoster(from); return; }
    if (d.k === 'left') { if (b) { b.left = true; if (b.alive) { b.alive = false; b.health = 0; g.checkRoundEnd(); } } return; }
    if (!b) return;
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
      left: g.characters.filter(c => c.left).map(c => c.netId),
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
