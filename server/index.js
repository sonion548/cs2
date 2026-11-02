// Vantage game server: accounts, server-owned inventories, market, trading,
// friends, parties, matchmaking and match relay. Serves the built client from
// dist/ and speaks JSON over a WebSocket at /ws.
//
//   npm run build && npm run server        (PORT=8080 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openDb } from './db.js';
import * as E from '../src/shared/economy.js';
import { SKINS, STICKERS, itemDef, condition } from '../src/items/catalog.js';
import { freshLadder, applyMatch, applyDecay, mmrToRankIndex, skillForMMR, RANKS, TIERS, LADDERS } from '../src/ranked.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = +process.env.PORT || 8080;
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json');
const db = openDb(DB_FILE);
const D = db.data;
const MARKET_FEE = 0.1;

// ================================================================ helpers
const now = () => Date.now();
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw, rec) {
  const h = crypto.scryptSync(pw, rec.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(rec.hash, 'hex'));
}
const userByName = (n) => Object.values(D.users).find(u => u.nameLower === n.toLowerCase());
const ladderIds = Object.keys(LADDERS);

function ensureUser(u) {
  u.ladders ||= {};
  for (const id of ladderIds) u.ladders[id] ||= freshLadder();
  u.friends ||= []; u.friendReq ||= []; u.tokens ||= [];
  return u;
}

// Public profile (what the client renders).
function profileOf(u) {
  return {
    name: u.name, credits: u.credits, xp: u.xp, items: u.items, equipped: u.equipped, stats: u.stats,
    history: u.history.slice(0, 60), ladders: u.ladders, id: u.id,
  };
}

// ================================================================ connections
const sockets = new Map();   // userId -> Set<ws>
function send(ws, ev, data) { if (ws.readyState === 1) ws.send(JSON.stringify({ ev, data })); }
function push(userId, ev, data) { for (const ws of sockets.get(userId) || []) send(ws, ev, data); }
const online = (id) => (sockets.get(id)?.size || 0) > 0;

function presence(id) {
  if (!online(id)) return 'offline';
  if (roomOf.get(id)) return 'in-match';
  if (queueOf(id)) return 'searching';
  return 'online';
}
function friendList(u) {
  return {
    friends: u.friends.map(fid => D.users[fid]).filter(Boolean).map(f => ({ id: f.id, name: f.name, status: presence(f.id), party: partyOf.get(f.id)?.id || null })),
    requests: u.friendReq.map(fid => D.users[fid]).filter(Boolean).map(f => ({ id: f.id, name: f.name })),
  };
}
function notifyFriends(u) { for (const fid of u.friends) if (online(fid)) push(fid, 'social', friendList(D.users[fid])); }

// ================================================================ parties
const parties = new Map();   // partyId -> { id, leader, members: [userId], invites: Set }
const partyOf = new Map();   // userId -> party
function partyState(p) {
  return p ? { id: p.id, leader: p.leader, members: p.members.map(id => ({ id, name: D.users[id].name, status: presence(id) })) } : null;
}
function broadcastParty(p) { for (const id of p.members) push(id, 'party', partyState(p)); }
function leaveParty(userId) {
  const p = partyOf.get(userId);
  if (!p) return;
  cancelQueue(userId);
  p.members = p.members.filter(m => m !== userId);
  partyOf.delete(userId);
  push(userId, 'party', null);
  if (!p.members.length) { parties.delete(p.id); return; }
  if (p.leader === userId) p.leader = p.members[0];
  if (p.members.length === 1) { const last = p.members[0]; partyOf.delete(last); parties.delete(p.id); push(last, 'party', null); return; }
  broadcastParty(p);
}
const groupOf = (userId) => partyOf.get(userId)?.members || [userId];

