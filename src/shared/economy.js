// Inventory/economy rules shared by the offline profile and the server.
// Every action takes a profile state object and mutates it in place,
// returning { error } or a result.
import { SKINS, STICKERS, CASES, RARITIES, RARITY, KEY_PRICE, STICKER_CAPSULE, condition, itemDef } from '../items/catalog.js';

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

export function freshProfile(name = 'You') {
  return {
    name, credits: 2500, xp: 0,
    items: [
      { uid: uid(), kind: 'case', defId: 'dunehold', acquired: Date.now() },
      { uid: uid(), kind: 'case', defId: 'voltage', acquired: Date.now() },
      { uid: uid(), kind: 'case', defId: 'capsule', acquired: Date.now() },
    ],
    equipped: {},
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, casesOpened: 0 },
    history: [],
  };
}

export const findItem = (state, id) => state.items.find(i => i.uid === id);

// Brings an older saved profile up to date: retired knife types become a
// close relative with the same finish, and items with no definition are dropped.
const RETIRED = { 'knife:cleaver:': 'knife:bowie:' };
export function migrateProfile(state) {
  if (!state?.items) return false;
  let changed = false;
  for (const it of state.items) {
    if (it.kind !== 'skin' || typeof it.defId !== 'string') continue;
    for (const [from, to] of Object.entries(RETIRED)) if (it.defId.startsWith(from)) { it.defId = to + it.defId.slice(from.length); changed = true; }
  }
  const keep = state.items.filter(it => itemDef(it));
  if (keep.length !== state.items.length) { state.items = keep; changed = true; }
  for (const [slot, id] of Object.entries(state.equipped || {})) if (!state.items.some(i => i.uid === id)) { delete state.equipped[slot]; changed = true; }
  return changed;
}

// ---------------------------------------------------------------- pricing
const COND_MULT = { FN: 1.65, MW: 1.2, FT: 1.0, WW: 0.82, BS: 0.72 };

// Reference price (used for quick-sell and when there is no market history).
export function marketPrice(item) {
  const d = itemDef(item);
  if (!d) return 0;
  if (item.kind === 'case') return d.price;
  if (item.kind === 'sticker') return d.basePrice;
  let p = d.basePrice * COND_MULT[condition(item.float).id];
  if (item.float < 0.01) p *= 1.4;
  if (d.finish?.type === 'tempered') p *= 1 + Math.max(0, (((item.seed * 13 + (d.seedOffset || 0)) * 7919) % 1000) / 1000 - 0.6) * 6;
  if (d.finish?.type === 'gradient' && item.seed % 1000 > 900) p *= 1.6;
  if (item.tally != null) p *= 1.35;
  for (const s of item.stickers || []) p += (STICKERS[s.defId]?.basePrice || 0) * 0.12 * (1 - (s.wear || 0));
  return Math.max(1, Math.round(p));
}
export const QUICK_SELL = 0.87;

// ---------------------------------------------------------------- creation
export function makeSkin(defId, r = Math.random) {
  const d = SKINS[defId];
  const [lo, hi] = d.floatRange;
  return {
    uid: uid(), kind: 'skin', defId, float: +(lo + r() * (hi - lo)).toFixed(9), seed: Math.floor(r() * 1000),
    tally: r() < 0.1 ? 0 : null, stickers: [], acquired: Date.now(),
  };
}
export function makeSticker(defId) { return { uid: uid(), kind: 'sticker', defId, acquired: Date.now() }; }
export function makeCase(defId) { return { uid: uid(), kind: 'case', defId, acquired: Date.now() }; }

const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

export function rollCase(caseId, r = Math.random) {
  if (caseId === 'capsule') {
    const roll = r();
    const fin = roll < 0.8 ? 'paper' : roll < 0.95 ? 'holo' : roll < 0.99 ? 'foil' : 'gold';
    return makeSticker(pick(Object.values(STICKERS).filter(s => s.finishType === fin), r).id);
  }
  const c = CASES[caseId];
  const roll = r();
  let tier = RARITIES[0].id, acc = 0;
  for (const rr of [...RARITIES].reverse()) { acc += rr.odds; if (roll < acc) { tier = rr.id; break; } }
  if (tier === 'legendary') {
    const type = pick(c.knives, r);
    return makeSkin(pick(Object.values(SKINS).filter(s => s.knife === type), r).id, r);
  }
  let pool = c.skins.filter(id => SKINS[id].rarity === tier);
  for (let t = RARITY[tier].tier; !pool.length && t >= 0; t--) pool = c.skins.filter(id => RARITY[SKINS[id].rarity].tier === t);
  return makeSkin(pick(pool, r), r);
}

export function caseContents(caseId) {
  if (caseId === 'capsule') return [];
  return CASES[caseId].skins.map(id => SKINS[id]).sort((a, b) => RARITY[b.rarity].tier - RARITY[a.rarity].tier);
}

