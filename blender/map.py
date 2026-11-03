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


STEP = 0.45   # one floor level (must match src/level.js)


def load_map(name):
    src = open(os.path.join(ROOT, 'src', 'maps.js')).read()
    block = src[src.index(f'  {name}: {{'):]
    block = block[:block.index('\n  },')]
    g0 = block.index('grid: [')
    grid = re.findall(r"'([#.,ucC^sABTKhD]+)'", block[g0:block.index(']', g0)])
    levels = None
    if 'levels: [' in block:
        l0 = block.index('levels: [')
        levels = re.findall(r"'([0-9]+)'", block[l0:block.index(']', l0)])
    cell = float(re.search(r'cell:\s*([\d.]+)', block).group(1))
    wh = float(re.search(r'wallHeight:\s*([\d.]+)', block).group(1))
    return grid, cell, wh, levels


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

    def lathe_y(self, mat, cx, y0, cz, prof, segs=16):
        """Round part around a vertical axis; prof = [(dy, r), ...] bottom to top."""
        bm = self.bm(mat)
        rings = []
        for dy, r in prof:
            r = max(r, 0.003)
            rings.append([bm.verts.new(self.g2b(cx + math.cos(i / segs * math.pi * 2) * r, y0 + dy, cz + math.sin(i / segs * math.pi * 2) * r))
                          for i in range(segs)])
        for a, b in zip(rings, rings[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])

    def dome(self, mat, cx, y0, cz, r, h, segs=24, rings=8):
        self.lathe_y(mat, cx, y0, cz, [(math.sin(k / rings * math.pi / 2) * h, math.cos(k / rings * math.pi / 2) * r) for k in range(rings + 1)], segs)

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
    grid, S, WH, levels = load_map(name)
    H, W = len(grid), len(grid[0])
    at = lambda x, z: '#' if x < 0 or z < 0 or x >= W or z >= H else grid[z][x]
    lvl = lambda x, z: int(levels[z][x]) if levels and 0 <= z < H and 0 <= x < W else 0
    fh = lambda x, z: lvl(x, z) * STEP
    walk = lambda x, z: at(x, z) != '#'
    # open air (streets, sites, tunnels) as opposed to building interiors
    street = lambda x, z: at(x, z) not in '#' + INTERIOR
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
                if street(xs, z):
                    out.append(('x', x0 if side == 'w' else x1, z * S, (z + 1) * S, -1 if side == 'w' else 1))
        for x in range(int(x0 / S), int(x1 / S)):
            for side, zs in (('n', int(z0 / S) - 1), ('s', int(z1 / S))):
                if street(x, zs):
                    out.append(('z', z0 if side == 'n' else z1, x * S, (x + 1) * S, -1 if side == 'n' else 1))
        return out

    for (x0, z0, x1, z1, h, border) in walls:
        for axis, f, a0, a1, sgn in faces_of(x0, z0, x1, z1):
            r = rnd.random()
            mid = (a0 + a1) / 2
            # floor height of the street cell this face looks onto
            if axis == 'x':
                base = fh(int(f / S) if sgn > 0 else int(f / S) - 1, int(mid / S))
            else:
                base = fh(int(mid / S), int(f / S) if sgn > 0 else int(f / S) - 1)

            def put(mat, u0, y0, u1, y1, d0, d1, collide=None):
                # u along the face, d outward from the face plane; heights from the floor in front
                y0 += base; y1 += base
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
            fm = 'sand' if c in ',T' else 'tiles' if c in 'AB^s' else 'concrete' if c == 'u' else 'wood' if c in INTERIOR else 'paving'
            fy = fh(x, z)
            B.quad(fm, [(x0, fy, z0), (x0, fy, z0 + S), (x0 + S, fy, z0 + S), (x0 + S, fy, z0)])
            if c in 'cC':
                cs, ch = 2.1, 2.2 if c == 'C' else 1.1
                B.colliders.append([cx - cs / 2, fy, cz - cs / 2, cx + cs / 2, fy + ch, cz + cs / 2, 'crate'])
                for k in range(int(round(ch / 1.1))):
                    y0 = fy + k * 1.1
                    rot = (rnd.random() - 0.5) * 0.08 if k else 0
                    crate(B, cx, y0, cz, cs, rot)
            if c in '^s':
                hgt = 0.9 if c == '^' else 0.45
                B.box('tiles', x0, fy, z0, x0 + S, fy + hgt, z0 + S, collide='platform')
                B.box('trim', x0, fy + hgt - 0.08, z0, x0 + S, fy + hgt + 0.02, z0 + S)
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
                    barrel(B, px, pz, fy)
                    B.colliders.append([px - 0.42, fy, pz - 0.42, px + 0.42, fy + 1.2, pz + 0.42, 'barrel'])
                    barrels.append((px, pz))
                if touching and rnd.random() < 0.25:
                    dx, dz = touching[-1]
                    for k in range(rnd.randint(3, 8)):
                        rx = cx + dx * (S / 2 - 0.25) + (rnd.random() - 0.5) * (S * 0.8 if dz else 0.3)
                        rz = cz + dz * (S / 2 - 0.25) + (rnd.random() - 0.5) * (S * 0.8 if dx else 0.3)
                        s_ = rnd.uniform(0.08, 0.2)
                        B.box('stone', rx - s_, fy, rz - s_, rx + s_, fy + s_ * 1.2, rz + s_, rot=rnd.random() * 3)
                if c == ',' and touching:
                    for dx, dz in touching:
                        # low sand drift against the wall
                        for k in range(3):
                            o = 0.2 + k * 0.25
                            hh = 0.18 - k * 0.055
                            if dx:
                                wx = x0 + S - o if dx > 0 else x0 + o - 0.25
                                B.box('sand', wx, fy, z0 + 0.3, wx + 0.25, fy + hh, z0 + S - 0.3)
                            else:
                                wz = z0 + S - o if dz > 0 else z0 + o - 0.25
                                B.box('sand', x0 + 0.3, fy, wz, x0 + S - 0.3, fy + hh, wz + 0.25)
            # paved areas get kerbs along walls
            if c in '.AB':
                for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if at(x + dx, z + dz) != '#':
                        continue
                    if dx:
                        kx = x0 + S - 0.08 - 0.3 if dx > 0 else x0 + 0.08
                        B.box('trim', kx, fy, z0, kx + 0.3, fy + 0.1, z0 + S)
                    else:
                        kz = z0 + S - 0.08 - 0.3 if dz > 0 else z0 + 0.08
                        B.box('trim', x0, fy, kz, x0 + S, fy + 0.1, kz + 0.3)

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

    if levels:
        raised(B, grid, S, at, lvl)
    interiors(B, grid, S, WH, at, random.Random(77))
    dress(B, grid, S, walls, at, street, fh)

    tex_scale.update({'sand': 4.0, 'paving': 4.0, 'tiles': 4.0, 'concrete': 4.0, 'sandstone': 4.0, 'plaster': 4.0, 'terracotta': 2.0})
    B.finish(tex_scale)
    return B.colliders


