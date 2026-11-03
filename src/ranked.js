// Ranked ladder: tiers and subranks, hidden matchmaking rating (MMR) with
// uncertainty, rank points (RP), promotion series, demotion shields, decay,
// placements, leave penalties and a simulated population for the leaderboard.
import { rng } from './noise.js';

// ---------------------------------------------------------------- tiers
export const TIERS = [
  { id: 'iron', name: 'Iron', subs: 3, color: '#7d7f84', gain: 1.3, loss: 0.7 },
  { id: 'bronze', name: 'Bronze', subs: 3, color: '#b0743f', gain: 1.2, loss: 0.8 },
  { id: 'silver', name: 'Silver', subs: 4, color: '#b9c2cc', gain: 1.1, loss: 0.9 },
  { id: 'gold', name: 'Gold', subs: 4, color: '#e2b23e', gain: 1.0, loss: 1.0 },
  { id: 'platinum', name: 'Platinum', subs: 4, color: '#4fc4b8', gain: 0.95, loss: 1.05 },
  { id: 'diamond', name: 'Diamond', subs: 4, color: '#6aa8ff', gain: 0.85, loss: 1.15, series: 3, decay: true },
  { id: 'obsidian', name: 'Obsidian', subs: 3, color: '#8e5ad8', gain: 0.75, loss: 1.25, series: 3, decay: true },
  { id: 'vanguard', name: 'Vanguard', subs: 3, color: '#e8503a', gain: 0.65, loss: 1.35, series: 5, decay: true },
  { id: 'apex', name: 'Apex', subs: 1, color: '#ffd66a', gain: 0.6, loss: 1.4, series: 5, decay: true, topN: 100 },
];
const ROMAN = ['I', 'II', 'III', 'IV'];

// Flatten into an ordered list of ranks (index 0 = Iron III … last = Apex).
export const RANKS = [];
TIERS.forEach((t, ti) => {
  for (let s = t.subs; s >= 1; s--) RANKS.push({ index: RANKS.length, tier: ti, tierId: t.id, sub: s, name: t.subs > 1 ? `${t.name} ${ROMAN[s - 1]}` : t.name, color: t.color });
});
export const TOP = RANKS.length - 1;

// MMR that corresponds to the bottom of each rank (100 MMR per subrank, from 300).
export const rankFloorMMR = (i) => 300 + i * 100;
export const mmrToRankIndex = (mmr) => Math.max(0, Math.min(TOP, Math.floor((mmr - 300) / 100)));

// Bot skill (0–1) for a given MMR. Top ranks face near-perfect bots.
export function skillForMMR(mmr) { return Math.max(0.03, Math.min(1, (mmr - 250) / 3000)); }

// ---------------------------------------------------------------- state
const KEY = 'vantage.ranked.v1';
export const LADDERS = {
  '5v5': { label: 'Competitive 5v5', size: 5, win: 5, bots: true },
  '2v2': { label: 'Wingman 2v2', size: 2, win: 5, bots: true },
  pvp5: { label: 'PvP 5v5', size: 5, win: 5, online: true },
  pvp2: { label: 'PvP 2v2', size: 2, win: 5, online: true },
};
const PLACEMENTS = 5;
const PLACEMENT_CAP = RANKS.findIndex(r => r.tierId === 'platinum' && r.sub === 4); // can't place above Platinum IV

export function freshLadder() {
  return {
    mmr: 1000, rd: 350, rank: null, rp: 0, placements: 0,
    wins: 0, losses: 0, streak: 0, peak: null, shield: 0,
    series: null, // { need, wins, losses, max }
    history: [], lastPlayed: 0, cooldownUntil: 0, abandons: 0,
  };
}
let store = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return { '5v5': { ...freshLadder(), ...s['5v5'] }, '2v2': { ...freshLadder(), ...s['2v2'] } }; } catch { /* storage unavailable (e.g. on the server) */ }
  return { '5v5': freshLadder(), '2v2': freshLadder() };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ } }
let remoteLadders = null;
export function setRemoteLadders(l) { remoteLadders = l; }
export function isRemote() { return !!remoteLadders; }
export function ladder(id) {
  if (remoteLadders) return remoteLadders[id] || freshLadder();
  applyDecay(id); return store[id] || freshLadder();
}
export function resetRanked() { store = { '5v5': freshLadder(), '2v2': freshLadder() }; save(); }

