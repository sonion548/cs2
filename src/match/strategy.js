// Team tactics for bots, on maps that name their key spots (map.points).
//
// The map is read once: the ways into each bombsite, the lanes the attackers
// walk to them, places to stage out of sight, defender angles with cover,
// map-control, lurk and early-aggression spots along the lanes. Positions come
// from dozens of spots, picked fresh every round, not a handful of fixed ones.
//
// Attackers run a play from a playbook each round (rush, execute, split, fake,
// slow default, contact walk, a lone lurk), weighted by how many are alive and
// steered away from what they ran the last rounds. Groups stage out of sight,
// throw utility and go together; a split's two groups leave at times that put
// them on the site together. They go early with a man advantage, regroup when
// they lose players, switch sites when they run into a stack, and always hit
// before time runs out. After the plant they spread over angles chosen by how
// many are left: one hides off-site with the bomb in view, two hold a
// crossfire, more cover every way in and one plays the defenders' rotate path.
//
// Defenders pick a setup (standard, stacks, an early aggressive info play),
// hold angles that change round to round and shift to another angle when
// nothing happens. They rotate on information (attackers seen or heard, a
// teammate killed, the bomb spotted), fall back together when heavily
// outnumbered, hunt the last attackers when well ahead, retake a planted site
// as a group from their side (or save when it can't be defused in time).
//
// Everyone reacts: a teammate's death sends the nearest free player to check
// the spot and tells the others where the shot came from; a dropped bomb is
// fetched by the nearest attacker with another covering him.
import * as THREE from 'three';
import { findPath } from '../level.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const OTHER = { A: 'B', B: 'A' };
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
function weighted(list) {
  const tot = list.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = Math.random() * tot;
  for (const [v, w] of list) if ((r -= Math.max(0, w)) <= 0) return v;
  return list[0][0];
}

// Defender setups by how many there are (site letters; 'mid' holds the middle).
const SETUPS = {
  1: [[['A'], 1], [['B'], 1]],
  2: [[['A', 'B'], 0.7], [['A', 'A'], 0.15], [['B', 'B'], 0.15]],
  3: [[['A', 'B', 'mid'], 0.45], [['A', 'A', 'B'], 0.275], [['A', 'B', 'B'], 0.275]],
  4: [[['A', 'A', 'B', 'mid'], 0.3], [['A', 'B', 'B', 'mid'], 0.3], [['A', 'A', 'B', 'B'], 0.25], [['A', 'A', 'A', 'B'], 0.075], [['A', 'B', 'B', 'B'], 0.075]],
  5: [[['A', 'A', 'B', 'B', 'mid'], 0.45], [['A', 'A', 'B', 'mid', 'mid'], 0.15], [['A', 'A', 'A', 'B', 'mid'], 0.2], [['A', 'B', 'B', 'B', 'mid'], 0.2]],
};

export class Strategy {
  constructor(game) {
    this.g = game;
    this.pts = game.map.points || null;
    this.phase = 'none';
    this.memory = { tactics: [], sites: [], hits: [], ctStrong: null };   // across rounds
    this.nextThink = 0;
  }

  get enabled() { return !!this.pts; }
  bots(team) { return this.g.bots.filter(b => b.team === team && b.alive && !b.puppet && !b.human); }
  alive(team) { return this.g.characters.filter(c => c.team === team && c.alive).length; }
  cellPos(c, jitter = 1.2) {
    const p = this.g.level.nav.center(c[0], c[1]);
    p.x += (Math.random() - 0.5) * jitter; p.z += (Math.random() - 0.5) * jitter;
    return p;
  }
  // Send a bot somewhere with a role; look: the yaw to hold there (or null).
  go(b, p, role, look = null, quiet = false) {
    b.setGoal(p, role);
    b.holdLook = look; b.holdUntil = 0; b.quiet = quiet;
  }

  // ================================================================ the map
  get A() {
    if (this._A === undefined) {
      try { this._A = this.analyze(); } catch (e) { console.warn('bot tactics: map analysis failed', e); this._A = null; this.pts = null; }
    }
    return this._A;
  }

