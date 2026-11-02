// Procedural canvas textures. Everything is generated at load time so the
// project ships with no external art assets.
import * as THREE from 'three';

const cache = new Map();

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Adds per-pixel grain, optionally tinted, to whatever is drawn already.
function grain(ctx, size, amount, seed) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Soft blotches drawn with wrap-around so the texture stays tileable.
function blotches(ctx, size, count, color, minR, maxR, alpha, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size;
    const rad = minR + r() * (maxR - minR);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      g.addColorStop(0, color.replace('A', (alpha * (0.4 + r() * 0.6)).toFixed(3)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
}

function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const gens = {
  sandstone(seed) {
    const S = 512, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#c6a273'; x.fillRect(0, 0, S, S);
    blotches(x, S, 40, 'rgba(120,85,50,A)', 20, 90, 0.18, seed);
    blotches(x, S, 30, 'rgba(240,215,170,A)', 20, 80, 0.15, seed + 1);
    // block courses
    const r = rng(seed + 2);
    const rowH = S / 4;
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? S / 4 : 0;
      x.fillStyle = 'rgba(80,55,30,0.55)';
      x.fillRect(0, row * rowH, S, 4);
      for (let k = 0; k < 3; k++) {
        const bx = (off + k * S / 2) % S;
        x.fillRect(bx, row * rowH, 4, rowH);
      }
      // subtle per-block tint
      for (let k = 0; k < 3; k++) {
        const bx = (off + k * S / 2) % S;
        x.fillStyle = `rgba(${r() > 0.5 ? '255,235,200' : '90,60,30'},${(r() * 0.08).toFixed(3)})`;
        x.fillRect(bx + 4, row * rowH + 4, S / 2 - 4, rowH - 4);
        if (bx + S / 2 > S) x.fillRect(bx - S + 4, row * rowH + 4, S / 2 - 4, rowH - 4);
      }
      // highlight edge
      x.fillStyle = 'rgba(255,240,210,0.25)';
      x.fillRect(0, row * rowH + 4, S, 2);
    }
    // chips
    for (let i = 0; i < 180; i++) {
      x.fillStyle = `rgba(70,45,25,${(r() * 0.35).toFixed(3)})`;
      x.beginPath(); x.arc(r() * S, r() * S, r() * 3 + 0.5, 0, 7); x.fill();
    }
    grain(x, S, 26, seed + 3);
    return finish(c);
  },
  plaster(seed) {
    const S = 512, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#d8c3a0'; x.fillRect(0, 0, S, S);
    blotches(x, S, 60, 'rgba(150,115,80,A)', 15, 120, 0.2, seed);
    blotches(x, S, 20, 'rgba(255,245,225,A)', 30, 100, 0.25, seed + 1);
    const r = rng(seed + 5);
    x.strokeStyle = 'rgba(90,65,40,0.35)'; x.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      let px = r() * S, py = r() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 8; k++) { px += (r() - 0.5) * 30; py += r() * 18; x.lineTo(px, py); }
      x.stroke();
    }
    // exposed bricks
    for (let i = 0; i < 3; i++) {
      const bx = r() * S * 0.8, by = r() * S * 0.8;
      for (let k = 0; k < 4; k++) {
        x.fillStyle = 'rgba(150,90,55,0.8)';
        x.fillRect(bx + (k % 2) * 20, by + k * 14, 38, 11);
      }
    }
    grain(x, S, 20, seed + 6);
    return finish(c);
  },
  tiles(seed) {
    const S = 512, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#6d6252'; x.fillRect(0, 0, S, S);
    const r = rng(seed);
    const n = 4, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 150 + r() * 40;
      x.fillStyle = `rgb(${v},${v * 0.88},${v * 0.72})`;
      x.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
      if (r() < 0.25) { // cracked tile
        x.strokeStyle = 'rgba(60,50,40,0.6)'; x.beginPath();
        x.moveTo(i * t + r() * t, j * t); x.lineTo(i * t + r() * t, j * t + t); x.stroke();
      }
    }
    blotches(x, S, 30, 'rgba(70,50,30,A)', 20, 90, 0.2, seed + 1);
    grain(x, S, 22, seed + 2);
    return finish(c);
  },
  paving(seed) {
    const S = 512, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#5c5246'; x.fillRect(0, 0, S, S);
    const r = rng(seed);
    const rows = 8, h = S / rows;
    for (let row = 0; row < rows; row++) {
      let px = row % 2 ? -h * 0.7 : 0;
      while (px < S) {
        const w = h * (1.2 + r() * 1.2);
        const v = 120 + r() * 50;
        x.fillStyle = `rgb(${v},${v * 0.92},${v * 0.8})`;
        x.fillRect(px + 2, row * h + 2, w - 4, h - 4);
        if (px + w > S) x.fillRect(px - S + 2, row * h + 2, w - 4, h - 4);
        px += w;
      }
    }
    blotches(x, S, 40, 'rgba(200,170,120,A)', 20, 70, 0.22, seed + 3);
    grain(x, S, 26, seed + 4);
    return finish(c);
  },
  sand(seed) {
    const S = 512, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#c5a679'; x.fillRect(0, 0, S, S);
    blotches(x, S, 70, 'rgba(140,105,65,A)', 10, 80, 0.2, seed);
    blotches(x, S, 50, 'rgba(235,210,165,A)', 10, 60, 0.2, seed + 1);
    const r = rng(seed + 2);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = `rgba(${r() > 0.5 ? '90,70,45' : '240,220,180'},${(r() * 0.5).toFixed(2)})`;
      x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    grain(x, S, 30, seed + 3);
    return finish(c);
  },
  crate(seed) {
    const S = 256, c = canvas(S), x = c.getContext('2d');
    const r = rng(seed);
    x.fillStyle = '#7a5a34'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 6; i++) {
      const v = 110 + r() * 30;
      x.fillStyle = `rgb(${v},${v * 0.75},${v * 0.45})`;
      x.fillRect(0, i * S / 6 + 1, S, S / 6 - 2);
      x.strokeStyle = 'rgba(60,40,20,0.35)';
      for (let k = 0; k < 6; k++) {
        x.beginPath(); const yy = i * S / 6 + r() * S / 6;
        x.moveTo(0, yy); x.bezierCurveTo(S / 3, yy + 3, S / 2, yy - 3, S, yy); x.stroke();
      }
    }
    // frame + cross brace
    x.fillStyle = '#5b3f20';
    x.fillRect(0, 0, S, 22); x.fillRect(0, S - 22, S, 22);
    x.fillRect(0, 0, 22, S); x.fillRect(S - 22, 0, 22, S);
    x.save(); x.translate(S / 2, S / 2); x.rotate(Math.PI / 4);
    x.fillRect(-S * 0.7, -10, S * 1.4, 20); x.restore();
    x.fillStyle = 'rgba(40,40,40,0.9)';
    for (const [a, b] of [[11, 11], [S - 11, 11], [11, S - 11], [S - 11, S - 11]]) {
      x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill();
    }
    grain(x, S, 24, seed + 1);
    return finish(c);
  },
  metal(seed) {
    const S = 256, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#5e646a'; x.fillRect(0, 0, S, S);
    const r = rng(seed);
    for (let i = 0; i < 120; i++) {
      x.strokeStyle = `rgba(${r() > 0.5 ? '220,225,230' : '30,30,30'},${(r() * 0.25).toFixed(2)})`;
      x.beginPath(); const px = r() * S, py = r() * S;
      x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 40, py + (r() - 0.5) * 6); x.stroke();
    }
    blotches(x, S, 15, 'rgba(120,70,30,A)', 8, 40, 0.3, seed + 2);
    grain(x, S, 18, seed + 3);
    return finish(c);
  },
  wallTrim(seed) {
    const S = 256, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#8c7556'; x.fillRect(0, 0, S, S);
    x.fillStyle = 'rgba(255,240,210,0.25)'; x.fillRect(0, 0, S, S * 0.15);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, S * 0.85, S, S * 0.15);
    grain(x, S, 24, seed);
    return finish(c);
  },
  concrete(seed) {
    const S = 512, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#8b877f'; x.fillRect(0, 0, S, S);
    blotches(x, S, 60, 'rgba(60,58,55,A)', 20, 100, 0.18, seed);
    blotches(x, S, 30, 'rgba(200,195,185,A)', 20, 80, 0.15, seed + 1);
    x.fillStyle = 'rgba(40,40,40,0.4)';
    x.fillRect(0, S / 2, S, 2); x.fillRect(S / 2, 0, 2, S);
    grain(x, S, 22, seed + 2);
    return finish(c);
  },
};

