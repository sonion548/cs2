// Wear for a painted finish (used on the page and in the paint worker).
import { fbm, valueNoise, rng, smooth } from '../noise.js';

// Wear: paint chips away to bare metal as the float rises, plus scratches and grime.
export function applyWear(canvas, float, seed) {
  if (float <= 0.0) return;
  const W = canvas.width, H = canvas.height;
  const x = canvas.getContext('2d');
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const f = float;
  // threshold grows non-linearly; FN keeps almost everything
  const chip = Math.pow(f, 1.35) * 0.62;
  const grime = f * 0.28;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / H, v = j / H;
    const n = fbm(u * 7 + seed * 0.13, v * 7, seed, 4);
    // edges of the texture (top/bottom ≈ edges of the gun silhouette) wear first
    const edgeBias = Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.25;
    const fine = valueNoise(u * 180, v * 180, seed + 5);
    const m = n - edgeBias + (fine - 0.5) * 0.08;
    const worn = smooth(chip + 0.02, chip - 0.03, m);
    const k = (j * W + i) * 4;
    if (worn > 0) {
      const steel = 128 + (valueNoise(u * 2, v * 260, seed + 9) - 0.5) * 40;
      d[k] = d[k] + (steel - d[k]) * worn;
      d[k + 1] = d[k + 1] + (steel + 2 - d[k + 1]) * worn;
      d[k + 2] = d[k + 2] + (steel + 6 - d[k + 2]) * worn;
    }
    const g = 1 - grime * (0.5 + fbm(u * 3, v * 3, seed + 2, 3));
    d[k] *= g; d[k + 1] *= g; d[k + 2] *= g * 0.97;
  }
  x.putImageData(img, 0, 0);
  // scratches
  const r = rng(seed + 77);
  const n = Math.floor(f * f * 900 + f * 60);
  x.lineCap = 'round';
  for (let s = 0; s < n; s++) {
    x.strokeStyle = `rgba(${r() < 0.7 ? '190,192,196' : '30,28,26'},${0.15 + r() * 0.4})`;
    x.lineWidth = 0.6 + r() * 1.4;
    const sx = r() * W, sy = r() * H, len = 6 + r() * 40, a = (r() - 0.5) * 0.8 + (r() < 0.5 ? 0 : Math.PI / 2);
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
  }
}

