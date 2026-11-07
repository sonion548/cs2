// End-to-end check of the server with two simulated players.
//   node server/selftest.js ws://localhost:8080/ws
import WebSocket from 'ws';

const URL = process.argv[2] || 'ws://localhost:8080/ws';

function client(label) {
  const ws = new WebSocket(URL);
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.re != null) { pending.get(m.re)?.(m.error ? { error: m.error } : m.data); pending.delete(m.re); }
    else events.push(m);
  });
  const rpc = (type, data = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, type, data })); });
  const waitEv = async (name, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const i = events.findIndex(e => e.ev === name); if (i >= 0) return events.splice(i, 1)[0].data; await new Promise(r => setTimeout(r, 50)); }
    throw new Error(`${label}: no ${name} event`);
  };
  return new Promise((res) => ws.on('open', () => res({ ws, rpc, waitEv, events, label })));
}

const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); };

const tag = Math.random().toString(36).slice(2, 6);
const a = await client('A'), b = await client('B');
const ra = await a.rpc('auth.register', { name: 'alpha_' + tag, password: 'secret123' });
const rb = await b.rpc('auth.register', { name: 'bravo_' + tag, password: 'secret123' });
ok(ra.token && rb.token, 'register two accounts');
ok((await a.rpc('auth.register', { name: 'alpha_' + tag, password: 'x12345' })).error, 'duplicate names rejected');

// inventory
const caseItem = ra.profile.items.find(i => i.kind === 'case' && i.defId !== 'capsule' && i.defId !== 'gold');
const opened = await a.rpc('inv.openCase', { uid: caseItem.uid });
ok(opened.item && opened.profile.credits === 2500 - 250, 'case opened on the server, key charged');
// the Gold Case every player gets: no key, always a knife or gloves
const goldItem = ra.profile.items.find(i => i.kind === 'case' && i.defId === 'gold');
const gold = await a.rpc('inv.openCase', { uid: goldItem.uid });
ok(gold.item && /^(knife|gloves):/.test(gold.item.defId) && gold.profile.credits === 2500 - 250, 'Gold Case opened free into a knife or gloves');
const skin = opened.item;

// friends
ok((await a.rpc('social.request', { name: 'bravo_' + tag })).ok, 'friend request sent');
await b.waitEv('social');
const acc = await b.rpc('social.accept', { id: ra.user.id });
ok(acc.friends?.some(f => f.id === ra.user.id), 'friend request accepted');

// trade: A gives the unboxed skin, B gives a case
const bCase = rb.profile.items.find(i => i.kind === 'case');
const offer = await a.rpc('trade.offer', { to: rb.user.id, give: [skin.uid], get: [bCase.uid] });
ok(offer.trades?.length === 1, 'trade offer created');
const tlist = await b.rpc('trade.list');
const done = await b.rpc('trade.respond', { id: tlist.trades[0].id, accept: true });
ok(done.profile.items.some(i => i.uid === skin.uid), 'trade accepted and items swapped');

