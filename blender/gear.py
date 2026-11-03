"""Load-bearing and protective gear for the characters, built on top of the
clothing: plate carrier, cummerbund and pouches, battle belt, drop-leg
holster, knee pads, ballistic helmet with rails and headset, eyewear, and the
militia's canvas chest rig.

Everything is placed against the clothing surface (ray casts and nearest
points), so straps lie on the shoulders and plates sit on the chest of this
particular body. Parts are made the way the real items are put together:
padded bags with rounded edges, webbing straps with a real cross-section,
flapped pouches, hardware.

All builders return (verts, faces, per-vertex phys UV in metres); `make`
(characters.new_obj) turns them into parts with a material and a bone.
"""
import math

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import cloth as C


# ---------------------------------------------------------------- surface queries
class Surface:
    """The current outer layer (a set of mesh objects) for placing gear."""

    def __init__(self, objs):
        """objs: mesh objects, or (object, per-vertex bool mask) pairs to use
        only part of a mesh (e.g. a shirt without its sleeves)."""
        verts, tris = [], []
        for o in objs:
            o, mask = o if isinstance(o, tuple) else (o, None)
            base = len(verts)
            verts += [v.co.copy() for v in o.data.vertices]
            for p in o.data.polygons:
                vs = list(p.vertices)
                if mask is not None and not all(mask[v] for v in vs):
                    continue
                for k in range(1, len(vs) - 1):
                    tris.append((base + vs[0], base + vs[k], base + vs[k + 1]))
        self.bvh = BVHTree.FromPolygons(verts, tris)

    def ray(self, origin, direction, dist=3.0):
        loc, n, _, _ = self.bvh.ray_cast(Vector(origin), Vector(direction), dist)
        if loc is None:
            return None, None
        n = np.array(n)
        if n @ np.asarray(direction) > 0:
            n = -n
        return np.array(loc), n

    def nearest(self, p):
        loc, n, _, _ = self.bvh.find_nearest(Vector(p))
        return np.array(loc), np.array(n)

    def front(self, x, z):
        return self.ray((x, 1.0, z), (0, -1, 0))

    def back(self, x, z):
        return self.ray((x, -1.0, z), (0, 1, 0))

    def around(self, c, z, a, reach=0.6):
        """Hit point and normal at angle a (0 = +Y front, +pi/2 = +X) round a vertical axis through c."""
        d = np.array([math.sin(a), math.cos(a), 0.0])
        return self.ray(np.array([c[0], c[1], z]) + d * reach, -d)

    def place(self, p, off):
        loc, n = self.nearest(p)
        return loc + n * off, n


# ---------------------------------------------------------------- 2D outlines
def rounded_polygon(pts, r, seg=4):
    """Replace each corner of a convex polygon with an arc of radius r."""
    pts = [np.asarray(p, float) for p in pts]
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        a = (p0 - p1) / np.linalg.norm(p0 - p1)
        b = (p2 - p1) / np.linalg.norm(p2 - p1)
        ang = math.acos(np.clip(a @ b, -1, 1))
        rr = min(r, 0.45 * min(np.linalg.norm(p0 - p1), np.linalg.norm(p2 - p1)) * math.tan(ang / 2))
        d = rr / math.tan(ang / 2)
        s, e = p1 + a * d, p1 + b * d
        bis = (a + b) / np.linalg.norm(a + b)
        c = p1 + bis * (rr / math.sin(ang / 2))
        a0 = math.atan2(*(s - c)[::-1])
        a1 = math.atan2(*(e - c)[::-1])
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        for k in range(seg + 1):
            t = a0 + da * k / seg
            out.append(c + rr * np.array([math.cos(t), math.sin(t)]))
    return np.array(out)


def ccw(poly):
    a = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    return poly if a > 0 else poly[::-1]


def inset(poly, d):
    """Offset a CCW polygon inward by d (miter joins)."""
    n = len(poly)
    out = np.zeros_like(poly)
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e0 = (p1 - p0) / np.linalg.norm(p1 - p0)
        e1 = (p2 - p1) / np.linalg.norm(p2 - p1)
        n0 = np.array([-e0[1], e0[0]]); n1 = np.array([-e1[1], e1[0]])   # inward for CCW
        m = n0 + n1
        ln = np.linalg.norm(m)
        m = m / ln if ln > 1e-9 else n0
        cosh = max(0.3, m @ n0)
        out[i] = p1 + m * d / cosh
    return out


# ---------------------------------------------------------------- builders
def pillow(outline, to3d, thick, edge=0.007, bulge=0.002, back=True, max_inset=None):
    """Padded bag over a 2D outline: rounded edges all round, a slight
    fullness in the middle. to3d(u, v, h) -> xyz, h measured off the base
    surface (0 = the side that faces the wearer)."""
    poly = ccw(np.asarray(outline, float))
    w = poly.max(axis=0) - poly.min(axis=0)
    lim = max_inset or min(w) * 0.42
    ds = [0.0, edge * 0.3, edge]
    d = edge
    while d < lim:
        d = min(lim, d + max(0.012, d * 0.5))
        ds.append(d)
    rings = [inset(poly, x) if x > 0 else poly for x in ds]
    n = len(poly)

    def hfront(k):
        if k == 0:
            return thick * 0.5
        if k == 1:
            return thick * (0.5 + 0.5 * 0.82)
        return thick + bulge * C.smoothstep(edge, lim, ds[k])

    def hback(k):
        if k == 0:
            return thick * 0.5
        if k == 1:
            return thick * 0.5 * 0.18
        return 0.0
    V, UV, F = [], [], []
    sides = [hfront] + ([hback] if back else [])
    for si, hf in enumerate(sides):
        base = len(V)
        for k, ring in enumerate(rings):
            if si == 1 and k == 0:
                continue     # shares the outline ring with the front
            for u, v in ring:
                V.append(to3d(u, v, hf(k))); UV.append((u, v))
        cu, cv = rings[-1].mean(axis=0)
        V.append(to3d(cu, cv, hf(len(rings) - 1))); UV.append((cu, cv))
        center = len(V) - 1
        idx = lambda k, j: (k * n + j) if si == 0 else (j if k == 0 else (base + (k - 1) * n + j))
        for k in range(len(rings) - 1):
            for j in range(n):
                a, b = idx(k, j), idx(k, (j + 1) % n)
                c_, d_ = idx(k + 1, (j + 1) % n), idx(k + 1, j)
                F.append([a, b, c_, d_] if si == 0 else [d_, c_, b, a])
        last = len(rings) - 1
        for j in range(n):
            a, b = idx(last, j), idx(last, (j + 1) % n)
            F.append([a, b, center] if si == 0 else [center, b, a])
    return np.array(V), F, np.array(UV)


