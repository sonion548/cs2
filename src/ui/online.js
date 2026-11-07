// Online parts of the client menu: sign-in, friends drawer, party, trade
// offers, matchmaking status and the player market.
import { net } from '../net/client.js';
import * as P from '../items/profile.js';
import { SKINS, STICKERS, RARITY, CONDITIONS, condition, itemDef, itemTitle, WEAPON_NAMES } from '../items/catalog.js';
import { KNIFE_TYPES } from '../shared/knives.js';
import { thumbnail, Viewer } from './studio.js';
import { applySkin } from '../items/render.js';
import { patternInfo } from '../items/patterns.js';
import * as THREE from 'three';
import { ViewModel } from '../viewmodel.js';
import { WEAPONS } from '../weapons.js';
import { stickerCanvas } from '../items/stickers.js';
import { audio } from '../audio.js';

const h = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const CR = (n) => `<span class="cr">${fmt(n)}</span>`;
// today's move against yesterday, e.g. ▲ 3.1%
const chg = (c) => c == null ? '' : `<small class="chg ${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '▲' : '▼'} ${Math.abs(c * 100).toFixed(1)}%</small>`;
const MODE_NAMES = { casual: 'Casual', 'ranked-bots': 'Ranked vs bots', 'ranked-pvp': 'Ranked PvP' };

function defTitle(defId) {
  const d = SKINS[defId] || STICKERS[defId];
  if (!d) return { weapon: '?', name: defId };
  if (d.kind === 'sticker') return { weapon: 'Sticker', name: d.name };
  return { weapon: d.knife ? '★ ' + KNIFE_TYPES[d.knife] : WEAPON_NAMES[d.weapon], name: d.name };
}
function itemImg(it, el, priority = false) {
  if (it.kind === 'sticker') el.src = stickerCanvas(STICKERS[it.defId]).toDataURL();
  else if (it.kind === 'skin') thumbnail(it, url => { el.src = url; }, { priority });
}

export class OnlineUI {
  constructor(menu) {
    this.m = menu;
    this.social = { friends: [], requests: [] };
    this.party = null;
    this.trades = [];
    this.mm = { state: 'idle' };
    this.invites = [];
    this.drawerOpen = false;
  }

  onlineCount() { return this.social.friends.filter(f => f.status !== 'offline').length; }

  // ------------------------------------------------------------- events
  onNet(ev, d) {
    if (ev === 'social') this.social = d;
    if (ev === 'party') this.party = d;
    if (ev === 'trades') { const before = this.trades.length; this.trades = d; if (d.length > before) audio.ui(); }
    if (ev === 'mm') this.mm = d;
    if (ev === 'party.invite') { this.invites = [...this.invites.filter(i => i.partyId !== d.partyId), d]; this.drawerOpen = true; audio.ui(); }
    this.m.updateBar();
    this.renderDrawer();
    this.renderSearch();
    if (ev === 'party' && this.m.tab === 'play' && !this.m.$('.modal-layer')?.innerHTML) this.m.go('play');
  }

  mount() {
    this.drawer = document.createElement('aside');
    this.drawer.className = 'drawer';
    this.search = document.createElement('div');
    this.search.className = 'searching hidden';
    const wrap = document.createElement('div');
    wrap.append(this.drawer, this.search);
    this.drawer.onclick = (e) => this.drawerClick(e);
    this.search.onclick = async (e) => { if (e.target.closest('[data-cancel]')) { await net.rpc('mm.cancel'); this.mm = { state: 'idle' }; this.renderSearch(); } };
    this.renderDrawer(); this.renderSearch();
    clearInterval(this.searchTimer);
    this.searchTimer = setInterval(() => this.renderSearch(), 1000);
    return wrap;
  }

  toggleDrawer() {
    if (!P.isOnline()) return this.signIn();
    this.drawerOpen = !this.drawerOpen; this.renderDrawer();
  }

