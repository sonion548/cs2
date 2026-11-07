// Procedural sticker artwork (die-cut with a white border) and finish overlays.
import { makeCanvas } from './canvas.js';
import { rng } from '../noise.js';
import { HandCtx, paper } from './handdrawn.js';

const cache = new Map();

const ICONS = {
  crown(x) { x.beginPath(); x.moveTo(-60, 40); x.lineTo(-70, -30); x.lineTo(-30, 5); x.lineTo(0, -50); x.lineTo(30, 5); x.lineTo(70, -30); x.lineTo(60, 40); x.closePath(); x.fill(); x.fillRect(-60, 46, 120, 16); },
  flame(x) { x.beginPath(); x.moveTo(0, -75); x.bezierCurveTo(50, -20, 60, 20, 40, 50); x.bezierCurveTo(25, 75, -25, 75, -40, 50); x.bezierCurveTo(-60, 20, -30, -10, -20, -30); x.bezierCurveTo(-10, -5, 0, 0, 5, -20); x.bezierCurveTo(10, -40, 0, -60, 0, -75); x.fill(); },
  bolt(x) { x.beginPath(); x.moveTo(15, -80); x.lineTo(-45, 10); x.lineTo(-5, 10); x.lineTo(-20, 80); x.lineTo(45, -15); x.lineTo(5, -15); x.closePath(); x.fill(); },
  star(x) { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 32 : 75, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); },
  eye(x, bg) { x.beginPath(); x.moveTo(-80, 0); x.quadraticCurveTo(0, -70, 80, 0); x.quadraticCurveTo(0, 70, -80, 0); x.fill(); x.fillStyle = bg; x.beginPath(); x.arc(0, 0, 28, 0, 7); x.fill(); },
  heart(x) { x.beginPath(); x.moveTo(0, 65); x.bezierCurveTo(-90, 0, -60, -75, 0, -30); x.bezierCurveTo(60, -75, 90, 0, 0, 65); x.fill(); },
  crosshair(x) { x.lineWidth = 12; x.strokeStyle = x.fillStyle; x.beginPath(); x.arc(0, 0, 50, 0, 7); x.stroke(); for (const [a, b, c, d] of [[0, -80, 0, -25], [0, 25, 0, 80], [-80, 0, -25, 0], [25, 0, 80, 0]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); } x.beginPath(); x.arc(0, 0, 8, 0, 7); x.fill(); },
  dice(x, bg) { x.save(); x.rotate(0.25); x.beginPath(); x.roundRect(-55, -55, 110, 110, 18); x.fill(); x.fillStyle = bg; for (const [a, b] of [[-28, -28], [28, 28], [0, 0], [28, -28], [-28, 28]]) { x.beginPath(); x.arc(a, b, 10, 0, 7); x.fill(); } x.restore(); },
  skull(x, bg) { x.beginPath(); x.arc(0, -15, 55, Math.PI, 0); x.lineTo(55, 15); x.quadraticCurveTo(45, 35, 30, 35); x.lineTo(30, 60); x.lineTo(-30, 60); x.lineTo(-30, 35); x.quadraticCurveTo(-45, 35, -55, 15); x.closePath(); x.fill(); x.fillStyle = bg; x.beginPath(); x.ellipse(-22, 0, 14, 17, 0, 0, 7); x.ellipse(22, 0, 14, 17, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(0, 18); x.lineTo(-8, 32); x.lineTo(8, 32); x.fill(); for (let i = -2; i <= 2; i++) x.fillRect(i * 11 - 2, 42, 4, 18); },
  rocket(x, bg) { x.save(); x.rotate(0.6); x.beginPath(); x.moveTo(0, -80); x.quadraticCurveTo(35, -40, 28, 35); x.lineTo(-28, 35); x.quadraticCurveTo(-35, -40, 0, -80); x.fill(); x.beginPath(); x.moveTo(-28, 10); x.lineTo(-50, 55); x.lineTo(-25, 40); x.moveTo(28, 10); x.lineTo(50, 55); x.lineTo(25, 40); x.fill(); x.fillStyle = bg; x.beginPath(); x.arc(0, -25, 13, 0, 7); x.fill(); x.fillStyle = '#ffb21a'; x.beginPath(); x.moveTo(-18, 40); x.lineTo(0, 80); x.lineTo(18, 40); x.fill(); x.restore(); },
  ghost(x, bg) { x.beginPath(); x.arc(0, -15, 50, Math.PI, 0); x.lineTo(50, 60); for (let i = 0; i < 4; i++) x.quadraticCurveTo(37.5 - i * 25, 40, 25 - i * 25, 60); x.closePath(); x.fill(); x.fillStyle = bg; x.beginPath(); x.ellipse(-18, -15, 9, 13, 0, 0, 7); x.ellipse(18, -15, 9, 13, 0, 0, 7); x.fill(); },
  diamond(x) { x.beginPath(); x.moveTo(-60, -25); x.lineTo(-30, -60); x.lineTo(30, -60); x.lineTo(60, -25); x.lineTo(0, 70); x.closePath(); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 4; x.beginPath(); x.moveTo(-60, -25); x.lineTo(60, -25); x.moveTo(-30, -60); x.lineTo(-15, -25); x.lineTo(0, 70); x.lineTo(15, -25); x.lineTo(30, -60); x.stroke(); },
  clover(x) { for (let i = 0; i < 4; i++) { x.save(); x.rotate(i * Math.PI / 2); x.beginPath(); x.arc(-16, -30, 24, 0, 7); x.arc(16, -30, 24, 0, 7); x.fill(); x.restore(); } x.fillRect(-4, 20, 8, 60); },
  sun(x) { x.beginPath(); x.arc(0, 10, 40, Math.PI, 0); x.fill(); for (let i = 0; i < 9; i++) { const a = Math.PI + i * Math.PI / 8; x.save(); x.translate(Math.cos(a) * 60, 10 + Math.sin(a) * 60); x.rotate(a + Math.PI / 2); x.fillRect(-5, -15, 10, 26); x.restore(); } x.fillRect(-80, 18, 160, 8); x.fillRect(-60, 34, 120, 8); },
  moon(x, bg) { x.beginPath(); x.arc(0, 0, 60, 0, 7); x.fill(); x.fillStyle = bg; x.beginPath(); x.arc(25, -15, 52, 0, 7); x.fill(); },
  anchor(x) { x.lineWidth = 13; x.strokeStyle = x.fillStyle; x.lineCap = 'round'; x.beginPath(); x.arc(0, -55, 14, 0, 7); x.stroke(); x.beginPath(); x.moveTo(0, -40); x.lineTo(0, 65); x.moveTo(-35, -15); x.lineTo(35, -15); x.stroke(); x.beginPath(); x.arc(0, 15, 55, 0.2, Math.PI - 0.2); x.stroke(); },
  shield(x, bg) { x.beginPath(); x.moveTo(0, -75); x.lineTo(60, -50); x.quadraticCurveTo(60, 40, 0, 75); x.quadraticCurveTo(-60, 40, -60, -50); x.closePath(); x.fill(); x.fillStyle = bg; x.fillRect(-6, -55, 12, 110); x.fillRect(-45, -10, 90, 12); },
  sword(x) { x.save(); x.rotate(-0.78); x.beginPath(); x.moveTo(0, -85); x.lineTo(12, -65); x.lineTo(10, 35); x.lineTo(-10, 35); x.lineTo(-12, -65); x.closePath(); x.fill(); x.fillRect(-35, 35, 70, 10); x.fillRect(-7, 45, 14, 32); x.beginPath(); x.arc(0, 82, 9, 0, 7); x.fill(); x.restore(); },
  paw(x) { x.beginPath(); x.ellipse(0, 25, 38, 32, 0, 0, 7); x.fill(); for (const [a, b] of [[-48, -15], [-18, -48], [18, -48], [48, -15]]) { x.beginPath(); x.ellipse(a, b, 15, 20, a * 0.01, 0, 7); x.fill(); } },
};

