// Thrown grenades: flight with bounces, then each type's effect (blast,
// flash, smoke cloud, fire patch, decoy noise).
import * as THREE from 'three';
import { buildGun } from '../gunmodels.js';
import { WEAPONS } from '../weapons.js';
import { rng } from '../textures.js';

const GRAV = 18;
export const NADE = {
  he: { fuse: 1.6, radius: 9.5, damage: 98 },
  flash: { fuse: 1.6, range: 44 },
  smoke: { radius: 4.3, height: 2.4, duration: 18, fade: 2.5 },
  fire: { radius: 3.2, duration: 7, tick: 0.25, damage: 8, airFuse: 2.0 },
  decoy: { duration: 14 },
};

function puffTexture(seed) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const px = S / 2 + (r() - 0.5) * S * 0.45, py = S / 2 + (r() - 0.5) * S * 0.45, rad = S * (0.16 + r() * 0.2);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    const v = 200 + r() * 40;
    g.addColorStop(0, `rgba(${v},${v},${v - 6},0.5)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function flameTexture() {
  const W = 64, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(W / 2, H * 0.72, 2, W / 2, H * 0.6, H * 0.55);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,190,60,0.95)'); g.addColorStop(0.6, 'rgba(230,80,10,0.6)'); g.addColorStop(1, 'rgba(120,20,0,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(W / 2, H * 0.62, W * 0.42, H * 0.46, 0, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,230,180,0.8)'); g.addColorStop(1, 'rgba(255,160,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// three puff variants side by side, for the instanced smoke
function puffAtlas() {
  const S = 128, c = document.createElement('canvas'); c.width = S * 3; c.height = S;
  const x = c.getContext('2d');
  [3, 7, 13].forEach((seed, k) => {
    const r = rng(seed);
    for (let i = 0; i < 26; i++) {
      const px = k * S + S / 2 + (r() - 0.5) * S * 0.45, py = S / 2 + (r() - 0.5) * S * 0.45, rad = S * (0.16 + r() * 0.2);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      const v = 200 + r() * 40;
      g.addColorStop(0, `rgba(${v},${v},${v - 6},0.5)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.save(); x.beginPath(); x.rect(k * S, 0, S, S); x.clip(); x.fillStyle = g; x.fillRect(k * S, 0, S, S); x.restore();
    }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const SMOKE_QUAD = new THREE.PlaneGeometry(1, 1);
