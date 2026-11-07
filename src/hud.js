// DOM-based HUD: vitals, money, ammo, timer and bomb state, score, kill feed,
// radar, scoreboard, buy menu, scope overlay, hit markers, damage indicators,
// flash whiteout, plant/defuse progress and the spectator panel.
import { WEAPONS, GEAR, BUY_MENU, usableBy } from './weapons.js';
import { refundable } from './match/economy.js';
import { buyBlock, priceFor } from './match/economy.js';
import { crosshairFrom, drawCrosshair } from './crosshair.js';
import { keyLabel } from './input.js';

export const TEAM_NAME = { T: 'Attackers', CT: 'Defenders' };

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const NADE_ICON = { he: 'HE', flash: 'FL', smoke: 'SM', molotov: 'MO', incendiary: 'IN', decoy: 'DC' };

// Only write text that changed: every write makes the browser restyle the page.
function setText(el, v) {
  if (!el) return;
  const t = String(v);
  if (el.textContent !== t) el.textContent = t;
}

export class Hud {
  constructor(game) {
    this.g = game;
    const root = this.root = el('div', 'hud');
    root.innerHTML = `
      <div class="hud-top">
        <div class="team-score t"><span class="alive"></span><b class="sc"></b></div>
        <div class="timer"><div class="time"></div><div class="round"></div></div>
        <div class="team-score ct"><b class="sc"></b><span class="alive"></span></div>
      </div>
      <canvas class="radar" width="220" height="220"></canvas>
      <div class="place"></div>
      <div class="killfeed"></div>
      <canvas class="xhair"></canvas>
      <div class="hitmarker"></div>
      <div class="dmg-ind"></div>
      <div class="center-msg"></div>
      <div class="sub-msg"></div>
      <div class="notice"></div>
      <div class="useprog hidden"><span></span><i><b></b></i></div>
      <div class="money"><b></b><em></em></div>
      <div class="vitals">
        <div class="hp"><span class="ico">+</span><b></b></div>
        <div class="ap"><span class="ico">◈</span><b></b><small class="helm"></small></div>
      </div>
      <div class="kit"></div>
      <div class="ammo"><div class="nades"></div><div class="wname"></div><div><b class="mag"></b><span class="res"></span></div></div>
      <div class="scope"><div class="scope-ring"></div></div>
      <div class="hurt"></div>
      <div class="whiteout"></div>
      <div class="spec"></div>
      <div class="scoreboard hidden"></div>
      <div class="buy hidden"></div>
      <div class="pause hidden">
        <div class="pause-box">
          <h2>Paused</h2>
          <button data-a="resume">Resume</button>
          <label>Sensitivity <input type="range" min="0.2" max="6" step="0.05" data-s="sensitivity"><span></span></label>
          <label>Volume <input type="range" min="0" max="1" step="0.01" data-s="volume"><span></span></label>
          <p class="note">Key bindings and the crosshair editor are under Settings in the main menu.</p>
          <button data-a="quit" class="danger">${game.opts.ranked ? 'Abandon ranked match' : 'Leave match'}</button>
          ${game.opts.ranked ? '<p class="warn">Abandoning counts as a loss with a larger RP penalty and a queue cooldown.</p>' : ''}
        </div>
      </div>`;
    document.body.appendChild(root);
    // element lookups are cached (and re-queried if an element was replaced)
    const found = new Map();
    this.$ = (s) => {
      let el = found.get(s);
      if (!el || !el.isConnected) { el = root.querySelector(s); found.set(s, el); }
      return el;
    };
    this.radar = this.$('.radar').getContext('2d');
    this.xh = this.$('.xhair');
    this.bloomV = 0;
    this.msgTimer = 0; this.noticeT = 0;
    this.buyOpen = false; this.buyCat = null;
    this.whiteT = 0; this.whiteDur = 1; this.whitePeak = 0;
    this.applyCrosshair();
    this.buildRadarBase();

    root.querySelector('.pause').addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === 'resume') game.setPaused(false);
      if (a === 'quit') game.quit();
    });
    for (const inp of root.querySelectorAll('.pause input')) {
      const key = inp.dataset.s;
      inp.value = game.settings[key];
      inp.nextElementSibling.textContent = (+inp.value).toFixed(2);
      inp.addEventListener('input', () => {
        game.settings[key] = +inp.value;
        inp.nextElementSibling.textContent = (+inp.value).toFixed(2);
        if (key === 'volume') game.audio.setVolume(+inp.value);
        game.settings.save?.();
      });
    }
  }

  applyCrosshair() { this.xcfg = crosshairFrom(this.g.settings); this.lastSpread = -1; }

  buildRadarBase() {
    const lv = this.g.level, nav = lv.nav;
    const c = document.createElement('canvas');
    const S = 220, scale = S / Math.max(lv.width, lv.depth);
    this.radarScale = scale;
    c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(10,14,18,0.85)'; x.fillRect(0, 0, S, S);
    const ox = (S - lv.width * scale) / 2, oz = (S - lv.depth * scale) / 2;
    this.radarOff = [ox, oz];
    for (let z = 0; z < nav.H; z++) for (let i = 0; i < nav.W; i++) {
      const ch = nav.at(i, z);
      if (ch === '#') continue;
      x.fillStyle = 'AB^s'.includes(ch) ? '#6b5e47' : ch === 'u' ? '#3b4048' : 'hD'.includes(ch) ? '#4a4f58' : '#59606a';
      if (ch === 'c' || ch === 'C') x.fillStyle = '#404650';
      x.fillRect(ox + i * nav.S * scale, oz + z * nav.S * scale, nav.S * scale + 0.5, nav.S * scale + 0.5);
    }
    x.font = 'bold 18px sans-serif'; x.fillStyle = 'rgba(255,220,120,0.9)'; x.textAlign = 'center';
    for (const L of ['A', 'B']) {
      const cc = lv.sites[L].center; if (!cc) continue;
      x.fillText(L, ox + cc.x * scale, oz + cc.z * scale + 6);
    }
    this.radarBase = c;
  }

  placeAt(pos) {
    const calls = this.g.map.callouts;
    if (!calls) return '';
    const S = this.g.level.nav.S, x = Math.floor(pos.x / S), z = Math.floor(pos.z / S);
    let best = '', area = Infinity;
    for (const [name, x0, z0, x1, z1] of calls) {
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const a = (x1 - x0 + 1) * (z1 - z0 + 1);
      if (a < area) { area = a; best = name; }
    }
    return best;
  }

  drawRadar() {
    const g = this.g, x = this.radar, s = this.radarScale, [ox, oz] = this.radarOff;
    x.clearRect(0, 0, 220, 220);
    x.drawImage(this.radarBase, 0, 0);
    const me = g.player;
    const dot = (p, col, r = 4) => { x.fillStyle = col; x.beginPath(); x.arc(ox + p.x * s, oz + p.z * s, r, 0, 7); x.fill(); };
    for (const c of g.characters) {
      if (c === me) continue;
      if (c.team === me.team) {
        if (c.alive) { dot(c.pos, c.hasBomb ? '#ffb03a' : '#59a8ff'); }
        else { x.fillStyle = '#59a8ff'; x.fillText('×', ox + c.pos.x * s, oz + c.pos.z * s + 5); }
      } else if (c.alive && (g.spotted[me.team].get(c) || 0) > g.time) dot(c.pos, '#ff4d4d');
    }
    // the bomb: attackers always know where it is; defenders once it's planted or spotted
    const b = g.bomb;
    if (b && (b.state === 'dropped' || b.state === 'planted') && (me.team === 'T' || b.state === 'planted')) {
      x.fillStyle = b.state === 'planted' && (g.time * 2 % 1) < 0.5 ? '#ff3a3a' : '#ffb03a';
      x.fillRect(ox + b.pos.x * s - 4, oz + b.pos.z * s - 3, 8, 6);
    }
    const view = me.alive ? me : g.spec.target;
    if (view) {
      const px = ox + view.pos.x * s, pz = oz + view.pos.z * s;
      x.save(); x.translate(px, pz); x.rotate(-view.yaw);
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 5); x.lineTo(0, 2); x.lineTo(-5, 5); x.closePath(); x.fill();
      x.restore();
    }
  }

  fmtTime(t) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

  update(dt) {
    const g = this.g, p = g.player;
    if (g.settings.showFps) {
      this.fpsT = (this.fpsT || 0) + dt;
      if (this.fpsT > 0.5) {
        this.fpsT = 0;
        if (!this.fpsEl) { this.fpsEl = document.createElement('div'); this.fpsEl.className = 'fps'; this.root.appendChild(this.fpsEl); }
        setText(this.fpsEl, `${Math.round(g.dyn.fps)} FPS · ${g.q.label} · ${Math.round(g.dyn.scale * 100)}%`);
      }
    }
    const planted = g.bomb?.state === 'planted';
    const time = this.$('.time');
    setText(time, planted ? '💣 ' + this.fmtTime(g.bomb.timer) : this.fmtTime(g.stateTimer));
    time.classList.toggle('freeze', g.state === 'freeze');
    time.classList.toggle('bomb', planted);
    setText(this.$('.round'), g.state === 'freeze' && g.canBuy() ? `Buy time · press ${keyLabel(g.binds.buy[0])}` : `Round ${g.round} · first to ${g.winRounds}`);
    setText(this.$('.team-score.t .sc'), g.score.T);
    setText(this.$('.team-score.ct .sc'), g.score.CT);
    setText(this.$('.team-score.t .alive'), '●'.repeat(g.aliveCount('T')));
    setText(this.$('.team-score.ct .alive'), '●'.repeat(g.aliveCount('CT')));
    const shown = p.alive ? p : g.spec.target;
    if (shown && shown.weapon) {
      setText(this.$('.hp b'), Math.max(0, shown.health));
      setText(this.$('.ap b'), shown.armor);
      setText(this.$('.ap .helm'), shown.armor > 0 && shown.helmet ? '+H' : '');
      this.$('.hp').classList.toggle('low', shown.health <= 25);
      const w = shown.weapon, d = w.def;
      setText(this.$('.wname'), d.name);
      const gun = !!d.pattern;
      setText(this.$('.mag'), gun ? w.ammo : d.type === 'grenade' ? shown.nades.filter(n => n === w.id).length : '');
      setText(this.$('.res'), gun ? ' / ' + w.reserve : '');
      this.$('.mag').classList.toggle('low', gun && w.ammo <= Math.ceil(d.magSize * 0.2));
      this.$('.nades').innerHTML = shown.nades.map(n => `<i class="${shown.slot === 4 && shown.weapon.id === n ? 'on' : ''}">${NADE_ICON[n]}</i>`).join('') + (shown.hasBomb ? '<i class="bombi">C4</i>' : '');
      setText(this.$('.kit'), shown.team === 'CT' && shown.hasKit ? 'KIT' : '');
    }
    setText(this.$('.money b'), '$' + (p.money ?? 0));
    // crosshair: gap opens with inaccuracy and firing
    this.bloomV *= Math.exp(-8 * dt);
    const showX = p.alive && !p.scoped && p.weapon.def.type !== 'sniper';
    this.xh.style.display = showX ? '' : 'none';
    if (showX) {
      const spread = Math.round(Math.min(40, p.inaccuracy() * 500 + this.bloomV));
      if (spread !== this.lastSpread) { drawCrosshair(this.xh, this.xcfg, spread); this.lastSpread = spread; }
    }
    // plant / defuse bar
    const up = g.useProgress, bar = this.$('.useprog');
    bar.classList.toggle('hidden', !up);
    if (up) { bar.querySelector('span').textContent = up.kind === 'plant' ? 'Planting the bomb' : up.kit ? 'Defusing (kit)' : 'Defusing'; bar.querySelector('b').style.width = (up.pr * 100).toFixed(1) + '%'; }
    // flashbang whiteout
    if (this.whiteT > 0) {
      this.whiteT = Math.max(0, this.whiteT - dt);
      const k = this.whiteT / this.whiteDur;
      this.$('.whiteout').style.opacity = (Math.min(1, this.whitePeak * 1.25) * Math.min(1, k * 1.6)).toFixed(3);
    } else this.$('.whiteout').style.opacity = '0';
    const spec = this.$('.spec');
    if (!p.alive && !g.deathCam) {
      const t = g.spec.target, mode = g.spec.mode;
      const label = mode === 'free' ? 'Free camera' : mode === 'third' ? 'Third person' : 'First person';
      spec.style.display = 'block';
      spec.innerHTML = `${mode !== 'free' && t ? `Spectating <b>${t.name}</b> · ` : ''}${label}<br><span>${keyLabel(g.binds.fire[0])} / ${keyLabel(g.binds.alt[0])} switch player · ${keyLabel(g.binds.jump[0])} change view${g.opts.ranked ? ' (free camera is off in ranked)' : ''}</span>`;
    } else spec.style.display = 'none';
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) { this.$('.center-msg').classList.remove('show'); this.$('.sub-msg').classList.remove('show'); } }
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) this.$('.notice').classList.remove('show'); }
    else {
      // context hints
      const hint = this.contextHint();
      const n = this.$('.notice');
      setText(n, hint || ''); n.classList.toggle('show', !!hint); n.classList.add('soft');
    }
    this.drawRadar();
    // where you are (or whoever you're watching), the way callouts name it
    const who = p.alive ? p : g.spec.target;
    setText(this.$('.place'), who ? this.placeAt(who.pos) : '');
    if (!this.$('.scoreboard').classList.contains('hidden')) this.renderScoreboard();
    if (this.buyOpen) { if (!g.canBuy()) this.toggleBuy(false); else if ((this.buyTick = (this.buyTick || 0) + dt) > 0.25) { this.buyTick = 0; this.refreshBuy(); } }
  }

  contextHint() {
    const g = this.g, p = g.player;
    if (!p.alive || g.useProgress) return '';
    const use = keyLabel(g.binds.use[0]);
    if (p.hasBomb && g.bomb.siteAt(p.pos) && g.state === 'live') return `Hold ${use} to plant the bomb`;
    if (p.team === 'CT' && g.bomb.state === 'planted' && p.pos.distanceTo(g.bomb.pos) < 2.2) return `Hold ${use} to defuse${p.hasKit ? '' : ' (a kit halves the time)'}`;
    const d = g.drops.aimed(p);
    if (d) return `${use} to pick up ${d.ws.def.name}`;
    return '';
  }

  bloom() { this.bloomV += this.g.player.weapon.def.auto ? 4 : 7; }

  message(main, sub, dur = 3, cls = '') {
    const m = this.$('.center-msg'), s = this.$('.sub-msg');
    m.textContent = main; s.textContent = sub || '';
    m.className = 'center-msg show ' + cls; s.className = 'sub-msg show';
    this.msgTimer = dur;
  }
  notice(text, dur = 2.2) { const n = this.$('.notice'); n.textContent = text; n.className = 'notice show'; this.noticeT = dur; }
  moneyGain(n) {
    const e = this.$('.money em');
    e.textContent = (n >= 0 ? '+$' : '-$') + Math.abs(n);
    e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
  }
  flash(strength, dur) { this.whitePeak = Math.max(this.whiteT > 0 ? this.whitePeak : 0, strength); this.whiteT = dur; this.whiteDur = dur; this.g.audio.ring?.(strength, dur); }

  roundStart() {
    this.$('.killfeed').innerHTML = '';
    const g = this.g;
    const sites = Object.keys(g.map.points?.plant || { A: 1, B: 1 });
    const job = g.playerTeam === 'T' ? `plant the bomb on ${sites.join(' or ')}` : 'stop the bomb plant, or defuse it';
    this.message(`Round ${g.round}`, `${TEAM_NAME[g.playerTeam]}: ${job} · ${keyLabel(g.binds.buy[0])} to buy`, 3.5);
    if (g.player.hasBomb) setTimeout(() => this.notice('You are carrying the bomb', 3), 1500);
  }
  goLive() { this.message('GO', '', 1, 'go'); }
  roundEnd(winner, reason, over) {
    const won = winner === this.g.playerTeam;
    if (over) this.message(won ? 'MATCH WON' : 'MATCH LOST', `${this.g.score.T} – ${this.g.score.CT}`, 8, won ? 'win' : 'lose');
    else this.message(`${TEAM_NAME[winner]} win`, reason, 4.5, won ? 'win' : 'lose');
  }

  killfeed(killer, victim, w, hs) {
    const f = this.$('.killfeed');
    const me = this.g.player;
    const e = el('div', 'kf' + (killer === me || victim === me ? ' me' : ''));
    e.innerHTML = `${killer && killer !== victim ? `<span class="${killer.team}">${killer.name}</span>` : ''}<i>${w.name}${hs ? ' <em>⌖</em>' : ''}</i><span class="${victim.team}">${victim.name}</span>`;
    f.prepend(e);
    while (f.children.length > 6) f.lastChild.remove();
    setTimeout(() => e.remove(), 7000);
  }

  hitmarker(head, kill) {
    const h = this.$('.hitmarker');
    h.className = 'hitmarker show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    clearTimeout(this.hmT); this.hmT = setTimeout(() => (h.className = 'hitmarker'), 140);
  }

  damageFrom(pos) {
    const p = this.g.player;
    const ang = Math.atan2(pos.x - p.pos.x, -(pos.z - p.pos.z)) + p.yaw;
    const d = el('div', 'arc');
    d.style.transform = `rotate(${ang}rad)`;
    this.$('.dmg-ind').appendChild(d);
    setTimeout(() => d.remove(), 900);
    const h = this.$('.hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
  }

  setScope(level, def) {
    const s = this.$('.scope');
    s.style.display = level ? 'block' : 'none';
    s.classList.toggle('lite', !!def && def.type !== 'sniper');
  }

  showScoreboard(v) { this.$('.scoreboard').classList.toggle('hidden', !v); if (v) this.renderScoreboard(); }
  renderScoreboard() {
    const g = this.g;
    const row = (c) => `<tr class="${c === g.player ? 'me' : ''} ${c.alive ? '' : 'dead'}"><td>${c.hasBomb && c.team === g.playerTeam ? '💣 ' : ''}${c.name}</td><td>${c.team === g.playerTeam ? '$' + c.money : ''}</td><td>${c.stats.kills}</td><td>${c.stats.assists}</td><td>${c.stats.deaths}</td><td>${c.stats.kills ? Math.round(c.stats.hs / c.stats.kills * 100) : 0}%</td><td>${Math.round(c.stats.damage / Math.max(1, g.round - (g.state === 'post' ? 0 : 1) || 1))}</td></tr>`;
    const team = (t) => {
      const list = g.characters.filter(c => c.team === t).sort((a, b) => b.stats.kills - a.stats.kills);
      return `<div class="sb-team ${t}"><h3>${TEAM_NAME[t]} <b>${g.score[t]}</b></h3><table><tr><th>Player</th><th>Money</th><th>K</th><th>A</th><th>D</th><th>HS</th><th>ADR</th></tr>${list.map(row).join('')}</table></div>`;
    };
    this.$('.scoreboard').innerHTML = team('CT') + team('T');
  }

  // ---------------------------------------------------------------- buy menu
  toggleBuy(force) {
    const g = this.g;
    this.buyOpen = force ?? !this.buyOpen;
    this.buyCat = null;
    const b = this.$('.buy');
    b.classList.toggle('hidden', !this.buyOpen);
    if (this.buyOpen) {
      document.exitPointerLock();
      this.renderBuy();
      b.onclick = (e) => {
        const rf = e.target.closest('[data-refund]');
        if (rf) { e.stopPropagation(); return this.refund(rf.dataset.refund); }
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.close) return this.toggleBuy(false);
        if (t.dataset.item) this.purchase(t.dataset.item);
      };
      // right-click sells back, like CS
      b.oncontextmenu = (e) => { e.preventDefault(); const t = e.target.closest('button[data-item]'); if (t) this.refund(t.dataset.item); };
    } else if (!g.paused && g.running) g.canvas.requestPointerLock();
  }

  purchase(id) {
    const r = this.g.buy(this.g.player, id);
    if (r.error) this.notice(r.error, 1.5);
    this.refreshBuy();
  }
  refund(id) {
    const r = this.g.refund(this.g.player, id);
    if (r.error) this.notice(r.error === 'Nothing to refund' ? 'Only unused things bought this round can be sold back' : r.error, 1.8);
    else this.notice(`Sold back for $${r.refund}`, 1.2);
    this.refreshBuy();
  }

  // Everything on one page, a column per category. Built only when it opens:
  // rebuilding the buttons while it's open swallows clicks (a click needs the
  // press and the release to land on the same element); refreshBuy updates
  // prices and states in place.
  renderBuy() {
    const g = this.g, p = g.player;
    const cats = BUY_MENU.map(([name, ids]) => [name, ids.filter(id => (WEAPONS[id] || GEAR[id]) && usableBy(id, p.team))]);
    const item = (id, i) => {
      const d = WEAPONS[id] || GEAR[id];
      return `<button data-item="${id}"><kbd>${i + 1}</kbd><span>${d.name}</span><b></b><em class="rf" data-refund="${id}" title="Sell back (right-click)">↺</em></button>`;
    };
    this.$('.buy').innerHTML = `
      <div class="buy-box wide">
        <div class="buy-head"><h2>Buy</h2><div class="buy-money"></div><div class="buy-time"></div><button data-close="1" class="x">Close</button></div>
        <div class="buy-grid">${cats.map(([name, ids], c) => `<section data-col="${c}"><h3><kbd>${c + 1}</kbd>${name}</h3>${ids.map(item).join('')}</section>`).join('')}</div>
        <p class="hint">Click to buy · right-click (or ↺) sells back anything bought this round and not used yet · keys: column number, then item number · ${keyLabel(g.binds.buy[0])} / Esc to close</p>
      </div>`;
    this.buyCats = cats;
    this.buyCat = null;
    this.refreshBuy();
  }

  // Money, time left, prices and what you can afford, updated in place.
  refreshBuy() {
    const g = this.g, p = g.player, root = this.$('.buy');
    setText(root.querySelector('.buy-money'), '$' + p.money);
    setText(root.querySelector('.buy-time'), g.state === 'freeze' ? 'Freeze time' : Math.max(0, Math.ceil(20 - g.roundTime)) + 's left');
    for (const btn of root.querySelectorAll('button[data-item]')) {
      const id = btn.dataset.item, d = WEAPONS[id] || GEAR[id];
      const block = buyBlock(p, id);
      const owned = (d.slot === 1 || d.slot === 2) && p.weapons[d.slot]?.id === id;
      btn.classList.toggle('no', !!block && !owned);
      btn.classList.toggle('own', owned);
      btn.classList.toggle('canrefund', !!refundable(p, id) && g.canBuy(p));
      if (btn.title !== (block || '')) btn.title = block || '';
      setText(btn.querySelector('b'), '$' + priceFor(p, id));
    }
  }

  // Number keys: a column, then an item in it (then back to choosing a column).
  buyKey(code) {
    const i = +code.slice(5) - 1;
    if (i < 0) return;
    const root = this.$('.buy');
    if (this.buyCat == null) { if (this.buyCats?.[i]) this.buyCat = i; }
    else { const id = this.buyCats[this.buyCat]?.[1][i]; if (id) this.purchase(id); this.buyCat = null; }
    for (const s of root.querySelectorAll('section[data-col]')) s.classList.toggle('on', +s.dataset.col === this.buyCat);
  }

  showPause(v) { this.$('.pause').classList.toggle('hidden', !v); }

  dispose() { this.root.remove(); }
}