// ================================================================ matchmaking
// Queue entry: { key, members, mode, size, mmr, since }
//   mode 'casual'      — mixes humans, fills with bots after a short wait
//   mode 'ranked-bots' — the group plays together against bots (starts at once)
//   mode 'ranked-pvp'  — humans only, teams balanced by rating
const queue = [];
const roomOf = new Map();    // userId -> room
const rooms = new Map();
const queueOf = (userId) => queue.find(q => q.members.includes(userId));
function cancelQueue(userId) {
  const q = queueOf(userId);
  if (!q) return;
  queue.splice(queue.indexOf(q), 1);
  for (const m of q.members) push(m, 'mm', { state: 'idle' });
}
function ladderKey(mode, size) { return mode === 'ranked-pvp' ? (size === 5 ? 'pvp5' : 'pvp2') : (size === 5 ? '5v5' : '2v2'); }
function groupMMR(members, key) {
  return members.reduce((s, id) => s + D.users[id].ladders[key].mmr, 0) / members.length;
}

function tryMatch() {
  // ranked vs bots: immediate
  for (const q of [...queue]) {
    if (q.mode !== 'ranked-bots') continue;
    queue.splice(queue.indexOf(q), 1);
    startRoom({ mode: q.mode, size: q.size, teams: { A: q.members, B: [] }, ladder: ladderKey(q.mode, q.size), rating: q.mmr });
  }
  // casual + pvp: group compatible entries
  for (const mode of ['casual', 'ranked-pvp']) {
    for (const size of [5, 2]) {
      const pool = queue.filter(q => q.mode === mode && q.size === size).sort((a, b) => a.since - b.since);
      if (!pool.length) continue;
      const need = size * 2;
      const anchor = pool[0];
      const waited = (now() - anchor.since) / 1000;
      const window = 150 + waited * 25;
      const picked = [];
      let count = 0;
      for (const q of pool) {
        if (mode === 'ranked-pvp' && Math.abs(q.mmr - anchor.mmr) > window) continue;
        if (count + q.members.length > need) continue;
        picked.push(q); count += q.members.length;
        if (count === need) break;
      }
      const ready = count === need || (mode === 'casual' && waited > 15);
      if (!ready) continue;
      // split into two teams keeping groups together, balancing rating
      const A = [], B = [];
      let ra = 0, rb = 0;
      for (const q of picked.sort((a, b) => b.members.length - a.members.length || b.mmr - a.mmr)) {
        const toA = (A.length + q.members.length <= size) && (B.length + q.members.length > size || ra <= rb);
        (toA ? A : B).push(...q.members);
        if (toA) ra += q.mmr * q.members.length; else rb += q.mmr * q.members.length;
      }
      if (A.length > size || B.length > size) continue;
      for (const q of picked) queue.splice(queue.indexOf(q), 1);
      startRoom({ mode, size, teams: { A, B }, ladder: mode === 'ranked-pvp' ? ladderKey(mode, size) : null, rating: (ra + rb) / Math.max(1, A.length + B.length) });
    }
  }
}
setInterval(tryMatch, 1000);

function startRoom({ mode, size, teams, ladder, rating }) {
  const id = db.id('r');
  const humans = [...teams.A, ...teams.B];
  // side assignment: team A attack or defend at random
  const aSide = Math.random() < 0.5 ? 'T' : 'CT';
  const bSide = aSide === 'T' ? 'CT' : 'T';
  const room = {
    id, mode, size, ladder, host: humans[0], started: now(),
    winRounds: size === 5 ? 13 : 9,
    members: humans.map(uid => ({ id: uid, name: D.users[uid].name, team: teams.A.includes(uid) ? aSide : bSide, equipped: equippedItems(D.users[uid]) })),
    botSkill: skillForMMR(rating || 1000),
    reported: false,
  };
  rooms.set(id, room);
  for (const m of room.members) {
    roomOf.set(m.id, room);
    push(m.id, 'match.found', { room: publicRoom(room), role: m.id === room.host ? 'host' : 'client', you: m.id });
  }
  for (const m of room.members) notifyFriends(D.users[m.id]);
}
function publicRoom(r) { return { id: r.id, mode: r.mode, size: r.size, ladder: r.ladder, host: r.host, winRounds: r.winRounds, members: r.members, botSkill: r.botSkill }; }
function equippedItems(u) {
  const out = {};
  for (const [slot, itemUid] of Object.entries(u.equipped)) { const it = E.findItem(u, itemUid); if (it) out[slot] = it; }
  return out;
}

