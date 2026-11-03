// Pure per-pixel surface generators (no DOM), shared by the texture workers and
// the main-thread fallback. Each generator fills out = [r, g, b, height] for a
// point (u, v) of a tileable square; on map walls v grows upward (v = 0 is the
// bottom of a 4 m tile), which is how the Blender map's UVs come through.
import { fbm, voronoi, valueNoise, heightToNormal, clamp01, mix, smooth } from './noise.js';

// Every surface a match uses (name, seed). scripts/bake-textures.mjs writes these to
// public/textures/ so the game can load them instead of generating them.
export const MATCH_SURFACES = [
  ['sandstone', 1], ['plaster', 1], ['wallTrim', 1], ['paving', 1], ['sand', 1], ['tiles', 1], ['concrete', 1],
  ['crate', 1], ['crate', 2], ['crate', 3], ['crate', 7], ['metal', 1], ['metal', 3], ['metal', 9], ['detail', 1], ['macro', 1],
];

// Brick/block courses: edge (0 at mortar → 1 inside), raw distance to the nearest
// joint (e, in tile units), block id and the position inside the block.
function blocks(u, v, rows, cols, offset = 0.5, mortar = 0.012) {
  const r = Math.floor(v * rows);
  const shift = (r % 2) * offset;
  const cu = u * cols + shift;
  const c = Math.floor(cu);
  const fu = cu - c, fv = v * rows - r;
  const ex = Math.min(fu, 1 - fu) / cols, ey = Math.min(fv, 1 - fv) / rows;
  const e = Math.min(ex, ey);
  return { edge: smooth(mortar * 0.4, mortar * 1.6, e), e, id: ((c % cols) + cols) % cols + r * 97, fu, fv };
}

// Thin dark line where a noise field crosses 0.5 (cracks, veins).
const line = (n, w) => smooth(w, 0, Math.abs(n - 0.5));

