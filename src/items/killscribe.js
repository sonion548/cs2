// Killscribe: the kill counter some finishes come with (about one drop in
// ten). It counts confirmed kills made with the weapon while it's equipped,
// and it's on the weapon itself. On a gun it's a small readout clipped to the
// left of the receiver (the side you see in your hands), amber seven-segment
// digits glowing in a dark window under the Killscribe name. On a knife the
// count is etched into the flat of the blade near the guard, on both faces,
// frosted into the steel with a dark groove round each figure so it reads on
// any finish. The number goes up in your hands as you get kills (set()).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

export const KILLSCRIBE = 'Killscribe';

// ---------------------------------------------------------------- readout
// Seven-segment digits: segments a-g as bevelled bars, lit or faint.
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function segDigit(x, c, l, t, w, h, on, dimOn) {
  const th = w * 0.17, sl = w * 0.12;          // bar thickness, italic slant
  const bar = (x0, y0, x1, y1) => {
    // a bar from (x0,y0) to (x1,y1) with pointed ends, slanted
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len * th / 2, ny = dx / len * th / 2;
    const ux = dx / len * th / 2, uy = dy / len * th / 2;
    const sk = (px, py) => [px + sl * (1 - (py - t) / h), py];
    const pts = [[x0 + ux, y0 + uy], [x0 + ux * 2 + nx, y0 + uy * 2 + ny], [x1 - ux * 2 + nx, y1 - uy * 2 + ny], [x1 - ux, y1 - uy], [x1 - ux * 2 - nx, y1 - uy * 2 - ny], [x0 + ux * 2 - nx, y0 + uy * 2 - ny]].map(p => sk(...p));
    x.beginPath(); x.moveTo(...pts[0]); for (const p of pts.slice(1)) x.lineTo(...p); x.closePath(); x.fill();
  };
  const L = l + th / 2, R = l + w - th / 2, T = t + th / 2, M = t + h / 2, B = t + h - th / 2;
  const segs = { a: [L, T, R, T], b: [R, T, R, M], c: [R, M, R, B], d: [L, B, R, B], e: [L, M, L, B], f: [L, T, L, M], g: [L, M, R, M] };
  for (const [k, s] of Object.entries(segs)) {
    const lit = on.includes(k);
    x.fillStyle = lit ? c : dimOn;
    x.shadowBlur = lit ? h * 0.12 : 0; x.shadowColor = c;
    bar(...s);
  }
  x.shadowBlur = 0;
}

// The readout's face: the name across the top, six digits below, unused
// leading digits showing as faint segments like a real counter.
function drawReadout(cv, n) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.fillStyle = '#0d0a07'; x.fillRect(0, 0, W, H);
  // window glass: a faint sheen at the top
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,170,90,0.10)'); g.addColorStop(0.4, 'rgba(255,170,90,0.02)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ff9a3c'; x.font = `700 ${Math.round(H * 0.17)}px Barlow, "Arial Narrow", Arial, sans-serif`;
  x.textBaseline = 'top';
  x.fillText('KILLSCRIBE', W * 0.045, H * 0.06);
  const lab = x.measureText('KILLSCRIBE').width;
  x.fillStyle = 'rgba(255,154,60,0.45)'; x.fillRect(W * 0.045 + lab + W * 0.03, H * 0.13, W * 0.91 - lab - W * 0.03, Math.max(1, H * 0.02));
  const s = String(Math.max(0, Math.min(99999, n | 0))).padStart(5, ' ');
  const dw = W * 0.155, gap = W * 0.034, top = H * 0.3, dh = H * 0.62;
  for (let i = 0; i < 5; i++) {
    const ch = s[i];
    segDigit(x, '#ffb347', W * 0.055 + i * (dw + gap), top, dw, dh, ch === ' ' ? '' : SEG[ch], 'rgba(255,140,40,0.1)');
  }
}

