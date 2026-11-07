// Main menu / client shell: Play, Inventory, Cases, Career, Settings.
import { patternInfo } from '../items/patterns.js';
import { Viewer, thumbnail, previewItem, warmThumbnails } from './studio.js';
import { QUALITY, QUALITY_ORDER, detectQuality } from '../gfx.js';
import * as P from '../items/profile.js';
import { SKINS, STICKERS, CASES, RARITY, RARITIES, CONDITIONS, condition, itemDef, itemTitle, KEY_PRICE, STICKER_CAPSULE, GOLD_CASE, WEAPON_NAMES } from '../items/catalog.js';
import { KNIFE_TYPES, buildGun } from '../gunmodels.js';
import { stickerCanvas } from '../items/stickers.js';
import { STICKER_SLOTS } from '../items/render.js';
import { MAPS } from '../maps.js';
import * as R from '../ranked.js';
import { net } from '../net/client.js';
import { OnlineUI } from './online.js';
import { audio } from '../audio.js';
import { WEAPONS } from '../weapons.js';
import { ACTIONS, DEFAULT_BINDS, bindsFrom, keyLabel } from '../input.js';
import { DEFAULT_CROSSHAIR, crosshairFrom, drawCrosshair } from '../crosshair.js';

const h = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n.toLocaleString('en-US');
const CR = (n) => `<span class="cr">${fmt(n)}</span>`;

export const MODES = [
  { id: '5v5', label: 'Competitive', size: 5, win: 5, note: '5 v 5 · first to 5' },
  { id: '3v3', label: 'Skirmish', size: 3, win: 5, note: '3 v 3 · first to 5' },
  { id: '2v2', label: 'Wingman', size: 2, win: 5, note: '2 v 2 · first to 5' },
  { id: '1v1', label: 'Duel', size: 1, win: 5, note: '1 v 1 · first to 5' },
];
export const DIFFS = [['Recruit', 0.05], ['Regular', 0.3], ['Veteran', 0.55], ['Expert', 0.78], ['Elite', 0.95]];

function caseArt(def) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const x = c.getContext('2d');
  x.translate(160, 108);
  // body
  x.fillStyle = '#2a2925'; x.fillRect(-110, -55, 220, 110);
  x.fillStyle = def.color; x.fillRect(-110, -55, 220, 14); x.fillRect(-110, 41, 220, 14);
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(-110, -41, 220, 3);
  // latches
  x.fillStyle = '#8a877e'; x.fillRect(-104, -8, 14, 16); x.fillRect(90, -8, 14, 16);
  x.font = '700 22px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillStyle = '#ebe7df';
  x.fillText(def.name.replace(' Case', '').toUpperCase(), 0, 8);
  return c.toDataURL();
}
const caseArtCache = {};
const caseDef = (id) => (id === 'capsule' ? STICKER_CAPSULE : id === 'gold' ? GOLD_CASE : CASES[id]);
function caseThumb(id) { return caseArtCache[id] ||= caseArt(caseDef(id)); }
const stickerThumbCache = {};
function stickerThumb(id) { return stickerThumbCache[id] ||= stickerCanvas(STICKERS[id]).toDataURL(); }

function rarityOf(item) {
  const d = itemDef(item);
  if (item.kind === 'case') return null;
  return RARITY[d.rarity];
}

export class Menu {
  constructor(root, settings, onPlay) {
    this.root = root; this.settings = settings; this.onPlay = onPlay;
    this.tab = 'play';
    this.state = { queue: 'casual', mode: '5v5', ladder: '5v5', diff: 2, side: 'random', map: 'dunehold' };
    this.invFilter = 'all'; this.invSort = 'newest';
    this.viewers = [];
    this.online = new OnlineUI(this);
    P.onChange(() => this.updateBar());
  }

  // Re-render after sign-in/out or a server profile push (soft = keep modals).
  refresh(soft = false) {
    if (this.root.style.display === 'none' || !this.$) return;
    this.updateBar();
    if (soft && this.$('.modal-layer')?.innerHTML) return;
    if (['play', 'inventory', 'ranked', 'market', 'cases'].includes(this.tab)) this.go(this.tab);
  }
  onNet(ev, d) { this.online.onNet(ev, d); }
  queue(spec) { this.online.queue(spec); }

  show(result) {
    this.root.style.display = 'block';
    this.root.innerHTML = `
      <div class="client">
        <header class="bar">
          <div class="mark"><i></i>VANTAGE</div>
          <nav>${['play', 'ranked', 'inventory', 'cases', 'market', 'career', 'settings'].map(t => `<button data-tab="${t}">${t}</button>`).join('')}</nav>
          <div class="who"><span class="lvl"></span><span class="credits"></span><button class="friends-btn"></button><span class="pname"></span></div>
        </header>
        <main class="page"></main>
        <div class="modal-layer"></div>
      </div>`;
    this.$ = (s) => this.root.querySelector(s);
    this.root.querySelector('nav').onclick = (e) => { const t = e.target.dataset.tab; if (t) { audio.init(); audio.ui(); this.go(t); } };
    this.root.querySelector('.friends-btn').onclick = () => { audio.init(); audio.ui(); this.online.toggleDrawer(); };
    this.root.querySelector('.client').appendChild(this.online.mount());
    this.updateBar();
    this.go(this.tab);
    if (result) this.showResult(result);
  }

  hide() { this.disposeViewers(); this.root.style.display = 'none'; this.root.innerHTML = ''; }

  updateBar() {
    if (!this.$ || !this.$('.credits')) return;
    const p = P.getProfile(), lv = P.level();
    this.$('.credits').innerHTML = CR(p.credits);
    this.$('.pname').textContent = P.isOnline() ? p.name : 'Offline';
    this.$('.pname').classList.toggle('off', !P.isOnline());
    const fb = this.$('.friends-btn');
    if (fb) fb.innerHTML = P.isOnline() ? `Friends <b>${this.online.onlineCount()}</b>` : 'Sign in';
    this.$('.lvl').innerHTML = `LV ${lv.level}<b style="--p:${(lv.progress * 100).toFixed(0)}%"></b>`;
  }

  disposeViewers() { for (const v of this.viewers) v.dispose(); this.viewers = []; }

  go(tab) {
    if (tab === 'market' && !P.isOnline()) { this.online.signIn('The market needs an online account.'); return; }
    this.tab = tab;
    this.disposeViewers();
    for (const b of this.root.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.tab === tab);
    const page = this.$('.page');
    // every page installs its own click handler; clear the last one so it can't
    // react to clicks on this page (the Play handler used to send you back to Play)
    page.onclick = null;
    page.className = 'page page-' + tab;
    this[`render_${tab}`](page);
  }