function closeRoom(room, reason) {
  rooms.delete(room.id);
  for (const m of room.members) { roomOf.delete(m.id); push(m.id, 'room.closed', { reason }); }
  for (const m of room.members) if (D.users[m.id]) notifyFriends(D.users[m.id]);
}

// Host reports the final result: ranked updates + rewards for every human.
function settleRoom(room, report) {
  if (room.reported) return;
  room.reported = true;
  const winner = report.winner;
  for (const m of room.members) {
    const u = D.users[m.id];
    const st = report.stats?.[m.id] || { kills: 0, deaths: 0, assists: 0, damage: 0 };
    const left = report.left?.includes(m.id);
    const result = { won: !left && m.team === winner, team: m.team, score: report.score, stats: st, rounds: report.rounds, teamSize: room.size, weaponKills: report.weaponKills?.[m.id] || {}, abandoned: left };
    let ranked = null;
    const lid = room.mode === 'casual' ? null : room.ladder;
    if (lid) {
      const L = u.ladders[lid];
      ranked = applyMatch(L, { ...result, oppRating: L.mmr }, (mmr) => ladderPosition(lid, mmr, u.id));
    }
    const reward = left ? { credits: 0, drops: [] } : E.awardMatch(u, result);
    push(m.id, 'match.result', { ...result, ranked, reward, players: report.players || [], profile: profileOf(u) });
  }
  db.dirty();
  closeRoom(room, 'finished');
}

function ladderPosition(lid, mmr, exclude) {
  let pos = 1;
  for (const u of Object.values(D.users)) if (u.id !== exclude && u.ladders?.[lid]?.rank != null && u.ladders[lid].mmr > mmr) pos++;
  return pos;
}

// ================================================================ market
function marketSummary(query = '') {
  const q = query.toLowerCase();
  const byDef = new Map();
  const add = (defId) => { if (!byDef.has(defId)) byDef.set(defId, { defId, listings: 0, lowest: null, sales24: 0, lastSale: null }); return byDef.get(defId); };
  for (const l of D.listings) { const s = add(l.item.defId); s.listings++; s.lowest = s.lowest == null ? l.price : Math.min(s.lowest, l.price); }
  const dayAgo = now() - 86400000;
  for (const s of D.sales) { const e = add(s.defId); if (s.t > dayAgo) e.sales24++; if (!e.lastSale || s.t > e.lastSale.t) e.lastSale = { price: s.price, t: s.t }; }
  let out = [...byDef.values()];
  if (q) out = out.filter(e => { const d = SKINS[e.defId] || STICKERS[e.defId]; return d && (d.name.toLowerCase().includes(q) || (d.weapon || '').includes(q) || (d.knife || '').includes(q)); });
  return out.sort((a, b) => b.sales24 - a.sales24 || b.listings - a.listings).slice(0, 300);
}
function marketItem(defId) {
  const listings = D.listings.filter(l => l.item.defId === defId).sort((a, b) => a.price - b.price)
    .map(l => ({ id: l.id, price: l.price, item: l.item, seller: D.users[l.seller]?.name || '?', sellerId: l.seller, created: l.created }));
  const sales = D.sales.filter(s => s.defId === defId).slice(-400);
  const ref = E.marketPrice({ kind: SKINS[defId] ? 'skin' : 'sticker', defId, float: 0.2, seed: 1, stickers: [] });
  return { defId, listings, sales, reference: ref };
}

// ================================================================ trades
function tradeView(t) {
  const items = (uid, list) => list.map(id => E.findItem(D.users[uid], id)).filter(Boolean);
  return { id: t.id, from: { id: t.from, name: D.users[t.from]?.name }, to: { id: t.to, name: D.users[t.to]?.name }, give: items(t.from, t.give), get: items(t.to, t.get), status: t.status, created: t.created, message: t.message || '' };
}
function tradesFor(userId) { return D.trades.filter(t => (t.from === userId || t.to === userId) && t.status === 'pending').map(tradeView); }
function invalidateTradesWith(itemUid) {
  for (const t of D.trades) if (t.status === 'pending' && (t.give.includes(itemUid) || t.get.includes(itemUid))) { t.status = 'invalid'; push(t.from, 'trades', tradesFor(t.from)); push(t.to, 'trades', tradesFor(t.to)); }
}