// market. With bot traders on (the default) the market is full of bot
// listings and buy orders; with MARKET_BOTS=0 it's players only.
const overview = await a.rpc('market.overview', {});
const bots = overview.items.filter(e => e.listings > 0).length > 100;
if (!bots) {
  // B lists the skin, A buys it back
  const listed = await b.rpc('market.list', { uid: skin.uid, price: 300 });
  ok(listed.ok && !listed.sold, 'item listed on the market');
  const over = await a.rpc('market.overview', {});
  ok(over.items.some(e => e.defId === skin.defId), 'market overview shows the listing');
  const detail = await a.rpc('market.item', { defId: skin.defId });
  const before = (await a.rpc('profile.get')).profile.credits;
  const bought = await a.rpc('market.buy', { id: detail.listings.find(l => l.sellerId === rb.user.id).id });
  ok(bought.ok && bought.profile.credits === before - 300, 'market purchase charged the buyer');
  const sellerAfter = (await b.rpc('profile.get')).profile.credits;
  ok(sellerAfter === rb.profile.credits + 270, 'seller received price minus 10% fee');
  const hist = await a.rpc('market.item', { defId: skin.defId });
  ok(hist.sales.length >= 1, 'sale recorded in price history');
  // buy orders: B wants two at 150, A sells into the order, B cancels the rest
  const bc0 = (await b.rpc('profile.get')).profile.credits;
  const ord = await b.rpc('market.order', { defId: skin.defId, price: 150, qty: 2 });
  ok(ord.ok && ord.waiting === 2 && ord.profile.credits === bc0 - 300, 'buy order placed, credits held');
  const ac0 = (await a.rpc('profile.get')).profile.credits;
  const sold = await a.rpc('market.sellToOrder', { uid: skin.uid });
  ok(sold.ok && sold.profile.credits === ac0 + 135 && !sold.profile.items.some(i => i.uid === skin.uid), 'sold into the buy order (minus fee)');
  const bp = (await b.rpc('profile.get')).profile;
  ok(bp.items.some(i => i.uid === skin.uid), 'buy order delivered the item');
  const mineB = await b.rpc('market.mine');
  ok(mineB.orders.length === 1 && mineB.orders[0].qty === 1, 'order has one left to fill');
  const canc = await b.rpc('market.cancelOrder', { id: mineB.orders[0].id });
  ok(canc.ok && canc.profile.credits === bp.credits + 150, 'cancelled order returned the held credits');
  // a listing at or below a waiting order sells to it at once
  const ord2 = await a.rpc('market.order', { defId: skin.defId, price: 120, qty: 1 });
  const instant = await b.rpc('market.list', { uid: skin.uid, price: 100 });
  ok(ord2.ok && instant.ok && instant.sold && instant.price === 120, 'new listing filled a waiting buy order at its price');
} else {
  ok(overview.items.some(e => e.highestBid > 0), 'bot traders place buy orders');
  ok(overview.items.some(e => e.sales24 > 0), 'bot traders make sales (price history)');
  // buy the cheapest bot listing A can afford, then sell it straight back to the best order
  const credits = (await a.rpc('profile.get')).profile.credits;
  const cheap = overview.items.filter(e => e.lowest != null && e.lowest <= credits && e.highestBid).sort((x, y) => x.lowest - y.lowest)[0];
  ok(cheap, 'an affordable bot listing exists');
  const det = await a.rpc('market.item', { defId: cheap.defId });
  const lst = det.listings.find(l => l.bot && l.price <= credits);
  const got = await a.rpc('market.buy', { id: lst.id });
  ok(got.ok && got.profile.credits === credits - lst.price, 'bought a bot listing');
  const back = await a.rpc('market.sellToOrder', { uid: got.item.uid });
  ok(back.ok && back.price < lst.price, 'sold to a bot buy order for less than it cost (no credit loop)');
  // an order far below value just waits; cancelling returns the credits
  const c1 = back.profile.credits;
  const low = await a.rpc('market.order', { defId: cheap.defId, price: 1, qty: 3 });
  ok(low.ok && low.waiting === 3 && low.profile.credits === c1 - 3, 'low buy order waits with credits held');
  const mineA = await a.rpc('market.mine');
  const cl = await a.rpc('market.cancelOrder', { id: mineA.orders[0].id });
  ok(cl.ok && cl.profile.credits === c1, 'cancelled order refunded');
}

// party + ranked vs bots queue
const inv = await a.rpc('party.invite', { id: rb.user.id });
ok(inv.party, 'party invite sent');
const pinv = await b.waitEv('party.invite');
const joined = await b.rpc('party.accept', { partyId: pinv.partyId });
ok(joined.party.members.length === 2, 'friend joined the party');
ok((await b.rpc('mm.queue', { mode: 'ranked-bots', size: 2 })).error, 'non-leader cannot queue');
ok((await a.rpc('mm.queue', { mode: 'ranked-bots', size: 2 })).ok, 'leader queued the party');
const fa = await a.waitEv('match.found'), fb = await b.waitEv('match.found');
ok(fa.role === 'host' && fb.role === 'client' && fa.room.id === fb.room.id, 'match found: one host, one client, same room');

// relay
a.ws.send(JSON.stringify({ type: 'room.msg', data: { k: 'snap', t: 1 } }));
const relayed = await b.waitEv('room.msg');
ok(relayed.data.k === 'snap', 'host snapshot relayed to client');

// result
const rep = await a.rpc('room.report', { winner: fa.room.members[0].team, score: { T: 9, CT: 4 }, rounds: 13,
  stats: { [ra.user.id]: { kills: 20, deaths: 8, assists: 2, damage: 2100 }, [rb.user.id]: { kills: 12, deaths: 9, assists: 5, damage: 1500 } } });
ok(rep.ok, 'host reported the result');
const resA = await a.waitEv('match.result'), resB = await b.waitEv('match.result');
ok(resA.ranked?.placement && resB.ranked?.placement && resA.reward.credits > 0, 'ranked placements + rewards applied to both players');

// a match that ends without a report (the host's game crashed) must not
// leave the party stuck "in a match"
ok((await a.rpc('mm.queue', { mode: 'casual', size: 2 })).ok, 'party can queue again after a finished match');
const fa2 = await a.waitEv('match.found', 30000); await b.waitEv('match.found', 30000);
ok(fa2.role === 'host', 'second match found');
const again = await a.rpc('mm.queue', { mode: 'casual', size: 2 });
ok(again.ok, 'host whose match crashed (no report, no leave) can queue again');
ok((await b.waitEv('room.closed')).reason, 'the crashed match was closed for the other player');
await a.rpc('mm.cancel');

console.log('\nAll server checks passed.');
process.exit(0);
