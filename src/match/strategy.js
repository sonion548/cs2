// Team tactics for bots on maps that name their key spots (map.points).
//
// Attackers play a round in phases, the way human teams do:
//   default  spread over map-control spots and hold them, gathering information
//   gather   pick a site (avoiding the one defenders were seen stacking) and group
//            up at that site's staging area, out of sight; one player may split
//            through mid to hit the second entrance at the same time
//   execute  everyone goes in together, the carrier heads for a plant spot
//   post     after the plant, spread out to watch the ways defenders can come
//            back in, from spots that keep the bomb in sight where possible
// Defenders hold set positions per site (crossfires), keep one player on mid,
// and rotate when they get solid information that a site is being hit.
import * as THREE from 'three';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const OTHER = { A: 'B', B: 'A' };

export class Strategy {
  constructor(game) {
    this.g = game;
    this.pts = game.map.points || null;
    this.phase = 'none';
  }

  get enabled() { return !!this.pts; }

  bots(team) { return this.g.bots.filter(b => b.team === team && b.alive && !b.puppet && !b.human); }

  // A world position for a named spot [x, z, lookX, lookZ] (cells), jittered a little.
  spot(s, jitter = 1.4) {
    const p = this.g.level.nav.center(s[0], s[1]);
    p.x += (Math.random() - 0.5) * jitter; p.z += (Math.random() - 0.5) * jitter;
    return p;
  }

  send(b, s, role, jitter) {
    b.setGoal(this.spot(s, jitter), role);
    b.holdLook = s.length >= 4 ? Math.atan2(-(s[2] - s[0]), -(s[3] - s[1])) : null;
    b.holdUntil = 0;
  }

  // ---------------------------------------------------------------- round start
  plan() {
    const P = this.pts;
    this.phase = 'default';
    this.sites = Object.keys(P.plant);                 // 'A' and 'B', or just 'A' on small maps
    this.site = this.sites[Math.floor(Math.random() * this.sites.length)];
    this.execAt = 14 + Math.random() * 22;   // seconds into the live round
    this.goAt = 0;
    this.seen = { A: 0, B: 0 };               // defenders spotted per site (decays)
    this.hit = null;                          // site the defenders think is being hit
    this.rotated = false;

    // attackers: spread over the default spots; the carrier takes one near the middle
    const ts = this.bots('T');
    const defaults = shuffle([...P.tDefault]);
    const carrier = ts.find(b => b.hasBomb);
    let i = 0;
    for (const b of ts) {
      const s = b === carrier ? P.tDefault[3] || defaults[0] : defaults[i++ % defaults.length];
      this.send(b, s, 'default');
    }

    // defenders: two per site, one mid, then fill the sites
    const cts = this.bots('CT');
    const one = this.sites.length === 1;
    const order = one ? (cts.length <= 1 ? ['A'] : ['A', 'mid', 'A', 'A', 'mid']) :
      cts.length <= 2 ? ['A', 'B'] : cts.length === 3 ? ['A', 'B', 'mid'] : ['A', 'B', 'mid', 'A', 'B', 'A', 'B'];
    const used = { A: shuffle([...(P.hold.A || [])]), B: shuffle([...(P.hold.B || [])]), mid: shuffle([...(P.hold.mid || [])]) };
    cts.forEach((b, k) => {
      const zone = order[k % order.length];
      const s = used[zone].shift() || (P.hold[zone] || P.hold.A)[0];
      b.zone = zone;
      this.send(b, s, 'hold', 0.8);
    });
  }

  // ---------------------------------------------------------------- information
  // A bot saw or heard an enemy at pos.
  report(bot, pos, strong = false) {
    if (!this.enabled || this.g.state !== 'live') return;
    const site = this.nearSite(pos);
    if (bot.team === 'T') {
      if (site) this.seen[site] = this.g.time;
      // contact in the default phase: start the take a little early
      if (this.phase === 'default' && this.g.roundTime > 8) this.execAt = Math.min(this.execAt, this.g.roundTime + 3);
    } else if (site && !this.rotated) {
      // defenders: a sighting right on a site (or the bomb) means it's the hit
      const now = this.g.time;
      this.hitInfo ||= { A: [], B: [] };
      this.hitInfo[site].push(now);
      this.hitInfo[site] = this.hitInfo[site].filter(t => now - t < 6);
      if (strong || this.hitInfo[site].length >= 3) this.rotate(site);
    }
  }

