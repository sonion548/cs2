"""Clothing shells for the characters, grown off the body surface.

A garment starts as the patch of body surface it covers. Each vertex is
pushed out along the skin normal by the garment's ease (how loosely it sits),
the patch is relaxed so cloth bridges hollows instead of following every
contour (spine groove, collarbones, the dip behind the knee), and anything
that sank back into the body is pushed out again. Folds are then added as
displacement where cloth bunches or pulls: rings at cuffs and boot tops, fans
inside the elbow and behind the knee, diagonal pulls from the crotch and
armpit, gathered pleats under a belt.

Coordinates around a limb are cylindrical about one of the game's bones:
u = metres along the bone from its head, a = angle around it, 0 at the front,
+90 degrees on the outside of the body (lateral), -90 on the inside.
"""
import math

import numpy as np

TAU = math.pi * 2


def region(body, test):
    """Body faces whose corners all pass test(V, W) -> bool per vertex."""
    ok = np.asarray(test(body.V, body.W))
    return [f for f in body.faces if ok[f].all()]


def adjacency(F, n):
    nb = [set() for _ in range(n)]
    edges = {}
    for f in F:
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            nb[a].add(b); nb[b].add(a)
            key = (min(a, b), max(a, b))
            edges[key] = edges.get(key, 0) + 1
    boundary = np.zeros(n, bool)
    bedges = []
    for (a, b), c in edges.items():
        if c == 1:
            boundary[a] = boundary[b] = True
            bedges.append((a, b))
    return [np.array(sorted(s), dtype=np.int64) for s in nb], boundary, bedges


def vertex_normals(P, F):
    N = np.zeros_like(P)
    for f in F:
        for k in range(1, len(f) - 1):
            a, b, c = P[f[0]], P[f[k]], P[f[k + 1]]
            n = np.cross(b - a, c - a)
            for i in (f[0], f[k], f[k + 1]):
                N[i] += n
    ln = np.linalg.norm(N, axis=1, keepdims=True); ln[ln == 0] = 1
    return N / ln


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def bump(x):
    """Fold cross-section: 1 at the ridge line, 0 at |x| >= 1."""
    x = np.clip(np.abs(x), 0, 1)
    return (1 - x * x) ** 2


