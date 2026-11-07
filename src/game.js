// Match orchestration: rendering, input, bullets, rounds, the match economy,
// the bomb objective, grenades, spectating and the HUD.
import * as THREE from 'three';
import { buildLevel } from './level.js';
import { MAPS } from './maps.js';
import { Character, MOVE } from './character.js';
import { Bot } from './bots.js';
import { WEAPONS, computeDamage } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { audio } from './audio.js';
import { radialTexture, skyTexture, tex, rng } from './textures.js';
import { rayBox, rayCapsule } from './physics.js';
import { Hud } from './hud.js';
import { NetMatch } from './net/netmatch.js';
import { bindsFrom, actionMap } from './input.js';
import { ECON, lossBonus, addMoney, applyBuy, refundBuy } from './match/economy.js';
import { Bomb, BOMB } from './match/bomb.js';
import { Grenades } from './match/grenades.js';
import { Drops } from './match/drops.js';
import { Decals } from './decals.js';
import { Strategy } from './match/strategy.js';
import { qualityOf, DynamicResolution } from './gfx.js';
import { Outlines } from './outline.js';
import { skinTextureAsync } from './items/render.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const BOT_NAMES = ['Viper', 'Rook', 'Mako', 'Sable', 'Kestrel', 'Onyx', 'Drift', 'Talon', 'Ember', 'Quill',
  'Basalt', 'Cinder', 'Harrow', 'Jolt', 'Lynx', 'Nomad', 'Pike', 'Rune', 'Slate', 'Wisp'];
const OTHER = { T: 'CT', CT: 'T' };