  // ------------------------------------------------------------- play
  render_play(page) {
    const s = this.state, map = MAPS[s.map];
    const eq = (slot) => P.equippedFor(slot);
    const slots = [['ak47', 'Rifle · Attack'], ['m4a1', 'Rifle · Defend'], ['awp', 'Sniper'], ['knife', 'Knife']];
    page.innerHTML = `
      <section class="showcase">
        <div class="stage"></div>
        <div class="stage-cap"><span class="k">Equipped</span><span class="v"></span></div>
        <div class="loadout">${slots.map(([slot, label]) => {
          const it = eq(slot);
          const t = it ? itemTitle(it) : null;
          return `<button class="slot" data-slot="${slot}"><span class="k">${label}</span><span class="v">${t ? h(t.name) : 'Stock'}</span><img alt=""></button>`;
        }).join('')}</div>
      </section>
      <aside class="queue">
        <div class="tog qtype">${[['casual', 'Casual'], ['ranked', 'Ranked']].map(([v, l]) => `<button data-queue="${v}" class="${s.queue === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${this.online.partyPanel()}
        ${P.isOnline() && s.queue === 'casual' ? `
        <h3>Casual <small>online</small></h3>
        <div class="modes">${[['5v5', 'Casual 5v5', 'Real players, bots fill empty slots'], ['2v2', 'Casual 2v2', 'Real players, bots fill empty slots']].map(([id, l, n]) => `<button class="mode ${s.mode === id ? 'on' : ''}" data-mode="${id}"><b>${id}</b><span>${l}<small>${n}</small></span></button>`).join('')}
          <button class="mode ${s.mode === 'offline' ? 'on' : ''}" data-mode="offline"><b>Solo</b><span>Practice vs bots<small>Solo match against bots (choose difficulty below)</small></span></button></div>` : ''}
        ${P.isOnline() && s.queue === 'casual' && s.mode === 'offline' ? `
        <div class="field"><label>Opponents</label><div class="steps">${DIFFS.map((d, i) => `<button data-diff="${i}" class="${i <= s.diff ? 'fill' : ''} ${i === s.diff ? 'on' : ''}" title="${d[0]}"></button>`).join('')}<em>${DIFFS[s.diff][0]}</em></div></div>` : ''}
        ${!P.isOnline() && s.queue === 'casual' ? `
        <h3>Matchmaking <small>vs bots</small></h3>
        <div class="modes">${MODES.map(m => `<button class="mode ${s.mode === m.id ? 'on' : ''}" data-mode="${m.id}"><b>${m.id}</b><span>${m.label}<small>${m.note}</small></span></button>`).join('')}</div>
        <div class="field"><label>Opponents</label><div class="steps">${DIFFS.map((d, i) => `<button data-diff="${i}" class="${i <= s.diff ? 'fill' : ''} ${i === s.diff ? 'on' : ''}" title="${d[0]}"></button>`).join('')}<em>${DIFFS[s.diff][0]}</em></div></div>
        <div class="field"><label>Side</label><div class="tog">${[['T', 'Attack'], ['CT', 'Defend'], ['random', 'Any']].map(([v, l]) => `<button data-side="${v}" class="${s.side === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
        ${s.queue === 'ranked' ? `
        <h3>Ranked</h3>
        <div class="modes">${Object.entries(R.LADDERS).filter(([, l]) => P.isOnline() || !l.online).map(([id, l]) => { const L = R.ladder(id); return `<button class="mode rk ${s.ladder === id ? 'on' : ''}" data-ladder="${id}"><img src="${R.rankEmblem(L.rank, 64)}" alt=""><span>${l.label}${l.online ? '' : ' · vs bots'}<small>${L.rank == null ? `Placements ${L.placements}/5` : `${R.rankName(L.rank)} · ${L.rp} RP`}</small></span></button>`; }).join('')}
          ${P.isOnline() ? '' : '<button class="mode rk" data-signin="1"><b>PvP</b><span>Ranked vs players<small>Sign in to play against real people</small></span></button>'}</div>
        <div class="field"><label>Opponents</label><p class="note">${R.LADDERS[s.ladder]?.online ? 'Real players matched by hidden rating; the search window widens the longer you wait.' : `Bots are matched to your hidden rating: currently around <b>${R.rankName(R.mmrToRankIndex(R.ladder(s.ladder).mmr))}</b> strength.`} Sides are assigned randomly.</p></div>` : ''}
        <div class="field map"><label>Map</label><div class="mapcard"><canvas width="88" height="66"></canvas><div><b>${h(map.name)}</b><small>${h(map.description)}</small></div></div></div>
        <button class="go">${s.queue === 'ranked' ? 'Find ranked match' : 'Find match'}</button>
      </aside>`;
    // map mini radar
    const mc = page.querySelector('.mapcard canvas').getContext('2d');
    const g = map.grid, cs = Math.min(88 / g[0].length, 66 / g.length);
    mc.fillStyle = '#121211'; mc.fillRect(0, 0, 88, 66);
    g.forEach((row, z) => [...row].forEach((c, x) => { if (c !== '#') { mc.fillStyle = 'AB'.includes(c) ? '#8a6e45' : '#4a4944'; mc.fillRect(x * cs, z * cs, cs, cs); } }));

    const v = new Viewer(page.querySelector('.stage'), { autoRotate: true });
    this.viewers.push(v);
    const showSlot = (slot) => {
      const it = eq(slot);
      if (it) v.setItem(it); else v.setObject(stockModel(slot));
      const t = it ? itemTitle(it) : { weapon: slot === 'knife' ? 'Field Knife' : WEAPON_NAMES[slot], name: 'Stock' };
      page.querySelector('.stage-cap .v').textContent = `${t.weapon} | ${t.name}`;
      for (const b of page.querySelectorAll('.slot')) b.classList.toggle('on', b.dataset.slot === slot);
    };
    showSlot('ak47');
    for (const b of page.querySelectorAll('.slot')) {
      const it = eq(b.dataset.slot);
      if (it) thumbnail(it, url => { b.querySelector('img').src = url; });
    }
    page.onclick = (e) => {
      const t = e.target.closest('button'); if (!t) return;
      audio.init(); audio.ui();
      if (t.dataset.slot) return showSlot(t.dataset.slot);
      if (t.dataset.mode) s.mode = t.dataset.mode;
      if (t.dataset.diff) s.diff = +t.dataset.diff;
      if (t.dataset.side) s.side = t.dataset.side;
      if (t.dataset.queue) s.queue = t.dataset.queue;
      if (t.dataset.ladder) s.ladder = t.dataset.ladder;
      if (t.dataset.signin) return this.online.signIn();
      if (t.dataset.party) return this.online.partyAction(t.dataset.party, t.dataset.id);
      if (t.classList.contains('go')) {
        if (P.isOnline()) {
          // online: everything goes through server matchmaking (parties included)
          if (s.queue === 'ranked') {
            const L = R.LADDERS[s.ladder];
            return this.online.queue({ mode: L.online ? 'ranked-pvp' : 'ranked-bots', size: L.size });
          }
          if (s.mode !== 'offline' && (s.mode === '5v5' || s.mode === '2v2')) return this.online.queue({ mode: 'casual', size: s.mode === '5v5' ? 5 : 2 });
        }
        if (s.queue === 'ranked') {
          const q = R.canQueue(s.ladder);
          if (!q.ok) return this.toast(q.reason);
          return this.onPlay({ map: s.map, ranked: s.ladder });
        }
        const m = MODES.find(m => m.id === s.mode) || MODES[0];
        return this.onPlay({ map: s.map, teamSize: m.size, winRounds: m.win, skill: DIFFS[s.diff][1], side: s.side });
      }
      this.go('play');
    };
  }

  // ------------------------------------------------------------- inventory
  render_inventory(page) {
    const p = P.getProfile();
    const cats = [['all', 'All'], ['rifle', 'Rifles'], ['smg', 'SMGs'], ['pistol', 'Pistols'], ['sniper', 'Snipers'], ['heavy', 'Heavy'], ['knife', 'Knives'], ['sticker', 'Stickers'], ['case', 'Containers']];
    const catOf = (it) => {
      if (it.kind !== 'skin') return it.kind;
      const d = SKINS[it.defId];
      if (d.knife) return 'knife';
      const c = WEAPONS[d.weapon]?.cls || 'pistol';
      return c === 'shotgun' || c === 'lmg' ? 'heavy' : c;
    };
    let items = p.items.filter(it => this.invFilter === 'all' || catOf(it) === this.invFilter);
    const sorters = {
      newest: (a, b) => b.acquired - a.acquired,
      rarity: (a, b) => (rarityOf(b)?.tier ?? -1) - (rarityOf(a)?.tier ?? -1),
      value: (a, b) => P.marketPrice(b) - P.marketPrice(a),
    };
    items.sort(sorters[this.invSort]);
    const total = p.items.reduce((s, it) => s + P.marketPrice(it), 0);
    page.innerHTML = `
      <aside class="filters">
        <h3>Inventory</h3>
        <div class="count">${p.items.length} items · ${CR(total)} est.</div>
        ${cats.map(([id, l]) => `<button data-cat="${id}" class="${this.invFilter === id ? 'on' : ''}">${l}<span>${id === 'all' ? p.items.length : p.items.filter(i => catOf(i) === id).length}</span></button>`).join('')}
        <label class="sort">Sort <select>${[['newest', 'Newest'], ['rarity', 'Rarity'], ['value', 'Value']].map(([v, l]) => `<option value="${v}" ${this.invSort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </aside>
      <section class="grid">${items.length ? items.map(it => this.tile(it)).join('') : '<p class="empty">Nothing here yet. Open a container or win a match to get drops.</p>'}</section>`;
    page.querySelector('select').onchange = (e) => { this.invSort = e.target.value; this.go('inventory'); };
    page.querySelector('.filters').onclick = (e) => { const c = e.target.closest('[data-cat]'); if (c) { this.invFilter = c.dataset.cat; this.go('inventory'); } };
    page.querySelector('.grid').onclick = (e) => {
      const t = e.target.closest('.tile'); if (!t) return;
      audio.init(); audio.ui();
      const it = P.findItem(t.dataset.uid);
      if (it.kind === 'skin') this.inspect(it);
      else if (it.kind === 'case') { this.go('cases'); this.openCaseView(it.defId); }
      else this.stickerInfo(it);
    };
    this.loadThumbs(page);
  }

  tile(it) {
    const r = rarityOf(it), t = itemTitle(it), p = P.getProfile();
    const equipped = Object.values(p.equipped).includes(it.uid);
    const cond = it.kind === 'skin' ? condition(it.float).id : '';
    const img = it.kind === 'case' ? caseThumb(it.defId) : it.kind === 'sticker' ? stickerThumb(it.defId) : '';
    return `<button class="tile ${it.kind}" data-uid="${it.uid}" style="--rc:${r ? r.color : '#6d6a62'}">
      <img ${img ? `src="${img}"` : ''} alt="" ${it.kind === 'skin' ? 'data-thumb="1"' : ''}>
      ${equipped ? '<i class="eq">Equipped</i>' : ''}${it.listed ? '<i class="eq listed">Listed</i>' : ''}
      ${cond ? `<i class="cond">${cond}</i>` : ''}
      ${it.tally != null ? `<i class="tally">${it.tally}</i>` : ''}
      ${it.stickers?.length ? `<i class="stk">${it.stickers.map(s => `<img src="${stickerThumb(s.defId)}" alt="">`).join('')}</i>` : ''}
      <span class="w">${h(t.weapon)}</span><span class="n">${h(t.name)}</span>
    </button>`;
  }

  loadThumbs(scope) {
    for (const el of scope.querySelectorAll('img[data-thumb]')) {
      const it = P.findItem(el.closest('[data-uid]').dataset.uid);
      if (it) thumbnail(it, url => { el.src = url; });
    }
  }

  // ------------------------------------------------------------- inspect
  inspect(it, { fromUnbox = false } = {}) {
    const layer = this.$('.modal-layer');
    const render = () => {
      const d = SKINS[it.defId], r = RARITY[d.rarity], t = itemTitle(it), c = condition(it.float);
      const p = P.getProfile();
      const equipped = Object.values(p.equipped).includes(it.uid);
      const stickersOwned = p.items.filter(x => x.kind === 'sticker');
      const slots = d.knife ? [] : STICKER_SLOTS[d.weapon] || [0, 1, 2, 3];
      layer.innerHTML = `
        <div class="modal inspect" style="--rc:${r.color}">
          <div class="view"><div class="vp"></div>
            <div class="presets">${['left', 'right', 'top', 'muzzle'].map(v => `<button data-view="${v}">${v}</button>`).join('')}</div>
            <p class="hint">Drag to rotate · scroll to zoom</p>
          </div>
          <div class="info">
            <button class="x" data-act="close">Close</button>
            <div class="rar"><i></i>${r.name}${d.knife ? ' · Knife' : ''}</div>
            <h2><small>${h(t.weapon)}</small>${h(t.name)}</h2>
            <dl>
              <dt>Condition</dt><dd>${c.name}</dd>
              <dt>Float</dt><dd class="mono">${it.float.toFixed(9)}</dd>
              <dt>Pattern</dt><dd class="mono">${it.seed}${(() => { const pt = patternInfo(d, it.seed); return pt.name ? ` · <span class="${pt.special ? 'pat-special' : ''}">${h(pt.name)}</span>` : ''; })()}</dd>
              ${it.tally != null ? `<dt>Tally</dt><dd class="mono">${it.tally} confirmed kills</dd>` : ''}
              <dt>Market</dt><dd>${CR(P.marketPrice(it))}</dd>
            </dl>
            <div class="wearbar">${CONDITIONS.map((cc, i) => { const lo = i ? CONDITIONS[i - 1].max : 0; return `<span style="flex:${cc.max - lo}" class="${cc === c ? 'on' : ''}">${cc.id}</span>`; }).join('')}<b style="left:${(it.float * 100).toFixed(2)}%"></b></div>
            ${slots.length ? `<h4>Stickers</h4><div class="sslots">${slots.map((_, i) => {
              const st = it.stickers.find(s => s.slot === i);
              return st ? `<button class="ss full" data-scrape="${i}" title="Scrape (${Math.round((st.wear || 0) * 100)}% worn)"><img src="${stickerThumb(st.defId)}" style="opacity:${1 - (st.wear || 0) * 0.7}" alt=""></button>`
                : `<button class="ss" data-apply="${i}" ${stickersOwned.length ? '' : 'disabled'}>+</button>`;
            }).join('')}</div><p class="note">${stickersOwned.length ? 'Click + to apply a sticker, click a sticker to scrape it.' : 'Open a sticker capsule to get stickers.'}</p>` : ''}
            <div class="acts">
              ${fromUnbox ? '<button data-act="close" class="pri">Continue</button>' : ''}
              <button data-act="equip" class="${fromUnbox ? '' : 'pri'}">${equipped ? 'Unequip' : 'Equip'}</button>
              ${P.isOnline() ? (it.listed ? '<button data-act="unlist">Cancel market listing</button>' : '<button data-act="list">Sell on market</button>') : ''}
              <button data-act="sell" ${it.listed ? 'disabled' : ''}>Quick sell · ${CR(Math.floor(P.marketPrice(it) * 0.87))}</button>
            </div>
          </div>
        </div>`;
      const v = new Viewer(layer.querySelector('.vp'), { autoRotate: false });
      v.setItem(it);
      this.modalViewer?.dispose(); this.modalViewer = v;
    };
    render();
    layer.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) { if (e.target === layer.firstElementChild) close(); return; }
      audio.ui();
      if (b.dataset.view) return this.modalViewer.view(b.dataset.view);
      if (b.dataset.act === 'close') return close();
      if (b.dataset.act === 'equip') { const r = await P.equip(it.uid); if (r?.error) this.toast(r.error); return render(); }
      if (b.dataset.act === 'sell') {
        if (!confirm(`Sell ${itemTitle(it).name} for ${Math.floor(P.marketPrice(it) * 0.87)} credits?`)) return;
        const r = await P.sellItem(it.uid); if (r?.error) return this.toast(r.error); return close();
      }
      if (b.dataset.scrape != null) { await P.scrapeSticker(it.uid, +b.dataset.scrape); return render(); }
      if (b.dataset.act === 'list') return this.online.listDialog(it, render);
      if (b.dataset.act === 'unlist') {
        const mine = await net.rpc('market.mine');
        const l = (mine.listings || []).find(x => x.item?.uid === it.uid);
        if (!l) return this.toast('That listing has already sold or been cancelled');
        const r = await net.rpc('market.cancel', { id: l.id });
        if (r.error) return this.toast(r.error);
        if (r.profile) P.setRemote(r.profile);
        Object.assign(it, P.getProfile().items.find(x => x.uid === it.uid) || {}); delete it.listed;
        this.toast('Listing cancelled: it is back in your inventory');
        return render();
      }
      if (b.dataset.apply != null) return this.pickSticker(it, +b.dataset.apply, render);
    };
    const close = () => { this.modalViewer?.dispose(); this.modalViewer = null; layer.innerHTML = ''; layer.onclick = null; if (this.tab === 'inventory') this.go('inventory'); };
  }

  pickSticker(skin, slot, rerender) {
    const p = P.getProfile();
    const owned = p.items.filter(x => x.kind === 'sticker');
    const box = document.createElement('div');
    box.className = 'picker';
    box.innerHTML = `<h4>Apply sticker to slot ${slot + 1}</h4><p class="note">Stickers are permanent until scraped off completely.</p>
      <div class="pgrid">${owned.map(s => `<button data-s="${s.uid}"><img src="${stickerThumb(s.defId)}" alt=""><span>${h(STICKERS[s.defId].name)}</span></button>`).join('')}</div>
      <button class="cancel">Cancel</button>`;
    this.$('.modal-layer .info').appendChild(box);
    box.onclick = async (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.s) { const r = await P.applySticker(skin.uid, b.dataset.s, slot); if (r?.error) this.toast(r.error); audio.ui(); }
      rerender();
    };
  }

