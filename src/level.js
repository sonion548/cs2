// Builds render meshes, collision boxes and the navigation grid from a map grid.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Box, World } from './physics.js';
import { surface, letterTexture, rng, grimeTexture, decalAtlas, posterAtlas } from './textures.js';
import { assets } from './assets.js';
import { passable, INTERIOR } from './maps.js';

// BoxGeometry whose UVs are scaled to world units so textures don't stretch.
function worldBox(w, h, d, x, y, z, texScale = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / texScale, uv.getY(i) * dims[f][1] / texScale);
    }
  }
  g.translate(x, y, z);
  return g;
}

function floorQuad(x0, z0, x1, z1, y, texScale = 4) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / texScale, -pos.getZ(i) / texScale);
  return g;
}

// Breaks up tiling: a broad world-space brightness/tint variation from the
// macro texture, a little roughness variation, and (if given) fine grain from
// the detail texture laid over the surface's own UVs.
function vary(mat, macro, detail) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: macro };
    if (detail) sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_BATCHING
  vWPos = (modelMatrix * batchingMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uMacro;${detail ? '\nuniform sampler2D uDetail;' : ''}
varying vec3 vWPos;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 wp = vWPos.xz + vWPos.y * vec2(0.37, 0.61);
  vec3 m = texture2D(uMacro, wp * 0.017).rgb;
  float m2 = texture2D(uMacro, wp * 0.061 + 0.5).g;
  diffuseColor.rgb *= mix(0.8, 1.12, m.r * 0.65 + m2 * 0.35);
  diffuseColor.rgb *= mix(vec3(1.04, 1.0, 0.95), vec3(0.96, 0.99, 1.04), m.b);
${detail ? `#ifdef USE_MAP
  diffuseColor.rgb *= mix(0.88, 1.1, texture2D(uDetail, vMapUv * 5.0).r);
#endif` : ''}
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * mix(0.86, 1.08, texture2D(uMacro, (vWPos.xz + vWPos.y * vec2(0.37, 0.61)) * 0.05).r), 0.04, 1.0);`);
  };
  mat.customProgramCacheKey = () => (detail ? 'vary-d' : 'vary');
}

// Cells bots can path through (crates and raised platforms are treated as obstacles).
const WALKABLE = '.,usABTKhD';
// One floor level (map.levels digit) is this tall: low enough to step up.
export const STEP = 0.45;

export function buildLevel(map, scene, q = {}) {
  const { grid, cell: S, wallHeight: WH } = map;
  const H = grid.length, W = grid[0].length;
  const world = new World();
  const buckets = {}; // material key -> geometries
  const put = (k, g) => (buckets[k] ||= []).push(g);
  const at = (x, z) => (z < 0 || z >= H || x < 0 || x >= W) ? '#' : grid[z][x];
  // floor level per cell (0 when the map has no height layer)
  const lv = map.levels;
  const lvl = (x, z) => (lv && z >= 0 && z < H && x >= 0 && x < W) ? Math.max(0, lv[z].charCodeAt(x) - 48) : 0;
  const fh = (x, z) => lvl(x, z) * STEP;
  const r = rng(1337);

  // Walls: greedy merge of horizontal runs, then vertical merge of identical runs.
  const used = grid.map(row => row.split('').map(() => false));
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (at(x, z) !== '#' || used[z][x]) continue;
      let x1 = x; while (x1 + 1 < W && at(x1 + 1, z) === '#' && !used[z][x1 + 1]) x1++;
      let z1 = z;
      outer: while (z1 + 1 < H) {
        for (let k = x; k <= x1; k++) if (at(k, z1 + 1) !== '#' || used[z1 + 1][k]) break outer;
        z1++;
      }
      for (let zz = z; zz <= z1; zz++) for (let k = x; k <= x1; k++) used[zz][k] = true;
      const minX = x * S, maxX = (x1 + 1) * S, minZ = z * S, maxZ = (z1 + 1) * S;
      // Outer boundary walls are taller to hide the void.
      const border = x === 0 || z === 0 || x1 === W - 1 || z1 === H - 1;
      const h = border ? WH + 3 : WH + (r() < 0.3 ? 1.5 : 0);
      world.add(new Box(minX, 0, minZ, maxX, h, maxZ));
      const w = maxX - minX, d = maxZ - minZ;
      put(r() < 0.5 ? 'sandstone' : 'plaster', worldBox(w, h, d, minX + w / 2, h / 2, minZ + d / 2));
      // trim band at the top + a darker plinth at the bottom
      put('trim', worldBox(w + 0.12, 0.35, d + 0.12, minX + w / 2, h - 0.17, minZ + d / 2, 2));
      put('trim', worldBox(w + 0.06, 0.4, d + 0.06, minX + w / 2, 0.2, minZ + d / 2, 2));
    }
  }

  // Floors, props and tunnels per cell.
  const spawns = { T: [], CT: [] };
  const sites = { A: [], B: [] };
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = at(x, z);
      if (c === '#') continue;
      const x0 = x * S, z0 = z * S, cx = x0 + S / 2, cz = z0 + S / 2;
      let floorMat = 'paving';
      if (c === ',' || c === 'T') floorMat = 'sand';
      if (c === 'A' || c === 'B' || c === '^' || c === 's') floorMat = 'tiles';
      if (c === 'u') floorMat = 'concrete';
      if (INTERIOR.includes(c)) floorMat = 'tiles';
      const fy = fh(x, z);
      put(floorMat, floorQuad(x0, z0, x0 + S, z0 + S, fy));

      if (c === 'T') spawns.T.push(new THREE.Vector3(cx, fy, cz));
      if (c === 'K') spawns.CT.push(new THREE.Vector3(cx, fy, cz));
      if (c === 'A') sites.A.push(new THREE.Vector3(cx, fy, cz));
      if (c === 'B') sites.B.push(new THREE.Vector3(cx, fy, cz));

      if (c === 'c' || c === 'C') {
        const cs = 2.1, ch = c === 'C' ? 2.2 : 1.1;
        world.add(new Box(cx - cs / 2, fy, cz - cs / 2, cx + cs / 2, fy + ch, cz + cs / 2, 'crate'));
        for (let k = 0; k < ch / 1.1; k++) {
          put('crate', worldBox(cs, 1.1, cs, cx, fy + 0.55 + k * 1.1, cz, cs));
        }
      }
      if (c === '^' || c === 's') {
        const h = c === '^' ? 0.9 : 0.45;
        world.add(new Box(x0, fy, z0, x0 + S, fy + h, z0 + S, 'platform'));
        put('tiles', worldBox(S, h, S, cx, fy + h / 2, cz, 4));
      }
      if (INTERIOR.includes(c)) {
        // fallback building: roof mass, and plain walls (door gap on doorway cells) toward the street
        const ceil = 3.4;
        world.add(new Box(x0, ceil, z0, x0 + S, WH, z0 + S, 'ceiling'));
        put('plaster', worldBox(S, WH - ceil, S, cx, (ceil + WH) / 2, cz));
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = at(x + dx, z + dz);
          if (n === '#' || INTERIOR.includes(n)) continue;
          const t = 0.3, ex = dx > 0 ? x0 + S - t : x0, ez = dz > 0 ? z0 + S - t : z0;
          const span = (a0, a1) => dx ? world.add(new Box(ex, 0, z0 + a0, ex + t, ceil, z0 + a1)) : world.add(new Box(x0 + a0, 0, ez, x0 + a1, ceil, ez + t));
          if (c === 'D') { span(0, S / 2 - 0.8); span(S / 2 + 0.8, S); } else span(0, S);
        }
      }
      if (c === 'u') {
        const ceil = 3.4;
        world.add(new Box(x0, ceil, z0, x0 + S, WH, z0 + S, 'ceiling'));
        put('concrete', worldBox(S, WH - ceil, S, cx, (ceil + WH) / 2, cz));
        // ceiling beam
        if (z % 2 === 0) put('metal', worldBox(S, 0.25, 0.3, cx, ceil - 0.12, cz, 2));
      }
    }
  }

  // Raised floors (merged into as few boxes as possible) and stairs wherever a
  // walkable cell meets one exactly one level higher.
  if (lv) {
    const done = grid.map(row => row.split('').map(() => false));
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const L = lvl(x, z);
      if (done[z][x] || L <= 0 || at(x, z) === '#') continue;
      let x1 = x; while (x1 + 1 < W && !done[z][x1 + 1] && at(x1 + 1, z) !== '#' && lvl(x1 + 1, z) === L) x1++;
      let z1 = z;
      grow: while (z1 + 1 < H) {
        for (let k = x; k <= x1; k++) if (done[z1 + 1][k] || at(k, z1 + 1) === '#' || lvl(k, z1 + 1) !== L) break grow;
        z1++;
      }
      for (let zz = z; zz <= z1; zz++) for (let k = x; k <= x1; k++) done[zz][k] = true;
      const h = L * STEP, minX = x * S, maxX = (x1 + 1) * S, minZ = z * S, maxZ = (z1 + 1) * S;
      world.add(new Box(minX, 0, minZ, maxX, h, maxZ, 'floor'));
      put('trim', worldBox(maxX - minX, h - 0.01, maxZ - minZ, (minX + maxX) / 2, (h - 0.01) / 2, (minZ + maxZ) / 2, 2));
    }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!WALKABLE.includes(at(x, z))) continue;
      const lo = fh(x, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!WALKABLE.includes(at(x + dx, z + dz)) || lvl(x + dx, z + dz) - lvl(x, z) !== 1) continue;
        // two 0.15 m steps inside the lower cell, against the shared edge
        for (const [d0, d1, sh] of [[0, 0.3, 0.3], [0.3, 0.6, 0.15]]) {
          let bx0, bx1, bz0, bz1;
          if (dx) { const e = dx > 0 ? (x + 1) * S : x * S; bx0 = dx > 0 ? e - d1 : e + d0; bx1 = dx > 0 ? e - d0 : e + d1; bz0 = z * S; bz1 = (z + 1) * S; }
          else { const e = dz > 0 ? (z + 1) * S : z * S; bz0 = dz > 0 ? e - d1 : e + d0; bz1 = dz > 0 ? e - d0 : e + d1; bx0 = x * S; bx1 = (x + 1) * S; }
          world.add(new Box(bx0, 0, bz0, bx1, lo + sh, bz1, 'stair'));
          put('trim', worldBox(bx1 - bx0, lo + sh, bz1 - bz0, (bx0 + bx1) / 2, (lo + sh) / 2, (bz0 + bz1) / 2, 2));
        }
      }
    }
  }

  // Assorted cover props along walls in open areas (deterministic).
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      const c = at(x, z);
      if (c !== '.' && c !== ',') continue;
      if (r() > 0.07) continue;
      const nearWall = at(x + 1, z) === '#' || at(x - 1, z) === '#' || at(x, z + 1) === '#' || at(x, z - 1) === '#';
      if (!nearWall) continue;
      // push the prop against the wall
      let px = x * S + S / 2, pz = z * S + S / 2;
      if (at(x + 1, z) === '#') px += S / 2 - 0.6; else if (at(x - 1, z) === '#') px -= S / 2 - 0.6;
      else if (at(x, z + 1) === '#') pz += S / 2 - 0.6; else pz -= S / 2 - 0.6;
      // barrel
      const by = fh(x, z);
      const g = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 24);
      g.translate(px, by + 0.6, pz);
      put('barrel', g);
      world.add(new Box(px - 0.42, by, pz - 0.42, px + 0.42, by + 1.2, pz + 0.42, 'barrel'));
    }
  }

  // Materials (colour + generated normal maps)
  const aniso = q.anisotropy ?? 4;
  const sharpen = (t) => { if (t && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; } return t; };
  const surf = (name, seed, opts = {}) => {
    const t = surface(name, seed);
    return new THREE.MeshStandardMaterial({ map: sharpen(t.map), normalMap: sharpen(t.normalMap), normalScale: new THREE.Vector2(1, 1).multiplyScalar(opts.ns ?? 1), roughness: opts.rough ?? 0.92, metalness: opts.metal ?? 0, color: opts.color ?? 0xffffff });
  };
  const plain = (color, rough = 0.9, metal = 0, side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side });
  // stains, grime and paper on top of other surfaces: no depth writes, pulled
  // toward the camera so they never flicker against what they sit on
  const decalMat = (map, opacity = 1) => new THREE.MeshStandardMaterial({
    map: sharpen(map), transparent: true, opacity, depthWrite: false, roughness: 0.95, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mats = {
    sandstone: surf('sandstone', 1, { ns: 1.4 }),
    plaster: surf('plaster', 1, { ns: 1.2 }),
    trim: surf('wallTrim', 1, { ns: 1.2 }),
    paving: surf('paving', 1, { ns: 1.4, rough: 0.88 }),
    sand: surf('sand', 1, { ns: 1, rough: 1 }),
    tiles: surf('tiles', 1, { ns: 1.1, rough: 0.7 }),
    concrete: surf('concrete', 1, { ns: 1 }),
    crate: surf('crate', 1, { ns: 1.3, rough: 0.85 }),
    metal: surf('metal', 1, { rough: 0.55, metal: 0.15 }),
    barrel: surf('metal', 3, { rough: 0.6, metal: 0.1, color: 0x7aa070 }),
    stone: surf('sandstone', 1, { ns: 1.6, color: 0xe8dccb }),
    wood: surf('crate', 2, { ns: 1.2, rough: 0.8, color: 0xd8b48a }),
    darkwood: surf('crate', 3, { ns: 1.2, rough: 0.85, color: 0x6a4a32 }),
    iron: plain(0x2a2b2d, 0.55, 0.6),
    glass: plain(0x0c1014, 0.15, 0.4),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 1.6 }),
    cloth_red: plain(0x9a2a1e, 0.95, 0, THREE.DoubleSide),
    cloth_blue: plain(0x24406e, 0.95, 0, THREE.DoubleSide),
    cloth_sand: plain(0xb89a68, 0.95, 0, THREE.DoubleSide),
    leaf: plain(0x4f6b2a, 0.8, 0, THREE.DoubleSide),
    terracotta: surf('plaster', 1, { ns: 0.8, rough: 0.85, color: 0xc0704a }),
    // street clutter and fixtures
    paint: plain(0xd2cbbb, 0.6, 0.1),
    paint_blue: plain(0x5d7d9c, 0.55, 0.15),
    paint_red: plain(0xa04a3a, 0.55, 0.15),
    rubber: plain(0x1c1c1e, 0.92),
    cardboard: plain(0xa47d4c, 0.96),
    paper: plain(0xa9a08b, 0.95, 0, THREE.DoubleSide),
    grime: decalMat(grimeTexture(), 1),
    dirt: decalMat(grimeTexture(), 1),
    decal: decalMat(decalAtlas()),
    poster: decalMat(posterAtlas()),
  };
  // World-space variation (and close-up grain on better settings) over every
  // solid surface, so repeated tiles don't line up into an obvious pattern.
  const macro = surface('macro', 1).map, detail = q.key === 'low' ? null : surface('detail', 1).map;
  for (const [k, m] of Object.entries(mats)) {
    m.name = k;
    if (m.transparent || k === 'lamp' || k === 'glass') continue;
    vary(m, macro, detail);
  }

  const group = new THREE.Group();
  for (const [k, geos] of Object.entries(buckets)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats[k]);
    mesh.castShadow = k !== 'sand' && k !== 'paving';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Site letters painted on a nearby wall face (we paint them on the floor at site centroid).
  for (const L of ['A', 'B']) {
    if (!sites[L].length) continue;
    const c = sites[L].reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(sites[L].length);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5),
      new THREE.MeshStandardMaterial({ map: letterTexture(L), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(c.x, c.y + 0.02, c.z);
    m.receiveShadow = true; m.userData.keep = true;
    group.add(m);
    sites[L].center = c;
  }
  scene.add(group);

  // Blender-built map: swap in its detailed meshes and its exported colliders
  // (same layout as the grid, so nav/spawns/sites above still apply).
  const key = (map.id || map.name || '').toLowerCase();
  let pvs = null;
  if (assets.maps[key] && assets.colliders[key]) {
    for (const ch of [...group.children]) if (!ch.userData.keep) { group.remove(ch); ch.geometry?.dispose(); }
    const model = assets.maps[key].clone(true);
    // Low: leave out the biggest see-through layers (wall grime, floor dirt) to save fill rate
    if (q.key === 'low') {
      const drop = [];
      model.traverse(o => { if (o.isMesh && /^(grime|dirt)(\.\d+)?$/.test(o.material?.name || '')) drop.push(o); });
      drop.forEach(o => o.removeFromParent());
    }
    model.traverse(o => {
      if (!o.isMesh) return;
      const name = (o.material?.name || '').replace(/\.\d+$/, '');
      o.material = mats[name] || mats.sandstone;
      o.castShadow = !['sand', 'paving', 'tiles', 'concrete', 'glass', 'lamp', 'grime', 'dirt', 'decal', 'poster', 'paper'].includes(name);
      o.receiveShadow = true;
    });
    const chunks = chunked(model, CHUNK, WH - 0.6);
    group.add(chunks);
    const t0 = performance.now();
    pvs = buildPVS(grid, S, chunks);
    pvs.ms = Math.round(performance.now() - t0);
    world.boxes.length = 0;
    for (const [x0, y0, z0, x1, y1, z1, tag] of assets.colliders[key]) world.add(new Box(x0, y0, z0, x1, y1, z1, tag));
  }

  // Safety net: a solid boundary just outside the grid, full height, so no gap
  // in a map's walls can ever let anyone walk out into the desert.
  {
    const X = W * S, Z = H * S, t = 2, top = WH + 30;
    world.add(new Box(-t, -1, -t, X + t, top, 0, 'bounds'));
    world.add(new Box(-t, -1, Z, X + t, top, Z + t, 'bounds'));
    world.add(new Box(-t, -1, 0, 0, top, Z, 'bounds'));
    world.add(new Box(X, -1, 0, X + t, top, Z, 'bounds'));
  }

  // Navigation grid: one node per walkable cell.
  const nav = {
    W, H, S,
    walkable: (x, z) => WALKABLE.includes(at(x, z)),
    // building walls only open at doorways; you can step up one level, or drop down any amount
    passable: (x0, z0, x1, z1) => passable(at(x0, z0), at(x1, z1)) && lvl(x1, z1) - lvl(x0, z0) <= 1,
    cost: (x, z) => (at(x, z) === 'u' ? 1.2 : 1),
    cellOf: (p) => [Math.floor(p.x / S), Math.floor(p.z / S)],
    center: (x, z) => new THREE.Vector3(x * S + S / 2, fh(x, z), z * S + S / 2),
    level: lvl,
    at,
  };

  const heightAt = (p) => fh(Math.floor(p.x / S), Math.floor(p.z / S));
  return { world, group, spawns, sites, nav, heightAt, pvs, width: W * S, depth: H * S };
}

// A* on the nav grid (8-connected, no corner cutting).
export function findPath(nav, from, to) {
  const [sx, sz] = nav.cellOf(from), [tx, tz] = nav.cellOf(to);
  const key = (x, z) => z * nav.W + x;
  if (!nav.walkable(tx, tz)) return null;
  // A* with a binary heap of [f, key]; stale entries are skipped when popped
  const heap = [[0, key(sx, sz)]];
  const push = (e) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const g = new Map([[key(sx, sz), 0]]);
  const done = new Set();
  const came = new Map();
  const h = (x, z) => Math.hypot(x - tx, z - tz);
  while (heap.length) {
    const [, kk] = pop();
    if (done.has(kk)) continue;
    done.add(kk);
    const x = kk % nav.W, z = Math.floor(kk / nav.W);
    if (x === tx && z === tz) break;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!nav.walkable(nx, nz)) continue;
      if (dx && dz && (!nav.walkable(x + dx, z) || !nav.walkable(x, z + dz))) continue;
      // building walls: only cross between inside and outside through doorways, and never diagonally
      if (nav.passable && !nav.passable(x, z, nx, nz)) continue;
      if (dx && dz && nav.passable && (!nav.passable(x, z, x + dx, z) || !nav.passable(x, z, x, z + dz) || !nav.passable(x + dx, z, nx, nz) || !nav.passable(x, z + dz, nx, nz))) continue;
      const k = key(nx, nz);
      if (done.has(k)) continue;
      const ng = g.get(kk) + Math.hypot(dx, dz) * nav.cost(nx, nz);
      if (!g.has(k) || ng < g.get(k)) {
        g.set(k, ng); came.set(k, kk);
        push([ng + h(nx, nz), k]);
      }
    }
  }
  let k = key(tx, tz);
  if (!came.has(k) && k !== key(sx, sz)) return null;
  const path = [];
  while (k !== undefined && k !== key(sx, sz)) {
    path.push(nav.center(k % nav.W, Math.floor(k / nav.W)));
    k = came.get(k);
  }
  path.reverse();
  if (path.length) path[path.length - 1] = to.clone();
  return path;
}


// Split a model's meshes into square chunks (per material), so the renderer
// can skip whatever is outside the view instead of drawing the whole map
// every frame. Geometry stays indexed; each chunk keeps only the vertices it uses.
const CHUNK = 24;

function chunked(model, size, highY = Infinity) {
  model.updateMatrixWorld(true);
  const out = new THREE.Group();
  const meshes = [];
  model.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    if (!geo.index) {
      const n = geo.attributes.position.count;
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    const index = geo.index.array, pos = geo.attributes.position.array;
    const tris = index.length / 3;
    // small materials (lamps, glass, cloth, leaves) aren't worth extra draw calls: keep them whole
    if (tris < 6000) {
      const m = new THREE.Mesh(geo, mesh.material);
      m.castShadow = mesh.castShadow; m.receiveShadow = mesh.receiveShadow;
      m.matrixAutoUpdate = false; m.userData.high = true;
      out.add(m);
      continue;
    }
    const buckets = new Map();
    for (let t = 0; t < tris; t++) {
      const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
      const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      const cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
      // parts above the wall tops (roofs, domes, towers) stay drawn from anywhere, and so do
      // triangles that reach across chunk borders (long wall faces, big floors)
      const fx0 = Math.floor(Math.min(pos[a], pos[b], pos[c]) / size), fx1 = Math.floor(Math.max(pos[a], pos[b], pos[c]) / size);
      const fz0 = Math.floor(Math.min(pos[a + 2], pos[b + 2], pos[c + 2]) / size), fz1 = Math.floor(Math.max(pos[a + 2], pos[b + 2], pos[c + 2]) / size);
      const always = cy > highY || fx0 !== fx1 || fz0 !== fz1;
      const k = ((Math.floor(cx / size) + 64) * 4096 + (Math.floor(cz / size) + 64)) * 2 + (always ? 1 : 0);
      let list = buckets.get(k);
      if (!list) buckets.set(k, list = []);
      list.push(t);
    }
    const names = Object.keys(geo.attributes);
    const parts = [];
    for (const [bk, list] of buckets) {
      const remap = new Map();
      const newIndex = new Uint32Array(list.length * 3);
      let nv = 0;
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < 3; j++) {
          const v = index[list[i] * 3 + j];
          let m = remap.get(v);
          if (m === undefined) { m = nv++; remap.set(v, m); }
          newIndex[i * 3 + j] = m;
        }
      }
      const part = new THREE.BufferGeometry();
      for (const name of names) {
        const src = geo.attributes[name], isz = src.itemSize;
        const arr = new src.array.constructor(nv * isz);
        for (const [o, m] of remap) for (let k = 0; k < isz; k++) arr[m * isz + k] = src.array[o * isz + k];
        part.setAttribute(name, new THREE.BufferAttribute(arr, isz, src.normalized));
      }
      part.setIndex(new THREE.BufferAttribute(newIndex, 1));
      const cell = Math.floor(bk / 2);
      parts.push({ geo: part, chunk: [Math.floor(cell / 4096) - 64, cell % 4096 - 64], high: bk % 2 === 1, nv, ni: newIndex.length });
    }
    // all the chunks of this material in one batched mesh: one draw call,
    // and each chunk can be hidden on its own
    const totalV = parts.reduce((a, p) => a + p.nv, 0), totalI = parts.reduce((a, p) => a + p.ni, 0);
    const batch = new THREE.BatchedMesh(parts.length, totalV, totalI, mesh.material);
    batch.castShadow = mesh.castShadow; batch.receiveShadow = mesh.receiveShadow;
    batch.userData.instances = [];
    for (const p of parts) {
      const gid = batch.addGeometry(p.geo);
      const iid = batch.addInstance(gid);
      batch.userData.instances.push({ id: iid, chunk: p.chunk, high: p.high });
      p.geo.dispose();
    }
    out.add(batch);
    geo.dispose();
  }
  return out;
}


// Potentially visible sets for a grid map: from every walkable cell, a fan of
// rays through the grid (walls '#' stop them) finds the cells that can be
// seen; the map chunks holding those cells (and their neighbours, to be
// safe) are drawn, the rest skipped. Things above the wall tops are never
// culled this way, so the skyline doesn't pop.
function buildPVS(grid, S, chunks) {
  const H = grid.length, W = grid[0].length;
  const CW = Math.ceil(W * S / CHUNK), CH = Math.ceil(H * S / CHUNK);
  const nC = CW * CH;
  const blocks = (x, z) => x < 0 || z < 0 || x >= W || z >= H || grid[z][x] === '#';
  const open = (x, z) => !blocks(x, z);
  const chunkOf = (x, z) => Math.floor(z * S / CHUNK) * CW + Math.floor(x * S / CHUNK);
  const sets = new Array(W * H).fill(null);
  const RAYS = 540;
  const dirs = [];
  for (let i = 0; i < RAYS; i++) { const a = (i / RAYS) * Math.PI * 2; dirs.push([Math.cos(a), Math.sin(a)]); }
  const seen = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!open(x, z)) continue;
    seen.fill(0);
    for (const [ox, oz] of [[0.5, 0.5], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
      const px = x + ox, pz = z + oz;
      for (const [dx, dz] of dirs) {
        // grid traversal (Amanatides & Woo)
        let cx = x, cz = z;
        const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
        const tdx = Math.abs(1 / dx), tdz = Math.abs(1 / dz);
        let tx = dx > 0 ? (cx + 1 - px) * tdx : (px - cx) * tdx;
        let tz = dz > 0 ? (cz + 1 - pz) * tdz : (pz - cz) * tdz;
        for (let n = 0; n < 400; n++) {
          if (cx >= 0 && cz >= 0 && cx < W && cz < H) seen[cz * W + cx] = 1;
          if (blocks(cx, cz)) break;
          if (tx < tz) { tx += tdx; cx += sx; } else { tz += tdz; cz += sz; }
        }
      }
    }
    const vis = new Uint8Array(nC);
    for (let zz = 0; zz < H; zz++) for (let xx = 0; xx < W; xx++) {
      if (!seen[zz * W + xx]) continue;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const nx = xx + a, nz = zz + b;
        if (nx >= 0 && nz >= 0 && nx < W && nz < H) vis[chunkOf(nx, nz)] = 1;
      }
    }
    sets[z * W + x] = vis;
  }
  const parts = [];
  chunks.traverse(o => {
    // geometry just outside the grid (outer faces of the boundary walls) belongs to the edge chunks
    const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
    for (const it of o.userData.instances || []) if (!it.high) parts.push([o, it.id, cl(it.chunk[1], CH) * CW + cl(it.chunk[0], CW)]);
  });
  let last = -2;
  return {
    // camera position -> which chunks to draw (all of them from outside the walkable grid)
    update(pos) {
      const x = Math.floor(pos.x / S), z = Math.floor(pos.z / S);
      const k = x >= 0 && z >= 0 && x < W && z < H && sets[z * W + x] ? z * W + x : -1;
      if (k === last) return;
      last = k;
      const vis = k >= 0 ? sets[k] : null;
      for (const [b, id, c] of parts) b.setVisibleAt(id, !vis || !!vis[c]);
    },
    stats() { return { cells: sets.filter(Boolean).length, chunks: nC }; },
  };
}