def rbox(size, r, n=3, bulge=0.0, taper=0.0, sag=0.0):
    """Rounded box centred on the origin (x width, y depth, z height), its
    faces filled out a little like a stuffed pouch. Returns verts, faces, uv."""
    hs = np.asarray(size, float) / 2
    r = min(r, hs.min() * 0.95)
    inner = hs - r
    keyed, V, UV, F = {}, [], [], []

    def vid(q, uv):
        k = tuple(np.round(q, 6))
        if k not in keyed:
            c = np.clip(q, -inner, inner)
            dvec = q - c
            ln = np.linalg.norm(dvec)
            p = c + (dvec / ln * r if ln > 1e-12 else 0)
            # fullness: push face centres out along the face normal
            if bulge:
                for ax in range(3):
                    if abs(q[ax]) >= hs[ax] - 1e-9:
                        o = [i for i in range(3) if i != ax]
                        f = (1 - (q[o[0]] / hs[o[0]]) ** 2) * (1 - (q[o[1]] / hs[o[1]]) ** 2)
                        p[ax] += np.sign(q[ax]) * bulge * f
            if taper:
                k_ = 1 + taper * (q[2] / hs[2])
                p[0] *= k_; p[1] *= k_
            if sag:
                p[2] -= sag * (1 - (q[0] / hs[0]) ** 2) * (q[2] < 0)
            keyed[k] = len(V); V.append(p); UV.append(uv)
        return keyed[k]
    m = n + 2
    for ax in range(3):
        for sgn in (-1, 1):
            o = [i for i in range(3) if i != ax]
            for i in range(m):
                for j in range(m):
                    quad = []
                    for di, dj in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        q = np.zeros(3)
                        q[ax] = sgn * hs[ax]
                        q[o[0]] = -hs[o[0]] + 2 * hs[o[0]] * (i + di) / m
                        q[o[1]] = -hs[o[1]] + 2 * hs[o[1]] * (j + dj) / m
                        quad.append(vid(q, (q[o[0]] + ax * 0.3, q[o[1]] + (sgn > 0) * 0.2)))
                    # outward winding
                    nrm = np.cross(np.subtract(V[quad[1]], V[quad[0]]), np.subtract(V[quad[2]], V[quad[0]]))
                    if nrm[ax] * sgn < 0:
                        quad = quad[::-1]
                    F.append(quad)
    return np.array(V), F, np.array(UV)


def frame(origin, x, y, z=None):
    """Orthonormal frame: x roughly right, y outward (away from the wearer), z up."""
    x = np.asarray(x, float); y = np.asarray(y, float)
    y = y / np.linalg.norm(y)
    x = x - y * (x @ y); x /= np.linalg.norm(x)
    z = np.cross(x, y) if z is None else np.asarray(z, float)
    if z[2] < 0 and z is not None:
        pass
    return np.asarray(origin, float), np.stack([x, y, np.cross(x, y)], axis=1)


def place(V, origin, R):
    return V @ R.T + origin


def strap(path, normals, width, thick, closed=False, cap=True, rounded=True):
    """Webbing or padded strap along a 3D path lying on a surface whose
    normals are given per point."""
    P = np.asarray(path, float); N = np.asarray(normals, float)
    n = len(P)
    T = np.zeros_like(P)
    for i in range(n):
        a = P[(i + 1) % n] if (closed or i < n - 1) else P[i]
        b = P[i - 1] if (closed or i > 0) else P[i]
        T[i] = a - b
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    Nn = N - T * np.sum(N * T, axis=1, keepdims=True)
    Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
    B = np.cross(T, Nn)
    hw, ht = width / 2, thick / 2
    if rounded:
        sec = [(-hw, -ht), (hw, -ht), (hw, ht * 0.4), (hw * 0.92, ht), (-hw * 0.92, ht), (-hw, ht * 0.4)]
    else:
        sec = [(-hw, -ht), (hw, -ht), (hw, ht), (-hw, ht)]
    m = len(sec)
    V, UV, F = [], [], []
    s = 0.0
    for i in range(n):
        if i:
            s += np.linalg.norm(P[i] - P[i - 1])
        for k, (bx, nz) in enumerate(sec):
            V.append(P[i] + B[i] * bx + Nn[i] * (nz + ht)); UV.append((s, bx + (k > 2) * 0.05))
    segs = n if closed else n - 1
    for i in range(segs):
        i2 = (i + 1) % n
        for k in range(m):
            a, b = i * m + k, i * m + (k + 1) % m
            c, d = i2 * m + (k + 1) % m, i2 * m + k
            F.append([a, b, c, d])
    if cap and not closed:
        F.append([m - 1 - k for k in range(m)])
        F.append([(n - 1) * m + k for k in range(m)])
    return np.array(V), F, np.array(UV)


def tube(path, radius, sides=8, closed=False, taper=None):
    P = np.asarray(path, float)
    n = len(P)
    up = np.array([0.0, 0.0, 1.0])
    V, UV, F = [], [], []
    s = 0.0
    for i in range(n):
        a = P[min(n - 1, i + 1)] - P[max(0, i - 1)]
        t = a / np.linalg.norm(a)
        ref = up if abs(t @ up) < 0.9 else np.array([1.0, 0, 0])
        b = np.cross(t, ref); b /= np.linalg.norm(b)
        c = np.cross(t, b)
        rr = radius * (taper(i / max(1, n - 1)) if taper else 1)
        if i:
            s += np.linalg.norm(P[i] - P[i - 1])
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            V.append(P[i] + (b * math.cos(ang) + c * math.sin(ang)) * rr); UV.append((s, k / sides * 2 * math.pi * radius))
    for i in range(n - 1):
        for k in range(sides):
            a, b_ = i * sides + k, i * sides + (k + 1) % sides
            F.append([a, b_, b_ + sides, a + sides])
    F.append([sides - 1 - k for k in range(sides)])
    F.append([(n - 1) * sides + k for k in range(sides)])
    return np.array(V), F, np.array(UV)


