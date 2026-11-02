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
import { loadAssets } from './assets.js';
import { net } from './net/client.js';

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

let pendingResult = null;   // server match result that arrived while a game was still on screen

function launch(opts, onDone) {
  audio.init();
  menu.hide();
  canvas.style.visibility = 'visible';
  const skins = {};
  for (const slot of ['ak47', 'm4a1', 'awp', 'glock', 'usp', 'deagle', 'knife']) skins[slot] = P.equippedFor(slot);
  settings.name = P.getProfile().name;
  game = new Game(canvas, { ...opts, skins }, settings, async (result) => {
    game = null;
    window.__game = null;
    canvas.style.visibility = 'hidden';
    menu.show();
    await onDone(result);
  });
  window.__game = game;
  canvas.requestPointerLock();
}

// Offline / solo matches started from the menu.
function start(opts) {
  if (opts.online) { menu.queue(opts.online); return; }
  let ranked = null;
  if (opts.ranked) {
    // ranked: team size and length come from the ladder, bots scale to the hidden rating
    const L = R.LADDERS[opts.ranked];
    const m = R.matchSkills(opts.ranked);
    ranked = { id: opts.ranked, rating: m.rating };
    opts = { ...opts, teamSize: L.size, winRounds: L.win, side: 'random', skillFor: (ally) => (ally ? m.ally() : m.enemy()) };
  }
  launch(opts, async (result) => {
    if (!result) return;
    if (ranked) result.ranked = R.recordMatch(ranked.id, { ...result, oppRating: ranked.rating });
    result.reward = result.abandoned ? { credits: 0, drops: [] } : await P.awardMatch({ ...result, teamSize: opts.teamSize });
    if (result.reward?.error) result.reward = { credits: 0, drops: [], note: result.reward.error };
    menu.showResult(result);
  });
}

// ---------------------------------------------------------------- online
net.on('auth', (res) => {
  if (res) { P.setRemote(res.profile); R.setRemoteLadders(res.profile.ladders); }
  else { P.setRemote(null); R.setRemoteLadders(null); }
  menu.refresh();
});
net.on('profile', (p) => { P.setRemote(p); R.setRemoteLadders(p.ladders); menu.refresh(true); });
net.on('toast', (t) => menu.toast(t));
for (const ev of ['social', 'party', 'trades', 'mm', 'party.invite']) net.on(ev, (d) => menu.onNet(ev, d));
net.on('disconnected', () => { if (!game) menu.refresh(); });

net.on('match.found', ({ room, role, you }) => {
  menu.onNet('mm', { state: 'idle' });
  if (game) return;
  launch({ map: 'dunehold', teamSize: room.size, winRounds: room.winRounds, net: { room, role, you }, ranked: room.ladder && room.mode !== 'casual' ? room.ladder : null }, async (r) => {
    if (r?.left) { await net.rpc('room.leave'); menu.toast(room.mode === 'casual' ? 'You left the match' : 'You abandoned a ranked match'); return; }
    if (r?.reason) menu.toast(r.reason);
    if (pendingResult) { const pr = pendingResult; pendingResult = null; showServerResult(pr); }
    else menu.toast('Waiting for the match result…');
  });
});
net.on('match.result', (res) => {
  if (res.profile) { P.setRemote(res.profile); R.setRemoteLadders(res.profile.ladders); }
  if (game) pendingResult = res; else showServerResult(res);
});
net.on('room.closed', ({ reason }) => { if (game?.net && reason !== 'finished') game.finishNet(reason); });

function showServerResult(res) {
  const me = net.user?.name;
  menu.showResult({ ...res, players: (res.players || []).map(p => ({ ...p, you: p.name === me })) });
}

// resume a saved session silently
if (net.token()) net.connect().then(() => net.resume()).catch(() => menu.refresh());

canvas.style.visibility = 'hidden';
// load the Blender-built weapons and maps before showing the menu
root.style.display = 'block';
root.innerHTML = '<div class="loading"><b>VANTAGE</b><span>Loading models</span><i><em style="width:0%"></em></i></div>';
await loadAssets((f) => { const e = root.querySelector('.loading em'); if (e) e.style.width = Math.round(f * 100) + '%'; });
menu.show();
window.__menu = menu;
window.__profile = P; // handy for debugging from the console
window.__ranked = R;
window.__net = net;