// ================================================================ handlers
const handlers = {
  // ---- auth
  'auth.register'(ws, { name, password }) {
    name = String(name || '').trim();
    if (!/^[A-Za-z0-9_\-]{3,16}$/.test(name)) return { error: 'Name must be 3–16 letters, numbers, _ or -' };
    if (String(password || '').length < 6) return { error: 'Password must be at least 6 characters' };
    if (userByName(name)) return { error: 'That name is taken' };
    const id = db.id('u');
    const u = ensureUser({ id, name, nameLower: name.toLowerCase(), pass: hashPassword(password), created: now(), ...E.freshProfile(name) });
    D.users[id] = u;
    return login(ws, u);
  },
  'auth.login'(ws, { name, password }) {
    const u = userByName(String(name || ''));
    if (!u || !checkPassword(String(password || ''), u.pass)) return { error: 'Wrong name or password' };
    return login(ws, u);
  },
  'auth.resume'(ws, { token }) {
    const u = Object.values(D.users).find(x => x.tokens?.includes(token));
    if (!u) return { error: 'Session expired' };
    return login(ws, u, token);
  },
  'auth.logout'(ws) { const u = ws.user; if (u) { u.tokens = u.tokens.filter(t => t !== ws.token); db.dirty(); } return { ok: true }; },

  // ---- profile / inventory (all server-authoritative)
  'profile.get'(ws) { return { profile: profileOf(ws.user) }; },
  'profile.rename'(ws) { return { error: 'Names are fixed for online accounts' }; },
  'inv.openCase'(ws, { uid }) { return withSave(ws, E.openCase(ws.user, uid)); },
  'inv.buyCase'(ws, { caseId }) { return withSave(ws, E.buyCase(ws.user, caseId)); },
  'inv.quickSell'(ws, { uid }) { const r = E.quickSell(ws.user, uid); if (!r.error) invalidateTradesWith(uid); return withSave(ws, r); },
  'inv.equip'(ws, { uid }) { return withSave(ws, E.equip(ws.user, uid)); },
  'inv.applySticker'(ws, { skinUid, stickerUid, slot }) { return withSave(ws, E.applySticker(ws.user, skinUid, stickerUid, slot)); },
  'inv.scrape'(ws, { uid, slot }) { return withSave(ws, E.scrapeSticker(ws.user, uid, slot)); },
  // Solo matches vs bots are simulated on the player's machine; rewards are
  // rate-limited so they can't be farmed by spamming the endpoint.
  'match.award'(ws, { result }) {
    const u = ws.user;
    if (now() - (u.lastAward || 0) < 60000) return { error: 'Too soon since the last reward' };
    u.lastAward = now();
    const safe = { won: !!result.won, team: result.team, score: result.score, teamSize: Math.min(5, Math.max(1, result.teamSize | 0)), weaponKills: {},
      stats: { kills: Math.min(60, result.stats?.kills | 0), deaths: Math.min(60, result.stats?.deaths | 0), assists: Math.min(60, result.stats?.assists | 0), damage: 0 } };
    return withSave(ws, E.awardMatch(u, safe));
  },
  'ranked.solo'(ws, { ladder, result }) {
    // solo ranked vs bots (client-simulated) recorded against the account
    if (!LADDERS[ladder]?.bots) return { error: 'Bad ladder' };
    const L = ws.user.ladders[ladder];
    const r = { won: !!result.won, abandoned: !!result.abandoned, rounds: Math.max(1, result.rounds | 0), stats: { kills: result.stats?.kills | 0, deaths: result.stats?.deaths | 0, damage: Math.min(10000, result.stats?.damage | 0) }, oppRating: L.mmr };
    const out = applyMatch(L, r, (mmr) => ladderPosition(ladder, mmr, ws.user.id));
    db.dirty();
    return { ranked: out, profile: profileOf(ws.user) };
  },
  'ranked.board'(ws, { ladder }) {
    const users = Object.values(D.users).filter(u => u.ladders?.[ladder]?.rank != null);
    for (const u of users) applyDecay(ladder, u.ladders[ladder]);
    users.sort((a, b) => b.ladders[ladder].mmr - a.ladders[ladder].mmr);
    const dist = TIERS.map(() => 0);
    for (const u of users) dist[RANKS[u.ladders[ladder].rank].tier]++;
    const me = ws.user.ladders[ladder];
    return {
      top: users.slice(0, 100).map(u => ({ name: u.name, mmr: u.ladders[ladder].mmr, rank: u.ladders[ladder].rank })),
      position: me.rank != null ? ladderPosition(ladder, me.mmr, ws.user.id) : null,
      total: users.length, distribution: dist.map(c => users.length ? c / users.length : 0),
    };
  },

  // ---- market
  'market.overview'(ws, { query }) { return { items: marketSummary(query) }; },
  'market.item'(ws, { defId }) { return marketItem(defId); },
  'market.mine'(ws) { return { listings: D.listings.filter(l => l.seller === ws.user.id) }; },
  'market.list'(ws, { uid, price }) {
    const u = ws.user, it = E.findItem(u, uid);
    price = Math.round(+price);
    if (!it) return { error: 'Item not found' };
    if (it.listed) return { error: 'Already listed' };
    if (!(price >= 1 && price <= 1e7)) return { error: 'Price must be between 1 and 10,000,000' };
    if (D.listings.filter(l => l.seller === u.id).length >= 50) return { error: 'You can have at most 50 listings' };
    it.listed = true;
    for (const [k, v] of Object.entries(u.equipped)) if (v === uid) delete u.equipped[k];
    D.listings.push({ id: db.id('l'), seller: u.id, item: it, price, created: now() });
    invalidateTradesWith(uid);
    return withSave(ws, { ok: true });
  },
  'market.cancel'(ws, { id }) {
    const l = D.listings.find(x => x.id === id && x.seller === ws.user.id);
    if (!l) return { error: 'Listing not found' };
    D.listings = D.listings.filter(x => x !== l);
    const it = E.findItem(ws.user, l.item.uid); if (it) delete it.listed;
    return withSave(ws, { ok: true });
  },
  'market.buy'(ws, { id }) {
    const buyer = ws.user;
    const l = D.listings.find(x => x.id === id);
    if (!l) return { error: 'That listing has already sold' };
    if (l.seller === buyer.id) return { error: 'You cannot buy your own listing' };
    if (buyer.credits < l.price) return { error: 'Not enough credits' };
    const seller = D.users[l.seller];
    const it = E.findItem(seller, l.item.uid);
    if (!it) { D.listings = D.listings.filter(x => x !== l); return { error: 'Listing is no longer valid' }; }
    // atomic swap
    D.listings = D.listings.filter(x => x !== l);
    E.removeItem(seller, it.uid);
    delete it.listed;
    it.acquired = now();
    buyer.items.push(it);
    buyer.credits -= l.price;
    const proceeds = Math.floor(l.price * (1 - MARKET_FEE));
    seller.credits += proceeds;
    D.sales.push({ defId: it.defId, price: l.price, float: it.float ?? null, t: now() });
    if (D.sales.length > 50000) D.sales.splice(0, D.sales.length - 50000);
    buyer.history.unshift({ t: now(), type: 'buy', item: it.defId, value: l.price });
    seller.history.unshift({ t: now(), type: 'market-sale', item: it.defId, value: proceeds });
    push(seller.id, 'profile', profileOf(seller));
    push(seller.id, 'toast', `Your ${itemDef(it)?.name} sold for ${l.price} credits (you receive ${proceeds})`);
    return withSave(ws, { ok: true, item: it });
  },

  // ---- friends
  'social.list'(ws) { return friendList(ws.user); },
  'social.request'(ws, { name }) {
    const u = ws.user, f = userByName(String(name || ''));
    if (!f) return { error: 'No player with that name' };
    if (f.id === u.id) return { error: "That's you" };
    if (u.friends.includes(f.id)) return { error: 'Already friends' };
    if (u.friendReq.includes(f.id)) return handlers['social.accept'](ws, { id: f.id });
    if (!f.friendReq.includes(u.id)) f.friendReq.push(u.id);
    db.dirty();
    push(f.id, 'social', friendList(f));
    push(f.id, 'toast', `${u.name} sent you a friend request`);
    return { ok: true };
  },
  'social.accept'(ws, { id }) {
    const u = ws.user, f = D.users[id];
    if (!f || !u.friendReq.includes(id)) return { error: 'No such request' };
    u.friendReq = u.friendReq.filter(x => x !== id);
    if (!u.friends.includes(id)) u.friends.push(id);
    if (!f.friends.includes(u.id)) f.friends.push(u.id);
    db.dirty();
    push(f.id, 'social', friendList(f));
    return friendList(u);
  },
  'social.decline'(ws, { id }) { ws.user.friendReq = ws.user.friendReq.filter(x => x !== id); db.dirty(); return friendList(ws.user); },
  'social.remove'(ws, { id }) {
    const u = ws.user, f = D.users[id];
    u.friends = u.friends.filter(x => x !== id);
    if (f) { f.friends = f.friends.filter(x => x !== u.id); push(f.id, 'social', friendList(f)); }
    db.dirty();
    return friendList(u);
  },
  'social.inventory'(ws, { id }) {
    const f = D.users[id];
    if (!f || !ws.user.friends.includes(id)) return { error: 'Not a friend' };
    return { items: f.items.filter(i => !i.listed), name: f.name };
  },

  // ---- parties
  'party.invite'(ws, { id }) {
    const u = ws.user, f = D.users[id];
    if (!f || !u.friends.includes(id)) return { error: 'You can only invite friends' };
    if (!online(id)) return { error: `${f.name} is offline` };
    let p = partyOf.get(u.id);
    if (!p) { p = { id: db.id('p'), leader: u.id, members: [u.id], invites: new Set() }; parties.set(p.id, p); partyOf.set(u.id, p); }
    if (p.leader !== u.id) return { error: 'Only the party leader can invite' };
    if (p.members.length >= 5) return { error: 'Party is full' };
    p.invites.add(id);
    push(id, 'party.invite', { partyId: p.id, from: u.name });
    broadcastParty(p);
    return { party: partyState(p) };
  },
  'party.accept'(ws, { partyId }) {
    const u = ws.user, p = parties.get(partyId);
    if (!p || !p.invites.has(u.id)) return { error: 'Invite expired' };
    leaveParty(u.id);
    cancelQueue(p.leader);
    p.invites.delete(u.id);
    p.members.push(u.id); partyOf.set(u.id, p);
    broadcastParty(p);
    notifyFriends(u);
    return { party: partyState(p) };
  },
  'party.leave'(ws) { leaveParty(ws.user.id); notifyFriends(ws.user); return { party: null }; },
  'party.kick'(ws, { id }) { const p = partyOf.get(ws.user.id); if (p?.leader !== ws.user.id) return { error: 'Not leader' }; leaveParty(id); return { party: partyState(partyOf.get(ws.user.id)) }; },

  // ---- trading
  'trade.offer'(ws, { to, give = [], get = [], message = '' }) {
    const u = ws.user, f = D.users[to];
    if (!f || !u.friends.includes(to)) return { error: 'You can only trade with friends' };
    if (!give.length && !get.length) return { error: 'Add at least one item' };
    if (give.length > 20 || get.length > 20) return { error: 'Too many items' };
    for (const id of give) { const it = E.findItem(u, id); if (!it || it.listed) return { error: 'One of your items is unavailable' }; }
    for (const id of get) { const it = E.findItem(f, id); if (!it || it.listed) return { error: 'One of their items is unavailable' }; }
    const t = { id: db.id('t'), from: u.id, to, give, get, status: 'pending', created: now(), message: String(message).slice(0, 140) };
    D.trades.push(t);
    db.dirty();
    push(to, 'trades', tradesFor(to));
    push(to, 'toast', `${u.name} sent you a trade offer`);
    return { trades: tradesFor(u.id) };
  },
  'trade.list'(ws) { return { trades: tradesFor(ws.user.id) }; },
  'trade.respond'(ws, { id, accept }) {
    const t = D.trades.find(x => x.id === id && x.status === 'pending');
    if (!t) return { error: 'Offer no longer available' };
    const me = ws.user.id;
    if (t.to !== me && t.from !== me) return { error: 'Not your trade' };
    if (!accept || t.from === me) { t.status = t.from === me ? 'cancelled' : 'declined'; db.dirty(); push(t.from, 'trades', tradesFor(t.from)); push(t.to, 'trades', tradesFor(t.to)); return { trades: tradesFor(me) }; }
    const A = D.users[t.from], B = D.users[t.to];
    const gi = t.give.map(id => E.findItem(A, id)), gj = t.get.map(id => E.findItem(B, id));
    if (gi.some(x => !x || x.listed) || gj.some(x => !x || x.listed)) { t.status = 'invalid'; db.dirty(); return { error: 'Some items are no longer available' }; }
    for (const it of gi) { E.removeItem(A, it.uid); it.acquired = now(); B.items.push(it); }
    for (const it of gj) { E.removeItem(B, it.uid); it.acquired = now(); A.items.push(it); }
    t.status = 'accepted'; t.done = now();
    for (const it of [...gi, ...gj]) invalidateTradesWith(it.uid);
    A.history.unshift({ t: now(), type: 'trade', item: `${gi.length} given / ${gj.length} received`, with: B.name });
    B.history.unshift({ t: now(), type: 'trade', item: `${gj.length} given / ${gi.length} received`, with: A.name });
    db.dirty();
    push(A.id, 'profile', profileOf(A)); push(B.id, 'profile', profileOf(B));
    push(A.id, 'trades', tradesFor(A.id)); push(B.id, 'trades', tradesFor(B.id));
    push(A.id, 'toast', `${B.name} accepted your trade`);
    return { trades: tradesFor(me), profile: profileOf(ws.user) };
  },

  // ---- matchmaking
  'mm.queue'(ws, { mode, size }) {
    const u = ws.user;
    if (!['casual', 'ranked-bots', 'ranked-pvp'].includes(mode) || ![2, 5].includes(size)) return { error: 'Bad queue' };
    const p = partyOf.get(u.id);
    if (p && p.leader !== u.id) return { error: 'Only the party leader can start matchmaking' };
    const members = groupOf(u.id);
    if (members.length > size) return { error: `Your party is too big for ${size}v${size}` };
    if (members.some(m => roomOf.get(m))) return { error: 'A party member is still in a match' };
    for (const m of members) cancelQueue(m);
    const key = ladderKey(mode, size);
    for (const m of members) {
      const L = D.users[m].ladders[key];
      if (now() < (L.cooldownUntil || 0)) return { error: `${D.users[m].name} has a leave penalty` };
    }
    queue.push({ key, members, mode, size, mmr: groupMMR(members, key), since: now() });
    for (const m of members) push(m, 'mm', { state: 'searching', mode, size, since: now() });
    for (const m of members) notifyFriends(D.users[m]);
    return { ok: true };
  },
  'mm.cancel'(ws) { cancelQueue(ws.user.id); return { ok: true }; },
  'room.leave'(ws) {
    const room = roomOf.get(ws.user.id);
    if (!room) return { ok: true };
    leaveRoom(room, ws.user.id);
    return { ok: true };
  },
  'room.report'(ws, report) {
    const room = roomOf.get(ws.user.id);
    if (!room || room.host !== ws.user.id) return { error: 'Not the host' };
    settleRoom(room, report);
    return { ok: true };
  },
};