def sheet(grid, normals, inner, outer, edge=0.003):
    """A padded band from a grid of surface points (rows x cols) and their
    normals: inner and outer skins at those offsets, closed all round with a
    softened rim."""
    G = np.asarray(grid, float); N = np.asarray(normals, float)
    R, Cc = G.shape[:2]
    mid = (inner + outer) / 2
    # ring of the rim: walk the border of the grid
    border = [(0, j) for j in range(Cc)] + [(i, Cc - 1) for i in range(1, R)] + \
             [(R - 1, j) for j in range(Cc - 2, -1, -1)] + [(i, 0) for i in range(R - 2, 0, -1)]
    V, UV, F = [], [], []
    idx = {}
    # metric UVs: distance along the columns and down the rows
    su = np.zeros((R, Cc)); sv = np.zeros((R, Cc))
    su[:, 1:] = np.cumsum(np.linalg.norm(np.diff(G, axis=1), axis=2), axis=1)
    sv[1:, :] = np.cumsum(np.linalg.norm(np.diff(G, axis=0), axis=2), axis=0)
    for side, off in (('o', outer), ('i', inner)):
        for i in range(R):
            for j in range(Cc):
                idx[(side, i, j)] = len(V)
                V.append(G[i, j] + N[i, j] * off); UV.append((su[i, j] + (side == 'i') * 0.7, sv[i, j]))
    for i in range(R - 1):
        for j in range(Cc - 1):
            o = [idx[('o', i, j)], idx[('o', i, j + 1)], idx[('o', i + 1, j + 1)], idx[('o', i + 1, j)]]
            F.append(o)
            ii = [idx[('i', i, j)], idx[('i', i + 1, j)], idx[('i', i + 1, j + 1)], idx[('i', i, j + 1)]]
            F.append(ii)
    # rim: outer edge -> mid ring pushed outward a touch -> inner edge
    c = G.reshape(-1, 3).mean(axis=0)
    mids = []
    for (i, j) in border:
        p = G[i, j] + N[i, j] * mid
        outv = p - c; outv -= N[i, j] * (outv @ N[i, j]); ln = np.linalg.norm(outv)
        mids.append(len(V)); V.append(p + (outv / ln * edge if ln > 1e-9 else 0)); UV.append((0, 0))
    nb = len(border)
    for k in range(nb):
        a, b = border[k], border[(k + 1) % nb]
        F.append([idx[('o', *b)], idx[('o', *a)], mids[k], mids[(k + 1) % nb]])
        F.append([mids[(k + 1) % nb], mids[k], idx[('i', *a)], idx[('i', *b)]])
    return np.array(V), F, np.array(UV)


def fix_winding(V, F):
    """Orient faces outward from the part's centre (for closed convex-ish parts)."""
    c = V.mean(axis=0)
    out = []
    for f in F:
        p = V[f]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        out.append(f if n @ (p.mean(axis=0) - c) >= 0 else f[::-1])
    return out


# ---------------------------------------------------------------- plates
def fit_plate(surf, half_w, z0, z1, front=True, clear=0.006):
    """Single-curve plate surface y(x, z) = y0 + s (z - zc) -/+ k x^2 that clears
    the clothing by `clear` everywhere over the plate."""
    xs = np.linspace(-half_w, half_w, 11)
    zs = np.linspace(z0, z1, 9)
    pts = []
    for x in xs:
        for z in zs:
            loc, _ = surf.front(x, z) if front else surf.back(x, z)
            if loc is not None:
                pts.append((x, z, loc[1]))
    pts = np.array(pts)
    zc = (z0 + z1) / 2
    A = np.stack([np.ones(len(pts)), pts[:, 1] - zc, pts[:, 0] ** 2], axis=1)
    coef, *_ = np.linalg.lstsq(A, pts[:, 2], rcond=None)
    s = float(coef[1]) * 0.6
    k = float(abs(coef[2]))
    k = min(max(k, 0.8), 2.4)
    sg = 1 if front else -1
    resid = pts[:, 2] - (s * (pts[:, 1] - zc) - sg * k * pts[:, 0] ** 2)
    y0 = resid.max() + clear if front else resid.min() - clear
    return lambda x, z: y0 + s * (z - zc) - sg * k * x * x, s, k


def shooter_plate(w, h, cut_w=0.05, cut_h=0.07, r=0.018):
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2, h - cut_h), (w / 2 - cut_w, h), (-w / 2 + cut_w, h), (-w / 2, h - cut_h)]
    return rounded_polygon(pts, r, seg=5)


# ---------------------------------------------------------------- shared placement helpers
def on_face(surf, p, n_hint=None):
    """Nearest point and outward normal on the surface."""
    loc, n = surf.nearest(p)
    if n_hint is not None and n @ n_hint < 0:
        n = -n
    return loc, n


def box_at(make, name, origin, x_axis, out, size, r, mat, bone, **kw):
    """A rounded box whose back face sits on a surface at `origin` (normal `out`)."""
    o, R = frame(origin, x_axis, out)
    V, F, UV = rbox(size, r, **kw)
    V = V + np.array([0, size[1] / 2, 0])
    return make(name, place(V, o, R), F, mat, bone, UV, closed=True)


def ring_path(surf, c, z, a0, a1, n, off):
    """Points (and normals) on the surface going round a vertical axis at height z."""
    P, N = [], []
    for a in np.linspace(a0, a1, n):
        p, nn = surf.around(c, z, a)
        if p is None:
            continue
        P.append(p + nn * off); N.append(nn)
    return np.array(P), np.array(N)


def torso_center(surf, z):
    f, _ = surf.front(0.0, z)
    b, _ = surf.back(0.0, z)
    return np.array([0.0, (f[1] + b[1]) / 2])


def over_shoulder(surf, x, y_c, z_c, a0, a1, n, off):
    """Points on the surface along an arc over the shoulder in the plane x = const."""
    P, N = [], []
    for a in np.linspace(a0, a1, n):
        d = np.array([0.0, math.cos(a), math.sin(a)])
        p, nn = surf.ray(np.array([x, y_c, z_c]) + d * 0.5, -d)
        if p is None:
            continue
        P.append(p + nn * off); N.append(nn)
    return np.array(P), np.array(N)


