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

function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((A >> sh) & 255) * (1 - t) + ((B >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function hexA(h, a) {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
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
    const r = rng(seed + 3), u = H / 512;
    (BACKGROUNDS[p.bg] || bgSakura)(x, W, H, p, r);
    const cx = W * (p.at ?? 0.42), cy = H * 0.4, R = H * 0.235;
    const acc = p.accent || p.tagColor || '#ffffff';
    // card layout: two slanted bands across, a big disc behind the head
    // filled with screen-tone dots, then the portrait, sparkles in front
    x.save();
    x.globalAlpha = 0.55; x.fillStyle = shade(p.hair, -0.1);
    x.beginPath(); x.moveTo(cx - W * 0.32, 0); x.lineTo(cx - W * 0.18, 0); x.lineTo(cx + W * 0.02, H); x.lineTo(cx - W * 0.12, H); x.closePath(); x.fill();
    x.globalAlpha = 0.4; x.fillStyle = acc;
    x.beginPath(); x.moveTo(cx + W * 0.2, 0); x.lineTo(cx + W * 0.24, 0); x.lineTo(cx + W * 0.4, H); x.lineTo(cx + W * 0.36, H); x.closePath(); x.fill();
    x.restore();
    const dr = H * 0.44;
    const glow = x.createRadialGradient(cx, cy, dr * 0.2, cx, cy, dr);
    glow.addColorStop(0, 'rgba(255,255,255,0.75)'); glow.addColorStop(0.7, 'rgba(255,255,255,0.25)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    x.ctx.fillStyle = glow; x.ctx.fillRect(cx - dr, cy - dr, dr * 2, dr * 2);
    x.ctx.fillStyle = shade(acc, -0.15);
    for (let yy = cy - dr; yy < cy + dr; yy += 11 * u) for (let xx = cx - dr + ((yy / (11 * u)) & 1) * 5.5 * u; xx < cx + dr; xx += 11 * u) {
      const d = Math.hypot(xx - cx, yy - cy) / dr;
      if (d > 1 || d < 0.55) continue;
      x.ctx.globalAlpha = 0.5; x.ctx.beginPath(); x.ctx.arc(xx, yy, 2.6 * u * (d - 0.55) / 0.45, 0, TAU); x.ctx.fill();
    }
    x.ctx.globalAlpha = 1;
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3 * u;
    x.beginPath(); x.arc(cx, cy, dr * 0.98, 0, TAU); x.stroke();
    drawCharacter(x, cx, cy, R, p);
    // sparkles
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) {
      const sx = r() * W, sy = r() * H, ss = (6 + r() * 12) * u;
      if (Math.abs(sx - cx) < R * 1.6) continue;
      x.beginPath(); x.moveTo(sx, sy - ss); x.quadraticCurveTo(sx, sy, sx + ss * 0.35, sy); x.quadraticCurveTo(sx, sy, sx, sy + ss);
      x.quadraticCurveTo(sx, sy, sx - ss * 0.35, sy); x.quadraticCurveTo(sx, sy, sx, sy - ss); x.fill();
    }
    // name plate: a dark slanted label with the name and a stripe in the accent colour
    const tx = W * 0.06, ty = H * 0.8;
    x.fillStyle = 'rgba(30,18,28,0.85)';
    x.beginPath(); x.moveTo(tx, ty - H * 0.075); x.lineTo(tx + W * 0.2, ty - H * 0.075); x.lineTo(tx + W * 0.185, ty + H * 0.05); x.lineTo(tx - W * 0.015, ty + H * 0.05); x.closePath(); x.fill();
    x.fillStyle = acc; x.fillRect(tx - W * 0.015, ty + H * 0.06, W * 0.2, H * 0.012);
    x.font = `italic 900 ${H * 0.085}px "Barlow Condensed", sans-serif`;
    x.fillStyle = p.tagColor || '#fff'; x.fillText(p.tag || '', tx + W * 0.012, ty + H * 0.025);
    x.font = `700 ${H * 0.03}px monospace`; x.fillStyle = 'rgba(255,255,255,0.8)';
    x.fillText(`No.${String(seed % 100).padStart(2, '0')}`, tx + W * 0.13, ty + H * 0.03);
  } },

  landscape: { metal: 0.1, rough: 0.5, draw(x, W, H, p, seed) {
    const r = rng(seed + 5), u = H / 512;
    const sky = x.createLinearGradient(0, 0, 0, H * 0.72);
    p.sky.forEach((c, i) => sky.addColorStop(i / (p.sky.length - 1), c));
    x.ctx.fillStyle = sky; x.ctx.fillRect(0, 0, W, H);
    if (p.stars) for (let i = 0; i < 260; i++) { x.ctx.fillStyle = `rgba(255,255,255,${r() * 0.9})`; x.ctx.fillRect(r() * W, r() * H * 0.55, 1.6 * u, 1.6 * u); }
    // sun or moon with a glow
    const sx = W * (0.55 + (seed % 20) / 100), sy = H * 0.3, sr = H * 0.11;
    const g = x.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 4);
    g.addColorStop(0, p.sun + 'aa'); g.addColorStop(1, p.sun + '00');
    x.ctx.fillStyle = g; x.ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
    x.fillStyle = p.sun; x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fill();
    // cloud bands
    for (let i = 0; i < 6; i++) {
      x.ctx.globalAlpha = 0.18 + r() * 0.2; x.ctx.fillStyle = i % 2 ? p.sky[0] : p.sky[p.sky.length - 1];
      x.ctx.beginPath(); x.ctx.ellipse(r() * W, H * (0.12 + r() * 0.3), W * (0.12 + r() * 0.2), H * (0.012 + r() * 0.02), 0, 0, TAU); x.ctx.fill();
    }
    x.ctx.globalAlpha = 1;
    // ridges: more layers than colours (interpolated), each with haze at its foot
    const water = H * 0.74;
    const L = p.layers, n = L.length + 2;
    const col = (t) => { const f = t * (L.length - 1), i = Math.min(L.length - 2, Math.floor(f)); return mixHex(L[i], L[i + 1], f - i); };
    for (let li = 0; li < n; li++) {
      const t = li / (n - 1), base = water - H * (0.3 - t * 0.27), amp = H * (0.2 - t * 0.12);
      const pts = []; let h = r();
      for (let i = 0; i <= 80; i++) { h += (r() - 0.5) * 0.35; h = Math.max(0, Math.min(1, h)); pts.push(h); }
      for (let k = 0; k < 3; k++) for (let i = 1; i < pts.length - 1; i++) pts[i] = (pts[i - 1] + pts[i] * 2 + pts[i + 1]) / 4;
      x.fillStyle = col(t);
      x.beginPath(); x.moveTo(0, water + 2);
      pts.forEach((v, i) => x.lineTo(i / 80 * W, base - v * amp - Math.abs(Math.sin(i * 0.21 + li)) * amp * 0.35));
      x.lineTo(W, water + 2); x.closePath(); x.fill();
      const haze = x.createLinearGradient(0, base - amp * 0.2, 0, water);
      haze.addColorStop(0, 'rgba(255,255,255,0)'); haze.addColorStop(1, hexA(p.sky[p.sky.length - 1], 0.35 * (1 - t)));
      x.ctx.fillStyle = haze; x.ctx.fillRect(0, base - amp * 0.2, W, water - base + amp * 0.2);
    }
    // lake: the scene above mirrored and darkened, with ripples
    const src = x.canvas;
    x.ctx.save(); x.ctx.translate(0, water * 2); x.ctx.scale(1, -1); x.ctx.globalAlpha = 0.55;
    x.ctx.drawImage(src, 0, water - (H - water), W, H - water, 0, water - (H - water), W, H - water);
    x.ctx.restore();
    x.ctx.fillStyle = hexA(L[L.length - 1], 0.45); x.ctx.fillRect(0, water, W, H - water);
    x.ctx.strokeStyle = hexA(p.sun, 0.35); x.ctx.lineWidth = 1.5 * u;
    for (let i = 0; i < 40; i++) { const yy = water + 4 * u + r() * (H - water), ww = W * (0.02 + r() * 0.08), xx = r() * W; x.ctx.beginPath(); x.ctx.moveTo(xx, yy); x.ctx.lineTo(xx + ww, yy); x.ctx.stroke(); }
    // pines on the near shore
    x.fillStyle = L[L.length - 1];
    const side = seed % 2 ? 0.04 : 0.72;
    for (let i = 0; i < 7; i++) {
      const px = W * (side + r() * 0.22), ph = H * (0.12 + r() * 0.16), pw = ph * 0.32, py = water + 3 * u;
      x.beginPath(); x.moveTo(px, py - ph);
      for (let k = 1; k <= 4; k++) { x.lineTo(px + pw * k / 4, py - ph + ph * k / 4.3); x.lineTo(px + pw * (k - 0.6) / 4, py - ph + ph * k / 4.3); }
      x.lineTo(px + pw * 0.08, py); x.lineTo(px - pw * 0.08, py);
      for (let k = 4; k >= 1; k--) { x.lineTo(px - pw * (k - 0.6) / 4, py - ph + ph * k / 4.3); x.lineTo(px - pw * k / 4, py - ph + ph * k / 4.3); }
      x.closePath(); x.fill();
    }
    x.strokeStyle = L[L.length - 1]; x.lineWidth = 2.5 * u;
    for (let i = 0; i < 6; i++) { const bx = W * (0.2 + r() * 0.5), by = H * (0.12 + r() * 0.18), bs = 9 * u; x.beginPath(); x.moveTo(bx - bs, by); x.quadraticCurveTo(bx - bs / 2, by - bs * 0.6, bx, by); x.quadraticCurveTo(bx + bs / 2, by - bs * 0.6, bx + bs, by); x.stroke(); }
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
    const r = rng(seed + 31), u = H / 512;
    const bg = p.bg || '#ffe14a', dots = p.dots || '#ff4a3a';
    x.ctx.fillStyle = '#fbf6e8'; x.ctx.fillRect(0, 0, W, H);
    const gut = 10 * u, cuts = [0, W * 0.3, W * 0.62, W];
    const words = p.words || ['BLAM!', 'KRAK!'];
    const burst = (bx, by, rx, ry, word, fill, txt) => {
      x.fillStyle = fill; x.strokeStyle = '#111'; x.lineWidth = 6 * u;
      x.beginPath();
      for (let k = 0; k < 26; k++) { const rr = k % 2 ? 0.62 : 1 + r() * 0.25, a = k / 26 * TAU; x.lineTo(bx + Math.cos(a) * rx * rr, by + Math.sin(a) * ry * rr); }
      x.closePath(); x.fill(); x.stroke();
      x.font = `italic 900 ${ry * 0.62}px "Barlow Condensed", Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 9 * u; x.strokeText(word, bx, by); x.fillStyle = txt; x.fillText(word, bx, by);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    };
    const speed = (cx, cy, col, n) => {
      x.ctx.strokeStyle = col;
      for (let i = 0; i < n; i++) { const a = r() * TAU, r0 = H * (0.18 + r() * 0.1); x.ctx.lineWidth = (1 + r() * 4) * u; x.ctx.beginPath(); x.ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W); x.ctx.stroke(); }
    };
    const tone = (x0, y0, w, h, col, dir) => {
      x.ctx.fillStyle = col;
      const st = 12 * u;
      for (let yy = y0; yy < y0 + h; yy += st) for (let xx = x0 + ((yy / st) & 1) * st / 2; xx < x0 + w; xx += st) {
        const t = dir ? (xx - x0) / w : (yy - y0) / h;
        x.ctx.beginPath(); x.ctx.arc(xx, yy, st * 0.42 * t, 0, TAU); x.ctx.fill();
      }
    };
    for (let i = 0; i < 3; i++) {
      const px = cuts[i] + gut, pw = cuts[i + 1] - cuts[i] - gut * 2, py = gut, ph = H - gut * 2;
      x.ctx.save(); x.ctx.beginPath(); x.ctx.rect(px, py, pw, ph); x.ctx.clip();
      if (i === 0) { x.ctx.fillStyle = bg; x.ctx.fillRect(px, py, pw, ph); speed(px + pw * 0.5, py + ph * 0.5, 'rgba(255,255,255,0.75)', 70); tone(px, py, pw, ph, dots, 1); }
      else if (i === 1) {
        x.ctx.fillStyle = '#ffffff'; x.ctx.fillRect(px, py, pw, ph); tone(px, py + ph * 0.55, pw, ph * 0.45, 'rgba(60,90,160,0.55)', 0);
        drawCharacter(x, px + pw / 2, H * 0.46, H * 0.21, { hair: p.hair || '#2a2a3a', eyes: '#3a7aff', outfit: p.outfit || '#e8203a', collar: 'jacket', expression: 'fierce', style: 'bob' });
        // motion lines beside the figure
        x.ctx.strokeStyle = '#111'; x.ctx.lineWidth = 3 * u;
        for (let k = 0; k < 5; k++) { const yy = H * (0.3 + k * 0.08); x.ctx.beginPath(); x.ctx.moveTo(px + 12 * u, yy); x.ctx.lineTo(px + pw * 0.14, yy); x.ctx.stroke(); }
      } else { x.ctx.fillStyle = shade(dots, 0.25); x.ctx.fillRect(px, py, pw, ph); speed(px + pw * 0.5, py + ph * 0.5, 'rgba(255,255,255,0.6)', 60); tone(px, py, pw, ph, shade(dots, -0.15), 0); }
      x.ctx.restore();
      x.strokeStyle = '#111'; x.lineWidth = 7 * u; x.strokeRect(px, py, pw, ph);
    }
    burst(W * 0.15, H * 0.5, H * 0.3, H * 0.24, words[0], '#ffffff', '#ff2a2a');
    burst(W * 0.81, H * 0.48, H * 0.32, H * 0.25, words[1] || words[0], '#fff35a', '#1a6aff');
    // caption box over the middle panel
    const cx0 = cuts[1] + gut * 2.2, cy0 = gut * 2.2;
    x.fillStyle = '#ffe85a'; x.strokeStyle = '#111'; x.lineWidth = 4 * u;
    x.beginPath(); x.rect(cx0, cy0, W * 0.15, H * 0.1); x.fill(); x.stroke();
    x.font = `italic 800 ${H * 0.045}px "Barlow Condensed", sans-serif`; x.fillStyle = '#111';
    x.fillText(['MEANWHILE...', 'SUDDENLY...', 'LATER...'][seed % 3], cx0 + W * 0.012, cy0 + H * 0.068);
  } },

  tattoo: { metal: 0.1, rough: 0.5, draw(x, W, H, p, seed) {
    const r = rng(seed + 41), u = H / 512;
    x.ctx.fillStyle = p.bg || '#efe3c8'; x.ctx.fillRect(0, 0, W, H);
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,60,20,0.25)');
    x.ctx.fillStyle = vg; x.ctx.fillRect(0, 0, W, H);
    const ink = '#161210', red = p.red || '#c4202a', green = p.green || '#2a7a4a', yellow = p.yellow || '#e8b42a', blue = p.blue || '#1e4a9a';
    x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = ink;
    // whip shading: black stippled gradient along one side of a shape
    const whip = (path, x0, y0, x1, y1) => {
      x.ctx.save(); x.beginPath(); path(); x.clip();
      const g = x.ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(10,8,6,0.55)'); g.addColorStop(1, 'rgba(10,8,6,0)');
      x.ctx.fillStyle = g; x.ctx.fillRect(0, 0, W, H); x.ctx.restore();
    };
    const shape = (path, fill, lw, sh) => {
      x.fillStyle = fill; x.beginPath(); path(); x.fill();
      if (sh) whip(path, ...sh);
      x.lineWidth = lw * u; x.beginPath(); path(); x.stroke();
    };
    // rose
    const rose = (cx, cy, s) => {
      for (const a of [2.5, 0.6, 4.0]) shape(() => x.ellipse(cx + Math.cos(a) * s * 1.25, cy + Math.sin(a) * s * 1.25, s * 0.7, s * 0.3, a, 0, TAU), green, 5, [cx, cy, cx + Math.cos(a) * s * 2, cy + Math.sin(a) * s * 2]);
      shape(() => x.arc(cx, cy, s, 0, TAU), red, 6, [cx + s, cy + s, cx - s * 0.2, cy - s * 0.2]);
      x.lineWidth = 4 * u;
      for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(cx + (k - 1.5) * s * 0.1, cy - s * 0.12 + k * s * 0.12, s * (0.78 - k * 0.17), Math.PI * (1.05 + k * 0.18), Math.PI * (1.95 + k * 0.12)); x.stroke(); }
    };
    // heart pierced by a dagger, wrapped in the motto banner
    const heart = (cx, cy, s) => {
      const path = () => { x.moveTo(cx, cy + s * 0.9); x.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.8, cy - s * 1.3, cx, cy - s * 0.55); x.bezierCurveTo(cx + s * 0.8, cy - s * 1.3, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9); x.closePath(); };
      // blade behind, hilt in front
      x.save(); x.translate(cx, cy); x.rotate(-0.55);
      shape(() => { x.moveTo(-s * 0.16, -s * 0.1); x.lineTo(s * 0.16, -s * 0.1); x.lineTo(0, s * 1.9); x.closePath(); }, '#d4d9de', 5, null);
      x.restore();
      shape(path, red, 7, [cx + s, cy + s * 0.6, cx - s * 0.4, cy - s * 0.4]);
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx - s * 0.5, cy - s * 0.45, s * 0.14, s * 0.08, -0.6, 0, TAU); x.fill();
      x.save(); x.translate(cx, cy); x.rotate(-0.55);
      shape(() => x.rect(-s * 0.55, -s * 0.28, s * 1.1, s * 0.16), yellow, 5, null);
      shape(() => x.rect(-s * 0.12, -s * 0.95, s * 0.24, s * 0.68), '#4a2a1a', 5, null);
      shape(() => x.arc(0, -s * 1.02, s * 0.14, 0, TAU), yellow, 5, null);
      x.restore();
      // banner
      const by = cy + s * 0.15, bw = s * 2.4;
      shape(() => { x.moveTo(cx - bw / 2, by - s * 0.2); x.quadraticCurveTo(cx, by - s * 0.42, cx + bw / 2, by - s * 0.2); x.lineTo(cx + bw / 2, by + s * 0.14); x.quadraticCurveTo(cx, by - s * 0.08, cx - bw / 2, by + s * 0.14); x.closePath(); }, '#f6eedb', 5, null);
      for (const sg of [-1, 1]) shape(() => { const ex = cx + sg * bw / 2; x.moveTo(ex, by - s * 0.14); x.lineTo(ex + sg * s * 0.45, by - s * 0.1); x.lineTo(ex + sg * s * 0.3, by + s * 0.03); x.lineTo(ex + sg * s * 0.45, by + s * 0.2); x.lineTo(ex, by + s * 0.12); x.closePath(); }, '#e8dcc0', 5, null);
      x.font = `700 ${s * 0.24}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ink;
      x.fillText(p.motto || 'NO RETREAT', cx, by - s * 0.06);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    };
    // anchor with a rope
    const anchor = (cx, cy, s) => {
      x.lineWidth = 7 * u; x.strokeStyle = ink;
      shape(() => x.rect(cx - s * 0.1, cy - s * 1.1, s * 0.2, s * 1.9), blue, 6, [cx + s * 0.1, cy, cx - s * 0.1, cy]);
      shape(() => x.rect(cx - s * 0.6, cy - s * 0.85, s * 1.2, s * 0.16), blue, 6, null);
      shape(() => { x.arc(cx, cy - s * 1.25, s * 0.2, 0, TAU); }, yellow, 6, null);
      shape(() => { x.moveTo(cx - s * 0.9, cy + s * 0.15); x.quadraticCurveTo(cx - s * 0.8, cy + s * 0.95, cx, cy + s * 0.95); x.quadraticCurveTo(cx + s * 0.8, cy + s * 0.95, cx + s * 0.9, cy + s * 0.15); x.lineTo(cx + s * 1.05, cy + s * 0.4); x.lineTo(cx + s * 0.72, cy + s * 0.28); x.quadraticCurveTo(cx + s * 0.6, cy + s * 0.75, cx, cy + s * 0.75); x.quadraticCurveTo(cx - s * 0.6, cy + s * 0.75, cx - s * 0.72, cy + s * 0.28); x.lineTo(cx - s * 1.05, cy + s * 0.4); x.closePath(); }, blue, 6, [cx, cy + s, cx, cy + s * 0.3]);
      x.strokeStyle = '#a8742a'; x.lineWidth = 5 * u;
      x.beginPath(); x.moveTo(cx - s * 0.2, cy - s * 1.3);
      for (let k = 0; k <= 10; k++) x.lineTo(cx + Math.sin(k * 1.4) * s * 0.35, cy - s * 1.1 + k * s * 0.19);
      x.stroke(); x.strokeStyle = ink;
    };
    // swallow
    const bird = (cx, cy, s, flip) => {
      x.save(); x.translate(cx, cy); x.scale(flip ? -s : s, s);
      shape(() => { x.moveTo(0, 0); x.quadraticCurveTo(40, -40, 90, -30); x.quadraticCurveTo(50, -10, 30, 10); x.lineTo(60, 40); x.lineTo(20, 25); x.lineTo(-10, 40); x.quadraticCurveTo(-30, 10, 0, 0); x.closePath(); }, blue, 5 / s, [60, -30, 20, 0]);
      x.fillStyle = red; x.beginPath(); x.arc(-8, 14, 9, 0, TAU); x.fill();
      x.restore();
    };
    const star = (cx, cy, s) => shape(() => { for (let k = 0; k < 10; k++) { const rr = k % 2 ? s * 0.42 : s, a = -Math.PI / 2 + k * Math.PI / 5; k ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); }, yellow, 4, null);
    rose(W * 0.14, H * 0.58, H * 0.17);
    heart(W * 0.45, H * 0.5, H * 0.24);
    anchor(W * 0.76, H * 0.52, H * 0.24);
    bird(W * 0.3, H * 0.18, 0.95 * u, true);
    bird(W * 0.6, H * 0.16, 0.85 * u, false);
    bird(W * 0.92, H * 0.24, 0.7 * u, false);
    for (let i = 0; i < 7; i++) star(r() * W, H * (0.08 + r() * 0.84), (10 + r() * 12) * u);
    for (let i = 0; i < 40; i++) { x.ctx.fillStyle = ink; x.ctx.beginPath(); x.ctx.arc(r() * W, r() * H, 1.8 * u, 0, TAU); x.ctx.fill(); }
  } },

  mecha: { metal: 0.45, rough: 0.35, draw(x, W, H, p, seed) {
    const r = rng(seed + 51), u = H / 512;
    const base = p.base || '#e8e6e0', c1 = p.c1 || '#2a5ac8', c2 = p.c2 || '#e8203a';
    x.ctx.fillStyle = base; x.ctx.fillRect(0, 0, W, H);
    // armour plates: the panel split into plates, the livery blocks follow them
    const plates = [];
    const split = (px, py, pw, ph, d) => {
      if (d === 0 || (pw < W * 0.12 && ph < H * 0.25)) { plates.push([px, py, pw, ph]); return; }
      if (pw / W > ph / H * 1.1) { const k = pw * (0.3 + r() * 0.4); split(px, py, k, ph, d - 1); split(px + k, py, pw - k, ph, d - 1); }
      else { const k = ph * (0.3 + r() * 0.4); split(px, py, pw, k, d - 1); split(px, py + k, pw, ph - k, d - 1); }
    };
    split(0, 0, W, H, 5);
    const band = (cx, cy) => (cx / W + cy / H * 0.5);
    for (const [px, py, pw, ph] of plates) {
      const b = band(px + pw / 2, py + ph / 2);
      const fill = b > 0.55 && b < 0.85 ? c1 : (r() < 0.12 ? c2 : shade(base, (r() - 0.5) * 0.08));
      x.ctx.fillStyle = fill; x.ctx.fillRect(px, py, pw, ph);
      // recessed panel line: dark groove, lit lip
      x.ctx.fillStyle = 'rgba(0,0,0,0.5)'; x.ctx.fillRect(px, py, pw, 2.5 * u); x.ctx.fillRect(px, py, 2.5 * u, ph);
      x.ctx.fillStyle = 'rgba(255,255,255,0.35)'; x.ctx.fillRect(px + 2.5 * u, py + 2.5 * u, pw - 2.5 * u, 1.5 * u); x.ctx.fillRect(px + 2.5 * u, py + 2.5 * u, 1.5 * u, ph - 2.5 * u);
      // rivets along the top edge
      if (pw > 60 * u) for (let xx = px + 14 * u; xx < px + pw - 10 * u; xx += 26 * u) {
        x.ctx.fillStyle = 'rgba(0,0,0,0.45)'; x.ctx.beginPath(); x.ctx.arc(xx, py + 10 * u, 3.4 * u, 0, TAU); x.ctx.fill();
        x.ctx.fillStyle = 'rgba(255,255,255,0.6)'; x.ctx.beginPath(); x.ctx.arc(xx - 0.8 * u, py + 9.2 * u, 1.4 * u, 0, TAU); x.ctx.fill();
      }
      // vents on some plates
      if (pw > W * 0.08 && ph > H * 0.18 && r() < 0.3) {
        for (let k = 0; k < 5; k++) {
          const vx = px + pw * 0.2, vy = py + ph * (0.35 + k * 0.1), vw = pw * 0.6, vh = 5 * u;
          x.ctx.fillStyle = 'rgba(10,10,12,0.75)'; x.ctx.beginPath(); x.ctx.roundRect(vx, vy, vw, vh, vh / 2); x.ctx.fill();
          x.ctx.fillStyle = 'rgba(255,255,255,0.3)'; x.ctx.fillRect(vx + vh / 2, vy + vh, vw - vh, 1.2 * u);
        }
      }
      // worn edges: paint chipped back to metal
      for (let k = 0; k < 3; k++) if (r() < 0.5) { x.ctx.fillStyle = 'rgba(170,172,176,0.8)'; x.ctx.beginPath(); x.ctx.ellipse(px + r() * pw, py + (r() < 0.5 ? 3 * u : ph - 3 * u), (3 + r() * 6) * u, (1.5 + r() * 2) * u, 0, 0, TAU); x.ctx.fill(); }
    }
    // hazard stripes on one strip
    const hy = H * 0.74;
    x.ctx.save(); x.ctx.beginPath(); x.ctx.rect(W * 0.6, hy, W * 0.35, H * 0.09); x.ctx.clip();
    for (let i = -10; i < 40; i++) { x.ctx.fillStyle = i % 2 ? '#111' : '#ffcc1a'; x.ctx.beginPath(); x.ctx.moveTo(W * 0.6 + i * 22 * u, hy); x.ctx.lineTo(W * 0.6 + (i + 1) * 22 * u, hy); x.ctx.lineTo(W * 0.6 + (i + 0.5) * 22 * u - 22 * u, hy + H * 0.09); x.ctx.lineTo(W * 0.6 + (i - 0.5) * 22 * u - 22 * u, hy + H * 0.09); x.ctx.fill(); }
    x.ctx.restore();
    // decals
    x.fillStyle = '#111'; x.font = `700 ${H * 0.045}px monospace`;
    x.fillText(`UNIT-${String(seed % 1000).padStart(3, '0')}`, W * 0.04, H * 0.1);
    x.fillText('CAUTION // HIGH VOLTAGE', W * 0.6, H * 0.71);
    x.font = `700 ${H * 0.035}px monospace`; x.fillText('NO STEP', W * 0.3, H * 0.9);
    x.ctx.fillRect(W * 0.3, H * 0.915, W * 0.07, 2.5 * u);
    x.fillStyle = '#ffcc1a'; x.strokeStyle = '#111'; x.lineWidth = 3 * u;
    x.beginPath(); x.moveTo(W * 0.47, H * 0.84); x.lineTo(W * 0.51, H * 0.92); x.lineTo(W * 0.43, H * 0.92); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#111'; x.font = `900 ${H * 0.05}px sans-serif`; x.fillText('!', W * 0.465, H * 0.91);
    x.font = `900 ${H * 0.26}px "Barlow Condensed", sans-serif`;
    x.lineWidth = 10 * u; x.strokeStyle = '#111'; x.strokeText(p.code || '07', W * 0.3, H * 0.48);
    x.fillStyle = c2; x.fillText(p.code || '07', W * 0.3, H * 0.48);
    for (let i = 0, xx = W * 0.04; i < 26; i++) { const bw = (2 + ((seed >> (i % 8)) & 1) * 3) * u; x.ctx.fillStyle = '#111'; x.ctx.fillRect(xx, H * 0.13, bw, H * 0.04); xx += bw + 3 * u; }
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
