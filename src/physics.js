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
  }
  add(box) { this.boxes.push(box); return box; }

  overlaps(minX, minY, minZ, maxX, maxY, maxZ) {
    for (const b of this.boxes) {
      if (maxX > b.min.x && minX < b.max.x && maxY > b.min.y && minY < b.max.y && maxZ > b.min.z && minZ < b.max.z) return b;
    }
    return null;
  }

  // Moves an upright character AABB (pos = feet centre) along one axis.
  moveAxis(pos, half, height, axis, delta) {
    if (delta === 0) return false;
    pos[axis] += delta;
    let hit = false;
    for (const b of this.boxes) {
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

  // Ray vs boxes (slab method). dir must be normalised.
  raycast(origin, dir, maxDist = 1000) {
    let best = maxDist, bestBox = null, bestAxis = -1, bestSign = 0;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const ix = 1 / dir.x, iy = 1 / dir.y, iz = 1 / dir.z;
    for (const b of this.boxes) {
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
        best = tmin; bestBox = b; bestAxis = axis;
        bestSign = axis === 0 ? -Math.sign(dir.x) : axis === 1 ? -Math.sign(dir.y) : -Math.sign(dir.z);
      }
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
    const h = this.raycast(a, d, len);
    return !h || h.dist >= len - 0.05;
  }
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
