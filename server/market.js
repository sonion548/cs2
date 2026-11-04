// The item market: player listings, buy orders and bot traders.
//
//  - Listings (asks): an item for sale at a fixed price. A player's item stays
//    in their inventory (marked listed) until it sells.
//  - Buy orders (bids): "I'll pay up to P for any <item>", with the credits
//    held when the order is placed. Selling to an order is instant. A new
//    listing at or below the best order fills it straight away, and a new
//    order at or above the cheapest listing buys it straight away.
//  - Bot traders keep every item stocked with listings a little above its
//    reference price, hold buy orders a little below it, buy reasonably priced
//    player listings after a while, sell into reasonable player orders, and
//    trade among themselves so every item has a price history. Bots always buy
//    cheaper than they sell, so there is no way to farm credits off them.
//    Their listings and orders live in memory (rebuilt on start); only player
//    listings, player orders and sales are saved.
import { SKINS, STICKERS, RARITY, itemDef } from '../src/items/catalog.js';

const BOT_NAMES = ['Kestrel Trading', 'Dune Exchange', 'Souk Supply', 'Mirage Goods', 'Oasis Market', 'Atlas Traders', 'Sable & Co', 'Harbor Arms'];
const TICK_MS = 30000;
// bot listings kept per item, by rarity (knives are most of the catalogue, one each is plenty)
const STOCK = { standard: 4, superior: 3, exotic: 3, mythic: 2, legendary: 1, sticker: 2 };
// how often an item changes hands between bots, relative (commons trade most)
const ACTIVITY = { standard: 6, superior: 4, exotic: 3, mythic: 2, legendary: 1, sticker: 3 };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Market {
  // E: shared economy (marketPrice, makeSkin, makeSticker, findItem, removeItem, uid)
  constructor({ D, db, E, push, profileOf, fee = 0.1, now = Date.now, bots = true }) {
    Object.assign(this, { D, db, E, push, profileOf, fee, now, botsOn: bots });
    D.orders ||= [];
    this.botListings = [];   // { id, bot, item, price, created, expires }
    this.botOrders = [];     // { id, bot, defId, price, qty, created, expires }
    this.defs = [...Object.keys(SKINS), ...Object.keys(STICKERS)];
    this.seq = 0;
    if (bots) {
      this.seedHistory();
      this.restock(true);
      this.timer = setInterval(() => { try { this.tick(); } catch (e) { console.error('market bots:', e); } }, TICK_MS);
      this.timer.unref?.();
    }
  }

  stop() { clearInterval(this.timer); }

  // ------------------------------------------------------------ prices
  tierOf(defId) { return SKINS[defId] ? SKINS[defId].rarity : 'sticker'; }
  // a typical copy (what the price chart's reference line shows)
  reference(defId) {
    return SKINS[defId] ? this.E.marketPrice({ kind: 'skin', defId, float: 0.2, seed: 1, tally: null, stickers: [] }) : this.E.marketPrice({ kind: 'sticker', defId });
  }
  // the most worn copy anyone could sell (what bots bid against)
  floor(defId) {
    const s = SKINS[defId];
    if (!s) return this.E.marketPrice({ kind: 'sticker', defId });
    return this.E.marketPrice({ kind: 'skin', defId, float: Math.min(0.99, s.floatRange[1]), seed: 1, tally: null, stickers: [] });
  }
  makeItem(defId) { return SKINS[defId] ? this.E.makeSkin(defId) : this.E.makeSticker(defId); }
  id(p) { return p + (++this.seq).toString(36) + this.now().toString(36).slice(-4); }

  // ------------------------------------------------------------ views
  liveBots() { const t = this.now(); return this.botListings.filter(l => l.created <= t); }
  asks(defId) {
    const t = this.now();
    const players = this.D.listings.filter(l => l.item.defId === defId);
    const bots = this.botListings.filter(l => l.item.defId === defId && l.created <= t);
    return [...players, ...bots].sort((a, b) => a.price - b.price || a.created - b.created);
  }
  bids(defId, exclude = null) {
    return [...this.D.orders.filter(o => o.defId === defId && o.buyer !== exclude), ...this.botOrders.filter(o => o.defId === defId)]
      .sort((a, b) => b.price - a.price || a.created - b.created);
  }
  sellerName(l) { return l.bot ? `${l.bot} (bot)` : this.D.users[l.seller]?.name || '?'; }

  summary(query = '') {
    const q = query.toLowerCase();
    const by = new Map();
    const row = (defId) => { if (!by.has(defId)) by.set(defId, { defId, listings: 0, lowest: null, highestBid: null, sales24: 0, lastSale: null }); return by.get(defId); };
    for (const l of [...this.D.listings, ...this.liveBots()]) { const r = row(l.item.defId); r.listings++; r.lowest = r.lowest == null ? l.price : Math.min(r.lowest, l.price); }
    for (const o of [...this.D.orders, ...this.botOrders]) { const r = row(o.defId); r.highestBid = Math.max(r.highestBid ?? 0, o.price); }
    const dayAgo = this.now() - 86400000;
    for (const s of this.D.sales) { const r = row(s.defId); if (s.t > dayAgo) r.sales24++; if (!r.lastSale || s.t > r.lastSale.t) r.lastSale = { price: s.price, t: s.t }; }
    let out = [...by.values()].filter(r => SKINS[r.defId] || STICKERS[r.defId]);
    if (q) out = out.filter(e => { const d = SKINS[e.defId] || STICKERS[e.defId]; return d.name.toLowerCase().includes(q) || (d.weapon || '').includes(q) || (d.knife || '').includes(q); });
    return out.sort((a, b) => b.sales24 - a.sales24 || b.listings - a.listings).slice(0, 300);
  }

  item(defId, viewerId) {
    const listings = this.asks(defId).slice(0, 60).map(l => ({ id: l.id, price: l.price, item: l.item, seller: this.sellerName(l), sellerId: l.seller || null, bot: !!l.bot, created: l.created }));
    // buy orders grouped by price, best first
    const levels = new Map();
    for (const o of this.bids(defId)) {
      const lv = levels.get(o.price) || { price: o.price, qty: 0, mine: 0 };
      lv.qty += o.qty; if (o.buyer && o.buyer === viewerId) lv.mine += o.qty;
      levels.set(o.price, lv);
    }
    const sales = this.D.sales.filter(s => s.defId === defId).slice(-400);
    const myOrders = this.D.orders.filter(o => o.defId === defId && o.buyer === viewerId);
    return { defId, listings, orders: [...levels.values()].slice(0, 12), myOrders, sales, reference: this.reference(defId) };
  }

  mine(userId) {
    return { listings: this.D.listings.filter(l => l.seller === userId), orders: this.D.orders.filter(o => o.buyer === userId) };
  }

  // ------------------------------------------------------------ trades
  recordSale(defId, price, float, t = this.now()) {
    this.D.sales.push({ defId, price, float: float ?? null, t });
    if (this.D.sales.length > 50000) this.D.sales.splice(0, this.D.sales.length - 50000);
  }
  notify(user, msg) {
    if (!user) return;
    this.push(user.id, 'profile', this.profileOf(user));
    if (msg) this.push(user.id, 'toast', msg);
  }
  // Moves an item from a listing (player or bot) to a buyer (a user, or a bot
  // when buyer is null). The buyer pays `paid` (already taken for orders).
  transfer(listing, buyer, price) {
    let it;
    if (listing.bot) {
      it = listing.item;
      this.botListings = this.botListings.filter(x => x !== listing);
    } else {
      const seller = this.D.users[listing.seller];
      it = seller && this.E.findItem(seller, listing.item.uid);
      this.D.listings = this.D.listings.filter(x => x !== listing);
      if (!it) return null;
      this.E.removeItem(seller, it.uid);
      const proceeds = Math.floor(price * (1 - this.fee));
      seller.credits += proceeds;
      seller.history.unshift({ t: this.now(), type: 'market-sale', item: it.defId, value: proceeds });
      this.notify(seller, `Your ${itemDef(it)?.name} sold for ${price} credits (you receive ${proceeds})`);
    }
    delete it.listed;
    it.acquired = this.now();
    if (buyer) { buyer.items.push(it); buyer.history.unshift({ t: this.now(), type: 'buy', item: it.defId, value: price }); }
    else this.relist(it);
    this.recordSale(it.defId, price, it.float);
    this.db.dirty();
    return it;
  }

  // An item sold into a buy order (player order: the item goes to its owner;
  // bot order: the bot keeps it and lists it again later).
  fillOrder(order, it, seller) {
    if (seller) {
      this.E.removeItem(seller, it.uid);
      const proceeds = Math.floor(order.price * (1 - this.fee));
      seller.credits += proceeds;
      seller.history.unshift({ t: this.now(), type: 'market-sale', item: it.defId, value: proceeds });
    }
    delete it.listed;
    it.acquired = this.now();
    if (order.bot) this.relist(it, order.bot);
    else {
      const buyer = this.D.users[order.buyer];
      if (buyer) {
        buyer.items.push(it);
        buyer.history.unshift({ t: this.now(), type: 'buy', item: it.defId, value: order.price });
        this.notify(buyer, `Buy order filled: ${itemDef(it)?.name} for ${order.price} credits`);
      }
    }
    order.qty--;
    if (order.qty <= 0) {
      if (order.bot) this.botOrders = this.botOrders.filter(o => o !== order);
      else this.D.orders = this.D.orders.filter(o => o !== order);
    }
    this.recordSale(it.defId, order.price, it.float);
    this.db.dirty();
  }

  // A bot that bought something puts it back up a while later, at a markup.
  relist(it, bot = pick(BOT_NAMES)) {
    const t = this.now();
    this.botListings.push({ id: this.id('b'), bot, item: { ...it, uid: this.E.uid(), listed: undefined }, price: Math.max(1, Math.round(this.E.marketPrice(it) * rand(1.06, 1.2))),
      created: t + rand(0.2, 2) * 3600000, expires: t + rand(8, 30) * 3600000 });
  }

  // ------------------------------------------------------------ player actions
  list(user, uid, price) {
    const it = this.E.findItem(user, uid);
    price = Math.round(+price);
    if (!it) return { error: 'Item not found' };
    if (it.kind === 'case') return { error: 'Cases can’t be sold on the market' };
    if (it.listed) return { error: 'Already listed' };
    if (!(price >= 1 && price <= 1e7)) return { error: 'Price must be between 1 and 10,000,000' };
    if (this.D.listings.filter(l => l.seller === user.id).length >= 50) return { error: 'You can have at most 50 listings' };
    // someone already wants it at this price or more: sell to them at their price
    const bid = this.bids(it.defId, user.id)[0];
    if (bid && bid.price >= price) {
      this.fillOrder(bid, it, user);
      return { ok: true, sold: true, price: bid.price };
    }
    it.listed = true;
    for (const [k, v] of Object.entries(user.equipped)) if (v === uid) delete user.equipped[k];
    this.D.listings.push({ id: this.id('l'), seller: user.id, item: it, price, created: this.now() });
    this.db.dirty();
    return { ok: true };
  }

  cancel(user, id) {
    const l = this.D.listings.find(x => x.id === id && x.seller === user.id);
    if (!l) return { error: 'Listing not found' };
    this.D.listings = this.D.listings.filter(x => x !== l);
    const it = this.E.findItem(user, l.item.uid); if (it) delete it.listed;
    this.db.dirty();
    return { ok: true };
  }

  buy(user, id) {
    const l = this.D.listings.find(x => x.id === id) || this.liveBots().find(x => x.id === id);
    if (!l) return { error: 'That listing has already sold' };
    if (l.seller === user.id) return { error: 'You cannot buy your own listing' };
    if (user.credits < l.price) return { error: 'Not enough credits' };
    user.credits -= l.price;
    const it = this.transfer(l, user, l.price);
    if (!it) { user.credits += l.price; return { error: 'Listing is no longer valid' }; }
    return { ok: true, item: it };
  }

  order(user, defId, price, qty) {
    if (!SKINS[defId] && !STICKERS[defId]) return { error: 'Unknown item' };
    price = Math.round(+price); qty = Math.round(+qty || 1);
    if (!(price >= 1 && price <= 1e7)) return { error: 'Price must be between 1 and 10,000,000' };
    if (!(qty >= 1 && qty <= 100)) return { error: 'Quantity must be between 1 and 100' };
    if (this.D.orders.filter(o => o.buyer === user.id).length >= 30) return { error: 'You can have at most 30 buy orders' };
    if (user.credits < price * qty) return { error: `You need ${price * qty} credits for this order` };
    // hold the credits, then buy anything already listed at or below the price
    user.credits -= price * qty;
    let bought = 0;
    for (const l of this.asks(defId)) {
      if (bought >= qty || l.price > price) break;
      if (l.seller === user.id) continue;
      if (this.transfer(l, user, l.price)) { bought++; user.credits += price - l.price; }
    }
    if (bought < qty) this.D.orders.push({ id: this.id('o'), buyer: user.id, defId, price, qty: qty - bought, created: this.now() });
    this.db.dirty();
    return { ok: true, bought, waiting: qty - bought };
  }

  cancelOrder(user, id) {
    const o = this.D.orders.find(x => x.id === id && x.buyer === user.id);
    if (!o) return { error: 'Order not found' };
    this.D.orders = this.D.orders.filter(x => x !== o);
    user.credits += o.price * o.qty;
    this.db.dirty();
    return { ok: true, refunded: o.price * o.qty };
  }

  sellToOrder(user, uid, orderId) {
    const it = this.E.findItem(user, uid);
    if (!it) return { error: 'Item not found' };
    if (it.listed) return { error: 'Cancel the listing first' };
    const order = orderId ? this.bids(it.defId, user.id).find(o => o.id === orderId) : this.bids(it.defId, user.id)[0];
    if (!order) return { error: 'No one is buying this right now' };
    const price = order.price;
    this.fillOrder(order, it, user);
    return { ok: true, price, received: Math.floor(price * (1 - this.fee)) };
  }

  // ------------------------------------------------------------ bots
  restock(initial = false) {
    const t = this.now();
    this.botListings = this.botListings.filter(l => l.expires > t);
    this.botOrders = this.botOrders.filter(o => o.expires > t);
    const have = new Map(), bids = new Map();
    for (const l of this.botListings) have.set(l.item.defId, (have.get(l.item.defId) || 0) + 1);
    for (const o of this.botOrders) bids.set(o.defId, (bids.get(o.defId) || 0) + 1);
    for (const defId of this.defs) {
      const want = STOCK[this.tierOf(defId)] ?? 1;
      for (let n = have.get(defId) || 0; n < want; n++) {
        if (!initial && Math.random() < 0.6) break;   // fill up gradually, not all at once
        const item = this.makeItem(defId);
        const price = Math.max(1, Math.round(this.E.marketPrice(item) * rand(1.03, 1.22)));
        const l = { id: this.id('b'), bot: pick(BOT_NAMES), item, price, created: t - (initial ? rand(0, 20) * 3600000 : 0), expires: t + rand(4, 24) * 3600000 };
        // a player already bidding this much or more gets it at once
        const bid = this.D.orders.filter(o => o.defId === defId).sort((a, b) => b.price - a.price)[0];
        if (bid && bid.price >= price) { this.fillOrder(bid, item, null); continue; }
        this.botListings.push(l);
      }
      const wantBids = this.tierOf(defId) === 'legendary' ? 1 : 2;
      for (let n = bids.get(defId) || 0; n < wantBids; n++) {
        const price = Math.max(1, Math.round(this.floor(defId) * rand(0.72, 0.88)));
        this.botOrders.push({ id: this.id('q'), bot: pick(BOT_NAMES), defId, price, qty: 1 + Math.floor(Math.random() * 5), created: t, expires: t + rand(3, 12) * 3600000 });
      }
    }
  }

  tick() {
    const t = this.now();
    // 1. buy player listings priced near or under value (the cheaper, the sooner)
    for (const l of [...this.D.listings]) {
      if (t - l.created < 20000) continue;
      const ratio = l.price / Math.max(1, this.E.marketPrice(l.item));
      const chance = ratio <= 0.9 ? 0.5 : ratio <= 1.05 ? 0.012 : ratio <= 1.2 ? 0.003 : 0;
      if (Math.random() < chance) this.transfer(l, null, l.price);
    }
    // 2. sell into player buy orders that offer close to value
    for (const o of [...this.D.orders]) {
      if (t - o.created < 20000) continue;
      const ratio = o.price / Math.max(1, this.reference(o.defId));
      const chance = ratio >= 1.0 ? 0.35 : ratio >= 0.92 ? 0.012 : ratio >= 0.85 ? 0.003 : 0;
      if (Math.random() >= chance) continue;
      // hand over a copy worth no more than the order pays (any wear, like any seller)
      let item = null;
      for (let k = 0; k < 10 && !item; k++) { const c = this.makeItem(o.defId); if (this.E.marketPrice(c) <= o.price * 1.08) item = c; }
      if (item) this.fillOrder(o, item, null);
    }
    // 3. bots trading with each other: about 1500 sales a day across the market
    const n = Math.random() < 0.55 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const pool = this.botListings.filter(l => l.created <= t);
      if (!pool.length) break;
      // weight by how actively each tier trades
      let tot = 0; for (const l of pool) tot += ACTIVITY[this.tierOf(l.item.defId)] || 1;
      let r = Math.random() * tot, l = pool[0];
      for (const c of pool) { r -= ACTIVITY[this.tierOf(c.item.defId)] || 1; if (r <= 0) { l = c; break; } }
      const bid = this.bids(l.item.defId)[0];
      const price = Math.round(bid ? rand(bid.price, l.price) : l.price * rand(0.92, 1));
      this.botListings = this.botListings.filter(x => x !== l);
      this.recordSale(l.item.defId, Math.max(1, price), l.item.float);
      this.db.dirty();
    }
    // 4. top the shelves back up, slowly
    this.restock(false);
  }

  // A week or two of trading for items that have hardly any history yet.
  seedHistory() {
    const t = this.now(), have = new Map();
    for (const s of this.D.sales) have.set(s.defId, (have.get(s.defId) || 0) + 1);
    let added = 0;
    for (const defId of this.defs) {
      if ((have.get(defId) || 0) >= 6) continue;
      const tier = this.tierOf(defId);
      const count = tier === 'legendary' ? 4 + Math.floor(Math.random() * 6) : 10 + Math.floor(Math.random() * 16);
      let drift = rand(-0.08, 0.08);
      const times = Array.from({ length: count }, () => t - rand(0.1, 12) * 86400000).sort((a, b) => a - b);
      for (const when of times) {
        drift = Math.max(-0.2, Math.min(0.2, drift + rand(-0.03, 0.03)));
        const item = this.makeItem(defId);
        const price = Math.max(1, Math.round(this.E.marketPrice(item) * (1 + drift) * rand(0.94, 1.08)));
        this.D.sales.push({ defId, price, float: item.float ?? null, t: Math.round(when) });
        added++;
      }
    }
    if (added) {
      this.D.sales.sort((a, b) => a.t - b.t);
      if (this.D.sales.length > 50000) this.D.sales.splice(0, this.D.sales.length - 50000);
      this.db.dirty();
    }
    return added;
  }
}

export { BOT_NAMES, RARITY };