// ---------------------------------------------------------------- etching
// The count as it's etched: frosted light figures with a dark groove edge,
// and a small "KILLSCRIBE" beneath. Alpha carries the shape; the normal map
// (from the same shape) makes the light catch the groove walls.
function drawEtch(cv, n) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  const s = String(Math.max(0, n | 0));
  const big = Math.round(H * 0.76), small = Math.round(H * 0.15);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.font = `800 ${big}px Barlow, "Arial Narrow", Arial, sans-serif`;
  const tw = x.measureText(s).width, sx = Math.min(1, (W * 0.94) / tw);
  x.save(); x.translate(W / 2, H * 0.76); x.scale(sx, 1);
  x.lineJoin = 'round';
  x.strokeStyle = 'rgba(14,15,17,0.95)'; x.lineWidth = big * 0.13; x.strokeText(s, 0, 0);
  x.fillStyle = 'rgba(226,231,236,0.96)'; x.fillText(s, 0, 0);
  x.restore();
  x.font = `700 ${small}px Barlow, "Arial Narrow", Arial, sans-serif`;
  x.strokeStyle = 'rgba(14,15,17,0.9)'; x.lineWidth = small * 0.22; x.strokeText('KILLSCRIBE', W / 2, H * 0.96);
  x.fillStyle = 'rgba(226,231,236,0.9)'; x.fillText('KILLSCRIBE', W / 2, H * 0.96);
}
// A normal map from a canvas's alpha: the figures read as cut into the surface.
function normalFromAlpha(src, out) {
  const W = src.width, H = src.height, a = src.getContext('2d').getImageData(0, 0, W, H).data;
  const o = out.getContext('2d'), img = o.createImageData(W, H), d = img.data;
  const at = (i, j) => a[((Math.min(H - 1, Math.max(0, j)) * W) + Math.min(W - 1, Math.max(0, i))) * 4 + 3] / 255;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    // height = -alpha (cut in); slope from neighbours
    const gx = (at(i + 1, j) - at(i - 1, j)) * 1.6, gy = (at(i, j + 1) - at(i, j - 1)) * 1.6;
    const nx = gx, ny = -gy, nz = 1, l = Math.hypot(nx, ny, nz), k = (j * W + i) * 4;
    d[k] = (nx / l * 0.5 + 0.5) * 255; d[k + 1] = (ny / l * 0.5 + 0.5) * 255; d[k + 2] = (nz / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  o.putImageData(img, 0, 0);
}

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---------------------------------------------------------------- placing
// Where a gun's readout goes, in its authoring space (+X out of the muzzle,
// +Y up, the left side is -Z): forward of the grip and up on the receiver,
// clear of the thumb, unless a weapon has its own spot.
const SPOT = {
  glock: [0.075, 0.012, 0.68], usp: [0.078, 0.01, 0.68], m1911: [0.075, 0.012, 0.68], fiveseven: [0.075, 0.012, 0.68],
  deagle: [0.09, 0.016, 0.75], revolver: [0.15, 0.045, 0.56], vz61: [0.05, 0.035, 0.7], mac10: [0.055, 0.02, 0.85],
};
function gunSpot(gun, weapon) {
  const g = gun.userData.grip || new THREE.Vector3();
  const gx = -g.z, gy = g.y;                    // the grip anchor in authoring space
  const s = SPOT[weapon];
  return s ? { x: gx + s[0], y: gy + s[1] + 0.04, scale: s[2] } : { x: gx + 0.12, y: gy + 0.08, scale: 1.3 };
}

const ray = new THREE.Raycaster();
function attachReadout(gun, weapon, n) {
  const inner = gun.userData.inner;
  inner.updateMatrixWorld(true);
  const targets = [];
  inner.traverse(o => { if (o.isMesh && !o.userData.killscribe && o.userData.part !== 'sticker') targets.push(o); });
  const want = gunSpot(gun, weapon);
  // find the receiver's left face there (or near it): cast from the left
  const toInner = inner.matrixWorld.clone().invert();
  let hit = null, on = null;
  for (const [dx, dy] of [[0, 0], [-0.015, 0], [0.015, 0], [0, -0.012], [0, 0.012], [-0.03, -0.01], [0.03, -0.01], [0, -0.024]]) {
    const o = new THREE.Vector3(want.x + dx, want.y + dy, -1).applyMatrix4(inner.matrixWorld);
    ray.set(o, new THREE.Vector3(0, 0, 1).transformDirection(inner.matrixWorld));
    const h = ray.intersectObjects(targets, false)[0];
    if (h) { hit = h.point.applyMatrix4(toInner); on = h.object; break; }
  }
  if (!hit) return null;
  const S = want.scale, W = 0.062 * S, H = 0.026 * S, D = 0.008 * S;
  const grp = new THREE.Group();
  grp.userData.killscribe = true;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 2, 0.0018 * S), new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55, metalness: 0.3 }));
  body.userData.killscribe = true;
  grp.add(body);
  // a thin bright rim round the window
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, H * 0.78), new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.4, metalness: 0.6 }));
  rim.position.z = -D / 2 - 0.0002; rim.rotation.y = Math.PI; rim.userData.killscribe = true;
  grp.add(rim);
  const cv = canvas(512, 190);
  drawReadout(cv, n);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, H * 0.7), new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.0,
  }));
  face.position.z = -D / 2 - 0.0004; face.rotation.y = Math.PI; face.userData.killscribe = true;
  grp.add(face);
  // tilted up a little toward the eye (its lower edge stands out from the
  // receiver, so the upper edge doesn't sink into it)
  grp.rotation.x = 0.42;
  grp.position.set(hit.x, hit.y, hit.z - D / 2 - Math.sin(0.42) * H / 2 + 0.0008);
  inner.add(grp);
  // on a pistol's slide it rides with the slide when it cycles
  const slide = gun.getObjectByName('slide');
  let a = on; while (a && a !== inner && a !== slide) a = a.parent;
  if (slide && a === slide) slide.attach(grp);
  return { group: grp, set: (k) => { drawReadout(cv, k); tex.needsUpdate = true; } };
}