export function tex(name, seed = 1) {
  const key = name + ':' + seed;
  if (!cache.has(key)) cache.set(key, gens[name](seed * 7919 + name.length));
  return cache.get(key);
}

// Big painted site letter used as a floor/wall decal.
export function letterTexture(letter) {
  const S = 512, c = canvas(S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  x.font = 'bold 420px Impact, Arial Black, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(190,30,25,0.85)';
  x.fillText(letter, S / 2, S / 2 + 20);
  // spray-paint wear
  const r = rng(letter.charCodeAt(0));
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(0,0,0,${(r() * 0.6).toFixed(2)})`;
    x.fillRect(r() * S, r() * S, r() * 6, r() * 6);
  }
  return finish(c, { repeat: false });
}

export function radialTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,140,40,0)') {
  const S = 128, c = canvas(S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.35, 'rgba(255,200,90,0.8)'); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return finish(c, { repeat: false });
}

export function decalTexture() {
  const S = 64, c = canvas(S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(10,8,6,0.95)'); g.addColorStop(0.3, 'rgba(30,25,20,0.8)');
  g.addColorStop(0.6, 'rgba(60,50,40,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return finish(c, { repeat: false });
}

export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#3f78b8'); g.addColorStop(0.45, '#8db7dc');
  g.addColorStop(0.5, '#e8d9bd'); g.addColorStop(1, '#b89a72');
  x.fillStyle = g; x.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