export class Game {
  constructor(canvas, opts, settings, onExit) {
    this.canvas = canvas;
    this.opts = opts;
    this.settings = settings;
    this.onExit = onExit;
    this.audio = audio;
    this.time = 0;
    this.paused = false;
    this.held = new Set();
    this.binds = bindsFrom(settings);
    this.actions = actionMap(this.binds);

    // --- renderer ---
    // graphics quality: preset (or the automatic pick) decides resolution, AA and shadows
    const q = this.q = qualityOf(settings);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.msaa, powerPreference: 'high-performance', stencil: true });
    this.dyn = new DynamicResolution(r, q, settings.dynamicRes !== false);
    r.shadowMap.enabled = q.shadows !== 'off';
    r.shadowMap.type = q.shadowSize >= 4096 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd9c7a6, 70, 260);
    // near plane well clear of zero: the player can't get closer than 0.32 m to a wall, and a larger
    // near plane keeps far floors from flickering against the ground plane under the map
    this.camera = new THREE.PerspectiveCamera(settings.fov ?? 74, 1, 0.08, 600);
    this.scene.add(this.camera);

    // smaller modes play a smaller map: one bombsite for 2v2 / 3v3, a tiny yard for 1v1
    let map = MAPS[opts.map] || MAPS.dunehold;
    const size = opts.teamSize ?? opts.net?.room?.size ?? 5;
    if (map.small?.[size] && MAPS[map.small[size]]) map = MAPS[map.small[size]];
    this.map = map;
    this.level = buildLevel(map, this.scene, q);
    this.strategy = new Strategy(this);
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
      const team = i < n - 1 ? this.playerTeam : OTHER[this.playerTeam];
      // ranked matches pass per-side skill generators scaled to the player's rating
      const skill = opts.skillFor ? opts.skillFor(team === this.playerTeam) : opts.skill;
      const b = new Bot(team, names[i % names.length], skill, this);
      this.bots.push(b); this.characters.push(b);
      this.scene.add(b.model);
    }

    this.vm = new ViewModel(this.playerTeam, this.renderer);
    this.outlines = new Outlines(this);
    this.hud = new Hud(this);

    // effects
    this.tracers = []; this.particles = []; this.flashes = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.7 });
    this.flashMat = new THREE.SpriteMaterial({ map: radialTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.puffMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(200,180,150,0.9)', 'rgba(200,180,150,0)'), transparent: true, depthWrite: false });
    this.bloodMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(140,10,10,0.95)', 'rgba(90,0,0,0)'), transparent: true, depthWrite: false });
    this.decals = new Decals(this.scene, q.decals);
    this.grenades = new Grenades(this);
    this.bomb = new Bomb(this);
    this.drops = new Drops(this);

    // --- match state ---
    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.round = 0;
    this.winRounds = opts.winRounds || 5;
    this.state = 'freeze';
    this.stateTimer = 0;
    this.roundTime = 0;
    this.spotted = { T: new Map(), CT: new Map() };
    this.weaponKills = {};
    this.lastWeaponSlot = 2;
    this.spec = { mode: 'first', target: null, yaw: 0, pitch: -0.2, pos: new THREE.Vector3(), vmFor: null };

    if (opts.net) { this.net = new NetMatch(this, opts.net); this.net.buildRoster(); }
    this.setupCharacterShadows();

    this.bindInput();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    if (!this.net || this.net.isHost) this.startRound();
    else this.clientStart();
    // The browser can take the graphics context away (a GPU driver reset, too
    // many 3D views open). The match keeps running underneath; three.js
    // re-uploads everything when the context comes back, and only a context
    // that never returns ends the match.
    this.onContextLost = (e) => {
      e.preventDefault();
      if (this.contextLost) return;
      this.contextLost = true;
      this.hud.notice('Graphics reset: recovering...', 8);
      this.lostTimer = setTimeout(() => {
        if (this.contextLost) this.crash(new Error('The graphics context was lost and did not come back (the GPU driver reset, or too many 3D views were open).'));
      }, 10000);
    };
    this.onContextRestored = () => {
      this.contextLost = false; clearTimeout(this.lostTimer);
      this.hud.notice('Graphics restored', 1.5);
      try { this.bakeShadows(); } catch (err) { console.warn('Shadow redraw skipped:', err); }
    };
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    // Compile every shader up front (behind the loading screen) so the first
    // frames don't stall; the round clock starts once that's done.
    this.loaded = false;
    // upload the effect textures now, not on the first shot or hit
    for (const k of Object.values(this.decals.kinds)) for (const m of k.mats) if (m.map) this.renderer.initTexture(m.map);
    for (const m of [this.flashMat, this.puffMat, this.bloodMat]) if (m.map) this.renderer.initTexture(m.map);
    this.outlines.prewarm();
    this.makeSmokeFill();
    // your equipped skins are painted (in the background) before the round starts
    const skinsReady = Promise.race([
      Promise.all(Object.values(this.opts.skins || {}).filter(it => it?.defId).map(it => skinTextureAsync(it.defId, it.float, it.seed, 1024).catch(() => {}))),
      new Promise(r => setTimeout(r, 15000)),
    ]);
    this.ready = Promise.all([
      this.renderer.compileAsync(this.scene, this.camera),
      this.renderer.compileAsync(this.vm.scene, this.vm.camera),
      this.renderer.compileAsync(this.smokeFill.scene, this.smokeFill.cam),
      skinsReady,
    ]).catch((e) => console.warn('Shader warm-up skipped:', e)).then(() => { this.bakeShadows(); this.loaded = true; this.last = performance.now(); });
    this.last = performance.now();
    this.running = true;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // Something threw inside the game loop: stop cleanly and report it on the menu.
  crash(err) {
    if (this.crashed) return;
    this.crashed = true;
    console.error('Match crashed:', err);
    this.running = false;
    try { this.dispose(); } catch { /* already half torn down */ }
    this.onExit({ crashed: true, error: err });
  }

  buildEnvironment() {
    const s = this.map.sun;
    this.scene.add(new THREE.HemisphereLight(0xc4dcff, 0x9a7650, 0.85));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.8);
    const W = this.level.width, D = this.level.depth;
    const c = new THREE.Vector3(W / 2, 0, D / 2);
    sun.position.set(c.x + s.x * 80, s.y * 80, c.z + s.z * 80);
    sun.target.position.copy(c);
    const q = this.q;
    sun.castShadow = q.shadows !== 'off';
    const ext = Math.max(W, D) * 0.62;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 260 });
    if (sun.castShadow) sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    // static: the map's shadows are drawn once when the match loads (see bakeShadows)
    sun.shadow.autoUpdate = q.shadows === 'dynamic';
    this.sun = sun;
    this.scene.add(sun, sun.target);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    sky.position.copy(c);
    this.scene.add(sky);
    // outer ground + skyline of buildings beyond the walls
    const sand = tex('sand', 1).clone(); sand.repeat.set(225, 225); sand.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(c.x, -0.15, c.z); ground.receiveShadow = true;
    this.scene.add(ground);
    if (!q.skyline) return;
    const r = rng(77);
    const mat = new THREE.MeshStandardMaterial({ map: tex('plaster', 1), roughness: 0.95 });
    const mat2 = new THREE.MeshStandardMaterial({ map: tex('sandstone', 1), roughness: 0.95 });
    // all the skyline in two draw calls (one per material)
    const parts = [[], []];
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
      const box = new THREE.BoxGeometry(w, h, d); box.translate(x, h / 2, z);
      parts[r() < 0.5 ? 0 : 1].push(box);
      if (r() < 0.3) {
        const dome = new THREE.SphereGeometry(Math.min(w, d) * 0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.translate(x, h, z); dome.deleteAttribute('normal'); dome.computeVertexNormals();
        parts[1].push(dome.toNonIndexed());
      }
    }
    parts.forEach((list, k) => {
      if (!list.length) return;
      const geo = mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)));
      const m = new THREE.Mesh(geo, k ? mat2 : mat);
      m.receiveShadow = q.shadows !== 'off';
      this.scene.add(m);
    });
  }

  // Characters: real shadows only when they're redrawn every frame (Ultra);
  // otherwise a soft contact shadow on the ground under each one.
  setupCharacterShadows() {
    const dynamic = this.q.shadows === 'dynamic';
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
    const blobGeo = new THREE.PlaneGeometry(1.15, 1.15); blobGeo.rotateX(-Math.PI / 2);
    for (const ch of this.characters) {
      if (!ch.model || ch.blob) continue;
      ch.model.traverse(o => { if (o.isMesh) o.castShadow = dynamic; });
      if (!dynamic) {
        ch.blob = new THREE.Mesh(blobGeo, blobMat);
        ch.blob.renderOrder = 1;
        this.scene.add(ch.blob);
      }
    }
  }

  // Static shadows: draw the shadow map once with only the map in view, so
  // nothing that moves (players, guns, drops) gets frozen into it.
  bakeShadows() {
    if (this.q.shadows !== 'static' || !this.sun) return;
    const hidden = [];
    for (const o of this.scene.children) if (o.visible && o !== this.level.group && !o.isLight && o !== this.sun.target) { o.visible = false; hidden.push(o); }
    this.sun.shadow.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    for (const o of hidden) o.visible = true;
    this.renderer.clear();
  }

  // Per frame: contact shadows under the characters, simpler models further away.
  updateCharacterLooks() {
    const cam = this.camera.position;
    const bias = this.q.lodBias;
    const down = this._down ||= new THREE.Vector3(0, -1, 0);
    const from = this._from ||= new THREE.Vector3();
    for (const ch of this.characters) {
      const m = ch.model;
      if (!m) continue;
      const lods = m.userData.lods;
      if (lods && m.visible) {
        const d = cam.distanceTo(ch.pos) * (1 + bias);
        const k = d < 10 ? 0 : d < 28 ? 1 : 2;
        for (let i = 0; i < lods.length; i++) lods[i].visible = i === Math.min(k, lods.length - 1);
      }
      if (ch.blob) {
        const show = m.visible && ch.alive && !ch.despawned;
        ch.blob.visible = show;
        if (show) {
          from.set(ch.pos.x, ch.pos.y + 0.4, ch.pos.z);
          const hit = this.level.world.raycast(from, down, 3);
          const gy = hit ? from.y - hit.dist : ch.pos.y;
          ch.blob.position.set(ch.pos.x, gy + 0.015, ch.pos.z);
          const lift = Math.max(0, ch.pos.y - gy);
          ch.blob.scale.setScalar(Math.max(0.3, 1 - lift * 0.6) * (1 - ch.crouch * 0.1));
          ch.blob.material.opacity = Math.max(0, 1 - lift);
        }
      }
    }
  }

  // ---------------------------------------------------------------- input
  down(action) { return this.binds[action].some(c => this.held.has(c)); }

  bindInput() {
    const c = this.canvas;
    const press = (code) => {
      if (this.held.has(code)) return;
      this.held.add(code);
      for (const a of this.actions.get(code) || []) this.onAction(a, true);
    };
    const release = (code) => {
      if (!this.held.delete(code)) return;
      for (const a of this.actions.get(code) || []) this.onAction(a, false);
    };
    this.h = {
      keydown: (e) => {
        if (e.code === 'Tab' || this.actions.has(e.code)) e.preventDefault();
        if (this.hud.buyOpen && /^Digit/.test(e.code)) { this.hud.buyKey(e.code); return; }
        if (e.code === 'Escape' && this.hud.buyOpen) { this.hud.toggleBuy(false); return; }
        if (e.repeat) return;
        press(e.code);
      },
      keyup: (e) => release(e.code),
      mousedown: (e) => {
        if (this.paused || this.hud.buyOpen) return;
        if (document.pointerLockElement !== c) { c.requestPointerLock(); return; }
        press('Mouse' + e.button);
      },
      mouseup: (e) => release('Mouse' + e.button),
      mousemove: (e) => {
        if (document.pointerLockElement !== c) return;
        const p = this.player;
        if (!p.alive) {
          // spectator camera look (third person orbit / free cam)
          const k = this.settings.sensitivity * 0.022 * DEG;
          this.spec.yaw -= e.movementX * k;
          this.spec.pitch = Math.max(-1.45, Math.min(1.45, this.spec.pitch - e.movementY * k));
          return;
        }
        const scopeMul = p.scoped ? (p.weapon.def.scope?.length > 1 ? (p.scoped === 1 ? 0.444 : 0.2) : 0.6) : 1;
        const k = this.settings.sensitivity * 0.022 * DEG * scopeMul;
        p.yaw -= e.movementX * k;
        p.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, p.pitch - e.movementY * k));
        this.vm.look(e.movementX, e.movementY);
      },
      wheel: (e) => {
        if (document.pointerLockElement !== c) return;
        const code = e.deltaY > 0 ? 'WheelDown' : 'WheelUp';
        if (this.actions.has(code)) { press(code); release(code); return; }
        if (!this.player.alive) return;
        const order = [1, 2, 3, 4, 5].filter(s => (s === 4 ? this.player.nades.length : s === 5 ? this.player.hasBomb : this.player.weapons[s]));
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

  onAction(a, isDown) {
    const p = this.player;
    if (a === 'scoreboard') { this.hud.showScoreboard(isDown); return; }
    if (a === 'buy' && isDown) { if (this.canBuy()) this.hud.toggleBuy(); return; }
    if (this.paused) return;
    if (!p.alive) {
      if (!isDown) return;
      if (a === 'fire') this.cycleSpectate(1);
      else if (a === 'alt') this.cycleSpectate(-1);
      else if (a === 'jump') this.cycleSpecMode();
      return;
    }
    const w = p.weapon;
    if (w?.def.type === 'grenade') {
      // hold to pull the pin, release to throw (alt = underhand lob)
      if ((a === 'fire' || a === 'alt') && isDown && !this.freeze && w.deploying <= 0 && this.time >= w.nextFire) { if (!this.windup) { this.windup = a; this.vm.windup(); } return; }
      if ((a === 'fire' || a === 'alt') && !isDown && this.windup) {
        // both buttons = medium throw, primary = full throw, secondary = underhand lob
        const power = this.down(a === 'fire' ? 'alt' : 'fire') ? 0.65 : a === 'fire' ? 1 : 0.35;
        this.windup = null; this.throwNade(p, power);
        return;
      }
    }
    if (!isDown) { if (a === 'fire') this.triggerHeld = false; return; }
    if (a === 'jump') this.jumpQueued = true;
    else if (a === 'primary') this.switchWeapon(1);
    else if (a === 'secondary') this.switchWeapon(2);
    else if (a === 'knife') this.switchWeapon(3);
    else if (a === 'grenade') this.switchWeapon(4);
    else if (a === 'bomb') this.switchWeapon(5);
    else if (a === 'lastWeapon') this.switchWeapon(this.lastWeaponSlot);
    else if (a === 'reload') this.reload();
    else if (a === 'inspect') this.vm.inspect();
    else if (a === 'drop') this.dropWeapon(p);
    else if (a === 'alt') this.secondary();
    else if (a === 'use') this.useEdge = true;
  }

  skinFor(weaponId) { return this.opts.skins?.[weaponId] || null; }
  skinOf(ch, id) { return ch === this.player ? this.skinFor(id) : ch.skins?.[id] || null; }

  nearOwnSpawn(ch) {
    const list = this.level.spawns[ch.team] || [];
    return list.some(s => Math.hypot(s.x - ch.pos.x, s.z - ch.pos.z) < ECON.buyRadius);
  }
  canBuy(ch = this.player) {
    const roundTime = this.net && !this.net.isHost ? (this.opts.roundTime ?? 115) - this.stateTimer : this.roundTime;
    return ch.alive && (this.state === 'freeze' || (this.state === 'live' && roundTime < ECON.buyTime)) && this.nearOwnSpawn(ch);
  }

  // Buys for a character (player or bot). Returns { error } or { ok }.
  buy(ch, id) {
    if (!this.canBuy(ch)) return { error: 'Buying is closed' };
    if (this.net && !this.net.isHost && ch === this.player) this.net.buy(id);
    const res = applyBuy(ch, id);
    if (res.error) return res;
    if (res.dropped) res.rec.drop = this.drops.add(res.dropped, ch.eyePos().addScaledVector(ch.forward(), 0.4), ch.forward().multiplyScalar(2), this.skinOf(ch, res.dropped.id));
    if (ch === this.player) {
      this.audio.ui();
      if (res.slot === 1 || res.slot === 2) { this.player.slot = 0; this.switchWeapon(res.slot); }
    } else if (ch.isBot && (res.slot === 1 || res.slot === 2)) { ch.slot = 0; ch.switchTo(res.slot); ch.equip(); }
    return res;
  }

  // Sell back something bought this round that hasn't been used. A refunded
  // gun gives back the one it replaced, if that's still lying where it fell.
  refund(ch, id) {
    if (!this.canBuy(ch)) return { error: 'Buying is closed' };
    if (this.net && !this.net.isHost && ch === this.player) this.net.refund(id);
    const res = refundBuy(ch, id);
    if (res.error) return res;
    const drop = res.rec.drop;
    if (res.rec.weapon && drop && this.drops.list.includes(drop)) { ch.weapons[res.slot] = drop.ws; this.drops.remove(drop); }
    if (ch === this.player) {
      this.audio.ui();
      if (res.rec.weapon) { this.player.slot = 0; this.switchWeapon(this.player.bestSlot()); }
    }
    return res;
  }

  switchWeapon(slot) {
    const p = this.player;
    const prev = p.slot;
    if (p.switchTo(slot)) {
      if (prev !== slot && prev !== 0) this.lastWeaponSlot = prev;
      this.windup = null;
      this.vm.setWeapon(p.weapon.id, p.weapon.def.type, p.weapon.def.deployTime, this.skinFor(p.weapon.id));
      this.hud.setScope(0);
    }
  }

  reload() {
    const w = this.player.weapon;
    if (w.startReload()) {
      this.vm.reload(w.def.shellReload ? w.def.reloadTime * Math.min(w.def.magSize - w.ammo, w.reserve) : w.def.reloadTime);
      this.player.scoped = 0; this.hud.setScope(0);
      this.audio.reload(0);
      setTimeout(() => this.audio.reload(1), w.def.reloadTime * 650);
    }
  }

  secondary() {
    const p = this.player, w = p.weapon;
    if (!p.alive) return;
    if (w.def.scope && w.reloading <= 0) {
      p.scoped = (p.scoped + 1) % (w.def.scope.length + 1);
      this.hud.setScope(p.scoped, w.def);
      this.audio.ui();
    } else if (w.def.type === 'melee' && w.canFire(this.time)) {
      this.fire(p, this.time, true);
    }
  }

  // Drops the held gun (or the bomb) on the ground.
  dropWeapon(ch) {
    if (!ch.alive) return;
    if (ch.slot === 5 && ch.hasBomb) { this.bomb.drop(ch); if (ch === this.player) this.switchWeapon(ch.bestSlot()); return; }
    const w = ch.weapon;
    if (!w || (ch.slot !== 1 && ch.slot !== 2)) return;
    if (this.net && !this.net.isHost && ch === this.player) this.net.send({ k: 'drop' });
    ch.weapons[ch.slot] = null;
    const f = ch.forward();
    this.drops.add(w, ch.eyePos().addScaledVector(f, 0.4), f.multiplyScalar(4).add(new THREE.Vector3(0, 1.5, 0)), this.skinOf(ch, w.id));
    const to = ch.bestSlot();
    if (ch === this.player) { this.player.slot = 0; this.switchWeapon(to); }
    else { ch.slot = 0; ch.switchTo(to); ch.equip?.(); }
  }

  throwNade(ch, power) {
    const w = ch.weapon;
    if (!w || w.def.type !== 'grenade' || this.freeze) return;
    const type = w.id;
    const i = ch.nades.indexOf(type);
    if (i < 0) return;
    ch.nades.splice(i, 1);
    if (this.net && !this.net.isHost && ch === this.player) this.net.send({ k: 'nade', t: type, pw: +power.toFixed(2), y: ch.yaw, pi: ch.pitch });
    else this.grenades.throw(ch, type, power);
    if (ch === this.player) this.vm.throwNade();
    w.nextFire = this.time + 0.6;
    const next = () => {
      if (!ch.alive) return;
      if (ch.nades.length) { ch.selectNade(ch.nades.includes(type) ? type : null); ch.weapons[4].deploying = 0.3; if (ch === this.player) this.vm.setWeapon(ch.weapon.id, 'grenade', 0.3, null); else ch.equip?.(); }
      else if (ch === this.player) { this.player.slot = 0; this.switchWeapon(this.lastWeaponSlot !== 4 && this.player.weapons[this.lastWeaponSlot] ? this.lastWeaponSlot : this.player.bestSlot()); }
      else { ch.slot = 0; ch.switchTo(ch.bestSlot()); ch.equip?.(); }
    };
    setTimeout(next, 450);
  }

  setPaused(v) {
    if (this.net) {
      // online matches can't be paused: just show the menu over the running game
      this.menuOpen = v; this.hud.showPause(v);
      if (!v) this.canvas.requestPointerLock();
      this.held.clear();
      return;
    }
    this.paused = v;
    this.hud.showPause(v);
    if (!v) this.canvas.requestPointerLock();
    this.held.clear();
  }

  // Settings changed from the pause menu (binds, crosshair...).
  applySettings() {
    this.binds = bindsFrom(this.settings);
    this.actions = actionMap(this.binds);
    this.hud.applyCrosshair();
  }

  // ---------------------------------------------------------------- rounds
  startRound() {
    this.round++;
    for (const c of this.characters) c.buys = [];   // last round's purchases can't be refunded
    this.state = 'freeze';
    this.stateTimer = this.opts.freezeTime ?? 15;
    this.roundTime = 0;
    this.clearEffects();
    this.bomb.reset(); this.bomb.wasPlanted = false;
    const spawnFor = (team) => [...this.level.spawns[team]].sort(() => Math.random() - 0.5);
    const sp = { T: spawnFor('T'), CT: spawnFor('CT') };
    const center = new THREE.Vector3(this.level.width / 2, 0, this.level.depth / 2);
    const place = (ch) => {
      const list = sp[ch.team];
      const p = list.pop() || this.level.spawns[ch.team][0];
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
      return { pos: p.clone().add(jitter), yaw: Math.atan2(-(center.x - p.x), -(center.z - p.z)) };
    };
    for (const ch of this.characters) {
      if (this.round === 1) ch.money = ECON.start;
      // survivors keep their guns, armour and grenades; everyone else starts fresh
      if (this.round === 1 || !ch.survived) ch.resetGear();
      else this.refillAmmo(ch);
      ch.hasBomb = false;
    }
    const pp = place(this.player);
    const p = this.player;
    p.reset();
    p.pos.copy(pp.pos); p.yaw = pp.yaw; p.pitch = 0;
    p.crouch = 0; p.scoped = 0;
    p.slot = 0; p.switchTo(p.bestSlot());
    p.weapon.deploying = 0;
    this.vm.setWeapon(p.weapon.id, p.weapon.def.type, 0.3, this.skinFor(p.weapon.id));
    this.hud.setScope(0);
    this.deathCam = null; this.spec.target = null;

    for (const b of this.bots) {
      const pl = place(b);
      b.spawn(pl.pos, pl.yaw);
      b.netTarget = null;
      b.buyAt = b.human ? Infinity : 0.4 + Math.random() * 3;
      if (b.human) this.net.event(['spawn', b.netId, pl.pos.x, pl.pos.y, pl.pos.z, pl.yaw]);
    }
    // the bomb goes to a random attacker
    const ts = this.characters.filter(c => c.team === 'T');
    if (ts.length) this.bomb.give(ts[Math.floor(Math.random() * ts.length)]);
    this.planRound();
    this.hud.roundStart();
    this.net?.event(['round', 'start', this.round]);
  }

  planRound() {
    // maps with named spots use team tactics (default, gather, execute / holds and rotations)
    if (this.strategy.enabled) { this.tSite = null; this.strategy.plan(); return; }
    const sites = this.level.sites;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const goalOf = (L) => {
      // prefer site cells that aren't covered by crates/platforms
      const cells = sites[L].filter(v => this.level.nav.walkable(...this.level.nav.cellOf(v)));
      return pick(cells.length ? cells : sites[L]);
    };
    const list = this.siteList();
    if (!list.length) return;
    this.tSite = list.length > 1 && Math.random() >= 0.55 ? list[1] : list[0];
    let i = 0;
    for (const b of this.bots) {
      b.holdUntil = 0; b.lookYaw = b.yaw;
      if (b.team === 'T') {
        const other = list.find(L => L !== this.tSite);
        const L = b.hasBomb || !other || Math.random() < 0.8 ? this.tSite : other;
        b.setGoal(goalOf(L).clone(), 'attack');
      } else {
        const L = list[i++ % list.length];
        b.setGoal(goalOf(L).clone(), 'hold');
      }
    }
  }

  // The bombsites this map has: 'A' and 'B', or only 'A' on the small maps.
  siteList() {
    return (this._sites ||= ['A', 'B'].filter(L => this.level.sites[L]?.length));
  }
  // A walkable spot on a site (a site the map doesn't have means its first one).
  // Asking small maps for site B used to throw and end the match.
  siteGoal(L) {
    if (!this.level.sites[L]?.length) L = this.siteList()[0];
    const all = L ? this.level.sites[L] : null;
    if (!all?.length) return this.level.spawns[this.playerTeam === 'T' ? 'CT' : 'T'][0].clone();
    const cells = all.filter(v => this.level.nav.walkable(...this.level.nav.cellOf(v)));
    const list = cells.length ? cells : all;
    return list[Math.floor(Math.random() * list.length)].clone();
  }

  // Bots only chase what they have seen, heard or been shot from; with nothing
  // to go on they sweep a bombsite instead of being handed enemy positions.
  assignHunt(bot) {
    const nav = this.level.nav;
    if (bot.lastSeen && this.time - bot.lastSeenTime < 12) {
      const [cx, cz] = nav.cellOf(bot.lastSeen);
      bot.setGoal(nav.walkable(cx, cz) ? nav.center(cx, cz) : bot.lastSeen.clone(), 'hunt');
      return;
    }
    if (this.bomb.state === 'planted') { bot.setGoal(this.bomb.pos.clone(), bot.team === 'CT' ? 'retake' : 'guard'); return; }
    const list = this.siteList();
    bot.setGoal(this.siteGoal(list[Math.floor(Math.random() * list.length)]), 'hunt');
  }

  // Sound for bots: anyone on the other side within `radius` hears it.
  noise(pos, radius, source) {
    for (const b of this.bots) {
      if (!b.alive || (source && b.team === source.team) || b.puppet) continue;
      const d = b.pos.distanceTo(pos);
      if (d < radius * (b.prof?.hearingMul ?? 1)) b.hear?.(pos, this.time, d / radius);
    }
  }

  aliveCount(team) { return this.characters.filter(c => c.team === team && c.alive).length; }

  checkRoundEnd() {
    if (this.state !== 'live') return;
    const t = this.aliveCount('T'), ct = this.aliveCount('CT');
    if (ct === 0) this.endRound('T', 'Defenders eliminated', 'elim');
    else if (t === 0 && this.bomb.state !== 'planted') this.endRound('CT', 'Attackers eliminated', 'elim');
  }

  endRound(winner, reason, kind = 'elim') {
    if (this.state === 'post') return;
    this.state = 'post';
    this.stateTimer = 6;
    this.score[winner]++;
    const loser = OTHER[winner];
    const objective = kind === 'bomb' || kind === 'defuse';
    for (const ch of this.characters) {
      if (ch.team === winner) addMoney(ch, objective ? ECON.winObjective : ECON.win);
      else addMoney(ch, lossBonus(this.lossStreak[loser] + 1) + (loser === 'T' && this.bomb.wasPlanted ? ECON.plantBonus : 0));
      ch.survived = ch.alive;
    }
    this.lossStreak[loser]++;
    this.lossStreak[winner] = Math.max(0, this.lossStreak[winner] - 1);
    const won = winner === this.playerTeam;
    this.audio.ui(won ? 'win' : 'lose');
    const over = this.score[winner] >= this.winRounds;
    this.hud.roundEnd(winner, reason, over);
    if (over) { this.matchOver = winner; this.stateTimer = 8; }
    this.net?.event(['round', 'end', winner, reason, over ? 1 : 0]);
    if (over) this.net?.event(['over', winner]);
  }

  // --- bomb callbacks
  onBombPlanted(ch, site) {
    this.bomb.wasPlanted = true;
    addMoney(ch, ECON.planter);
    this.stateTimer = BOMB.fuse;
    this.hud.message('Bomb planted', `Site ${site} · ${ch.team === this.playerTeam ? 'defend it' : 'defuse it'}`, 3, ch.team === this.playerTeam ? 'win' : 'lose');
    this.audio.bombPlanted?.();
    for (const b of this.bots) b.onBombPlanted?.(this.bomb);
    this.net?.event(['bomb', 'plant', site, +this.bomb.pos.x.toFixed(2), +this.bomb.pos.y.toFixed(2), +this.bomb.pos.z.toFixed(2), +ch.yaw.toFixed(2)], true);
  }
  onBombDefused(ch) {
    addMoney(ch, ECON.defuser);
    this.net?.event(['bomb', 'defused'], true);
    this.endRound('CT', `Bomb defused by ${ch.name}`, 'defuse');
  }
  onBombExploded() {
    this.net?.event(['bomb', 'exploded'], true);
    if (this.state === 'live') this.endRound('T', 'Target destroyed', 'bomb');
  }
  onBombPickup(ch) {
    if (ch === this.player) this.hud.notice('You picked up the bomb');
    this.net?.event(['bomb', 'carry', ch.netId]);
  }
  onPickup(ch, slot) {
    if (ch === this.player) { this.hud.notice(`Picked up ${ch.weapons[slot].def.name}`); if (this.player.slot === 3) this.switchWeapon(slot); }
    else if (ch.isBot && ch.slot === 3) { ch.slot = 0; ch.switchTo(slot); ch.equip(); }
  }

  // ---------------------------------------------------------------- combat
  fire(shooter, now, heavy = false) {
    const w = shooter.weapon, d = w.def;
    const isPlayer = shooter === this.player;
    const remoteClient = this.net && !this.net.isHost;
    const watched = this.spec.target === shooter && this.spec.mode === 'first' && !this.player.alive;
    if (d.type === 'melee') {
      w.nextFire = now + (heavy ? d.heavyInterval : d.fireInterval);
      this.audio.knife(isPlayer ? null : shooter.pos);
      if (isPlayer || watched) this.vm.fire();
      this.swingSide = -(this.swingSide || 1);
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
        const hit = best.pos.clone(); hit.y += best.height * 0.65;
        this.bloodSplat(hit, fwd, 0.5);
        this.applyDamage(best, shooter, { health: dmg, armor: 0 }, 'chest', d, fwd);
      } else {
        // the blade scrapes whatever surface is in reach
        const wh = this.level.world.raycast(eye, fwd, d.range);
        if (wh) {
          const right = new THREE.Vector3(Math.cos(shooter.yaw), 0, -Math.sin(shooter.yaw));
          const swing = right.multiplyScalar(this.swingSide).add(new THREE.Vector3(0, heavy ? -0.6 : -0.25, 0));
          this.decals.slash(wh.point, wh.normal, swing);
          this.audio.impact(wh.point);
        }
      }
      this.noise(shooter.pos, 8, shooter);
      return;
    }
    if (d.type === 'grenade' || d.type === 'bomb') return;
    const spread = shooter.inaccuracy();
    const [rp, ry] = w.fire(now);
    const origin = shooter.eyePos();
    const pellets = d.pellets || 1;
    // your bullets follow the aim punch (being shot, the kick of the last shot)
    // exactly as far as the view does, so the crosshair always shows where they go
    const punch = isPlayer ? (this.viewPunch || 0) * DEG * 0.3 : 0;
    for (let i = 0; i < pellets; i++) {
      let pitch = shooter.pitch + rp * DEG + punch, yaw = shooter.yaw - ry * DEG;
      const a = Math.random() * Math.PI * 2, rr = spread * Math.random() + (d.pelletSpread ? d.pelletSpread * Math.sqrt(Math.random()) : 0);
      pitch += Math.sin(a) * rr; yaw += Math.cos(a) * rr;
      const cp = Math.cos(pitch);
      const dir = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
      // online clients only draw their own shots; the host decides what they hit
      this.traceBullet(shooter, origin, dir, d, remoteClient, i > 0);
      if (remoteClient && isPlayer) this.net.shot(origin, dir, w.id);
    }
    this.audio.shot(d, isPlayer ? null : shooter.pos);
    this.noise(origin, d.suppressed ? 14 : 48, shooter);
    if (isPlayer) {
      this.vm.fire();
      this.viewPunch = (this.viewPunch || 0) + d.viewKick;
      this.hud.bloom();
      if (d.scope && shooter.scoped && d.type === 'sniper') { this.rescope = shooter.scoped; shooter.scoped = 0; this.hud.setScope(0); this.rescopeAt = now + w.interval * 0.9; }
    } else {
      this.muzzleFlash(shooter);
      shooter.onFire?.();
      if (watched) this.vm.fire();
    }
  }

  traceBullet(shooter, origin, dir, d, visualOnly = false, quiet = false) {
    const wh = this.level.world.raycast(origin, dir, 250, true);
    let end = wh ? wh.dist : 250;
    let victim = null, group = null;
    const near = new THREE.Vector3();
    for (const e of this.characters) {
      if (!e.alive || e === shooter) continue;
      // skip anyone the ray passes nowhere near (closest approach to their middle)
      near.copy(e.pos); near.y += 1;
      const along = near.clone().sub(origin).dot(dir);
      if (along < -1 || origin.clone().addScaledVector(dir, Math.max(0, along)).distanceTo(near) > 1.4) continue;
      const caps = e.hitCapsules?.();
      if (caps) {
        for (const c of caps) { const t = rayCapsule(origin, dir, c.a, c.b, c.r); if (t >= 0 && t < end) { end = t; victim = e; group = c.group; } }
      } else {
        for (const hb of e.hitboxes()) {
          const t = rayBox(origin, dir, hb.min, hb.max);
          if (t >= 0 && t < end) { end = t; victim = e; group = hb.group; }
        }
      }
    }
    const endPt = origin.clone().addScaledVector(dir, end);
    // tracer starts near the muzzle rather than the eye
    const startPt = origin.clone();
    if (shooter === this.player) {
      const right = new THREE.Vector3(Math.cos(shooter.yaw), 0, -Math.sin(shooter.yaw));
      startPt.addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(dir, 0.6);
    }
    if (!quiet && (shooter !== this.player || Math.random() < 0.5)) this.addTracer(startPt, endPt);
    if (!quiet) this.net?.event(['shot', shooter.netId, +startPt.x.toFixed(2), +startPt.y.toFixed(2), +startPt.z.toFixed(2), +endPt.x.toFixed(2), +endPt.y.toFixed(2), +endPt.z.toFixed(2), d.id]);
    if (victim && visualOnly) { if (victim.team !== shooter.team) { this.addPuff(endPt, this.bloodMat, 0.35); this.bloodSplat(endPt, dir, 0.35); } return; }
    if (victim) {
      if (victim.team === shooter.team) return; // no friendly fire
      const dmg = computeDamage(d, end, group, victim.armor, victim.helmet);
      this.addPuff(endPt, this.bloodMat, 0.35);
      this.bloodSplat(endPt, dir, group === 'head' ? 0.55 : 0.4);
      this.applyDamage(victim, shooter, dmg, group, d, dir);
    } else if (wh) {
      this.decals.bullet(wh.point, wh.normal);
      this.addPuff(wh.point.clone().addScaledVector(wh.normal, 0.05), this.puffMat, 0.4);
      if (shooter === this.player || wh.point.distanceTo(this.player.pos) < 8) this.audio.impact(wh.point);
    }
  }

  // Blood thrown onto the surface behind a hit, plus drips on the floor.
  bloodSplat(p, dir, size) {
    const world = this.level.world;
    const back = world.raycast(p, dir, 2.6);
    if (back) this.decals.blood(back.point, back.normal, size * (1.1 - back.dist / 4));
    const down = world.raycast(p, new THREE.Vector3((Math.random() - 0.5) * 0.3, -1, (Math.random() - 0.5) * 0.3).normalize(), 2.2);
    if (down && Math.random() < 0.8) this.decals.blood(down.point, down.normal, size * 0.6);
  }

  applyDamage(victim, attacker, dmg, group, weaponDef, dir) {
    if (!victim.alive) return;
    const dealt = Math.min(victim.health, dmg.health);
    victim.health -= dmg.health;
    victim.armor = Math.max(0, victim.armor - dmg.armor);
    if (attacker && attacker.team !== victim.team) {
      attacker.stats.damage += dealt;
      victim.damageBy.set(attacker, (victim.damageBy.get(attacker) || 0) + dealt);
    }
    // getting shot slows you down (tagging)
    victim.vel.x *= 0.45; victim.vel.z *= 0.45;
    if (attacker === this.player && victim !== this.player) { this.hud.hitmarker(group === 'head', victim.health <= 0); this.audio.hit(group === 'head'); }
    if (attacker && (attacker.human || victim.human)) this.net?.event(['hit', attacker.netId, victim.netId, group === 'head' ? 1 : 0], true);
    if (victim === this.player) {
      this.audio.hurt();
      if (attacker && attacker !== victim) this.hud.damageFrom(attacker.pos);
      this.viewPunch = (this.viewPunch || 0) + (group === 'head' ? 4 : 1.4);
    }
    if (victim.isBot && victim.alive && attacker && attacker !== victim) victim.onHurt?.(attacker, this.time);
    if (victim.health <= 0) this.kill(victim, attacker, weaponDef, group === 'head', dir);
  }

  // Damage with no shooter (the bomb).
  environmentDamage(victim, amount, label, pos) {
    if (!victim.alive) return;
    victim.health -= amount;
    if (victim === this.player) { this.audio.hurt(); this.hud.damageFrom(pos); }
    if (victim.health <= 0) this.kill(victim, null, { id: 'c4', name: label }, false, victim.pos.clone().sub(pos).normalize());
  }

  kill(victim, killer, weaponDef, headshot, dir) {
    victim.alive = false; victim.health = 0;
    victim.stats.deaths++;
    if (killer && killer !== victim) {
      killer.stats.kills++;
      if (headshot) killer.stats.hs++;
      if (killer.team !== victim.team) addMoney(killer, weaponDef.reward ?? 300);
      if (killer === this.player) { const w = weaponDef.id; this.weaponKills[w] = (this.weaponKills[w] || 0) + 1; this.hud.moneyGain(weaponDef.reward ?? 300); }
    }
    for (const [att, dmg] of victim.damageBy) if (att !== killer && dmg >= 40 && att.team !== victim.team) att.stats.assists++;
    // gear on the ground: the best gun, and the bomb
    if (victim.hasBomb) this.bomb.drop(victim, false);
    const gun = victim.weapons?.[1] || victim.weapons?.[2];
    if (gun && (!this.net || this.net.isHost)) {
      const v = (dir || new THREE.Vector3()).clone().setY(0).multiplyScalar(2).add(new THREE.Vector3(0, 1.5, 0));
      this.drops.add(gun, victim.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), v, this.skinOf(victim, gun.id));
      victim.weapons[victim.weapons[1] ? 1 : 2] = null;
    }
    victim.deathDir = dir ? (victim.forward().setY(0).normalize().dot(dir.clone().setY(0).normalize()) > 0 ? 1 : -1) : -1;
    victim.deathImpulse = dir ? dir.clone() : new THREE.Vector3();
    victim.onDeath?.(dir);
    if (victim === this.player) {
      this.player.scoped = 0; this.hud.setScope(0);
      this.windup = null;
      this.deathCam = { from: victim.eyePos(), killer: killer || victim, t: 0 };
    }
    this.hud.killfeed(killer, victim, weaponDef, headshot);
    this.net?.event(['kill', killer?.netId ?? null, victim.netId, weaponDef.id, headshot ? 1 : 0], true);
    this.checkRoundEnd();
  }

  radarSpot(target) {
    const t = OTHER[target.team];
    this.spotted[t].set(target, this.time + 1.2);
  }

  // ---------------------------------------------------------------- effects
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
    const p = bot.muzzleWorld ? bot.muzzleWorld() : bot.eyePos().addScaledVector(bot.forward(), 0.8).add(new THREE.Vector3(0, -0.25, 0));
    s.position.copy(p); s.scale.setScalar(0.45);
    s.userData.life = 0.04;
    this.scene.add(s); this.flashes.push(s);
  }
  clearEffects() {
    for (const arr of [this.tracers, this.particles, this.flashes]) {
      for (const o of arr) { this.scene.remove(o); if (o.isLine) o.geometry.dispose(); }
      arr.length = 0;
    }
    this.decals.clear();
    this.grenades.clear();
    this.drops.clear();
    for (const b of this.bots) b.clearRagdoll?.();
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
    const p = this.player, now = this.time;
    this.useProgress = null;
    if (!p.alive) { this.useEdge = false; return; }
    p.crouching = this.down('crouch');
    p.walking = this.down('walk');
    // planting / defusing roots you in place
    const useHeld = this.down('use') || (p.slot === 5 && this.down('fire'));
    let rooted = false;
    if (useHeld && !this.freeze && (!this.net || this.net.isHost)) {
      if (p.hasBomb) { const pr = this.bomb.holdPlant(p, dt); if (pr >= 0) { this.useProgress = { kind: 'plant', pr }; rooted = true; } }
      else if (p.team === 'CT') { const pr = this.bomb.holdDefuse(p, dt); if (pr >= 0) { this.useProgress = { kind: 'defuse', pr, kit: p.hasKit }; rooted = true; } }
    }
    if (this.net && !this.net.isHost && useHeld && this.netUse) { this.useProgress = this.netUse; rooted = true; }
    if (this.useEdge && !rooted) {
      const d = this.drops.aimed(p);
      if (d) {
        const slot = d.ws.def.slot;
        if (p.weapons[slot]) { const cur = p.slot; p.slot = slot; this.dropWeapon(p); p.slot = cur; }
        this.drops.take(p, d);
        this.player.slot = 0; this.switchWeapon(slot);
      }
    }
    this.useEdge = false;
    if (rooted) p.crouching = true;
    const wish = new THREE.Vector3();
    if (!this.freeze && !this.hud.buyOpen && !rooted) {
      const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const r = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      if (this.down('forward')) wish.add(f); if (this.down('back')) wish.sub(f);
      if (this.down('right')) wish.add(r); if (this.down('left')) wish.sub(r);
      if (wish.lengthSq() > 0) wish.normalize();
    }
    const jump = this.jumpQueued && p.onGround && !this.freeze && !rooted;
    this.jumpQueued = false;
    const wasAir = !p.onGround;
    const landed = p.simulate(dt, wish, jump, this.level.world);
    if (landed && wasAir) { this.audio.step(null, 0.9); this.noise(p.pos, 14, p); }
    if (p.onGround && p.speed2D() > 3.6) {
      this.stepTimer = (this.stepTimer || 0) - dt;
      if (this.stepTimer <= 0) { this.audio.step(null, 0.35); this.stepTimer = 0.36; this.noise(p.pos, 18, p); }
    }

    const w = p.weapon;
    w.update(dt, now);
    this.vm.setEmpty(w.def.type === 'pistol' && w.ammo === 0 && w.reloading <= 0);
    if (this.rescope && now >= this.rescopeAt && w.def.scope) { p.scoped = this.rescope; this.hud.setScope(p.scoped, w.def); this.rescope = 0; }
    if (this.down('fire') && !this.hud.buyOpen && !this.freeze && w.def.type !== 'grenade' && w.def.type !== 'bomb') {
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
      if (d.dot(fwd) > 0.5 && this.level.world.lineOfSight(eye, t) && !this.grenades.blocksSight(eye, t)) this.radarSpot(e);
    }
  }

  // ---------------------------------------------------------------- spectating
  spectateTargets() {
    const p = this.player;
    const mates = this.characters.filter(c => c.alive && c !== p && c.team === p.team);
    return mates.length ? mates : this.characters.filter(c => c.alive && c !== p);
  }
  cycleSpectate(dir) {
    const list = this.spectateTargets();
    if (!list.length) return;
    if (this.spec.mode === 'free') this.spec.mode = 'first';
    const i = list.indexOf(this.spec.target);
    this.spec.target = list[(i + dir + list.length) % list.length];
    this.deathCam = null;
  }
  cycleSpecMode() {
    const modes = this.opts.ranked ? ['first', 'third'] : ['first', 'third', 'free'];
    this.spec.mode = modes[(modes.indexOf(this.spec.mode) + 1) % modes.length];
    if (this.spec.mode === 'free') this.spec.pos.copy(this.camera.position);
    if (this.spec.mode === 'third' && this.spec.target) { this.spec.yaw = this.spec.target.yaw; this.spec.pitch = -0.25; }
    this.deathCam = null;
  }

  updateCamera(dt) {
    const p = this.player;
    this.viewPunch = (this.viewPunch || 0) * Math.exp(-10 * dt);
    let eye, yaw, pitch;
    const sp = this.spec;
    let hideModel = null;
    if (p.alive) {
      eye = p.eyePos();
      // ease the view over stair treads and kerbs instead of snapping 15 cm a frame
      const sm = this.eyeSmooth;
      if (sm != null && p.onGround && Math.abs(eye.y - sm) < 0.6) eye.y = sm + (eye.y - sm) * (1 - Math.exp(-dt * 15));
      this.eyeSmooth = eye.y;
      const w = p.weapon;
      yaw = p.yaw - w.recoil[1] * DEG * 0.45;
      pitch = p.pitch + w.recoil[0] * DEG * 0.45 + this.viewPunch * DEG * 0.3;
      sp.target = null;
    } else if (this.deathCam && this.deathCam.t < 2.2) {
      // death cam: look at whoever got you
      this.deathCam.t += dt;
      eye = this.deathCam.from.clone(); eye.y = Math.max(0.4, eye.y - this.deathCam.t * 0.8);
      const k = this.deathCam.killer;
      const d = k.eyePos().sub(eye);
      yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      sp.pos.copy(eye); sp.yaw = yaw; sp.pitch = pitch;
    } else {
      if (!sp.target || !sp.target.alive) { sp.target = null; this.cycleSpectate(1); }
      const t = sp.target;
      if (sp.mode === 'free' && !this.opts.ranked) {
        const speed = (this.down('walk') ? 4 : 11) * dt;
        const f = new THREE.Vector3(-Math.sin(sp.yaw) * Math.cos(sp.pitch), Math.sin(sp.pitch), -Math.cos(sp.yaw) * Math.cos(sp.pitch));
        const r = new THREE.Vector3(Math.cos(sp.yaw), 0, -Math.sin(sp.yaw));
        if (this.down('forward')) sp.pos.addScaledVector(f, speed); if (this.down('back')) sp.pos.addScaledVector(f, -speed);
        if (this.down('right')) sp.pos.addScaledVector(r, speed); if (this.down('left')) sp.pos.addScaledVector(r, -speed);
        if (this.down('crouch')) sp.pos.y -= speed;
        sp.pos.y = Math.max(0.3, Math.min(40, sp.pos.y));
        eye = sp.pos.clone(); yaw = sp.yaw; pitch = sp.pitch;
      } else if (t && sp.mode === 'third') {
        const head = t.eyePos();
        const back = new THREE.Vector3(Math.sin(sp.yaw) * Math.cos(sp.pitch), -Math.sin(sp.pitch), Math.cos(sp.yaw) * Math.cos(sp.pitch));
        const hit = this.level.world.raycast(head, back, 3.4);
        const dist = hit ? Math.max(0.4, hit.dist - 0.25) : 3.2;
        eye = head.addScaledVector(back, dist); yaw = sp.yaw; pitch = sp.pitch;
      } else if (t) {
        eye = t.eyePos(); yaw = t.yaw; pitch = t.pitch;
        hideModel = t;
      } else {
        eye = sp.pos.clone(); yaw = sp.yaw; pitch = sp.pitch;
      }
    }
    for (const b of this.bots) b.model.visible = b !== hideModel && !b.despawned;
    this.camera.position.copy(eye);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const fovBase = this.settings.fov ?? 74;
    const viewer = p.alive ? p : hideModel;
    const scope = viewer?.scoped ? viewer.weapon.def.scope?.[viewer.scoped - 1] : null;
    const zoom = scope || fovBase;
    if (this.camera.fov !== zoom) { this.camera.fov = zoom; this.camera.updateProjectionMatrix(); }
    this.audio.setListener(eye, yaw);
    this.firstPersonTarget = hideModel;
  }

  loop(t) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (!this.loaded) return;   // shaders still compiling behind the loading screen
    // rAF timestamps can precede performance.now() taken during setup, so clamp at 0
    const raw = Math.max(0, (t - this.last) / 1000);
    let dt = Math.min(0.05, raw);
    this.last = t;
    let ok = true;
    try {
      this.dyn.frame(Math.min(raw, 0.25));
      if (!this.paused || this.net) {
        // fixed sub-steps keep movement deterministic at low frame rates
        const steps = Math.ceil(dt / (1 / 120));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) this.tick(h);
      }
    } catch (e) { ok = false; this.frameFailed(e); }
    if (this.running && !this.contextLost) {
      try { this.render(dt); } catch (e) { ok = false; this.frameFailed(e); }
    }
    if (ok) this.badFrames = 0;
  }

  // One frame throwing used to end the whole match. Now it is logged (once per
  // kind of error) and the next frame carries on; only a match that fails
  // every frame for about three seconds is stopped and reported.
  frameFailed(e) {
    this.badFrames = (this.badFrames || 0) + 1;
    this.logError(e);
    if (this.badFrames > 180) this.crash(e);
  }

  tick(dt) {
    this.time += dt;
    if (this.net && !this.net.isHost) {
      // online client: round state comes from host snapshots
      this.stateTimer -= dt;
      this.freeze = this.state === 'freeze';
      this.updatePlayer(dt);
      for (const b of this.bots) this.guard(() => b.update(dt, this.time));
      this.guard(() => this.grenades.update(dt));
      this.guard(() => this.drops.update(dt));
      this.guard(() => this.bomb.updateClient?.(dt));
      this.net.tick(dt);
      return;
    }
    this.stateTimer -= dt;
    this.freeze = this.state === 'freeze';
    if (this.state === 'freeze' && this.stateTimer <= 0) {
      this.state = 'live'; this.stateTimer = this.opts.roundTime ?? 115; this.hud.goLive();
      this.net?.event(['round', 'live']);
    } else if (this.state === 'live') {
      this.roundTime += dt;
      if (this.bomb.state === 'planted') this.stateTimer = this.bomb.timer;
      else if (this.stateTimer <= 0) this.endRound('CT', 'Time ran out', 'time');
    } else if (this.state === 'post' && this.stateTimer <= 0) {
      if (this.matchOver) { this.finish(); return; }
      this.startRound();
    }
    this.updatePlayer(dt);
    for (const b of this.bots) this.guard(() => b.update(dt, this.time));
    this.guard(() => this.strategy.update());
    this.guard(() => this.bomb.update(dt));
    this.guard(() => this.grenades.update(dt));
    this.guard(() => this.drops.update(dt));
    this.guard(() => this.net?.tick(dt));
  }

  // Runs one part of a frame. If it throws, the error is logged and the rest
  // of the frame still runs: a bot or an effect that breaks skips a beat
  // instead of taking the whole match down.
  guard(fn) {
    try { fn(); } catch (e) { this.logError(e); }
  }
  logError(e) {
    const key = String(e?.stack || e).slice(0, 300);
    this.seenErrors ||= new Set();
    if (this.seenErrors.has(key) || this.seenErrors.size >= 20) return;
    this.seenErrors.add(key);
    console.error('Frame error (the match carries on):', e);
  }

  // ---------------------------------------------------------------- online client
  clientStart() {
    this.state = 'freeze'; this.stateTimer = 15; this.round = 1;
    const sp = this.level.spawns[this.playerTeam][0];
    this.player.money = ECON.start;
    this.player.resetGear();
    this.netRespawn(sp.clone(), 0, true);
    this.net.send({ k: 'hello' });
    this.hud.roundStart();
  }
  // Guns a survivor kept start the new round with a full magazine and reserve.
  refillAmmo(ch) {
    for (const w of Object.values(ch.weapons || {})) {
      if (!w || !w.def?.pattern) continue;
      w.ammo = w.def.magSize; w.reserve = w.def.reserve;
      w.reloading = 0; w.shotIndex = 0; w.recoil = [0, 0];
    }
  }

  netRespawn(pos, yaw, fresh) {
    const p = this.player;
    if (fresh || !p.alive || !p.weapons[2] && !p.weapons[1]) p.resetGear();
    else this.refillAmmo(p);
    p.reset(); p.pos.copy(pos); p.yaw = yaw; p.pitch = 0; p.crouch = 0; p.scoped = 0;
    this.deathCam = null; this.spec.target = null;
    p.slot = 0; p.switchTo(p.bestSlot());
    this.vm.setWeapon(p.weapon.id, p.weapon.def.type, 0.3, this.skinFor(p.weapon.id));
  }
  netDeath() {
    const p = this.player;
    p.alive = false; p.health = 0; p.scoped = 0;
    this.hud.setScope(0); this.windup = null;
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
    this.guard(() => this.updateEffects(dt));
    const t = this.firstPersonTarget;
    let showVm = false;
    if (p.alive) {
      showVm = !p.scoped;
      this.guard(() => this.vm.update(dt, p.speed2D(), p.onGround, this.camera.aspect, this.camera.matrixWorld));
    } else if (t && t.weapon) {
      // first-person spectating: show their gun and arms
      const key = t.weapon.id + '|' + t.id;
      if (this.spec.vmFor !== key) { this.spec.vmFor = key; this.vm.setWeapon(t.weapon.id, t.weapon.def.type, 0.2, this.skinOf(t, t.weapon.id)); }
      showVm = !t.scoped;
      this.guard(() => this.vm.update(dt, t.speed2D(), t.onGround, this.camera.aspect, this.camera.matrixWorld));
    }
    if (p.alive) this.spec.vmFor = null;
    this.guard(() => this.updateCharacterLooks());
    this.guard(() => this.outlines.update());
    // Ultra redraws shadows every frame, and hidden chunks would lose theirs: draw everything there
    if (this.q.shadows !== 'dynamic') this.guard(() => this.level.pvs?.update(this.camera.position));
    const r = this.renderer;
    // inside a smoke: one flat fill over the world, under the hands (and no
    // puffs drawn behind it once it covers everything)
    const fog = this.grenades.smokeAt(this.camera.position);
    this.grenades.hideClouds(fog > 0.97);
    r.clear();
    r.render(this.scene, this.camera);
    if (fog > 0.01) this.drawSmokeFill(fog);
    if (showVm) { r.clearDepth(); r.render(this.vm.scene, this.vm.camera); }
    this.guard(() => this.hud.update(dt));
  }
  makeSmokeFill() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xaaa59e, transparent: true, depthTest: false, depthWrite: false });
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    scene.add(quad);
    this.smokeFill = { scene, cam, mat, quad };
  }
  drawSmokeFill(a) {
    if (!this.smokeFill) this.makeSmokeFill();
    this.smokeFill.mat.opacity = Math.min(1, a) * 0.98;
    this.renderer.render(this.smokeFill.scene, this.smokeFill.cam);
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
      botSkill: this.enemyBotSkill(),
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
    // leaving early: you keep credits for what you did (in ranked it also
    // counts as an abandon: a loss and a queue cooldown)
    this.onExit({ abandoned: true, won: false, team: this.playerTeam, score: { ...this.score }, stats: { ...this.player.stats }, rounds: this.round, botSkill: this.enemyBotSkill(),
      players: this.characters.map(c => ({ name: c.name, team: c.team, ...c.stats, you: c === this.player })), weaponKills: {} });
  }
  // how good the bots on the other side were, for the credit reward (null: no bots)
  enemyBotSkill() {
    const foes = this.bots.filter(b => b.team !== this.playerTeam && !b.puppet && b.prof);
    return foes.length ? foes.reduce((a, b) => a + b.prof.skill, 0) / foes.length : null;
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
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    clearTimeout(this.lostTimer);
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.dispose();
    this.net?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();   // free the GPU context now; the next match gets a new canvas
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

export { WEAPONS, MOVE };