def smooth_path(P, k=2):
    P = np.array(P, float)
    for _ in range(k):
        P[1:-1] = (P[:-2] + P[1:-1] * 2 + P[2:]) / 4
    return P


# ---------------------------------------------------------------- defenders: plate carrier
def ct_kit(b, M, surf, make, L):
    kit = {}
    # front plate bag (shooter's-cut plate), riding on the chest
    fw, fh = 0.265, 0.32
    ftop = M.neck - 0.055
    fz0 = ftop - fh
    yf, s_f, k_f = fit_plate(surf, fw / 2 - 0.015, fz0 + 0.02, ftop - 0.03, True, 0.008)
    T_PLATE = 0.034
    ol = shooter_plate(fw, fh) + np.array([0, fz0])
    V, F, UV = pillow(ol, lambda u, v, h: np.array([u, yf(u, v) + h, v]), T_PLATE, edge=0.01, bulge=0.003)
    make('plate_front', V, F, 'carrier', 'chest', UV, closed=True)
    nf = lambda x, z: np.array([2 * k_f * x, 1.0, -s_f]) / np.linalg.norm([2 * k_f * x, 1.0, -s_f])
    front_pt = lambda x, z: np.array([x, yf(x, z) + T_PLATE, z])

    # back plate bag
    bw, bh = 0.27, 0.335
    btop = M.neck - 0.035
    bz0 = btop - bh
    yb, s_b, k_b = fit_plate(surf, bw / 2 - 0.015, bz0 + 0.02, btop - 0.03, False, 0.008)
    olb = shooter_plate(bw, bh, 0.045, 0.06, 0.02) + np.array([0, bz0])
    V, F, UV = pillow(olb, lambda u, v, h: np.array([u, yb(u, v) - h, v]), 0.03, edge=0.01, bulge=0.002)
    make('plate_back', V, F, 'carrier', 'chest', UV, closed=True)
    back_pt = lambda x, z: np.array([x, yb(x, z) - 0.03, z])

    # padded shoulder straps from plate to plate
    for sx in (-1, 1):
        x = sx * 0.095
        yc = (yf(x, ftop) + yb(x, btop)) / 2
        P, N = over_shoulder(surf, x, yc - 0.01, ftop - 0.07, 0.6, math.pi - 0.55, 30, 0.005)
        P = smooth_path(P, 3)
        V, F, UV = strap(P, N, 0.048, 0.011)
        make(f'shoulder_strap{sx}', V, F, 'carrier', 'chest', UV, closed=True)

    # cummerbund round the sides, between the plates, three rows of webbing
    cz0, cz1 = fz0 + 0.004, fz0 + 0.165
    for sx in (-1, 1):
        rows = []
        nrm = []
        for z in np.linspace(cz0, cz1, 5):
            c = torso_center(surf, z)
            fy, by_ = yf(fw / 2 - 0.03, z), yb(bw / 2 - 0.03, z)
            a0 = math.atan2(fw / 2 - 0.03, fy - c[1])
            a1 = math.pi - math.atan2(bw / 2 - 0.03, c[1] - by_)
            P, N = ring_path(surf, c, z, sx * a0, sx * a1, 14, 0.0)
            rows.append(P); nrm.append(N)
        n_ = min(len(r) for r in rows)
        G = np.array([r[:n_] for r in rows]); NN = np.array([r[:n_] for r in nrm])
        V, F, UV = sheet(G, NN, 0.007, 0.017, edge=0.004)
        make(f'cummerbund{sx}', V, F, 'molle', None, UV, closed=True)

    # open-top triple magazine pouch on the lower front, magazines and bungee retainers
    for i, x in enumerate((-0.077, 0.0, 0.077)):
        z0 = fz0 + 0.01
        zc = z0 + 0.06
        o = front_pt(x, zc)
        n = nf(x, zc)
        box_at(make, f'mag_pouch{i}', o, (1, 0, 0), n, (0.075, 0.04, 0.12), 0.008, 'pouch', 'chest', n=3, bulge=0.003, sag=0.002)
        mo = o + n * 0.02 + np.array([0, 0, 0.06 + 0.012])
        box_at(make, f'mag{i}', mo - n * 0.0115, (1, 0, 0), n, (0.064, 0.023, 0.05), 0.003, 'mag', 'chest', n=2)
        box_at(make, f'mag_base{i}', mo - n * 0.0135 + np.array([0, 0, 0.03]), (1, 0, 0), n, (0.069, 0.027, 0.012), 0.004, 'mag', 'chest', n=2)
        # bungee over the baseplate, with a pull tab hanging in front
        top = mo[2] + 0.037
        bx = x - 0.012
        P = [np.array([bx, 0, z0 + 0.12]) , np.array([bx, 0, top]), np.array([bx, 0, top + 0.002]), np.array([bx, 0, top]), np.array([bx, 0, z0 + 0.1])]
        ys = [o[1] - 0.001, o[1] + 0.006, o[1] + 0.02, o[1] + 0.033, o[1] + 0.043]
        for p, y in zip(P, ys):
            p[1] = y
        V, F, UV = tube(smooth_path(P, 1), 0.0022, 6)
        make(f'bungee{i}', V, F, 'cord', 'chest', UV, closed=True)
        box_at(make, f'pull_tab{i}', np.array([bx, o[1] + 0.041, z0 + 0.092]), (1, 0, 0), n, (0.014, 0.004, 0.024), 0.002, 'webbing', 'chest', n=1)

    # admin pouch with an ID panel, above the magazines
    zc = fz0 + 0.205
    o = front_pt(0.0, zc)
    box_at(make, 'admin', o, (1, 0, 0), nf(0, zc), (0.19, 0.024, 0.1), 0.007, 'pouch', 'chest', n=3, bulge=0.002)
    box_at(make, 'id_panel', o + nf(0, zc) * 0.024 + np.array([0, 0, 0.012]), (1, 0, 0), nf(0, zc), (0.152, 0.004, 0.046), 0.003, 'patch', 'chest', n=2)

    # radio pouch and radio on the left of the cummerbund, utility pouch on the right
    zc = cz0 + 0.075
    c = torso_center(surf, zc)
    p, n = surf.around(c, zc, -1.78)
    p = p + n * 0.017
    tang = np.cross([0, 0, 1], n)
    box_at(make, 'radio_pouch', p, tang, n, (0.072, 0.046, 0.14), 0.009, 'pouch', None, n=3, bulge=0.003)
    rp = p + n * 0.023 + np.array([0, 0, 0.03])
    box_at(make, 'radio', rp - n * 0.017, tang, n, (0.058, 0.034, 0.13), 0.006, 'radio', None, n=2)
    ant0 = rp + np.array([0, 0, 0.095]) - tang * 0.012
    V, F, UV = tube([ant0, ant0 + np.array([0, 0, 0.06]), ant0 + np.array([0, -0.004, 0.16])], 0.0055, 8, taper=lambda t: 1 - 0.55 * t)
    make('antenna', V, F, 'rubber', None, UV, closed=True)
    sh_front = np.array([-0.1, yf(-0.1, ftop) + 0.02, ftop + 0.01])
    cable = [rp + np.array([0, 0, 0.07]) + tang * 0.015, rp + np.array([0, 0.03, 0.14]) + n * 0.02, sh_front + np.array([-0.04, 0.02, -0.04]), sh_front]
    V, F, UV = tube(smooth_path(np.array(cable), 2), 0.0028, 6)
    make('ptt_cable', V, F, 'rubber', None, UV, closed=True)
    p, n = surf.around(c, zc - 0.01, 1.82)
    box_at(make, 'utility_pouch', p + n * 0.017, np.cross([0, 0, 1], n), n, (0.13, 0.06, 0.1), 0.012, 'pouch', None, n=3, bulge=0.004, sag=0.003)

    # back: zip-on panel and a drag handle
    zc = bz0 + 0.17
    bn = lambda x, z: -np.array([-2 * k_b * x, 1.0, -s_b]) / np.linalg.norm([-2 * k_b * x, 1.0, -s_b])
    box_at(make, 'back_panel', back_pt(0, zc), (-1, 0, 0), bn(0, zc), (0.22, 0.036, 0.26), 0.012, 'molle', 'chest', n=3, bulge=0.003)
    hp = back_pt(0, btop - 0.012)
    P = [hp + np.array([-0.05, 0.004, 0]), hp + np.array([-0.04, -0.012, 0.02]), hp + np.array([0, -0.018, 0.028]), hp + np.array([0.04, -0.012, 0.02]), hp + np.array([0.05, 0.004, 0])]
    V, F, UV = strap(smooth_path(P, 1), [[0, -0.4, 1]] * 5, 0.026, 0.006)
    make('drag_handle', V, F, 'webbing', 'chest', UV, closed=True)
    kit.update(ftop=ftop, fz0=fz0, front_pt=front_pt, nf=nf)
    return kit


