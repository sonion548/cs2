"""Builds a detailed map mesh from the ASCII grid in src/maps.js and exports
<map>.glb plus <map>.colliders.json (axis-aligned boxes in game space).

Game space: x east, y up, z south. Blender space used here: X = x, Y = -z,
Z = y, which the glTF exporter turns back into game space.
"""
import json
import math
import os
import random
import re
import sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
from lib import reset, material, link, apply_all

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_map(name):
    src = open(os.path.join(ROOT, 'src', 'maps.js')).read()
    block = src[src.index(f'{name}:'):]
    grid = re.findall(r"'([#.,ucC^sABTK]+)'", block[block.index('grid'):block.index(']')])
    cell = float(re.search(r'cell:\s*([\d.]+)', block).group(1))
    wh = float(re.search(r'wallHeight:\s*([\d.]+)', block).group(1))
    return grid, cell, wh


# ---------------------------------------------------------------- geometry builder
class Builder:
    """Collects boxes/quads per material into one bmesh each (fast, few draw calls)."""

    def __init__(self):
        self.bms = {}
        self.colliders = []

    def bm(self, mat):
        if mat not in self.bms:
            self.bms[mat] = bmesh.new()
        return self.bms[mat]

    @staticmethod
    def g2b(x, y, z):
        return (x, -z, y)

    def box(self, mat, x0, y0, z0, x1, y1, z1, collide=None, rot=0.0, bevel=0.0):
        """Box from game-space min/max corners; optional yaw rotation about its centre."""
        bm = self.bm(mat)
        cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
        hx, hy, hz = (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2
        c, s = math.cos(rot), math.sin(rot)
        pts = []
        for dx, dy, dz in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]:
            lx, lz = dx * hx, dz * hz
            pts.append(self.g2b(cx + lx * c - lz * s, cy + dy * hy, cz + lx * s + lz * c))
        v = [bm.verts.new(p) for p in pts]
        for f in [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            bm.faces.new([v[i] for i in f])
        if collide:
            self.colliders.append([round(x0, 3), round(y0, 3), round(z0, 3), round(x1, 3), round(y1, 3), round(z1, 3), collide])

    def cylinder(self, mat, cx, y0, cz, r, h, segs=16, axis='y', length_dir=None):
        bm = self.bm(mat)
        ring0, ring1 = [], []
        for i in range(segs):
            a = i / segs * math.pi * 2
            if axis == 'y':
                p0 = (cx + math.cos(a) * r, y0, cz + math.sin(a) * r)
                p1 = (cx + math.cos(a) * r, y0 + h, cz + math.sin(a) * r)
            elif axis == 'x':
                p0 = (cx, y0 + math.cos(a) * r, cz + math.sin(a) * r)
                p1 = (cx + h, y0 + math.cos(a) * r, cz + math.sin(a) * r)
            else:
                p0 = (cx + math.cos(a) * r, y0 + math.sin(a) * r, cz)
                p1 = (cx + math.cos(a) * r, y0 + math.sin(a) * r, cz + h)
            ring0.append(bm.verts.new(self.g2b(*p0)))
            ring1.append(bm.verts.new(self.g2b(*p1)))
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
        bm.faces.new(ring0[::-1]); bm.faces.new(ring1)

    def quad(self, mat, pts):
        bm = self.bm(mat)
        bm.faces.new([bm.verts.new(self.g2b(*p)) for p in pts])

    def finish(self, tex_scale):
        objs = []
        for mat, bm in self.bms.items():
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            me = bpy.data.meshes.new(mat)
            bm.to_mesh(me); bm.free()
            # world-space box-projected UVs so tiling textures line up everywhere
            uv = me.uv_layers.new(name='UVMap')
            s = 1.0 / tex_scale.get(mat, 4.0)
            for poly in me.polygons:
                n = poly.normal
                ax = max(range(3), key=lambda i: abs(n[i]))
                for li in poly.loop_indices:
                    co = me.vertices[me.loops[li].vertex_index].co
                    if ax == 2:   # floor/ceiling (Blender Z = game up)
                        uv.data[li].uv = (co.x * s, co.y * s)
                    elif ax == 0:
                        uv.data[li].uv = (co.y * s * (1 if n[0] > 0 else -1), co.z * s)
                    else:
                        uv.data[li].uv = (co.x * s * (-1 if n[1] > 0 else 1), co.z * s)
            obj = bpy.data.objects.new(mat, me)
            me.materials.append(material(mat))
            link(obj)
            objs.append(obj)
        return objs


# ---------------------------------------------------------------- map
def build(name):
    reset()
    grid, S, WH = load_map(name)
    H, W = len(grid), len(grid[0])
    at = lambda x, z: '#' if x < 0 or z < 0 or x >= W or z >= H else grid[z][x]
    walk = lambda x, z: at(x, z) != '#'
    rnd = random.Random(1337)
    B = Builder()

    # ---- walls: greedy merge identical to the game's collision layout
    used = [[False] * W for _ in range(H)]
    walls = []
    for z in range(H):
        for x in range(W):
            if at(x, z) != '#' or used[z][x]:
                continue
            x1 = x
            while x1 + 1 < W and at(x1 + 1, z) == '#' and not used[z][x1 + 1]:
                x1 += 1
            z1 = z
            while z1 + 1 < H and all(at(k, z1 + 1) == '#' and not used[z1 + 1][k] for k in range(x, x1 + 1)):
                z1 += 1
            for zz in range(z, z1 + 1):
                for k in range(x, x1 + 1):
                    used[zz][k] = True
            border = x == 0 or z == 0 or x1 == W - 1 or z1 == H - 1
            h = WH + 3 if border else WH + (1.5 if rnd.random() < 0.3 else 0)
            walls.append((x * S, z * S, (x1 + 1) * S, (z1 + 1) * S, h, border))

    for (x0, z0, x1, z1, h, border) in walls:
        style = 'sandstone' if rnd.random() < 0.55 else 'plaster'
        B.box(style, x0, 0, z0, x1, h, z1, collide='wall')
        P = 0.08
        # plinth, string course, cornice
        B.box('trim', x0 - P, 0, z0 - P, x1 + P, 0.55, z1 + P)
        B.box('trim', x0 - 0.05, 2.55, z0 - 0.05, x1 + 0.05, 2.7, z1 + 0.05)
        B.box('trim', x0 - 0.14, h - 0.32, z0 - 0.14, x1 + 0.14, h - 0.05, z1 + 0.14)
        B.box('trim', x0 - 0.08, h - 0.05, z0 - 0.08, x1 + 0.08, h + 0.12, z1 + 0.08)
        # crenellations on the outer walls
        if border:
            for (ax0, az0, ax1, az1) in ((x0, z0, x1, z0 + 0.4), (x0, z1 - 0.4, x1, z1), (x0, z0, x0 + 0.4, z1), (x1 - 0.4, z0, x1, z1)):
                L = max(ax1 - ax0, az1 - az0)
                n = int(L / 1.2)
                for i in range(n):
                    if ax1 - ax0 > az1 - az0:
                        B.box('trim', ax0 + i * 1.2, h + 0.12, az0, ax0 + i * 1.2 + 0.7, h + 0.75, az1)
                    else:
                        B.box('trim', ax0, h + 0.12, az0 + i * 1.2, ax1, h + 0.75, az0 + i * 1.2 + 0.7)
        # corner quoins (alternating long/short blocks)
        for (cx, cz) in ((x0, z0), (x1, z0), (x0, z1), (x1, z1)):
            y = 0.55
            k = 0
            while y < h - 0.5:
                l = 0.55 if k % 2 == 0 else 0.35
                sx = 1 if cx == x0 else -1
                sz = 1 if cz == z0 else -1
                B.box('stone', cx - 0.06 if sx > 0 else cx - l, y, cz - 0.06 if sz > 0 else cz - 0.35 + 0.06 * 0,
                      cx + l if sx > 0 else cx + 0.06, y + 0.42, cz + 0.35 if sz > 0 else cz + 0.06)
                y += 0.45; k += 1

    # ---- facade details on wall faces that look onto walkable cells
    def faces_of(x0, z0, x1, z1):
        # yields (axis, fixed coord, start, end, outward sign, cell list) for each exposed face run
        out = []
        for z in range(int(z0 / S), int(z1 / S)):
            for side, xs in (('w', int(x0 / S) - 1), ('e', int(x1 / S))):
                if walk(xs, z):
                    out.append(('x', x0 if side == 'w' else x1, z * S, (z + 1) * S, -1 if side == 'w' else 1))
        for x in range(int(x0 / S), int(x1 / S)):
            for side, zs in (('n', int(z0 / S) - 1), ('s', int(z1 / S))):
                if walk(x, zs):
                    out.append(('z', z0 if side == 'n' else z1, x * S, (x + 1) * S, -1 if side == 'n' else 1))
        return out

    for (x0, z0, x1, z1, h, border) in walls:
        for axis, f, a0, a1, sgn in faces_of(x0, z0, x1, z1):
            r = rnd.random()
            mid = (a0 + a1) / 2

            def put(mat, u0, y0, u1, y1, d0, d1, collide=None):
                # u along the face, d outward from the face plane
                if axis == 'x':
                    B.box(mat, f + sgn * d0 if sgn > 0 else f - d1, y0, u0, f + sgn * d1 if sgn > 0 else f - d0, y1, u1, collide)
                else:
                    B.box(mat, u0, y0, f + sgn * d0 if sgn > 0 else f - d1, u1, y1, f + sgn * d1 if sgn > 0 else f - d0, collide)

            if r < 0.45 and h > 6:
                # window: stone frame, lintel, sill, dark glass, wooden shutters
                wy = 3.6
                put('trim', mid - 0.75, wy - 0.12, mid + 0.75, wy, 0.0, 0.14)
                put('trim', mid - 0.7, wy + 1.4, mid + 0.7, wy + 1.58, 0.0, 0.1)
                put('trim', mid - 0.7, wy, mid - 0.58, wy + 1.4, 0.0, 0.08)
                put('trim', mid + 0.58, wy, mid + 0.7, wy + 1.4, 0.0, 0.08)
                put('glass', mid - 0.58, wy, mid + 0.58, wy + 1.4, 0.0, 0.01)
                put('wood', mid - 0.3, wy + 0.05, mid + 0.3, wy + 1.35, 0.01, 0.03)
                put('wood', mid - 1.25, wy, mid - 0.72, wy + 1.4, 0.0, 0.05)
                put('wood', mid + 0.72, wy, mid + 1.25, wy + 1.4, 0.0, 0.05)
                for k in range(4):
                    put('darkwood', mid - 1.25, wy + 0.15 + k * 0.33, mid - 0.72, wy + 0.2 + k * 0.33, 0.05, 0.065)
                    put('darkwood', mid + 0.72, wy + 0.15 + k * 0.33, mid + 1.25, wy + 0.2 + k * 0.33, 0.05, 0.065)
            elif r < 0.62:
                # doorway: arched stone surround + plank door with iron straps
                put('trim', mid - 0.95, 0.0, mid - 0.75, 2.4, 0.0, 0.12)
                put('trim', mid + 0.75, 0.0, mid + 0.95, 2.4, 0.0, 0.12)
                for k in range(9):
                    a = k / 8 * math.pi
                    cx_, cy_ = mid - math.cos(a) * 0.85, 2.4 + math.sin(a) * 0.55
                    put('trim', cx_ - 0.13, cy_ - 0.1, cx_ + 0.13, cy_ + 0.12, 0.0, 0.12)
                for k in range(6):
                    put('wood', mid - 0.75 + k * 0.25, 0.0, mid - 0.52 + k * 0.25, 2.35, 0.0, 0.05)
                for yy in (0.4, 1.9):
                    put('iron', mid - 0.75, yy, mid + 0.75, yy + 0.08, 0.05, 0.065)
                # awning above some doors
                if rnd.random() < 0.6:
                    col = 'cloth_red' if rnd.random() < 0.5 else 'cloth_blue'
                    y = 3.25
                    for k in range(5):
                        put(col, mid - 1.1, y - k * 0.07, mid + 1.1, y - k * 0.07 + 0.03, 0.15 + k * 0.2, 0.37 + k * 0.2)
                    put('darkwood', mid - 1.15, y - 0.4, mid - 1.08, y + 0.02, 0.0, 1.05)
                    put('darkwood', mid + 1.08, y - 0.4, mid + 1.15, y + 0.02, 0.0, 1.05)
            elif r < 0.75:
                # lantern on an iron bracket
                put('iron', mid - 0.03, 2.9, mid + 0.03, 2.96, 0.0, 0.42)
                put('iron', mid - 0.1, 2.55, mid + 0.1, 2.9, 0.32, 0.5)
                put('lamp', mid - 0.07, 2.6, mid + 0.07, 2.85, 0.34, 0.48)
            elif r < 0.85:
                # drain pipe down the wall
                put('iron', mid - 0.06, 0.1, mid + 0.06, h - 0.3, 0.02, 0.14)
                put('iron', mid - 0.12, h - 0.45, mid + 0.12, h - 0.3, 0.02, 0.3)
            # wooden roof-beam ends just below the cornice
            if h > 6 and rnd.random() < 0.7:
                for k in range(3):
                    u = a0 + 0.6 + k * (S - 1.2) / 2
                    put('darkwood', u - 0.11, h - 0.95, u + 0.11, h - 0.73, 0.0, 0.42)
            # random protruding stones
            for k in range(rnd.randint(0, 4)):
                u = rnd.uniform(a0 + 0.3, a1 - 0.8); yy = rnd.uniform(0.8, h - 1.2)
                put('stone', u, yy, u + rnd.uniform(0.3, 0.6), yy + rnd.uniform(0.18, 0.3), 0.0, rnd.uniform(0.02, 0.05))

    # ---- floors, props, platforms, tunnels
    tex_scale = {'trim': 2.0, 'crate': 2.1, 'wood': 2.0, 'darkwood': 2.0, 'stone': 2.0}
    barrels = []
    for z in range(H):
        for x in range(W):
            c = at(x, z)
            if c == '#':
                continue
            x0, z0 = x * S, z * S
            cx, cz = x0 + S / 2, z0 + S / 2
            fm = 'sand' if c in ',T' else 'tiles' if c in 'AB^s' else 'concrete' if c == 'u' else 'paving'
            B.quad(fm, [(x0, 0, z0), (x0, 0, z0 + S), (x0 + S, 0, z0 + S), (x0 + S, 0, z0)])
            if c in 'cC':
                cs, ch = 2.1, 2.2 if c == 'C' else 1.1
                B.colliders.append([cx - cs / 2, 0, cz - cs / 2, cx + cs / 2, ch, cz + cs / 2, 'crate'])
                for k in range(int(round(ch / 1.1))):
                    y0 = k * 1.1
                    rot = (rnd.random() - 0.5) * 0.08 if k else 0
                    crate(B, cx, y0, cz, cs, rot)
            if c in '^s':
                hgt = 0.9 if c == '^' else 0.45
                B.box('tiles', x0, 0, z0, x0 + S, hgt, z0 + S, collide='platform')
                B.box('trim', x0, hgt - 0.08, z0, x0 + S, hgt + 0.02, z0 + S)
            if c == 'u':
                ceil = 3.4
                B.box('concrete', x0, ceil, z0, x0 + S, WH, z0 + S, collide='ceiling')
                # timber frames: beams across, posts flush to the side walls
                B.box('darkwood', x0, ceil - 0.28, z0 + S / 2 - 0.14, x0 + S, ceil, z0 + S / 2 + 0.14)
                for sx in (x0, x0 + S - 0.25):
                    if not walk(x - 1 if sx == x0 else x + 1, z):
                        B.box('darkwood', sx, 0, z0 + S / 2 - 0.14, sx + 0.25, ceil - 0.28, z0 + S / 2 + 0.14)
                B.box('iron', cx - 0.02, ceil - 0.6, cz - 0.02, cx + 0.02, ceil - 0.28, cz + 0.02)
                B.box('lamp', cx - 0.12, ceil - 0.78, cz - 0.12, cx + 0.12, ceil - 0.6, cz + 0.12)
            # wall-adjacent props: barrels, rubble, sand drifts, pallets
            if c in '.,':
                nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                touching = [(dx, dz) for dx, dz in nb if at(x + dx, z + dz) == '#']
                if touching and rnd.random() < 0.08:
                    dx, dz = touching[0]
                    px, pz = cx + dx * (S / 2 - 0.6), cz + dz * (S / 2 - 0.6)
                    barrel(B, px, pz)
                    B.colliders.append([px - 0.42, 0, pz - 0.42, px + 0.42, 1.2, pz + 0.42, 'barrel'])
                    barrels.append((px, pz))
                if touching and rnd.random() < 0.25:
                    dx, dz = touching[-1]
                    for k in range(rnd.randint(3, 8)):
                        rx = cx + dx * (S / 2 - 0.25) + (rnd.random() - 0.5) * (S * 0.8 if dz else 0.3)
                        rz = cz + dz * (S / 2 - 0.25) + (rnd.random() - 0.5) * (S * 0.8 if dx else 0.3)
                        s_ = rnd.uniform(0.08, 0.2)
                        B.box('stone', rx - s_, 0, rz - s_, rx + s_, s_ * 1.2, rz + s_, rot=rnd.random() * 3)
                if c == ',' and touching:
                    for dx, dz in touching:
                        # low sand drift against the wall
                        for k in range(3):
                            o = 0.2 + k * 0.25
                            hh = 0.18 - k * 0.055
                            if dx:
                                wx = x0 + S - o if dx > 0 else x0 + o - 0.25
                                B.box('sand', wx, 0, z0 + 0.3, wx + 0.25, hh, z0 + S - 0.3)
                            else:
                                wz = z0 + S - o if dz > 0 else z0 + o - 0.25
                                B.box('sand', x0 + 0.3, 0, wz, x0 + S - 0.3, hh, wz + 0.25)
            # paved areas get kerbs along walls
            if c in '.AB':
                for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if at(x + dx, z + dz) != '#':
                        continue
                    if dx:
                        kx = x0 + S - 0.08 - 0.3 if dx > 0 else x0 + 0.08
                        B.box('trim', kx, 0, z0, kx + 0.3, 0.1, z0 + S)
                    else:
                        kz = z0 + S - 0.08 - 0.3 if dz > 0 else z0 + 0.08
                        B.box('trim', x0, 0, kz, x0 + S, 0.1, kz + 0.3)

    # cables strung across a few open streets
    for i in range(14):
        z = rnd.randrange(1, H - 1); x = rnd.randrange(1, W - 1)
        if walk(x, z) and at(x - 1, z) == '#' and at(x + 1, z) != '#':
            x1 = x
            while x1 + 1 < W and walk(x1 + 1, z):
                x1 += 1
            if at(x1 + 1, z) == '#' and x1 - x < 4:
                ax, bx = x * S, (x1 + 1) * S
                cz = z * S + S / 2
                n = 12
                for k in range(n):
                    t0, t1 = k / n, (k + 1) / n
                    sag = lambda t: 6.0 - math.sin(t * math.pi) * 0.6
                    B.box('iron', ax + (bx - ax) * t0, sag(t0) - 0.015, cz - 0.015, ax + (bx - ax) * t1, sag(t1) + 0.015, cz + 0.015)
                for k in range(5):
                    t = (k + 0.5) / 5
                    yy = 6.0 - math.sin(t * math.pi) * 0.6
                    col = ['cloth_red', 'cloth_blue', 'lamp', 'cloth_red', 'cloth_blue'][k]
                    B.box(col, ax + (bx - ax) * t - 0.15, yy - 0.5, cz - 0.01, ax + (bx - ax) * t + 0.15, yy - 0.02, cz + 0.01)

    tex_scale.update({'sand': 4.0, 'paving': 4.0, 'tiles': 4.0, 'concrete': 4.0, 'sandstone': 4.0, 'plaster': 4.0})
    B.finish(tex_scale)
    return B.colliders


def crate(B, cx, y0, cz, s, rot):
    h = 1.1
    hs = s / 2
    def bx(mat, ax0, ay0, az0, ax1, ay1, az1):
        # local crate coords → rotated world box (approximate via centre rotation)
        mx, mz = (ax0 + ax1) / 2, (az0 + az1) / 2
        c, sn = math.cos(rot), math.sin(rot)
        wx, wz = cx + mx * c - mz * sn, cz + mx * sn + mz * c
        B.box(mat, wx - (ax1 - ax0) / 2, y0 + ay0, wz - (az1 - az0) / 2, wx + (ax1 - ax0) / 2, y0 + ay1, wz + (az1 - az0) / 2, rot=rot)
    # inset panels
    bx('crate', -hs + 0.04, 0.04, -hs + 0.04, hs - 0.04, h - 0.04, hs - 0.04)
    # frame edges (12 beams)
    t = 0.1
    for (a, b) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        bx('wood', a * hs - (t if a > 0 else 0), 0, b * hs - (t if b > 0 else 0), a * hs + (0 if a > 0 else t), h, b * hs + (0 if b > 0 else t))
    for yy in (0, h - t):
        bx('wood', -hs, yy, -hs, hs, yy + t, -hs + t); bx('wood', -hs, yy, hs - t, hs, yy + t, hs)
        bx('wood', -hs, yy, -hs, -hs + t, yy + t, hs); bx('wood', hs - t, yy, -hs, hs, yy + t, hs)
    # metal corner brackets
    for (a, b) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        for yy in (0.0, h - 0.18):
            bx('iron', a * hs - (0.2 if a > 0 else 0.01), yy, b * hs - (0.01 if b > 0 else 0.0), a * hs + (0.01 if a > 0 else 0.2), yy + 0.18, b * hs + (0.0 if b > 0 else 0.01))


def barrel(B, px, pz):
    B.cylinder('barrel', px, 0, pz, 0.42, 1.2, segs=20)
    for yy in (0.18, 0.6, 1.02):
        B.cylinder('iron', px, yy - 0.03, pz, 0.435, 0.06, segs=20)
    B.cylinder('iron', px, 1.2, pz, 0.38, 0.015, segs=20)


if __name__ == '__main__':
    name = sys.argv[sys.argv.index('--map') + 1] if '--map' in sys.argv else 'dunehold'
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'public', 'models', 'maps')
    os.makedirs(out, exist_ok=True)
    cols = build(name)
    for m, col in {'sandstone': (0.75, 0.6, 0.4, 1), 'plaster': (0.8, 0.72, 0.6, 1), 'trim': (0.55, 0.45, 0.32, 1), 'stone': (0.7, 0.58, 0.42, 1),
                   'sand': (0.78, 0.66, 0.47, 1), 'paving': (0.55, 0.5, 0.44, 1), 'tiles': (0.7, 0.62, 0.5, 1), 'concrete': (0.5, 0.5, 0.48, 1),
                   'wood': (0.45, 0.3, 0.16, 1), 'darkwood': (0.22, 0.14, 0.08, 1), 'crate': (0.5, 0.35, 0.2, 1), 'iron': (0.12, 0.12, 0.13, 1),
                   'barrel': (0.3, 0.42, 0.28, 1), 'glass': (0.04, 0.05, 0.06, 1), 'lamp': (1.0, 0.75, 0.4, 1), 'cloth_red': (0.6, 0.12, 0.1, 1), 'cloth_blue': (0.12, 0.22, 0.45, 1)}.items():
        mm = bpy.data.materials.get(m)
        if mm:
            mm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = col
    if '--preview' in sys.argv:
        from preview import render_preview
        render_preview(os.path.join(out, f'{name}_preview.png'), size=(1400, 800), angle=(0.75, 0, -0.5), samples=12)
    from lib import export_glb, stats
    export_glb(os.path.join(out, f'{name}.glb'))
    with open(os.path.join(out, f'{name}.colliders.json'), 'w') as f:
        json.dump(cols, f)
    print(f'{name}: {stats()} tris, {len(cols)} colliders')
