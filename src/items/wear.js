// Wear for a painted finish (used on the page and in the paint worker).
import { fbm, valueNoise, rng, smooth } from '../noise.js';

// How much of the paint is chipped to bare metal at a float. Field-Tested
// used to lose almost nothing (1-4%) and a worn-out Battle-Scarred most of
// the design (70-85%, plus heavy scratching and darkening). Now wear shows
// clearly from Field-Tested on and Battle-Scarred keeps most of the design.
export function wearCover(f) {
  if (f < 0.07) return 0;                                        // Factory New
  if (f < 0.15) return (f - 0.07) / 0.08 * 0.02;                 // Minimal Wear: edge scuffs
  if (f < 0.38) return 0.03 + (f - 0.15) / 0.23 * 0.09;          // Field-Tested: 3-12%
  if (f < 0.45) return 0.12 + (f - 0.38) / 0.07 * 0.04;          // Well-Worn: 12-16%
  return 0.16 + Math.min(1, (f - 0.45) / 0.55) * 0.16;           // Battle-Scarred: 16-32%
}

// Wear: paint chips away to bare metal as the float rises (edges first),
// plus scratches and a little grime.
export function applyWear(canvas, float, seed) {
  if (float <= 0.0) return;
  const W = canvas.width, H = canvas.height;
  const x = canvas.getContext('2d');
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const f = float;
  // the wear field: low values chip first; edges of the texture (top/bottom,
  // roughly the edges of the gun's silhouette) are lower
  const field = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / H, v = j / H;
    const n = fbm(u * 7 + seed * 0.13, v * 7, seed, 4);
    const edgeBias = Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.25;
    const fine = valueNoise(u * 180, v * 180, seed + 5);
    field[j * W + i] = n - edgeBias + (fine - 0.5) * 0.08;
  }
  // the threshold that chips exactly the wanted share (from a sample of the field)
  const cover = wearCover(f);
  let chip = -1;
  if (cover > 0) {
    const sample = [];
    for (let k = 0; k < field.length; k += 7) sample.push(field[k]);
    sample.sort((a, b) => a - b);
    chip = sample[Math.min(sample.length - 1, Math.floor(cover * sample.length))];
  }
  const grime = f * 0.13;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / H, v = j / H, k = (j * W + i) * 4;
    if (chip > -1) {
      const worn = smooth(chip + 0.012, chip - 0.012, field[j * W + i]);
      if (worn > 0) {
        const steel = 128 + (valueNoise(u * 2, v * 260, seed + 9) - 0.5) * 40;
        d[k] = d[k] + (steel - d[k]) * worn;
        d[k + 1] = d[k + 1] + (steel + 2 - d[k + 1]) * worn;
        d[k + 2] = d[k + 2] + (steel + 6 - d[k + 2]) * worn;
      }
    }
    const g = 1 - grime * (0.5 + fbm(u * 3, v * 3, seed + 2, 3));
    d[k] *= g; d[k + 1] *= g; d[k + 2] *= g * 0.97;
  }
  x.putImageData(img, 0, 0);
  // scratches: a few from Minimal Wear, clearly visible at Field-Tested,
  // and far fewer at the top end than before (was up to ~960)
  const r = rng(seed + 77);
  const n = Math.floor(f * 230 + f * f * 120);
  const scale = W / 1024;
  x.lineCap = 'round';
  for (let s = 0; s < n; s++) {
    x.strokeStyle = `rgba(${r() < 0.7 ? '190,192,196' : '30,28,26'},${0.12 + r() * 0.33})`;
    x.lineWidth = (0.6 + r() * 1.3) * Math.max(0.5, scale);
    const sx = r() * W, sy = r() * H, len = (6 + r() * 38) * Math.max(0.4, scale), a = (r() - 0.5) * 0.8 + (r() < 0.5 ? 0 : Math.PI / 2);
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
  }
}
