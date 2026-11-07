// Axis-aligned box world: collision for movement and ray casts for bullets/visibility.
import * as THREE from 'three';

export class Box {
  constructor(minX, minY, minZ, maxX, maxY, maxZ, tag = 'wall') {
    this.min = new THREE.Vector3(minX, minY, minZ);
    this.max = new THREE.Vector3(maxX, maxY, maxZ);
    this.tag = tag;
  }
}

const EPS = 0.001;

export class World {
  constructor() {
    this.boxes = [];
    this.bounds = null;
    // Spatial index: boxes bucketed on an 8 m grid in x/z, rebuilt lazily
    // whenever the box list changes, so queries only look at nearby boxes.
    this.cell = 8;
    this.index = null; this.indexed = -1; this.stamp = 0;
  }
  add(box) { this.boxes.push(box); return box; }

  buildIndex() {
    const C = this.cell, idx = new Map();
    for (const b of this.boxes) {
      const x0 = Math.floor(b.min.x / C), x1 = Math.floor(b.max.x / C);
      const z0 = Math.floor(b.min.z / C), z1 = Math.floor(b.max.z / C);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = (x + 4096) * 8192 + (z + 4096);
        let list = idx.get(k);
        if (!list) idx.set(k, list = []);
        list.push(b);
      }
      b._q = 0;
    }
    this.index = idx; this.indexed = this.boxes.length;
  }

  // Boxes whose x/z footprint may touch the given rectangle (each box once).
  near(minX, minZ, maxX, maxZ) {
    if (this.indexed !== this.boxes.length) this.buildIndex();
    const C = this.cell, out = [], st = ++this.stamp;
    const x0 = Math.floor(minX / C), x1 = Math.floor(maxX / C), z0 = Math.floor(minZ / C), z1 = Math.floor(maxZ / C);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const list = this.index.get((x + 4096) * 8192 + (z + 4096));
      if (!list) continue;
      for (const b of list) if (b._q !== st) { b._q = st; out.push(b); }
    }
    return out;
  }

  overlaps(minX, minY, minZ, maxX, maxY, maxZ) {
    for (const b of this.near(minX, minZ, maxX, maxZ)) {
      if (maxX > b.min.x && minX < b.max.x && maxY > b.min.y && minY < b.max.y && maxZ > b.min.z && minZ < b.max.z) return b;
    }
    return null;
  }

  // Moves an upright character AABB (pos = feet centre) along one axis.
  moveAxis(pos, half, height, axis, delta) {
    if (delta === 0) return false;
    pos[axis] += delta;
    let hit = false;
    for (const b of this.near(pos.x - half, pos.z - half, pos.x + half, pos.z + half)) {
      if (pos.x + half > b.min.x && pos.x - half < b.max.x &&
          pos.y + height > b.min.y && pos.y < b.max.y &&
          pos.z + half > b.min.z && pos.z - half < b.max.z) {
        hit = true;
        if (axis === 'y') pos.y = delta > 0 ? b.min.y - height - EPS : b.max.y + EPS;
        else if (delta > 0) pos[axis] = b.min[axis] - half - EPS;
        else pos[axis] = b.max[axis] + half + EPS;
      }
    }
    if (axis === 'y' && pos.y < 0) { pos.y = 0; hit = delta < 0; }
    return hit;
  }

  // Full character move with stair stepping. Returns {onGround, hitX, hitZ}.
  moveCharacter(pos, vel, dt, half, height, stepHeight, wasOnGround) {
    const res = { onGround: false, hitX: false, hitZ: false, hitCeil: false };
    const dx = vel.x * dt, dz = vel.z * dt;
    const start = pos.clone();

    const tryMove = (p) => {
      const hx = this.moveAxis(p, half, height, 'x', dx);
      const hz = this.moveAxis(p, half, height, 'z', dz);
      return { hx, hz };
    };

    const a = pos.clone();
    const ra = tryMove(a);
    if ((ra.hx || ra.hz) && wasOnGround && stepHeight > 0) {
      // try stepping up
      const b = start.clone();
      if (!this.overlaps(b.x - half, b.y + stepHeight, b.z - half, b.x + half, b.y + stepHeight + height, b.z + half)) {
        b.y += stepHeight;
        const rb = tryMove(b);
        // drop back down
        this.moveAxis(b, half, height, 'y', -stepHeight - 0.01);
        const distA = (a.x - start.x) ** 2 + (a.z - start.z) ** 2;
        const distB = (b.x - start.x) ** 2 + (b.z - start.z) ** 2;
        if (distB > distA + 1e-6) { pos.copy(b); res.hitX = rb.hx; res.hitZ = rb.hz; }
        else { pos.copy(a); res.hitX = ra.hx; res.hitZ = ra.hz; }
      } else { pos.copy(a); res.hitX = ra.hx; res.hitZ = ra.hz; }
    } else { pos.copy(a); res.hitX = ra.hx; res.hitZ = ra.hz; }

    if (res.hitX) vel.x = 0;
    if (res.hitZ) vel.z = 0;

    const dy = vel.y * dt;
    const hy = this.moveAxis(pos, half, height, 'y', dy);
    if (hy) {
      if (vel.y <= 0) res.onGround = true; else res.hitCeil = true;
      vel.y = 0;
    }
    // ground probe (keeps us glued while walking down small steps)
    if (!res.onGround && vel.y <= 0) {
      if (pos.y <= EPS * 2 || this.overlaps(pos.x - half, pos.y - 0.02, pos.z - half, pos.x + half, pos.y, pos.z + half)) res.onGround = true;
      else if (wasOnGround) {
        const p = pos.clone();
        if (this.moveAxis(p, half, height, 'y', -stepHeight)) { pos.copy(p); res.onGround = true; }
      }
    }
    return res;
  }

  // Ray vs boxes (slab method). dir must be normalised. Walks the spatial
  // index cell by cell along the ray (2D DDA in x/z) and stops as soon as the
  // closest hit so far is nearer than the next cell.
  // bullet: rays for shots and sight lines. They pass palm colliders (a
  // straight 6 m pole at the base of a leaning tree, so most of it is empty
  // air) and test round props (pots, barrels, tyres, gas bottles) against a
  // box shrunk to their visible size instead of the square box's corners.
  raycast(origin, dir, maxDist = 1000, bullet = false) {
    if (this.indexed !== this.boxes.length) this.buildIndex();
    let best = maxDist, bestBox = null, bestAxis = -1, bestSign = 0;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const ix = 1 / dir.x, iy = 1 / dir.y, iz = 1 / dir.z;
    const st = ++this.stamp, C = this.cell;
    const test = (list) => {
      for (const b0 of list) {
        if (b0._q === st) continue;
        b0._q = st;
        let b = b0;
        if (bullet) {
          if (b0.tag === 'palm') continue;
          if (ROUND[b0.tag]) b = shrunk(b0);
        }
        let t1 = (b.min.x - ox) * ix, t2 = (b.max.x - ox) * ix;
        let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
        t1 = (b.min.y - oy) * iy; t2 = (b.max.y - oy) * iy;
        let ymin = Math.min(t1, t2), ymax = Math.max(t1, t2);
        if (ymin > tmin) { tmin = ymin; axis = 1; }
        tmax = Math.min(tmax, ymax);
        t1 = (b.min.z - oz) * iz; t2 = (b.max.z - oz) * iz;
        let zmin = Math.min(t1, t2), zmax = Math.max(t1, t2);
        if (zmin > tmin) { tmin = zmin; axis = 2; }
        tmax = Math.min(tmax, zmax);
        if (tmax >= Math.max(tmin, 0) && tmin < best && tmin >= 0) {
          best = tmin; bestBox = b0; bestAxis = axis;
          bestSign = axis === 0 ? -Math.sign(dir.x) : axis === 1 ? -Math.sign(dir.y) : -Math.sign(dir.z);
        }
      }
    };
    // 2D DDA over index cells
    let cx = Math.floor(ox / C), cz = Math.floor(oz / C);
    const sx = dir.x > 0 ? 1 : -1, sz = dir.z > 0 ? 1 : -1;
    const hasX = Math.abs(dir.x) > 1e-9, hasZ = Math.abs(dir.z) > 1e-9;
    let tMaxX = hasX ? ((cx + (sx > 0 ? 1 : 0)) * C - ox) / dir.x : Infinity;
    let tMaxZ = hasZ ? ((cz + (sz > 0 ? 1 : 0)) * C - oz) / dir.z : Infinity;
    const tDX = hasX ? C / Math.abs(dir.x) : Infinity, tDZ = hasZ ? C / Math.abs(dir.z) : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      const list = this.index.get((cx + 4096) * 8192 + (cz + 4096));
      if (list) test(list);
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best <= tNext || tNext > maxDist) break;
      if (tMaxX < tMaxZ) { cx += sx; tMaxX += tDX; } else { cz += sz; tMaxZ += tDZ; }
    }
    // ground plane
    if (dir.y < 0) {
      const t = -oy / dir.y;
      if (t < best && t >= 0) { best = t; bestBox = 'ground'; bestAxis = 1; bestSign = 1; }
    }
    if (!bestBox) return null;
    const normal = new THREE.Vector3();
    normal.setComponent(bestAxis, bestSign);
    return { dist: best, box: bestBox, normal, point: origin.clone().addScaledVector(dir, best) };
  }

  lineOfSight(a, b) {
    const d = b.clone().sub(a);
    const len = d.length();
    d.divideScalar(len);
    const h = this.raycast(a, d, len, true);
    return !h || h.dist >= len - 0.05;
  }
}