  nearSite(pos) {
    let best = null, bd = 26;
    for (const L of ['A', 'B']) {
      const c = this.g.level.sites[L].center;
      if (!c) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }

  // Defenders from the other site and mid come to help, one anchor stays.
  rotate(site) {
    this.rotated = true; this.hit = site;
    if (this.sites.length < 2) return;
    const P = this.pts;
    const away = this.bots('CT').filter(b => b.zone !== site && b.role === 'hold');
    const stay = away.filter(b => b.zone === OTHER[site]).slice(0, 1);
    const spots = shuffle([...P.hold[site]]);
    for (const b of away) {
      if (stay.includes(b) || b.target) continue;
      b.zone = site;
      this.send(b, spots.shift() || P.hold[site][0], 'hold', 1.6);
    }
  }

  // ---------------------------------------------------------------- per tick
  update() {
    const g = this.g;
    if (!this.enabled || g.state !== 'live') return;
    const t = g.roundTime;
    if (g.bomb.state === 'planted') {
      if (this.phase !== 'post') { this.phase = 'post'; this.postPlant(); }
      // someone is on the bomb: anyone who can't see it goes to stop the defuse
      if (g.bomb.defuse) {
        for (const b of this.bots('T')) {
          if (b.target || b.role === 'deny' || this.seesBomb(b.eyePos(new THREE.Vector3()))) continue;
          b.setGoal(g.bomb.pos.clone(), 'deny'); b.holdLook = null;
        }
      }
      return;
    }
    if (this.phase === 'default' && t >= this.execAt) this.gather();
    else if (this.phase === 'gather') {
      const ts = this.bots('T').filter(b => b.role === 'gather');
      const stage = this.g.level.nav.center(...this.pts.stage[this.site][0]);
      const ready = ts.filter(b => Math.hypot(b.pos.x - stage.x, b.pos.z - stage.z) < 9).length;
      const need = Math.max(1, Math.min(3, ts.length - 1));
      // go when the group is together, after a short wait, or when time is running out
      if (ready >= need || t >= this.goAt || t > 70) this.execute();
    }
  }

  gather() {
    const P = this.pts;
    // avoid the site defenders were seen holding recently
    const now = this.g.time;
    const hotA = now - this.seen.A < 15, hotB = now - this.seen.B < 15;
    if (this.sites.length > 1) {
      if (hotA && !hotB) this.site = 'B'; else if (hotB && !hotA) this.site = 'A';
      else if (Math.random() < 0.35) this.site = OTHER[this.site];
    }
    this.phase = 'gather';
    this.goAt = this.g.roundTime + 14;
    const ts = this.bots('T');
    // with four or more attackers one of them (not the carrier) splits through mid
    const splitter = ts.length >= 4 ? ts.find(b => !b.hasBomb) : null;
    const stages = shuffle([...P.stage[this.site]]);
    for (const b of ts) {
      if (b === splitter) { this.send(b, P.split[this.site][0], 'split'); continue; }
      this.send(b, stages[ts.indexOf(b) % stages.length], 'gather', 2.4);
    }
  }

  execute() {
    const P = this.pts, g = this.g;
    this.phase = 'execute';
    const cells = g.level.sites[this.site].filter(v => g.level.nav.walkable(...g.level.nav.cellOf(v)));
    for (const b of this.bots('T')) {
      if (b.hasBomb) {
        const s = P.plant[this.site][Math.floor(Math.random() * P.plant[this.site].length)];
        b.setGoal(this.spot(s, 0.6), 'attack');
      } else {
        const p = cells[Math.floor(Math.random() * cells.length)].clone();
        b.setGoal(p, 'attack');
      }
      b.holdLook = null;
    }
  }

  // ---------------------------------------------------------------- post-plant
  // Ways into a site: walkable cells just outside it, grouped into openings and
  // ordered by how soon defenders coming from their spawn reach them.
  entries(L) {
    this._entries ||= {};
    if (this._entries[L]) return this._entries[L];
    const g = this.g, nav = g.level.nav;
    const key = (x, z) => z * nav.W + x;
    const inSite = new Set(g.level.sites[L].map(v => key(...nav.cellOf(v))));
    this._cells ||= {}; this._cells[L] = inSite;
    const out = new Map();
    for (const k of inSite) {
      const x = k % nav.W, z = Math.floor(k / nav.W);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, nk = key(nx, nz);
        if (inSite.has(nk) || !nav.walkable(nx, nz) || !nav.passable(nx, nz, x, z)) continue;
        out.set(nk, [nx, nz]);
      }
    }
    // flood-fill touching cells into openings
    const groups = [], done = new Set();
    for (const [k, c] of out) {
      if (done.has(k)) continue;
      const cells = [], stack = [c]; done.add(k);
      while (stack.length) {
        const [x, z] = stack.pop(); cells.push([x, z]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = key(x + dx, z + dz);
          if (out.has(nk) && !done.has(nk)) { done.add(nk); stack.push(out.get(nk)); }
        }
      }
      const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length, cz = cells.reduce((a, c) => a + c[1], 0) / cells.length;
      const mid = cells.reduce((a, c) => (Math.hypot(c[0] - cx, c[1] - cz) < Math.hypot(a[0] - cx, a[1] - cz) ? c : a));
      groups.push({ cells, cell: mid, pos: nav.center(...mid) });
    }
    // walking distance from the defenders' spawn (breadth-first over the grid)
    const ct = g.level.spawns?.CT?.[0];
    const dist = new Map();
    if (ct) {
      const s0 = nav.cellOf(ct), q = [s0]; dist.set(key(...s0), 0);
      for (let i = 0; i < q.length; i++) {
        const [x, z] = q[i], d = dist.get(key(x, z));
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, nk = key(nx, nz);
          if (dist.has(nk) || !nav.walkable(nx, nz) || !nav.passable(x, z, nx, nz)) continue;
          dist.set(nk, d + 1); q.push([nx, nz]);
        }
      }
    }
    for (const e of groups) e.ct = dist.get(key(...e.cell)) ?? 1e9;
    groups.sort((a, b) => a.ct - b.ct);
    return (this._entries[L] = groups);
  }

  seesBomb(eye) {
    const b = this.g.bomb.pos;
    return this.g.level.world.lineOfSight(eye, new THREE.Vector3(b.x, b.y + 0.3, b.z));
  }

  // A spot on the site that watches entry e from cover, ideally
  // with the bomb in view too, and away from spots already taken.
  watchSpot(L, e, taken) {
    const g = this.g, nav = g.level.nav, world = g.level.world;
    const bomb = g.bomb.pos, eEye = e.pos.clone(); eEye.y += 1.4;
    let best = null, bestScore = -1e9;
    const [bx, bz] = nav.cellOf(bomb), R = 5;
    const inSite = this._cells[L];
    for (let z = bz - R; z <= bz + R; z++) for (let x = bx - R; x <= bx + R; x++) {
      if (!nav.walkable(x, z) || !inSite.has(z * nav.W + x)) continue;
      const p = nav.center(x, z), eye = p.clone(); eye.y += 1.6;
      const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
      if (d < 6 || d > 22 || !world.lineOfSight(eye, eEye)) continue;
      let score = -Math.abs(d - 12) * 0.6;
      if (this.seesBomb(eye)) score += 6;
      // cover: something solid next to the spot
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!nav.walkable(x + dx, z + dz)) score += 1.2;
      for (const t of taken) { const td = Math.hypot(p.x - t.x, p.z - t.z); if (td < 6) score -= (6 - td) * 2; }
      score += Math.random() * 1.5;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  postPlant() {
    const g = this.g, L = g.bomb.site || this.nearSite(g.bomb.pos);
    if (!L) return;
    this.site = L;
    const entries = this.entries(L);
    if (!entries.length) return;
    const taken = [];
    // nearest guards first, so the closest players take the most urgent angles
    const ts = this.bots('T').sort((a, b) => a.pos.distanceTo(g.bomb.pos) - b.pos.distanceTo(g.bomb.pos));
    ts.forEach((b, i) => {
      const e = entries[i % entries.length];
      const p = this.watchSpot(L, e, taken);
      if (!p) return;
      taken.push(p);
      b.setGoal(p, 'guard');
      b.holdLook = Math.atan2(-(e.pos.x - p.x), -(e.pos.z - p.z));
      b.holdUntil = 0;
    });
  }

  // Where the bomb carrier should be heading right now (null = follow its role).
  carrierGoalSite() {
    if (!this.enabled) return null;
    return this.phase === 'execute' || this.phase === 'post' ? this.site : null;
  }
}