# ---------------------------------------------------------------- building interiors
INTERIOR = 'hD'


def interiors(B, grid, S, WH, at, rnd):
    """Rooms you can walk into: roof mass from the ceiling up (which is also the
    building's outside), walls toward the street with doorways (D cells) or
    barred windows (h cells), beams, lamps, rugs and furniture."""
    H, W = len(grid), len(grid[0])
    ceil, t = 3.4, 0.3
    for z in range(H):
        for x in range(W):
            c = at(x, z)
            if c not in INTERIOR:
                continue
            x0, z0 = x * S, z * S
            cx, cz = x0 + S / 2, z0 + S / 2
            B.box('plaster', x0, ceil, z0, x0 + S, WH, z0 + S, collide='ceiling')
            B.box('darkwood', x0, ceil - 0.22, cz - 0.12, x0 + S, ceil, cz + 0.12)
            if (x + z) % 2 == 0:
                B.box('iron', cx - 0.015, ceil - 0.6, cz - 0.015, cx + 0.015, ceil - 0.22, cz + 0.015)
                B.box('lamp', cx - 0.13, ceil - 0.8, cz - 0.13, cx + 0.13, ceil - 0.6, cz + 0.13)
            solid = []
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = at(x + dx, z + dz)
                if n in INTERIOR:
                    continue
                if n == '#':
                    solid.append((dx, dz))
                    # wainscot strip along solid walls
                    edge_box(B, x0, z0, S, dx, dz, 'darkwood', 0.0, 0.0, S, 0.9, 0.04)
                    continue
                room_wall(B, x0, z0, S, dx, dz, c == 'D', ceil, t)
                # cornice where the building meets the street
                edge_box(B, x0, z0, S, dx, dz, 'trim', -0.1, WH - 0.35, S + 0.1, WH - 0.05, -0.14, outward=True)
                # parapet around the roof on that side
                edge_box(B, x0, z0, S, dx, dz, 'plaster', 0, WH, S, WH + 0.6, 0.25)
                edge_box(B, x0, z0, S, dx, dz, 'trim', -0.05, WH + 0.6, S + 0.05, WH + 0.7, 0.3)
            # furniture against a solid wall
            if solid and rnd.random() < 0.55:
                dx, dz = solid[0]
                kind = rnd.random()
                if kind < 0.4:      # shelves with jars
                    edge_box(B, x0, z0, S, dx, dz, 'darkwood', 0.6, 0.0, S - 0.6, 1.9, 0.45, collide='prop')
                    for k in range(3):
                        edge_box(B, x0, z0, S, dx, dz, 'wood', 0.6, 0.55 + k * 0.6, S - 0.6, 0.6 + k * 0.6, 0.47)
                        for j in range(4):
                            u = 0.9 + j * 0.65 + rnd.random() * 0.2
                            px, pz = edge_point(x0, z0, S, dx, dz, u, 0.25)
                            B.lathe_y('terracotta', px, 0.6 + k * 0.6, pz, [(0, 0.08), (0.12, 0.11), (0.26, 0.07), (0.3, 0.05)], 10)
                elif kind < 0.75:   # table with crates beside it
                    px, pz = edge_point(x0, z0, S, dx, dz, S / 2, 0.9)
                    B.box('wood', px - 0.8, 0.72, pz - 0.5, px + 0.8, 0.8, pz + 0.5, collide='prop')
                    for ox in (-0.7, 0.7):
                        for oz in (-0.4, 0.4):
                            B.box('darkwood', px + ox - 0.04, 0, pz + oz - 0.04, px + ox + 0.04, 0.72, pz + oz + 0.04)
                    B.box('crate', px + 0.9, 0, pz - 0.45, px + 1.75, 0.85, pz + 0.4, collide='prop')
                else:               # sacks and a barrel
                    for k in range(4):
                        px, pz = edge_point(x0, z0, S, dx, dz, 0.7 + k * 0.75, 0.35)
                        B.box('cloth_sand', px - 0.3, 0, pz - 0.22, px + 0.3, 0.45, pz + 0.22, rot=rnd.random() * 0.5)
                    px, pz = edge_point(x0, z0, S, dx, dz, S - 0.6, 0.6)
                    B.colliders.append([round(px - 0.42, 3), 0, round(pz - 0.42, 3), round(px + 0.42, 3), 1.2, round(pz + 0.42, 3), 'barrel'])
                    B.cylinder('barrel', px, 0, pz, 0.42, 1.2, segs=18)
            # roof clutter: vents, a stair hatch, a water tank now and then
            r = rnd.random()
            if r < 0.25:
                B.box('iron', cx - 0.3, WH, cz - 0.3, cx + 0.3, WH + 0.5, cz + 0.3)
                B.box('iron', cx - 0.38, WH + 0.5, cz - 0.38, cx + 0.38, WH + 0.56, cz + 0.38)
            elif r < 0.4:
                B.box('plaster', cx - 0.9, WH, cz - 0.7, cx + 0.9, WH + 1.9, cz + 0.7)
                B.box('wood', cx - 0.45, WH, cz + 0.7, cx + 0.45, WH + 1.6, cz + 0.74)
            elif r < 0.5:
                B.lathe_y('barrel', cx, WH + 0.9, cz, [(0, 0.6), (1.1, 0.6), (1.25, 0.45), (1.3, 0.15)], 18)
                for sx in (-0.45, 0.45):
                    for sz in (-0.45, 0.45):
                        B.box('iron', cx + sx - 0.04, WH, cz + sz - 0.04, cx + sx + 0.04, WH + 0.9, cz + sz + 0.04)
            if rnd.random() < 0.5:
                col = rnd.choice(['cloth_red', 'cloth_blue', 'cloth_sand'])
                B.box(col, cx - 1.2, 0.0, cz - 0.8, cx + 1.2, 0.015, cz + 0.8)


