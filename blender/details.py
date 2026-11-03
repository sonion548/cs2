"""Small-scale detail for the map builder: grime along the foot of every wall,
dirt on the floor beside it, stains and cracks on the ground, street clutter
(rubble, planks, sacks, pallets, tyres, boxes, gas bottles, carts, litter,
manholes, gutters), fixtures on the walls (air conditioners, electrics, pipes,
cables, vents, posters, shop signs, spray paint) and painted A/B direction
signs at junctions. Uses its own random stream, so the rest of the map stays
exactly as it was.

Everything is placed relative to a wall face seen from the street cell in
front of it: u runs along the face to the viewer's right (0..S), y is height
above that cell's floor and d is distance out from the wall.
"""
import math
import random
from collections import deque

INTERIOR = 'hD'
WALKABLE = '.,usABTKhD'
# atlas tiles are (column, row) with row 0 at the top of the canvas
DECAL = {'oil': [(0, 0), (1, 0)], 'water': [(2, 0)], 'sand': [(3, 0)], 'crack': [(0, 1), (1, 1), (2, 1), (3, 1)],
         'scorch': [(0, 2), (1, 2)], 'drain': [(2, 2)], 'grit': [(3, 2)], 'rust': [(0, 3)], 'dirt': [(1, 3)],
         'steps': [(2, 3)], 'puddle': [(3, 3)]}
POSTER = {'poster': [(0, 0), (1, 0), (2, 0), (3, 0)], 'arrow': {('A', -1): (0, 1), ('A', 1): (1, 1), ('B', -1): (2, 1), ('B', 1): (3, 1)},
          'board': [(0, 2), (1, 2)], 'warning': (2, 2), 'plate': (3, 2), 'spray': [(0, 3), (1, 3)], 'stencil': [(2, 3), (3, 3)]}


def atlas_uv(tile, s, t, n=4):
    """UV inside an atlas tile; s runs left to right, t bottom to top as you look at it."""
    col, row = tile
    return ((col + s) / n, (n - 1 - row + t) / n)


class Face:
    def __init__(self, x, z, dx, dz, S, base):
        self.x, self.z, self.dx, self.dz, self.S, self.base = x, z, dx, dz, S, base
        self.n = (-dx, -dz)                    # out of the wall, toward the viewer
        self.r = (-dz, dx)                     # the viewer's right
        cx, cz = x * S + S / 2 + dx * S / 2, z * S + S / 2 + dz * S / 2
        self.o = (cx - self.r[0] * S / 2, cz - self.r[1] * S / 2)
        # the facade loop's key for this face (see build() in map.py)
        if dx:
            self.key = ('x', round((x + (1 if dx > 0 else 0)) * S, 2), round(z * S + S / 2, 2))
        else:
            self.key = ('z', round((z + (1 if dz > 0 else 0)) * S, 2), round(x * S + S / 2, 2))

    def p(self, u, y, d=0.0):
        return (self.o[0] + self.r[0] * u + self.n[0] * d, self.base + y, self.o[1] + self.r[1] * u + self.n[1] * d)

    def box(self, B, mat, u0, y0, d0, u1, y1, d1, collide=None, rot=0.0):
        a, b = self.p(u0, y0, d0), self.p(u1, y1, d1)
        B.box(mat, min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2]), max(a[0], b[0]), max(a[1], b[1]), max(a[2], b[2]), collide, rot=rot)

    def collider(self, B, u0, y0, d0, u1, y1, d1, tag):
        a, b = self.p(u0, y0, d0), self.p(u1, y1, d1)
        B.colliders.append([round(min(a[0], b[0]), 3), round(min(a[1], b[1]), 3), round(min(a[2], b[2]), 3),
                            round(max(a[0], b[0]), 3), round(max(a[1], b[1]), 3), round(max(a[2], b[2]), 3), tag])

    def wall_quad(self, B, mat, u0, y0, u1, y1, d, uvs):
        """Flat quad on (or just off) the wall, facing the street."""
        B.uvquad(mat, [self.p(u0, y0, d), self.p(u1, y0, d), self.p(u1, y1, d), self.p(u0, y1, d)], uvs)

    def floor_quad(self, B, mat, u0, d0, u1, d1, y, uvs):
        B.uvquad(mat, [self.p(u0, y, d0), self.p(u1, y, d0), self.p(u1, y, d1), self.p(u0, y, d1)], uvs)

    def cyl_along(self, B, mat, u0, u1, y, d, r, segs=8):
        """Cylinder lying along the face (a pipe), axis at height y and distance d."""
        a, b = self.p(u0, y, d), self.p(u1, y, d)
        if self.dx:   # face runs along z
            B.cylinder(mat, a[0], a[1], min(a[2], b[2]), r, abs(b[2] - a[2]), segs=segs, axis='z')
        else:
            B.cylinder(mat, min(a[0], b[0]), a[1], a[2], r, abs(b[0] - a[0]), segs=segs, axis='x')

    def cyl_out(self, B, mat, u, y, d0, d1, r, segs=12):
        """Cylinder sticking out of the wall (wheel hubs, fan hubs)."""
        a, b = self.p(u, y, d0), self.p(u, y, d1)
        if self.dx:
            B.cylinder(mat, min(a[0], b[0]), a[1], a[2], r, abs(b[0] - a[0]), segs=segs, axis='x')
        else:
            B.cylinder(mat, a[0], a[1], min(a[2], b[2]), r, abs(b[2] - a[2]), segs=segs, axis='z')


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def _mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def _cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def _norm(a):
    L = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1.0
    return (a[0] / L, a[1] / L, a[2] / L)