// Inactivity: uncertainty grows; high tiers lose RP after a week away.
export function applyDecay(id, L = store[id]) {
  if (!L) return;
  if (!L.lastPlayed || L.rank == null) return;
  const days = (Date.now() - L.lastPlayed) / 86400000;
  if (days < 1) return;
  L.rd = Math.min(350, L.rd + days * 4);
  const t = TIERS[RANKS[L.rank].tier];
  const decayDays = Math.floor(days - 7);
  if (t.decay && decayDays > 0 && !L.decayApplied) {
    const floor = RANKS.findIndex(r => r.tierId === 'diamond' && r.sub === 4);
    let rp = L.rp - decayDays * 25;
    while (rp < 0 && L.rank > floor) { L.rank--; rp += 100; }
    L.rp = Math.max(0, rp);
    L.mmr -= decayDays * 10;
    L.decayApplied = true;
  }
  if (L === store[id]) save();
}

// ---------------------------------------------------------------- population
// A deterministic simulated player base so the leaderboard, percentiles and
// Apex (top-100 only) have something real to compare against.
const NAME_A = ['Night', 'Iron', 'Silent', 'Red', 'Ghost', 'Rapid', 'Lone', 'Sand', 'Cold', 'Neon', 'Grim', 'Wild', 'Lucky', 'Zero', 'Echo', 'Storm', 'Frost', 'Hex', 'Nova', 'Dust'];
const NAME_B = ['wolf', 'shot', 'fox', 'line', 'byte', 'hawk', 'blade', 'run', 'core', 'mark', 'drift', 'pulse', 'viper', 'kite', 'flare', 'step', 'grain', 'crow', 'atlas', 'jinx'];
let population = null;
export function getPopulation() {
  if (population) return population;
  const day = Math.floor(Date.now() / 86400000);
  const r = rng(1234567);
  const drift = rng(day);
  population = [];
  for (let i = 0; i < 4000; i++) {
    // skewed normal: most players around Silver/Gold, a thin tail at the top
    const n = (r() + r() + r() + r() - 2) / 2; // ≈ N(0, 0.41)
    let mmr = 1450 + n * 1050 + (r() < 0.02 ? r() * 900 : 0);
    mmr += (drift() - 0.5) * 60;
    mmr = Math.max(250, Math.min(3600, mmr));
    population.push({ name: NAME_A[Math.floor(r() * NAME_A.length)] + NAME_B[Math.floor(r() * NAME_B.length)] + (r() < 0.5 ? Math.floor(r() * 99) : ''), mmr, wins: Math.floor(40 + r() * 600) });
  }
  population.sort((a, b) => b.mmr - a.mmr);
  population.forEach((p, i) => { p.rank = displayRankFor(p.mmr, i); });
  return population;
}
function displayRankFor(mmr, position) {
  let idx = mmrToRankIndex(mmr);
  if (idx === TOP && position >= TIERS.at(-1).topN) idx = TOP - 1;
  return idx;
}

export function leaderboardPosition(mmr) {
  const pop = getPopulation();
  let lo = 0; while (lo < pop.length && pop[lo].mmr > mmr) lo++;
  return { position: lo + 1, total: pop.length + 1, percentile: 1 - lo / pop.length };
}

export function distribution() {
  const pop = getPopulation();
  const counts = TIERS.map(() => 0);
  for (const p of pop) counts[RANKS[p.rank].tier]++;
  return counts.map(c => c / pop.length);
}

// ---------------------------------------------------------------- matchmaking
// Opponent and teammate skills for the next ranked match.
export function matchSkills(id) {
  const L = ladder(id);
  // during placements the system probes: start mid, then follow MMR
  const base = skillForMMR(L.mmr);
  const r = Math.random;
  return {
    enemy: () => Math.max(0.03, Math.min(1, base + (r() - 0.45) * 0.1)),
    ally: () => Math.max(0.03, Math.min(1, base - 0.04 + (r() - 0.5) * 0.08)),
    rating: L.mmr,
  };
}

export function canQueue(id) {
  const L = ladder(id);
  if (!L) return { ok: true };
  if (Date.now() < L.cooldownUntil) return { ok: false, reason: `Leave penalty: ${Math.ceil((L.cooldownUntil - Date.now()) / 60000)} min remaining` };
  return { ok: true };
}