def edge_point(x0, z0, S, dx, dz, u, d):
    """Point u along the cell edge facing (dx, dz), d metres in from it."""
    if dx:
        ex = x0 + S - d if dx > 0 else x0 + d
        return ex, z0 + u
    ez = z0 + S - d if dz > 0 else z0 + d
    return x0 + u, ez


def edge_box(B, x0, z0, S, dx, dz, mat, u0, y0, u1, y1, depth, collide=None, outward=False):
    """Box hugging the cell edge facing (dx, dz): u along the edge, depth into the cell
    (negative depth / outward=True pokes out past the edge)."""
    d0, d1 = (0.0, depth) if depth > 0 else (depth, 0.0)
    if dx:
        a = x0 + S - d1 if dx > 0 else x0 + d0
        b = x0 + S - d0 if dx > 0 else x0 + d1
        B.box(mat, min(a, b), y0, z0 + u0, max(a, b), y1, z0 + u1, collide)
    else:
        a = z0 + S - d1 if dz > 0 else z0 + d0
        b = z0 + S - d0 if dz > 0 else z0 + d1
        B.box(mat, x0 + u0, y0, min(a, b), x0 + u1, y1, max(a, b), collide)


def room_wall(B, x0, z0, S, dx, dz, door, ceil, t):
    m = S / 2
    if door:
        hw, dh = 0.8, 2.4
        edge_box(B, x0, z0, S, dx, dz, 'plaster', 0, 0, m - hw, ceil, t, collide='wall')
        edge_box(B, x0, z0, S, dx, dz, 'plaster', m + hw, 0, S, ceil, t, collide='wall')
        edge_box(B, x0, z0, S, dx, dz, 'plaster', m - hw, dh, m + hw, ceil, t, collide='wall')
        # stone frame proud of both faces, and an open plank door swung inward
        edge_box(B, x0, z0, S, dx, dz, 'trim', m - hw - 0.14, 0, m - hw, dh + 0.14, t + 0.06)
        edge_box(B, x0, z0, S, dx, dz, 'trim', m + hw, 0, m + hw + 0.14, dh + 0.14, t + 0.06)
        edge_box(B, x0, z0, S, dx, dz, 'trim', m - hw, dh, m + hw, dh + 0.14, t + 0.06)
        edge_box(B, x0, z0, S, dx, dz, 'wood', m - hw - 0.02, 0.02, m - hw + 0.05, dh - 0.04, t + 1.4)
    else:
        ww, sill, head = 0.7, 1.1, 2.0
        edge_box(B, x0, z0, S, dx, dz, 'plaster', 0, 0, S, sill, t, collide='wall')
        edge_box(B, x0, z0, S, dx, dz, 'plaster', 0, sill, m - ww, ceil, t, collide='wall')
        edge_box(B, x0, z0, S, dx, dz, 'plaster', m + ww, sill, S, ceil, t, collide='wall')
        edge_box(B, x0, z0, S, dx, dz, 'plaster', m - ww, head, m + ww, ceil, t, collide='wall')
        edge_box(B, x0, z0, S, dx, dz, 'trim', m - ww - 0.08, sill - 0.08, m + ww + 0.08, sill, t + 0.1)
        edge_box(B, x0, z0, S, dx, dz, 'trim', m - ww - 0.08, head, m + ww + 0.08, head + 0.1, t + 0.06)
        for k in range(4):
            u = m - ww + 0.25 + k * 0.3
            edge_box(B, x0, z0, S, dx, dz, 'iron', u - 0.015, sill, u + 0.015, head, t * 0.6)
        edge_box(B, x0, z0, S, dx, dz, 'iron', m - ww, sill + 0.45, m + ww, sill + 0.48, t * 0.6)


