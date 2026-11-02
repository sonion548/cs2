// Match orchestration: rendering, player input, bullets, rounds and HUD.
import * as THREE from 'three';
import { buildLevel } from './level.js';
import { MAPS } from './maps.js';
import { Character, MOVE } from './character.js';
import { Bot } from './bots.js';
import { WEAPONS, computeDamage } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { audio } from './audio.js';
import { decalTexture, radialTexture, skyTexture, tex, rng } from './textures.js';
import { rayBox } from './physics.js';
import { Hud } from './hud.js';
import { NetMatch } from './net/netmatch.js';

const DEG = Math.PI / 180;
const BOT_NAMES = ['Viper', 'Rook', 'Mako', 'Sable', 'Kestrel', 'Onyx', 'Drift', 'Talon', 'Ember', 'Quill',
  'Basalt', 'Cinder', 'Harrow', 'Jolt', 'Lynx', 'Nomad', 'Pike', 'Rune', 'Slate', 'Wisp'];

export class Game {
  constructor(canvas, opts, settings, onExit) {
    this.canvas = canvas;
    this.opts = opts;
    this.settings = settings;
    this.onExit = onExit;
    this.audio = audio;
    this.time = 0;
    this.paused = false;
    this.keys = {};
    this.mouse = { left: false, right: false };

    // --- renderer ---
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd9c7a6, 70, 260);
    this.camera = new THREE.PerspectiveCamera(settings.fov ?? 74, 1, 0.03, 600);
    this.scene.add(this.camera);

    const map = this.map = MAPS[opts.map] || MAPS.dunehold;
    this.level = buildLevel(map, this.scene);
    this.buildEnvironment();

    // --- teams ---
    // online matches take sides from the server's room; offline picks here
    const meNet = opts.net ? opts.net.room.members.find(m => m.id === opts.net.you) : null;
    this.playerTeam = meNet ? meNet.team : opts.side === 'random' ? (Math.random() < 0.5 ? 'T' : 'CT') : opts.side;
    this.player = new Character(this.playerTeam, settings.name || 'You', false);
    this.characters = [this.player];
    this.bots = [];
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const n = opts.net ? 0 : opts.teamSize;
    for (let i = 0; i < n * 2 - 1; i++) {
      const team = i < n - 1 ? this.playerTeam : (this.playerTeam === 'T' ? 'CT' : 'T');
      // ranked matches pass per-side skill generators scaled to the player's rating
      const skill = opts.skillFor ? opts.skillFor(team === this.playerTeam) : opts.skill;
      const b = new Bot(team, names[i % names.length], skill, this);
      this.bots.push(b); this.characters.push(b);
      this.scene.add(b.model);
    }
    this.loadout = { primary: this.playerTeam === 'T' ? 'ak47' : 'm4a1', secondary: this.playerTeam === 'T' ? 'glock' : 'usp' };

    this.vm = new ViewModel(this.playerTeam, this.renderer);
    this.hud = new Hud(this);

