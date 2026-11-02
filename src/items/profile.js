// Local player profile: credits, inventory, equipped items, case opening and
// match rewards. Persisted in localStorage (a server-backed version comes with
// the market/trading stage).
import { SKINS, STICKERS, CASES, RARITIES, RARITY, KEY_PRICE, STICKER_CAPSULE, condition, itemDef } from './catalog.js';

const KEY = 'vantage.profile.v1';
const listeners = new Set();

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function fresh() {
  return {
    name: 'You', credits: 2500, xp: 0,
    items: [
      { uid: uid(), kind: 'case', defId: 'dunehold', acquired: Date.now() },
      { uid: uid(), kind: 'case', defId: 'voltage', acquired: Date.now() },
      { uid: uid(), kind: 'case', defId: 'capsule', acquired: Date.now() },
    ],
    equipped: {},       // weapon id (e.g. 'ak47', 'knife') -> item uid
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, casesOpened: 0 },
    history: [],
  };
}

let profile = load();

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && Array.isArray(p.items)) return { ...fresh(), ...p, stats: { ...fresh().stats, ...p.stats } };
  } catch { /* storage unavailable or corrupt */ }
  return fresh();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ }
  for (const fn of listeners) fn(profile);
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getProfile() { return profile; }
export function resetProfile() { profile = fresh(); save(); }

export function findItem(id) { return profile.items.find(i => i.uid === id); }