  analyze() {
    const g = this.g, lv = g.level, nav = lv.nav, world = lv.world, P = this.pts;
    const W = nav.W, H = nav.H, key = (x, z) => z * W + x;
    const walk = (x, z) => x >= 0 && z >= 0 && x < W && z < H && nav.walkable(x, z);
    const sites = ['A', 'B'].filter(L => lv.sites[L]?.length);
    const siteCells = {};
    for (const L of sites) siteCells[L] = new Set(lv.sites[L].map(v => key(...nav.cellOf(v))));
    // walking distance (cells) from a point, optionally not through some cells
    const bfs = (from, blocked = null) => {
      const d = new Int32Array(W * H).fill(-1);
      const [sx, sz] = nav.cellOf(from);
      if (!walk(sx, sz)) return d;
      const q = [key(sx, sz)]; d[q[0]] = 0;
      for (let i = 0; i < q.length; i++) {
        const k = q[i], x = k % W, z = (k / W) | 0;
        for (const [dx, dz] of N4) {
          const nx = x + dx, nz = z + dz, nk = key(nx, nz);
          if (!walk(nx, nz) || d[nk] >= 0 || blocked?.has(nk) || !nav.passable(x, z, nx, nz)) continue;
          d[nk] = d[k] + 1; q.push(nk);
        }
      }
      return d;
    };
    const tSpawn = lv.spawns.T[0], ctSpawn = lv.spawns.CT[0];
    const dT = bfs(tSpawn), dCT = bfs(ctSpawn);
    const eye = (x, z, h = 1.6) => { const p = nav.center(x, z); p.y += h; return p; };
    const los = (a, b) => world.lineOfSight(a, b);
    const cover = (x, z) => { let c = 0; for (const [dx, dz] of N8) if (!walk(x + dx, z + dz)) c++; return c; };
    const A = { sites, siteCells, dT, dCT, key, walk, eye, los, cover, entries: {}, holds: {}, aggr: {}, lurk: {}, defaults: [], ctRally: null };

    for (const L of sites) {
      const inSite = siteCells[L];
      const dTo = bfs(tSpawn, inSite), dCTo = bfs(ctSpawn, inSite);
      // ways in: walkable cells just outside the site, reachable from a spawn
      // without crossing the site (an alcove off the site isn't a way in)
      const out = new Map();
      for (const k of inSite) {
        const x = k % W, z = (k / W) | 0;
        for (const [dx, dz] of N4) {
          const nx = x + dx, nz = z + dz, nk = key(nx, nz);
          if (inSite.has(nk) || !walk(nx, nz) || !nav.passable(nx, nz, x, z)) continue;
          if (dTo[nk] < 0 && dCTo[nk] < 0) continue;
          out.set(nk, [nx, nz]);
        }
      }
      const groups = [], done = new Set();
      for (const [k, c] of out) {
        if (done.has(k)) continue;
        const cells = [], stack = [c]; done.add(k);
        while (stack.length) {
          const [x, z] = stack.pop(); cells.push([x, z]);
          for (const [dx, dz] of N4) { const nk = key(x + dx, z + dz); if (out.has(nk) && !done.has(nk)) { done.add(nk); stack.push(out.get(nk)); } }
        }
        const cx = cells.reduce((a, q) => a + q[0], 0) / cells.length, cz = cells.reduce((a, q) => a + q[1], 0) / cells.length;
        const mid = cells.reduce((a, q) => (Math.hypot(q[0] - cx, q[1] - cz) < Math.hypot(a[0] - cx, a[1] - cz) ? q : a));
        groups.push({ cells, cell: mid, pos: nav.center(...mid), t: dTo[key(...mid)], ct: dCTo[key(...mid)] });
      }
      if (!groups.length) { A.entries[L] = []; A.holds[L] = []; continue; }
      const minT = Math.min(...groups.map(e => (e.t >= 0 ? e.t : 1e9))), minCT = Math.min(...groups.map(e => (e.ct >= 0 ? e.ct : 1e9)));
      for (const e of groups) e.tSide = e.t >= 0 && (e.ct < 0 || e.t - minT <= e.ct - minCT);
      // a lane: the cells from a spawn to the way in, downhill on the distance field
      const laneOf = (e, d) => {
        let [x, z] = e.cell, dd = d[key(x, z)];
        if (dd < 0) return [];
        const lane = [[x, z]];
        while (dd > 0) {
          let next = null;
          for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (walk(nx, nz) && d[key(nx, nz)] === dd - 1 && nav.passable(nx, nz, x, z)) { next = [nx, nz]; break; } }
          if (!next) break;
          [x, z] = next; dd--; lane.push(next);
        }
        return lane.reverse();
      };
      const center = lv.sites[L].center, cEye = center.clone(); cEye.y += 1.6;
      // staging: back along a lane from the way in, out of sight of the site
      const stageOf = (lane) => {
        const st = [];
        for (let i = lane.length - 3; i >= Math.max(0, lane.length - 11) && st.length < 3; i--) {
          const [x, z] = lane[i];
          if (!los(eye(x, z), cEye)) st.push([x, z]);
        }
        if (!st.length && lane.length) st.push(lane[Math.max(0, lane.length - 4)]);
        const more = [];
        for (const [x, z] of st) for (const [dx, dz] of N4) {
          const nx = x + dx, nz = z + dz;
          if (walk(nx, nz) && !inSite.has(key(nx, nz)) && !st.concat(more).some(q => q[0] === nx && q[1] === nz) && !los(eye(nx, nz), cEye)) more.push([nx, nz]);
        }
        return st.concat(more).slice(0, 6);
      };
      for (const e of groups) {
        e.lane = e.t >= 0 ? laneOf(e, dTo) : [];
        e.ctLane = e.ct >= 0 ? laneOf(e, dCTo) : [];
        e.stage = stageOf(e.lane);
        e.ctStage = stageOf(e.ctLane);
      }
      A.entries[L] = groups;

      // defender angles: covered spots on and around the site that see a way in from the attackers' side
      const [cx, cz] = nav.cellOf(center), R = 7, holds = [];
      const doorway = new Set(groups.flatMap(e => e.cells.map(q => key(q[0], q[1]))));
      for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
        if (!walk(x, z) || dCT[key(x, z)] < 0 || doorway.has(key(x, z))) continue;
        const p = eye(x, z), watch = [];
        let dmin = 1e9, look = null, near = 1e9;
        groups.forEach((e, i) => {
          if (!e.tSide) return;
          const ep = eye(...e.cell, 1.4), d = p.distanceTo(ep);
          if (d > 5 && d < 34 && los(p, ep)) {
            watch.push(i);
            if (e.t < near) { near = e.t; look = yawTo(p, ep); }
            dmin = Math.min(dmin, d);
          }
        });
        if (!watch.length) continue;
        let score = Math.min(2, watch.length) * 1.6 + Math.min(4, cover(x, z)) * 0.6 + (inSite.has(key(x, z)) ? 0.6 : 0);
        if (dmin < 9) score -= (9 - dmin) * 0.5;
        holds.push({ cell: [x, z], watch, look, score, site: L });
      }
      // the map's own hand-placed angles count extra
      for (const s of P.hold?.[L] || []) {
        const h = holds.find(q => q.cell[0] === s[0] && q.cell[1] === s[1]);
        const look = s.length >= 4 ? Math.atan2(-(s[2] - s[0]), -(s[3] - s[1])) : null;
        if (h) { h.score += 1.5; if (look != null) h.look = look; } else holds.push({ cell: [s[0], s[1]], watch: [], look, score: 2.5, site: L });
      }
      holds.sort((a, b) => b.score - a.score);
      A.holds[L] = holds.slice(0, 26);