class Shell:
    """A garment surface: verts P, faces F, and for each vertex the body
    vertex it grew from (src)."""

    def __init__(self, body, faces, ease, relax=5, keep=0.55, gap=0.0025):
        self.body = body
        used = np.unique(np.concatenate([np.asarray(f) for f in faces]))
        remap = {int(o): i for i, o in enumerate(used)}
        self.F = [[remap[int(i)] for i in f] for f in faces]
        self.src = used
        self.uvF = None
        P0, N0 = body.V[used], body.N[used]
        e = np.broadcast_to(np.asarray(ease(P0, body.W[used]), dtype=float), (len(used),)).copy()
        self.ease = e
        self.P = P0 + N0 * e[:, None]
        self.nb, self.boundary, self.bedges = adjacency(self.F, len(used))
        self.relax(relax)
        self.push_out(keep, gap)

    @property
    def W(self):
        return self.body.W[self.src]

    @property
    def N(self):
        return vertex_normals(self.P, self.F)

    def relax(self, iters, rate=0.5, boundary_too=False):
        for _ in range(iters):
            L = np.array([self.P[n].mean(axis=0) if len(n) else self.P[i] for i, n in enumerate(self.nb)])
            m = np.ones(len(self.P), bool) if boundary_too else ~self.boundary
            self.P[m] += (L[m] - self.P[m]) * rate

    def push_out(self, keep=0.55, gap=0.0025):
        """Anything closer to the skin than keep * ease (and at least gap) goes back out."""
        b = self.body
        for i, p in enumerate(self.P):
            loc, n, _, _ = b.nearest(p)
            d = float(np.dot(p - loc, n))
            need = max(gap, self.ease[i] * keep)
            if d < need:
                self.P[i] = loc + n * need

    def push_out_rays(self, ease=None, mask=None, reach=0.08):
        """Clear the outermost skin along each vertex's own (smooth) normal:
        bridges gaps (between toes, behind ears) instead of sinking into them."""
        from mathutils import Vector
        N = self.N
        bvh = self.body.bvh
        e = self.ease if ease is None else np.broadcast_to(ease, (len(self.P),))
        idx = np.arange(len(self.P)) if mask is None else np.where(mask)[0]
        for i in idx:
            p, n = self.P[i], N[i]
            hit, _, _, _ = bvh.ray_cast(Vector(p + n * reach), Vector(-n), reach * 2)
            if hit is None:
                continue
            hit = np.array(hit)
            if (p - hit) @ n < e[i]:
                self.P[i] = hit + n * e[i]

    def displace(self, d):
        self.P += self.N * np.asarray(d)[:, None]

    # -------------------------------------------------------------- limb coordinates
    def cyl(self, bone, P=None):
        """(u, a, r) of each vertex about a game bone; a in radians, 0 = front,
        +pi/2 = lateral side."""
        P = self.P if P is None else P
        h, t, ax = self.body.bone_frame(bone)
        d = P - h
        u = d @ ax
        rad = d - np.outer(u, ax)
        fwd = np.array([0.0, 1.0, 0.0]); fwd = fwd - ax * (fwd @ ax); fwd /= np.linalg.norm(fwd)
        side = np.cross(ax, fwd)
        # make +side point away from the body's midline for this bone
        mid = (h + t) / 2
        if (side[0] * mid[0]) < 0:
            side = -side
        a = np.arctan2(rad @ side, rad @ fwd)
        return u, a, np.linalg.norm(rad, axis=1)

    def mask(self, bones, thresh=0.5):
        W = self.W
        return sum(W[:, BI(b)] for b in bones) > thresh

    # -------------------------------------------------------------- folds
    def rings(self, bone, members, u0, u1, n, amp, width, arc=(-math.pi, math.pi), slope=0.25, wobble=0.004,
              seed=1, skip=0.0, spread=0.35):
        """n folds running around the limb between u0 and u1 (metres along
        the bone), each over part of the arc, tilted and wavy like real
        bunching. amp > 0 raises ridges; each ridge gets a shallow valley
        either side."""
        rng = np.random.default_rng(seed)
        u, a, _ = self.cyl(bone)
        m = self.mask(members)
        d = np.zeros(len(self.P))
        a0, a1 = arc
        for k in range(n):
            if rng.random() < skip:
                continue
            c = u0 + (u1 - u0) * (k + 0.5 + (rng.random() - 0.5) * spread) / n
            span = (a1 - a0) * (0.55 + rng.random() * 0.45)
            mid = a0 + (a1 - a0) / 2 + (rng.random() - 0.5) * ((a1 - a0) - span)
            da = _wrap(a - mid)
            env = 1 - smoothstep(span * 0.3, span * 0.5, np.abs(da))
            tilt = (rng.random() - 0.5) * 2 * slope
            ph = rng.random() * TAU
            line = c + tilt * da * 0.05 + wobble * np.sin(da * 2.3 + ph)
            w = width * (0.8 + rng.random() * 0.4)
            A = amp * (0.7 + rng.random() * 0.5)
            x = (u - line) / w
            d += m * env * A * (bump(x) - 0.3 * bump((np.abs(x) - 1.15) / 0.55))
        self.displace(d)
        return d

    def pleats(self, bone, members, u0, u1, count, amp, phase=0.0, sharp=2.0, seed=3):
        """Folds running along the limb (gathered or bloused cloth)."""
        rng = np.random.default_rng(seed)
        u, a, _ = self.cyl(bone)
        m = self.mask(members)
        env = smoothstep(u0, u0 + (u1 - u0) * 0.35, u) * (1 - smoothstep(u1 - (u1 - u0) * 0.35, u1, u))
        jit = np.interp(a, np.linspace(-math.pi, math.pi, 9), rng.random(9) * 0.8)
        wave = (0.5 + 0.5 * np.cos(count * a + phase + jit + u * 9)) ** sharp
        d = m * env * amp * (wave - 0.35)
        self.displace(d)
        return d

    def pull(self, p0, p1, width, amp, members=None, taper=(0.15, 0.85)):
        """A straight tension fold from p0 to p1 (measured across the surface
        by distance to the segment), fading in and out along its length."""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        seg = p1 - p0
        L2 = seg @ seg
        t = np.clip(((self.P - p0) @ seg) / L2, 0, 1)
        dist = np.linalg.norm(self.P - (p0 + np.outer(t, seg)), axis=1)
        env = smoothstep(0, taper[0], t) * (1 - smoothstep(taper[1], 1, t))
        m = self.mask(members) if members else 1.0
        d = m * env * amp * bump(dist / width)
        self.displace(d)
        return d

    def bulge(self, center, radius, amp, members=None):
        c = np.asarray(center, float)
        dist = np.linalg.norm(self.P - c, axis=1)
        m = self.mask(members) if members else 1.0
        d = m * amp * bump(dist / radius)
        self.displace(d)
        return d

    # -------------------------------------------------------------- edges
    def trim(self, point, normal, reach=0.035):
        """Snap open edges lying near a cutting plane onto it, so hems run straight."""
        n = np.asarray(normal, float); n = n / np.linalg.norm(n)
        d = (self.P - np.asarray(point, float)) @ n
        m = self.boundary & (np.abs(d) < reach)
        self.P[m] -= np.outer(d[m], n)

    def trim_to(self, fn, reach=0.035):
        """Snap open edges near a cut height fn(P) -> z onto it."""
        z = fn(self.P)
        m = self.boundary & (np.abs(self.P[:, 2] - z) < reach)
        self.P[m, 2] = z[m]

    def loops(self):
        """Boundary loops as ordered vertex lists, oriented like their faces."""
        nxt = {}
        for f in self.F:
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                nxt[(a, b)] = True
        out_edges = {}
        for a, b in self.bedges:
            if (a, b) in nxt:
                out_edges[a] = b
            else:
                out_edges[b] = a
        loops, seen = [], set()
        for s in list(out_edges):
            if s in seen:
                continue
            loop = [s]; seen.add(s)
            c = out_edges[s]
            while c != s and c not in seen and c in out_edges:
                loop.append(c); seen.add(c); c = out_edges[c]
            loops.append(loop)
        return loops

    def hem(self, depth=0.006, turn=0.012, only=None):
        """Turn the open edges in so the cloth shows a thickness: a band going
        under the edge toward the body, then back up inside."""
        N = self.N
        P = list(self.P)
        F = list(self.F)
        src = list(self.src)
        for loop in self.loops():
            if only is not None and not only(self.P[loop].mean(axis=0)):
                continue
            inner = []
            for i in loop:
                q = self.P[i] - N[i] * depth
                P.append(q); src.append(self.src[i]); inner.append(len(P) - 1)
            up = []
            for k, i in enumerate(loop):
                # back up under the cloth, away from the edge
                nb_in = [j for j in self.nb[i] if not self.boundary[j]]
                into = (self.P[nb_in].mean(axis=0) - self.P[i]) if nb_in else np.zeros(3)
                ln = np.linalg.norm(into)
                into = into / ln if ln > 1e-9 else into
                P.append(P[inner[k]] + into * turn); src.append(self.src[i]); up.append(len(P) - 1)
            n = len(loop)
            for k in range(n):
                a, b = loop[k], loop[(k + 1) % n]
                ia, ib = inner[k], inner[(k + 1) % n]
                ua, ub = up[k], up[(k + 1) % n]
                F.append([b, a, ia, ib])
                F.append([ib, ia, ua, ub])
        self.P = np.array(P)
        self.F = F
        self.src = np.array(src)
        self.ease = np.concatenate([self.ease, np.full(len(self.P) - len(self.ease), self.ease.mean())])
        self.nb, self.boundary, self.bedges = adjacency(self.F, len(self.P))