function unequip(state, itemUid) { for (const [k, v] of Object.entries(state.equipped)) if (v === itemUid) delete state.equipped[k]; }
export function removeItem(state, itemUid) { state.items = state.items.filter(i => i.uid !== itemUid); unequip(state, itemUid); }

// ---------------------------------------------------------------- actions
export function openCase(state, caseUid, r = Math.random) {
  const c = findItem(state, caseUid);
  if (!c || c.kind !== 'case') return { error: 'Case not found' };
  if (c.listed) return { error: 'Item is listed on the market' };
  const cost = c.defId === 'capsule' ? 0 : KEY_PRICE;
  if (state.credits < cost) return { error: `You need ${cost} credits for a key` };
  state.credits -= cost;
  removeItem(state, caseUid);
  const won = rollCase(c.defId, r);
  state.items.push(won);
  state.stats.casesOpened++;
  state.history.unshift({ t: Date.now(), type: 'unbox', item: won.defId, from: c.defId });
  state.history = state.history.slice(0, 100);
  return { item: won, cost };
}

export function buyCase(state, caseId) {
  const price = caseId === 'capsule' ? STICKER_CAPSULE.price : CASES[caseId]?.price;
  if (price == null) return { error: 'Unknown case' };
  if (state.credits < price) return { error: 'Not enough credits' };
  state.credits -= price;
  const item = makeCase(caseId);
  state.items.push(item);
  return { item };
}

export function quickSell(state, itemUid) {
  const it = findItem(state, itemUid);
  if (!it) return { error: 'Item not found' };
  if (it.listed) return { error: 'Cancel the market listing first' };
  const value = Math.floor(marketPrice(it) * QUICK_SELL);
  state.credits += value;
  removeItem(state, itemUid);
  state.history.unshift({ t: Date.now(), type: 'sell', item: it.defId, value });
  return { value };
}

export function equip(state, itemUid) {
  const it = findItem(state, itemUid);
  if (!it || it.kind !== 'skin') return { error: 'Not equippable' };
  const d = SKINS[it.defId];
  const slot = d.knife ? 'knife' : d.weapon;
  if (state.equipped[slot] === itemUid) delete state.equipped[slot]; else state.equipped[slot] = itemUid;
  return { ok: true };
}

export function applySticker(state, skinUid, stickerUid, slot) {
  const sk = findItem(state, skinUid), st = findItem(state, stickerUid);
  if (!sk || !st || sk.kind !== 'skin' || st.kind !== 'sticker') return { error: 'Invalid' };
  if (sk.listed || st.listed) return { error: 'Item is listed on the market' };
  if (SKINS[sk.defId].knife) return { error: 'Knives cannot hold stickers' };
  if (!(slot >= 0 && slot < 4) || sk.stickers.some(s => s.slot === slot)) return { error: 'Slot taken' };
  sk.stickers.push({ defId: st.defId, wear: 0, slot });
  removeItem(state, stickerUid);
  return { ok: true };
}

export function scrapeSticker(state, skinUid, slot) {
  const sk = findItem(state, skinUid);
  const s = sk?.stickers.find(x => x.slot === slot);
  if (!s) return { error: 'No sticker' };
  s.wear = +Math.min(1, (s.wear || 0) + 0.12).toFixed(2);
  if (s.wear >= 1) sk.stickers = sk.stickers.filter(x => x !== s);
  return { ok: true };
}

// Credits, xp, tally counters and drops after a match.
export function awardMatch(state, result, r = Math.random) {
  const s = result.stats;
  const roundsWon = result.score?.[result.team] ?? 0;
  let credits = (result.won ? 450 : 180) + s.kills * 35 + s.assists * 15 + roundsWon * 20;
  credits = Math.round(credits * (result.teamSize >= 5 ? 1 : 0.6 + result.teamSize * 0.08));
  state.credits += credits;
  state.xp += 100 + s.kills * 20 + (result.won ? 150 : 0);
  state.stats.matches++; if (result.won) state.stats.wins++;
  state.stats.kills += s.kills; state.stats.deaths += s.deaths;
  for (const [w, k] of Object.entries(result.weaponKills || {})) {
    const it = findItem(state, state.equipped[w]);
    if (it && it.tally != null) it.tally += k;
  }
  const drops = [];
  if (r() < (result.won ? 0.65 : 0.4)) { const ids = Object.keys(CASES); const it = makeCase(pick(ids, r)); state.items.push(it); drops.push(it); }
  if (r() < 0.25) { const it = makeCase('capsule'); state.items.push(it); drops.push(it); }
  return { credits, drops };
}

export function level(state) {
  const lv = Math.floor(Math.sqrt(state.xp / 400)) + 1;
  const cur = (lv - 1) ** 2 * 400, next = lv ** 2 * 400;
  return { level: lv, progress: (state.xp - cur) / (next - cur) };
}

export { KEY_PRICE };
