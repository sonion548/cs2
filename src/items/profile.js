// Player profile facade. Offline it keeps credits and inventory in
// localStorage; once signed in, the server owns the profile and every action
// is an RPC whose response carries the updated profile.
import * as E from '../shared/economy.js';
import { net } from '../net/client.js';

const KEY = 'vantage.profile.v1';
const listeners = new Set();

let local = loadLocal();
let remote = null; // server copy when signed in

function loadLocal() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && Array.isArray(p.items)) { const f = E.freshProfile(); const out = { ...f, ...p, stats: { ...f.stats, ...p.stats } }; E.migrateProfile(out); return out; }
  } catch { /* storage unavailable or corrupt */ }
  return E.freshProfile();
}
function emit() { for (const fn of listeners) fn(getProfile()); }
export function save() {
  if (!remote) { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* ignore */ } }
  emit();
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getProfile() { return remote || local; }
export function isOnline() { return !!remote; }
export function setRemote(profile) { remote = profile; emit(); }
export function findItem(id) { return E.findItem(getProfile(), id); }
export function equippedFor(slot) { const id = getProfile().equipped[slot]; return id ? findItem(id) || null : null; }
export const marketPrice = E.marketPrice;
export const makeSkin = E.makeSkin;
export const makeSticker = E.makeSticker;
export const rollCase = E.rollCase;
export const caseContents = E.caseContents;
export function level() { return E.level(getProfile()); }

// Runs an action locally, or on the server when signed in.
async function act(type, args, localFn) {
  if (remote) {
    const res = await net.rpc(type, args);
    if (res.profile) { remote = res.profile; emit(); }
    return res;
  }
  const res = localFn();
  save();
  return res;
}

export const openCase = (caseUid) => act('inv.openCase', { uid: caseUid }, () => E.openCase(local, caseUid));
export const buyCase = (caseId) => act('inv.buyCase', { caseId }, () => E.buyCase(local, caseId));
export const sellItem = (itemUid) => act('inv.quickSell', { uid: itemUid }, () => E.quickSell(local, itemUid));
export const equip = (itemUid) => act('inv.equip', { uid: itemUid }, () => E.equip(local, itemUid));
export const applySticker = (skinUid, stickerUid, slot) => act('inv.applySticker', { skinUid, stickerUid, slot }, () => E.applySticker(local, skinUid, stickerUid, slot));
export const scrapeSticker = (skinUid, slot) => act('inv.scrape', { uid: skinUid, slot }, () => E.scrapeSticker(local, skinUid, slot));
export const setName = (n) => act('profile.rename', { name: n }, () => { local.name = n.slice(0, 16) || 'You'; return { ok: true }; });
// Match rewards. Signed in, the reward is the server's to give; if the
// connection dropped during the match (a network blip, a sleeping free-tier
// server waking up), the reward used to be lost. Now it waits up to 20 s for
// the connection, and failing that is kept (with an id, so it can never be
// paid twice) and sent as soon as the account is back online.
const PENDING_KEY = 'vantage.pendingAwards';
const pendingAwards = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; } };
const savePending = (list) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-20))); } catch { /* private mode */ } };
const offline = (res) => res?.error && /connect|disconnect|unreachable|too soon/i.test(res.error);
export async function awardMatch(result) {
  if (!remote) { const res = E.awardMatch(local, result); save(); return res; }
  const id = E.uid();
  for (let i = 0; i < 10 && net.status !== 'online'; i++) await new Promise(r => setTimeout(r, 2000));
  const res = await net.rpc('match.award', { result, id });
  if (res.profile) { remote = res.profile; emit(); }
  if (!offline(res)) return res;
  savePending([...pendingAwards(), { id, result, user: net.user?.id || null, t: Date.now() }]);
  // what it will pay, for the result screen (the server decides the drops)
  const preview = E.awardMatch({ credits: 0, xp: 0, items: [], equipped: {}, stats: { matches: 0, wins: 0, kills: 0, deaths: 0 } }, result, () => 1);
  return { credits: preview.credits, drops: [], note: 'Saved: it will be added to your account as soon as you are back online.' };
}
export async function flushPendingAwards() {
  if (!remote || net.status !== 'online') return;
  const left = [];
  for (const p of pendingAwards()) {
    if (p.user && net.user?.id && p.user !== net.user.id) { left.push(p); continue; }
    const res = await net.rpc('match.award', { result: p.result, id: p.id });
    if (res.profile) { remote = res.profile; emit(); }
    if (offline(res)) left.push(p);
  }
  savePending(left);
}
export function resetProfile() { if (!remote) { local = E.freshProfile(); save(); } }