# ---------------------------------------------------------------- defenders: belt, holster, knee pads
def battle_belt(b, M, surf, make, z=None, h=0.055, mat='belt'):
    z = M.waist if z is None else z
    c = torso_center(surf, z)
    P, N = ring_path(surf, c, z, -math.pi, math.pi, 49, 0.004)
    P, N = P[:-1], N[:-1]
    V, F, UV = strap(P, N, h, 0.013, closed=True)
    make('belt', V, F, mat, None, UV, closed=True)
    p0, n0 = surf.around(c, z, 0.0)
    box_at(make, 'buckle', p0 + n0 * 0.017, (1, 0, 0), n0, (0.058, 0.011, 0.042), 0.004, 'metal', 'hips', n=2)
    box_at(make, 'buckle_bar', p0 + n0 * 0.027, (1, 0, 0), n0, (0.04, 0.004, 0.012), 0.002, 'metal', 'hips', n=1)
    # double pistol magazine pouch front left, dump pouch back right
    p, n = surf.around(c, z, -0.62)
    t = np.cross([0, 0, 1], n)
    o = p + n * 0.017 + np.array([0, 0, 0.008])
    box_at(make, 'pistol_mags', o, t, n, (0.074, 0.034, 0.1), 0.007, 'pouch', 'hips', n=3, bulge=0.002)
    for k in (-1, 1):
        box_at(make, f'pistol_mag{k}', o + t * k * 0.018 + n * 0.006 + np.array([0, 0, 0.055]), t, n, (0.028, 0.02, 0.022), 0.003, 'mag', 'hips', n=1)
    p, n = surf.around(c, z - 0.01, 2.45)
    box_at(make, 'dump_pouch', p + n * 0.017, np.cross([0, 0, 1], n), n, (0.13, 0.05, 0.085), 0.016, 'pouch', 'hips', n=3, bulge=0.006, sag=0.004)


def thigh_ring(surf, b, side, z, off=0.003, n=28):
    h, t, ax = b.bone_frame(f'thigh_{side}') if z > b.skel[f'shin_{side}'][0][2] else b.bone_frame(f'shin_{side}')
    s = (z - h[2]) / ax[2]
    c = h + ax * s
    return ring_path(surf, c[:2], z, -math.pi, math.pi, n + 1, off)


def holster(b, M, surf, make):
    side = 'R'
    zc = 0.765
    hc = b.bone_frame('thigh_R')
    cc = hc[0] + hc[2] * ((zc - hc[0][2]) / hc[2][2])
    p, n = surf.ray(np.array([cc[0] + 0.5, cc[1] - 0.005, zc]), np.array([-1.0, 0, 0]))
    fwd = np.array([0, 1.0, 0])
    o, R = frame(p + n * 0.004, fwd, n)
    # platform, curved to the thigh
    ol = rounded_polygon([(-0.05, -0.08), (0.05, -0.08), (0.05, 0.08), (-0.05, 0.08)], 0.02, 4)
    V, F, UV = pillow(ol, lambda u, v, hh: o + R @ np.array([u, hh - 2.2 * u * u, v]), 0.009, edge=0.004, bulge=0.001)
    make('holster_platform', V, F, 'polymer', 'thigh_R', UV, closed=True)
    # holster shell with the pistol's grip and slide end showing
    tilt = 0.12
    Rt = R @ np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1.0]])
    def boxp(name, center, size, r, mat, rot=0.0, **kw):
        V, F, UV = rbox(size, r, **kw)
        ca, sa = math.cos(rot), math.sin(rot)
        Ry = np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])     # tilt in the platform plane (x fwd, z up)
        V = V @ Ry.T + np.asarray(center)
        make(name, V @ Rt.T + o, F, mat, 'thigh_R', UV, closed=True)
    boxp('holster_shell', (0.008, 0.026, -0.005), (0.06, 0.036, 0.175), 0.012, 'polymer', tilt, n=3, bulge=0.002)
    boxp('holster_hood', (-0.006, 0.03, 0.07), (0.046, 0.044, 0.03), 0.01, 'polymer', tilt, n=2)
    boxp('pistol_slide', (0.018, 0.026, 0.09), (0.05, 0.026, 0.026), 0.004, 'gunmetal', tilt, n=2)
    boxp('pistol_grip', (-0.016, 0.026, 0.12), (0.03, 0.03, 0.1), 0.007, 'gunmetal', -0.32, n=2)
    # hanger from the belt and two leg straps
    top = o + R @ np.array([0, 0.004, 0.085])
    P = []
    Nn = []
    for z in np.linspace(M.waist - 0.02, top[2] - 0.005, 8):
        q, nq = surf.ray(np.array([top[0] + 0.5, top[1], z]), np.array([-1.0, 0, 0]))
        if q is not None:
            P.append(q + nq * 0.003); Nn.append(nq)
    if len(P) > 2:
        V, F, UV = strap(P, Nn, 0.04, 0.004)
        make('holster_hanger', V, F, 'webbing', None, UV, closed=True)
    for z in (0.705, 0.825):
        P, N = thigh_ring(surf, b, side, z, 0.003)
        V, F, UV = strap(P[:-1], N[:-1], 0.026, 0.003, closed=True)
        make(f'leg_strap{z}', V, F, 'webbing', None, UV, closed=True)