# ---------------------------------------------------------------- set dressing
def dress(B, grid, S, walls, at, walk, fh=lambda x, z: 0.0):
    """Rooftops, towers, balconies, palms, stalls and pots. Uses its own
    random stream so the base layout above stays exactly the same."""
    rnd = random.Random(2024)
    H, W = len(grid), len(grid[0])

    def facing(x, z):
        """Directions (dx, dz) from cell x,z towards a neighbouring wall."""
        return [(dx, dz) for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)) if at(x + dx, z + dz) == '#']

    # ---- rooftops on interior blocks: parapets plus a dome, roof room or water tank per 3x3 cells
    for (x0, z0, x1, z1, h, border) in walls:
        if border:
            continue
        top = h + 0.12
        for (ax0, az0, ax1, az1) in ((x0, z0, x1, z0 + 0.25), (x0, z1 - 0.25, x1, z1), (x0, z0, x0 + 0.25, z1), (x1 - 0.25, z0, x1, z1)):
            B.box('plaster', ax0, top, az0, ax1, top + 0.55, az1)
            B.box('trim', ax0 - 0.04, top + 0.55, az0 - 0.04, ax1 + 0.04, top + 0.65, az1 + 0.04)
        nx, nz = max(1, round((x1 - x0) / (S * 3))), max(1, round((z1 - z0) / (S * 3)))
        for i in range(nx):
            for k in range(nz):
                cx = x0 + (i + 0.5) * (x1 - x0) / nx
                cz = z0 + (k + 0.5) * (z1 - z0) / nz
                span = min((x1 - x0) / nx, (z1 - z0) / nz)
                r = rnd.random()
                if r < 0.35 and span >= S:
                    # drum + onion-ish dome + finial
                    R = span * 0.32
                    B.lathe_y('plaster', cx, top, cz, [(0, R * 1.08), (0.35, R * 1.08), (0.35, R), (1.1, R)], 24)
                    B.lathe_y('trim', cx, top + 1.1, cz, [(0, R * 1.06), (0.14, R * 1.06)], 24)
                    B.dome('tiles' if rnd.random() < 0.5 else 'plaster', cx, top + 1.24, cz, R, R * 1.05)
                    B.lathe_y('iron', cx, top + 1.24 + R * 1.05, cz, [(0, 0.06), (0.15, 0.1), (0.3, 0.03), (0.75, 0.015)], 8)
                    for a in range(8):
                        an = a / 8 * math.pi * 2
                        wx, wz = cx + math.cos(an) * R * 0.99, cz + math.sin(an) * R * 0.99
                        B.box('glass', wx - 0.12, top + 0.5, wz - 0.12, wx + 0.12, top + 0.95, wz + 0.12, rot=-an)
                elif r < 0.6:
                    # small rooftop room with a door and its own cornice
                    w, d = min(span * 0.5, 3.0), min(span * 0.42, 2.4)
                    B.box('plaster', cx - w / 2, top, cz - d / 2, cx + w / 2, top + 2.3, cz + d / 2)
                    B.box('trim', cx - w / 2 - 0.08, top + 2.3, cz - d / 2 - 0.08, cx + w / 2 + 0.08, top + 2.45, cz + d / 2 + 0.08)
                    B.box('wood', cx - 0.45, top, cz + d / 2, cx + 0.45, top + 1.9, cz + d / 2 + 0.04)
                    B.box('iron', cx - 0.45, top + 1.0, cz + d / 2 + 0.04, cx + 0.45, top + 1.06, cz + d / 2 + 0.06)
                else:
                    # water tank on a steel stand, with a pipe down to the roof
                    for sx in (-0.55, 0.55):
                        for sz in (-0.55, 0.55):
                            B.box('iron', cx + sx - 0.05, top, cz + sz - 0.05, cx + sx + 0.05, top + 1.3, cz + sz + 0.05)
                    B.box('iron', cx - 0.7, top + 1.25, cz - 0.7, cx + 0.7, top + 1.35, cz + 0.7)
                    B.lathe_y('barrel', cx, top + 1.35, cz, [(0, 0.75), (1.4, 0.75), (1.55, 0.6), (1.6, 0.2)], 20)
                    for yy in (0.4, 1.0):
                        B.lathe_y('iron', cx, top + 1.35 + yy, cz, [(0, 0.77), (0.06, 0.77)], 20)
                    B.box('iron', cx + 0.7, top, cz - 0.04, cx + 0.78, top + 1.6, cz + 0.04)

    # ---- watchtowers on the outer wall, every few cells along its inner edge
    border_h = max(h for *_, h, b in walls if b)
    for x in range(2, W - 2, 7):
        for z in (0, H - 1):
            tz0 = z * S if z == 0 else z * S
            tower(B, x * S + S / 2, tz0 + S / 2, border_h, rnd)
    for z in range(4, H - 2, 8):
        for x in (0, W - 1):
            tower(B, x * S + S / 2, z * S + S / 2, border_h, rnd)

    # ---- street props on walkable cells
    for z in range(H):
        for x in range(W):
            c = at(x, z)
            if c not in '.,' or (c == ',' and z > H - 4):
                continue
            touch = facing(x, z)
            if not touch:
                continue
            x0, z0 = x * S, z * S
            cx, cz = x0 + S / 2, z0 + S / 2
            dx, dz = touch[0]
            fy = fh(x, z)
            r = rnd.random()
            if fy > 0:
                continue   # keep raised walkways clear
            if r < 0.05:
                # palm tree in a corner of the cell, leaning away from the wall
                px, pz = cx + dx * (S / 2 - 0.9) + (dz and (rnd.random() - 0.5) * 2), cz + dz * (S / 2 - 0.9) + (dx and (rnd.random() - 0.5) * 2)
                palm(B, px, pz, -dx, -dz, rnd)
                B.colliders.append([round(px - 0.25, 3), 0, round(pz - 0.25, 3), round(px + 0.25, 3), 6.0, round(pz + 0.25, 3), 'palm'])
            elif r < 0.11 and c == '.':
                stall(B, cx, cz, dx, dz, S, rnd)
            elif r < 0.2:
                # clay pots and urns against the wall
                for k in range(rnd.randint(2, 4)):
                    u = (rnd.random() - 0.5) * (S - 1.2)
                    px = cx + dx * (S / 2 - 0.45) + (u if dz else 0)
                    pz = cz + dz * (S / 2 - 0.45) + (u if dx else 0)
                    s_ = rnd.uniform(0.7, 1.15)
                    pot(B, px, pz, s_)
                    B.colliders.append([round(px - 0.3 * s_, 3), 0, round(pz - 0.3 * s_, 3), round(px + 0.3 * s_, 3), round(0.85 * s_, 3), round(pz + 0.3 * s_, 3), 'pot'])

    # ---- a sandbag wall on each bombsite (waist high, cover you can shoot over)
    for L in 'AB':
        cells = [(x, z) for z in range(H) for x in range(W) if at(x, z) == L
                 and all(at(x + dx, z + dz) == L for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        if not cells:
            continue
        x, z = cells[len(cells) // 2]
        cx, cz = x * S + S / 2, z * S + S / 2
        sy = fh(x, z)
        along_x = rnd.random() < 0.5
        for row in range(3):
            for k in range(5 - (row % 2)):
                u = -1.6 + k * 0.8 + (0.4 if row % 2 else 0)
                bx, bz = (cx + u, cz) if along_x else (cx, cz + u)
                w, d = (0.38, 0.26) if along_x else (0.26, 0.38)
                B.box('cloth_sand', bx - w, sy + row * 0.32, bz - d, bx + w, sy + row * 0.32 + 0.34, bz + d, rot=(rnd.random() - 0.5) * 0.12)
        if along_x:
            B.colliders.append([round(cx - 2.0, 3), sy, round(cz - 0.3, 3), round(cx + 2.0, 3), sy + 1.0, round(cz + 0.3, 3), 'sandbags'])
        else:
            B.colliders.append([round(cx - 0.3, 3), sy, round(cz - 2.0, 3), round(cx + 0.3, 3), sy + 1.0, round(cz + 2.0, 3), 'sandbags'])

    # ---- wooden balconies on some upper facades (above head height, visual only)
    for (x0, z0, x1, z1, h, border) in walls:
        if h < 6.5:
            continue
        for zc in range(int(z0 / S), int(z1 / S)):
            for side in (-1, 1):
                xs = int(x0 / S) - 1 if side < 0 else int(x1 / S)
                if walk(xs, zc) and rnd.random() < 0.12:  # walk = street here
                    f = x0 if side < 0 else x1
                    balcony(B, 'x', f, zc * S + S / 2, side)
        for xc in range(int(x0 / S), int(x1 / S)):
            for side in (-1, 1):
                zs = int(z0 / S) - 1 if side < 0 else int(z1 / S)
                if walk(xc, zs) and rnd.random() < 0.12:  # walk = street here
                    f = z0 if side < 0 else z1
                    balcony(B, 'z', f, xc * S + S / 2, side)


def tower(B, cx, cz, h, rnd):
    s = 1.7
    B.box('sandstone', cx - s, h, cz - s, cx + s, h + 3.2, cz + s)
    B.box('trim', cx - s - 0.12, h + 3.2, cz - s - 0.12, cx + s + 0.12, h + 3.45, cz + s + 0.12)
    for k in range(4):
        for t in (-1, 0, 1):
            u = t * 1.1
            pts = [(cx + u, cz - s - 0.12), (cx + u, cz + s + 0.12 - 0.3), (cx - s - 0.12, cz + u), (cx + s + 0.12 - 0.3, cz + u)][k]
            if k < 2:
                B.box('trim', pts[0] - 0.3, h + 3.45, pts[1], pts[0] + 0.3, h + 4.0, pts[1] + 0.3)
            else:
                B.box('trim', pts[0], h + 3.45, pts[1] - 0.3, pts[0] + 0.3, h + 4.0, pts[1] + 0.3)
    for (ox, oz) in ((0, -s - 0.01), (0, s - 0.01), (-s - 0.01, 0), (s - 0.01, 0)):
        if ox:
            B.box('glass', cx + ox, h + 1.4, cz - 0.12, cx + ox + 0.02, h + 2.5, cz + 0.12)
        else:
            B.box('glass', cx - 0.12, h + 1.4, cz + oz, cx + 0.12, h + 2.5, cz + oz + 0.02)
    if rnd.random() < 0.6:
        col = 'cloth_red' if rnd.random() < 0.5 else 'cloth_blue'
        B.box('iron', cx - 0.03, h + 3.45, cz - 0.03, cx + 0.03, h + 6.0, cz + 0.03)
        B.box(col, cx + 0.03, h + 5.0, cz - 0.01, cx + 1.1, h + 5.8, cz + 0.01)


def palm(B, px, pz, lx, lz, rnd):
    hgt = rnd.uniform(5.5, 7.5)
    n = 10
    lean = rnd.uniform(0.6, 1.2)
    pts = []
    for k in range(n + 1):
        t = k / n
        off = lean * t * t
        pts.append((px + lx * off, t * hgt, pz + lz * off))
    for k in range(n):
        (ax, ay, az), (bx, by, bz) = pts[k], pts[k + 1]
        r0 = 0.2 - 0.07 * k / n
        B.lathe_y('darkwood', ax, ay, az, [(0, r0), (by - ay - 0.06, r0 * 0.92), (by - ay, r0 * 1.06)], 10)
    tx, ty, tz = pts[-1]
    B.lathe_y('leaf', tx, ty - 0.2, tz, [(0, 0.22), (0.3, 0.26), (0.45, 0.05)], 10)
    for f in range(9):
        a = f / 9 * math.pi * 2 + rnd.random() * 0.4
        L = rnd.uniform(2.2, 3.0)
        ca, sa = math.cos(a), math.sin(a)
        prev = None
        for s in range(6):
            t = s / 5
            d = L * t
            y = ty + 0.25 + math.sin(t * math.pi * 0.8) * 0.7 - t * t * 1.6
            w = 0.38 * math.sin(math.pi * min(0.95, t * 0.85 + 0.12))
            cxp, czp = tx + ca * d, tz + sa * d
            left = (cxp - sa * w, y - 0.08 * t, czp + ca * w)
            right = (cxp + sa * w, y - 0.08 * t, czp - ca * w)
            mid = (cxp, y + 0.04, czp)
            if prev:
                pl, pm, pr = prev
                B.quad('leaf', [pl, pm, mid, left])
                B.quad('leaf', [pm, pr, right, mid])
            prev = (left, mid, right)


def stall(B, cx, cz, dx, dz, S, rnd):
    """Market stall against the wall: counter, goods, poles and a sloped canopy."""
    def L(u, v):
        # u along the wall, v outward from the wall face
        wx = cx + dx * (S / 2) - dx * v + (u if dz else 0)
        wz = cz + dz * (S / 2) - dz * v + (u if dx else 0)
        return wx, wz

    def lbox(mat, u0, y0, v0, u1, y1, v1, collide=None):
        ax, az = L(u0, v0); bx, bz = L(u1, v1)
        B.box(mat, min(ax, bx), y0, min(az, bz), max(ax, bx), y1, max(az, bz), collide)

    lbox('wood', -1.2, 0, 0.1, 1.2, 0.85, 1.0, 'stall')
    lbox('darkwood', -1.25, 0.85, 0.05, 1.25, 0.92, 1.05)
    for u in (-1.2, 1.2):
        lbox('darkwood', u - 0.05, 0, 1.35, u + 0.05, 2.25, 1.45)
    col = rnd.choice(['cloth_red', 'cloth_blue', 'cloth_sand'])
    for k in range(6):
        v0, v1 = 0.0 + k * 0.25, 0.25 + k * 0.25
        y0, y1 = 2.75 - k * 0.09, 2.75 - (k + 1) * 0.09
        a0, a1, b0, b1 = L(-1.4, v0), L(1.4, v0), L(-1.4, v1), L(1.4, v1)
        B.quad(col, [(a0[0], y0, a0[1]), (a1[0], y0, a1[1]), (b1[0], y1, b1[1]), (b0[0], y1, b0[1])])
    # goods on the counter: crates of produce and pots
    for k in range(3):
        u = -0.8 + k * 0.8
        lbox('crate', u - 0.3, 0.92, 0.3, u + 0.3, 1.15, 0.8)
        lbox(rnd.choice(['cloth_red', 'leaf', 'terracotta']), u - 0.26, 1.15, 0.34, u + 0.26, 1.22, 0.76)
    px, pz = L(1.0, 0.55)
    pot(B, px, pz, 0.5, y0=0.92)


def pot(B, px, pz, s, y0=0.0):
    prof = [(0, 0.12), (0.05, 0.2), (0.3, 0.3), (0.55, 0.27), (0.7, 0.14), (0.78, 0.1), (0.82, 0.13), (0.85, 0.13)]
    B.lathe_y('terracotta', px, y0, pz, [(dy * s, r * s) for dy, r in prof], 16)


def balcony(B, axis, f, mid, side):
    """Wooden balcony with railing and brackets on a wall face (axis x or z)."""
    y = 3.35
    def put(mat, u0, y0, u1, y1, d0, d1):
        if axis == 'x':
            B.box(mat, min(f + side * d0, f + side * d1), y0, u0, max(f + side * d0, f + side * d1), y1, u1)
        else:
            B.box(mat, u0, y0, min(f + side * d0, f + side * d1), u1, y1, max(f + side * d0, f + side * d1))
    put('darkwood', mid - 1.2, y, mid + 1.2, y + 0.14, 0.0, 0.95)
    for k in range(3):
        u = mid - 1.0 + k * 1.0
        put('darkwood', u - 0.06, y - 0.7, u + 0.06, y, 0.0, 0.12)
        put('darkwood', u - 0.05, y - 0.55, u + 0.05, y - 0.05, 0.1, 0.75)
    for u in (mid - 1.15, mid + 1.15):
        put('wood', u - 0.05, y + 0.14, u + 0.05, y + 1.05, 0.0, 0.95)
    put('wood', mid - 1.2, y + 1.0, mid + 1.2, y + 1.08, 0.88, 0.96)
    for k in range(13):
        u = mid - 1.1 + k * 0.183
        put('wood', u - 0.025, y + 0.14, u + 0.025, y + 1.0, 0.89, 0.93)
    put('cloth_red' if int(mid) % 2 else 'cloth_blue', mid - 1.0, y + 0.3, mid + 1.0, y + 0.95, 0.95, 0.965)


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


def barrel(B, px, pz, y0=0.0):
    B.cylinder('barrel', px, y0, pz, 0.42, 1.2, segs=20)
    for yy in (0.18, 0.6, 1.02):
        B.cylinder('iron', px, y0 + yy - 0.03, pz, 0.435, 0.06, segs=20)
    B.cylinder('iron', px, y0 + 1.2, pz, 0.38, 0.015, segs=20)


WALKABLE = '.,usABTKhD'


def raised(B, grid, S, at, lvl):
    """Raised floors (merged into few boxes, like src/level.js) with dressed
    retaining faces and coping, plus stone staircases where walkable cells
    meet one level up. Colliders match the game's own fallback exactly."""
    H, W = len(grid), len(grid[0])
    done = [[False] * W for _ in range(H)]
    for z in range(H):
        for x in range(W):
            L = lvl(x, z)
            if done[z][x] or L <= 0 or at(x, z) == '#':
                continue
            x1 = x
            while x1 + 1 < W and not done[z][x1 + 1] and at(x1 + 1, z) != '#' and lvl(x1 + 1, z) == L:
                x1 += 1
            z1 = z
            while z1 + 1 < H and all(not done[z1 + 1][k] and at(k, z1 + 1) != '#' and lvl(k, z1 + 1) == L for k in range(x, x1 + 1)):
                z1 += 1
            for zz in range(z, z1 + 1):
                for k in range(x, x1 + 1):
                    done[zz][k] = True
            h = L * STEP
            minX, maxX, minZ, maxZ = x * S, (x1 + 1) * S, z * S, (z1 + 1) * S
            B.colliders.append([minX, 0, minZ, maxX, round(h, 3), maxZ, 'floor'])
            # retaining block just under the floor surface (no z-fighting with the floor quad)
            B.box('stone', minX, 0, minZ, maxX, h - 0.012, maxZ)
    # coping along every exposed edge of a raised cell, and stairs onto one-level steps
    for z in range(H):
        for x in range(W):
            if at(x, z) not in WALKABLE:
                continue
            L = lvl(x, z)
            lo = L * STEP
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = at(x + dx, z + dz)
                if n not in WALKABLE:
                    continue
                dl = lvl(x + dx, z + dz) - L
                if dl == 1:
                    # two 0.15 m treads in this (lower) cell against the shared edge
                    for d0, d1, sh in ((0.0, 0.3, 0.3), (0.3, 0.6, 0.15)):
                        if dx:
                            e = (x + 1) * S if dx > 0 else x * S
                            bx0, bx1 = (e - d1, e - d0) if dx > 0 else (e + d0, e + d1)
                            bz0, bz1 = z * S, (z + 1) * S
                        else:
                            e = (z + 1) * S if dz > 0 else z * S
                            bz0, bz1 = (e - d1, e - d0) if dz > 0 else (e + d0, e + d1)
                            bx0, bx1 = x * S, (x + 1) * S
                        B.colliders.append([round(bx0, 3), 0, round(bz0, 3), round(bx1, 3), round(lo + sh, 3), round(bz1, 3), 'stair'])
                        B.box('trim', bx0, 0, bz0, bx1, lo + sh, bz1)
                        # worn nosing on each tread
                        if dx:
                            nx0 = bx0 if dx < 0 else bx1 - 0.04
                            B.box('stone', min(nx0, nx0 + 0.04), lo + sh - 0.03, bz0, max(nx0, nx0 + 0.04) + 0.0, lo + sh + 0.005, bz1)
                        else:
                            nz0 = bz0 if dz < 0 else bz1 - 0.04
                            B.box('stone', bx0, lo + sh - 0.03, min(nz0, nz0 + 0.04), bx1, lo + sh + 0.005, max(nz0, nz0 + 0.04))
                elif dl <= -2 and L > 0:
                    # ledge you can drop off: stone coping on the high side
                    if dx:
                        e = (x + 1) * S if dx > 0 else x * S
                        B.box('trim', e - 0.25 if dx > 0 else e, lo - 0.06, z * S, e if dx > 0 else e + 0.25, lo + 0.04, (z + 1) * S)
                    else:
                        e = (z + 1) * S if dz > 0 else z * S
                        B.box('trim', x * S, lo - 0.06, e - 0.25 if dz > 0 else e, (x + 1) * S, lo + 0.04, e if dz > 0 else e + 0.25)


def main(argv):
    name = argv[argv.index('--map') + 1] if '--map' in argv else 'dunehold'
    out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(ROOT, 'public', 'models', 'maps')
    os.makedirs(out, exist_ok=True)
    cols = build(name)
    for m, col in {'sandstone': (0.75, 0.6, 0.4, 1), 'plaster': (0.8, 0.72, 0.6, 1), 'trim': (0.55, 0.45, 0.32, 1), 'stone': (0.7, 0.58, 0.42, 1),
                   'sand': (0.78, 0.66, 0.47, 1), 'paving': (0.55, 0.5, 0.44, 1), 'tiles': (0.7, 0.62, 0.5, 1), 'concrete': (0.5, 0.5, 0.48, 1),
                   'wood': (0.45, 0.3, 0.16, 1), 'darkwood': (0.22, 0.14, 0.08, 1), 'crate': (0.5, 0.35, 0.2, 1), 'iron': (0.12, 0.12, 0.13, 1),
                   'barrel': (0.3, 0.42, 0.28, 1), 'glass': (0.04, 0.05, 0.06, 1), 'lamp': (1.0, 0.75, 0.4, 1), 'cloth_red': (0.6, 0.12, 0.1, 1),
                   'cloth_blue': (0.12, 0.22, 0.45, 1), 'cloth_sand': (0.75, 0.62, 0.42, 1), 'leaf': (0.2, 0.38, 0.12, 1), 'terracotta': (0.62, 0.3, 0.16, 1)}.items():
        mm = bpy.data.materials.get(m)
        if mm:
            mm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = col
    if '--preview' in argv:
        from preview import render_preview
        render_preview(os.path.join(out, f'{name}_preview.png'), size=(1400, 800), angle=(0.75, 0, -0.5), samples=12)
    from lib import export_glb, stats
    export_glb(os.path.join(out, f'{name}.glb'))
    with open(os.path.join(out, f'{name}.colliders.json'), 'w') as f:
        json.dump(cols, f)
    print(f'{name}: {stats()} tris, {len(cols)} colliders')
    return {'tris': stats(), 'colliders': len(cols)}


if __name__ == '__main__':
    main(sys.argv)