// The blade's outline along its length (lowest and highest y in each of N
// columns, from where each triangle crosses the column's middle), in the
// blade mesh's own space, and the half-thickness of its flat (most of the
// blade, so a stray part doesn't count).
function bladeProfile(geo) {
  const p = geo.attributes.position, idx = geo.index;
  let x0 = Infinity, x1 = -Infinity;
  const zs = [];
  for (let i = 0; i < p.count; i++) { const vx = p.getX(i); x0 = Math.min(x0, vx); x1 = Math.max(x1, vx); zs.push(Math.abs(p.getZ(i))); }
  zs.sort((a, b) => a - b);
  const zmax = zs[Math.floor(zs.length * 0.9)] || zs[zs.length - 1] || 0.002;
  const zmed = zs[Math.floor(zs.length * 0.5)] || zmax;
  const N = 96, dx = (x1 - x0) / N, lo = new Array(N).fill(Infinity), hi = new Array(N).fill(-Infinity);
  const vi = (k) => (idx ? idx.getX(k) : k), tris = (idx ? idx.count : p.count) / 3;
  const P = [[0, 0], [0, 0], [0, 0]];
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) { const v = vi(t * 3 + k); P[k][0] = p.getX(v); P[k][1] = p.getY(v); }
    const tx0 = Math.min(P[0][0], P[1][0], P[2][0]), tx1 = Math.max(P[0][0], P[1][0], P[2][0]);
    const i0 = Math.max(0, Math.ceil((tx0 - x0) / dx - 0.5)), i1 = Math.min(N - 1, Math.floor((tx1 - x0) / dx - 0.5));
    for (let i = i0; i <= i1; i++) {
      const xs = x0 + (i + 0.5) * dx;
      for (let e = 0; e < 3; e++) {
        const [ax, ay] = P[e], [bx, by] = P[(e + 1) % 3];
        if (ax === bx || (xs - ax) * (xs - bx) > 0) continue;
        const y = ay + (by - ay) * (xs - ax) / (bx - ax);
        if (y < lo[i]) lo[i] = y;
        if (y > hi[i]) hi[i] = y;
      }
    }
  }
  return { x0, x1, N, lo, hi, zmax, zmed };
}