  // ------------------------------------------------------------- sign in
  signIn(reason = '') {
    const layer = this.m.$('.modal-layer');
    let mode = 'login';
    const render = (err = '') => {
      layer.innerHTML = `<div class="modal small auth">
        <div class="info">
          <button class="x" data-act="close">Close</button>
          <div class="rar"><i></i>Online account</div>
          <h2>${mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          ${reason ? `<p class="note">${h(reason)}</p>` : ''}
          <p class="note">An account keeps your inventory, credits and ranks on the server, so you can trade, use the market and play with friends. Items from offline play stay on this device.</p>
          <form>
            <label>Name<input name="name" autocomplete="username" maxlength="16" required></label>
            <label>Password<input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required></label>
            ${err ? `<p class="err">${h(err)}</p>` : ''}
            <div class="acts"><button class="pri" type="submit">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
              <button type="button" data-act="swap">${mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}</button></div>
          </form>
          <p class="note status">Server: <b>${net.status}</b></p>
        </div></div>`;
      layer.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const btn = e.target.querySelector('.pri'); btn.disabled = true; btn.textContent = 'Connecting…';
        let res;
        try { res = await net.login(f.get('name'), f.get('password'), mode === 'register'); }
        catch (er) { res = { error: `Can't reach the game server (${er.message}). Start it with "npm run server".` }; }
        if (res.error) return render(res.error);
        layer.innerHTML = ''; layer.onclick = null;
        this.m.toast(`Signed in as ${res.user.name}`);
      };
    };
    render();
    layer.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'close') { layer.innerHTML = ''; layer.onclick = null; }
      if (b.dataset.act === 'swap') { mode = mode === 'login' ? 'register' : 'login'; render(); }
    };
  }

  // ------------------------------------------------------------- drawer
  renderDrawer() {
    if (!this.drawer) return;
    this.drawer.classList.toggle('open', this.drawerOpen && P.isOnline());
    if (!P.isOnline()) { this.drawer.innerHTML = ''; return; }
    const st = { online: 'Online', 'in-match': 'In a match', searching: 'Searching', offline: 'Offline' };
    const fr = [...this.social.friends].sort((a, b) => (a.status === 'offline') - (b.status === 'offline') || a.name.localeCompare(b.name));
    const me = net.user?.id;
    // keep whatever the user is typing in the add-friend box across refreshes
    const prev = this.drawer.querySelector('.addf input');
    const typed = prev?.value || '', hadFocus = prev && document.activeElement === prev;
    this.drawer.innerHTML = `
      <header><b>${h(net.user?.name)}</b><button data-act="close">Close</button></header>
      ${this.invites.map(i => `<div class="invite">Party invite from <b>${h(i.from)}</b><div><button class="pri" data-accept-party="${i.partyId}">Join</button><button data-drop-invite="${i.partyId}">Ignore</button></div></div>`).join('')}
      <section>
        <h4>Party ${this.party ? `<small>${this.party.members.length}/5</small>` : ''}</h4>
        ${this.party ? this.party.members.map(m => `<div class="fr"><span class="dot ${m.status}"></span><span>${h(m.name)}${m.id === this.party.leader ? ' <em>leader</em>' : ''}</span>${this.party.leader === me && m.id !== me ? `<button data-kick="${m.id}">Kick</button>` : ''}</div>`).join('') + '<button data-act="leave-party" class="wide">Leave party</button>'
          : '<p class="note">Invite friends to queue together. The leader starts matchmaking for everyone.</p>'}
      </section>
      <section>
        <h4>Trade offers ${this.trades.length ? `<small>${this.trades.length}</small>` : ''}</h4>
        ${this.trades.length ? this.trades.map(t => `<button class="trade-row" data-trade="${t.id}">${t.from.id === me ? `To <b>${h(t.to.name)}</b>` : `From <b>${h(t.from.name)}</b>`}<span>${t.give.length} ⇄ ${t.get.length} items</span></button>`).join('') : '<p class="note">No pending offers.</p>'}
      </section>
      <section>
        <h4>Friends <small>${this.onlineCount()} online</small></h4>
        <form class="addf"><input name="n" placeholder="Add friend by name" maxlength="16"><button>Add</button></form>
        ${this.social.requests.map(r => `<div class="fr req"><span>${h(r.name)} wants to be friends</span><button class="pri" data-accept-friend="${r.id}">Accept</button><button data-decline-friend="${r.id}">✕</button></div>`).join('')}
        ${fr.map(f => `<div class="fr"><span class="dot ${f.status}"></span><span>${h(f.name)}<small>${st[f.status]}</small></span>
          <span class="fa">${f.status !== 'offline' ? `<button data-invite="${f.id}">Invite</button>` : ''}<button data-trade-with="${f.id}" data-name="${h(f.name)}">Trade</button><button data-remove="${f.id}" title="Remove">✕</button></span></div>`).join('') || '<p class="note">No friends yet. Add someone by their account name.</p>'}
      </section>
      <footer><button data-act="logout">Sign out</button></footer>`;
    const inp = this.drawer.querySelector('.addf input');
    inp.value = typed; if (hadFocus) inp.focus();
    this.drawer.querySelector('.addf').onsubmit = async (e) => {
      e.preventDefault();
      const n = e.target.n.value.trim(); if (!n) return;
      const r = await net.rpc('social.request', { name: n });
      this.m.toast(r.error || (r.friends ? 'Friend added' : 'Friend request sent'));
      if (r.friends) this.onNet('social', r);
      e.target.reset();
    };
  }

  async drawerClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    // the add-friend form handles its own submit (Enter fires a synthetic click on its button)
    if (b.closest('.addf')) return;
    audio.ui();
    const d = b.dataset;
    let r;
    if (d.act === 'close') { this.drawerOpen = false; return this.renderDrawer(); }
    if (d.act === 'logout') { await net.logout(); this.drawerOpen = false; this.m.toast('Signed out'); return; }
    if (d.act === 'leave-party') r = await net.rpc('party.leave');
    if (d.kick) r = await net.rpc('party.kick', { id: d.kick });
    if (d.invite) { r = await net.rpc('party.invite', { id: d.invite }); if (!r.error) this.m.toast('Invite sent'); }
    if (d.acceptParty) { r = await net.rpc('party.accept', { partyId: d.acceptParty }); this.invites = this.invites.filter(i => i.partyId !== d.acceptParty); }
    if (d.dropInvite) { this.invites = this.invites.filter(i => i.partyId !== d.dropInvite); }
    if (d.acceptFriend) { r = await net.rpc('social.accept', { id: d.acceptFriend }); if (!r.error) this.social = r; }
    if (d.declineFriend) { r = await net.rpc('social.decline', { id: d.declineFriend }); if (!r.error) this.social = r; }
    if (d.remove && confirm('Remove this friend?')) { r = await net.rpc('social.remove', { id: d.remove }); if (!r.error) this.social = r; }
    if (d.tradeWith) return this.openTrade(d.tradeWith, d.name);
    if (d.trade) return this.viewTrade(this.trades.find(t => t.id === d.trade));
    if (r?.error) this.m.toast(r.error);
    if (r && 'party' in r) this.party = r.party;
    this.renderDrawer();
  }

  partyPanel() {
    if (!P.isOnline() || !this.party) return '';
    return `<div class="partybox"><label>Party</label>${this.party.members.map(m => `<span class="pm">${h(m.name)}</span>`).join('')}
      <small>${this.party.leader === net.user?.id ? 'You lead: matchmaking queues the whole party' : 'Waiting for the leader to start matchmaking'}</small></div>`;
  }
  partyAction() {}

  // ------------------------------------------------------------- matchmaking
  async queue({ mode, size }) {
    const r = await net.rpc('mm.queue', { mode, size });
    if (r.error) return this.m.toast(r.error);
    this.mm = { state: 'searching', mode, size, since: Date.now() };
    this.renderSearch();
  }
  renderSearch() {
    if (!this.search) return;
    const s = this.mm;
    const on = s.state === 'searching';
    this.search.classList.toggle('hidden', !on);
    if (!on) return;
    const t = Math.floor((Date.now() - (s.since || Date.now())) / 1000);
    this.search.innerHTML = `<span class="pulse"></span><b>Searching</b> ${MODE_NAMES[s.mode] || ''} ${s.size}v${s.size} <span class="t">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span><button data-cancel="1">Cancel</button>`;
  }

  // ------------------------------------------------------------- trading
  async openTrade(friendId, name) {
    const theirs = await net.rpc('social.inventory', { id: friendId });
    if (theirs.error) return this.m.toast(theirs.error);
    const mine = P.getProfile().items.filter(i => !i.listed);
    const sel = { give: new Set(), get: new Set() };
    const layer = this.m.$('.modal-layer');
    const col = (items, side) => items.map(it => {
      const t = itemTitle(it), r = it.kind !== 'case' ? RARITY[itemDef(it).rarity] : null;
      return `<button class="ti ${sel[side].has(it.uid) ? 'on' : ''}" data-side="${side}" data-uid="${it.uid}" style="--rc:${r ? r.color : '#6d6a62'}"><img data-u="${it.uid}" alt=""><span class="w">${h(t.weapon)}</span><span class="n">${h(t.name)}</span>${it.kind === 'skin' ? `<i>${condition(it.float).id}</i>` : ''}</button>`;
    }).join('');
    const render = () => {
      layer.innerHTML = `<div class="modal trade">
        <div class="ch"><div><small>Trade offer</small><h2>You ⇄ ${h(name)}</h2></div><button class="x" data-act="close">Close</button></div>
        <div class="tcols">
          <section><h4>You give <small>${sel.give.size}</small></h4><div class="tgrid">${col(mine, 'give')}</div></section>
          <section><h4>You receive <small>${sel.get.size}</small></h4><div class="tgrid">${col(theirs.items, 'get')}</div></section>
        </div>
        <div class="cfoot"><input class="msg" maxlength="140" placeholder="Message (optional)"><button class="pri big" data-act="send" ${sel.give.size + sel.get.size ? '' : 'disabled'}>Send offer</button></div>
      </div>`;
      for (const img of layer.querySelectorAll('img[data-u]')) {
        const it = mine.find(i => i.uid === img.dataset.u) || theirs.items.find(i => i.uid === img.dataset.u);
        if (it?.kind === 'case') img.remove(); else if (it) itemImg(it, img);
      }
    };
    render();
    layer.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'close') { layer.innerHTML = ''; layer.onclick = null; return; }
      if (b.dataset.uid) { const set = sel[b.dataset.side]; set.has(b.dataset.uid) ? set.delete(b.dataset.uid) : set.add(b.dataset.uid); return render(); }
      if (b.dataset.act === 'send') {
        const r = await net.rpc('trade.offer', { to: friendId, give: [...sel.give], get: [...sel.get], message: layer.querySelector('.msg').value });
        if (r.error) return this.m.toast(r.error);
        this.trades = r.trades; this.renderDrawer();
        layer.innerHTML = ''; layer.onclick = null;
        this.m.toast('Trade offer sent');
      }
    };
  }

  viewTrade(t) {
    if (!t) return;
    const mineOut = t.from.id === net.user?.id;
    const layer = this.m.$('.modal-layer');
    const list = (items) => items.map(it => {
      const tt = itemTitle(it), r = it.kind !== 'case' ? RARITY[itemDef(it).rarity] : null;
      return `<div class="ti" style="--rc:${r ? r.color : '#6d6a62'}"><img data-u="${it.uid}" alt=""><span class="w">${h(tt.weapon)}</span><span class="n">${h(tt.name)}</span>${it.kind === 'skin' ? `<i>${condition(it.float).id} · ${it.float.toFixed(4)}</i>` : ''}<em>${CR(P.marketPrice(it))}</em></div>`;
    }).join('') || '<p class="note">Nothing</p>';
    const value = (items) => items.reduce((s, it) => s + P.marketPrice(it), 0);
    layer.innerHTML = `<div class="modal trade">
      <div class="ch"><div><small>Trade offer</small><h2>${mineOut ? `To ${h(t.to.name)}` : `From ${h(t.from.name)}`}</h2>${t.message ? `<p class="note">“${h(t.message)}”</p>` : ''}</div><button class="x" data-act="close">Close</button></div>
      <div class="tcols">
        <section><h4>${mineOut ? 'You give' : `${h(t.from.name)} gives`} <small>${CR(value(t.give))}</small></h4><div class="tgrid">${list(t.give)}</div></section>
        <section><h4>${mineOut ? 'You receive' : 'You give'} <small>${CR(value(t.get))}</small></h4><div class="tgrid">${list(t.get)}</div></section>
      </div>
      <div class="cfoot"><span class="note">Values are reference prices.</span><div class="acts">${mineOut ? '<button data-act="cancel">Cancel offer</button>' : '<button data-act="decline">Decline</button><button class="pri" data-act="accept">Accept trade</button>'}</div></div>
    </div>`;
    for (const img of layer.querySelectorAll('img[data-u]')) {
      const it = [...t.give, ...t.get].find(i => i.uid === img.dataset.u);
      if (it?.kind === 'case') img.remove(); else if (it) itemImg(it, img);
    }
    layer.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'close') { layer.innerHTML = ''; layer.onclick = null; return; }
      if (b.dataset.act === 'accept' && !confirm('Accept this trade? This cannot be undone.')) return;
      const r = await net.rpc('trade.respond', { id: t.id, accept: b.dataset.act === 'accept' });
      if (r.error) return this.m.toast(r.error);
      this.trades = r.trades; this.renderDrawer();
      layer.innerHTML = ''; layer.onclick = null;
      this.m.toast(b.dataset.act === 'accept' ? 'Trade complete' : 'Offer closed');
      if (this.m.tab === 'inventory') this.m.go('inventory');
    };
  }

  // ------------------------------------------------------------- market
  listDialog(it, after) {
    const ref = P.marketPrice(it);
    const box = document.createElement('div');
    box.className = 'picker';
    box.innerHTML = `<h4>Sell on the market</h4>
      <div class="mk-now"><p class="note">Checking buy orders…</p></div>
      <p class="note">Or list it at your own price for someone to buy. The market keeps a 10% fee. Reference price: ${CR(ref)}.</p>
      <label class="pricein">Price <input type="number" min="1" step="1" value="${Math.round(ref * 1.05)}"></label>
      <p class="note recv"></p>
      <div class="acts"><button class="pri" data-go="1">List item</button><button data-cancel="1">Cancel</button></div>`;
    const host = this.m.$('.modal-layer .info') || this.m.$('.modal-layer .modal');
    host.appendChild(box);
    const inp = box.querySelector('input'), recv = box.querySelector('.recv');
    const upd = () => { recv.innerHTML = `You receive ${CR(Math.floor((+inp.value || 0) * 0.9))}`; };
    inp.oninput = upd; upd();
    // the best buy order: sell to it at once
    net.rpc('market.item', { defId: it.defId }).then(r => {
      const now = box.querySelector('.mk-now');
      if (!now) return;
      const best = r.orders?.[0];
      now.innerHTML = best
        ? `<p class="note">Highest buy order: ${CR(best.price)} (${best.qty} wanted).</p><button class="pri" data-now="1">Sell now · you receive ${CR(Math.floor(best.price * 0.9))}</button>`
        : '<p class="note">No buy orders for this item right now.</p>';
    });
    const close = () => { const layer = this.m.$('.modal-layer'); layer.innerHTML = ''; layer.onclick = null; after?.(); };
    box.onclick = async (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cancel) return box.remove();
      if (b.dataset.now) {
        const r = await net.rpc('market.sellToOrder', { uid: it.uid });
        if (r.error) return this.m.toast(r.error);
        if (r.profile) P.setRemote(r.profile);
        this.m.toast(`Sold for ${fmt(r.price)} credits (you receive ${fmt(r.received)})`);
        return close();
      }
      const r = await net.rpc('market.list', { uid: it.uid, price: +inp.value });
      if (r.error) return this.m.toast(r.error);
      if (r.profile) P.setRemote(r.profile);
      this.m.toast(r.sold ? `A buy order took it at once for ${fmt(r.price)} credits` : 'Listed on the market');
      close();
    };
  }

  async renderMarket(page) {
    const q = this.marketQuery || '';
    page.innerHTML = `<div class="mk-head"><h3>Market</h3><form class="mk-search"><input name="q" placeholder="Search skins, knives, stickers" value="${h(q)}"></form>
      <button class="mk-mine">My listings &amp; orders</button></div><div class="mk-body"><p class="note">Loading…</p></div>`;
    page.querySelector('.mk-search').onsubmit = (e) => { e.preventDefault(); this.marketQuery = e.target.q.value; this.renderMarket(page); };
    page.querySelector('.mk-mine').onclick = () => this.renderMine(page);
    const r = await net.rpc('market.overview', { query: q });
    const body = page.querySelector('.mk-body');
    if (!body) return;
    if (r.error) { body.innerHTML = `<p class="note">${h(r.error)}</p>`; return; }
    if (!r.items.length) { body.innerHTML = q ? `<p class="note">Nothing in the catalogue matches “${h(q)}”. Try a weapon, a finish or a knife name, like “ak47 redline” or “karambit”.</p>` : '<p class="note">No listings or sales yet. List an item from your inventory to start the market.</p>'; return; }
    body.innerHTML = `${q ? `<p class="note">${r.items.length >= 300 ? 'First 300' : r.items.length} item${r.items.length === 1 ? '' : 's'} matching “${h(q)}”. Values change every day.</p>` : '<p class="note">Values change every day; the arrow shows today against yesterday. Search to find any item, listed or not.</p>'}
      <table class="mk-table"><tr><th></th><th>Item</th><th>Value today</th><th>Listings</th><th>Lowest price</th><th>Highest buy order</th><th>Last sale</th><th>24h sales</th></tr>
      ${r.items.map(e => { const t = defTitle(e.defId), d = SKINS[e.defId] || STICKERS[e.defId]; return `<tr data-def="${e.defId}"><td><img data-def="${e.defId}" alt=""></td><td style="--rc:${RARITY[d.rarity].color}"><span class="w">${h(t.weapon)}</span><b>${h(t.name)}</b></td><td>${e.value != null ? `${CR(e.value)} ${chg(e.change)}` : '—'}</td><td>${e.listings}</td><td>${e.lowest != null ? CR(e.lowest) : '—'}</td><td>${e.highestBid != null ? CR(e.highestBid) : '—'}</td><td>${e.lastSale ? CR(e.lastSale.price) : '—'}</td><td>${e.sales24}</td></tr>`; }).join('')}</table>`;
    // previews only for rows that scroll into view (the list can be hundreds long)
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const img = e.target, id = img.dataset.def;
        if (STICKERS[id]) img.src = stickerCanvas(STICKERS[id]).toDataURL();
        else thumbnail({ defId: id, float: 0.1, seed: 1, stickers: [] }, url => { img.src = url; });
      }
    }, { rootMargin: '300px' });
    for (const img of body.querySelectorAll('img[data-def]')) io.observe(img);
    body.onclick = (e) => { const tr = e.target.closest('tr[data-def]'); if (tr) this.renderItem(page, tr.dataset.def); };
  }

  async renderItem(page, defId) {
    const r = await net.rpc('market.item', { defId });
    if (r.error) { this.m.toast(r.error); return; }
    const t = defTitle(defId), d = SKINS[defId] || STICKERS[defId];
    const me = net.user?.id;
    // copies of this item you own that aren't listed (to sell into a buy order)
    const own = (P.getProfile().items || []).filter(it => it.defId === defId && !it.listed);
    page.innerHTML = `<div class="mk-head"><button class="mk-back">← Market</button><h3 style="color:${RARITY[d.rarity].color}">${h(t.weapon)} | ${h(t.name)}</h3>${SKINS[defId] ? '<button class="mk-insp" data-insp="1">Inspect in 3D</button><button class="mk-anim">Inspect animation</button>' : ''}</div>
      <div class="mk-item">
        <section><h4>Price history <small>value today ${CR(r.reference)} ${chg(r.change)}</small></h4>
          <div class="mk-range">${[[7, '7 days'], [30, '30 days'], [0, 'All']].map(([d, l]) => `<button data-range="${d}" class="${d === (this.chartRange ?? 30) ? 'on' : ''}">${l}</button>`).join('')}</div>
          <canvas class="chart" width="900" height="260"></canvas>
          <p class="note">Dots are sales (any wear), the orange line is the daily median and the dashed line is the item's value each day (a typical Field-Tested copy).</p>
          <h4>Recent sales</h4><table class="mk-table small">${r.sales.slice(-12).reverse().map(s => `<tr><td>${new Date(s.t).toLocaleString()}</td><td>${CR(s.price)}</td><td>${s.float != null ? s.float.toFixed(4) : ''}</td></tr>`).join('') || '<tr><td>No sales yet</td></tr>'}</table></section>
        <section><h4>Buy orders <small>${r.orders.length ? `highest ${fmt(r.orders[0].price)}` : 'none yet'}</small></h4>
          <table class="mk-table small">${r.orders.map(o => `<tr><td>${CR(o.price)}</td><td>${o.qty} wanted${o.mine ? ` <small>(${o.mine} yours)</small>` : ''}</td></tr>`).join('') || '<tr><td>No one is buying this right now.</td></tr>'}</table>
          <form class="mk-order"><label class="pricein">Price <input name="price" type="number" min="1" step="1" value="${Math.max(1, Math.round((r.orders[0]?.price || r.reference * 0.85) + 1))}"></label>
            <label class="pricein">Quantity <input name="qty" type="number" min="1" max="100" step="1" value="1"></label>
            <button class="pri" type="submit">Place buy order</button><p class="note mk-total"></p></form>
          ${r.myOrders.length ? `<h4>Your orders</h4><table class="mk-table small">${r.myOrders.map(o => `<tr><td>${CR(o.price)}</td><td>${o.qty} waiting</td><td><button data-cancel-order="${o.id}">Cancel</button></td></tr>`).join('')}</table>` : ''}
          ${own.length ? `<h4>Sell yours <small>to the highest buy order</small></h4><table class="mk-table small">${own.map(it => `<tr><td>${it.kind === 'skin' ? `${condition(it.float).name}<small class="mono"> ${it.float.toFixed(6)}</small>` : 'Sticker'}</td><td>${r.orders[0] ? `<button class="pri" data-sell="${it.uid}">Sell now · ${fmt(Math.floor(r.orders[0].price * 0.9))}</button>` : '<small>no buy orders</small>'}</td></tr>`).join('')}</table>` : ''}
          <h4>Listings <small>${r.listings.length}</small></h4>
          <table class="mk-table">${r.listings.map(l => `<tr><td><img data-l="${l.id}" ${l.item.kind === 'skin' ? `data-insp-l="${l.id}" title="Inspect this one" class="insp"` : ''} alt=""></td><td>${l.item.kind === 'skin' ? `${condition(l.item.float).name}<small class="mono"> ${l.item.float.toFixed(6)} · #${l.item.seed}</small>${(() => { const pt = patternInfo(SKINS[l.item.defId], l.item.seed); return pt.special ? ` <b class="pat-special">${h(pt.name)}</b>` : ''; })()}${l.item.stickers?.length ? `<small> · ${l.item.stickers.length} stickers</small>` : ''}` : ''}<small> · ${h(l.seller)}</small></td><td>${CR(l.price)}</td><td>${l.sellerId === me ? `<button data-cancel="${l.id}">Cancel</button>` : `<button class="pri" data-buy="${l.id}" data-price="${l.price}">Buy</button>`}</td></tr>`).join('') || '<tr><td>No one is selling this right now.</td></tr>'}</table>
        </section>
      </div>`;
    for (const img of page.querySelectorAll('img[data-l]')) { const l = r.listings.find(x => x.id === img.dataset.l); itemImg(l.item, img, true); }
    const chart = page.querySelector('.chart');
    const draw = () => this.drawChart(chart, r.sales, r.reference, r.values || [], this.chartRange ?? 30);
    draw();
    page.querySelector('.mk-range').onclick = (e) => {
      const b = e.target.closest('[data-range]'); if (!b) return;
      this.chartRange = +b.dataset.range;
      for (const x of page.querySelectorAll('.mk-range button')) x.classList.toggle('on', x === b);
      draw();
    };
    page.querySelector('.mk-back').onclick = () => this.renderMarket(page);
    // inspect: the header button shows a typical copy, a listing's picture that exact copy
    page.querySelector('.mk-insp')?.addEventListener('click', () => this.inspectSkin(defId));
    page.querySelector('.mk-anim')?.addEventListener('click', () => this.inspectAnimation(defId));
    for (const img of page.querySelectorAll('img[data-insp-l]')) img.addEventListener('click', () => this.inspectSkin(defId, r.listings.find(x => x.id === img.dataset.inspL)?.item));
    const form = page.querySelector('.mk-order'), total = form.querySelector('.mk-total');
    const updTotal = () => {
      const p = Math.round(+form.price.value || 0), q = Math.round(+form.qty.value || 0), low = r.listings[0]?.price;
      total.innerHTML = `${CR(p * q)} held until the order fills or you cancel it.${low != null && p >= low ? ' At or above the cheapest listing, so it buys straight away.' : ''}`;
    };
    form.oninput = updTotal; updTotal();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const res = await net.rpc('market.order', { defId, price: +form.price.value, qty: +form.qty.value });
      if (res.error) return this.m.toast(res.error);
      if (res.profile) P.setRemote(res.profile);
      this.m.toast(res.bought ? `Bought ${res.bought} straight away${res.waiting ? `, ${res.waiting} still on order` : ''}` : 'Buy order placed');
      this.renderItem(page, defId);
    };
    page.querySelector('.mk-item').onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || b.type === 'submit') return;
      let res, msg;
      if (b.dataset.buy) { if (!confirm(`Buy for ${fmt(+b.dataset.price)} credits?`)) return; res = await net.rpc('market.buy', { id: b.dataset.buy }); msg = 'Purchased: it is in your inventory'; }
      if (b.dataset.cancel) { res = await net.rpc('market.cancel', { id: b.dataset.cancel }); msg = 'Listing cancelled'; }
      if (b.dataset.cancelOrder) { res = await net.rpc('market.cancelOrder', { id: b.dataset.cancelOrder }); msg = `Order cancelled, ${fmt(res?.refunded || 0)} credits returned`; }
      if (b.dataset.sell) { res = await net.rpc('market.sellToOrder', { uid: b.dataset.sell }); msg = `Sold for ${fmt(res?.price || 0)} credits (you receive ${fmt(res?.received || 0)})`; }
      if (!res) return;
      if (res.error) return this.m.toast(res.error);
      if (res.profile) P.setRemote(res.profile);
      this.m.toast(msg);
      this.renderItem(page, defId);
    };
  }

  async renderMine(page) {
    const r = await net.rpc('market.mine');
    const orders = r.orders || [];
    page.innerHTML = `<div class="mk-head"><button class="mk-back">← Market</button><h3>My listings and buy orders</h3></div>
      <h4 class="mk-sub">Listings</h4>
      <table class="mk-table">${r.listings.map(l => { const t = defTitle(l.item.defId); return `<tr><td><img data-l="${l.id}" alt=""></td><td><span class="w">${h(t.weapon)}</span><b>${h(t.name)}</b></td><td>${CR(l.price)}</td><td>${new Date(l.created).toLocaleDateString()}</td><td><button data-cancel="${l.id}">Cancel</button></td></tr>`; }).join('') || '<tr><td>You have no active listings.</td></tr>'}</table>
      <h4 class="mk-sub">Buy orders</h4>
      <table class="mk-table">${orders.map(o => { const t = defTitle(o.defId), d = SKINS[o.defId] || STICKERS[o.defId]; return `<tr data-def="${o.defId}"><td style="--rc:${d ? RARITY[d.rarity].color : '#777'}"><span class="w">${h(t.weapon)}</span><b>${h(t.name)}</b></td><td>${CR(o.price)} each</td><td>${o.qty} waiting</td><td>${CR(o.price * o.qty)} held</td><td><button data-cancel-order="${o.id}">Cancel</button></td></tr>`; }).join('') || '<tr><td>You have no buy orders. Place one from any item’s page.</td></tr>'}</table>`;
    for (const img of page.querySelectorAll('img[data-l]')) { const l = r.listings.find(x => x.id === img.dataset.l); itemImg(l.item, img); }
    page.querySelector('.mk-back').onclick = () => this.renderMarket(page);
    page.onclick = async (e) => {
      const b = e.target.closest('[data-cancel], [data-cancel-order]');
      if (!b) { const tr = e.target.closest('tr[data-def]'); if (tr) this.renderItem(page, tr.dataset.def); return; }
      const res = b.dataset.cancel ? await net.rpc('market.cancel', { id: b.dataset.cancel }) : await net.rpc('market.cancelOrder', { id: b.dataset.cancelOrder });
      if (res.error) return this.m.toast(res.error);
      if (res.profile) P.setRemote(res.profile);
      if (res.refunded) this.m.toast(`Order cancelled, ${fmt(res.refunded)} credits returned`);
      this.renderMine(page);
    };
  }

  // Sales scatter + daily median line.
  // 3D inspect for any skin on the market: drag to turn it, scroll to zoom,
  // a slider for the float (across the finish's wear range) and the pattern.
  // While the slider moves the finish is repainted at half resolution so it
  // keeps up, then at full resolution when it is let go.
  inspectSkin(defId, base = null) {
    const d = SKINS[defId]; if (!d) return;
    const [lo, hi] = d.floatRange;
    const it = { kind: 'skin', defId, float: base?.float ?? +(lo + (hi - lo) * 0.25).toFixed(4), seed: base?.seed ?? 1, stickers: base?.stickers || [], tally: base?.tally ?? null };
    const t = defTitle(defId), r = RARITY[d.rarity];
    const layer = this.m.$('.modal-layer');
    const pct = (f) => ((f - lo) / Math.max(1e-6, hi - lo) * 100).toFixed(2);
    layer.innerHTML = `
      <div class="modal inspect mk-inspect" style="--rc:${r.color}">
        <div class="view"><div class="vp"></div>
          <div class="presets">${['left', 'right', 'top', 'muzzle'].map(v => `<button data-view="${v}">${v}</button>`).join('')}</div>
          <p class="hint">Drag to rotate · scroll to zoom</p>
        </div>
        <div class="info">
          <button class="x" data-act="close">Close</button>
          <div class="rar"><i></i>${r.name}${d.knife ? ' · Knife' : ''}</div>
          <h2><small>${h(t.weapon)}</small>${h(t.name)}</h2>
          <label class="floatin"><span>Float <b class="mono fv"></b></span>
            <input type="range" min="${lo}" max="${hi}" step="0.0001" value="${it.float}"></label>
          <div class="wearbar">${CONDITIONS.map((cc, i) => { const a = i ? CONDITIONS[i - 1].max : 0; return `<span data-c="${cc.id}" style="flex:${cc.max - a}">${cc.id}</span>`; }).join('')}<b></b></div>
          <dl>
            <dt>Condition</dt><dd class="cn"></dd>
            <dt>Pattern</dt><dd><input class="seedin mono" type="number" min="0" max="999" step="1" value="${it.seed}"> <span class="pn"></span></dd>
            <dt>Value today</dt><dd class="vt"></dd>
            ${it.stickers.length ? `<dt>Stickers</dt><dd>${it.stickers.length}</dd>` : ''}
          </dl>
          <p class="note">${base ? 'This is the listed copy; move the slider to compare other floats.' : 'Move the slider to see the finish at any float this skin can have.'} This skin's floats run from ${lo.toFixed(2)} to ${hi.toFixed(2)}.</p>
        </div>
      </div>`;
    const v = new Viewer(layer.querySelector('.vp'), { autoRotate: false });
    v.setItem(it);
    const gun = () => v.pivot.children[0];
    const slider = layer.querySelector('input[type=range]'), seedIn = layer.querySelector('.seedin');
    const info = () => {
      const c = condition(it.float);
      layer.querySelector('.fv').textContent = it.float.toFixed(4);
      layer.querySelector('.cn').textContent = c.name;
      layer.querySelector('.vt').innerHTML = CR(P.marketPrice(it));
      const pt = patternInfo(d, it.seed), pn = layer.querySelector('.pn');
      pn.textContent = pt.name; pn.className = 'pn' + (pt.special ? ' pat-special' : '');
      for (const sp of layer.querySelectorAll('.wearbar span')) sp.classList.toggle('on', sp.dataset.c === c.id);
      layer.querySelector('.wearbar b').style.left = `${(it.float * 100).toFixed(2)}%`;
      slider.style.setProperty('--p', pct(it.float) + '%');
    };
    let queued = 0, fine = 0;
    const repaint = (size) => { applySkin(gun(), it, { size }); };
    const onInput = () => {
      it.float = +(+slider.value).toFixed(4); info();
      if (!queued) queued = requestAnimationFrame(() => { queued = 0; repaint(512); });
      clearTimeout(fine); fine = setTimeout(() => repaint(1024), 250);
    };
    slider.addEventListener('input', onInput);
    seedIn.addEventListener('change', () => { it.seed = Math.max(0, Math.min(999, Math.round(+seedIn.value || 0))); seedIn.value = it.seed; repaint(1024); info(); });
    info();
    const close = () => { cancelAnimationFrame(queued); clearTimeout(fine); v.dispose(); layer.innerHTML = ''; layer.onclick = null; };
    layer.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) { if (e.target === layer.firstElementChild) close(); return; }
      if (b.dataset.view) return v.view(b.dataset.view);
      if (b.dataset.act === 'close') close();
    };
  }

  // The in-game inspect animation for a skin: first-person arms holding the
  // weapon (or knife) with this finish, the same code the game draws with.
  inspectAnimation(defId, base = null) {
    const d = SKINS[defId]; if (!d) return;
    const [lo, hi] = d.floatRange;
    const item = { defId, float: base?.float ?? +(lo + (hi - lo) * 0.25).toFixed(4), seed: base?.seed ?? 1, stickers: base?.stickers || [] };
    const weapon = d.knife ? 'knife' : d.weapon, type = d.knife ? 'melee' : WEAPONS[weapon]?.type || 'rifle';
    const t = defTitle(defId), r = RARITY[d.rarity];
    const layer = this.m.$('.modal-layer');
    layer.innerHTML = `
      <div class="modal inspect mk-inspect" style="--rc:${r.color}">
        <div class="view"><div class="vp anim"></div>
          <div class="presets"><button data-a="inspect">Play inspect</button><button data-a="team">${'CT arms'}</button>${type === 'melee' ? '<button data-a="fire">Swing</button>' : '<button data-a="fire">Fire</button><button data-a="reload">Reload</button>'}</div>
        </div>
        <div class="info">
          <button class="x" data-act="close">Close</button>
          <div class="rar"><i></i>${r.name}${d.knife ? ' · Knife' : ''}</div>
          <h2><small>${h(t.weapon)}</small>${h(t.name)}</h2>
          <p class="note">How it looks in your hands in a match. The inspect plays on its own every few seconds; switch arms to see it with either side's gloves.</p>
        </div>
      </div>`;
    const vp = layer.querySelector('.vp');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x3d4650, 1);
    vp.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    let team = 'CT', vm = null;
    const build = () => { vm = new ViewModel(team, renderer); vm.setWeapon(weapon, type, 0.4, item); };
    build();
    const cam = new THREE.Matrix4();
    let last = performance.now(), running = true, nextInspect = performance.now() + 900;
    const loop = () => {
      if (!running) return;
      requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (now > nextInspect && vm.inspectT < 0) { vm.inspect(); nextInspect = now + 5200; }
      const w = vp.clientWidth || 1, hgt = vp.clientHeight || 1;
      renderer.setSize(w, hgt, false);
      vm.update(dt, 0, true, w / hgt, cam);
      renderer.render(vm.scene, vm.camera);
    };
    loop();
    const close = () => { running = false; renderer.dispose(); renderer.forceContextLoss(); layer.innerHTML = ''; layer.onclick = null; };
    layer.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) { if (e.target === layer.firstElementChild) close(); return; }
      if (b.dataset.act === 'close') return close();
      if (b.dataset.a === 'inspect') { vm.inspectT = -1; vm.inspect(); nextInspect = performance.now() + 5200; }
      if (b.dataset.a === 'fire') vm.fire();
      if (b.dataset.a === 'reload') vm.reload(WEAPONS[weapon]?.reloadTime || 2.4);
      if (b.dataset.a === 'team') { team = team === 'CT' ? 'T' : 'CT'; b.textContent = `${team} arms`; build(); }
    };
  }

  // Price chart: sales as dots, their daily median as a line, and the item's
  // value on each day as a dashed step line. days: 7, 30, or 0 for everything.
  drawChart(cv, allSales, ref, values = [], days = 30) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 46, DAY = 86400000;
    const now = Date.now();
    const from = days ? now - days * DAY : Math.min(allSales[0]?.t ?? now - 30 * DAY, (values[0]?.[0] ?? Infinity) * DAY);
    const sales = allSales.filter(s => s.t >= from);
    const vals = values.filter(([d]) => (d + 1) * DAY > from);
    x.fillStyle = '#141413'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#2b2a26'; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = pad / 2 + i * (H - pad) / 4; x.beginPath(); x.moveTo(pad, y); x.lineTo(W - 10, y); x.stroke(); }
    const prices = sales.map(s => s.price).concat(vals.map(v => v[1]), [ref]);
    const lo = Math.min(...prices) * 0.9, hi = Math.max(...prices) * 1.1 || 1;
    const t0 = from, t1 = Math.max(now, t0 + 1);
    const X = (t) => pad + (Math.max(t0, Math.min(t1, t)) - t0) / (t1 - t0) * (W - pad - 10);
    const Y = (p) => pad / 2 + (1 - (p - lo) / (hi - lo || 1)) * (H - pad);
    x.fillStyle = '#8d897f'; x.font = '12px Barlow, sans-serif';
    for (let i = 0; i <= 4; i++) { const p = hi - i * (hi - lo) / 4; x.fillText(fmt(p), 4, pad / 2 + i * (H - pad) / 4 + 4); }
    // dates along the bottom
    const span = (t1 - t0) / DAY, step = span > 60 ? 14 : span > 20 ? 7 : span > 8 ? 2 : 1;
    for (let d = Math.ceil(t0 / DAY); d * DAY <= t1; d += step) x.fillText(new Date(d * DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), X(d * DAY) - 14, H - 6);
    // the item's value, day by day
    x.setLineDash([5, 5]); x.strokeStyle = '#c9b38a'; x.lineWidth = 1.5; x.beginPath();
    if (vals.length) vals.forEach(([d, v], i) => { const a = X(d * DAY), b = X((d + 1) * DAY); if (i) x.lineTo(a, Y(v)); else x.moveTo(a, Y(v)); x.lineTo(b, Y(v)); });
    else { x.moveTo(pad, Y(ref)); x.lineTo(W - 10, Y(ref)); }
    x.stroke(); x.setLineDash([]);
    if (!sales.length) {
      x.fillStyle = '#8d897f'; x.font = '15px Barlow, sans-serif'; x.fillText('No sales in this period. The dashed line is the item’s value each day.', pad + 10, H / 2);
    }
    x.fillStyle = 'rgba(232,99,43,0.55)';
    for (const s of sales) { x.beginPath(); x.arc(X(s.t), Y(s.price), 3, 0, 7); x.fill(); }
    // daily median
    const byDay = new Map();
    for (const s of sales) { const d = Math.floor(s.t / DAY); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(s.price); }
    const pts = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, arr]) => { arr.sort((a, b) => a - b); return [d * DAY + DAY / 2, arr[Math.floor(arr.length / 2)]]; });
    if (pts.length > 1) { x.strokeStyle = '#e8632b'; x.lineWidth = 2; x.beginPath(); pts.forEach(([t, p], i) => i ? x.lineTo(X(t), Y(p)) : x.moveTo(X(t), Y(p))); x.stroke(); }
  }
}