function smokeMaterial(map) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMap: { value: null }, uCenter: { value: new THREE.Vector3() }, uGrow: { value: 0 }, uOpacity: { value: 0 }, uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xc4c0b8) },
    }]),
    vertexShader: `
      attribute vec3 aOff; attribute float aSize; attribute float aRot; attribute float aTile;
      uniform vec3 uCenter; uniform float uGrow; uniform float uTime;
      varying vec2 vUv; varying float vFade;
      #include <fog_pars_vertex>
      void main() {
        vec3 wp = uCenter + aOff * (0.35 + 0.65 * uGrow);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        float s = aSize * (0.4 + 0.6 * uGrow), a = aRot * uTime + aTile * 2.1;
        vec2 c = position.xy;
        mvPosition.xy += vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a)) * s;
        vFade = smoothstep(0.5, 2.4, -mvPosition.z);
        vUv = vec2((uv.x + aTile) / 3.0, uv.y);
        // a puff faded out next to the camera is moved past the far plane, so
        // its (usually screen-filling) quad costs no pixels at all
        if (vFade < 0.01) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying float vFade;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(uMap, vUv);
        float a = t.a * uOpacity * vFade;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * t.rgb, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  m.uniforms.uMap.value = map;
  return m;
}

export class Grenades {
  constructor(game) {
    this.g = game;
    this.flying = []; this.smokes = []; this.fires = []; this.decoys = []; this.fx = [];
    this.puffTex = [puffTexture(3), puffTexture(7), puffTexture(13)];
    // An invisible cloud while the match loads, so the smoke shader compiles
    // with the rest behind the loading screen instead of stalling the first
    // smoke. Removed on the first update; its material is kept, which keeps
    // the compiled shader cached for real clouds.
    this.warm = this.cloudMesh(new THREE.Vector3(0, -100, 0), 1);
    game.scene.add(this.warm);
    this.flameTex = flameTexture();
    this.glowTex = glowTexture();
    // A fixed set of lights, switched on and off as needed. Adding or removing a
    // light makes three.js recompile every shader, which froze the game.
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.userData = { busy: false, t: -1 };
      game.scene.add(l); this.lights.push(l);
    }
  }

  takeLight() {
    const free = this.lights.filter(l => !l.userData.busy);
    const l = free.find(x => x.intensity === 0) || free.sort((a, b) => a.userData.t - b.userData.t)[0] || this.lights[0];
    l.userData.t = this.g.time;
    return l;
  }

  // power: 1 = full throw, ~0.35 = underhand lob
  throw(ch, type, power = 1) {
    const eye = ch.eyePos(), fwd = ch.forward();
    const pos = eye.clone().addScaledVector(fwd, 0.3); pos.y -= 0.12;
    const vel = fwd.clone().multiplyScalar(6 + 10 * power);
    vel.y += 1.2 + 1.8 * power;
    vel.x += ch.vel.x * 0.6; vel.z += ch.vel.z * 0.6;
    const mesh = buildGun(type);
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.g.scene.add(mesh);
    const n = { type, owner: ch, team: ch.team, pos, vel, t: 0, mesh, rest: 0, bounces: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) };
    this.flying.push(n);
    this.g.audio.ui();
    this.g.net?.event(['nadethrow', type, +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2), +vel.x.toFixed(2), +vel.y.toFixed(2), +vel.z.toFixed(2)]);
    return n;
  }

  // Online clients: a projectile that only flies and bounces; the host sends the effect.
  throwVisual(type, pos, vel) {
    const mesh = buildGun(type);
    this.g.scene.add(mesh);
    this.flying.push({ type, owner: null, team: null, pos: pos.clone(), vel: vel.clone(), t: 0, mesh, rest: 0, bounces: 0, visual: true,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
  }

  update(dt) {
    const g = this.g, world = g.level.world, now = g.time;
    if (this.warm) { g.scene.remove(this.warm); this.keepWarm = this.warm.material; this.warm = null; }
    for (const n of [...this.flying]) {
      n.t += dt;
      if (n.rest < 1) {
        n.vel.y -= GRAV * dt;
        const step = n.vel.length() * dt;
        if (step > 1e-6) {
          const dir = n.vel.clone().divideScalar(n.vel.length());
          const hit = world.raycast(n.pos, dir, step + 0.05);
          if (hit && hit.dist <= step + 0.05) {
            n.pos.copy(hit.point).addScaledVector(hit.normal, 0.05);
            const vn = hit.normal.clone().multiplyScalar(n.vel.dot(hit.normal));
            const impact = vn.length();
            n.vel.sub(vn).multiplyScalar(0.7).addScaledVector(vn, -0.4);
            n.bounces++;
            if (impact > 2) g.audio.impact(n.pos);
            if ((n.type === 'molotov' || n.type === 'incendiary') && hit.normal.y > 0.7 && !n.visual) { this.detonate(n); continue; }
            if (hit.normal.y > 0.7 && n.vel.length() < 0.8) { n.rest = 1; n.vel.set(0, 0, 0); }
          } else n.pos.addScaledVector(n.vel, dt);
        }
        n.mesh.rotation.x += n.spin.x * dt; n.mesh.rotation.z += n.spin.z * dt;
      } else n.rest += dt;
      n.mesh.position.copy(n.pos);
      if (n.visual) { if (n.t > 4) { this.flying.splice(this.flying.indexOf(n), 1); g.scene.remove(n.mesh); } continue; }
      const d = n.type;
      if ((d === 'he' || d === 'flash') && n.t >= NADE.he.fuse) this.detonate(n);
      else if (d === 'smoke' && (n.rest > 1.4 || n.t > 4)) this.detonate(n);
      else if (d === 'decoy' && (n.rest > 1.6 || n.t > 4)) this.detonate(n);
      else if ((d === 'molotov' || d === 'incendiary') && n.t > NADE.fire.airFuse) this.detonate(n);
    }
    this.updateSmokes(dt);
    this.updateFires(dt, now);
    for (const dc of [...this.decoys]) {
      if (now > dc.until) { this.decoys.splice(this.decoys.indexOf(dc), 1); g.scene.remove(dc.mesh); continue; }
      if (now >= dc.next) {
        dc.next = now + (dc.burst-- > 0 ? 0.11 : 0.6 + Math.random() * 1.6);
        if (dc.burst < -1) dc.burst = Math.floor(Math.random() * 4);
        g.audio.shot(dc.sound, dc.pos);
        g.noise(dc.pos, 40, dc.owner);
      }
    }
    for (const f of [...this.fx]) {
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      if (f.sprite) { f.sprite.material.opacity = k * (f.alpha ?? 1); f.sprite.scale.setScalar(f.size * (1 + (1 - k) * (f.grow ?? 1))); f.sprite.position.y += (f.rise || 0) * dt; }
      if (f.light) f.light.intensity = f.power * k * k;
      if (f.life <= 0) { this.fx.splice(this.fx.indexOf(f), 1); if (f.sprite) { g.scene.remove(f.sprite); f.sprite.material.dispose(); } if (f.light) f.light.intensity = 0; }
    }
  }

  detonate(n) {
    const i = this.flying.indexOf(n);
    if (i >= 0) this.flying.splice(i, 1);
    if (n.type !== 'decoy') this.g.scene.remove(n.mesh);
    ({ he: this.blast, flash: this.flash, smoke: this.smoke, molotov: this.fire, incendiary: this.fire, decoy: this.decoy })[n.type].call(this, n);
    this.g.net?.event(['nadefx', n.type, +n.pos.x.toFixed(2), +n.pos.y.toFixed(2), +n.pos.z.toFixed(2)]);
  }

  sprite(map, pos, size, life, opts = {}) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, color: opts.color ?? 0xffffff }));
    s.position.copy(pos); s.scale.setScalar(size);
    this.g.scene.add(s);
    this.fx.push({ sprite: s, life, max: life, size, grow: opts.grow, rise: opts.rise, alpha: opts.alpha });
    return s;
  }
  flashLight(pos, color, power, life, dist = 18) {
    const l = this.takeLight();
    l.color.set(color); l.distance = dist; l.intensity = power;
    l.position.copy(pos);
    this.fx.push({ light: l, life, max: life, power });
  }

  // ---------------------------------------------------------------- effects
  blast(n, visualOnly = false) {
    const g = this.g, p = n.pos;
    this.sprite(this.glowTex, p, 3.4, 0.25, { additive: true, grow: 0.6 });
    this.flashLight(p, 0xffa040, 60, 0.35, 22);
    for (let i = 0; i < 9; i++) {
      const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 1.4, (Math.random() - 0.5) * 2.2));
      this.sprite(this.puffTex[i % 3], q, 1.6 + Math.random() * 1.4, 1.6 + Math.random(), { color: 0x6a6258, grow: 0.8, rise: 0.5, alpha: 0.85 });
    }
    g.audio.explosion?.(p, 0.8);
    const down = g.level.world.raycast(p.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3(0, -1, 0), 2.5);
    if (down) g.decals.scorch(down.point, down.normal, 2.2);
    if (visualOnly) return;
    g.noise(p, 40, n.owner);
    const R = NADE.he.radius;
    for (const ch of g.characters) {
      if (!ch.alive) continue;
      if (ch.team === n.team && ch !== n.owner) continue;   // no team damage
      const c = ch.pos.clone(); c.y += ch.height * 0.6;
      const d = c.distanceTo(p);
      if (d > R || !g.level.world.lineOfSight(p.clone().add(new THREE.Vector3(0, 0.25, 0)), c)) continue;
      let dmg = NADE.he.damage * Math.pow(1 - d / R, 1.25);
      let armor = 0;
      if (ch.armor > 0) { armor = Math.min(ch.armor, dmg * 0.5); dmg *= 0.58; }
      if (dmg >= 1) g.applyDamage(ch, n.owner, { health: Math.round(dmg), armor: Math.round(armor) }, 'chest', WEAPONS.he, c.clone().sub(p).normalize());
    }
  }

  flash(n, visualOnly = false) {
    const g = this.g, p = n.pos;
    this.sprite(this.glowTex, p, 5, 0.18, { additive: true, grow: 1.5 });
    this.flashLight(p, 0xffffff, 120, 0.2, 30);
    g.audio.flashbang?.(p);
    if (visualOnly) { this.blindLocal(p); return; }
    for (const ch of g.characters) {
      if (!ch.alive) continue;
      const s = this.blindAmount(ch, p);
      if (s <= 0) continue;
      const dur = 0.3 + 4.7 * s;
      if (ch.blindUntil < g.time + dur) { ch.blindUntil = g.time + dur; ch.blindPeak = s; }
      if (ch === g.player) g.hud.flash(s, dur);
    }
  }
  // 0..1: how badly a flash at p blinds this character (line of sight, distance, facing)
  blindAmount(ch, p) {
    const eye = ch.eyePos(), to = p.clone().sub(eye), d = to.length();
    if (d > NADE.flash.range || !this.g.level.world.lineOfSight(eye, p) || this.blocksSight(eye, p)) return 0;
    const facing = ch.forward().dot(to.divideScalar(d));
    const f = facing > 0.55 ? 1 : facing > -0.1 ? 0.55 : 0.2;
    return Math.min(1, f * Math.pow(1 - d / NADE.flash.range, 0.55) * 1.1);
  }
  // online clients work out their own blindness from the host's flash event
  blindLocal(p) {
    const g = this.g, ch = g.player;
    if (!ch.alive) return;
    const s = this.blindAmount(ch, p);
    if (s > 0) { const dur = 0.3 + 4.7 * s; ch.blindUntil = g.time + dur; ch.blindPeak = s; g.hud.flash(s, dur); }
  }

  // A smoke cloud is one draw call: an instanced quad drawn as camera-facing
  // puffs (fewer on lower settings). Puffs right in front of the camera fade
  // out, and smokeAt() drives one flat fill instead: standing inside the
  // cloud used to mean 70 full-screen see-through layers every frame.
  smoke(n) {
    const g = this.g;
    const c = n.pos.clone(); c.y = Math.max(c.y, 0) + NADE.smoke.height * 0.5;
    const r = NADE.smoke.radius;
    const mesh = this.cloudMesh(c, { low: 14, medium: 20, high: 26, ultra: 32 }[g.q?.key] || 24);
    g.scene.add(mesh);
    this.smokes.push({ center: c, t: 0, r, mesh, opacity: 0 });
    g.audio.smoke?.(c);
    // smoke puts out fires it covers
    for (const f of [...this.fires]) if (f.center.distanceTo(new THREE.Vector3(c.x, f.center.y, c.z)) < r + f.r * 0.5) this.endFire(f);
  }
  // count camera-facing puffs around c, drawn in one call
  cloudMesh(c, count) {
    const r = NADE.smoke.radius;
    const big = Math.sqrt(26 / count);   // fewer puffs, each a little bigger
    // its own copy of the quad, so freeing one cloud never frees another's buffers
    const geo = new THREE.InstancedBufferGeometry().copy(SMOKE_QUAD);
    const off = new Float32Array(count * 3), size = new Float32Array(count), rot = new Float32Array(count), tile = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r * 0.85;
      off[i * 3] = Math.cos(a) * rr; off[i * 3 + 1] = (Math.random() - 0.35) * NADE.smoke.height; off[i * 3 + 2] = Math.sin(a) * rr;
      size[i] = (2.6 + Math.random() * 1.8) * big; rot[i] = (Math.random() - 0.5) * 0.3; tile[i] = i % 3;
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tile, 1));
    geo.instanceCount = count;
    const mat = smokeMaterial(this.puffAtlas ||= puffAtlas());
    mat.uniforms.uCenter.value = c;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }
  updateSmokes(dt) {
    const { duration, fade } = NADE.smoke;
    for (const s of [...this.smokes]) {
      s.t += dt;
      const grow = Math.min(1, s.t / 1.3), out = s.t > duration ? Math.max(0, 1 - (s.t - duration) / fade) : 1;
      s.opacity = grow * out;
      const u = s.mesh.material.uniforms;
      u.uGrow.value = grow; u.uOpacity.value = 0.92 * s.opacity; u.uTime.value = s.t;
      if (s.t > duration + fade) this.removeSmoke(s);
    }
  }
  // deep inside a cloud the flat fill covers the whole view: skip drawing puffs then
  hideClouds(hide) { for (const s of this.smokes) s.mesh.visible = !hide; }
  removeSmoke(s) {
    this.g.scene.remove(s.mesh);
    s.mesh.geometry.dispose(); s.mesh.material.dispose();
    const i = this.smokes.indexOf(s); if (i >= 0) this.smokes.splice(i, 1);
  }
  // How deep a point (the camera) is inside smoke: 0 outside, 1 fully covered.
  smokeAt(p) {
    let best = 0;
    for (const s of this.smokes) {
      const dx = p.x - s.center.x, dz = p.z - s.center.z, dy = (p.y - s.center.y) * (s.r / (NADE.smoke.height * 0.8));
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / s.r;
      best = Math.max(best, Math.min(1, Math.max(0, (1.02 - d) / 0.42)) * s.opacity);
    }
    return best;
  }
  // true if the segment a→b passes through a (mostly formed) smoke cloud
  blocksSight(a, b) {
    if (!this.smokes.length) return false;
    const ab = b.clone().sub(a), L = ab.length(); if (L < 1e-4) return false;
    ab.divideScalar(L);
    for (const s of this.smokes) {
      if (s.opacity < 0.45) continue;
      const t = Math.max(0, Math.min(L, s.center.clone().sub(a).dot(ab)));
      const closest = a.clone().addScaledVector(ab, t);
      const dx = closest.x - s.center.x, dz = closest.z - s.center.z, dy = (closest.y - s.center.y) * (s.r / (NADE.smoke.height * 0.8));
      if (dx * dx + dy * dy + dz * dz < (s.r * 0.88) ** 2) return true;
    }
    return false;
  }
  inSmoke(p) { return this.smokes.some(s => s.opacity > 0.3 && Math.hypot(p.x - s.center.x, p.z - s.center.z) < s.r); }

  fire(n, visualOnly = false) {
    const g = this.g;
    let ground = n.pos.clone();
    if (n.pos.y > 0.3) {
      const down = g.level.world.raycast(n.pos, new THREE.Vector3(0, -1, 0), 5);
      if (!down) { this.blastSmall(n.pos); return; }
      ground = down.point;
    }
    if (this.inSmoke(ground)) { this.blastSmall(ground); return; }
    g.audio.fire?.(ground);
    const f = { center: ground, r: NADE.fire.radius, t: 0, tick: 0, owner: n.owner, team: n.team, flames: [], visualOnly };
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * f.r;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.userData = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, h: 0.6 + Math.random() * 0.9, ph: Math.random() * 10 };
      g.scene.add(s); f.flames.push(s);
    }
    f.light = this.takeLight(); f.light.userData.busy = true;
    f.light.color.set(0xff7a20); f.light.distance = 9; f.light.intensity = 8;
    f.light.position.copy(ground).add(new THREE.Vector3(0, 0.8, 0));
    g.decals.scorch(ground, new THREE.Vector3(0, 1, 0), f.r * 2.1);
    this.fires.push(f);
  }
  blastSmall(p) { this.sprite(this.glowTex, p, 1.6, 0.25, { additive: true }); }
  updateFires(dt, now) {
    const g = this.g;
    for (const f of [...this.fires]) {
      f.t += dt;
      const k = f.t < 0.4 ? f.t / 0.4 : f.t > NADE.fire.duration - 0.8 ? Math.max(0, (NADE.fire.duration - f.t) / 0.8) : 1;
      for (const s of f.flames) {
        const u = s.userData, flick = 0.75 + Math.sin(now * 13 + u.ph) * 0.15 + Math.sin(now * 7.3 + u.ph * 2) * 0.1;
        s.position.set(f.center.x + u.x, f.center.y + u.h * 0.5 * flick * k, f.center.z + u.z);
        s.scale.set(0.7 * k, u.h * flick * k, 1);
      }
      f.light.intensity = 8 * k * (0.85 + Math.sin(now * 17) * 0.15);
      if (!f.visualOnly) {
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = NADE.fire.tick;
          for (const ch of g.characters) {
            if (!ch.alive || (ch.team === f.team && ch !== f.owner)) continue;
            if (Math.hypot(ch.pos.x - f.center.x, ch.pos.z - f.center.z) < f.r && Math.abs(ch.pos.y - f.center.y) < 1.2) {
              g.applyDamage(ch, f.owner, { health: NADE.fire.damage, armor: 0 }, 'legs', WEAPONS[f.owner?.team === 'CT' ? 'incendiary' : 'molotov'], null);
            }
          }
        }
      }
      if (f.t >= NADE.fire.duration) this.endFire(f);
    }
  }
  endFire(f) {
    for (const s of f.flames) { this.g.scene.remove(s); s.material.dispose(); }
    f.light.intensity = 0; f.light.userData.busy = false;
    const i = this.fires.indexOf(f); if (i >= 0) this.fires.splice(i, 1);
  }
  // bots keep out of burning ground
  burning(p) { return this.fires.some(f => Math.hypot(p.x - f.center.x, p.z - f.center.z) < f.r + 0.3); }

  decoy(n) {
    const w = n.owner?.weapons?.[1] || n.owner?.weapons?.[2];
    this.decoys.push({ pos: n.pos.clone(), mesh: n.mesh, until: this.g.time + NADE.decoy.duration, next: this.g.time + 0.5, burst: 3, owner: n.owner, sound: w?.def?.sound ? w.def : WEAPONS.glock });
  }

  // Effects replayed from the host's event on online clients.
  replay(type, p) {
    // the visual projectile has landed: swap it for the effect
    let best = null, bd = 6;
    for (const f of this.flying) if (f.visual && f.type === type && f.pos.distanceTo(p) < bd) { bd = f.pos.distanceTo(p); best = f; }
    if (best) { this.flying.splice(this.flying.indexOf(best), 1); this.g.scene.remove(best.mesh); }
    const n = { type, pos: p, team: null, owner: null };
    if (type === 'he') this.blast(n, true);
    else if (type === 'flash') this.flash(n, true);
    else if (type === 'smoke') this.smoke(n);
    else if (type === 'molotov' || type === 'incendiary') this.fire(n, true);
  }

  clear() {
    const sc = this.g.scene;
    for (const n of this.flying) sc.remove(n.mesh);
    for (const s of [...this.smokes]) this.removeSmoke(s);
    for (const f of [...this.fires]) this.endFire(f);
    for (const d of this.decoys) sc.remove(d.mesh);
    for (const f of this.fx) { if (f.sprite) sc.remove(f.sprite); }
    for (const l of this.lights) { l.intensity = 0; l.userData.busy = false; }
    this.flying = []; this.smokes = []; this.fires = []; this.decoys = []; this.fx = [];
  }
}