// A mesh's signed volume: negative when its faces are wound inside out.
function signedVolume(geo) {
  const p = geo.attributes.position, idx = geo.index, n = idx ? idx.count : p.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, idx ? idx.getX(i) : i); b.fromBufferAttribute(p, idx ? idx.getX(i + 1) : i + 1); c.fromBufferAttribute(p, idx ? idx.getX(i + 2) : i + 2);
    v += a.dot(b.cross(c));
  }
  return v / 6;
}
// Only the parts of a decal lying across the blade's faces (not on walls
// running through it, like the edge of a hole).
function facingOnly(geo) {
  const P = geo.attributes.position, U = geo.attributes.uv, N = geo.attributes.normal;
  if (!N) return geo;
  const keep = [];
  for (let i = 0; i < P.count; i += 3) if (Math.abs(N.getZ(i) + N.getZ(i + 1) + N.getZ(i + 2)) / 3 > 0.45) keep.push(i);
  if (keep.length * 3 === P.count) return geo;
  const out = new THREE.BufferGeometry(), np = [], nu = [], nn = [];
  for (const i of keep) for (let k = i; k < i + 3; k++) { np.push(P.getX(k), P.getY(k), P.getZ(k)); nu.push(U.getX(k), U.getY(k)); nn.push(N.getX(k), N.getY(k), N.getZ(k)); }
  out.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(nu, 2));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  geo.dispose();
  return out;
}