// Round props: their boxes are inset to roughly the visible width for bullets.
const ROUND = { pot: 0.2, barrel: 0.16, tyres: 0.15, gas: 0.12 };
const _shrunk = new WeakMap();
function shrunk(b) {
  let s = _shrunk.get(b);
  if (!s) {
    const k = ROUND[b.tag], ix = (b.max.x - b.min.x) * k / 2, iz = (b.max.z - b.min.z) * k / 2;
    s = { min: new THREE.Vector3(b.min.x + ix, b.min.y, b.min.z + iz), max: new THREE.Vector3(b.max.x - ix, b.max.y, b.max.z - iz), tag: b.tag };
    _shrunk.set(b, s);
  }
  return s;
}

// Ray vs capsule (segment a-b, radius r); dir normalised. Entry distance or -1.
export function rayCapsule(ro, rd, pa, pb, r) {
  const bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
  const oax = ro.x - pa.x, oay = ro.y - pa.y, oaz = ro.z - pa.z;
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * rd.x + bay * rd.y + baz * rd.z;
  const baoa = bax * oax + bay * oay + baz * oaz, rdoa = rd.x * oax + rd.y * oay + rd.z * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  const h = b * b - a * c;
  if (h >= 0 && a > 1e-9) {
    const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : -1;
  }
  // the end caps
  let best = -1;
  for (const p of [pa, pb]) {
    const ocx = ro.x - p.x, ocy = ro.y - p.y, ocz = ro.z - p.z;
    const b2 = rd.x * ocx + rd.y * ocy + rd.z * ocz, c2 = ocx * ocx + ocy * ocy + ocz * ocz - r * r, h2 = b2 * b2 - c2;
    if (h2 > 0) { const t = -b2 - Math.sqrt(h2); if (t >= 0 && (best < 0 || t < best)) best = t; }
  }
  return best;
}

// Ray vs a single AABB given as min/max arrays; returns entry distance or -1.
export function rayBox(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const oi = i === 0 ? o.x : i === 1 ? o.y : o.z;
    const di = i === 0 ? d.x : i === 1 ? d.y : d.z;
    if (Math.abs(di) < 1e-9) {
      if (oi < min[i] || oi > max[i]) return -1;
    } else {
      let t1 = (min[i] - oi) / di, t2 = (max[i] - oi) / di;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return Math.max(tmin, 0);
}
