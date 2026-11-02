// Entry point: client menu, settings, match setup and rewards.
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import { Game } from './game.js';
import { audio } from './audio.js';
import { Menu } from './ui/menu.js';
import * as P from './items/profile.js';
import * as R from './ranked.js';

const SETTINGS_KEY = 'vantage.settings';
const defaults = { sensitivity: 2.0, volume: 0.6, fov: 74, crosshairColor: '#4dff6a', crosshairSize: 6, crosshairDot: false };

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* storage unavailable */ }
  const out = { ...defaults, ...s };
  out.save = () => { try { const { save, ...rest } = out; localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest)); } catch { /* ignore */ } };
  return out;
}

const settings = loadSettings();
audio.setVolume(settings.volume);
const root = document.getElementById('menu');
const canvas = document.getElementById('view');
let game = null;

const menu = new Menu(root, settings, start);

function start(opts) {
  audio.init();
  let ranked = null;
  if (opts.ranked) {
    // ranked: team size and length come from the ladder, bots scale to the hidden rating
    const L = R.LADDERS[opts.ranked];
    const m = R.matchSkills(opts.ranked);
    ranked = { id: opts.ranked, rating: m.rating };
    opts = { ...opts, teamSize: L.size, winRounds: L.win, side: 'random', skillFor: (ally) => (ally ? m.ally() : m.enemy()) };
  }
  menu.hide();
  canvas.style.visibility = 'visible';
  const skins = {};
  for (const slot of ['ak47', 'm4a1', 'awp', 'glock', 'usp', 'deagle', 'knife']) skins[slot] = P.equippedFor(slot);
  settings.name = P.getProfile().name;
  game = new Game(canvas, { ...opts, skins }, settings, (result) => {
    game = null;
    window.__game = null;
    canvas.style.visibility = 'hidden';
    if (result) {
      if (ranked) result.ranked = R.recordMatch(ranked.id, { ...result, oppRating: ranked.rating });
      result.reward = result.abandoned ? { credits: 0, drops: [] } : P.awardMatch({ ...result, teamSize: opts.teamSize });
    }
    menu.show(result);
  });
  window.__game = game;
  canvas.requestPointerLock();
}

canvas.style.visibility = 'hidden';
menu.show();
window.__menu = menu;
window.__profile = P; // handy for debugging from the console
window.__ranked = R;