// The etched count on both faces of a knife's blade, near the guard.
function attachEtching(gun, n) {
  const blade = gun.userData.inner.getObjectByName('blade');
  if (!blade?.geometry) return null;
  const pr = bladeProfile(blade.geometry);
  const bw = (pr.x1 - pr.x0) / pr.N;
  // parts lying across the blade's face (a raised ridge down its middle):
  // their extent in the blade's own space; the figures go beside them
  const toBlade = new THREE.Matrix4();
  gun.userData.inner.updateMatrixWorld(true);
  const fromWorld = blade.matrixWorld.clone().invert(), over = [];
  blade.parent.traverse(o => {
    if (!o.isMesh || o === blade || o.userData.killscribe || o.parent?.userData?.killscribe) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(toBlade.multiplyMatrices(fromWorld, o.matrixWorld));
    if (bb.max.x > pr.x0 + (pr.x1 - pr.x0) * 0.15 && bb.min.x < pr.x1 && bb.max.z > pr.zmax * 0.9 && bb.max.y - bb.min.y < 0.012) over.push(bb);
  });
  // holes through the blade (a skeleton knife's): which parts of each column
  // are solid, found by looking straight through the blade at points up it
  // (only where the figures might go)
  const probe = new THREE.Mesh(blade.geometry); probe.updateMatrixWorld(true);
  probe.material.side = THREE.DoubleSide;
  const NS = 12, solid = [];
  for (let k = 0; k < pr.N; k++) {
    const col = [];
    if (k >= pr.N * 0.1 && k <= pr.N * 0.85 && pr.hi[k] > pr.lo[k]) {
      const x = pr.x0 + (k + 0.5) * bw;
      for (let j = 0; j < NS; j++) {
        const y = pr.lo[k] + (pr.hi[k] - pr.lo[k]) * (j + 0.5) / NS;
        ray.set(new THREE.Vector3(x, y, 0.2), new THREE.Vector3(0, 0, -1));
        col.push([y, ray.intersectObject(probe, false).length > 0]);
      }
    }
    solid.push(col);
  }
  // the clear band in a column: all of it, or above / below whatever lies
  // across it, and the longest unbroken stretch of it where there's a hole
  const band = (k, side) => {
    let lo = pr.lo[k], hi = pr.hi[k];
    const x = pr.x0 + (k + 0.5) * bw;
    for (const bb of over) if (x >= bb.min.x && x <= bb.max.x) { if (side > 0) lo = Math.max(lo, bb.max.y + 0.001); else hi = Math.min(hi, bb.min.y - 0.001); }
    const col = solid[k];
    if (col?.length && col.some(([, s]) => !s)) {
      const step = (pr.hi[k] - pr.lo[k]) / NS;
      let best = [lo, lo], run = null;
      for (const [y, s] of col) {
        if (y < lo || y > hi) continue;
        if (s) { run ||= [Math.max(lo, y - step / 2), y]; run[1] = Math.min(hi, y + step / 2); if (run[1] - run[0] > best[1] - best[0]) best = run.slice(); }
        else run = null;
      }
      return best;
    }
    return [lo, hi];
  };
  // the figures' height: about half the blade's (or the larger clear band's),
  // within reason; that band is tried first
  const k30 = Math.floor(pr.N * 0.3), hgt = (side) => { const [l, h] = band(k30, side); return Math.max(0, h - l); };
  const sides = !over.length ? [1] : hgt(1) >= hgt(-1) ? [1, -1] : [-1, 1];
  const ref = hgt(sides[0]);
  const cv = canvas(512, 192), nv = canvas(512, 192);
  let place = null;
  for (let hd = Math.min(0.024, Math.max(0.009, ref * 0.72)); hd >= 0.006 && !place; hd *= 0.88) {
    const wd = hd * (512 / 192) * Math.min(1, 0.42 + 0.18 * String(n | 0).length);
    const nb = Math.ceil(wd / bw);
    // the window nearest the guard where the blade is tall enough all along
    for (let b = Math.floor(pr.N * 0.12); b + nb < pr.N * 0.8 && !place; b++) {
      for (const side of sides) {
        let ok = true, ymin = -Infinity, ymax = Infinity;
        for (let k = b; k <= b + nb; k++) { const [l, h] = band(k, side); if (h - l < hd * 1.15) { ok = false; break; } ymin = Math.max(ymin, l); ymax = Math.min(ymax, h); }
        if (ok && ymax - ymin >= hd * 1.05) { place = { x: pr.x0 + (b + nb / 2) * bw, y: (ymin + ymax) / 2 + (ymax - ymin - hd) * (over.length ? 0 : 0.1), w: wd, h: hd }; break; }
      }
    }
  }
  if (!place) return null;
  drawEtch(cv, n); normalFromAlpha(cv, nv);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const nrm = new THREE.CanvasTexture(nv);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, normalMap: nrm, normalScale: new THREE.Vector2(0.9, 0.9), transparent: true, alphaTest: 0.08, depthWrite: false,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.16,
    roughness: 0.7, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  // project onto the blade itself (in its own space) so the figures follow a
  // ground edge or a ridge. Each face's box runs from the blade's middle out
  // past its surface, so neither face's figures reach the other face.
  const surf = (side) => {
    ray.set(new THREE.Vector3(place.x, place.y, side * 0.2), new THREE.Vector3(0, 0, -side));
    const h = ray.intersectObject(probe, false)[0];
    return h ? h.point.z : side * pr.zmax;
  };
  const zf = surf(1), zb = surf(-1), mid = (zf + zb) / 2;
  const reach = Math.max(Math.abs(zf - mid), Math.abs(zb - mid), pr.zmed) + 0.003;
  // a blade whose faces are wound inside out shows the far face from the
  // near side: then each face's figures are turned to read from the other side
  const inv = signedVolume(blade.geometry) < 0;
  const asSeen = (side) => (side > 0) !== inv ? new THREE.Euler(0, 0, Math.PI) : new THREE.Euler(0, Math.PI, 0);
  const grp = new THREE.Group(); grp.userData.killscribe = true;
  // the near face as you hold it reads the right way up in your hand; the far
  // face reads along the blade the other way
  for (const side of [1, -1]) {
    const lo = side > 0 ? mid + 0.00002 : mid - reach, hi = side > 0 ? mid + reach : mid - 0.00002;
    const geo = facingOnly(new DecalGeometry(probe, new THREE.Vector3(place.x, place.y, (lo + hi) / 2), asSeen(side), new THREE.Vector3(place.w, place.h, hi - lo)));
    if (!geo.attributes.position.count) continue;
    const m = new THREE.Mesh(geo, mat); m.userData.killscribe = true; m.renderOrder = 2;
    grp.add(m);
  }
  blade.add(grp);
  return { group: grp, set: (k) => { drawEtch(cv, k); normalFromAlpha(cv, nv); tex.needsUpdate = true; nrm.needsUpdate = true; } };
}

// Puts the counter on (or takes it off) a model built by buildGun, for an
// item ({ tally, defId... }) and its weapon / knife. Returns the handle with
// set(count), also kept as gun.userData.killscribe.
export function attachKillscribe(gun, item, def) {
  detachKillscribe(gun);
  if (!gun?.userData?.inner || item?.tally == null || !def || def.gloves) return null;
  const n = item.tally;
  const ks = def.knife ? attachEtching(gun, n) : attachReadout(gun, def.weapon, n);
  if (ks) gun.userData.killscribe = ks;
  return ks;
}
export function detachKillscribe(gun) {
  const ks = gun?.userData?.killscribe;
  if (!ks) return;
  ks.group.parent?.remove(ks.group);
  ks.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); if (o.material.normalMap) o.material.normalMap.dispose(); o.material.dispose(); } });
  gun.userData.killscribe = null;
}