// ---------------------------------------------------------------- results
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Applies a finished ranked match. Returns a summary for the results screen.
// result: { won, abandoned, stats:{kills,deaths,assists,damage}, rounds, teamAvgKills }
export function recordMatch(id, result) {
  const out = applyMatch(store[id], result, (mmr) => leaderboardPosition(mmr).position);
  save();
  return out;
}

// Pure ladder update (also used by the server). position(mmr) → leaderboard place.
export function applyMatch(L, result, position) {
  const before = { rank: L.rank, rp: L.rp };
  const S = result.won ? 1 : 0;
  // expected score vs the opposition rating we were matched against
  const opp = result.oppRating ?? L.mmr;
  const E = 1 / (1 + Math.pow(10, (opp - L.mmr) / 400));
  const K = 18 + L.rd / 9;
  // individual performance nudges MMR a little (impact relative to team)
  const kpr = result.stats.kills / Math.max(1, result.rounds);
  const adr = result.stats.damage / Math.max(1, result.rounds);
  const perf = clamp((adr - 75) / 60 + (kpr - 0.7) * 0.8, -1, 1);
  let dMMR = K * (S - E) + perf * 5;
  if (result.abandoned) dMMR = -Math.abs(K) * 1.2;
  L.mmr = clamp(L.mmr + dMMR, 100, 3800);
  L.rd = Math.max(60, L.rd * 0.9);
  L.lastPlayed = Date.now(); L.decayApplied = false;
  if (S) { L.wins++; L.streak = Math.max(1, L.streak + 1); } else { L.losses++; L.streak = Math.min(-1, L.streak - 1); }
  if (result.abandoned) { L.abandons++; L.cooldownUntil = Date.now() + 10 * 60000 * Math.min(6, L.abandons); }

  const out = { won: !!S, abandoned: !!result.abandoned, mmrDelta: Math.round(dMMR), events: [] };

  // ----- placements
  if (L.rank == null) {
    L.placements++;
    out.placement = { done: L.placements, of: PLACEMENTS };
    if (L.placements >= PLACEMENTS) {
      L.rank = Math.min(PLACEMENT_CAP, Math.max(0, mmrToRankIndex(L.mmr) - 2));
      L.rp = 50; L.shield = 3;
      L.peak = L.rank;
      out.events.push({ type: 'placed', rank: L.rank });
    }
    L.history.unshift({ t: Date.now(), won: !!S, rp: null, rank: L.rank, k: result.stats.kills, d: result.stats.deaths, placement: true });
    L.history = L.history.slice(0, 50);
    return { ...out, before, after: { rank: L.rank, rp: L.rp } };
  }

  // ----- promotion series in progress
  if (L.series) {
    if (S) L.series.wins++; else L.series.losses++;
    const need = Math.ceil(L.series.max / 2);
    if (L.series.wins >= need) {
      L.rank++; L.rp = 10; L.series = null; L.shield = 3;
      out.events.push({ type: 'promoted', rank: L.rank, tier: true });
    } else if (L.series.losses > L.series.max - need) {
      L.series = null; L.rp = 70;
      out.events.push({ type: 'seriesFailed' });
    } else out.events.push({ type: 'series', series: { ...L.series } });
    out.rpDelta = 0;
  } else {
    // ----- normal RP change
    const tier = TIERS[RANKS[L.rank].tier];
    // pull toward the rank the hidden MMR says we belong in
    const gap = (mmrToRankIndex(L.mmr) - L.rank) + (L.mmr - rankFloorMMR(mmrToRankIndex(L.mmr))) / 100 - L.rp / 100;
    let delta;
    if (S) {
      delta = 20 + clamp(gap * 5, -12, 14);
      if (L.streak >= 3) delta += Math.min(9, (L.streak - 2) * 3);
      delta += perf * 3;
      delta *= tier.gain;
    } else {
      delta = -(20 - clamp(gap * 5, -14, 10));
      delta -= Math.max(0, -perf) * 2 - Math.max(0, perf) * 3; // good games in a loss lose less
      delta *= tier.loss;
      if (result.abandoned) delta *= 1.6;
    }
    delta = Math.round(clamp(delta, S ? 5 : -45, S ? 45 : -5));
    out.rpDelta = delta;
    L.rp += delta;

    // promotion
    while (L.rp >= 100 && L.rank < TOP) {
      const next = RANKS[L.rank + 1];
      const crossingTier = next.tier !== RANKS[L.rank].tier;
      const nt = TIERS[next.tier];
      if (crossingTier && nt.series) {
        if (nt.topN && position(L.mmr) > nt.topN) { L.rp = 100; out.events.push({ type: 'apexLocked' }); break; }
        L.rp = 100;
        L.series = { max: nt.series, wins: 0, losses: 0, target: L.rank + 1 };
        out.events.push({ type: 'seriesStart', series: { ...L.series } });
        break;
      }
      L.rp -= 100; L.rank++;
      // new tier: 3-loss shield; new division: one loss of grace
      L.shield = crossingTier ? 3 : Math.max(L.shield, 1);
      out.events.push({ type: 'promoted', rank: L.rank, tier: crossingTier });
    }
    if (L.rank === TOP) L.rp = Math.min(L.rp, 999);
    else L.rp = Math.min(L.rp, 100);

    // demotion
    if (L.rp < 0) {
      if (L.shield > 0) { L.rp = 0; out.events.push({ type: 'shielded', left: L.shield - 1 }); }
      else if (L.rank > 0) {
        const crossingTier = RANKS[L.rank - 1].tier !== RANKS[L.rank].tier;
        L.rank--; L.rp = 75;
        out.events.push({ type: 'demoted', rank: L.rank, tier: crossingTier });
      } else L.rp = 0;
    }
    if (L.shield > 0 && !S) L.shield--;
  }
  L.peak = Math.max(L.peak ?? 0, L.rank);
  L.history.unshift({ t: Date.now(), won: !!S, rp: out.rpDelta ?? 0, rank: L.rank, k: result.stats.kills, d: result.stats.deaths, abandoned: !!result.abandoned });
  L.history = L.history.slice(0, 50);
  return { ...out, before, after: { rank: L.rank, rp: L.rp } };
}

