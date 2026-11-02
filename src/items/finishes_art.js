// Illustrated finishes: anime-style portraits of original characters, painted
// landscapes, street graffiti, comic pop-art, tattoo flash, mecha livery and
// sticker bombs. Everything is drawn with canvas paths at paint time.
import { rng } from '../noise.js';
import { STICKERS } from './catalog.js';
import { stickerCanvas } from './stickers.js';

const TAU = Math.PI * 2;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
}

// ---------------------------------------------------------------- backgrounds
function bgSakura(x, W, H, p, r) {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.sky1 || '#ffd6e4'); g.addColorStop(1, p.sky2 || '#ff9ab8');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    x.save(); x.translate(r() * W, r() * H); x.rotate(r() * TAU);
    x.fillStyle = `rgba(255,${200 + r() * 40},${220 + r() * 30},${0.5 + r() * 0.5})`;
    const s = 4 + r() * 9;
    x.beginPath(); x.ellipse(0, 0, s, s * 0.55, 0, 0, TAU); x.fill(); x.restore();
  }
}
function bgNeon(x, W, H, p, r) {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120a2a'); g.addColorStop(0.6, '#3a0f4a'); g.addColorStop(1, '#ff4a8a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const bw = 30 + r() * 70, bh = H * (0.25 + r() * 0.6), bx = r() * W;
    x.fillStyle = '#0d0820'; x.fillRect(bx, H - bh, bw, bh);
    for (let k = 0; k < 18; k++) { x.fillStyle = r() < 0.5 ? '#ff5ab0' : '#5ae0ff'; x.globalAlpha = 0.7; x.fillRect(bx + 4 + r() * (bw - 10), H - bh + 6 + r() * (bh - 12), 4, 3); }
    x.globalAlpha = 1;
  }
}
function bgSpeed(x, W, H, p, r) {
  x.fillStyle = p.bg || '#ffe14a'; x.fillRect(0, 0, W, H);
  x.strokeStyle = p.lines || 'rgba(255,255,255,0.8)';
  const cx = W * 0.4, cy = H * 0.5;
  for (let i = 0; i < 90; i++) {
    const a = r() * TAU, r0 = 150 + r() * 80;
    x.lineWidth = 1 + r() * 5;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * 1200, cy + Math.sin(a) * 1200); x.stroke();
  }
}
function bgSunset(x, W, H) {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a1a5a'); g.addColorStop(0.5, '#ff7a5a'); g.addColorStop(1, '#ffd27a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}
const BACKGROUNDS = { sakura: bgSakura, neon: bgNeon, speed: bgSpeed, sunset: bgSunset };

// ---------------------------------------------------------------- portrait
// Draws an original anime-style character bust centred at (cx, cy) with head
// radius R. Traits come from params so each skin has its own character.
function drawCharacter(x, cx, cy, R, c) {
  const skin = c.skin || '#ffe0cc', hair = c.hair, hairD = shade(hair, -0.18), hairL = shade(hair, 0.15);
  x.save(); x.translate(cx, cy);
  x.lineJoin = 'round'; x.lineCap = 'round';
  const ink = '#2a1a22';

  // back hair
  x.fillStyle = hairD;
  x.beginPath();
  if (c.style === 'long') { x.moveTo(-R * 1.05, -R * 0.2); x.quadraticCurveTo(-R * 1.35, R * 1.6, -R * 0.9, R * 2.3); x.lineTo(R * 0.9, R * 2.3); x.quadraticCurveTo(R * 1.35, R * 1.6, R * 1.05, -R * 0.2); }
  else if (c.style === 'bob') { x.moveTo(-R * 1.08, -R * 0.2); x.quadraticCurveTo(-R * 1.2, R * 0.9, -R * 0.7, R * 1.05); x.lineTo(R * 0.7, R * 1.05); x.quadraticCurveTo(R * 1.2, R * 0.9, R * 1.08, -R * 0.2); }
  else { x.moveTo(-R, -R * 0.1); x.lineTo(R, -R * 0.1); x.lineTo(R * 0.9, R * 0.5); x.lineTo(-R * 0.9, R * 0.5); }
  x.closePath(); x.fill();
  if (c.style === 'twintail') for (const s of [-1, 1]) {
    x.beginPath(); x.moveTo(s * R * 0.85, -R * 0.55);
    x.bezierCurveTo(s * R * 2.0, -R * 0.4, s * R * 1.9, R * 1.4, s * R * 1.4, R * 2.2);
    x.bezierCurveTo(s * R * 1.3, R * 1.2, s * R * 1.15, R * 0.2, s * R * 0.75, -R * 0.2);
    x.closePath(); x.fill();
  }

  // shoulders + outfit
  x.fillStyle = c.outfit;
  x.beginPath(); x.moveTo(-R * 1.5, R * 2.4); x.quadraticCurveTo(-R * 1.4, R * 1.25, -R * 0.35, R * 1.12); x.lineTo(R * 0.35, R * 1.12); x.quadraticCurveTo(R * 1.4, R * 1.25, R * 1.5, R * 2.4); x.closePath(); x.fill();
  x.strokeStyle = ink; x.lineWidth = R * 0.03; x.stroke();
  // cloth shading + fold lines
  x.fillStyle = 'rgba(40,20,50,0.18)';
  x.beginPath(); x.moveTo(-R * 1.45, R * 2.4); x.quadraticCurveTo(-R * 1.3, R * 1.5, -R * 0.6, R * 1.3); x.quadraticCurveTo(-R * 0.9, R * 1.9, -R * 0.8, R * 2.4); x.closePath(); x.fill();
  x.strokeStyle = shade(c.outfit, -0.3); x.lineWidth = R * 0.018;
  for (const [a, b, cc, d] of [[-R * 0.8, R * 1.5, -R * 0.95, R * 2.2], [R * 0.75, R * 1.45, R * 0.9, R * 2.15], [-R * 0.3, R * 1.9, -R * 0.35, R * 2.35]]) { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo((a + cc) / 2 + R * 0.08, (b + d) / 2, cc, d); x.stroke(); }
  // neck
  x.fillStyle = shade(skin, -0.06);
  x.fillRect(-R * 0.22, R * 0.75, R * 0.44, R * 0.45);
  // collar
  if (c.collar === 'sailor') {
    x.fillStyle = c.collarColor || '#1a2a5a';
    x.beginPath(); x.moveTo(-R * 0.9, R * 1.2); x.lineTo(0, R * 1.85); x.lineTo(R * 0.9, R * 1.2); x.lineTo(R * 0.4, R * 1.12); x.lineTo(0, R * 1.5); x.lineTo(-R * 0.4, R * 1.12); x.closePath(); x.fill();
    x.fillStyle = c.accent || '#e8203a';
    x.beginPath(); x.moveTo(0, R * 1.55); x.lineTo(-R * 0.25, R * 1.85); x.lineTo(0, R * 1.75); x.lineTo(R * 0.25, R * 1.85); x.closePath(); x.fill();
  } else if (c.collar === 'hoodie') {
    x.strokeStyle = shade(c.outfit, -0.2); x.lineWidth = R * 0.08;
    x.beginPath(); x.arc(0, R * 1.05, R * 0.55, 0.1, Math.PI - 0.1); x.stroke();
    x.strokeStyle = '#eee'; x.lineWidth = R * 0.03;
    x.beginPath(); x.moveTo(-R * 0.2, R * 1.4); x.lineTo(-R * 0.22, R * 1.9); x.moveTo(R * 0.2, R * 1.4); x.lineTo(R * 0.22, R * 1.9); x.stroke();
  } else {
    x.fillStyle = shade(c.outfit, 0.15);
    x.beginPath(); x.moveTo(-R * 0.35, R * 1.12); x.lineTo(0, R * 1.6); x.lineTo(R * 0.35, R * 1.12); x.closePath(); x.fill();
  }

  // face
  x.fillStyle = skin;
  x.beginPath();
  x.moveTo(-R * 0.9, -R * 0.15);
  x.quadraticCurveTo(-R * 0.92, R * 0.55, -R * 0.35, R * 0.85);
  x.quadraticCurveTo(0, R * 1.02, R * 0.35, R * 0.85);
  x.quadraticCurveTo(R * 0.92, R * 0.55, R * 0.9, -R * 0.15);
  x.arc(0, -R * 0.15, R * 0.9, 0, Math.PI, true);
  x.closePath(); x.fill();
  x.strokeStyle = ink; x.lineWidth = R * 0.025; x.stroke();
  // shadow cast by the fringe and along the jaw
  x.fillStyle = 'rgba(200,110,120,0.12)';
  x.beginPath(); x.moveTo(-R * 0.88, -R * 0.2); x.quadraticCurveTo(0, R * 0.05, R * 0.88, -R * 0.2); x.lineTo(R * 0.88, -R * 0.35); x.quadraticCurveTo(0, -R * 0.2, -R * 0.88, -R * 0.35); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(R * 0.86, R * 0.1); x.quadraticCurveTo(R * 0.8, R * 0.6, R * 0.3, R * 0.88); x.quadraticCurveTo(R * 0.65, R * 0.5, R * 0.7, R * 0.1); x.closePath(); x.fill();
  // blush
  x.fillStyle = 'rgba(255,110,130,0.35)';
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * R * 0.5, R * 0.42, R * 0.17, R * 0.08, 0, 0, TAU); x.fill(); }

  // eyes
  for (const s of [-1, 1]) {
    const ex = s * R * 0.4, ey = R * 0.12;
    if (c.expression === 'wink' && s > 0) {
      x.strokeStyle = ink; x.lineWidth = R * 0.05;
      x.beginPath(); x.moveTo(ex - R * 0.2, ey); x.quadraticCurveTo(ex, ey + R * 0.1, ex + R * 0.2, ey); x.stroke();
      continue;
    }
    x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(ex, ey, R * 0.2, R * 0.25, 0, 0, TAU); x.fill();
    const ig = x.createLinearGradient(0, ey - R * 0.22, 0, ey + R * 0.22);
    ig.addColorStop(0, shade(c.eyes, -0.25)); ig.addColorStop(1, shade(c.eyes, 0.2));
    x.fillStyle = ig;
    x.beginPath(); x.ellipse(ex + s * R * 0.02, ey + R * 0.02, R * 0.15, R * 0.21, 0, 0, TAU); x.fill();
    x.fillStyle = shade(c.eyes, -0.45);
    x.beginPath(); x.ellipse(ex + s * R * 0.02, ey + R * 0.03, R * 0.07, R * 0.1, 0, 0, TAU); x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(ex - R * 0.05, ey - R * 0.08, R * 0.05, 0, TAU); x.fill();
    x.beginPath(); x.arc(ex + R * 0.06, ey + R * 0.1, R * 0.025, 0, TAU); x.fill();
    // upper lash line
    x.strokeStyle = ink; x.lineWidth = R * 0.06;
    x.beginPath(); x.moveTo(ex - R * 0.23, ey - R * 0.12); x.quadraticCurveTo(ex, ey - R * 0.32, ex + R * 0.23, ey - R * 0.14); x.stroke();
    x.lineWidth = R * 0.03;
    x.beginPath(); x.moveTo(ex + s * R * 0.22, ey - R * 0.14); x.lineTo(ex + s * R * 0.3, ey - R * 0.2); x.stroke();
    // brow
    x.lineWidth = R * 0.025;
    x.beginPath(); x.moveTo(ex - R * 0.17, ey - R * 0.42 + (c.expression === 'fierce' ? s * R * 0.06 : 0)); x.lineTo(ex + R * 0.17, ey - R * 0.44 - (c.expression === 'fierce' ? s * R * 0.06 : 0)); x.stroke();
  }
  // nose + mouth
  x.strokeStyle = shade(skin, -0.3); x.lineWidth = R * 0.02;
  x.beginPath(); x.moveTo(0, R * 0.35); x.lineTo(-R * 0.03, R * 0.42); x.stroke();
  x.strokeStyle = ink; x.lineWidth = R * 0.03;
  x.beginPath();
  if (c.expression === 'smile' || c.expression === 'wink') { x.moveTo(-R * 0.14, R * 0.58); x.quadraticCurveTo(0, R * 0.72, R * 0.14, R * 0.58); }
  else if (c.expression === 'fierce') { x.moveTo(-R * 0.12, R * 0.64); x.lineTo(R * 0.12, R * 0.6); }
  else { x.moveTo(-R * 0.07, R * 0.62); x.quadraticCurveTo(0, R * 0.66, R * 0.07, R * 0.62); }
  x.stroke();

  // front hair (bangs) built from tapered strands
  x.fillStyle = hair;
  x.beginPath();
  x.moveTo(-R * 1.02, R * 0.25);
  x.quadraticCurveTo(-R * 1.15, -R * 1.25, 0, -R * 1.2);
  x.quadraticCurveTo(R * 1.15, -R * 1.25, R * 1.02, R * 0.25);
  const strands = 7;
  for (let i = strands; i >= 0; i--) {
    const t = i / strands, sx = R * (1.0 - t * 2.0);
    const tip = (i % 2 ? 0.05 : -0.12) * R;
    x.lineTo(sx + R * 0.05, -R * 0.6 + tip + Math.abs(t - 0.5) * R * 0.4);
    x.lineTo(sx - R * 0.12, -R * 0.3 + (i % 2 ? R * 0.08 : 0) + Math.abs(t - 0.5) * R * 0.3);
  }
  x.closePath(); x.fill();
  x.strokeStyle = shade(hair, -0.35); x.lineWidth = R * 0.02; x.stroke();
  // shine
  x.strokeStyle = hairL; x.lineWidth = R * 0.06;
  x.beginPath(); x.arc(0, -R * 0.35, R * 0.75, Math.PI * 1.2, Math.PI * 1.45); x.stroke();
  x.beginPath(); x.arc(0, -R * 0.35, R * 0.75, Math.PI * 1.55, Math.PI * 1.75); x.stroke();

  // individual strand lines through the fringe
  x.strokeStyle = shade(hair, -0.4); x.lineWidth = R * 0.015;
  for (let i = 0; i < 9; i++) {
    const sx = -R * 0.85 + i * R * 0.21;
    x.beginPath(); x.moveTo(sx * 0.4, -R * 1.1); x.quadraticCurveTo(sx * 0.8, -R * 0.8, sx + R * 0.03, -R * 0.4 + Math.abs(sx) * 0.15); x.stroke();
  }
  // accessories
  if (c.acc === 'ears') {
    for (const s of [-1, 1]) {
      x.fillStyle = hair;
      x.beginPath(); x.moveTo(s * R * 0.35, -R * 1.05); x.lineTo(s * R * 0.85, -R * 1.65); x.lineTo(s * R * 0.95, -R * 0.75); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#ffb0c4';
      x.beginPath(); x.moveTo(s * R * 0.5, -R * 1.0); x.lineTo(s * R * 0.82, -R * 1.45); x.lineTo(s * R * 0.86, -R * 0.88); x.closePath(); x.fill();
    }
  } else if (c.acc === 'headphones') {
    x.strokeStyle = '#222'; x.lineWidth = R * 0.12;
    x.beginPath(); x.arc(0, -R * 0.2, R * 1.08, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
    for (const s of [-1, 1]) { x.fillStyle = c.accent || '#3ad0ff'; x.beginPath(); x.ellipse(s * R * 1.02, R * 0.05, R * 0.18, R * 0.3, 0, 0, TAU); x.fill(); x.strokeStyle = '#222'; x.lineWidth = R * 0.04; x.stroke(); }
  } else if (c.acc === 'ribbon') {
    x.fillStyle = c.accent || '#e8203a';
    x.save(); x.translate(R * 0.6, -R * 1.0); x.rotate(0.3);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(-R * 0.4, -R * 0.25); x.lineTo(-R * 0.4, R * 0.25); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(0, 0); x.lineTo(R * 0.4, -R * 0.25); x.lineTo(R * 0.4, R * 0.25); x.closePath(); x.fill();
    x.beginPath(); x.arc(0, 0, R * 0.09, 0, TAU); x.fill();
    x.restore();
  } else if (c.acc === 'horns') {
    x.fillStyle = '#2a2230';
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * R * 0.4, -R * 1.0); x.quadraticCurveTo(s * R * 0.9, -R * 1.5, s * R * 0.65, -R * 1.85); x.quadraticCurveTo(s * R * 0.7, -R * 1.35, s * R * 0.2, -R * 1.08); x.closePath(); x.fill(); }
  }
  x.restore();
}