function leaveRoom(room, userId) {
  if (room.host === userId) {
    // host left: match can't continue; nobody is penalised except the host in ranked
    if (room.ladder && room.mode !== 'casual' && !room.reported) {
      const u = D.users[userId];
      applyMatch(u.ladders[room.ladder], { won: false, abandoned: true, rounds: 1, stats: { kills: 0, deaths: 0, damage: 0 } }, () => 9999);
      db.dirty();
    }
    room.reported = true;
    closeRoom(room, 'The host left the match');
    return;
  }
  room.left ||= [];
  room.left.push(userId);
  roomOf.delete(userId);
  push(room.host, 'room.msg', { from: userId, data: { k: 'left' } });
  if (room.ladder && room.mode !== 'casual') {
    const u = D.users[userId];
    applyMatch(u.ladders[room.ladder], { won: false, abandoned: true, rounds: 1, stats: { kills: 0, deaths: 0, damage: 0 } }, () => 9999);
    db.dirty();
  }
}

function withSave(ws, res) {
  db.dirty();
  if (res.error) return res;
  return { ...res, profile: profileOf(ws.user) };
}

function login(ws, u, token) {
  ensureUser(u);
  if (!token) { token = crypto.randomBytes(24).toString('hex'); u.tokens = [...u.tokens.slice(-4), token]; }
  ws.user = u; ws.token = token;
  if (!sockets.has(u.id)) sockets.set(u.id, new Set());
  sockets.get(u.id).add(ws);
  db.dirty();
  notifyFriends(u);
  setTimeout(() => {
    send(ws, 'social', friendList(u));
    send(ws, 'trades', tradesFor(u.id));
    send(ws, 'party', partyState(partyOf.get(u.id)));
  }, 50);
  return { token, user: { id: u.id, name: u.name }, profile: profileOf(u) };
}