def knee_pads(b, M, surf, make):
    for side in ('L', 'R'):
        h, t, ax = b.bone_frame(f'shin_{side}')
        z = h[2] + 0.005
        p, n = surf.ray(np.array([h[0], 0.6, z]), np.array([0, -1.0, 0]))
        o, R = frame(p + n * 0.003, (1, 0, 0), n)
        ol = rounded_polygon([(-0.052, -0.085), (0.052, -0.085), (0.052, 0.07), (-0.052, 0.07)], 0.042, 6)
        V, F, UV = pillow(ol, lambda u, v, hh: o + R @ np.array([u, hh - 3.4 * u * u - 1.6 * v * v, v]), 0.017, edge=0.006, bulge=0.004)
        make(f'knee_pad_{side}', V, F, 'kneepad', f'shin_{side}', UV, closed=True)
        for zz, bone in ((z + 0.085, None), (z - 0.075, f'shin_{side}')):
            P, N = thigh_ring(surf, b, side, zz, 0.002)
            V, F, UV = strap(P[:-1], N[:-1], 0.022, 0.003, closed=True)
            make(f'knee_strap_{side}{zz:.2f}', V, F, 'elastic', bone, UV, closed=True)


# ---------------------------------------------------------------- head: helmet, headset, eyewear
class HeadShape:
    """Smoothed head surface from the head loft: points and normals by (z, angle index)."""

    def __init__(self, L, smooth=8):
        self.L = L
        R = L.r.copy()
        for _ in range(smooth):
            R[1:-1] = (R[:-2] + R[1:-1] * 2 + R[2:]) / 4
            R = (np.roll(R, 1, axis=1) + R * 2 + np.roll(R, -1, axis=1)) / 4
        self.R = R
        self.crown = L.z[-1]
        self.n = len(L.a)

    def j_of(self, a):
        return int(np.argmin(np.abs(((self.L.a - a) + math.pi) % (2 * math.pi) - math.pi)))

    def base(self, z, a):
        L = self.L
        aa = (np.asarray(a) + math.pi) % (2 * math.pi) - math.pi
        # interpolate the radius table in angle as well as height
        ja = (aa + math.pi) / (2 * math.pi) * self.n
        j0 = int(math.floor(ja)) % self.n; j1 = (j0 + 1) % self.n; f = ja - math.floor(ja)
        r = np.interp(z, L.z, self.R[:, j0]) * (1 - f) + np.interp(z, L.z, self.R[:, j1]) * f
        cx = np.interp(z, L.z, L.c[:, 0]); cy = np.interp(z, L.z, L.c[:, 1])
        return np.array([cx + math.sin(aa) * r, cy + math.cos(aa) * r, z])

    def point(self, z, a, off=0.0):
        p = self.base(z, a)
        da, dz = 0.02, 0.004
        tu = self.base(z, a + da) - self.base(z, a - da)
        tv = self.base(min(self.crown, z + dz), a) - self.base(z - dz, a)
        nrm = np.cross(tu, tv)
        nrm /= np.linalg.norm(nrm)
        out = p - np.array([np.interp(z, self.L.z, self.L.c[:, 0]), np.interp(z, self.L.z, self.L.c[:, 1]), p[2] - 0.05])
        if nrm @ out < 0:
            nrm = -nrm
        return p + nrm * off, nrm


def helmet_rim(M):
    def zrim(a):
        aa = abs((a + math.pi) % (2 * math.pi) - math.pi)
        return M.eye[2] + 0.04 + 0.024 * math.exp(-((aa - 1.57) / 0.42) ** 2) - 0.052 * C.smoothstep(2.2, 2.95, aa)
    return zrim