// ---------------------------------------------------------------- pricing
function hash(n) { n = Math.imul(n ^ (n >>> 16), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

const COND_MULT = { FN: 1.65, MW: 1.2, FT: 1.0, WW: 0.82, BS: 0.72 };

export function marketPrice(item) {
  const d = itemDef(item);
  if (!d) return 0;
  if (item.kind === 'case') return d.price;
  if (item.kind === 'sticker') return d.basePrice;
  let p = d.basePrice * COND_MULT[condition(item.float).id];
  if (item.float < 0.01) p *= 1.4;                         // ultra-low float premium
  if (d.finish?.type === 'tempered') p *= 1 + Math.max(0, (((item.seed * 13 + (d.seedOffset || 0)) * 7919) % 1000) / 1000 - 0.6) * 6; // high-blue seeds
  if (d.finish?.type === 'gradient' && item.seed % 1000 > 900) p *= 1.6;   // full-gradient seeds
  if (item.tally != null) p *= 1.35;
  for (const s of item.stickers || []) p += (STICKERS[s.defId]?.basePrice || 0) * 0.12 * (1 - (s.wear || 0));
  return Math.max(1, Math.round(p));
}

// ---------------------------------------------------------------- creation
export function makeSkin(defId, r = Math.random) {
  const d = SKINS[defId];
  const [lo, hi] = d.floatRange;
  const f = lo + r() * (hi - lo);
  return {
    uid: uid(), kind: 'skin', defId, float: +f.toFixed(9), seed: Math.floor(r() * 1000),
    tally: !d.knife && r() < 0.1 ? 0 : (d.knife && r() < 0.1 ? 0 : null),
    stickers: [], acquired: Date.now(),
  };
}

export function makeSticker(defId) { return { uid: uid(), kind: 'sticker', defId, acquired: Date.now() }; }

function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }

// Rolls the result of opening a case (does not modify the profile).
export function rollCase(caseId, r = Math.random) {
  if (caseId === 'capsule') {
    const roll = r();
    const fin = roll < 0.8 ? 'paper' : roll < 0.95 ? 'holo' : roll < 0.99 ? 'foil' : 'gold';
    const pool = Object.values(STICKERS).filter(s => s.finishType === fin);
    return makeSticker(pick(pool, r).id);
  }
  const c = CASES[caseId];
  let roll = r(), tier = RARITIES[0].id;
  // walk from rarest to commonest
  let acc = 0;
  for (const rr of [...RARITIES].reverse()) { acc += rr.odds; if (roll < acc) { tier = rr.id; break; } }
  if (tier === 'legendary') {
    const type = pick(c.knives, r);
    const pool = Object.values(SKINS).filter(s => s.knife === type);
    return makeSkin(pick(pool, r).id, r);
  }
  let pool = c.skins.filter(id => SKINS[id].rarity === tier);
  // fall back toward commoner tiers if a case lacks this tier
  for (let t = RARITY[tier].tier; !pool.length && t >= 0; t--) pool = c.skins.filter(id => RARITY[SKINS[id].rarity].tier === t);
  return makeSkin(pick(pool, r), r);
}

export function caseContents(caseId) {
  if (caseId === 'capsule') return [];
  const c = CASES[caseId];
  return c.skins.map(id => SKINS[id]).sort((a, b) => RARITY[b.rarity].tier - RARITY[a.rarity].tier);
}

// ---------------------------------------------------------------- actions
export function canAfford(n) { return profile.credits >= n; }

export function openCase(caseUid) {
  const c = findItem(caseUid);
  if (!c || c.kind !== 'case') return { error: 'Case not found' };
  const cost = c.defId === 'capsule' ? 0 : KEY_PRICE;
  if (!canAfford(cost)) return { error: `You need ${cost} credits for a key` };
  profile.credits -= cost;
  profile.items = profile.items.filter(i => i !== c);
  const won = rollCase(c.defId);
  profile.items.push(won);
  profile.stats.casesOpened++;
  profile.history.unshift({ t: Date.now(), type: 'unbox', item: won.defId, from: c.defId });
  save();
  return { item: won, cost };
}

export function buyCase(caseId) {
  const price = caseId === 'capsule' ? STICKER_CAPSULE.price : CASES[caseId].price;
  if (!canAfford(price)) return { error: 'Not enough credits' };
  profile.credits -= price;
  const item = { uid: uid(), kind: 'case', defId: caseId, acquired: Date.now() };
  profile.items.push(item);
  save();
  return { item };
}

export function sellItem(itemUid) {
  const it = findItem(itemUid);
  if (!it) return { error: 'Item not found' };
  const value = Math.floor(marketPrice(it) * 0.87); // quick-sell fee
  profile.credits += value;
  profile.items = profile.items.filter(i => i !== it);
  for (const [k, v] of Object.entries(profile.equipped)) if (v === itemUid) delete profile.equipped[k];
  profile.history.unshift({ t: Date.now(), type: 'sell', item: it.defId, value });
  save();
  return { value };
}

export function equip(itemUid) {
  const it = findItem(itemUid);
  if (!it || it.kind !== 'skin') return;
  const d = SKINS[it.defId];
  const slot = d.knife ? 'knife' : d.weapon;
  if (profile.equipped[slot] === itemUid) delete profile.equipped[slot];
  else profile.equipped[slot] = itemUid;
  save();
}

export function equippedFor(slot) {
  const id = profile.equipped[slot];
  return id ? findItem(id) || null : null;
}

export function applySticker(skinUid, stickerUid, slot) {
  const sk = findItem(skinUid), st = findItem(stickerUid);
  if (!sk || !st || sk.kind !== 'skin' || st.kind !== 'sticker') return { error: 'Invalid' };
  if (SKINS[sk.defId].knife) return { error: 'Knives cannot hold stickers' };
  if (sk.stickers.some(s => s.slot === slot)) return { error: 'Slot taken' };
  sk.stickers.push({ defId: st.defId, wear: 0, slot });
  profile.items = profile.items.filter(i => i !== st);
  save();
  return { ok: true };
}

export function scrapeSticker(skinUid, slot) {
  const sk = findItem(skinUid);
  const s = sk?.stickers.find(x => x.slot === slot);
  if (!s) return;
  s.wear = +(Math.min(1, (s.wear || 0) + 0.12)).toFixed(2);
  if (s.wear >= 1) sk.stickers = sk.stickers.filter(x => x !== s);
  save();
}

export function setName(n) { profile.name = n.slice(0, 16) || 'You'; save(); }

// Credits/xp/drops after a match. Returns a summary for the results screen.
export function awardMatch(result) {
  const s = result.stats;
  const roundsWon = result.score[result.team];
  let credits = (result.won ? 450 : 180) + s.kills * 35 + s.assists * 15 + roundsWon * 20;
  credits = Math.round(credits * (result.teamSize >= 5 ? 1 : 0.6 + result.teamSize * 0.08));
  profile.credits += credits;
  profile.xp += 100 + s.kills * 20 + (result.won ? 150 : 0);
  profile.stats.matches++; if (result.won) profile.stats.wins++;
  profile.stats.kills += s.kills; profile.stats.deaths += s.deaths;
  // tally counters on equipped weapons
  for (const [w, k] of Object.entries(result.weaponKills || {})) {
    const it = equippedFor(w);
    if (it && it.tally != null) it.tally += k;
  }
  const drops = [];
  if (Math.random() < (result.won ? 0.65 : 0.4)) {
    const ids = Object.keys(CASES);
    const item = { uid: uid(), kind: 'case', defId: ids[Math.floor(Math.random() * ids.length)], acquired: Date.now() };
    profile.items.push(item); drops.push(item);
  }
  if (Math.random() < 0.25) {
    const item = { uid: uid(), kind: 'case', defId: 'capsule', acquired: Date.now() };
    profile.items.push(item); drops.push(item);
  }
  save();
  return { credits, drops };
}

export function level() {
  const lv = Math.floor(Math.sqrt(profile.xp / 400)) + 1;
  const cur = (lv - 1) ** 2 * 400, next = lv ** 2 * 400;
  return { level: lv, progress: (profile.xp - cur) / (next - cur) };
}