// ================================================================ transport
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.glb']);
const DIST = path.join(ROOT, 'dist');
const gzCache = new Map();   // file -> gzipped buffer (static files never change while running)

function sendFile(req, res, file) {
  const ext = path.extname(file);
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
  // hashed build assets can be cached forever; everything else revalidates
  headers['cache-control'] = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
  if (COMPRESS.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    if (!gzCache.has(file)) gzCache.set(file, zlib.gzipSync(fs.readFileSync(file), { level: 6 }));
    const body = gzCache.get(file);
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': body.length, vary: 'Accept-Encoding' });
    res.end(body);
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, path.normalize(p));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const index = path.join(DIST, 'index.html');
    if (fs.existsSync(index)) sendFile(req, res, index);
    else { res.writeHead(404); res.end('Build the client first: npm run build'); }
    return;
  }
  sendFile(req, res, file);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    // high-rate match relay (no reply)
    if (m.type === 'room.msg' && ws.user) {
      const room = roomOf.get(ws.user.id);
      if (!room) return;
      const data = m.data;
      if (ws.user.id === room.host) {
        const to = data.to; // optional direct message
        for (const mem of room.members) if (mem.id !== room.host && (!to || to === mem.id) && !room.left?.includes(mem.id)) push(mem.id, 'room.msg', { from: room.host, data });
      } else push(room.host, 'room.msg', { from: ws.user.id, data });
      return;
    }
    const h = handlers[m.type];
    const reply = (out) => { if (m.id != null && ws.readyState === 1) ws.send(JSON.stringify({ re: m.id, error: out?.error, data: out })); };
    if (!h) return reply({ error: 'Unknown request' });
    if (!m.type.startsWith('auth.') && !ws.user) return reply({ error: 'Sign in first' });
    try { reply(h(ws, m.data || {})); } catch (e) { console.error(m.type, e); reply({ error: 'Server error' }); }
  });
  ws.on('close', () => {
    const u = ws.user;
    if (!u) return;
    const set = sockets.get(u.id); set?.delete(ws);
    if (!set?.size) {
      sockets.delete(u.id);
      cancelQueue(u.id);
      const room = roomOf.get(u.id);
      if (room) leaveRoom(room, u.id);
      leaveParty(u.id);
      notifyFriends(u);
    }
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20000);

process.on('SIGINT', () => { db.flushNow(); process.exit(0); });
process.on('SIGTERM', () => { db.flushNow(); process.exit(0); });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Vantage server listening on port ${PORT}`);
  console.log(`Saving accounts and items to ${DB_FILE}`);
  if (process.env.RENDER && !process.env.DB_FILE) console.warn('WARNING: no DB_FILE set. On Render, data in the app folder is wiped on every deploy/restart; attach a disk and set DB_FILE.');
});
export { condition };
