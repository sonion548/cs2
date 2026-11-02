// Builds render meshes, collision boxes and the navigation grid from a map grid.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Box, World } from './physics.js';
import { surface, letterTexture, rng } from './textures.js';
import { assets } from './assets.js';

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

// Cells bots can path through (crates and raised platforms are treated as obstacles).
const WALKABLE = '.,usABTK';

export function buildLevel(map, scene) {
  const { grid, cell: S, wallHeight: WH } = map;
  const H = grid.length, W = grid[0].length;
  const world = new World();
  const buckets = {}; // material key -> geometries
  const put = (k, g) => (buckets[k] ||= []).push(g);
  const at = (x, z) => (z < 0 || z >= H || x < 0 || x >= W) ? '#' : grid[z][x];
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
      put(floorMat, floorQuad(x0, z0, x0 + S, z0 + S, 0));

      if (c === 'T') spawns.T.push(new THREE.Vector3(cx, 0, cz));
      if (c === 'K') spawns.CT.push(new THREE.Vector3(cx, 0, cz));
      if (c === 'A') sites.A.push(new THREE.Vector3(cx, 0, cz));
      if (c === 'B') sites.B.push(new THREE.Vector3(cx, 0, cz));

      if (c === 'c' || c === 'C') {
        const cs = 2.1, ch = c === 'C' ? 2.2 : 1.1;
        world.add(new Box(cx - cs / 2, 0, cz - cs / 2, cx + cs / 2, ch, cz + cs / 2, 'crate'));
        for (let k = 0; k < ch / 1.1; k++) {
          put('crate', worldBox(cs, 1.1, cs, cx, 0.55 + k * 1.1, cz, cs));
        }
      }
      if (c === '^' || c === 's') {
        const h = c === '^' ? 0.9 : 0.45;
        world.add(new Box(x0, 0, z0, x0 + S, h, z0 + S, 'platform'));
        put('tiles', worldBox(S, h, S, cx, h / 2, cz, 4));
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
      const g = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 24);
      g.translate(px, 0.6, pz);
      put('barrel', g);
      world.add(new Box(px - 0.42, 0, pz - 0.42, px + 0.42, 1.2, pz + 0.42, 'barrel'));
    }
  }

  // Materials (colour + generated normal maps)
  const surf = (name, seed, opts = {}) => {
    const t = surface(name, seed);
    return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1, 1).multiplyScalar(opts.ns ?? 1), roughness: opts.rough ?? 0.92, metalness: opts.metal ?? 0, color: opts.color ?? 0xffffff });
  };
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
    stone: surf('sandstone', 2, { ns: 1.6, color: 0xe8dccb }),
    wood: surf('crate', 2, { ns: 1.2, rough: 0.8, color: 0xd8b48a }),
    darkwood: surf('crate', 3, { ns: 1.2, rough: 0.85, color: 0x6a4a32 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.55, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.15, metalness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 1.6 }),
    cloth_red: new THREE.MeshStandardMaterial({ color: 0x9a2a1e, roughness: 0.95, side: THREE.DoubleSide }),
    cloth_blue: new THREE.MeshStandardMaterial({ color: 0x24406e, roughness: 0.95, side: THREE.DoubleSide }),
  };


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
    m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.02, c.z);
    m.receiveShadow = true; m.userData.keep = true;
    group.add(m);
    sites[L].center = c;
  }
  scene.add(group);

  // Blender-built map: swap in its detailed meshes and its exported colliders
  // (same layout as the grid, so nav/spawns/sites above still apply).
  const key = (map.id || map.name || '').toLowerCase();
  if (assets.maps[key] && assets.colliders[key]) {
    for (const ch of [...group.children]) if (!ch.userData.keep) { group.remove(ch); ch.geometry?.dispose(); }
    const model = assets.maps[key].clone(true);
    model.traverse(o => {
      if (!o.isMesh) return;
      const name = (o.material?.name || '').replace(/\.\d+$/, '');
      o.material = mats[name] || mats.sandstone;
      o.castShadow = !['sand', 'paving', 'tiles', 'concrete', 'glass', 'lamp'].includes(name);
      o.receiveShadow = true;
    });
    group.add(model);
    world.boxes.length = 0;
    for (const [x0, y0, z0, x1, y1, z1, tag] of assets.colliders[key]) world.add(new Box(x0, y0, z0, x1, y1, z1, tag));
  }

  // Navigation grid: one node per walkable cell.
  const nav = {
    W, H, S,
    walkable: (x, z) => WALKABLE.includes(at(x, z)),
    cost: (x, z) => (at(x, z) === 'u' ? 1.2 : 1),
    cellOf: (p) => [Math.floor(p.x / S), Math.floor(p.z / S)],
    center: (x, z) => new THREE.Vector3(x * S + S / 2, 0, z * S + S / 2),
    at,
  };

  return { world, group, spawns, sites, nav, width: W * S, depth: H * S };
}

// A* on the nav grid (8-connected, no corner cutting).
export function findPath(nav, from, to) {
  const [sx, sz] = nav.cellOf(from), [tx, tz] = nav.cellOf(to);
  const key = (x, z) => z * nav.W + x;
  if (!nav.walkable(tx, tz)) return null;
  const open = [[0, sx, sz]];
  const g = new Map([[key(sx, sz), 0]]);
  const came = new Map();
  const h = (x, z) => Math.hypot(x - tx, z - tz);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, x, z] = open.splice(bi, 1)[0];
    if (x === tx && z === tz) break;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!nav.walkable(nx, nz)) continue;
      if (dx && dz && (!nav.walkable(x + dx, z) || !nav.walkable(x, z + dz))) continue;
      const ng = g.get(key(x, z)) + Math.hypot(dx, dz) * nav.cost(nx, nz);
      const k = key(nx, nz);
      if (!g.has(k) || ng < g.get(k)) {
        g.set(k, ng); came.set(k, key(x, z));
        open.push([ng + h(nx, nz), nx, nz]);
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
