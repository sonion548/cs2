// Entry point: main menu, settings, match setup.
import { Game } from './game.js';
import { MAPS } from './maps.js';
import { audio } from './audio.js';
import { TEAM_NAME } from './hud.js';

const SETTINGS_KEY = 'vantage.settings';
const defaults = { sensitivity: 2.0, volume: 0.6, fov: 74, crosshairColor: '#4dff6a', crosshairSize: 6, crosshairDot: false, name: 'You' };

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* storage unavailable */ }
  const out = { ...defaults, ...s };
  out.save = () => { try { const { save, ...rest } = out; localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest)); } catch { /* ignore */ } };
  return out;
}

const settings = loadSettings();
audio.setVolume(settings.volume);
const menu = document.getElementById('menu');
const canvas = document.getElementById('view');
let game = null;

const DIFFS = [
  ['Recruit', 0.05], ['Regular', 0.3], ['Veteran', 0.55], ['Expert', 0.78], ['Elite', 0.95],
];

const MODES = [
  { id: '5v5', label: '5v5 Competitive', size: 5, win: 13 },
  { id: '3v3', label: '3v3', size: 3, win: 9 },
  { id: '2v2', label: '2v2 Wingman', size: 2, win: 9 },
  { id: '1v1', label: '1v1 Duel', size: 1, win: 9 },
];

const state = { mode: '5v5', diff: 2, side: 'random', map: 'dunehold' };

function renderMenu(result) {
  menu.style.display = 'flex';
  canvas.style.visibility = 'hidden';
  menu.innerHTML = `
    <div class="menu-bg"></div>
    <div class="menu-inner">
      <header><h1>VANTAGE</h1><p>tactical shooter · build 0.1</p></header>
      ${result ? resultCard(result) : ''}
      <section class="card">
        <h2>Play vs bots</h2>
        <div class="row"><span>Mode</span><div class="seg" data-k="mode">${MODES.map(m => `<button data-v="${m.id}">${m.label}</button>`).join('')}</div></div>
        <div class="row"><span>Bot skill</span><div class="seg" data-k="diff">${DIFFS.map((d, i) => `<button data-v="${i}">${d[0]}</button>`).join('')}</div></div>
        <div class="row"><span>Side</span><div class="seg" data-k="side">
          <button data-v="T">${TEAM_NAME.T}</button><button data-v="CT">${TEAM_NAME.CT}</button><button data-v="random">Random</button></div></div>
        <div class="row"><span>Map</span><div class="seg" data-k="map">${Object.entries(MAPS).map(([id, m]) => `<button data-v="${id}">${m.name}</button>`).join('')}</div></div>
        <p class="desc">${MAPS[state.map].description}</p>
        <button class="play">Start match</button>
      </section>
      <section class="card">
        <h2>Settings</h2>
        <div class="row"><span>Name</span><input type="text" maxlength="16" data-s="name" value="${settings.name}"></div>
        <div class="row"><span>Sensitivity</span><input type="range" min="0.2" max="6" step="0.05" data-s="sensitivity" value="${settings.sensitivity}"><output>${settings.sensitivity}</output></div>
        <div class="row"><span>Volume</span><input type="range" min="0" max="1" step="0.01" data-s="volume" value="${settings.volume}"><output>${settings.volume}</output></div>
        <div class="row"><span>Field of view</span><input type="range" min="60" max="90" step="1" data-s="fov" value="${settings.fov}"><output>${settings.fov}</output></div>
        <div class="row"><span>Crosshair</span><input type="color" data-s="crosshairColor" value="${settings.crosshairColor}">
          <input type="range" min="2" max="14" step="1" data-s="crosshairSize" value="${settings.crosshairSize}"><output>${settings.crosshairSize}</output>
          <label class="chk"><input type="checkbox" data-s="crosshairDot" ${settings.crosshairDot ? 'checked' : ''}> dot</label></div>
      </section>
      <section class="card controls">
        <h2>Controls</h2>
        <div class="keys">
          <span><kbd>WASD</kbd> move</span><span><kbd>Shift</kbd> walk</span><span><kbd>C</kbd>/<kbd>Ctrl</kbd> crouch</span><span><kbd>Space</kbd> jump</span>
          <span><kbd>LMB</kbd> fire</span><span><kbd>RMB</kbd> scope / heavy stab</span><span><kbd>R</kbd> reload</span><span><kbd>F</kbd> inspect</span>
          <span><kbd>1 2 3</kbd> / wheel switch</span><span><kbd>Q</kbd> last weapon</span><span><kbd>B</kbd> loadout</span><span><kbd>Tab</kbd> scores</span>
          <span><kbd>Esc</kbd> pause</span>
        </div>
        <p class="desc">Every gun sprays the same pattern every time. Pull down (and against the sideways sway) to keep bullets on target, and stop moving before you shoot for full accuracy.</p>
      </section>
    </div>`;
  for (const seg of menu.querySelectorAll('.seg')) {
    const k = seg.dataset.k;
    for (const b of seg.children) {
      b.classList.toggle('sel', String(state[k]) === b.dataset.v);
      b.onclick = () => { state[k] = k === 'diff' ? +b.dataset.v : b.dataset.v; audio.init(); audio.ui(); renderMenu(result); };
    }
  }
  for (const inp of menu.querySelectorAll('[data-s]')) {
    inp.oninput = () => {
      const k = inp.dataset.s;
      settings[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
      if (inp.nextElementSibling?.tagName === 'OUTPUT') inp.nextElementSibling.textContent = inp.value;
      if (k === 'volume') audio.setVolume(settings.volume);
      settings.save();
    };
  }
  menu.querySelector('.play').onclick = start;
}

function resultCard(r) {
  const rows = r.players.filter(p => p.team === r.team).sort((a, b) => b.kills - a.kills)
    .map(p => `<tr class="${p.you ? 'me' : ''}"><td>${p.name}</td><td>${p.kills}</td><td>${p.assists}</td><td>${p.deaths}</td></tr>`).join('');
  return `<section class="card result ${r.won ? 'win' : 'lose'}">
    <h2>${r.won ? 'Victory' : 'Defeat'} <b>${r.score[r.team]} – ${r.score[r.team === 'T' ? 'CT' : 'T']}</b></h2>
    <table><tr><th>Player</th><th>K</th><th>A</th><th>D</th></tr>${rows}</table></section>`;
}

function start() {
  audio.init();
  const mode = MODES.find(m => m.id === state.mode);
  menu.style.display = 'none';
  canvas.style.visibility = 'visible';
  game = new Game(canvas, {
    map: state.map, teamSize: mode.size, winRounds: mode.win,
    skill: DIFFS[state.diff][1], side: state.side,
  }, settings, (result) => { game = null; renderMenu(result); });
  window.__game = game;
  canvas.requestPointerLock();
}

renderMenu();