def helmet(b, M, L, make, mat='helmet'):
    """High-cut ballistic helmet: shell over the balaclava with a rubber edge,
    side rails, a front shroud, loop panels and a rear counterweight pouch."""
    hs = HeadShape(L, smooth=10)
    zrim = helmet_rim(M)
    n, rows = 56, 14
    outer, inner = 0.028, 0.017
    angs = np.linspace(-math.pi, math.pi, n, endpoint=False)
    top = hs.crown - 0.004
    G, NG = np.zeros((rows + 1, n, 3)), np.zeros((rows + 1, n, 3))
    for j, a in enumerate(angs):
        z0 = zrim(a)
        for i in range(rows + 1):
            t = i / rows
            z = z0 + (top - z0) * (1 - (1 - t) ** 1.35)
            G[i, j], NG[i, j] = hs.point(z, a)
    apex = np.array([*L.c[-1], hs.crown])
    V, UV, F = [], [], []

    def add(p, uv):
        V.append(p); UV.append(uv)
        return len(V) - 1
    ro = [[add(G[i, j] + NG[i, j] * outer, (angs[j] * 0.1, G[i, j][2])) for j in range(n)] for i in range(rows + 1)]
    ri = [[add(G[i, j] + NG[i, j] * inner, (angs[j] * 0.1 + 1, G[i, j][2])) for j in range(n)] for i in range(rows + 1)]
    rim = [add(G[0, j] + NG[0, j] * (outer + inner) / 2 - np.array([0, 0, 0.004]), (angs[j] * 0.1, 0)) for j in range(n)]
    ao = add(apex + np.array([0, 0, outer]), (0, 2)); ai = add(apex + np.array([0, 0, inner]), (0, 3))
    for i in range(rows):
        for j in range(n):
            j2 = (j + 1) % n
            F.append([ro[i][j], ro[i][j2], ro[i + 1][j2], ro[i + 1][j]])
            F.append([ri[i][j], ri[i + 1][j], ri[i + 1][j2], ri[i][j2]])
    for j in range(n):
        j2 = (j + 1) % n
        F.append([ro[rows][j], ro[rows][j2], ao])
        F.append([ri[rows][j2], ri[rows][j], ai])
        F.append([rim[j], rim[j2], ro[0][j2], ro[0][j]])
        F.append([ri[0][j], ri[0][j2], rim[j2], rim[j]])
    make('helmet', np.array(V), F, mat, 'head', np.array(UV), closed=True)
    # rubber edge trim
    P = [G[0, j] + NG[0, j] * (outer + inner) / 2 - np.array([0, 0, 0.002]) for j in range(n)]
    Nn = [NG[0, j] for j in range(n)]
    Vt, Ft, UVt = strap(P, Nn, 0.007, 0.013, closed=True)
    make('helmet_trim', Vt - np.array([NG[0, j] * 0.0065 for j in range(n) for _ in range(6)]), Ft, 'rubber', 'head', UVt, closed=True)
    # side rails along the rim, above the ears
    for sx in (-1, 1):
        aa = np.linspace(sx * 0.62, sx * 2.45, 22)
        P, Nn = [], []
        for a in aa:
            p, nn = hs.point(zrim(a) + 0.014, a, outer + 0.0035)
            P.append(p); Nn.append(nn)
        Vr, Fr, UVr = strap(smooth_path(P, 1), Nn, 0.02, 0.007, rounded=False)
        make(f'rail{sx}', Vr, Fr, 'polymer', 'head', UVr, closed=True)
    # front shroud
    p, nn = hs.point(zrim(0) + 0.024, 0.0, outer)
    box_at(make, 'shroud', p, (1, 0, 0), nn, (0.062, 0.007, 0.042), 0.006, 'polymer', 'head', n=2)
    box_at(make, 'shroud_slot', p + nn * 0.007, (1, 0, 0), nn, (0.032, 0.006, 0.016), 0.003, 'metal', 'head', n=1)
    # loop panel on top and both sides, counterweight pouch at the back
    for (z, a, w, h_, name) in ((top - 0.035, math.pi, 0.11, 0.07, 'loop_top'), (zrim(1.45) + 0.05, 1.45, 0.07, 0.04, 'loop_r'), (zrim(-1.45) + 0.05, -1.45, 0.07, 0.04, 'loop_l')):
        p, nn = hs.point(z, a, outer)
        x_ax = np.cross([0, 0, 1], nn) if abs(nn[2]) < 0.9 else np.array([1.0, 0, 0])
        box_at(make, name, p, x_ax, nn, (w, 0.003, h_), 0.008, 'velcro', 'head', n=2)
    p, nn = hs.point(zrim(math.pi) + 0.04, math.pi, outer)
    box_at(make, 'counterweight', p, np.cross([0, 0, 1], nn), nn, (0.1, 0.034, 0.066), 0.012, 'pouch', 'head', n=3, bulge=0.003)
    # chin harness: straps from the shell down the cheeks to a cup under the chin
    for sx in (-1, 1):
        pts = []
        nrms = []
        for t in np.linspace(0, 1, 9):
            a = sx * (1.25 - 0.95 * t)
            z = zrim(sx * 1.25) - t * (zrim(sx * 1.25) - (M.eye[2] - 0.12))
            p, nn = hs.point(z, a, 0.0045)
            pts.append(p); nrms.append(nn)
        Vs, Fs, UVs = strap(smooth_path(pts, 1), nrms, 0.016, 0.0025)
        make(f'chin_strap{sx}', Vs, Fs, 'webbing', 'head', UVs, closed=True)
    p, nn = hs.point(M.eye[2] - 0.125, 0.0, 0.004)
    box_at(make, 'chin_cup', p, (1, 0, 0), nn, (0.05, 0.012, 0.032), 0.006, 'webbing', 'head', n=2)
    return hs, zrim


def headset(b, M, hs, zrim, make):
    """Electronic hearing protection: cups over the ears hung from the rails, boom mic on the left."""
    for sx in (-1, 1):
        a = sx * 1.57
        zc = M.eye[2] - 0.012
        p, nn = hs.point(zc, a, 0.003)
        t = np.cross([0, 0, 1], nn)
        box_at(make, f'ear_cup{sx}', p, t, nn, (0.068, 0.036, 0.084), 0.03, 'rubber', 'head', n=4, bulge=0.002)
        box_at(make, f'ear_cover{sx}', p + nn * 0.034, t, nn, (0.05, 0.007, 0.062), 0.022, 'polymer', 'head', n=3)
        rp, rn = hs.point(zrim(a) + 0.014, a, 0.03)
        arm0 = p + nn * 0.02 + np.array([0, 0, 0.04])
        V, F, UV = strap([arm0, (arm0 + rp) / 2 + nn * 0.004, rp], [nn, nn, nn], 0.014, 0.006)
        make(f'cup_arm{sx}', V, F, 'polymer', 'head', UV, closed=True)
    # boom mic from the left cup round to the mouth
    p, nn = hs.point(M.eye[2] - 0.03, -1.57, 0.03)
    mouth, mn = hs.point(M.eye[2] - 0.085, -0.18, 0.025)
    mid, _ = hs.point(M.eye[2] - 0.07, -0.9, 0.03)
    V, F, UV = tube(smooth_path([p, mid, mouth], 1), 0.0026, 6)
    make('boom', V, F, 'rubber', 'head', UV, closed=True)
    box_at(make, 'mic', mouth, (1, 0, 0), mn, (0.024, 0.018, 0.016), 0.007, 'foam', 'head', n=2)