def _wrap(a):
    return (a + math.pi) % TAU - math.pi


_BI = None


def BI(b):
    global _BI
    if _BI is None:
        import human
        _BI = {n: i for i, n in enumerate(human.GAME_BONES)}
    return _BI[b]


# ---------------------------------------------------------------- measured lofts
# Boots and head coverings are lofted through horizontal sections of the body:
# each section is the convex outline of the body at that height, so the cover
# stretches over toes, ears and the nose the way leather and knit do, and the
# mesh comes out as clean rings that openings can be cut into exactly.

def hull2d(pts):
    pts = sorted(set(map(tuple, np.round(pts, 6))))
    if len(pts) < 3:
        return np.array(pts)

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return np.array(lo[:-1] + hi[:-1])


def mesh_edges(F):
    e = set()
    for f in F:
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            e.add((min(a, b), max(a, b)))
    return np.array(sorted(e))


def section_points(V, E, z):
    a, b = V[E[:, 0]], V[E[:, 1]]
    dz = b[:, 2] - a[:, 2]
    with np.errstate(divide='ignore', invalid='ignore'):
        s = (z - a[:, 2]) / dz
    m = (dz != 0) & (s >= 0) & (s <= 1)
    return (a[m] + (b[m] - a[m]) * s[m, None])[:, :2]