// Returns a 256×256 canvas for a sticker definition.
export function stickerCanvas(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const S = 256, c = makeCanvas(S, S);
  const raw = c.getContext('2d');
  // sticker art is drawn by hand: marker outlines and gouache fills
  const x = new HandCtx(raw, { seed: [...def.id].reduce((a, ch) => a + ch.charCodeAt(0), 0), style: 'gouache', wobble: 0.8 });
  const d = def.design;
  const shapeBadge = () => {
    if (def.style === 'text') { x.beginPath(); x.roundRect(14, 64, S - 28, S - 128, 28); }
    else { x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 14, 0, 7); }
  };
  // white die-cut border
  x.fillStyle = '#f4f2ec';
  shapeBadge(); x.fill();
  x.save();
  x.translate(S / 2, S / 2); x.scale(0.93, 0.93); x.translate(-S / 2, -S / 2);
  shapeBadge(); x.clip();
  x.fillStyle = d.bg; x.fillRect(0, 0, S, S);
  if (def.style === 'text') {
    const t = d.text;
    let size = 120;
    x.font = `italic 900 ${size}px "Barlow Condensed", Impact, sans-serif`;
    while (x.measureText(t).width > S - 60 && size > 30) { size -= 4; x.font = `italic 900 ${size}px "Barlow Condensed", Impact, sans-serif`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (d.accent) { x.fillStyle = d.accent; x.fillRect(20, S / 2 + size * 0.32, S - 40, 8); }
    x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.35)'; x.strokeText(t, S / 2 + 3, S / 2 + 5);
    x.fillStyle = d.fg; x.fillText(t, S / 2, S / 2);
  } else {
    x.translate(S / 2, S / 2);
    x.fillStyle = d.fg;
    ICONS[d.icon](x, d.bg);
  }
  x.restore();
  // finish overlay
  x.save(); shapeBadge(); x.clip();
  if (def.finishType === 'holo') {
    const g = x.createLinearGradient(0, 0, S, S);
    ['#ff4a8a', '#ffd23a', '#4aff9a', '#3ab0ff', '#b04aff', '#ff4a8a'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.75; x.fillStyle = g; x.fillRect(0, 0, S, S);
  } else if (def.finishType === 'foil') {
    const g = x.createLinearGradient(0, 0, S, S * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.65)'); g.addColorStop(0.55, 'rgba(255,255,255,0.0)');
    x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'overlay'; x.fillStyle = 'rgba(200,210,230,0.5)'; x.fillRect(0, 0, S, S);
  } else if (def.finishType === 'gold') {
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.4, '#d4a23a'); g.addColorStop(0.6, '#fff0a0'); g.addColorStop(1, '#8a5a12');
    x.globalCompositeOperation = 'color'; x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'overlay'; x.fillRect(0, 0, S, S);
  }
  x.restore();
  paper(c, def.id.length * 17, 0.6);
  cache.set(def.id, c);
  return c;
}

// Scraped copy of a sticker canvas (wear 0..1 removes ink in patches).
export function wornSticker(def, wear, seed = 1) {
  const base = stickerCanvas(def);
  if (!wear) return base;
  const c = makeCanvas(base.width, base.width);
  const x = c.getContext('2d');
  x.drawImage(base, 0, 0);
  const r = rng(seed * 31 + 7);
  x.globalCompositeOperation = 'destination-out';
  const n = Math.floor(wear * 260);
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(0,0,0,${(0.3 + r() * 0.7) * Math.min(1, wear * 1.4)})`;
    const s = 3 + r() * 18 * wear;
    x.beginPath(); x.arc(r() * c.width, r() * c.height, s, 0, 7); x.fill();
  }
  return c;
}