  stickerInfo(it) {
    const d = STICKERS[it.defId];
    const layer = this.$('.modal-layer');
    layer.innerHTML = `<div class="modal small" style="--rc:${RARITY[d.rarity].color}"><img class="big" src="${stickerThumb(it.defId)}" alt="">
      <div class="info"><div class="rar"><i></i>${RARITY[d.rarity].name} sticker</div><h2>${h(d.name)}</h2><p class="note">Apply it from a weapon's inspect screen.</p>
      <div class="acts"><button data-act="close" class="pri">Close</button>${P.isOnline() ? '<button data-act="list">Sell on market</button>' : ''}<button data-act="sell">Quick sell · ${CR(Math.floor(P.marketPrice(it) * 0.87))}</button></div></div></div>`;
    layer.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'sell') await P.sellItem(it.uid);
      if (b.dataset.act === 'list') return this.online.listDialog(it, () => this.go('inventory'));
      layer.innerHTML = ''; this.go('inventory');
    };
  }

  // ------------------------------------------------------------- cases
  render_cases(page) {
    const p = P.getProfile();
    const owned = {};
    for (const it of p.items) if (it.kind === 'case') owned[it.defId] = (owned[it.defId] || 0) + 1;
    const all = [...(owned.gold ? [GOLD_CASE] : []), ...Object.values(CASES), STICKER_CAPSULE];
    page.innerHTML = `
      <div class="cases-head"><h3>Containers</h3><p>Keys cost ${CR(KEY_PRICE)}. Sticker capsules open without a key. Containers also drop at the end of matches.</p></div>
      <div class="case-list">${all.map(c => `
        <div class="case-card" data-case="${c.id}">
          <img src="${caseThumb(c.id)}" alt="">
          <div class="meta"><b>${h(c.name)}</b><small>${c.id === 'capsule' ? 'Paper · Holo · Foil · Gold' : c.id === 'gold' ? 'A guaranteed knife or gloves · no key needed' : `${CASES[c.id].skins.length} finishes + rare knives`}</small></div>
          <div class="own">${owned[c.id] ? `<span>Owned × ${owned[c.id]}</span>` : '<span class="none">None owned</span>'}</div>
          <div class="btns">${c.id === 'gold' ? '' : `<button data-buy="${c.id}">Buy · ${CR(c.price)}</button>`}<button data-view="${c.id}" class="pri">${owned[c.id] ? 'Open' : 'Contents'}</button></div>
        </div>`).join('')}</div>`;
    // get every case's previews ready in the background before anyone opens one
    warmThumbnails(Object.values(CASES).flatMap(c => c.skins));
    page.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      audio.init(); audio.ui();
      if (b.dataset.buy) { const r = await P.buyCase(b.dataset.buy); if (r.error) this.toast(r.error); else this.toast('Added to inventory'); this.go('cases'); }
      if (b.dataset.view) this.openCaseView(b.dataset.view);
    };
  }

  openCaseView(caseId) {
    const layer = this.$('.modal-layer');
    const def = caseDef(caseId), gold = caseId === 'gold';
    const ownedItem = P.getProfile().items.find(i => i.kind === 'case' && i.defId === caseId);
    const contents = P.caseContents(caseId);
    const knives = caseId === 'capsule' ? [] : gold ? Object.keys(KNIFE_TYPES).filter(k => k !== 'standard') : CASES[caseId].knives;
    const oddsRows = caseId === 'capsule'
      ? [['Paper', '80%'], ['Holo', '15%'], ['Foil', '4%'], ['Gold', '1%']]
      : gold ? [['Knife or gloves', '100%', RARITY.legendary.color]]
      : RARITIES.map(r => [r.name, (r.odds * 100).toFixed(2) + '%', r.color]);
    layer.innerHTML = `
      <div class="modal casev">
        <div class="ch"><div><small>Container</small><h2>${h(def.name)}</h2></div><button class="x" data-act="close">Close</button></div>
        <div class="reel-wrap hidden"><div class="needle"></div><div class="reel"></div></div>
        <div class="contents">
          ${contents.map(d => `<div class="ci" style="--rc:${RARITY[d.rarity].color}"><img data-def="${d.id}" alt=""><span class="w">${WEAPON_NAMES[d.weapon]}</span><span class="n">${h(d.name)}</span></div>`).join('')}
          ${knives.length ? `<div class="ci rare" style="--rc:${RARITY.legendary.color}"><div class="star">★</div><span class="w">Rare special item</span><span class="n">${knives.map(k => KNIFE_TYPES[k]).join(', ')}</span></div>` : ''}
          ${caseId === 'capsule' ? Object.values(STICKERS).filter(s => s.finishType === 'paper').slice(0, 12).map(s => `<div class="ci" style="--rc:${RARITY.standard.color}"><img src="${stickerThumb(s.id)}" alt=""><span class="n">${h(s.name)}</span></div>`).join('') : ''}
        </div>
        <div class="cfoot">
          <table class="odds">${oddsRows.map(([n, o, c]) => `<tr><td><i style="background:${c || '#888'}"></i>${n}</td><td>${o}</td></tr>`).join('')}</table>
          <div class="unlock">${ownedItem ? `<button class="pri big" data-act="open">${caseId === 'capsule' ? 'Open capsule' : gold ? 'Open Gold Case' : `Unlock · key ${CR(KEY_PRICE)}`}</button>` : gold ? '' : `<button class="pri big" data-act="buyopen">Buy &amp; unlock · ${CR(def.price + (caseId === 'capsule' ? 0 : KEY_PRICE))}</button>`}</div>
        </div>
      </div>`;
    // previews for contents, as they scroll into view (the Universal Case holds every finish)
    const io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); thumbnail(previewItem(e.target.dataset.def), url => { e.target.src = url; }); } }, { rootMargin: '200px' });
    for (const img of layer.querySelectorAll('img[data-def]')) io.observe(img);
    layer.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'close') { layer.innerHTML = ''; layer.onclick = null; this.go(this.tab); return; }
      if (b.dataset.act === 'buyopen') {
        const r = await P.buyCase(caseId); if (r.error) return this.toast(r.error);
      }
      if (b.dataset.act === 'open' || b.dataset.act === 'buyopen') {
        const it = P.getProfile().items.find(i => i.kind === 'case' && i.defId === caseId);
        const res = await P.openCase(it.uid);
        if (res.error) return this.toast(res.error);
        this.spin(caseId, res.item);
      }
    };
  }

  // Horizontal reel that decelerates onto the won item.
  spin(caseId, won) {
    const layer = this.$('.modal-layer');
    layer.querySelector('.contents').classList.add('hidden');
    layer.querySelector('.cfoot').classList.add('hidden');
    const wrap = layer.querySelector('.reel-wrap'); wrap.classList.remove('hidden');
    const reel = layer.querySelector('.reel');
    const N = 56, WIN = 48, TW = 168;
    const filler = [];
    for (let i = 0; i < N; i++) filler.push(i === WIN ? won : P.rollCase(caseId));
    reel.innerHTML = filler.map((it, i) => {
      const r = rarityOf(it), t = itemTitle(it);
      const img = it.kind === 'sticker' ? stickerThumb(it.defId) : '';
      const knife = it.kind === 'skin' && SKINS[it.defId].knife && i !== WIN;
      return `<div class="rt" style="--rc:${r.color}">${knife ? '<div class="star">★</div>' : `<img src="${img}" ${it.kind === 'skin' ? `data-i="${i}"` : ''} alt="">`}<span class="w">${knife ? 'Rare special item' : h(t.weapon)}</span><span class="n">${knife ? '★' : h(t.name)}</span></div>`;
    }).join('');
    // one preview per skin, shared with the contents grid, so the reel is usually ready instantly
    for (const img of reel.querySelectorAll('img[data-i]')) thumbnail(previewItem(filler[+img.dataset.i].defId), url => { img.src = url; });
    const vw = wrap.clientWidth;
    const offset = WIN * TW - vw / 2 + TW / 2 + (Math.random() - 0.5) * (TW * 0.8);
    reel.style.transition = 'none'; reel.style.transform = 'translateX(0)';
    void reel.offsetWidth;
    reel.style.transition = 'transform 6.5s cubic-bezier(0.12, 0.72, 0.1, 1)';
    reel.style.transform = `translateX(${-offset}px)`;
    // tick sound as tiles pass the needle
    let last = -1;
    const tick = () => {
      const m = new DOMMatrix(getComputedStyle(reel).transform);
      const idx = Math.floor((-m.m41 + vw / 2) / TW);
      if (idx !== last) { last = idx; audio.ui(); }
      if (reel.isConnected && reel.dataset.done !== '1') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    reel.addEventListener('transitionend', () => {
      reel.dataset.done = '1';
      const r = rarityOf(won);
      audio.ui(r.tier >= 2 ? 'win' : 'click');
      setTimeout(() => {
        if (won.kind === 'skin') this.inspect(won, { fromUnbox: true });
        else this.stickerInfo(won);
      }, 700);
    }, { once: true });
  }

  render_market(page) { this.online.renderMarket(page); }

  // ------------------------------------------------------------- career
  render_career(page) {
    const p = P.getProfile(), s = p.stats, lv = P.level();
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
    page.innerHTML = `
      <section class="career">
        <div class="stats">
          ${[['Level', lv.level], ['Matches', s.matches], ['Wins', s.wins], ['Win rate', s.matches ? Math.round(s.wins / s.matches * 100) + '%' : '—'], ['Kills', s.kills], ['K/D', kd], ['Containers opened', s.casesOpened]]
            .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}
        </div>
        <h3>Recent activity</h3>
        <table class="hist">${p.history.slice(0, 30).map(e => {
          const d = SKINS[e.item] || STICKERS[e.item];
          const name = d ? (d.knife ? '★ ' + KNIFE_TYPES[d.knife] : d.weapon ? WEAPON_NAMES[d.weapon] : 'Sticker') + ' | ' + d.name : e.item;
          return `<tr><td>${new Date(e.t).toLocaleString()}</td><td>${e.type === 'unbox' ? 'Unboxed' : e.type === 'sell' ? 'Sold' : e.type}</td><td style="color:${d ? RARITY[d.rarity].color : ''}">${h(name)}</td><td>${e.value ? CR(e.value) : ''}</td></tr>`;
        }).join('') || '<tr><td>No activity yet.</td></tr>'}</table>
      </section>`;
  }

  // ------------------------------------------------------------- settings
  render_settings(page) {
    const s = this.settings;
    page.innerHTML = `
      <section class="settings">
        <h3>Player</h3>
        <div class="row"><label>Name</label><input type="text" maxlength="16" data-s="name" value="${h(P.getProfile().name)}"></div>
        <h3>Mouse & view</h3>
        <div class="row"><label>Sensitivity</label><input type="range" min="0.2" max="6" step="0.05" data-s="sensitivity" value="${s.sensitivity}"><output>${s.sensitivity}</output></div>
        <div class="row"><label>Field of view</label><input type="range" min="60" max="90" step="1" data-s="fov" value="${s.fov}"><output>${s.fov}</output></div>
        <h3>Graphics</h3>
        <div class="row"><label>Quality</label><select data-s="quality">${[['auto', `Auto (${QUALITY[detectQuality().tier].label})`], ...QUALITY_ORDER.map(k => [k, QUALITY[k].label])].map(([v, l]) => `<option value="${v}" ${(s.quality || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><output></output></div>
        <p class="note">Low: no shadows, lower resolution, simpler models. Medium: shadows drawn once, no anti-aliasing. High: sharper shadows and anti-aliasing. Ultra: shadows from players too, full resolution. Applies from the next match.</p>
        <div class="row"><label>Dynamic resolution</label><input type="checkbox" data-s="dynamicRes" ${s.dynamicRes !== false ? 'checked' : ''}><output></output></div>
        <div class="row"><label>Show FPS</label><input type="checkbox" data-s="showFps" ${s.showFps ? 'checked' : ''}><output></output></div>
        <div class="row"><label>Teammate outlines</label><input type="checkbox" data-s="allyOutline" ${s.allyOutline !== false ? 'checked' : ''}><output></output></div>
        <p class="note">A white glow around teammates that shows through walls.</p>
        <div class="row"><label>Enemy outlines</label><input type="checkbox" data-s="enemyOutline" ${s.enemyOutline !== false ? 'checked' : ''}><output></output></div>
        <p class="note">A red glow around enemies you can see, so they stand out. It never shows through walls or smoke.</p>
        <h3>Audio</h3>
        <div class="row"><label>Master volume</label><input type="range" min="0" max="1" step="0.01" data-s="volume" value="${s.volume}"><output>${s.volume}</output></div>
        <h3>Crosshair</h3>
        <div class="xh-edit"><div class="xh-rows"></div><div class="xh-prev"><canvas></canvas></div></div>
        <h3>Key bindings <button class="small" data-binds-reset>Reset to defaults</button></h3>
        <p class="note">Click a slot, then press a key or mouse button. Esc cancels, Backspace clears the slot.</p>
        <table class="binds"></table>
        <h3>Data</h3>
        <div class="row"><label>Profile</label><button class="danger" data-reset>Reset inventory & credits</button></div>
      </section>`;
    for (const inp of page.querySelectorAll('[data-s]')) {
      inp.oninput = () => {
        const k = inp.dataset.s;
        if (k === 'name') { if (!P.isOnline()) { P.setName(inp.value); this.settings.name = inp.value; } }
        else s[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
        if (inp.nextElementSibling?.tagName === 'OUTPUT') inp.nextElementSibling.textContent = inp.value;
        if (k === 'volume') audio.setVolume(s.volume);
        s.save();
      };
    }
    page.querySelector('[data-reset]').onclick = () => { if (confirm('Reset your inventory, credits and stats?')) { P.resetProfile(); this.go('settings'); } };
    this.crosshairEditor(page);
    this.bindEditor(page);
  }

  crosshairEditor(page) {
    const s = this.settings;
    const cfg = s.crosshair = crosshairFrom(s);
    const rows = [
      ['style', 'Style', 'select', [['dynamic', 'Dynamic (opens when moving/firing)'], ['static', 'Static']]],
      ['length', 'Length', 'range', [1, 16, 1]], ['thickness', 'Thickness', 'range', [1, 6, 1]], ['gap', 'Gap', 'range', [-2, 12, 1]],
      ['color', 'Colour', 'color'], ['alpha', 'Opacity', 'range', [0.2, 1, 0.05]],
      ['outline', 'Outline', 'check'], ['outlineThickness', 'Outline thickness', 'range', [1, 3, 1]],
      ['dot', 'Centre dot', 'check'], ['tStyle', 'T-style (no top bar)', 'check'],
    ];
    const box = page.querySelector('.xh-rows');
    box.innerHTML = rows.map(([k, label, type, opt]) => `<div class="row"><label>${label}</label>${
      type === 'select' ? `<select data-x="${k}">${opt.map(([v, l]) => `<option value="${v}" ${cfg[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`
      : type === 'check' ? `<input type="checkbox" data-x="${k}" ${cfg[k] ? 'checked' : ''}>`
      : type === 'color' ? `<input type="color" data-x="${k}" value="${cfg[k]}">`
      : `<input type="range" min="${opt[0]}" max="${opt[1]}" step="${opt[2]}" data-x="${k}" value="${cfg[k]}"><output>${cfg[k]}</output>`}</div>`).join('')
      + '<div class="row"><label></label><button class="small" data-x-reset>Default crosshair</button></div>';
    const canvas = page.querySelector('.xh-prev canvas');
    const redraw = () => drawCrosshair(canvas, cfg, 0);
    redraw();
    for (const inp of box.querySelectorAll('[data-x]')) {
      inp.oninput = inp.onchange = () => {
        const k = inp.dataset.x;
        cfg[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
        if (inp.nextElementSibling?.tagName === 'OUTPUT') inp.nextElementSibling.textContent = inp.value;
        s.save(); redraw();
      };
    }
    box.querySelector('[data-x-reset]').onclick = () => { s.crosshair = { ...DEFAULT_CROSSHAIR }; s.save(); this.go('settings'); };
  }

  bindEditor(page) {
    const s = this.settings;
    const binds = bindsFrom(s);
    const table = page.querySelector('.binds');
    const render = () => {
      table.innerHTML = ACTIONS.map(([a, label]) => `<tr><td>${label}</td>${[0, 1].map(i => `<td><button data-bind="${a}" data-slot="${i}">${keyLabel(binds[a][i])}</button></td>`).join('')}</tr>`).join('');
    };
    render();
    const save = () => { s.binds = binds; s.save(); };
    let stop = null;
    table.onclick = (e) => {
      const b = e.target.closest('[data-bind]'); if (!b) return;
      stop?.();
      b.classList.add('listen'); b.textContent = 'Press a key…';
      const a = b.dataset.bind, i = +b.dataset.slot;
      const set = (code) => {
        // a code can only do one thing: take it off any other action first
        if (code) for (const k of Object.keys(binds)) binds[k] = binds[k].map(c => (c === code ? null : c));
        binds[a][i] = code; binds[a] = [binds[a][0] || null, binds[a][1] || null];
        save(); stop(); render();
      };
      const key = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (ev.code === 'Escape') { stop(); render(); } else if (ev.code === 'Backspace') set(null); else set(ev.code); };
      const mouse = (ev) => { if (ev.target === b && ev.button === 0) return; ev.preventDefault(); set('Mouse' + ev.button); };
      const wheel = (ev) => { ev.preventDefault(); set(ev.deltaY > 0 ? 'WheelDown' : 'WheelUp'); };
      const ctx = (ev) => ev.preventDefault();
      setTimeout(() => {
        window.addEventListener('keydown', key, true); window.addEventListener('mousedown', mouse, true);
        window.addEventListener('wheel', wheel, { capture: true, passive: false }); window.addEventListener('contextmenu', ctx, true);
      }, 0);
      stop = () => {
        window.removeEventListener('keydown', key, true); window.removeEventListener('mousedown', mouse, true);
        window.removeEventListener('wheel', wheel, true); window.removeEventListener('contextmenu', ctx, true);
        stop = null;
      };
    };
    page.querySelector('[data-binds-reset]').onclick = () => { delete s.binds; s.save(); this.go('settings'); };
  }

  // ------------------------------------------------------------- misc
  // Error panel with the message and the technical details to copy.
  error(title, err) {
    const layer = this.$?.('.modal-layer');
    const msg = err?.message || String(err);
    const text = `${msg}\n\n${err?.stack || ''}\n\n${navigator.userAgent}`.slice(0, 4000);
    if (!layer) { alert(`${title}\n\n${msg}`); return; }
    layer.innerHTML = `<div class="modal small"><div class="info">
      <div class="rar"><i></i>Error</div><h2>${h(title)}</h2>
      <p class="note">${h(msg)}</p>
      <textarea class="errtext" readonly>${h(text)}</textarea>
      <div class="acts"><button class="pri" data-act="copy">Copy details</button><button data-act="close">Close</button></div></div></div>`;
    layer.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'copy') { navigator.clipboard?.writeText(text); this.toast('Copied'); return; }
      layer.innerHTML = ''; layer.onclick = null;
    };
  }

  toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    this.root.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  rankedSummary(k) {
    const evText = { placed: (e) => `Placed at ${R.rankName(e.rank)}`, promoted: (e) => `Promoted to ${R.rankName(e.rank)}`, demoted: (e) => `Demoted to ${R.rankName(e.rank)}`,
      seriesStart: (e) => `Promotion series started: best of ${e.series.max}`, series: (e) => `Series ${e.series.wins}–${e.series.losses} (best of ${e.series.max})`,
      seriesFailed: () => 'Promotion series failed', shielded: (e) => `Demotion shield used (${e.left} left)`, apexLocked: () => 'Apex is limited to the top 100 on the leaderboard' };
    const rp = k.rpDelta;
    return `<div class="rk-sum">
      <img src="${R.rankEmblem(k.after.rank, 96)}" alt="">
      <div><b>${R.rankName(k.after.rank)}</b>
        ${k.placement && k.after.rank == null ? `<small>Placement ${k.placement.done} of ${k.placement.of}</small>` : `<small>${k.after.rp} RP ${rp != null ? `<em class="${rp >= 0 ? 'up' : 'down'}">${rp >= 0 ? '+' : ''}${rp}</em>` : ''}</small>`}
        ${k.after.rank != null ? `<div class="rpbar"><i style="width:${Math.min(100, k.after.rp)}%"></i></div>` : ''}
        ${k.events.map(e => `<p class="ev ${e.type}">${evText[e.type]?.(e) || ''}</p>`).join('')}
        ${k.abandoned ? '<p class="ev demoted">Match abandoned: extra RP loss and queue cooldown applied</p>' : ''}
      </div></div>`;
  }

  // ------------------------------------------------------------- ranked
  render_ranked(page) {
    if (!P.isOnline() && R.LADDERS[this.state.ladder]?.online) this.state.ladder = '5v5';
    const id = this.state.ladder;
    const L = R.ladder(id);
    // online: real players from the server; offline: simulated population
    let pos, dist, pop;
    if (P.isOnline()) {
      const b = this.boards?.[id];
      if (!b) {
        page.innerHTML = '<p class="note">Loading leaderboard…</p>';
        net.rpc('ranked.board', { ladder: id }).then(r => { (this.boards ||= {})[id] = r; setTimeout(() => { if (this.boards) delete this.boards[id]; }, 30000); if (this.tab === 'ranked') this.go('ranked'); });
        return;
      }
      pos = { position: b.position ?? b.total + 1, percentile: b.total ? 1 - ((b.position ?? b.total) - 1) / b.total : 0 };
      dist = b.distribution; pop = b.top;
    } else {
      pos = R.leaderboardPosition(L.mmr); dist = R.distribution(); pop = R.getPopulation();
    }
    const myTier = L.rank == null ? -1 : R.RANKS[L.rank].tier;
    const games = L.wins + L.losses;
    page.innerHTML = `
      <section class="rk-main">
        <div class="tog ltabs">${Object.entries(R.LADDERS).filter(([, l]) => P.isOnline() || !l.online).map(([k, l]) => `<button data-l="${k}" class="${k === id ? 'on' : ''}">${l.label}</button>`).join('')}</div>
        <div class="rk-hero">
          <img src="${R.rankEmblem(L.rank, 160)}" alt="">
          <div>
            <small>${R.LADDERS[id].label}</small>
            <h2>${R.rankName(L.rank)}</h2>
            ${L.rank == null ? `<p class="note">Play ${5 - L.placements} more placement match${5 - L.placements === 1 ? '' : 'es'} to receive a rank. Placements top out at Platinum IV; the rest has to be earned.</p>` : `
              <div class="rpbar lg"><i style="width:${Math.min(100, L.rp)}%"></i></div>
              <p class="rpline">${L.rp} / 100 RP${L.shield ? ` · <span class="shield">Demotion shield: ${L.shield}</span>` : ''}</p>
              ${L.series ? `<div class="series">Promotion series ${L.series.wins}–${L.series.losses} · best of ${L.series.max} <span>${Array.from({ length: L.series.max }, (_, i) => `<i class="${i < L.series.wins ? 'w' : i < L.series.wins + L.series.losses ? 'l' : ''}"></i>`).join('')}</span></div>` : ''}`}
          </div>
        </div>
        <div class="stats">
          ${[['Wins', L.wins], ['Losses', L.losses], ['Win rate', games ? Math.round(L.wins / games * 100) + '%' : '—'], ['Streak', L.streak > 0 ? `W${L.streak}` : L.streak < 0 ? `L${-L.streak}` : '—'], ['Peak', L.peak == null ? '—' : R.rankName(L.peak)], ['Ladder position', L.rank == null ? '—' : `#${pos.position.toLocaleString()}`], ['Top', L.rank == null ? '—' : `${Math.max(0.1, (1 - pos.percentile) * 100).toFixed(1)}%`], ['Rating confidence', `${Math.round((1 - (L.rd - 60) / 290) * 100)}%`]]
            .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}
        </div>
        <h3>How ranked works</h3>
        <ul class="rules">
          <li>You have a hidden rating (MMR) and a visible rank with 100 RP per division. Wins add RP and losses remove it. If your MMR is above your rank, you gain more and lose less until they line up.</li>
          <li>Higher tiers give less RP for a win and take more for a loss. Win streaks of three or more give bonus RP, and playing well cushions a loss.</li>
          <li>Entering Diamond or Obsidian needs a best-of-3 promotion series. Vanguard and Apex need best-of-5. Apex only holds the top 100 players on the ladder.</li>
          <li>After a promotion into a new tier you get a 3-loss demotion shield. Diamond and above lose RP after 7 days without playing.</li>
          <li>Bots scale with your MMR: reaction time, aim, spray control, crosshair placement and tactics all improve as you climb.</li>
          <li>Abandoning a match counts as a loss with a 1.6× RP penalty and a queue cooldown that grows each time.</li>
        </ul>
        <h3>Recent ranked matches</h3>
        <table class="hist">${L.history.slice(0, 15).map(m => `<tr><td>${new Date(m.t).toLocaleDateString()}</td><td class="${m.won ? 'up' : 'down'}">${m.abandoned ? 'Abandon' : m.won ? 'Win' : 'Loss'}</td><td>${m.k} / ${m.d}</td><td>${m.placement ? 'Placement' : (m.rp >= 0 ? '+' : '') + m.rp + ' RP'}</td><td>${R.rankName(m.rank)}</td></tr>`).join('') || '<tr><td>No ranked matches yet.</td></tr>'}</table>
      </section>
      <aside class="rk-side">
        <h3>Distribution</h3>
        <div class="dist">${R.TIERS.map((t, i) => `<div class="${i === myTier ? 'me' : ''}"><img src="${R.rankEmblem(R.RANKS.findIndex(r => r.tier === i && r.sub === 1), 40)}" alt=""><span>${t.name}</span><i style="width:${(dist[i] * 260).toFixed(1)}%;background:${t.color}"></i><em>${(dist[i] * 100).toFixed(1)}%</em></div>`).join('')}</div>
        <h3>Leaderboard</h3>
        <table class="lb">${pop.slice(0, 25).map((p, i) => `<tr><td>${i + 1}</td><td><img src="${R.rankEmblem(p.rank, 24)}" alt="">${h(p.name)}</td><td>${Math.round(p.mmr)}</td></tr>`).join('')}
          ${L.rank != null ? `<tr class="me"><td>${pos.position}</td><td><img src="${R.rankEmblem(L.rank, 24)}" alt="">${h(P.getProfile().name)}</td><td>${Math.round(L.mmr)}</td></tr>` : ''}</table>
      </aside>`;
    page.onclick = (e) => { const b = e.target.closest('[data-l]'); if (b) { this.state.ladder = b.dataset.l; this.go('ranked'); } };
  }

  showResult(r) {
    const layer = this.$('.modal-layer');
    const rows = r.players.filter(p => p.team === r.team).sort((a, b) => b.kills - a.kills)
      .map(p => `<tr class="${p.you ? 'me' : ''}"><td>${h(p.name)}</td><td>${p.kills}</td><td>${p.assists}</td><td>${p.deaths}</td></tr>`).join('');
    layer.innerHTML = `<div class="modal small result ${r.won ? 'win' : 'lose'}">
      <div class="info">
        <div class="rar"><i></i>${r.abandoned ? 'Left early' : r.won ? 'Victory' : 'Defeat'}</div>
        <h2>${r.score[r.team]} <span>–</span> ${r.score[r.team === 'T' ? 'CT' : 'T']}</h2>
        <table>${'<tr><th>Player</th><th>K</th><th>A</th><th>D</th></tr>' + rows}</table>
        ${r.ranked ? this.rankedSummary(r.ranked) : ''}
        <h4>Rewards</h4>
        <p class="reward">+${CR(r.reward.credits)} credits${r.reward.drops.map(d => ` · <b>${h(itemDef(d).name)}</b>`).join('')}</p>
        <div class="acts"><button class="pri" data-act="close">Continue</button></div>
      </div></div>`;
    layer.onclick = (e) => { if (e.target.closest('[data-act=close]')) { layer.innerHTML = ''; layer.onclick = null; } };
  }
}

// Stock (unskinned) weapon model for the showcase.
function stockModel(slot) { return buildGun(slot === 'knife' ? 'knife:standard' : slot); }