// ---------------------------------------------------------------- finish types
export const ART_FINISHES = {
  anime: { metal: 0.15, rough: 0.35, draw(x, W, H, p, seed) {
    const r = rng(seed + 3);
    (BACKGROUNDS[p.bg] || bgSakura)(x, W, H, p, r);
    // portrait on the receiver area plus a smaller chibi echo near the muzzle
    drawCharacter(x, W * (p.at ?? 0.42), H * 0.42, H * 0.2, p);
    x.save(); x.globalAlpha = 0.9;
    drawCharacter(x, W * 0.8, H * 0.5, H * 0.1, { ...p, expression: 'smile' });
    x.restore();
    // name tag
    x.font = `italic 900 ${H * 0.09}px "Barlow Condensed", sans-serif`;
    x.fillStyle = p.tagColor || '#fff'; x.strokeStyle = '#2a1a22'; x.lineWidth = 6;
    x.strokeText(p.tag || '', W * 0.08, H * 0.88); x.fillText(p.tag || '', W * 0.08, H * 0.88);
  } },

  landscape: { metal: 0.1, rough: 0.5, draw(x, W, H, p, seed) {
    const r = rng(seed + 5);
    const sky = x.createLinearGradient(0, 0, 0, H);
    p.sky.forEach((c, i) => sky.addColorStop(i / (p.sky.length - 1), c));
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    // sun / moon
    x.fillStyle = p.sun; x.beginPath(); x.arc(W * (0.55 + (seed % 20) / 100), H * 0.35, H * 0.14, 0, TAU); x.fill();
    if (p.stars) for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(255,255,255,${r()})`; x.fillRect(r() * W, r() * H * 0.5, 1.5, 1.5); }
    // layered ridges
    p.layers.forEach((col, li) => {
      x.fillStyle = col;
      const base = H * (0.45 + li * 0.13), amp = H * (0.18 - li * 0.03);
      x.beginPath(); x.moveTo(0, H);
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const y = base - Math.abs(Math.sin(t * (4 + li * 2) + li * 1.7 + seed * 0.01)) * amp - r() * amp * 0.15;
        x.lineTo(t * W, y);
      }
      x.lineTo(W, H); x.closePath(); x.fill();
    });
    // birds or trees
    x.strokeStyle = p.layers.at(-1); x.lineWidth = 3;
    for (let i = 0; i < 7; i++) { const bx = W * (0.2 + r() * 0.5), by = H * (0.15 + r() * 0.2); x.beginPath(); x.moveTo(bx - 10, by); x.quadraticCurveTo(bx - 5, by - 6, bx, by); x.quadraticCurveTo(bx + 5, by - 6, bx + 10, by); x.stroke(); }
  } },

  koi: { metal: 0.25, rough: 0.3, draw(x, W, H, p, seed) {
    const r = rng(seed + 9);
    const g = x.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, p.water1 || '#1a6a7a'); g.addColorStop(1, p.water2 || '#082a3a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // ripples
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const cx = r() * W, cy = r() * H; for (let k = 1; k < 4; k++) { x.beginPath(); x.ellipse(cx, cy, k * 18, k * 9, 0, 0, TAU); x.stroke(); } }
    // fish
    for (let i = 0; i < 6; i++) {
      x.save(); x.translate(W * (0.1 + i * 0.16), H * (0.3 + r() * 0.4)); x.rotate((r() - 0.5) * 1.2); x.scale(1.4, 1.4);
      x.fillStyle = '#fff4ea';
      x.beginPath(); x.moveTo(-60, 0); x.bezierCurveTo(-30, -26, 30, -22, 50, 0); x.bezierCurveTo(30, 22, -30, 26, -60, 0); x.fill();
      x.beginPath(); x.moveTo(-55, 0); x.lineTo(-90, -22); x.quadraticCurveTo(-80, 0, -90, 22); x.closePath(); x.fill();
      x.fillStyle = p.spot || '#e8452a';
      for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(-30 + k * 20 + r() * 8, (r() - 0.5) * 12, 9 + r() * 8, 6 + r() * 6, r(), 0, TAU); x.fill(); }
      x.fillStyle = '#111'; x.beginPath(); x.arc(38, -5, 3, 0, TAU); x.fill();
      x.restore();
    }
    // lily pads
    for (let i = 0; i < 6; i++) { x.fillStyle = '#2f7a3a'; x.beginPath(); const lx = r() * W, ly = r() * H; x.arc(lx, ly, 26 + r() * 20, 0.3, TAU); x.lineTo(lx, ly); x.fill(); }
  } },

  wildstyle: { metal: 0.05, rough: 0.7, draw(x, W, H, p, seed) {
    const r = rng(seed + 21);
    // brick wall base
    x.fillStyle = p.wall || '#7a4a3a'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < H; y += 26) for (let xx = (y / 26) % 2 ? -30 : 0; xx < W; xx += 60) x.fillRect(xx, y, 58, 2), x.fillRect(xx, y, 2, 26);
    // fade backdrop cloud
    x.fillStyle = p.cloud || '#3ad0ff';
    for (let i = 0; i < 18; i++) { x.beginPath(); x.arc(W * 0.1 + r() * W * 0.8, H * 0.35 + r() * H * 0.3, 40 + r() * 60, 0, TAU); x.fill(); }
    // bubble letters with outline, highlight and drips
    const word = p.word || 'VANTAGE';
    x.font = `900 ${H * 0.44}px "Barlow Condensed", Impact, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const step = W * 0.82 / word.length;
    [...word].forEach((ch, i) => {
      const lx = W * 0.09 + step * (i + 0.5), ly = H * 0.5 + Math.sin(i * 1.3) * H * 0.05;
      x.save(); x.translate(lx, ly); x.rotate((r() - 0.5) * 0.3);
      x.lineWidth = 26; x.strokeStyle = '#111'; x.strokeText(ch, 6, 8);
      x.lineWidth = 16; x.strokeStyle = '#fff'; x.strokeText(ch, 0, 0);
      const g = x.createLinearGradient(0, -H * 0.2, 0, H * 0.2);
      g.addColorStop(0, p.c1 || '#ffe23a'); g.addColorStop(1, p.c2 || '#ff3a6a');
      x.fillStyle = g; x.fillText(ch, 0, 0);
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(-step * 0.25, -H * 0.12, step * 0.12, H * 0.05);
      x.restore();
      // drips
      x.fillStyle = p.c2 || '#ff3a6a';
      if (r() < 0.6) { const dx = lx + (r() - 0.5) * step * 0.6, dl = 20 + r() * 70; x.fillRect(dx, ly + H * 0.12, 6, dl); x.beginPath(); x.arc(dx + 3, ly + H * 0.12 + dl, 5, 0, TAU); x.fill(); }
    });
    // stars and arrows
    x.fillStyle = '#fff';
    for (let i = 0; i < 10; i++) { x.save(); x.translate(r() * W, r() * H); x.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? 4 : 14, a = k * Math.PI / 4; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.fill(); x.restore(); }
  } },

  comic: { metal: 0.05, rough: 0.55, draw(x, W, H, p, seed) {
    const r = rng(seed + 31);
    x.fillStyle = p.bg || '#ffe14a'; x.fillRect(0, 0, W, H);
    // halftone
    x.fillStyle = p.dots || '#ff4a3a';
    for (let y = 0; y < H; y += 14) for (let xx = (y / 14) % 2 * 7; xx < W; xx += 14) { const s = 1 + 4 * (xx / W); x.beginPath(); x.arc(xx, y, s, 0, TAU); x.fill(); }
    // panels
    x.strokeStyle = '#111'; x.lineWidth = 10;
    const cuts = [0, W * 0.3, W * 0.62, W];
    for (let i = 0; i < 3; i++) {
      x.save(); x.beginPath(); x.rect(cuts[i] + 10, 10, cuts[i + 1] - cuts[i] - 20, H - 20); x.clip();
      x.fillStyle = ['#3ab0ff', '#ffffff', '#ff6aa8'][i]; x.globalAlpha = 0.85; x.fillRect(cuts[i], 0, cuts[i + 1] - cuts[i], H); x.globalAlpha = 1;
      if (i === 1) drawCharacter(x, (cuts[1] + cuts[2]) / 2, H * 0.45, H * 0.2, { hair: '#2a2a3a', eyes: '#3a7aff', outfit: '#e8203a', collar: 'jacket', expression: 'fierce', style: 'bob' });
      x.restore();
      x.strokeRect(cuts[i] + 10, 10, cuts[i + 1] - cuts[i] - 20, H - 20);
    }
    // burst
    const words = p.words || ['BLAM!', 'KRAK!'];
    words.forEach((w, i) => {
      const bx = i ? W * 0.82 : W * 0.15, by = H * 0.45;
      x.fillStyle = '#fff'; x.strokeStyle = '#111'; x.lineWidth = 6;
      x.beginPath();
      for (let k = 0; k < 24; k++) { const rr = k % 2 ? 70 : 120 + r() * 30, a = k / 24 * TAU; x.lineTo(bx + Math.cos(a) * rr * 1.2, by + Math.sin(a) * rr * 0.8); }
      x.closePath(); x.fill(); x.stroke();
      x.font = `italic 900 ${H * 0.16}px "Barlow Condensed", Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 8; x.strokeText(w, bx, by); x.fillStyle = i ? '#3ab0ff' : '#ff3a3a'; x.fillText(w, bx, by);
    });
  } },

  tattoo: { metal: 0.1, rough: 0.5, draw(x, W, H, p, seed) {
    const r = rng(seed + 41);
    x.fillStyle = p.bg || '#efe3c8'; x.fillRect(0, 0, W, H);
    const ink = '#161210', red = p.red || '#c4202a', green = p.green || '#2a7a4a';
    x.lineWidth = 6; x.strokeStyle = ink; x.lineJoin = 'round';
    // rose
    const rose = (cx, cy, s) => {
      x.fillStyle = green;
      for (const a of [2.4, 0.7]) { x.beginPath(); x.ellipse(cx + Math.cos(a) * s * 1.2, cy + Math.sin(a) * s * 1.2, s * 0.6, s * 0.28, a, 0, TAU); x.fill(); x.stroke(); }
      x.fillStyle = red; x.beginPath(); x.arc(cx, cy, s, 0, TAU); x.fill(); x.stroke();
      x.lineWidth = 4;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(cx + (k - 1) * s * 0.15, cy - s * 0.1 + k * s * 0.15, s * (0.7 - k * 0.2), Math.PI * (1.1 + k * 0.2), Math.PI * (1.9 + k * 0.15)); x.stroke(); }
      x.lineWidth = 6;
    };
    // dagger
    const dagger = (cx, cy, s) => {
      x.save(); x.translate(cx, cy); x.rotate(-0.3);
      x.fillStyle = '#cfd4da'; x.beginPath(); x.moveTo(0, -s * 2); x.lineTo(s * 0.25, -s * 0.3); x.lineTo(-s * 0.25, -s * 0.3); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#d4a23a'; x.fillRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.2); x.strokeRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.2);
      x.fillStyle = '#3a2418'; x.fillRect(-s * 0.13, -s * 0.15, s * 0.26, s * 0.8); x.strokeRect(-s * 0.13, -s * 0.15, s * 0.26, s * 0.8);
      x.restore();
    };
    // swallow
    const bird = (cx, cy, s, flip) => {
      x.save(); x.translate(cx, cy); x.scale(flip ? -s : s, s);
      x.fillStyle = '#1a3a8a';
      x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(40, -40, 90, -30); x.quadraticCurveTo(50, -10, 30, 10); x.lineTo(60, 40); x.lineTo(20, 25); x.lineTo(-10, 40); x.quadraticCurveTo(-30, 10, 0, 0); x.fill(); x.stroke();
      x.fillStyle = red; x.beginPath(); x.arc(-8, 14, 9, 0, TAU); x.fill();
      x.restore();
    };
    rose(W * 0.25, H * 0.55, H * 0.16);
    dagger(W * 0.52, H * 0.62, H * 0.15);
    bird(W * 0.75, H * 0.35, 1.2, false);
    bird(W * 0.12, H * 0.25, 0.8, true);
    // banner
    x.fillStyle = '#f5ecd5'; x.beginPath(); x.moveTo(W * 0.35, H * 0.82); x.lineTo(W * 0.7, H * 0.82); x.lineTo(W * 0.73, H * 0.9); x.lineTo(W * 0.7, H * 0.95); x.lineTo(W * 0.35, H * 0.95); x.lineTo(W * 0.32, H * 0.9); x.closePath(); x.fill(); x.stroke();
    x.font = `700 ${H * 0.08}px Georgia, serif`; x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(p.motto || 'NO RETREAT', W * 0.525, H * 0.885);
    for (let i = 0; i < 30; i++) { x.fillStyle = ink; x.beginPath(); x.arc(r() * W, r() * H, 2, 0, TAU); x.fill(); }
  } },

  mecha: { metal: 0.45, rough: 0.35, draw(x, W, H, p, seed) {
    const r = rng(seed + 51);
    x.fillStyle = p.base || '#e8e6e0'; x.fillRect(0, 0, W, H);
    // panel lines
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2;
    for (let i = 0; i < 30; i++) { const px = r() * W, py = r() * H; x.strokeRect(px, py, 40 + r() * 160, 20 + r() * 90); }
    // colour blocks
    x.fillStyle = p.c1 || '#2a5ac8'; x.beginPath(); x.moveTo(0, H * 0.6); x.lineTo(W * 0.45, H * 0.6); x.lineTo(W * 0.52, H); x.lineTo(0, H); x.fill();
    x.fillStyle = p.c2 || '#e8203a'; x.beginPath(); x.moveTo(W * 0.55, 0); x.lineTo(W, 0); x.lineTo(W, H * 0.3); x.lineTo(W * 0.62, H * 0.3); x.fill();
    // hazard stripes
    x.save(); x.beginPath(); x.rect(W * 0.6, H * 0.72, W * 0.35, H * 0.12); x.clip();
    for (let i = -10; i < 40; i++) { x.fillStyle = i % 2 ? '#111' : '#ffcc1a'; x.beginPath(); x.moveTo(W * 0.6 + i * 24, H * 0.72); x.lineTo(W * 0.6 + i * 24 + 24, H * 0.72); x.lineTo(W * 0.6 + i * 24 - 12, H * 0.84); x.lineTo(W * 0.6 + i * 24 - 36, H * 0.84); x.fill(); }
    x.restore();
    // labels
    x.fillStyle = '#111'; x.font = `700 ${H * 0.05}px monospace`;
    x.fillText(`UNIT-${String(seed % 1000).padStart(3, '0')}`, W * 0.05, H * 0.1);
    x.fillText('CAUTION // HIGH VOLTAGE', W * 0.58, H * 0.68);
    x.font = `900 ${H * 0.22}px "Barlow Condensed", sans-serif`; x.fillStyle = p.c2 || '#e8203a';
    x.fillText(p.code || '07', W * 0.32, H * 0.42);
    for (let i = 0; i < 40; i++) { x.fillStyle = '#555'; x.beginPath(); x.arc(r() * W, r() * H, 3, 0, TAU); x.fill(); }
  } },

  stickerbomb: { metal: 0.05, rough: 0.5, draw(x, W, H, p, seed) {
    const r = rng(seed + 61);
    x.fillStyle = p.base || '#1a1a1a'; x.fillRect(0, 0, W, H);
    const pool = Object.values(STICKERS).filter(s => s.finishType === 'paper' || s.finishType === 'holo');
    for (let i = 0; i < 70; i++) {
      const s = pool[Math.floor(r() * pool.length)];
      const size = 70 + r() * 90;
      x.save(); x.translate(r() * W, r() * H); x.rotate((r() - 0.5) * 1.2);
      x.drawImage(stickerCanvas(s), -size / 2, -size / 2, size, size);
      x.restore();
    }
  } },
};