export const GEN = {
  sandstone: { size: 1024, normal: 3.4, fn(seed) {
    return (u, v, o) => {
      const b = blocks(u, v, 6, 3, 0.5, 0.01);
      const tint = valueNoise(b.id, 3, seed) - 0.5;
      const warm = valueNoise(b.id, 11, seed) - 0.5;
      const n = fbm(u * 8, v * 8, seed, 5, 8);
      const fine = fbm(u * 64, v * 64, seed + 9, 3, 64);
      const erosion = smooth(0.55, 0.75, fbm(u * 4, v * 4, seed + 4, 4, 4));
      const strata = Math.sin((v * 6 * 9 + n * 4) * Math.PI) * 0.5 + 0.5;
      // chipped arrises: noise eats into each block near its joints
      const chipN = valueNoise(u * 90, v * 90, seed + 21, 90);
      const chip = smooth(0.012, 0.004, b.e - chipN * 0.016) * (1 - smooth(0.004, 0.0, b.e));
      // small weathering pits and the odd cracked block
      const pit = smooth(0.9, 0.95, valueNoise(u * 170, v * 170, seed + 33, 170));
      const crack = valueNoise(b.id, 7, seed) > 0.9 ? line(fbm(u * 9, v * 9, seed + b.id, 3, 9), 0.0026) * smooth(0.35, 0.6, fbm(u * 4, v * 4, seed + b.id + 1, 2, 4)) : 0;
      let r = 196 + tint * 44 + warm * 14 + (n - 0.5) * 50 + strata * 8 - fine * 18;
      let g = 160 + tint * 34 + warm * 4 + (n - 0.5) * 42 + strata * 6 - fine * 16;
      let bl = 112 + tint * 24 - warm * 10 + (n - 0.5) * 30 - fine * 12;
      // fresh, paler stone where the edge has chipped off
      r = mix(r, r + 22, chip); g = mix(g, g + 20, chip); bl = mix(bl, bl + 16, chip);
      // fine sand settled on the top edge of every block
      const dust = smooth(0.82, 1.0, b.fv) * (0.4 + n * 0.6);
      r = mix(r, 222, dust * 0.45); g = mix(g, 196, dust * 0.45); bl = mix(bl, 150, dust * 0.45);
      // mortar, recessed and sandy
      const m = b.edge;
      r = mix(128 + fine * 20, r, m); g = mix(110 + fine * 18, g, m); bl = mix(86 + fine * 12, bl, m);
      // darker weathering toward the bottom of each block, pits and cracks
      const shade = 1 - (1 - b.fv) * 0.09 - erosion * 0.12 - pit * 0.22 - crack * 0.35;
      o[0] = r * shade; o[1] = g * shade; o[2] = bl * shade;
      o[3] = m * (0.75 + n * 0.25) - erosion * 0.25 - fine * 0.05 - chip * 0.35 - pit * 0.3 - crack * 0.4;
    };
  } },
  plaster: { size: 1024, normal: 2.6, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 6, v * 6, seed, 5, 6);
      const fine = fbm(u * 80, v * 80, seed + 3, 2, 80);
      const tone = fbm(u * 2, v * 2, seed + 60, 3, 2);
      const stucco = fbm(u * 26, v * 26, seed + 72, 3, 26);
      // patches where plaster has fallen off revealing brick
      const pn = fbm(u * 3, v * 3, seed + 11, 4, 3);
      const patch = smooth(0.61, 0.645, pn);
      const rim = smooth(0.585, 0.61, pn) * (1 - patch);
      const br = blocks(u, v, 28, 9, 0.5, 0.006);
      const btint = valueNoise(br.id, 1, seed) * 30;
      const crackMask = smooth(0.6, 0.7, fbm(u * 4, v * 4, seed + 30, 3, 4));
      const crack = line(fbm(u * 6, v * 6, seed + 20, 4, 6), 0.0028) * crackMask;
      // rain streaks: noise stretched down the wall
      const streak = smooth(0.52, 0.8, fbm(u * 24, v * 1.5, seed + 40, 4, 24)) * smooth(0.3, 0.7, fbm(u * 3, v * 2, seed + 41, 3, 3));
      // squared-off repairs in a slightly different mix
      const rx = Math.floor(u * 5 + fbm(u * 2, v * 2, seed + 50, 2, 2) * 0.4), ry = Math.floor(v * 7);
      const repair = valueNoise(rx, ry, seed + 51) > 0.87 ? 1 : 0;
      let r = 214 + (n - 0.5) * 56 + (tone - 0.5) * 30 - fine * 16 - stucco * 10, g = 192 + (n - 0.5) * 50 + (tone - 0.5) * 22 - fine * 14 - stucco * 9, b = 158 + (n - 0.5) * 36 + (tone - 0.5) * 10 - fine * 11 - stucco * 7;
      if (repair) { r = r * 0.95 + 14; g = g * 0.95 + 12; b = b * 0.95 + 8; }
      const brick = [mix(110, 150 + btint, br.edge), mix(96, 86 + btint * 0.5, br.edge), mix(80, 62, br.edge)];
      r = mix(r, brick[0], patch); g = mix(g, brick[1], patch); b = mix(b, brick[2], patch);
      // broken plaster edge around each patch catches a little shadow
      r -= rim * 30; g -= rim * 28; b -= rim * 24;
      r -= crack * 70 + streak * 26; g -= crack * 66 + streak * 26; b -= crack * 60 + streak * 22;
      o[0] = r; o[1] = g; o[2] = b;
      o[3] = (1 - patch) * (0.6 + stucco * 0.22) + patch * br.edge * 0.4 - crack * 0.3 + fine * 0.08 + n * 0.1 + rim * 0.25 + repair * 0.04;
    };
  } },
  paving: { size: 1024, normal: 3.6, fn(seed) {
    return (u, v, o) => {
      const vo = voronoi(u * 7, v * 7, seed, 7);
      // ragged joints: the edge threshold wobbles so stones look chipped
      const wob = valueNoise(u * 60, v * 60, seed + 5, 60);
      const edge = smooth(0.0, 0.09 + wob * 0.05, vo.d2 - vo.d1);
      const n = fbm(u * 16, v * 16, seed + 2, 4, 16);
      const tint = vo.id;
      const sand = smooth(0.5, 0.75, fbm(u * 5, v * 5, seed + 8, 4, 5)) * (1 - edge * 0.6);
      // a few stones are cracked across, some carry oil or water stains
      const crack = vo.id > 0.86 ? line(fbm(u * 13, v * 13, seed + 17, 3, 13), 0.0035) * edge : 0;
      const stain = smooth(0.68, 0.86, fbm(u * 3, v * 3, seed + 60, 4, 3));
      const worn = smooth(0.25, 0.05, vo.d1) * 0.5;
      let r = 150 + tint * 45 + (n - 0.5) * 40 + worn * 18, g = 138 + tint * 38 + (n - 0.5) * 36 + worn * 15, b = 118 + tint * 30 + (n - 0.5) * 30 + worn * 12;
      // sandy joints
      r = mix(156, r, edge); g = mix(134, g, edge); b = mix(100, b, edge);
      r = mix(r, 200, sand * 0.5); g = mix(g, 172, sand * 0.5); b = mix(b, 128, sand * 0.5);
      const dk = 1 - stain * 0.28 - crack * 0.45;
      o[0] = r * dk; o[1] = g * dk; o[2] = b * (dk + stain * 0.04);
      o[3] = edge * (0.8 + vo.id * 0.2) + n * 0.12 - sand * 0.1 - crack * 0.5;
    };
  } },
  tiles: { size: 1024, normal: 3, fn(seed) {
    return (u, v, o) => {
      const b = blocks(u, v, 4, 4, 0, 0.008);
      const n = fbm(u * 12, v * 12, seed, 4, 12);
      const t = valueNoise(b.id, 5, seed);
      const crack = (t > 0.8) ? line(fbm(u * 12, v * 12, seed + b.id, 3, 12), 0.0045) * smooth(0.3, 0.55, fbm(u * 5, v * 5, seed + b.id + 2, 2, 5)) : 0;
      // three painted motifs: ring and border, diamond, eight-point star
      const fu = b.fu - 0.5, fv = b.fv - 0.5;
      const border = Math.min(b.fu, 1 - b.fu, b.fv, 1 - b.fv);
      let motif;
      if (t < 0.4) {
        const band = smooth(0.1, 0.11, border) * (1 - smooth(0.14, 0.15, border));
        const ring = smooth(0.02, 0.0, Math.abs(Math.hypot(fu, fv) - 0.2));
        motif = Math.max(band, ring, 1 - smooth(0.06, 0.08, Math.hypot(fu, fv)));
      } else if (t < 0.7) {
        const d = Math.abs(fu) + Math.abs(fv);
        motif = Math.max(smooth(0.02, 0, Math.abs(d - 0.36)), 1 - smooth(0.12, 0.14, d), smooth(0.1, 0.11, border) * (1 - smooth(0.13, 0.14, border)));
      } else {
        const sq = Math.max(Math.abs(fu), Math.abs(fv)), dm = (Math.abs(fu) + Math.abs(fv)) * 0.7071;
        const star = Math.min(sq, dm);
        motif = Math.max(1 - smooth(0.17, 0.19, star), smooth(0.015, 0, Math.abs(star - 0.27)));
      }
      // worn paint in the middle of busy tiles, dust in patches
      const wear = smooth(0.45, 0.75, fbm(u * 6, v * 6, seed + 71, 4, 6));
      const dust = smooth(0.62, 0.82, fbm(u * 3, v * 3, seed + 70, 4, 3));
      // one corner knocked off some tiles, showing the bed underneath
      const cn = valueNoise(b.id, 9, seed);
      const cx = cn > 0.5 ? 1 : 0, cy = valueNoise(b.id, 13, seed) > 0.5 ? 1 : 0;
      const chip = cn > 0.86 || cn < 0.06 ? 1 - smooth(0.1, 0.13, Math.hypot(b.fu - cx, b.fv - cy) + (valueNoise(u * 120, v * 120, seed + 3, 120) - 0.5) * 0.04) : 0;
      let r = 184 + t * 30 + (n - 0.5) * 40, g = 160 + t * 24 + (n - 0.5) * 34, bl = 126 + t * 18 + (n - 0.5) * 26;
      const paint = motif * 0.65 * (0.6 + n * 0.6) * (1 - wear * 0.55);
      const blue = t < 0.4 || t > 0.85;
      r = mix(r, blue ? 76 : 150, paint); g = mix(g, blue ? 98 : 80, paint); bl = mix(bl, blue ? 118 : 52, paint);
      r = mix(r, 205, dust * 0.4); g = mix(g, 178, dust * 0.4); bl = mix(bl, 134, dust * 0.4);
      // grout: dark, a little sandy
      r = mix(74 + n * 20, r, b.edge); g = mix(64 + n * 18, g, b.edge); bl = mix(52 + n * 12, bl, b.edge);
      r = mix(r, 112, chip); g = mix(g, 98, chip); bl = mix(bl, 80, chip);
      r -= crack * 70; g -= crack * 60; bl -= crack * 50;
      o[0] = r; o[1] = g; o[2] = bl;
      o[3] = b.edge * 0.9 * (1 - chip * 0.7) + n * 0.05 - crack * 0.4 - dust * 0.04;
    };
  } },
  sand: { size: 1024, normal: 2.4, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 6, v * 6, seed, 5, 6);
      const big = fbm(u * 2, v * 2, seed + 12, 3, 2);
      const ripple = Math.sin((u * 40 + fbm(u * 3, v * 3, seed + 5, 3, 3) * 10) * Math.PI * 2) * 0.5 + 0.5;
      const grains = valueNoise(u * 512, v * 512, seed + 9, 512);
      const pebbles = smooth(0.82, 0.86, valueNoise(u * 90, v * 90, seed + 3, 90));
      const stones = smooth(0.9, 0.93, valueNoise(u * 34, v * 34, seed + 23, 34));
      // trodden, darker and flatter patches
      const trod = smooth(0.58, 0.75, fbm(u * 4, v * 4, seed + 31, 4, 4));
      let r = 205 + (n - 0.5) * 46 + (big - 0.5) * 30 + (grains - 0.5) * 30, g = 172 + (n - 0.5) * 40 + (big - 0.5) * 24 + (grains - 0.5) * 26, b = 124 + (n - 0.5) * 30 + (big - 0.5) * 16 + (grains - 0.5) * 20;
      r = mix(r, 130, pebbles * 0.6); g = mix(g, 114, pebbles * 0.6); b = mix(b, 92, pebbles * 0.6);
      r = mix(r, 150, stones * 0.7); g = mix(g, 132, stones * 0.7); b = mix(b, 108, stones * 0.7);
      r -= trod * 16; g -= trod * 15; b -= trod * 12;
      const rip = ripple * (1 - trod * 0.8);
      o[0] = r - rip * 8; o[1] = g - rip * 7; o[2] = b - rip * 5;
      o[3] = n * 0.4 + rip * 0.15 + grains * 0.06 + pebbles * 0.3 + stones * 0.45 - trod * 0.1;
    };
  } },
  crate: { size: 512, normal: 3, fn(seed) {
    return (u, v, o) => {
      const plank = Math.floor(v * 6), pv = v * 6 - plank;
      const grain = fbm(u * 3, (v * 6 + plank * 3.7) * 6 + fbm(u * 6, v * 6, seed, 3, 6) * 2, seed + plank, 4, 0);
      const ring = Math.sin((grain * 18) * Math.PI) * 0.5 + 0.5;
      const t = valueNoise(plank, 1, seed) * 30;
      const knot = smooth(0.035, 0.0, Math.hypot((u * 3 + plank * 0.37) % 1 - 0.5, (pv - 0.5) * 0.5) - valueNoise(plank, 4, seed) * 0.02) * (valueNoise(plank, 6, seed) > 0.55 ? 1 : 0);
      let r = 150 + t + ring * 24 - 20, g = 108 + t * 0.7 + ring * 16 - 14, b = 64 + ring * 8;
      r -= knot * 50; g -= knot * 40; b -= knot * 22;
      const gap = smooth(0, 0.05, Math.min(pv, 1 - pv));
      // frame and diagonal brace
      const frame = Math.min(u, 1 - u, v, 1 - v) < 0.085;
      const diag = Math.abs(u - v) < 0.06;
      if (frame || diag) { r *= 0.78; g *= 0.74; b *= 0.7; }
      const nail = [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]].some(([a, c]) => Math.hypot(u - a, v - c) < 0.014);
      if (nail) { r = g = b = 60; }
      o[0] = r * (0.55 + gap * 0.45); o[1] = g * (0.55 + gap * 0.45); o[2] = b * (0.55 + gap * 0.45);
      o[3] = gap * 0.6 + ring * 0.08 + (frame || diag ? 0.35 : 0) + (nail ? 0.5 : 0) - knot * 0.2;
    };
  } },
  metal: { size: 512, normal: 1.6, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 8, v * 8, seed, 4, 8);
      const brushed = valueNoise(u * 2, v * 400, seed + 1, 0) * 0.5 + valueNoise(u * 4, v * 900, seed + 2, 0) * 0.5;
      const rust = smooth(0.6, 0.72, fbm(u * 5, v * 5, seed + 3, 5, 5));
      // scratches: long thin bright lines at a few angles
      const s1 = line(fbm(u * 40 + v * 4, v * 3, seed + 7, 2, 0), 0.004), s2 = line(fbm(u * 3, v * 40 - u * 6, seed + 8, 2, 0), 0.003);
      // rivets on a loose grid
      const gx = u * 8 - Math.floor(u * 8) - 0.5, gy = v * 8 - Math.floor(v * 8) - 0.5;
      const rivet = smooth(0.06, 0.04, Math.hypot(gx, gy)) * (Math.abs(gx) < 0.1 && Math.abs(gy) < 0.1 ? 1 : 0);
      let r = 100 + n * 30 + brushed * 20, g = 104 + n * 30 + brushed * 20, b = 110 + n * 30 + brushed * 20;
      r = mix(r, 120, rust); g = mix(g, 68, rust); b = mix(b, 38, rust);
      const sc = Math.max(s1, s2) * (1 - rust);
      r += sc * 40; g += sc * 40; b += sc * 40;
      o[0] = r; o[1] = g; o[2] = b; o[3] = brushed * 0.1 + rust * 0.3 + rivet * 0.6 - sc * 0.1;
    };
  } },
  wallTrim: { size: 512, normal: 3, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 10, v * 10, seed, 4, 10);
      const groove = smooth(0.02, 0.0, Math.abs(v - 0.3)) + smooth(0.02, 0.0, Math.abs(v - 0.7));
      const b = blocks(u, v, 1, 4, 0, 0.01);
      const chipN = valueNoise(u * 60, v * 60, seed + 4, 60);
      const chip = smooth(0.02, 0.006, b.e - chipN * 0.02) * (1 - smooth(0.006, 0, b.e));
      let r = 150 + (n - 0.5) * 40, g = 122 + (n - 0.5) * 34, bl = 86 + (n - 0.5) * 24;
      r = mix(96, r, b.edge) - groove * 40 + chip * 20; g = mix(80, g, b.edge) - groove * 36 + chip * 18; bl = mix(60, bl, b.edge) - groove * 30 + chip * 14;
      o[0] = r; o[1] = g; o[2] = bl; o[3] = b.edge * 0.6 - groove * 0.4 + n * 0.1 - chip * 0.3;
    };
  } },
  concrete: { size: 1024, normal: 2.2, fn(seed) {
    return (u, v, o) => {
      const n = fbm(u * 6, v * 6, seed, 5, 6);
      const pits = smooth(0.78, 0.8, valueNoise(u * 140, v * 140, seed + 4, 140));
      const stain = smooth(0.55, 0.8, fbm(u * 3, v * 2, seed + 6, 4, 3));
      // formwork: panel seams, board lines and a grid of tie holes with rust runs
      const seam = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5), u, v) < 0.003 ? 1 : 0;
      const formwork = Math.sin(v * Math.PI * 16) * 0.5 + 0.5;
      const hx = u * 4 - Math.floor(u * 4) - 0.5, hy = v * 4 - Math.floor(v * 4) - 0.5;
      const hole = smooth(0.026, 0.018, Math.hypot(hx, hy));
      const holeRim = smooth(0.036, 0.026, Math.hypot(hx, hy)) * (1 - hole);
      const rustRun = (hy < 0 && Math.abs(hx) < 0.03 ? smooth(-0.35, 0, hy) * smooth(0.03, 0, Math.abs(hx)) : 0) * smooth(0.4, 0.7, valueNoise(Math.floor(u * 4), Math.floor(v * 4), seed + 9));
      const streak = smooth(0.55, 0.82, fbm(u * 20, v * 1.4, seed + 12, 4, 20));
      const crack = line(fbm(u * 7, v * 7, seed + 14, 4, 7), 0.0028) * smooth(0.55, 0.7, fbm(u * 2, v * 2, seed + 15, 3, 2));
      let c = 146 + (n - 0.5) * 50 - pits * 40 - stain * 36 - seam * 50 + formwork * 5 - hole * 70 + holeRim * 12 - streak * 22 - crack * 60;
      o[0] = c + rustRun * 30; o[1] = c * 0.97 + rustRun * 4; o[2] = c * 0.92 - rustRun * 16;
      o[3] = n * 0.3 - pits * 0.4 - seam * 0.5 + formwork * 0.05 - hole * 0.8 + holeRim * 0.2 - crack * 0.4;
    };
  } },
  // fine neutral grain laid over everything at close range (grey around 0.5)
  detail: { size: 512, normal: 0, fn(seed) {
    return (u, v, o) => {
      const a = fbm(u * 32, v * 32, seed, 3, 32), b = valueNoise(u * 256, v * 256, seed + 1, 256);
      const speck = smooth(0.86, 0.92, valueNoise(u * 96, v * 96, seed + 2, 96));
      const g = clamp01(0.5 + (a - 0.5) * 0.9 + (b - 0.5) * 0.35 - speck * 0.25) * 255;
      o[0] = g; o[1] = g; o[2] = g; o[3] = 0;
    };
  } },
  // two octaves of broad variation, sampled in world space to break up tiling
  macro: { size: 256, normal: 0, fn(seed) {
    return (u, v, o) => {
      o[0] = fbm(u * 4, v * 4, seed, 5, 4) * 255;
      o[1] = fbm(u * 8, v * 8, seed + 5, 4, 8) * 255;
      o[2] = smooth(0.45, 0.75, fbm(u * 3, v * 3, seed + 9, 4, 3)) * 255;
      o[3] = 0;
    };
  } },
};