def eyewear(b, M, L, make, style='ballistic'):
    """Wraparound glasses: one curved lens (ballistic) or two lobes with a
    bridge (sunglasses), a frame along the top and arms back to the ears."""
    hs = HeadShape(L, smooth=2)
    zc = M.eye[2] + 0.003
    gap = 0.014 if style == 'ballistic' else 0.011
    span = 1.05 if style == 'ballistic' else 0.92
    cols, rows = 26, 6
    G, NG = [], []
    for i in range(rows + 1):
        rowp, rown = [], []
        for j in range(cols + 1):
            a = -span + 2 * span * j / cols
            if style == 'ballistic':
                top = 0.021 - 0.006 * a * a
                bot = -0.024 + 0.012 * math.exp(-(a / 0.16) ** 2) + 0.004 * a * a
            else:
                # two lenses meeting at a narrow bridge, each dipping toward the cheek
                top = 0.016 - 0.004 * a * a - 0.003 * math.exp(-(a / 0.12) ** 2)
                lobe = math.exp(-((abs(a) - 0.42) / 0.3) ** 2)
                bot = -0.008 - 0.014 * lobe + 0.019 * math.exp(-(a / 0.1) ** 2) + 0.006 * a * a
            h = bot + (top - bot) * i / rows
            p, nn = hs.point(zc + h, a, 0.0)
            # lenses stand off the face a fixed distance at the front, closer at the sides
            off = gap + 0.006 * math.cos(a)
            rowp.append(p + nn * off); rown.append(nn)
        G.append(rowp); NG.append(rown)
    V, F, UV = sheet(np.array(G), np.array(NG), 0.0, 0.0022, edge=0.0006)
    make('lens', V, F, 'lens', 'head', UV, closed=True)
    # top bar of the frame
    P = [G[rows][j] for j in range(cols + 1)]
    V, F, UV = strap(P, [NG[rows][j] for j in range(cols + 1)], 0.006, 0.004)
    make('glasses_frame', V, F, 'frame', 'head', UV, closed=True)
    # arms back to the ears
    for sx in (-1, 1):
        pts, nrm = [], []
        for t in np.linspace(0, 1, 8):
            a = sx * (span + 1.0 * t)
            p, nn = hs.point(zc + 0.012 - 0.008 * t, a, 0.006 + gap * (1 - t) * 0.6)
            pts.append(p); nrm.append(nn)
        V, F, UV = strap(pts, nrm, 0.007, 0.003)
        make(f'glasses_arm{sx}', V, F, 'frame', 'head', UV, closed=True)


# ---------------------------------------------------------------- attackers: canvas chest rig
def chest_rig(b, M, surf, make, z0=1.02, z1=1.2):
    """AK-pattern chest rig: a canvas panel across the stomach carrying three
    magazine pouches between pairs of grenade pouches, straps crossed on the back."""
    rows, nrm = [], []
    for z in np.linspace(z0, z1, 6):
        c = torso_center(surf, z)
        P, N = ring_path(surf, c, z, -1.95, 1.95, 21, 0.0)
        rows.append(P); nrm.append(N)
    n_ = min(len(r) for r in rows)
    G = np.array([r[:n_] for r in rows]); NN = np.array([r[:n_] for r in nrm])
    V, F, UV = sheet(G, NN, 0.008, 0.016, edge=0.003)
    make('rig_panel', V, F, 'canvas', None, UV, closed=True)

    def pouch(name, x_or_a, size, by_angle=False, flap=True):
        zc = z0 + 0.004 + size[2] / 2
        if by_angle:
            c = torso_center(surf, zc)
            p, n = surf.around(c, zc, x_or_a)
        else:
            p, n = surf.front(x_or_a, zc)
        p = p + n * 0.016
        t = np.cross([0, 0, 1], n)
        box_at(make, name, p, t, n, size, 0.011, 'canvas', None, n=3, bulge=0.005, sag=0.003)
        if flap:
            topc = p + np.array([0, 0, size[2] / 2 + 0.004]) + n * (size[1] / 2 + 0.002)
            box_at(make, name + '_lid', topc - n * (size[1] / 2 + 0.004), t, n, (size[0] + 0.006, size[1] + 0.008, 0.01), 0.004, 'canvas', None, n=2)
            lip = p + n * (size[1] + 0.001) + np.array([0, 0, size[2] / 2 - 0.022])
            box_at(make, name + '_flap', lip, t, n, (size[0] + 0.004, 0.006, 0.05), 0.004, 'canvas', None, n=2, bulge=0.001)
            box_at(make, name + '_toggle', lip + n * 0.006 + np.array([0, 0, -0.03]), t, n, (0.011, 0.008, 0.024), 0.004, 'wood', None, n=1)
    for i, x in enumerate((-0.09, 0.0, 0.09)):
        pouch(f'ak_pouch{i}', x, (0.083, 0.05, 0.165))
    for i, a in enumerate((-1.55, -1.1, 1.1, 1.55)):
        pouch(f'nade_pouch{i}', a, (0.066, 0.058, 0.11), by_angle=True)
    # straps: from the panel top up over each shoulder and crossed down the back
    for sx in (-1, 1):
        x = sx * 0.105
        c = torso_center(surf, z1)
        P1, N1 = over_shoulder(surf, x, c[1] - 0.01, z1 + 0.06, 0.25, math.pi / 2 + 0.25, 12, 0.004)
        P2, N2 = [], []
        start = P1[-1]
        end_c = torso_center(surf, z1 - 0.01)
        e, en = surf.around(end_c, z1 - 0.01, -sx * 1.9)
        for t in np.linspace(0.08, 1, 10):
            q = start * (1 - t) + e * t
            p, n = surf.back(q[0], q[2])
            if p is not None:
                P2.append(p + n * 0.004); N2.append(n)
        P = np.concatenate([P1, np.array(P2)])
        N = np.concatenate([N1, np.array(N2)])
        V, F, UV = strap(smooth_path(P, 2), N, 0.038, 0.004)
        make(f'rig_strap{sx}', V, F, 'canvas', None, UV, closed=True)
    # waist strap round the back
    zc = z0 + 0.05
    c = torso_center(surf, zc)
    P, N = ring_path(surf, c, zc, 1.85, 2 * math.pi - 1.85, 14, 0.003)
    V, F, UV = strap(P, N, 0.025, 0.003)
    make('rig_waist', V, F, 'webbing', None, UV, closed=True)