def rod(B, mat, a, b, w, h=None):
    """Thin beam from point a to point b (cables, braces, leaning planks)."""
    h = h if h is not None else w
    L = _sub(b, a)
    ax = _mul(L, 0.5)
    side = _norm(_cross(_norm(L), (0, 1, 0))) if abs(_norm(L)[1]) < 0.95 else (1, 0, 0)
    up = _norm(_cross(side, _norm(L)))
    B.obox(mat, _mul(_add(a, b), 0.5), ax, _mul(side, w / 2), _mul(up, h / 2))


def build_details(B, grid, S, at, fh, lvl, faces_kind, occupied):
    rnd = random.Random(9091)
    H, W = len(grid), len(grid[0])
    street = lambda x, z: at(x, z) not in '#' + INTERIOR
    walk = lambda x, z: at(x, z) in WALKABLE
    stats = {'faces': 0, 'clutter': 0, 'fixtures': 0, 'decals': 0, 'signs': 0}

    faces = []
    for z in range(H):
        for x in range(W):
            if not street(x, z) or at(x, z) in 'cC':
                continue
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if at(x + dx, z + dz) == '#':
                    faces.append(Face(x, z, dx, dz, S, fh(x, z)))
    stats['faces'] = len(faces)

    # ---------------------------------------------------------------- grime and dirt
    for F in faces:
        hg = rnd.uniform(1.5, 2.5)
        u0 = rnd.random() * 4
        uv = lambda v0, v1: [(u0, v0), (u0 + 1, v0), (u0 + 1, v1), (u0, v1)]
        if F.base < 0.53:     # the plinth (0.55 m, absolute) shows above this floor
            top = 0.55 - F.base
            F.wall_quad(B, 'grime', 0, 0, S, top, 0.083, uv(0, top / hg))
        start = max(0.0, 0.55 - F.base)
        if hg > start + 0.1:
            F.wall_quad(B, 'grime', 0, start, S, hg, 0.012, uv(start / hg, 1))
        dw = rnd.uniform(1.4, 2.1)
        F.floor_quad(B, 'dirt', 0, 0, S, dw, 0.007, [(u0, 0), (u0 + 1, 0), (u0 + 1, 1), (u0, 1)])

    # ---------------------------------------------------------------- ground decals
    def ground_decal(x, z, kind, size, y_off=0.0):
        tile = rnd.choice(DECAL[kind])
        fy = fh(x, z) + 0.009 + rnd.random() * 0.004 + y_off
        # keep the rotated square inside the cell
        half = min(size / 2, S / 2 / 1.42 * 1.0)
        room = S / 2 - half * 1.42
        cx = x * S + S / 2 + rnd.uniform(-room, room) if room > 0 else x * S + S / 2
        cz = z * S + S / 2 + rnd.uniform(-room, room) if room > 0 else z * S + S / 2
        a = rnd.random() * math.pi * 2
        ca, sa = math.cos(a) * half, math.sin(a) * half
        pts = [(cx - ca + sa, fy, cz - sa - ca), (cx + ca + sa, fy, cz + sa - ca), (cx + ca - sa, fy, cz + sa + ca), (cx - ca - sa, fy, cz - sa + ca)]
        B.uvquad('decal', pts, [atlas_uv(tile, 0, 0), atlas_uv(tile, 1, 0), atlas_uv(tile, 1, 1), atlas_uv(tile, 0, 1)])
        stats['decals'] += 1

    for z in range(H):
        for x in range(W):
            c = at(x, z)
            if not street(x, z) or c in 'cC':
                continue
            hard = c in '.uABK'
            r = rnd.random()
            if r < 0.11 and hard:
                ground_decal(x, z, 'crack', rnd.uniform(1.6, 2.8))
            elif r < 0.16:
                ground_decal(x, z, 'oil' if c != ',' else 'dirt', rnd.uniform(1.0, 2.2))
            elif r < 0.22 and c in '.ABK':
                ground_decal(x, z, 'sand', rnd.uniform(1.8, 2.8))
            elif r < 0.26:
                ground_decal(x, z, 'grit', rnd.uniform(1.2, 2.0))
            elif r < 0.29 and c == 'u':
                ground_decal(x, z, 'puddle', rnd.uniform(1.2, 2.2))
            elif r < 0.31 and c in 'AB.':
                ground_decal(x, z, 'scorch', rnd.uniform(1.4, 2.4))
            elif r < 0.34 and c in 'u.K':
                ground_decal(x, z, 'steps', rnd.uniform(1.4, 2.0))
            if rnd.random() < 0.12:
                ground_decal(x, z, 'dirt', rnd.uniform(1.6, 2.8), 0.001)

    # ---------------------------------------------------------------- clutter along walls
    def narrow(F):
        # a one-cell corridor across this face: keep big things out of it
        return at(F.x - F.dx, F.z - F.dz) == '#'

    def litter(x, z):
        for k in range(rnd.randint(1, 3)):
            cx = x * S + rnd.uniform(0.4, S - 0.4); cz = z * S + rnd.uniform(0.4, S - 0.4)
            y = fh(x, z) + 0.006 + rnd.random() * 0.006
            a = rnd.random() * math.pi; w, l = rnd.uniform(0.05, 0.08), rnd.uniform(0.07, 0.11)
            ca, sa = math.cos(a), math.sin(a)
            pts = [(cx + (-w * ca + l * sa), y + rnd.random() * 0.01, cz + (-w * sa - l * ca)),
                   (cx + (w * ca + l * sa), y, cz + (w * sa - l * ca)),
                   (cx + (w * ca - l * sa), y + rnd.random() * 0.012, cz + (w * sa + l * ca)),
                   (cx + (-w * ca - l * sa), y, cz + (-w * sa + l * ca))]
            B.quad('paper', pts)
        if rnd.random() < 0.5:
            cx = x * S + rnd.uniform(0.6, S - 0.6); cz = z * S + rnd.uniform(0.6, S - 0.6)
            y = fh(x, z)
            mat = rnd.choice(['paint_red', 'paint_blue', 'paint'])
            if rnd.random() < 0.5:
                B.cylinder(mat, cx, y, cz, 0.033, 0.12, segs=8)
            else:
                B.cylinder(mat, cx, y + 0.033, cz, 0.033, 0.12, segs=8, axis='x' if rnd.random() < 0.5 else 'z')
        if rnd.random() < 0.3:
            cx = x * S + rnd.uniform(0.6, S - 0.6); cz = z * S + rnd.uniform(0.6, S - 0.6)
            B.lathe_y('glass', cx, fh(x, z), cz, [(0, 0.034), (0.17, 0.034), (0.21, 0.015), (0.27, 0.013)], 8)

    def rubble(F, u):
        for k in range(rnd.randint(5, 10)):
            uu = u + rnd.uniform(-0.7, 0.7); d = rnd.uniform(0.08, 0.6)
            s = rnd.uniform(0.06, 0.2) * (1.4 if d < 0.25 else 1)
            cx, cy, cz = F.p(uu, 0, d)
            B.box(rnd.choice(['stone', 'stone', 'sandstone', 'trim']), cx - s, cy, cz - s * 0.8, cx + s, cy + s * rnd.uniform(0.7, 1.4), cz + s * 0.8, rot=rnd.random() * 3)
        for k in range(rnd.randint(1, 3)):   # broken bricks
            cx, cy, cz = F.p(u + rnd.uniform(-0.9, 0.9), 0, rnd.uniform(0.3, 0.9))
            B.box('terracotta', cx - 0.11, cy, cz - 0.05, cx + 0.11, cy + 0.065, cz + 0.05, rot=rnd.random() * 3)

    def planks(F, u):
        for k in range(rnd.randint(2, 3)):
            L = rnd.uniform(1.9, 2.6); a = math.radians(rnd.uniform(66, 80))
            uu = u + k * 0.24 + rnd.uniform(-0.05, 0.05)
            foot = F.p(uu, 0.0, L * math.cos(a) + 0.02)
            top = F.p(uu + rnd.uniform(-0.15, 0.15), L * math.sin(a), 0.03)
            rod(B, rnd.choice(['wood', 'darkwood']), foot, top, rnd.uniform(0.16, 0.24), 0.03)

    def sacks(F, u):
        n = rnd.randint(2, 4)
        for k in range(n):
            uu = u - (n - 1) * 0.3 + k * 0.6 + rnd.uniform(-0.04, 0.04)
            F.box(B, 'cloth_sand', uu - 0.29, 0, 0.08, uu + 0.29, 0.24, 0.5, rot=rnd.uniform(-0.1, 0.1))
            F.box(B, 'cloth_sand', uu - 0.24, 0.24, 0.12, uu + 0.24, 0.29, 0.46)
        for k in range(n - 1 if rnd.random() < 0.7 else 0):
            uu = u - (n - 2) * 0.3 + k * 0.6
            F.box(B, 'cloth_sand', uu - 0.28, 0.29, 0.1, uu + 0.28, 0.52, 0.48, rot=rnd.uniform(-0.15, 0.15))
        F.collider(B, u - n * 0.3, 0, 0.05, u + n * 0.3, 0.52, 0.52, 'sacks')

    def pallets(F, u):
        n = rnd.randint(2, 5)
        for k in range(n):
            y = k * 0.145
            for dd in (0.06, 0.4, 0.74):
                F.box(B, 'wood', u - 0.6, y, dd - 0.05, u + 0.6, y + 0.1, dd + 0.05)
            for j in range(6):
                uu = u - 0.55 + j * 0.22
                F.box(B, rnd.choice(['wood', 'wood', 'darkwood']), uu - 0.055, y + 0.1, 0.0, uu + 0.055, y + 0.125, 0.8)
        F.collider(B, u - 0.6, 0, 0.0, u + 0.6, n * 0.145, 0.8, 'pallets')

    def tyres(F, u):
        n = rnd.randint(1, 3)
        cx, cy, cz = F.p(u, 0, 0.42)
        for k in range(n):
            ox, oz = rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04)
            B.lathe_y('rubber', cx + ox, cy + k * 0.22, cz + oz, [(0, 0.2), (0, 0.31), (0.03, 0.35), (0.19, 0.35), (0.22, 0.31), (0.22, 0.2), (0.12, 0.19)], 14)
        F.collider(B, u - 0.36, 0, 0.06, u + 0.36, n * 0.22, 0.78, 'tyres')

    def boxes(F, u):
        y = 0.0
        for k in range(rnd.randint(1, 3)):
            s = rnd.uniform(0.32, 0.55); h = s * rnd.uniform(0.7, 1.0)
            uu = u + rnd.uniform(-0.15, 0.15)
            F.box(B, 'cardboard', uu - s / 2, y, 0.05, uu + s / 2, y + h, 0.05 + s, rot=rnd.uniform(-0.2, 0.2))
            F.box(B, 'paper', uu - s / 2 + 0.02, y + h, 0.05 + s / 2 - 0.03, uu + s / 2 - 0.02, y + h + 0.004, 0.05 + s / 2 + 0.03)
            y += h
            if rnd.random() < 0.4:
                break
        if y > 0.5:
            F.collider(B, u - 0.35, 0, 0.05, u + 0.35, y, 0.65, 'boxes')
        if rnd.random() < 0.5:   # a flattened box on the ground
            F.box(B, 'cardboard', u + 0.4, 0, 0.3, u + 1.15, 0.012, 0.85, rot=rnd.uniform(-0.4, 0.4))

    def bottles(F, u):
        mat = rnd.choice(['paint_blue', 'paint_red'])
        n = rnd.randint(2, 3)
        for k in range(n):
            cx, cy, cz = F.p(u - 0.3 + k * 0.32, 0, 0.2)
            B.lathe_y(mat, cx, cy, cz, [(0, 0.14), (1.0, 0.14), (1.1, 0.11), (1.17, 0.05), (1.2, 0.035)], 12)
            B.cylinder('iron', cx, cy + 1.2, cz, 0.022, 0.08, segs=6)
        F.collider(B, u - 0.46, 0, 0.05, u - 0.3 + (n - 1) * 0.32 + 0.16, 1.28, 0.35, 'gas')

    def cart(F, u):
        F.box(B, 'wood', u - 0.75, 0.42, 0.1, u + 0.75, 0.5, 0.9)
        for dd in (0.1, 0.86):
            F.box(B, 'darkwood', u - 0.75, 0.5, dd, u + 0.75, 0.72, dd + 0.04)
        for uu in (-0.73, 0.69):
            F.box(B, 'darkwood', u + uu, 0.5, 0.1, u + uu + 0.04, 0.72, 0.9)
        F.cyl_out(B, 'darkwood', u - 0.15, 0.36, 0.0, 0.08, 0.36, 14)
        F.cyl_out(B, 'darkwood', u - 0.15, 0.36, 0.92, 1.0, 0.36, 14)
        F.cyl_out(B, 'iron', u - 0.15, 0.36, 0.0, 1.0, 0.03, 6)
        for dd in (0.2, 0.8):
            rod(B, 'darkwood', F.p(u + 0.75, 0.48, dd), F.p(u + 1.55, 0.2, dd), 0.06)
        F.box(B, 'darkwood', u - 0.72, 0.0, 0.45, u - 0.66, 0.42, 0.55)
        if rnd.random() < 0.7:   # a load of sacks or crates
            if rnd.random() < 0.5:
                F.box(B, 'cloth_sand', u - 0.55, 0.5, 0.2, u + 0.05, 0.75, 0.8)
            else:
                F.box(B, 'crate', u - 0.6, 0.5, 0.2, u - 0.05, 0.98, 0.75)
        F.collider(B, u - 0.8, 0, 0.0, u + 0.8, 0.8, 1.0, 'cart')

    def gutter(F, u):
        F.box(B, 'iron', u - 0.45, 0.0, 0.1, u + 0.45, 0.022, 0.42)
        for j in range(8):
            uu = u - 0.38 + j * 0.108
            F.box(B, 'glass', uu - 0.03, 0.0, 0.14, uu + 0.03, 0.023, 0.38)

    CLUTTER = [(rubble, 0.1, False), (planks, 0.05, False), (sacks, 0.05, True), (pallets, 0.035, True), (tyres, 0.03, True),
               (boxes, 0.045, True), (bottles, 0.02, True), (cart, 0.018, True), (gutter, 0.03, False)]
    for F in faces:
        if (F.x, F.z, F.dx, F.dz) in occupied:
            continue
        roll = rnd.random()
        acc = 0.0
        for fn, p, big in CLUTTER:
            acc += p
            if roll < acc:
                if big and (narrow(F) or at(F.x, F.z) in 'TK' or faces_kind.get(F.key) == 'door'):
                    break
                if fn is gutter and at(F.x, F.z) not in '.AB':
                    break
                u = rnd.uniform(1.0, S - 1.0) if fn is not cart else rnd.uniform(0.9, S - 1.7)
                fn(F, u)
                stats['clutter'] += 1
                break
    for z in range(H):
        for x in range(W):
            if street(x, z) and at(x, z) not in 'cC' and rnd.random() < 0.09:
                litter(x, z)
    # manholes on open paving
    for z in range(H):
        for x in range(W):
            if at(x, z) != '.' or rnd.random() > 0.035:
                continue
            if any(at(x + dx, z + dz) == '#' for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            cx, cz, y = x * S + S / 2 + rnd.uniform(-0.8, 0.8), z * S + S / 2 + rnd.uniform(-0.8, 0.8), fh(x, z)
            B.lathe_y('iron', cx, y, cz, [(0, 0.5), (0.022, 0.5), (0.03, 0.44), (0.018, 0.42), (0.018, 0.0)], 16)
            for k in range(4):
                B.box('glass', cx - 0.3, y + 0.018, cz - 0.24 + k * 0.16, cx + 0.3, y + 0.025, cz - 0.21 + k * 0.16)
            tile = DECAL['drain'][0]
            h = 0.9
            B.uvquad('decal', [(cx - h, y + 0.011, cz - h), (cx + h, y + 0.011, cz - h), (cx + h, y + 0.011, cz + h), (cx - h, y + 0.011, cz + h)],
                     [atlas_uv(tile, 0, 0), atlas_uv(tile, 1, 0), atlas_uv(tile, 1, 1), atlas_uv(tile, 0, 1)])

    # ---------------------------------------------------------------- wall fixtures
    def ac_unit(F, uc, ya):
        w, h, dd = 0.9, 0.62, 0.42
        F.box(B, 'paint', uc - w / 2, ya, 0.04, uc + w / 2, ya + h, 0.04 + dd)
        front = 0.04 + dd
        for k in range(7):
            F.box(B, 'iron', uc - w / 2 + 0.05, ya + 0.07 + k * 0.072, front, uc + 0.06, ya + 0.095 + k * 0.072, front + 0.012)
        F.box(B, 'glass', uc + 0.1, ya + 0.08, front, uc + 0.4, ya + 0.54, front + 0.005)
        F.cyl_out(B, 'iron', uc + 0.25, ya + 0.31, front, front + 0.03, 0.05, 8)
        rod(B, 'iron', F.p(uc + 0.12, ya + 0.1, front + 0.012), F.p(uc + 0.38, ya + 0.52, front + 0.012), 0.012)
        rod(B, 'iron', F.p(uc + 0.12, ya + 0.52, front + 0.012), F.p(uc + 0.38, ya + 0.1, front + 0.012), 0.012)
        for su in (-0.36, 0.36):
            F.box(B, 'iron', uc + su - 0.02, ya - 0.05, 0.0, uc + su + 0.02, ya, 0.5)
            rod(B, 'iron', F.p(uc + su, ya - 0.45, 0.0), F.p(uc + su, ya - 0.03, 0.46), 0.03)
        # drip pipe and the stain it leaves on the ground
        F.box(B, 'iron', uc + w / 2 - 0.1, 0.35, 0.07, uc + w / 2 - 0.07, ya, 0.1)
        tile = DECAL['water'][0]
        F.floor_quad(B, 'decal', uc + w / 2 - 0.65, 0.0, uc + w / 2 + 0.45, 1.1, 0.011, [atlas_uv(tile, 0, 0), atlas_uv(tile, 1, 0), atlas_uv(tile, 1, 1), atlas_uv(tile, 0, 1)])
        tile = DECAL['rust'][0]
        F.wall_quad(B, 'decal', uc - 0.5, ya - 0.9, uc + 0.5, ya + 0.02, 0.016, [atlas_uv(tile, 0, 0), atlas_uv(tile, 1, 0), atlas_uv(tile, 1, 1), atlas_uv(tile, 0, 1)])

    def electrics(F, uc, ya):
        F.box(B, 'paint', uc - 0.22, ya, 0.0, uc + 0.22, ya + 0.58, 0.17)
        F.box(B, 'iron', uc - 0.2, ya + 0.02, 0.17, uc + 0.2, ya + 0.032, 0.176)
        F.box(B, 'iron', uc - 0.2, ya + 0.548, 0.17, uc + 0.2, ya + 0.56, 0.176)
        F.box(B, 'iron', uc + 0.14, ya + 0.26, 0.17, uc + 0.17, ya + 0.34, 0.2)
        F.box(B, 'iron', uc - 0.03, ya + 0.58, 0.05, uc + 0.03, min(ya + 3.2, 6.2), 0.11)
        if rnd.random() < 0.6:
            F.box(B, 'iron', uc + 0.08, ya + 0.58, 0.05, uc + 0.12, min(ya + 2.6, 6.2), 0.09)
        t = POSTER['warning']
        F.wall_quad(B, 'poster', uc - 0.09, ya + 0.36, uc + 0.09, ya + 0.52, 0.178, [atlas_uv(t, 0, 0), atlas_uv(t, 1, 0), atlas_uv(t, 1, 1), atlas_uv(t, 0, 1)])

    def pipes(F, yp, drop):
        mat = rnd.choice(['iron', 'paint', 'paint_blue'])
        F.cyl_along(B, mat, 0.0, S, yp, 0.13, rnd.uniform(0.045, 0.07), 8)
        for k in range(3):
            uu = 0.6 + k * (S - 1.2) / 2
            F.box(B, 'iron', uu - 0.03, yp - 0.09, 0.0, uu + 0.03, yp + 0.09, 0.08)
        if drop:
            uu = rnd.choice([0.35, S - 0.35])
            a = F.p(uu, 0.0, 0.13)
            B.cylinder(mat, a[0], a[1], a[2], 0.055, yp, segs=8)
            F.box(B, 'iron', uu - 0.1, 0.0, 0.03, uu + 0.1, 0.06, 0.23)

    def cables(F, yc):
        for k in range(rnd.randint(1, 3)):
            y0 = yc + k * 0.09; d = 0.08 + k * 0.03
            sag = rnd.uniform(0.08, 0.22)
            pts = [F.p(S * j / 8, y0 - math.sin(math.pi * j / 8) * sag, d) for j in range(9)]
            for a, b in zip(pts, pts[1:]):
                rod(B, 'iron', a, b, 0.016)
        for uu in (0.05, S / 2, S - 0.05):
            F.box(B, 'iron', uu - 0.03, yc - 0.05, 0.0, uu + 0.03, yc + 0.22, 0.14)

    def vent(F, uc, yv):
        F.box(B, 'iron', uc - 0.27, yv, 0.0, uc + 0.27, yv + 0.34, 0.035)
        for k in range(5):
            F.box(B, 'glass', uc - 0.22, yv + 0.04 + k * 0.058, 0.035, uc + 0.22, yv + 0.07 + k * 0.058, 0.05)

    def poster(F, uc, yb):
        n = 1 if rnd.random() < 0.6 else rnd.randint(2, 3)
        for k in range(n):
            t = rnd.choice(POSTER['poster'])
            w, h = 0.62, 0.85
            u0 = uc - w / 2 + k * rnd.uniform(0.25, 0.45) - (n - 1) * 0.2
            y0 = yb + rnd.uniform(-0.1, 0.12)
            F.wall_quad(B, 'poster', u0, y0, u0 + w, y0 + h, 0.014 + k * 0.004,
                        [atlas_uv(t, 0, 0), atlas_uv(t, 1, 0), atlas_uv(t, 1, 1), atlas_uv(t, 0, 1)])

    def paint(F, uc, yb, kind):
        t = rnd.choice(POSTER[kind])
        w, h = (1.5, 1.5) if kind == 'spray' else (1.1, 1.1)
        F.wall_quad(B, 'poster', uc - w / 2, yb, uc + w / 2, yb + h, 0.013,
                    [atlas_uv(t, 0, 0), atlas_uv(t, 1, 0), atlas_uv(t, 1, 1), atlas_uv(t, 0, 1)])

    def blade_sign(F, uc, ys):
        t = rnd.choice(POSTER['board'])
        F.box(B, 'darkwood', uc - 0.03, ys + 0.02, 0.24, uc + 0.03, ys + 0.6, 1.16)
        F.box(B, 'iron', uc - 0.02, ys + 0.62, 0.0, uc + 0.02, ys + 0.66, 1.24)
        for dd in (0.32, 1.08):
            F.box(B, 'iron', uc - 0.008, ys + 0.6, dd - 0.008, uc + 0.008, ys + 0.62, dd + 0.008)
        # the board, readable from both sides (bottom of the tile's art is at t = 0.2)
        s0, s1, t0, t1 = 0.0, 1.0, 0.19, 0.81
        pa = [F.p(uc - 0.032, ys + 0.04, 0.26), F.p(uc - 0.032, ys + 0.04, 1.14), F.p(uc - 0.032, ys + 0.58, 1.14), F.p(uc - 0.032, ys + 0.58, 0.26)]
        B.uvquad('poster', pa, [atlas_uv(t, s0, t0), atlas_uv(t, s1, t0), atlas_uv(t, s1, t1), atlas_uv(t, s0, t1)])
        pb = [F.p(uc + 0.032, ys + 0.04, 1.14), F.p(uc + 0.032, ys + 0.04, 0.26), F.p(uc + 0.032, ys + 0.58, 0.26), F.p(uc + 0.032, ys + 0.58, 1.14)]
        B.uvquad('poster', pb, [atlas_uv(t, s0, t0), atlas_uv(t, s1, t0), atlas_uv(t, s1, t1), atlas_uv(t, s0, t1)])

    def door_board(F):
        t = rnd.choice(POSTER['board'])
        mid = S / 2
        F.box(B, 'darkwood', mid - 0.95, 3.32, 0.0, mid + 0.95, 3.92, 0.05)
        F.wall_quad(B, 'poster', mid - 0.95, 3.31, mid + 0.95, 3.93, 0.052, [atlas_uv(t, 0, 0.19), atlas_uv(t, 1, 0.19), atlas_uv(t, 1, 0.81), atlas_uv(t, 0, 0.81)])

    def plate(F, uc, yb):
        t = POSTER['plate']
        F.wall_quad(B, 'poster', uc - 0.2, yb, uc + 0.2, yb + 0.4, 0.014, [atlas_uv(t, 0, 0), atlas_uv(t, 1, 0), atlas_uv(t, 1, 1), atlas_uv(t, 0, 1)])

    signed = set()   # faces that get a painted direction sign (chosen below)
    sign_faces = choose_signs(grid, S, at, walk, fh, faces, faces_kind, rnd)
    for F, letter, side in sign_faces:
        t = POSTER['arrow'][(letter, side)]
        kind = faces_kind.get(F.key, 'none')
        uc = S / 2 if kind != 'pipe' else S / 2 + rnd.choice([-1.0, 1.0])
        yb = 1.2 + rnd.uniform(-0.05, 0.1)
        F.wall_quad(B, 'poster', uc - 0.85, yb, uc + 0.85, yb + 1.7, 0.015, [atlas_uv(t, 0, 0), atlas_uv(t, 1, 0), atlas_uv(t, 1, 1), atlas_uv(t, 0, 1)])
        signed.add(id(F))
        stats['signs'] += 1

    for F in faces:
        kind = faces_kind.get(F.key, 'none')
        if kind == 'balcony':
            continue
        if at(F.x, F.z) == 'u':
            # tunnels: a 3.4 m ceiling (absolute), so only low fixtures
            ceil = 3.4 - F.base
            r = rnd.random()
            if r < 0.12:
                electrics(F, rnd.uniform(0.5, S - 0.5), rnd.uniform(1.1, 1.3))
            elif r < 0.3:
                pipes(F, ceil - rnd.uniform(0.3, 0.45), rnd.random() < 0.3)
            elif r < 0.4:
                cables(F, ceil - 0.42)
            elif r < 0.46:
                paint(F, rnd.uniform(0.9, S - 0.9), rnd.uniform(0.3, 0.6), 'spray')
            elif r < 0.52:
                vent(F, rnd.uniform(0.6, S - 0.6), 0.25)
            continue
        side_u = lambda: rnd.choice([rnd.uniform(0.45, 0.75), rnd.uniform(S - 0.75, S - 0.45)])
        free_u = lambda w: rnd.uniform(0.3 + w / 2, S - 0.3 - w / 2) if kind == 'none' else side_u()
        r = rnd.random()
        if id(F) in signed:
            r = 0.99     # leave signed walls clean
        if r < 0.06 and kind != 'door':
            uc = S / 2 + rnd.uniform(-0.4, 0.4) if kind == 'window' else rnd.uniform(0.75, S - 0.75)
            if kind in ('lantern', 'pipe') and abs(uc - S / 2) < 0.75:
                uc = S / 2 + (1.0 if uc >= S / 2 else -1.0) * rnd.uniform(0.95, 1.25)
            ac_unit(F, uc, rnd.uniform(2.35, 2.7))
        elif r < 0.11:
            electrics(F, side_u() if kind != 'none' else rnd.uniform(0.5, S - 0.5), rnd.uniform(1.2, 1.5))
        elif r < 0.19:
            pipes(F, (3.45 if kind == 'door' else rnd.uniform(3.0, 3.3)), rnd.random() < 0.45)
        elif r < 0.26:
            poster(F, free_u(0.7) if kind != 'door' else side_u(), rnd.uniform(1.2, 1.5))
        elif r < 0.3:
            cables(F, rnd.uniform(4.0, 4.6) if kind != 'window' else rnd.uniform(5.25, 5.6))
        elif r < 0.33 and kind in ('none', 'lantern'):
            vent(F, rnd.uniform(0.6, S - 0.6) if kind == 'none' else side_u(), rnd.choice([0.25, 0.3, 3.2]))
        elif r < 0.355 and kind == 'none':
            paint(F, rnd.uniform(0.9, S - 0.9), rnd.uniform(0.35, 0.8), 'spray')
        elif r < 0.375 and kind == 'none':
            paint(F, rnd.uniform(0.7, S - 0.7), rnd.uniform(0.9, 1.4), 'stencil')
        elif r < 0.41 and kind not in ('door', 'window'):
            blade_sign(F, rnd.uniform(0.8, S - 0.8), 3.0)
        else:
            continue
        stats['fixtures'] += 1
        # shop boards and house numbers by doors
        if kind == 'door' and rnd.random() < 0.35:
            door_board(F)
        elif kind == 'door' and rnd.random() < 0.3:
            plate(F, S / 2 + 1.15, 1.75)
    for F in faces:
        kind = faces_kind.get(F.key, 'none')
        if kind == 'door' and id(F) not in signed and rnd.random() < 0.25:
            door_board(F)
    return stats


def choose_signs(grid, S, at, walk, fh, faces, faces_kind, rnd):
    """Painted 'A ->' / 'B <-' signs on walls at junctions, pointing along the
    shortest walk to each bombsite."""
    H, W = len(grid), len(grid[0])
    by_cell = {}
    for F in faces:
        by_cell.setdefault((F.x, F.z), []).append(F)
    out, used = [], set()
    for L in 'AB':
        site = [(x, z) for z in range(H) for x in range(W) if at(x, z) == L]
        if not site:
            continue
        dist = {c: 0 for c in site}
        q = deque(site)
        while q:
            x, z = q.popleft()
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, z + dz)
                if n not in dist and walk(*n):
                    dist[n] = dist[(x, z)] + 1
                    q.append(n)
        cands = []
        for (x, z), d in dist.items():
            if d < 3 or d > 26 or at(x, z) in 'AB' or (x, z) not in by_cell:
                continue
            nbrs = [(x + dx, z + dz) for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)) if (x + dx, z + dz) in dist]
            nxt = [n for n in nbrs if dist[n] == d - 1]
            if not nxt:
                continue
            junction = len(nbrs) >= 3
            px, pz = nxt[0][0] - x, nxt[0][1] - z
            for F in by_cell[(x, z)]:
                if faces_kind.get(F.key) in ('door', 'balcony'):
                    continue
                side = px * F.r[0] + pz * F.r[1]
                if side == 0:
                    continue
                cands.append((0 if junction else 1, rnd.random(), F, 1 if side > 0 else -1, x, z))
        cands.sort(key=lambda c: (c[0], c[1]))
        picked = []
        for _, _, F, side, x, z in cands:
            if id(F) in used or any(max(abs(x - a), abs(z - b)) < 6 for a, b in picked):
                continue
            picked.append((x, z)); used.add(id(F))
            out.append((F, L, side))
            if len(picked) >= 7:
                break
    return out
