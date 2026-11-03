// Checks every map in src/maps.js (and its Blender colliders, when built):
//   - the grid is rectangular and closed: every border cell is a wall
//   - every walkable cell can be reached from the attackers' spawn, and back
//   - named points sit on walkable cells, callouts stay inside the map
//   - leak test: a flood fill at walking height over the exported colliders,
//     starting in the attackers' spawn, never gets outside the map
// Run: npm run check:maps
import { readFileSync, existsSync } from 'node:fs';
import { MAPS, passable } from '../src/maps.js';

const WALKABLE = '.,usABTKhD';
const root = new URL('../public/models/maps/', import.meta.url);
let failed = 0;
const fail = (id, msg) => { failed++; console.log(`  FAIL ${id}: ${msg}`); };

for (const map of Object.values(MAPS)) {
  const { id, grid, levels, cell: S } = map;
  const H = grid.length, W = grid[0].length;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? '#' : grid[z][x]);
  const lvl = (x, z) => (levels ? +levels[z][x] : 0);
  const walk = (x, z) => WALKABLE.includes(at(x, z));
  const before = failed;

  // shape
  grid.forEach((r, z) => r.length !== W && fail(id, `grid row ${z} is ${r.length} wide, expected ${W}`));
  if (levels) {
    if (levels.length !== H) fail(id, `levels has ${levels.length} rows, grid has ${H}`);
    levels.forEach((r, z) => r.length !== W && fail(id, `levels row ${z} is ${r.length} wide, expected ${W}`));
  }

  // closed border
  for (let x = 0; x < W; x++) for (const z of [0, H - 1]) if (at(x, z) !== '#') fail(id, `open border cell ${x},${z}`);
  for (let z = 0; z < H; z++) for (const x of [0, W - 1]) if (at(x, z) !== '#') fail(id, `open border cell ${x},${z}`);

  // connectivity with the game's movement rules (doorways, up one level, down any)
  const cells = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (walk(x, z)) cells.push([x, z]);
  const tCells = cells.filter(([x, z]) => at(x, z) === 'T');
  const kCells = cells.filter(([x, z]) => at(x, z) === 'K');
  if (!tCells.length || !kCells.length) fail(id, 'missing a spawn');
  const reach = (start, reverse) => {
    const seen = new Set([start.join()]), todo = [start];
    while (todo.length) {
      const [x, z] = todo.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (seen.has(k) || !walk(nx, nz)) continue;
        const [ax, az, bx, bz] = reverse ? [nx, nz, x, z] : [x, z, nx, nz];
        if (!passable(at(ax, az), at(bx, bz)) || lvl(bx, bz) - lvl(ax, az) > 1) continue;
        seen.add(k); todo.push([nx, nz]);
      }
    }
    return seen;
  };
  if (tCells.length) {
    const fwd = reach(tCells[0], false), back = reach(tCells[0], true);
    const lost = cells.filter(c => !fwd.has(c.join())), stuck = cells.filter(c => !back.has(c.join()));
    if (lost.length) fail(id, `${lost.length} walkable cells can't be reached from the T spawn, e.g. ${lost.slice(0, 4).join(' ')}`);
    if (stuck.length) fail(id, `${stuck.length} cells have no way back to the T spawn, e.g. ${stuck.slice(0, 4).join(' ')}`);
  }

  // named points and callouts
  const pts = JSON.stringify(map.points || {}).match(/\[\d+,\d+(,\d+,\d+)?\]/g) || [];
  for (const p of pts) {
    const [x, z] = JSON.parse(p);
    if (!walk(x, z)) fail(id, `point ${p} is not on a walkable cell`);
  }
  for (const [name, x0, z0, x1, z1] of map.callouts || []) {
    if (x0 < 0 || z0 < 0 || x1 >= W || z1 >= H || x0 > x1 || z0 > z1) fail(id, `callout ${name} is out of bounds`);
  }

  // leak test over the exported colliders: 0.5 m lattice at walking height
  const file = new URL(`${id}.colliders.json`, root);
  let note = 'no colliders built';
  if (existsSync(file)) {
    const boxes = JSON.parse(readFileSync(file, 'utf8')).filter(([, y0, , , y1]) => y0 <= 1 && y1 >= 2.6);
    const X = W * S, Z = H * S, R = 0.5, M = 8;
    const nx = Math.ceil((X + 2 * M) / R), nz = Math.ceil((Z + 2 * M) / R);
    const solid = new Uint8Array(nx * nz);
    for (const [x0, , z0, x1, , z1] of boxes) {
      for (let i = Math.max(0, Math.floor((x0 + M) / R)); i <= Math.min(nx - 1, Math.floor((x1 + M) / R - 1e-6)); i++)
        for (let k = Math.max(0, Math.floor((z0 + M) / R)); k <= Math.min(nz - 1, Math.floor((z1 + M) / R - 1e-6)); k++) solid[k * nx + i] = 1;
    }
    const [tx, tz] = tCells[0];
    const si = Math.floor((tx * S + S / 2 + M) / R), sk = Math.floor((tz * S + S / 2 + M) / R);
    const seen = new Uint8Array(nx * nz), todo = [sk * nx + si];
    seen[todo[0]] = 1;
    let out = null, n = 0;
    while (todo.length) {
      const c = todo.pop(), i = c % nx, k = (c - i) / nx;
      n++;
      const px = i * R - M + R / 2, pz = k * R - M + R / 2;
      if (px < 0 || pz < 0 || px > X || pz > Z) { out = [px.toFixed(1), pz.toFixed(1)]; break; }
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
        const nc = nk * nx + ni;
        if (seen[nc] || solid[nc]) continue;
        seen[nc] = 1; todo.push(nc);
      }
    }
    if (out) fail(id, `walked out of the map through the colliders at ${out.join(', ')} m`);
    note = out ? `${boxes.length} tall colliders, LEAKS` : `${boxes.length} tall colliders, ${n} spots reachable on foot, none outside`;
  }
  console.log(`${failed === before ? 'ok  ' : 'BAD '} ${id} ${W}x${H} — ${cells.length} walkable cells; ${note}`);
}
if (failed) { console.log(`\n${failed} problem(s)`); process.exit(1); }
console.log('\nall maps closed and connected');