    // effects pools
    this.decals = []; this.tracers = []; this.particles = []; this.flashes = [];
    this.decalMat = new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.7 });
    this.flashMat = new THREE.SpriteMaterial({ map: radialTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.puffMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(200,180,150,0.9)', 'rgba(200,180,150,0)'), transparent: true, depthWrite: false });
    this.bloodMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(140,10,10,0.95)', 'rgba(90,0,0,0)'), transparent: true, depthWrite: false });

    // --- match state ---
    this.score = { T: 0, CT: 0 };
    this.round = 0;
    this.winRounds = opts.winRounds || 13;
    this.state = 'freeze';
    this.stateTimer = 0;
    this.roundTime = 0;
    this.spotted = { T: new Map(), CT: new Map() };
    this.specIndex = 0;
    this.weaponKills = {};
    this.lastWeaponSlot = 2;

    if (opts.net) { this.net = new NetMatch(this, opts.net); this.net.buildRoster(); }

    this.bindInput();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    if (!this.net || this.net.isHost) this.startRound();
    else this.clientStart();
    this.last = performance.now();
    this.running = true;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  buildEnvironment() {
    const s = this.map.sun;
    this.scene.add(new THREE.HemisphereLight(0xc4dcff, 0x9a7650, 0.85));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.8);
    const W = this.level.width, D = this.level.depth;
    const c = new THREE.Vector3(W / 2, 0, D / 2);
    sun.position.set(c.x + s.x * 80, s.y * 80, c.z + s.z * 80);
    sun.target.position.copy(c);
    sun.castShadow = true;
    const ext = Math.max(W, D) * 0.62;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 260 });
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    sky.position.copy(c);
    this.scene.add(sky);
    // outer ground + skyline of buildings beyond the walls
    const sand = tex('sand', 1).clone(); sand.repeat.set(225, 225); sand.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(c.x, -0.02, c.z); ground.receiveShadow = true;
    this.scene.add(ground);
    const r = rng(77);
    const mat = new THREE.MeshStandardMaterial({ map: tex('plaster', 1), roughness: 0.95 });
    const mat2 = new THREE.MeshStandardMaterial({ map: tex('sandstone', 1), roughness: 0.95 });
    for (let i = 0; i < 70; i++) {
      const side = i % 4;
      const along = r();
      const out = 6 + r() * 40;
      const w = 6 + r() * 14, d = 6 + r() * 14, h = 9 + r() * 16;
      let x, z;
      if (side === 0) { x = along * W; z = -out - d / 2; }
      else if (side === 1) { x = along * W; z = D + out + d / 2; }
      else if (side === 2) { x = -out - w / 2; z = along * D; }
      else { x = W + out + w / 2; z = along * D; }
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), r() < 0.5 ? mat : mat2);
      m.position.set(x, h / 2, z); m.castShadow = false; m.receiveShadow = true;
      this.scene.add(m);
      if (r() < 0.3) { // dome on top
        const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat2);
        dome.position.set(x, h, z); this.scene.add(dome);
      }
    }
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const c = this.canvas;
    this.h = {
      keydown: (e) => {
        if (e.code === 'Tab') e.preventDefault();
        if (this.hud.buyOpen && /^Digit/.test(e.code)) { this.hud.buyKey(e.code); return; }
        if (e.repeat) return;
        this.keys[e.code] = true;
        this.onKey(e.code);
      },
      keyup: (e) => { this.keys[e.code] = false; if (e.code === 'Tab') this.hud.showScoreboard(false); },
      mousedown: (e) => {
        if (this.paused || this.hud.buyOpen) return;
        if (document.pointerLockElement !== c) { c.requestPointerLock(); return; }
        if (e.button === 0) this.mouse.left = true;
        if (e.button === 2) { this.mouse.right = true; this.secondary(); }
      },
      mouseup: (e) => { if (e.button === 0) { this.mouse.left = false; this.triggerHeld = false; } if (e.button === 2) this.mouse.right = false; },
      mousemove: (e) => {
        if (document.pointerLockElement !== c || !this.player.alive) return;
        const scopeMul = this.player.scoped ? (this.player.scoped === 1 ? 0.444 : 0.2) : 1;
        const k = this.settings.sensitivity * 0.022 * DEG * scopeMul;
        this.player.yaw -= e.movementX * k;
        this.player.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.player.pitch - e.movementY * k));
        this.vm.look(e.movementX, e.movementY);
      },
      wheel: (e) => {
        if (document.pointerLockElement !== c) return;
        const order = [1, 2, 3].filter(s => this.player.weapons[s]);
        const i = order.indexOf(this.player.slot);
        this.switchWeapon(order[(i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length]);
      },
      lock: () => {
        if (document.pointerLockElement !== c && !this.hud.buyOpen && this.running) this.setPaused(true);
      },
      ctx: (e) => e.preventDefault(),
    };
    document.addEventListener('keydown', this.h.keydown);
    document.addEventListener('keyup', this.h.keyup);
    c.addEventListener('mousedown', this.h.mousedown);
    document.addEventListener('mouseup', this.h.mouseup);
    document.addEventListener('mousemove', this.h.mousemove);
    document.addEventListener('wheel', this.h.wheel, { passive: true });
    document.addEventListener('pointerlockchange', this.h.lock);
    c.addEventListener('contextmenu', this.h.ctx);
  }

  onKey(code) {
    const p = this.player;
    if (code === 'Escape' && this.hud.buyOpen) { this.hud.toggleBuy(false); return; }
    if (code === 'Tab') { this.hud.showScoreboard(true); return; }
    if (code === 'KeyB') { if (this.canBuy()) this.hud.toggleBuy(); return; }
    if (this.paused) return;
    if (!p.alive) {
      if (code === 'Space' || code === 'KeyD') this.specIndex++;
      if (code === 'KeyA') this.specIndex--;
      return;
    }
    if (code === 'Space') this.jumpQueued = true;
    if (code === 'Digit1') this.switchWeapon(1);
    if (code === 'Digit2') this.switchWeapon(2);
    if (code === 'Digit3') this.switchWeapon(3);
    if (code === 'KeyQ') this.switchWeapon(this.lastWeaponSlot);
    if (code === 'KeyR') this.reload();
    if (code === 'KeyF') this.vm.inspect();
  }

  skinFor(weaponId) { return this.opts.skins?.[weaponId] || null; }

  canBuy() { return this.player.alive && (this.state === 'freeze' || this.roundTime < 20); }

  switchWeapon(slot) {
    const p = this.player;
    const prev = p.slot;
    if (p.switchTo(slot)) {
      this.lastWeaponSlot = prev;
      this.vm.setWeapon(p.weapon.id, p.weapon.def.type, p.weapon.def.deployTime, this.skinFor(p.weapon.id));
      this.hud.setScope(0);
    }
  }

  reload() {
    const w = this.player.weapon;
    if (w.startReload()) {
      this.vm.reload(w.def.reloadTime);
      this.player.scoped = 0; this.hud.setScope(0);
      this.audio.reload(0);
      setTimeout(() => this.audio.reload(1), w.def.reloadTime * 650);
    }
  }

  secondary() {
    const p = this.player, w = p.weapon;
    if (!p.alive) return;
    if (w.def.scope && w.reloading <= 0) {
      p.scoped = (p.scoped + 1) % 3;
      this.hud.setScope(p.scoped);
      this.audio.ui();
    } else if (w.def.type === 'melee' && w.canFire(this.time)) {
      this.fire(p, this.time, true);
    }
  }

  setPaused(v) {
    if (this.net) {
      // online matches can't be paused: just show the menu over the running game
      this.menuOpen = v; this.hud.showPause(v);
      if (!v) this.canvas.requestPointerLock();
      this.keys = {}; this.mouse.left = false;
      return;
    }
    this.paused = v;
    this.hud.showPause(v);
    if (!v) this.canvas.requestPointerLock();
    this.keys = {}; this.mouse.left = false;
  }

  giveLoadout(primary, secondary) {
    this.loadout = { primary, secondary };
    if (this.net && !this.net.isHost) this.net.loadout(primary, secondary);
    this.player.giveLoadout(primary, secondary);
    this.vm.setWeapon(this.player.weapon.id, this.player.weapon.def.type, 0.3, this.skinFor(this.player.weapon.id));
    this.hud.setScope(0);
  }

  // ---------------------------------------------------------------- rounds
  startRound() {
    this.round++;
    this.state = 'freeze';
    this.stateTimer = this.opts.freezeTime ?? 5;
    this.roundTime = 0;
    this.clearEffects();
    const spawnFor = (team) => [...this.level.spawns[team]].sort(() => Math.random() - 0.5);
    const sp = { T: spawnFor('T'), CT: spawnFor('CT') };
    const center = new THREE.Vector3(this.level.width / 2, 0, this.level.depth / 2);
    const place = (ch) => {
      const list = sp[ch.team];
      const p = list.pop() || this.level.spawns[ch.team][0];
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
      return { pos: p.clone().add(jitter), yaw: Math.atan2(-(center.x - p.x), -(center.z - p.z)) };
    };
    const pp = place(this.player);
    this.player.reset();
    this.player.pos.copy(pp.pos); this.player.yaw = pp.yaw; this.player.pitch = 0;
    this.player.crouch = 0; this.player.scoped = 0;
    this.giveLoadout(this.loadout.primary, this.loadout.secondary);

    for (const b of this.bots) {
      const r = Math.random();
      let primary = r < 0.15 ? 'awp' : b.team === 'T' ? 'ak47' : 'm4a1';
      let secondary = Math.random() < 0.2 ? 'deagle' : b.team === 'T' ? 'glock' : 'usp';
      const lo = b.human && this.net?.loadouts.get(b.netId);
      if (b.human) { primary = lo?.p || (b.team === 'T' ? 'ak47' : 'm4a1'); secondary = lo?.s || (b.team === 'T' ? 'glock' : 'usp'); }
      b.giveLoadout(primary, secondary);
      const p = place(b);
      b.spawn(p.pos, p.yaw);
      b.netTarget = null;
      if (b.human) this.net.event(['spawn', b.netId, p.pos.x, p.pos.y, p.pos.z, p.yaw]);
    }
    this.planRound();
    this.hud.roundStart();
    this.net?.event(['round', 'start', this.round]);
  }

  planRound() {
    const sites = this.level.sites;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const goalOf = (L) => {
      // prefer site cells that aren't covered by crates/platforms
      const cells = sites[L].filter(v => this.level.nav.walkable(...this.level.nav.cellOf(v)));
      return pick(cells.length ? cells : sites[L]);
    };
    const tMain = Math.random() < 0.55 ? 'A' : 'B';
    let i = 0;
    for (const b of this.bots) {
      b.holdUntil = 0; b.lookYaw = b.yaw;
      if (b.team === 'T') {
        const L = Math.random() < 0.78 ? tMain : (tMain === 'A' ? 'B' : 'A');
        b.setGoal(goalOf(L), 'attack');
      } else {
        const L = i++ % 2 === 0 ? 'A' : 'B';
        b.setGoal(goalOf(L), 'hold');
      }
    }
  }

  assignHunt(bot) {
    const enemies = this.characters.filter(c => c.alive && c.team !== bot.team);
    if (!enemies.length) return;
    const e = enemies[Math.floor(Math.random() * enemies.length)];
    const fuzz = Math.max(2, 14 - this.roundTime / 6);
    const p = e.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * fuzz, 0, (Math.random() - 0.5) * fuzz));
    const nav = this.level.nav;
    const [cx, cz] = nav.cellOf(p);
    bot.setGoal(nav.walkable(cx, cz) ? nav.center(cx, cz) : e.pos.clone(), 'hunt');
  }

  aliveCount(team) { return this.characters.filter(c => c.team === team && c.alive).length; }

  checkRoundEnd() {
    if (this.state !== 'live') return;
    const t = this.aliveCount('T'), ct = this.aliveCount('CT');
    if (t === 0) this.endRound('CT', 'Attackers eliminated');
    else if (ct === 0) this.endRound('T', 'Defenders eliminated');
  }

  endRound(winner, reason) {
    this.state = 'post';
    this.stateTimer = 5;
    this.score[winner]++;
    // round MVP = most kills this round on the winning team
    const won = winner === this.playerTeam;
    this.audio.ui(won ? 'win' : 'lose');
    const over = this.score[winner] >= this.winRounds;
    this.hud.roundEnd(winner, reason, over);
    if (over) { this.matchOver = winner; this.stateTimer = 8; }
    this.net?.event(['round', 'end', winner, reason, over ? 1 : 0]);
    if (over) this.net?.event(['over', winner]);
  }

  // ---------------------------------------------------------------- combat
  fire(shooter, now, heavy = false) {
    const w = shooter.weapon, d = w.def;
    const isPlayer = shooter === this.player;
    const remoteClient = this.net && !this.net.isHost;
    if (d.type === 'melee') {
      w.nextFire = now + (heavy ? d.heavyInterval : d.fireInterval);
      this.audio.knife(isPlayer ? null : shooter.pos);
      if (isPlayer) this.vm.fire();
      if (remoteClient) { if (isPlayer) this.net.melee(heavy); return; }
      const eye = shooter.eyePos(), fwd = shooter.forward();
      let best = null, bd = d.range;
      for (const e of this.characters) {
        if (!e.alive || e === shooter || e.team === shooter.team) continue;
        const to = e.pos.clone(); to.y += e.height * 0.65; to.sub(eye);
        const dist = to.length();
        if (dist < bd && to.normalize().dot(fwd) > 0.6) { best = e; bd = dist; }
      }
      if (best) {
        // backstab bonus when hitting from behind
        const facing = best.forward(); facing.y = 0;
        const behind = facing.normalize().dot(fwd.clone().setY(0).normalize()) > 0.5;
        const dmg = behind ? (heavy ? 180 : 90) : heavy ? d.heavyDamage : d.damage;
        this.applyDamage(best, shooter, { health: dmg, armor: 0 }, 'chest', d, fwd);
      }
      return;
    }
    const spread = shooter.inaccuracy();
    const [rp, ry] = w.fire(now);
    let pitch = shooter.pitch + rp * DEG, yaw = shooter.yaw - ry * DEG;
    const a = Math.random() * Math.PI * 2, rr = spread * Math.random();
    pitch += Math.sin(a) * rr; yaw += Math.cos(a) * rr;
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    const origin = shooter.eyePos();
    // online clients only draw their own shots; the host decides what they hit
    this.traceBullet(shooter, origin, dir, d, remoteClient);
    if (remoteClient && isPlayer) this.net.shot(origin, dir, w.id);
    this.audio.shot(d, isPlayer ? null : shooter.pos);
    if (isPlayer) {
      this.vm.fire();
      this.viewPunch = (this.viewPunch || 0) + d.viewKick;
      this.hud.bloom();
      if (d.scope && shooter.scoped) { this.rescope = shooter.scoped; shooter.scoped = 0; this.hud.setScope(0); this.rescopeAt = now + w.interval * 0.9; }
    } else this.muzzleFlash(shooter);
  }

  traceBullet(shooter, origin, dir, d, visualOnly = false) {
    const wh = this.level.world.raycast(origin, dir, 250);
    let end = wh ? wh.dist : 250;
    let victim = null, group = null;
    for (const e of this.characters) {
      if (!e.alive || e === shooter) continue;
      for (const hb of e.hitboxes()) {
        const t = rayBox(origin, dir, hb.min, hb.max);
        if (t >= 0 && t < end) { end = t; victim = e; group = hb.group; }
      }
    }
    const endPt = origin.clone().addScaledVector(dir, end);
    // tracer starts near the muzzle rather than the eye
    const startPt = origin.clone();
    if (shooter === this.player) {
      const right = new THREE.Vector3(Math.cos(shooter.yaw), 0, -Math.sin(shooter.yaw));
      startPt.addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(dir, 0.6);
    }
    if (shooter !== this.player || Math.random() < 0.5) this.addTracer(startPt, endPt);
    this.net?.event(['shot', shooter.netId, +startPt.x.toFixed(2), +startPt.y.toFixed(2), +startPt.z.toFixed(2), +endPt.x.toFixed(2), +endPt.y.toFixed(2), +endPt.z.toFixed(2), d.id]);
    if (victim && visualOnly) { if (victim.team !== shooter.team) this.addPuff(endPt, this.bloodMat, 0.35); return; }
    if (victim) {
      if (victim.team === shooter.team) return; // no friendly fire
      const dmg = computeDamage(d, end, group, victim.armor, victim.helmet);
      this.addPuff(endPt, this.bloodMat, 0.35);
      this.applyDamage(victim, shooter, dmg, group, d, dir);
    } else if (wh) {
      this.addDecal(wh.point, wh.normal);
      this.addPuff(wh.point.clone().addScaledVector(wh.normal, 0.05), this.puffMat, 0.4);
      if (shooter === this.player || wh.point.distanceTo(this.player.pos) < 8) this.audio.impact(wh.point);
    }
  }

  applyDamage(victim, attacker, dmg, group, weaponDef, dir) {
    if (!victim.alive) return;
    const dealt = Math.min(victim.health, dmg.health);
    victim.health -= dmg.health;
    victim.armor = Math.max(0, victim.armor - dmg.armor);
    attacker.stats.damage += dealt;
    victim.damageBy.set(attacker, (victim.damageBy.get(attacker) || 0) + dealt);
    // getting shot slows you down (tagging)
    victim.vel.x *= 0.45; victim.vel.z *= 0.45;
    if (attacker === this.player) { this.hud.hitmarker(group === 'head', victim.health <= 0); this.audio.hit(group === 'head'); }
    if (attacker.human || victim.human) this.net?.event(['hit', attacker.netId, victim.netId, group === 'head' ? 1 : 0], true);
    if (victim === this.player) {
      this.audio.hurt();
      this.hud.damageFrom(attacker.pos);
      this.viewPunch = (this.viewPunch || 0) + (group === 'head' ? 4 : 1.4);
    }
    if (victim.isBot && victim.alive) {
      // bots react to being shot: turn toward the attacker
      if (!victim.target) { victim.lastSeen = attacker.pos.clone(); victim.lastSeenTime = this.time; victim.lookYaw = Math.atan2(-(attacker.pos.x - victim.pos.x), -(attacker.pos.z - victim.pos.z)); victim.holdUntil = this.time + 2; }
    }
    if (victim.health <= 0) this.kill(victim, attacker, weaponDef, group === 'head', dir);
  }

  kill(victim, killer, weaponDef, headshot, dir) {
    victim.alive = false; victim.health = 0;
    victim.stats.deaths++;
    killer.stats.kills++;
    if (killer === this.player) { const w = weaponDef.id; this.weaponKills[w] = (this.weaponKills[w] || 0) + 1; }
    if (headshot) killer.stats.hs++;
    for (const [att, dmg] of victim.damageBy) if (att !== killer && dmg >= 40 && att.team !== victim.team) att.stats.assists++;
    if (victim.isBot) {
      const fwd = victim.forward(); fwd.y = 0;
      victim.deathDir = dir && fwd.normalize().dot(dir.clone().setY(0).normalize()) > 0 ? 1 : -1;
    } else {
      this.player.scoped = 0; this.hud.setScope(0);
      this.mouse.left = false;
      this.deathCam = { from: victim.eyePos(), killer, t: 0 };
    }
    this.hud.killfeed(killer, victim, weaponDef, headshot);
    this.net?.event(['kill', killer.netId, victim.netId, weaponDef.id, headshot ? 1 : 0], true);
    this.checkRoundEnd();
  }

  radarSpot(target) {
    const t = target.team === 'T' ? 'CT' : 'T';
    this.spotted[t].set(target, this.time + 1.2);
  }

  // ---------------------------------------------------------------- effects
  addDecal(p, n) {
    let m = this.decals.length >= 150 ? this.decals.shift() : new THREE.Mesh(this.decalGeo, this.decalMat);
    m.position.copy(p).addScaledVector(n, 0.006);
    m.lookAt(p.clone().add(n));
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(0.7 + Math.random() * 0.6);
    this.scene.add(m); this.decals.push(m);
  }
  addTracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, this.tracerMat.clone());
    l.userData.life = 0.06;
    this.scene.add(l); this.tracers.push(l);
  }
  addPuff(p, mat, size) {
    const s = new THREE.Sprite(mat.clone());
    s.position.copy(p); s.scale.setScalar(size * 0.5);
    s.userData = { life: 0.35, max: 0.35, size, vy: 0.4 };
    this.scene.add(s); this.particles.push(s);
  }
  muzzleFlash(bot) {
    const s = new THREE.Sprite(this.flashMat);
    const p = bot.eyePos().addScaledVector(bot.forward(), 0.8); p.y -= 0.25;
    const right = new THREE.Vector3(Math.cos(bot.yaw), 0, -Math.sin(bot.yaw));
    p.addScaledVector(right, 0.15);
    s.position.copy(p); s.scale.setScalar(0.45);
    s.userData.life = 0.04;
    this.scene.add(s); this.flashes.push(s);
  }
  clearEffects() {
    for (const arr of [this.decals, this.tracers, this.particles, this.flashes]) {
      for (const o of arr) { this.scene.remove(o); if (o.geometry && o.geometry !== this.decalGeo && o.isLine) o.geometry.dispose(); }
      arr.length = 0;
    }
  }
  updateEffects(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const l = this.tracers[i]; l.userData.life -= dt;
      l.material.opacity = Math.max(0, l.userData.life / 0.06) * 0.7;
      if (l.userData.life <= 0) { this.scene.remove(l); l.geometry.dispose(); l.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const s = this.particles[i], u = s.userData; u.life -= dt;
      const f = 1 - u.life / u.max;
      s.scale.setScalar(u.size * (0.5 + f));
      s.material.opacity = 1 - f;
      s.position.y += u.vy * dt;
      if (u.life <= 0) { this.scene.remove(s); s.material.dispose(); this.particles.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const s = this.flashes[i]; s.userData.life -= dt;
      if (s.userData.life <= 0) { this.scene.remove(s); this.flashes.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- update
  updatePlayer(dt) {
    const p = this.player, k = this.keys, now = this.time;
    if (!p.alive) return;
    p.crouching = !!(k.ControlLeft || k.KeyC);
    p.walking = !!k.ShiftLeft;
    const wish = new THREE.Vector3();
    if (!this.freeze && !this.hud.buyOpen) {
      const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const r = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      if (k.KeyW) wish.add(f); if (k.KeyS) wish.sub(f);
      if (k.KeyD) wish.add(r); if (k.KeyA) wish.sub(r);
      if (wish.lengthSq() > 0) wish.normalize();
    }
    const jump = this.jumpQueued && p.onGround && !this.freeze;
    this.jumpQueued = false;
    const wasAir = !p.onGround;
    const landed = p.simulate(dt, wish, jump, this.level.world);
    if (landed && wasAir) this.audio.step(null, 0.9);
    if (p.onGround && p.speed2D() > 3.6) {
      this.stepTimer = (this.stepTimer || 0) - dt;
      if (this.stepTimer <= 0) { this.audio.step(null, 0.35); this.stepTimer = 0.36; }
    }

    const w = p.weapon;
    w.update(dt, now);
    if (this.rescope && now >= this.rescopeAt && w.def.scope) { if (this.mouse.right || true) { p.scoped = this.rescope; this.hud.setScope(p.scoped); } this.rescope = 0; }
    if (this.mouse.left && !this.hud.buyOpen && !this.freeze) {
      if (w.def.type === 'melee') {
        if (w.canFire(now)) this.fire(p, now);
      } else if (w.ammo <= 0 && w.reloading <= 0) {
        if (!this.triggerHeld) { this.audio.ui(); this.triggerHeld = true; }
        if (w.reserve > 0) this.reload();
      } else if ((w.def.auto || !this.triggerHeld) && w.canFire(now)) {
        this.fire(p, now);
        this.triggerHeld = true;
      }
    }
    // spotting for the radar
    const eye = p.eyePos(), fwd = p.forward();
    for (const e of this.bots) {
      if (!e.alive || e.team === p.team) continue;
      const t = e.pos.clone(); t.y += 1.2;
      const d = t.clone().sub(eye).normalize();
      if (d.dot(fwd) > 0.5 && this.level.world.lineOfSight(eye, t)) this.radarSpot(e);
    }
  }

  updateCamera(dt) {
    const p = this.player;
    this.viewPunch = (this.viewPunch || 0) * Math.exp(-10 * dt);
    let eye, yaw, pitch;
    if (p.alive) {
      eye = p.eyePos();
      const w = p.weapon;
      yaw = p.yaw - w.recoil[1] * DEG * 0.45;
      pitch = p.pitch + w.recoil[0] * DEG * 0.45 + this.viewPunch * DEG * 0.3;
    } else {
      // death cam: briefly look at killer, then spectate alive teammates
      const mates = this.characters.filter(c => c.alive && c.team === p.team);
      this.deathCam.t += dt;
      if (this.deathCam.t < 2.5 || !mates.length) {
        eye = this.deathCam.from.clone(); eye.y = Math.max(0.4, eye.y - this.deathCam.t * 0.8);
        const k = this.deathCam.killer;
        const d = k.eyePos().sub(eye);
        yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      } else {
        const m = mates[((this.specIndex % mates.length) + mates.length) % mates.length];
        this.spectating = m;
        eye = m.eyePos(); yaw = m.yaw; pitch = m.pitch;
        for (const b of this.bots) b.model.visible = b !== m || !b.alive ? true : false;
      }
    }
    if (p.alive || !this.spectating) for (const b of this.bots) b.model.visible = true;
    this.camera.position.copy(eye);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const fovBase = this.settings.fov ?? 74;
    const zoom = p.alive && p.scoped ? p.weapon.def.scope[p.scoped - 1] : fovBase;
    if (this.camera.fov !== zoom) { this.camera.fov = zoom; this.camera.updateProjectionMatrix(); }
    this.audio.setListener(eye, yaw);
  }

  loop(t) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    // rAF timestamps can precede performance.now() taken during setup, so clamp at 0
    let dt = Math.max(0, Math.min(0.05, (t - this.last) / 1000));
    this.last = t;
    if (!this.paused || this.net) {
      // fixed sub-steps keep movement deterministic at low frame rates
      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this.tick(h);
    }
    this.render(dt);
  }

  tick(dt) {
    this.time += dt;
    if (this.net && !this.net.isHost) {
      // online client: round state comes from host snapshots
      this.stateTimer -= dt;
      this.freeze = this.state === 'freeze';
      this.updatePlayer(dt);
      for (const b of this.bots) b.update(dt, this.time);
      this.net.tick(dt);
      return;
    }
    this.stateTimer -= dt;
    this.freeze = this.state === 'freeze';
    if (this.state === 'freeze' && this.stateTimer <= 0) { this.state = 'live'; this.stateTimer = this.opts.roundTime ?? 115; this.hud.goLive(); }
    else if (this.state === 'live') {
      this.roundTime += dt;
      if (this.stateTimer <= 0) this.endRound('CT', 'Time ran out');
    } else if (this.state === 'post' && this.stateTimer <= 0) {
      if (this.matchOver) { this.finish(); return; }
      this.startRound();
    }
    this.updatePlayer(dt);
    for (const b of this.bots) b.update(dt, this.time);
    this.net?.tick(dt);
  }

  // ---------------------------------------------------------------- online client
  clientStart() {
    this.state = 'freeze'; this.stateTimer = 5; this.round = 1;
    const sp = this.level.spawns[this.playerTeam][0];
    this.netRespawn(sp.clone(), 0);
    this.net.send({ k: 'hello' });
    this.hud.roundStart();
  }
  netRespawn(pos, yaw) {
    const p = this.player;
    p.reset(); p.pos.copy(pos); p.yaw = yaw; p.pitch = 0; p.crouch = 0; p.scoped = 0;
    this.deathCam = null; this.spectating = null;
    this.giveLoadout(this.loadout.primary, this.loadout.secondary);
  }
  netDeath() {
    const p = this.player;
    p.alive = false; p.health = 0; p.scoped = 0;
    this.hud.setScope(0); this.mouse.left = false;
    this.deathCam = { from: p.eyePos(), killer: this.lastKiller || p, t: 0 };
  }
  finishNet(reason) {
    if (!this.running) return;
    this.running = false;
    this.dispose();
    this.onExit({ net: true, reason });
  }

  render(dt) {
    const p = this.player;
    this.updateCamera(dt);
    this.updateEffects(dt);
    const showVm = p.alive && !p.scoped;
    if (p.alive) this.vm.update(dt, p.speed2D(), p.onGround, this.camera.aspect, this.camera.matrixWorld);
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (showVm) { r.clearDepth(); r.render(this.vm.scene, this.vm.camera); }
    this.hud.update(dt);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  finish() {
    if (this.net?.isHost) {
      // host reports the result; every player gets theirs from the server
      this.net.report();
      this.finishNet();
      return;
    }
    this.running = false;
    const result = {
      won: this.matchOver === this.playerTeam,
      score: { ...this.score }, team: this.playerTeam,
      stats: { ...this.player.stats },
      rounds: this.round,
      weaponKills: { ...this.weaponKills },
      players: this.characters.map(c => ({ name: c.name, team: c.team, ...c.stats, you: c === this.player })),
    };
    this.dispose();
    this.onExit(result);
  }

  quit() {
    if (this.net) { this.running = false; this.dispose(); this.onExit({ net: true, left: true }); return; }
    this.running = false; this.dispose();
    // leaving a ranked match counts as an abandon (loss + queue cooldown)
    if (this.opts.ranked) this.onExit({ abandoned: true, won: false, team: this.playerTeam, score: { ...this.score }, stats: { ...this.player.stats }, rounds: this.round, players: [], weaponKills: {} });
    else this.onExit(null);
  }

  dispose() {
    document.removeEventListener('keydown', this.h.keydown);
    document.removeEventListener('keyup', this.h.keyup);
    this.canvas.removeEventListener('mousedown', this.h.mousedown);
    document.removeEventListener('mouseup', this.h.mouseup);
    document.removeEventListener('mousemove', this.h.mousemove);
    document.removeEventListener('wheel', this.h.wheel);
    document.removeEventListener('pointerlockchange', this.h.lock);
    this.canvas.removeEventListener('contextmenu', this.h.ctx);
    window.removeEventListener('resize', this.onResize);
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.dispose();
    this.net?.dispose();
    this.renderer.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

export { WEAPONS, MOVE };