function flipRows(a, size) {
  const stride = size * 4, tmp = new Uint8ClampedArray(stride);
  for (let y = 0; y < size >> 1; y++) {
    const top = y * stride, bot = (size - 1 - y) * stride;
    tmp.set(a.subarray(top, top + stride));
    a.copyWithin(top, bot, bot + stride);
    a.set(tmp, bot);
  }
}

// Generates a surface as raw RGBA bytes plus a normal map, ready for an
// unflipped DataTexture. The glTF export turns the map's UVs upside down
// (v' = 1 - v), so the rows go in reverse to keep generator v pointing up.
export function generateArrays(name, seed = 1, sizeScale = 1) {
  const g = GEN[name];
  const size = Math.max(64, Math.round(g.size * sizeScale));
  const fn = g.fn(seed * 7919 + name.length);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const h = g.normal ? new Float32Array(size * size) : null;
  const o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size, row = y * size * 4;
    for (let x = 0; x < size; x++) {
      fn((x + 0.5) / size, v, o);
      const i = row + x * 4;
      rgba[i] = o[0]; rgba[i + 1] = o[1]; rgba[i + 2] = o[2]; rgba[i + 3] = 255;
      if (h) h[y * size + x] = o[3];
    }
  }
  let normal = null;
  if (h) { normal = heightToNormal(h, size, size, g.normal * size / 512); flipRows(normal, size); }
  flipRows(rgba, size);
  return { size, rgba, normal };
}