// ---------------------------------------------------------------- emblems
const emblemCache = new Map();
// Draws a rank emblem: tier shape + metal colour, chevrons for the subrank.
export function rankEmblem(index, size = 128) {
  const key = index + ':' + size;
  if (emblemCache.has(key)) return emblemCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const S = size / 128;
  x.scale(S, S); x.translate(64, 64);
  if (index == null) {
    x.strokeStyle = '#5f5c55'; x.lineWidth = 4; x.setLineDash([6, 6]);
    x.beginPath(); x.arc(0, 0, 44, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]); x.fillStyle = '#8d897f'; x.font = '700 40px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 0, 2);
  } else {
    const r = RANKS[index], t = TIERS[r.tier];
    const metal = (y0, y1) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, t.color); g.addColorStop(1, '#141414'); return g; };
    const sides = [6, 6, 6, 8, 8, 5, 7, 4, 10][r.tier];
    // wings for the top tiers
    if (r.tier >= 6) {
      x.fillStyle = metal(-40, 40);
      for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 30, -10); x.lineTo(s * 62, -30); x.lineTo(s * 54, 0); x.lineTo(s * 62, 20); x.lineTo(s * 30, 18); x.closePath(); x.fill(); }
    }
    // body
    x.beginPath();
    for (let i = 0; i < sides; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / sides; const rr = r.tier === 8 && i % 2 ? 30 : 44; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    x.closePath();
    x.fillStyle = metal(-44, 44); x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.stroke();
    // inner field
    x.beginPath(); x.arc(0, 0, 28, 0, Math.PI * 2); x.fillStyle = '#121211'; x.fill();
    x.lineWidth = 2; x.strokeStyle = t.color; x.stroke();
    // subrank chevrons (more chevrons = higher within tier)
    const level = t.subs - r.sub + 1;
    x.strokeStyle = t.color; x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round';
    for (let i = 0; i < level; i++) {
      const y = 10 - i * 9 - (level - 1) * -4;
      x.beginPath(); x.moveTo(-13, y); x.lineTo(0, y - 8); x.lineTo(13, y); x.stroke();
    }
    if (r.tier === 8) { x.fillStyle = t.color; x.font = '700 20px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('★', 0, 1); }
  }
  const url = c.toDataURL();
  emblemCache.set(key, url);
  return url;
}

export function rankName(index) { return index == null ? 'Unranked' : RANKS[index].name; }