      // along the attackers' lanes: early aggression (defenders), lurk spots and map control (attackers)
      const aggr = [], lurk = [];
      for (const e of groups) {
        if (!e.tSide || e.lane.length < 6) continue;
        const n = e.lane.length;
        e.lane.forEach(([x, z], i) => {
          const f = i / n, cv = cover(x, z);
          if (inSite.has(key(x, z))) return;
          if (f > 0.55 && f < 0.82 && cv >= 2) {
            const back = e.lane[Math.max(0, i - 4)];
            if (los(eye(x, z), eye(back[0], back[1]))) aggr.push({ cell: [x, z], look: yawTo(nav.center(x, z), nav.center(back[0], back[1])), score: cv + Math.random(), site: L });
          }
          const ahead = e.lane[Math.min(n - 1, i + 3)];
          if (f > 0.6 && f < 0.88 && cv >= 2 && !los(eye(x, z), cEye)) lurk.push({ cell: [x, z], look: yawTo(nav.center(x, z), nav.center(ahead[0], ahead[1])), score: cv + Math.random(), site: L });
          if (f > 0.28 && f < 0.6 && cv >= 1) A.defaults.push({ cell: [x, z], look: yawTo(nav.center(x, z), nav.center(ahead[0], ahead[1])), site: L, entry: e });
        });
      }
      A.aggr[L] = aggr.sort((a, b) => b.score - a.score).slice(0, 8);
      A.lurk[L] = lurk.sort((a, b) => b.score - a.score).slice(0, 8);
    }
    for (const s of P.tDefault || []) A.defaults.push({ cell: [s[0], s[1]], look: s.length >= 4 ? Math.atan2(-(s[2] - s[0]), -(s[3] - s[1])) : null, site: null });
    // keep distinct cells
    const seen = new Set();
    A.defaults = A.defaults.filter(d => { const k = key(...d.cell); if (seen.has(k)) return false; seen.add(k); return true; });
    // a covered spot near the defenders' spawn to fall back to when badly outnumbered
    let best = null, bs = -1;
    for (let k = 0; k < W * H; k++) {
      const d = dCT[k]; if (d < 1 || d > 5) continue;
      const x = k % W, z = (k / W) | 0, s = cover(x, z) + Math.random() * 0.5;
      if (s > bs) { bs = s; best = [x, z]; }
    }
    A.ctRally = best || nav.cellOf(ctSpawn);
    return A;
  }

  nearSite(pos) {
    let best = null, bd = 26;
    for (const L of ['A', 'B']) {
      const c = this.g.level.sites[L]?.center;
      if (!c) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }

  // ================================================================ round start
  plan() {
    if (!this.A) return;
    this.phase = 'live';
    this.post = null;
    this.tSeen = { A: [], B: [] };
    this.nextThink = 0;
    this.lastNumbers = null;
    // nothing carries over from last round
    for (const b of this.g.bots) { b.holdSpot = null; b.aggr = null; b.quiet = false; b.wantNade = null; b.grp = 0; b.siteHold = null; b.zone = null; }
    this.planCT();
    this.planT();
  }

  // ---------------------------------------------------------------- defenders
  planCT() {
    const A = this.A, P = this.pts, cts = shuffle(this.bots('CT')), n = cts.length;
    this.ct = { threat: { A: 0, B: 0 }, threatT: this.g.time, rotatedTo: null, regroup: false, hunt: false, retake: null, taken: [] };
    if (!n) return;
    let zones;
    if (A.sites.length < 2) {
      zones = cts.map((_, i) => (i === 0 && n >= 3 && P.hold?.mid?.length && Math.random() < 0.5 ? 'mid' : 'A'));
    } else {
      // lean toward the site the attackers have been hitting
      const hits = this.memory.hits.slice(0, 3);
      const lean = (z) => 1 + 0.25 * (z.filter(x => x === 'A').length - z.filter(x => x === 'B').length) * (hits.filter(h => h === 'A').length - hits.filter(h => h === 'B').length) / 3;
      const opts = SETUPS[Math.min(5, n)].map(([z, w]) => [z, w * Math.max(0.2, lean(z))]);
      zones = weighted(opts).slice();
      while (zones.length < n) zones.push(pick(A.sites));
      shuffle(zones);
    }
    // one player sometimes plays forward early for information, then falls back
    const aggrIdx = n >= 2 && Math.random() < 0.38 ? Math.floor(Math.random() * n) : -1;
    cts.forEach((b, i) => {
      b.zone = zones[i];
      b.aggr = null;
      const L = b.zone === 'mid' ? null : b.zone;
      if (i === aggrIdx) {
        const site = L || pick(A.sites), spot = pick(A.aggr[site]?.slice(0, 4) || []);
        if (spot) { b.aggr = { until: this.g.roundTime + rand(13, 22), site }; this.go(b, this.cellPos(spot.cell, 1), 'hold', spot.look); return; }
      }
      this.sendHold(b);
    });
  }

  // a defender to an angle on its zone, not one a teammate has, preferring
  // ways in nobody on that site is watching yet
  sendHold(b, avoid = null) {
    const A = this.A, P = this.pts;
    if (b.zone === 'mid') {
      const s = pick(P.hold?.mid || []) || null;
      if (s) { this.go(b, this.cellPos(s, 1), 'hold', s.length >= 4 ? Math.atan2(-(s[2] - s[0]), -(s[3] - s[1])) : null); return; }
      b.zone = pick(A.sites);
    }
    const L = b.zone, list = A.holds[L] || [];
    if (!list.length) { this.go(b, this.g.siteGoal(L), 'hold'); return; }
    const taken = this.bots('CT').filter(o => o !== b && o.holdSpot).map(o => o.holdSpot);
    const covered = new Set(taken.filter(t => t.site === L).flatMap(t => t.watch));
    const far = (s) => taken.every(t => Math.hypot(t.cell[0] - s.cell[0], t.cell[1] - s.cell[1]) >= 2) && s !== avoid;
    const opts = list.filter(far).map(s => [s, s.score + s.watch.filter(w => !covered.has(w)).length * 1.5 + Math.random() * 3]);
    opts.sort((a, b2) => b2[1] - a[1]);
    const s = opts[0]?.[0] || pick(list);
    b.holdSpot = s;
    b.patience = rand(10, 22);
    this.go(b, this.cellPos(s.cell, 1), 'hold', s.look);
  }

  // ---------------------------------------------------------------- attackers
  planT() {
    const A = this.A, ts = this.bots('T'), n = this.alive('T');
    this.tp = null;
    if (!ts.length) return;
    const sites = A.sites;
    const site = weighted(sites.map(L => [L, Math.max(0.15, 1 - 0.3 * this.memory.sites.slice(0, 2).filter(s => s === L).length - (this.memory.ctStrong === L ? 0.3 : 0))]));
    let opts = n <= 1 ? [['lurk', 1]]
      : n === 2 ? [['rush', 0.3], ['execute', 0.3], ['contact', 0.25], ['default', 0.15]]
      : n === 3 ? [['rush', 0.2], ['execute', 0.3], ['split', 0.2], ['contact', 0.15], ['default', 0.15]]
      : [['rush', 0.12], ['execute', 0.25], ['split', 0.25], ['fake', 0.15], ['default', 0.15], ['contact', 0.08]];
    const tEntries = (A.entries[site] || []).filter(e => e.tSide && e.lane.length);
    if (sites.length < 2) opts = opts.filter(([t]) => t !== 'fake');
    if (tEntries.length < 2) opts = opts.filter(([t]) => t !== 'split');
    if (!tEntries.length) opts = [['execute', 1]];
    opts = opts.map(([t, w]) => [t, this.memory.tactics.slice(0, 2).includes(t) ? w * 0.4 : w]);
    const tactic = weighted(opts);
    this.memory.tactics.unshift(tactic); this.memory.tactics.length = Math.min(this.memory.tactics.length, 4);
    this.memory.sites.unshift(site); this.memory.sites.length = Math.min(this.memory.sites.length, 4);

    const carrier = ts.find(b => b.hasBomb) || null;
    const others = shuffle(ts.filter(b => b !== carrier));
    const lurker = n >= 3 && ['execute', 'default', 'fake'].includes(tactic) && others.length && Math.random() < 0.45 ? others.pop() : null;
    const entryW = (e) => 1 / Math.max(4, e.t) + Math.random() * 0.05;
    const pickEntry = (except = null) => {
      const list = tEntries.filter(e => e !== except);
      return list.length ? weighted(list.map(e => [e, entryW(e)])) : tEntries[0] || null;
    };
    const groups = [];
    if (tactic === 'split') {
      const all = [carrier, ...others].filter(Boolean);
      const half = Math.ceil(all.length / 2);
      const e0 = pickEntry(), e1 = pickEntry(e0);
      groups.push({ bots: all.slice(0, half), entry: e0 }, { bots: all.slice(half), entry: e1 });
    } else groups.push({ bots: [carrier, ...others].filter(Boolean), entry: pickEntry() });
    for (const [i, gr] of groups.entries()) { gr.id = i; gr.goAt = null; gr.went = false; for (const b of gr.bots) b.grp = i; }

    const rt = this.g.roundTime;
    const tp = this.tp = { tactic, site, groups, lurker, lurkSite: null, phase: 'setup', setupUntil: rt, stageBy: rt + 25, fakeUntil: 0, fakeSite: null };
    if (lurker) { lurker.grp = -1; tp.lurkSite = sites.length > 1 ? OTHER[site] : site; }
    if (tactic === 'rush' || tactic === 'contact') { tp.phase = 'stage'; tp.stageBy = rt + (tactic === 'rush' ? 22 : 40); }
    else if (tactic === 'execute') tp.setupUntil = rt + rand(8, 18);
    else if (tactic === 'split') tp.setupUntil = rt + rand(6, 14);
    else if (tactic === 'fake') { tp.setupUntil = rt + rand(3, 8); tp.fakeSite = OTHER[site]; }
    else if (tactic === 'default') tp.setupUntil = rt + rand(22, 36);
    else if (tactic === 'lurk') { tp.phase = 'lurk'; tp.setupUntil = rt + rand(10, 22); }
    this.phase = tp.phase;
    for (const b of ts) this.dispatchT(b);
  }

  group(b) { return this.tp?.groups[b.grp] || this.tp?.groups[0] || null; }

  // A spot the bot hasn't been sent to and a teammate doesn't hold.
  freeDefault(b, siteBias = null) {
    const A = this.A, mates = this.bots('T').filter(o => o !== b);
    const used = (d) => mates.some(o => o.goal && Math.hypot(o.goal.x - this.g.level.nav.center(...d.cell).x, o.goal.z - this.g.level.nav.center(...d.cell).z) < 5);
    let list = A.defaults.filter(d => !used(d) && d !== b.lastDefault);
    if (siteBias) { const near = list.filter(d => d.site === siteBias || !d.site); if (near.length) list = near; }
    return pick(list) || pick(A.defaults);
  }

  // Where an attacker should be for the current phase of the plan.
  dispatchT(b) {
    const tp = this.tp, A = this.A;
    if (!tp || !b.alive) return;
    if (this.g.bomb.state === 'planted') { this.assignPost(); return; }
    if (b === tp.lurker) return this.sendLurk(b);
    const gr = this.group(b);
    switch (tp.phase) {
      case 'setup': {
        const d = this.freeDefault(b, tp.tactic === 'default' ? null : tp.site);
        if (!d) return this.sendStage(b, gr);
        b.lastDefault = d;
        return this.go(b, this.cellPos(d.cell, 1.4), 'default', d.look);
      }
      case 'lurk': return this.sendLurk(b, tp.site);
      case 'fake': return this.sendStage(b, gr, tp.fakeSite);
      case 'stage': return this.sendStage(b, gr);
      case 'go': return this.sendGo(b, gr);
      default: return this.sendStage(b, gr);
    }
  }

  sendStage(b, gr, siteOverride = null) {
    const A = this.A, L = siteOverride || this.tp.site;
    let e = gr?.entry;
    if (siteOverride || !e || !(A.entries[L] || []).includes(e)) e = pick((A.entries[L] || []).filter(x => x.tSide && x.lane.length)) || null;
    if (!e) return this.go(b, this.g.siteGoal(L), 'attack');
    const c = pick(e.stage.length ? e.stage : [e.cell]);
    this.go(b, this.cellPos(c, 2), 'stage', yawTo(this.g.level.nav.center(...c), e.pos), this.tp.tactic === 'contact' || this.tp.tactic === 'lurk');
    b.stageEntry = e;
  }

  sendLurk(b, L = null) {
    const A = this.A, site = L || this.tp.lurkSite || this.tp.site;
    const s = pick(A.lurk[site]?.slice(0, 5) || []);
    if (!s) return this.sendStage(b, this.group(b), site);
    this.go(b, this.cellPos(s.cell, 1), 'lurk', s.look, true);
  }

  // On the site: the carrier to a plant spot, the rest spread over the site.
  sendGo(b, gr) {
    const g = this.g, L = this.tp.site, P = this.pts;
    if (b.hasBomb) {
      const s = pick(P.plant?.[L] || []);
      return this.go(b, s ? this.cellPos(s, 0.6) : g.siteGoal(L), 'attack');
    }
    const cells = g.level.sites[L].filter(v => g.level.nav.walkable(...g.level.nav.cellOf(v)));
    const taken = this.bots('T').filter(o => o !== b && o.role === 'attack' && o.goal).map(o => o.goal);
    const free = cells.filter(c => taken.every(t => t.distanceTo(c) > 3.5));
    this.go(b, (pick(free.length ? free : cells) || g.siteGoal(L)).clone(), 'attack');
  }

  goGroup(gr) {
    const tp = this.tp, A = this.A, L = tp.site;
    gr.went = true;
    const holds = (A.holds[L] || []), e = gr.entry, ei = (A.entries[L] || []).indexOf(e);
    const aim = holds.filter(h => h.watch.includes(ei));
    const nav = this.g.level.nav;
    const inside = e ? e.pos.clone().lerp(this.g.level.sites[L].center, 0.45) : this.g.level.sites[L].center.clone();
    let smoked = false, flashed = false, burned = false;
    for (const b of gr.bots) {
      if (!b.alive) continue;
      b.quiet = false;
      this.sendGo(b, gr);
      // utility on the way in: a smoke on the angle that watches this way in,
      // a flash over the doorway, fire on a close corner
      const now = this.g.time;
      if (!smoked && aim[0] && b.nades.includes('smoke')) { b.wantNade = { type: 'smoke', at: nav.center(...aim[0].cell), until: now + 9 }; smoked = true; }
      else if (!flashed && b.nades.includes('flash')) { b.wantNade = { type: 'flash', at: inside.clone(), until: now + 8 }; flashed = true; }
      else if (!burned && aim[1] && (b.nades.includes('molotov') || b.nades.includes('incendiary'))) { b.wantNade = { type: b.nades.includes('molotov') ? 'molotov' : 'incendiary', at: nav.center(...aim[1].cell), until: now + 9 }; burned = true; }
    }
  }

  goAll() {
    const tp = this.tp;
    if (!tp) return;
    tp.phase = 'go'; this.phase = 'go';
    for (const gr of tp.groups) if (!gr.went) this.goGroup(gr);
    if (tp.lurker?.alive && !tp.lurkerFlank) this.flankLurker();
    for (const b of this.bots('T')) if (b.role !== 'attack' && b.role !== 'fetch' && b !== tp.lurker) this.sendGo(b, this.group(b));
  }

  // The lurker moves onto the defenders' rotate path into the plant site.
  flankLurker() {
    const tp = this.tp, A = this.A, b = tp.lurker;
    tp.lurkerFlank = true;
    if (!b?.alive) return;
    const ents = (A.entries[tp.site] || []).filter(e => e.ct >= 0 && e.ctLane.length > 4).sort((a, c) => a.ct - c.ct);
    const e = ents[0];
    if (!e) return this.sendGo(b, this.group(b));
    const c = e.ctLane[Math.floor(e.ctLane.length * rand(0.45, 0.65))];
    this.go(b, this.cellPos(c, 1), 'lurk', yawTo(this.g.level.nav.center(...c), this.g.level.nav.center(...e.ctLane[0])), true);
  }

  // The site with less defender activity seen lately.
  saferSite(L) {
    if (this.A.sites.length < 2) return L;
    const now = this.g.time, seen = (S) => this.tSeen[S].filter(t => now - t < 20).length;
    return seen(L) > seen(OTHER[L]) + 1 ? OTHER[L] : L;
  }

  // ================================================================ information
  // A bot saw (or heard, when not strong) an enemy at pos.
  report(bot, pos, strong = false) {
    if (!this.enabled || this.g.state !== 'live' || !this.A) return;
    const site = this.nearSite(pos), now = this.g.time;
    if (bot.team === 'T') {
      if (site) { this.tSeen[site].push(now); this.tSeen[site] = this.tSeen[site].filter(t => now - t < 20); }
      const tp = this.tp;
      if (!tp || tp.phase === 'go' || this.g.bomb.state === 'planted') return;
      // ran into a stack where we were going: take it elsewhere (not mid-rush)
      if (site && site === tp.site && this.A.sites.length > 1 && tp.tactic !== 'rush' && !tp.switched && this.tSeen[site].filter(t => now - t < 8).length >= 2) {
        tp.switched = true; tp.site = OTHER[site]; this.memory.ctStrong = site;
        if (tp.phase === 'stage' || tp.phase === 'setup') { tp.phase = 'stage'; tp.stageBy = this.g.roundTime + 20; for (const b of this.bots('T')) this.dispatchT(b); }
      }
      // a contact walk goes the moment it meets someone
      if (tp.tactic === 'contact' && tp.phase === 'stage') this.goAll();
    } else if (site) this.addThreat(site, strong ? 4 : 1);
  }

  addThreat(L, amt) { if (this.ct?.threat) this.ct.threat[L] = (this.ct.threat[L] || 0) + amt; }

  // A character died: tell the team where it came from, send someone to look,
  // fetch the bomb, and replan for the new numbers.
  onDeath(victim, killer) {
    if (!this.enabled || this.g.state !== 'live' || !this.A) return;
    const now = this.g.time, team = victim.team;
    const mates = this.bots(team);
    if (killer && killer !== victim && killer.team !== team) {
      for (const b of mates) {
        if (b.target || b.pos.distanceTo(victim.pos) > 45) continue;
        const f = 2.5;
        b.lastSeen = killer.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * f, 0, (Math.random() - 0.5) * f));
        b.lastSeenTime = now;
      }
    }
    const site = this.nearSite(victim.pos);
    if (team === 'CT' && site) this.addThreat(site, 2.5);
    if (team === 'T' && killer && this.tSeen) { const ks = this.nearSite(killer.pos); if (ks) this.tSeen[ks].push(now); }
    // the nearest teammate who isn't busy goes to check it out
    const busy = new Set(['fetch', 'retake', 'regroup', 'save', 'deny', 'guard', 'investigate']);
    const free = mates.filter(b => !b.target && !b.planting && !b.defusing && !b.hasBomb && !busy.has(b.role) && !(team === 'T' && this.tp?.phase === 'go'))
      .map(b => [b, b.pos.distanceTo(victim.pos)]).filter(([, d]) => d < 40).sort((a, b) => a[1] - b[1]);
    if (free.length && mates.length >= 2) this.investigate(free[0][0], victim.pos, killer?.alive ? killer.pos : null);
    // bomb dropped by the dead carrier: the nearest attacker gets it, another covers him
    if (team === 'T' && this.g.bomb.state === 'dropped') this.coverBomb();
    if (this.g.bomb.state === 'planted') {
      if (team === 'T') this.assignPost();
      else if (this.ct?.retake?.phase === 'go' && victim === this.ct.retake.defuser) this.pickDefuser();
    }
    this.onNumbers();
  }

  investigate(b, pos, threat) {
    const g = this.g, nav = g.level.nav;
    const path = findPath(nav, b.pos, pos);
    if (!path?.length) return;
    const tgt = pos.clone(); tgt.y += 1.2;
    let goal = path[Math.max(0, path.length - 3)];
    for (let i = path.length - 1; i >= 0; i--) {
      const p = path[i], e = p.clone(); e.y += 1.6;
      if (p.distanceTo(pos) >= 6 && g.level.world.lineOfSight(e, tgt)) { goal = p; break; }
      if (p.distanceTo(pos) > 14) break;
    }
    b.planBefore = b.role;
    this.go(b, goal.clone(), 'investigate', yawTo(goal, threat || pos), b.pos.distanceTo(pos) < 18);
  }

  coverBomb() {
    const bomb = this.g.bomb, ts = this.bots('T').sort((a, b) => a.pos.distanceTo(bomb.pos) - b.pos.distanceTo(bomb.pos));
    const cover = ts[1];
    if (!cover || cover.pos.distanceTo(bomb.pos) > 35 || cover.target) return;
    const dir = cover.pos.clone().sub(bomb.pos).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
    const p = bomb.pos.clone().addScaledVector(dir.normalize(), 5);
    const nav = this.g.level.nav, [cx, cz] = nav.cellOf(p);
    this.go(cover, nav.walkable(cx, cz) ? nav.center(cx, cz) : bomb.pos.clone(), 'investigate', yawTo(p, bomb.pos));
  }

  // Back to whatever the plan says after a detour.
  dispatch(b) {
    if (b.team === 'T') return this.dispatchT(b);
    if (this.g.bomb.state === 'planted') return this.dispatchRetake(b);
    if (this.ct?.regroup) return this.sendRally(b);
    return this.sendHold(b);
  }

  // Fewer players now: the plans change.
  onNumbers() {
    const nT = this.alive('T'), nCT = this.alive('CT'), tp = this.tp;
    if (tp && this.g.bomb.state !== 'planted' && tp.phase !== 'go') {
      // a lurker isn't worth it with two left: rejoin the group
      if (nT <= 2 && tp.lurker?.alive) { const l = tp.lurker; tp.lurker = null; l.grp = 0; tp.groups[0].bots.push(l); this.dispatchT(l); }
      // splits merge when the groups get thin
      if (tp.groups.length > 1 && nT <= 2) { const g0 = tp.groups[0]; for (const gr of tp.groups.slice(1)) for (const b of gr.bots) { b.grp = 0; g0.bots.push(b); } tp.groups.length = 1; }
    }
    this.lastNumbers = { nT, nCT };
  }

  // ================================================================ per tick
  update() {
    const g = this.g;
    if (!this.enabled || g.state !== 'live' || !this.A || !this.ct) return;
    if (g.time < this.nextThink) return;
    const dt = Math.min(1, g.time - (this.lastThink ?? g.time));
    this.lastThink = g.time; this.nextThink = g.time + 0.25;
    for (const L of ['A', 'B']) this.ct.threat[L] *= Math.exp(-dt / 10);
    if (g.bomb.state === 'planted') {
      if (!this.post) this.startPost();
      this.updatePost();
      this.updateRetake();
      return;
    }
    this.updateT();
    this.updateCT();
  }

  updateT() {
    const tp = this.tp, g = this.g;
    if (!tp) return;
    const rt = g.roundTime, ts = this.bots('T');
    if (!ts.length) return;
    const nT = this.alive('T'), nCT = this.alive('CT');
    if (tp.phase !== 'go') {
      // never run the clock out, and press a man advantage
      if (rt > 72 || (nT - nCT >= 2 && rt > 6)) return this.goAll();
    }
    const near = (b, d = 9) => b.goal && b.pos.distanceTo(b.goal) < d;
    switch (tp.phase) {
      case 'setup':
        if (rt >= tp.setupUntil) {
          if (tp.tactic === 'default') tp.site = this.saferSite(tp.site);
          tp.phase = tp.tactic === 'fake' ? 'fake' : 'stage';
          tp.stageBy = rt + 20;
          this.phase = tp.phase;
          for (const b of ts) if (b !== tp.lurker) this.dispatchT(b);
        }
        break;
      case 'fake': {
        // show up at the other site, make noise with utility, then go to the real one
        const there = ts.filter(b => b !== tp.lurker && near(b, 10)).length;
        if (!tp.fakeUntil && (there >= Math.max(1, Math.ceil(ts.length * 0.6)) || rt > tp.stageBy)) {
          tp.fakeUntil = rt + rand(3.5, 6.5);
          const site = tp.fakeSite, c = g.level.sites[site]?.center;
          for (const b of ts) if (c && b.nades.length && b !== tp.lurker && Math.random() < 0.6) b.wantNade = { type: b.nades.includes('flash') ? 'flash' : b.nades.includes('smoke') ? 'smoke' : b.nades[0], at: c.clone(), until: g.time + 6 };
        }
        if (tp.fakeUntil && rt > tp.fakeUntil) {
          tp.phase = 'stage'; this.phase = 'stage'; tp.stageBy = rt + 22;
          // the lurker stays on the faked site to catch whoever stays there
          for (const b of ts) if (b !== tp.lurker) this.dispatchT(b);
        }
        break;
      }
      case 'stage': {
        const contact = ts.some(b => b.target || (b.lastSeenTime != null && g.time - b.lastSeenTime < 2.5 && b.pos.distanceTo(b.lastSeen) < 30));
        if (tp.tactic === 'contact' && contact) return this.goAll();
        const ready = tp.groups.map(gr => {
          const alive = gr.bots.filter(b => b.alive);
          return !alive.length || alive.filter(b => near(b)).length >= Math.max(1, Math.ceil(alive.length * 0.7));
        });
        if (ready.every(Boolean) || rt > tp.stageBy) {
          if (tp.groups.length > 1) {
            // a split: the group with further to go leaves first, so both arrive together
            const len = tp.groups.map(gr => { const b = gr.bots.find(x => x.alive); if (!b) return 0; const p = findPath(g.level.nav, b.pos, g.level.sites[tp.site].center); return p ? p.length * g.level.nav.S : 0; });
            const longest = Math.max(...len);
            tp.groups.forEach((gr, i) => { gr.goAt = rt + (longest - len[i]) / 5.5; });
            tp.phase = 'go'; this.phase = 'go';
          } else this.goAll();
        }
        break;
      }
      case 'lurk':
        if (rt >= tp.setupUntil) { tp.site = this.saferSite(tp.site); this.goAll(); }
        break;
      case 'go':
        for (const gr of tp.groups) if (!gr.went && gr.goAt != null && rt >= gr.goAt) this.goGroup(gr);
        if (tp.lurker?.alive && !tp.lurkerFlank && tp.groups.some(gr => gr.went) && rt > (tp.flankAt ??= rt + rand(4, 8))) this.flankLurker();
        break;
    }
  }

  updateCT() {
    const g = this.g, ct = this.ct, A = this.A, rt = g.roundTime;
    const cts = this.bots('CT');
    if (!cts.length) return;
    const nT = this.alive('T'), nCT = this.alive('CT');
    // an early aggressive player falls back to an angle on its site
    for (const b of cts) if (b.aggr && rt > b.aggr.until && !b.target && g.time - (b.lastSeenTime ?? -99) > 4) { b.aggr = null; if (!b.zone) b.zone = pick(A.sites); this.sendHold(b); }
    // heavily outnumbered: fall back together and play for the retake
    if (!ct.regroup && nCT <= 2 && nT >= nCT + 2 && rt > 8) {
      ct.regroup = true;
      for (const b of cts) if (!b.target) this.sendRally(b);
      return;
    }
    // well ahead late: go find the last attackers
    if (!ct.hunt && !ct.regroup && nCT >= nT + 2 && nT <= 2 && rt > 30) {
      ct.hunt = true;
      const hunters = shuffle(cts.slice()).slice(0, Math.ceil(cts.length / 2));
      for (const b of hunters) g.assignHunt(b);
    }
    if (ct.regroup) return;
    // rotate on information
    if (A.sites.length > 1) {
      for (const L of A.sites) {
        if (ct.threat[L] < 3 || ct.rotatedTo === L) continue;
        if (ct.rotatedTo && ct.threat[L] < ct.threat[OTHER[L]] + 2) continue;
        this.rotate(L);
        break;
      }
    }
  }

  // Defenders from the other site and mid come to help; one anchor stays when
  // there are enough of them or the other site has seen activity too.
  rotate(L) {
    const ct = this.ct, A = this.A;
    ct.rotatedTo = L;
    const cts = this.bots('CT');
    const away = cts.filter(b => b.zone !== L && !b.target && b.role !== 'investigate');
    const keepAnchor = this.alive('CT') >= 4 || ct.threat[OTHER[L]] > 1;
    const oc = this.g.level.sites[OTHER[L]]?.center;
    const anchor = keepAnchor && oc ? away.filter(b => b.zone === OTHER[L]).sort((a, b) => a.pos.distanceTo(oc) - b.pos.distanceTo(oc))[0] : null;
    for (const b of away) {
      if (b === anchor) continue;
      b.zone = L; b.aggr = null;
      this.sendHold(b);
    }
  }

  sendRally(b) {
    const A = this.A, c = A.ctRally;
    const hot = A.sites.length > 1 ? (this.ct.threat.A >= this.ct.threat.B ? 'A' : 'B') : A.sites[0];
    const p = this.cellPos(c, 2), sc = this.g.level.sites[hot]?.center;
    this.go(b, p, 'regroup', sc ? yawTo(p, sc) : null);
  }

  // ================================================================ after the plant
  startPost() {
    const g = this.g, L = g.bomb.site || this.nearSite(g.bomb.pos);
    this.post = { L, spots: null };
    this.phase = 'post';
    if (L) { this.memory.hits.unshift(L); this.memory.hits.length = Math.min(this.memory.hits.length, 4); }
    this.assignPost();
    this.startRetake();
  }

  // Spots around the planted bomb with it in view, scored for cover, which ways
  // in they watch, and whether they're on the site or off it on the attackers' side.
  postSpots() {
    if (this.post.spots) return this.post.spots;
    const g = this.g, A = this.A, nav = g.level.nav, L = this.post.L, bomb = g.bomb.pos;
    const bEye = bomb.clone(); bEye.y += 0.3;
    const [bx, bz] = nav.cellOf(bomb), R = 7, out = [];
    const ents = (A.entries[L] || []).filter(e => e.ct >= 0).sort((a, b) => a.ct - b.ct);
    const inSite = A.siteCells[L] || new Set();
    for (let z = bz - R; z <= bz + R; z++) for (let x = bx - R; x <= bx + R; x++) {
      if (!A.walk(x, z)) continue;
      const p = nav.center(x, z), e = A.eye(x, z), d = p.distanceTo(bomb);
      if (d < 3 || d > 26 || !A.los(e, bEye)) continue;
      const watch = [];
      ents.forEach((en, i) => { const ep = A.eye(...en.cell, 1.4), dd = e.distanceTo(ep); if (dd > 6 && dd < 28 && A.los(e, ep)) watch.push(i); });
      const k = A.key(x, z);
      out.push({ cell: [x, z], p, d, cover: A.cover(x, z), watch, on: inSite.has(k), tSide: A.dT[k] >= 0 && A.dCT[k] >= 0 && A.dT[k] < A.dCT[k] });
    }
    return (this.post.spots = { list: out, ents });
  }

  assignPost() {
    if (!this.post?.L) return;
    const g = this.g, bomb = g.bomb.pos, ts = this.bots('T');
    if (!ts.length) return;
    const n = this.alive('T');
    const { list, ents } = this.postSpots();
    if (!list.length) return;
    const taken = [];
    const spread = (s) => taken.reduce((m, t) => Math.min(m, t.p.distanceTo(s.p)), 1e9);
    const angle = (s) => { if (!taken.length) return Math.PI; const a = Math.atan2(s.p.z - bomb.z, s.p.x - bomb.x); return Math.min(...taken.map(t => { let d = Math.abs(a - Math.atan2(t.p.z - bomb.z, t.p.x - bomb.x)); return d > Math.PI ? 2 * Math.PI - d : d; })); };
    const best = (score) => { let b = null, bs = -1e9; for (const s of list) { if (taken.includes(s)) continue; const v = score(s) + Math.random() * 0.8; if (v > bs) { bs = v; b = s; } } return b; };
    const watchE = (i) => (s) => (s.watch.includes(i) ? 6 : -4) + Math.min(4, s.cover) * 0.6 - Math.abs(s.d - 11) * 0.3 + (s.on ? 1 : 0) + Math.min(8, spread(s)) * 0.4;
    const hide = (s) => (s.on ? -3 : 3) + (s.tSide ? 2 : 0) + Math.min(4, s.cover) * 0.9 + Math.min(1, (s.d - 9) / 8) * 2 + angle(s) * 1.5;
    const roles = [];
    if (n <= 1) roles.push(['hide', hide]);
    else if (n === 2) roles.push(['watch', watchE(0)], ['cross', hide]);
    else if (n === 3) roles.push(['watch', watchE(0)], [ents.length > 1 ? 'watch' : 'cross', ents.length > 1 ? watchE(1) : hide], ['cross', hide]);
    else roles.push(['watch', watchE(0)], [ents.length > 1 ? 'watch' : 'cross', ents.length > 1 ? watchE(1) : hide], ['cross', hide], ['flank', null]);
    const free = ts.slice();
    for (const [role, score] of roles) {
      if (!free.length) break;
      if (role === 'flank') {
        // the defenders' rotate path, behind where they'll come from
        const e = ents[0];
        if (!e || e.ctLane.length < 5) continue;
        const c = e.ctLane[Math.floor(e.ctLane.length * rand(0.4, 0.6))], p = g.level.nav.center(...c);
        const b = free.sort((a, c2) => a.pos.distanceTo(p) - c2.pos.distanceTo(p)).shift();
        this.go(b, p, 'guard', yawTo(p, g.level.nav.center(...e.cell)), true);
        continue;
      }
      const s = best(score);
      if (!s) break;
      taken.push(s);
      const b = free.sort((a, c2) => a.pos.distanceTo(s.p) - c2.pos.distanceTo(s.p)).shift();
      const look = s.watch.length ? yawTo(s.p, ents[s.watch[0]].pos) : yawTo(s.p, bomb);
      this.go(b, this.cellPos(s.cell, 0.8), 'guard', look, role === 'hide');
    }
    // anyone left over watches the bomb from another angle
    for (const b of free) { const s = best(hide); if (!s) break; taken.push(s); this.go(b, this.cellPos(s.cell, 0.8), 'guard', yawTo(s.p, bomb)); }
  }

  updatePost() {
    const g = this.g;
    // someone is on the bomb: anyone who can't see it goes to stop the defuse
    if (!g.bomb.defuse) return;
    const bEye = g.bomb.pos.clone(); bEye.y += 0.3;
    for (const b of this.bots('T')) {
      if (b.target || b.role === 'deny' || g.level.world.lineOfSight(b.eyePos(new THREE.Vector3()), bEye)) continue;
      this.go(b, g.bomb.pos.clone(), 'deny');
    }
  }

  // ---------------------------------------------------------------- the retake
  startRetake() {
    const A = this.A, L = this.post.L, cts = this.bots('CT');
    const ents = (A.entries[L] || []).filter(e => e.ct >= 0 && e.ctLane.length).sort((a, b) => a.ct - b.ct);
    this.ct.retake = { L, phase: 'gather', started: this.g.time, ents: ents.slice(0, Math.min(2, ents.length)), defuser: null };
    for (const b of cts) this.dispatchRetake(b);
  }

  dispatchRetake(b) {
    const r = this.ct?.retake;
    if (!r) return;
    if (r.phase === 'go') return this.sendRetaker(b);
    if (!r.ents.length) return this.go(b, this.g.bomb.pos.clone(), 'retake');
    const i = this.bots('CT').indexOf(b), e = r.ents[Math.max(0, i) % r.ents.length];
    const c = pick(e.ctStage.length ? e.ctStage : [e.cell]);
    this.go(b, this.cellPos(c, 1.6), 'regroup', yawTo(this.g.level.nav.center(...c), e.pos));
  }

  updateRetake() {
    const r = this.ct?.retake, g = this.g, bomb = g.bomb;
    if (!r) return;
    const cts = this.bots('CT');
    if (!cts.length) return;
    const kit = cts.some(b => b.hasKit), defuse = kit ? 5 : 10;
    const nearest = Math.min(...cts.map(b => b.pos.distanceTo(bomb.pos)));
    // can't make it in time: save the gun
    if (bomb.timer < nearest / 6 + defuse - 0.5) {
      for (const b of cts) if (b.role !== 'save' && !b.defusing) { const c = g.level.spawns.CT[0]; this.go(b, c.clone(), 'save'); }
      return;
    }
    if (r.phase === 'gather') {
      const far = Math.max(...cts.map(b => b.pos.distanceTo(bomb.pos)));
      const ready = cts.filter(b => b.role === 'regroup' && b.goal && b.pos.distanceTo(b.goal) < 6).length;
      if (ready >= Math.min(cts.length, 3) || bomb.timer < defuse + far / 5.5 + 5 || g.time - r.started > 14) {
        r.phase = 'go';
        this.pickDefuser();
        for (const b of cts) if (b !== r.defuser) this.sendRetaker(b);
      }
    }
  }

  pickDefuser() {
    const r = this.ct.retake, bomb = this.g.bomb.pos, cts = this.bots('CT');
    if (!cts.length) return;
    const by = (a, b) => (b.hasKit - a.hasKit) || a.pos.distanceTo(bomb) - b.pos.distanceTo(bomb);
    r.defuser = cts.slice().sort(by)[0];
    this.go(r.defuser, bomb.clone(), 'retake');
  }

  // Into the site to clear it: covered spots near the bomb that watch the
  // attackers' ways in, spread out.
  sendRetaker(b) {
    const r = this.ct.retake, g = this.g, A = this.A, bomb = g.bomb.pos;
    if (b === r.defuser) return this.go(b, bomb.clone(), 'retake');
    const holds = (A.holds[r.L] || []).filter(h => g.level.nav.center(...h.cell).distanceTo(bomb) < 14);
    const taken = this.bots('CT').filter(o => o !== b && o.role === 'retake' && o.goal).map(o => o.goal);
    const free = holds.filter(h => taken.every(t => t.distanceTo(g.level.nav.center(...h.cell)) > 4));
    const s = pick(free.slice(0, 5)) || pick(holds);
    if (s) this.go(b, this.cellPos(s.cell, 1), 'retake', s.look);
    else this.go(b, bomb.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4))), 'retake');
  }

  // ================================================================ idle bots
  // Called when a bot has been at its goal a while with nothing going on.
  idle(b, now) {
    if (!this.enabled || this.g.state !== 'live' || !this.A || !this.ct) return;
    const since = now - (b.arrivedAt ?? now), quiet = now - (b.lastSeenTime ?? -99);
    switch (b.role) {
      case 'investigate':
        if (since > 3.5 && quiet > 2.5) this.dispatch(b);
        return;
      case 'hold':
        // nothing happening: take another angle on the same site now and then
        if (b.team === 'CT' && !b.aggr && since > (b.patience || 20) && quiet > 6) {
          if (Math.random() < 0.55) this.sendHold(b, b.holdSpot); else b.patience = (b.patience || 20) + rand(8, 15);
        }
        return;
      case 'default':
        // map control isn't standing still: move between spots while waiting
        if (b.team === 'T' && since > rand(5, 10) && quiet > 4 && this.tp?.phase === 'setup') this.dispatchT(b);
        return;
      case 'fetch':
        if (b.hasBomb) this.dispatchT(b);
        return;
      case 'hunt':
        if (since > 4 && quiet > 3) this.g.assignHunt(b);
        return;
      case 'attack':
        // on the site with nothing to do: hold an angle on it
        if (b.team === 'T' && !b.hasBomb && since > 3 && this.tp?.site && now - (b.siteHold ?? -99) > 12) {
          const holds = this.A.holds[this.tp.site] || [];
          const s = pick(holds.slice(0, 8));
          b.siteHold = now;
          if (s) this.go(b, this.cellPos(s.cell, 1), 'attack', s.look);
        }
        return;
      default:
    }
  }

  // Where the bomb carrier should be heading right now (null = follow its role).
  carrierGoalSite() {
    if (!this.enabled || !this.tp) return null;
    return this.tp.phase === 'go' || this.phase === 'post' ? this.tp.site : null;
  }
}
