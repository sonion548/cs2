// DOM-based HUD: vitals, ammo, timer, score, kill feed, radar, scoreboard,
// buy menu, scope overlay, hit markers and damage indicators.
import { WEAPONS, PRIMARIES, SECONDARIES } from './weapons.js';

export const TEAM_NAME = { T: 'Attackers', CT: 'Defenders' };

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

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
      <div class="killfeed"></div>
      <div class="crosshair"><i class="l"></i><i class="r"></i><i class="u"></i><i class="d"></i><b></b></div>
      <div class="hitmarker"></div>
      <div class="dmg-ind"></div>
      <div class="center-msg"></div>
      <div class="sub-msg"></div>
      <div class="vitals">
        <div class="hp"><span class="ico">+</span><b></b></div>
        <div class="ap"><span class="ico">◈</span><b></b></div>
      </div>
      <div class="ammo"><div class="wname"></div><div><b class="mag"></b><span class="res"></span></div></div>
      <div class="scope"><div class="scope-ring"></div></div>
      <div class="hurt"></div>
      <div class="spec"></div>
      <div class="scoreboard hidden"></div>
      <div class="buy hidden"></div>
      <div class="pause hidden">
        <div class="pause-box">
          <h2>Paused</h2>
          <button data-a="resume">Resume</button>
          <label>Sensitivity <input type="range" min="0.2" max="6" step="0.05" data-s="sensitivity"><span></span></label>
          <label>Volume <input type="range" min="0" max="1" step="0.01" data-s="volume"><span></span></label>
          <button data-a="quit" class="danger">Leave match</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.$ = (s) => root.querySelector(s);
    this.radar = this.$('.radar').getContext('2d');
    this.ch = this.$('.crosshair');
    this.bloomV = 0;
    this.msgTimer = 0;
    this.buyOpen = false;
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

  applyCrosshair() {
    const s = this.g.settings;
    this.ch.style.setProperty('--cc', s.crosshairColor || '#4dff6a');
    this.ch.style.setProperty('--cs', (s.crosshairSize ?? 6) + 'px');
    this.ch.querySelector('b').style.display = s.crosshairDot ? 'block' : 'none';
  }

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
      x.fillStyle = ch === 'A' || ch === 'B' || ch === '^' || ch === 's' ? '#6b5e47' : ch === 'u' ? '#3b4048' : '#59606a';
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

  drawRadar() {
    const g = this.g, x = this.radar, s = this.radarScale, [ox, oz] = this.radarOff;
    x.clearRect(0, 0, 220, 220);
    x.drawImage(this.radarBase, 0, 0);
    const me = g.player;
    const dot = (c, col, r = 4) => { x.fillStyle = col; x.beginPath(); x.arc(ox + c.pos.x * s, oz + c.pos.z * s, r, 0, 7); x.fill(); };
    for (const c of g.characters) {
      if (c === me) continue;
      if (c.team === me.team) { if (c.alive) dot(c, '#59a8ff'); else { x.fillStyle = '#59a8ff'; x.fillText('×', ox + c.pos.x * s, oz + c.pos.z * s + 5); } }
      else if (c.alive && (g.spotted[me.team].get(c) || 0) > g.time) dot(c, '#ff4d4d');
    }
    if (me.alive) {
      const px = ox + me.pos.x * s, pz = oz + me.pos.z * s;
      x.save(); x.translate(px, pz); x.rotate(-me.yaw);
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 5); x.lineTo(0, 2); x.lineTo(-5, 5); x.closePath(); x.fill();
      x.restore();
    }
  }

  fmtTime(t) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

  update(dt) {
    const g = this.g, p = g.player;
    this.$('.time').textContent = this.fmtTime(g.stateTimer);
    this.$('.time').classList.toggle('freeze', g.state === 'freeze');
    this.$('.round').textContent = `Round ${g.round} · first to ${g.winRounds}`;
    this.$('.team-score.t .sc').textContent = g.score.T;
    this.$('.team-score.ct .sc').textContent = g.score.CT;
    this.$('.team-score.t .alive').textContent = '●'.repeat(g.aliveCount('T'));
    this.$('.team-score.ct .alive').textContent = '●'.repeat(g.aliveCount('CT'));
    const shown = p.alive ? p : g.spectating;
    if (shown) {
      this.$('.hp b').textContent = Math.max(0, shown.health);
      this.$('.ap b').textContent = shown.armor;
      this.$('.hp').classList.toggle('low', shown.health <= 25);
      const w = shown.weapon;
      this.$('.wname').textContent = w.def.name;
      this.$('.mag').textContent = w.def.type === 'melee' ? '' : w.ammo;
      this.$('.res').textContent = w.def.type === 'melee' ? '' : ' / ' + w.reserve;
      this.$('.mag').classList.toggle('low', w.def.magSize > 0 && w.ammo <= Math.ceil(w.def.magSize * 0.2));
    }
    // dynamic crosshair gap from inaccuracy + bloom from firing
    this.bloomV *= Math.exp(-8 * dt);
    if (p.alive) {
      const gap = 3 + Math.min(40, p.inaccuracy() * 500 + this.bloomV);
      this.ch.style.setProperty('--gap', gap.toFixed(1) + 'px');
    }
    this.ch.style.display = p.alive && !p.scoped && p.weapon.def.type !== 'sniper' ? '' : 'none';
    const spec = this.$('.spec');
    if (!p.alive && g.spectating) { spec.style.display = 'block'; spec.innerHTML = `Spectating <b>${g.spectating.name}</b> · <span>A / D to switch</span>`; }
    else spec.style.display = 'none';
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) { this.$('.center-msg').classList.remove('show'); this.$('.sub-msg').classList.remove('show'); } }
    this.drawRadar();
    if (!this.$('.scoreboard').classList.contains('hidden')) this.renderScoreboard();
    if (this.buyOpen && !g.canBuy()) this.toggleBuy(false);
  }

  bloom() { this.bloomV += this.g.player.weapon.def.type === 'rifle' ? 4 : 7; }

  message(main, sub, dur = 3, cls = '') {
    const m = this.$('.center-msg'), s = this.$('.sub-msg');
    m.textContent = main; s.textContent = sub || '';
    m.className = 'center-msg show ' + cls; s.className = 'sub-msg show';
    this.msgTimer = dur;
  }

  roundStart() {
    this.$('.killfeed').innerHTML = '';
    this.message(`Round ${this.g.round}`, `You are on the ${TEAM_NAME[this.g.playerTeam]} · press B to change loadout`, 3);
  }
  goLive() { this.message('GO', '', 1, 'go'); }
  roundEnd(winner, reason, over) {
    const won = winner === this.g.playerTeam;
    if (over) this.message(won ? 'MATCH WON' : 'MATCH LOST', `${this.g.score.T} – ${this.g.score.CT}`, 8, won ? 'win' : 'lose');
    else this.message(`${TEAM_NAME[winner]} win`, reason, 4.5, won ? 'win' : 'lose');
  }

  killfeed(killer, victim, w, hs) {
    const f = this.$('.killfeed');
    const e = el('div', 'kf' + (killer === this.g.player || victim === this.g.player ? ' me' : ''));
    e.innerHTML = `<span class="${killer.team}">${killer.name}</span><i>${w.name}${hs ? ' <em>⌖</em>' : ''}</i><span class="${victim.team}">${victim.name}</span>`;
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

  setScope(level) { this.$('.scope').style.display = level ? 'block' : 'none'; }

  showScoreboard(v) { this.$('.scoreboard').classList.toggle('hidden', !v); if (v) this.renderScoreboard(); }
  renderScoreboard() {
    const g = this.g;
    const row = (c) => `<tr class="${c === g.player ? 'me' : ''} ${c.alive ? '' : 'dead'}"><td>${c.name}</td><td>${c.stats.kills}</td><td>${c.stats.assists}</td><td>${c.stats.deaths}</td><td>${c.stats.kills ? Math.round(c.stats.hs / c.stats.kills * 100) : 0}%</td><td>${Math.round(c.stats.damage / Math.max(1, g.round - (g.state === 'post' ? 0 : 1) || 1))}</td></tr>`;
    const team = (t) => {
      const list = g.characters.filter(c => c.team === t).sort((a, b) => b.stats.kills - a.stats.kills);
      return `<div class="sb-team ${t}"><h3>${TEAM_NAME[t]} <b>${g.score[t]}</b></h3><table><tr><th>Player</th><th>K</th><th>A</th><th>D</th><th>HS</th><th>ADR</th></tr>${list.map(row).join('')}</table></div>`;
    };
    this.$('.scoreboard').innerHTML = team('CT') + team('T');
  }

  toggleBuy(force) {
    const g = this.g;
    this.buyOpen = force ?? !this.buyOpen;
    const b = this.$('.buy');
    b.classList.toggle('hidden', !this.buyOpen);
    if (this.buyOpen) {
      document.exitPointerLock();
      const team = g.playerTeam;
      const prim = PRIMARIES.filter(id => !WEAPONS[id].team || WEAPONS[id].team === team);
      const sec = SECONDARIES.filter(id => !WEAPONS[id].team || WEAPONS[id].team === team);
      this.buyList = [...prim.map(id => ['p', id]), ...sec.map(id => ['s', id])];
      b.innerHTML = `<h2>Loadout <small>(free during warm-up builds · economy comes with cases update)</small></h2>
        <div class="buy-cols"><div><h4>Primary</h4>${prim.map((id, i) => `<button data-p="${id}" class="${g.loadout.primary === id ? 'sel' : ''}"><kbd>${i + 1}</kbd>${WEAPONS[id].name}</button>`).join('')}</div>
        <div><h4>Pistol</h4>${sec.map((id, i) => `<button data-s="${id}" class="${g.loadout.secondary === id ? 'sel' : ''}"><kbd>${prim.length + i + 1}</kbd>${WEAPONS[id].name}</button>`).join('')}</div></div>
        <p class="hint">Click or press the number. B / Esc to close.</p>`;
      b.onclick = (e) => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.p) g.giveLoadout(t.dataset.p, g.loadout.secondary);
        if (t.dataset.s) { g.giveLoadout(g.loadout.primary, t.dataset.s); g.switchWeapon(2); }
        this.toggleBuy(true);
      };
    } else if (!g.paused && g.running) g.canvas.requestPointerLock();
  }
  buyKey(code) {
    const i = +code.slice(5) - 1;
    const it = this.buyList?.[i]; if (!it) return;
    const g = this.g;
    if (it[0] === 'p') g.giveLoadout(it[1], g.loadout.secondary);
    else { g.giveLoadout(g.loadout.primary, it[1]); g.switchWeapon(2); }
    this.toggleBuy(true);
  }

  showPause(v) { this.$('.pause').classList.toggle('hidden', !v); }

  dispose() { this.root.remove(); }
}