def radial(hull, c, angles):
    """Distance from c to the hull boundary along each angle (0 = +Y, +pi/2 = +X)."""
    out = np.zeros(len(angles))
    P = hull - c
    Q = np.roll(P, -1, axis=0)
    for j, a in enumerate(angles):
        d = np.array([math.sin(a), math.cos(a)])
        best = 0.0
        for p, q in zip(P, Q):
            e = q - p
            den = d[0] * e[1] - d[1] * e[0]
            if abs(den) < 1e-12:
                continue
            t = (p[0] * e[1] - p[1] * e[0]) / den
            u = (p[0] * d[1] - p[1] * d[0]) / den
            if t > 0 and -1e-9 <= u <= 1 + 1e-9:
                best = max(best, t)
        out[j] = best
    return out


class Loft:
    """Rings of points around a vertical axis: P[k, j] at height z[k], angle a[j]."""

    def __init__(self, V, F, zs, n=40, pick=None, center_smooth=2, radius_smooth=1):
        E = mesh_edges(F)
        if pick is not None:
            keep = pick(V)
            E = E[keep[E[:, 0]] & keep[E[:, 1]]]
        self.z = np.asarray(zs, float)
        self.a = np.linspace(-math.pi, math.pi, n, endpoint=False)
        C, R = [], []
        for z in self.z:
            pts = section_points(V, E, z)
            if len(pts) < 3:
                C.append(None); R.append(None)
                continue
            h = hull2d(pts)
            c = h.mean(axis=0)
            C.append(c); R.append(radial(h, c, self.a))
        # fill empty sections from their neighbours
        good = [k for k, c in enumerate(C) if c is not None]
        for k in range(len(C)):
            if C[k] is None:
                g = min(good, key=lambda q: abs(q - k))
                C[k], R[k] = C[g].copy(), R[g] * 0.6
        self.c = np.array(C)
        self.r = np.array(R)
        for _ in range(center_smooth):
            self.c[1:-1] = (self.c[:-2] + self.c[1:-1] * 2 + self.c[2:]) / 4
        for _ in range(radius_smooth):
            self.r[1:-1] = (self.r[:-2] + self.r[1:-1] * 2 + self.r[2:]) / 4
            self.r = (np.roll(self.r, 1, axis=1) + self.r * 2 + np.roll(self.r, -1, axis=1)) / 4

    def radius_at(self, z, j):
        return np.interp(z, self.z, self.r[:, j])

    def center_at(self, z):
        return np.array([np.interp(z, self.z, self.c[:, 0]), np.interp(z, self.z, self.c[:, 1])])

    def points(self, ease=0.0):
        """ease: scalar or callable(z[k], a[j]) -> metres added to the radius."""
        K, J = len(self.z), len(self.a)
        P = np.zeros((K, J, 3))
        for k in range(K):
            e = ease(self.z[k], self.a) if callable(ease) else ease
            r = self.r[k] + e
            P[k, :, 0] = self.c[k, 0] + np.sin(self.a) * r
            P[k, :, 1] = self.c[k, 1] + np.cos(self.a) * r
            P[k, :, 2] = self.z[k]
        return P


def ring_mesh(P, keep=None, cap_top=False, cap_bottom=False):
    """Quads between rings (keep(k, j) -> False leaves a hole), optional caps."""
    K, J = P.shape[:2]
    V = P.reshape(-1, 3).tolist()
    F = []
    for k in range(K - 1):
        for j in range(J):
            if keep is not None and not keep(k, j):
                continue
            a, b = k * J + j, k * J + (j + 1) % J
            F.append([a, b, b + J, a + J])
    if cap_top:
        c = len(V); V.append(P[-1].mean(axis=0).tolist())
        for j in range(J):
            F.append([(K - 1) * J + j, (K - 1) * J + (j + 1) % J, c])
    if cap_bottom:
        c = len(V); V.append(P[0].mean(axis=0).tolist())
        for j in range(J):
            F.append([(j + 1) % J, j, c])
    return np.array(V), F
