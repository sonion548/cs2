"""Third-person characters for Vantage (one per team), built in Blender and
exported as public/models/characters/<team>.glb.

Each soldier is a set of smooth lofted body and gear parts bound to one
skeleton, so joints bend instead of hinging rigid blocks. Body parts blend
between neighbouring bones by distance; gear (pouches, helmet, boots) follows
a single bone. The game poses the bones itself (walk cycle, crouch, aim, arm
IK onto the weapon, ragdolls).

Bones (no dots in names, so three.js keeps them as-is):
  hips > spine > chest > neck > head
  chest > upperarm_L|R > forearm_L|R > hand_L|R
  hips > thigh_L|R > shin_L|R > foot_L|R

Blender space: +Z up, +Y = the direction the character faces (glTF export
turns that into the game's -Z forward), character's left = -X. Feet at Z=0.
Material names (char_*) tell the game which shared material to use.
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Matrix, Vector
from lib import reset, material, link, scene, stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PI = math.pi

TEAMS = {
    't': dict(shirt=(0.45, 0.39, 0.27), pants=(0.33, 0.29, 0.21), vest=(0.27, 0.25, 0.18), head=(0.22, 0.2, 0.16),
              helmet=(0.3, 0.27, 0.2), glove=(0.13, 0.12, 0.1), skin=(0.62, 0.43, 0.31)),
    'ct': dict(shirt=(0.16, 0.2, 0.29), pants=(0.13, 0.15, 0.21), vest=(0.1, 0.12, 0.18), head=(0.09, 0.1, 0.13),
               helmet=(0.12, 0.14, 0.2), glove=(0.06, 0.06, 0.07), skin=(0.68, 0.5, 0.39)),
}


def mats(team):
    c = TEAMS[team]
    m = lambda n, col, metal=0.0, rough=0.85: material(n, (*col, 1), metal, rough)
    return {
        'shirt': m('char_shirt', c['shirt']), 'pants': m('char_pants', c['pants']), 'vest': m('char_vest', c['vest']),
        'head': m('char_head', c['head']), 'helmet': m('char_helmet', c['helmet'], 0.1, 0.55), 'skin': m('char_skin', c['skin'], 0, 0.6),
        'glove': m('char_glove', c['glove'], 0, 0.75), 'boots': m('char_boots', (0.1, 0.09, 0.08), 0, 0.7),
        'strap': m('char_strap', (0.12, 0.11, 0.1)), 'lens': m('char_lens', (0.05, 0.07, 0.08), 0.6, 0.1),
        'metal': m('char_metal', (0.3, 0.3, 0.32), 0.9, 0.35),
    }


# ---------------------------------------------------------------- skeleton (rest pose: arms hanging, slight A)
def _bones():
    b = [('hips', None, (0, 0, 0.92), (0, 0, 1.08)),
         ('spine', 'hips', (0, 0, 1.08), (0, 0, 1.27)),
         ('chest', 'spine', (0, 0, 1.27), (0, 0, 1.5)),
         ('neck', 'chest', (0, 0, 1.5), (0, 0, 1.61)),
         ('head', 'neck', (0, 0, 1.61), (0, 0, 1.86))]
    for s, L in ((-1, 'L'), (1, 'R')):
        b += [(f'upperarm_{L}', 'chest', (s * 0.215, 0, 1.44), (s * 0.225, 0, 1.16)),
              (f'forearm_{L}', f'upperarm_{L}', (s * 0.225, 0, 1.16), (s * 0.228, 0.01, 0.92)),
              (f'hand_{L}', f'forearm_{L}', (s * 0.228, 0.01, 0.92), (s * 0.23, 0.015, 0.8)),
              (f'thigh_{L}', 'hips', (s * 0.1, 0, 0.92), (s * 0.1, 0, 0.48)),
              (f'shin_{L}', f'thigh_{L}', (s * 0.1, 0, 0.48), (s * 0.1, 0, 0.08)),
              (f'foot_{L}', f'shin_{L}', (s * 0.1, 0, 0.08), (s * 0.1, 0.13, 0.02))]
    return b


BONES = _bones()
SEG = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}
PARTS = []   # (object, candidate bones, rigid)


def build_armature():
    data = bpy.data.armatures.new('rig')
    arm = bpy.data.objects.new('rig', data)
    link(arm)
    make_active(arm, [arm])
    bpy.ops.object.mode_set(mode='EDIT')
    for name, parent, h, t in BONES:
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = h, t
        eb.roll = 0
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def make_active(obj, selected):
    vl = scene().view_layers[0]
    for o in scene().objects:
        o.select_set(False, view_layer=vl)
    for o in selected:
        o.select_set(True, view_layer=vl)
    vl.objects.active = obj


# ---------------------------------------------------------------- shapes
def ring(rx, ry, cx=0.0, cy=0.0, p=2.0, n=24):
    """Superellipse: p=2 is an ellipse, larger p is squarer."""
    pts = []
    for i in range(n):
        a = i / n * PI * 2
        c, s = math.cos(a), math.sin(a)
        pts.append((cx + rx * math.copysign(abs(c) ** (2 / p), c), cy + ry * math.copysign(abs(s) ** (2 / p), s)))
    return pts


def _mesh(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    link(obj)
    return obj


def zloft(name, secs, mat, bones, n=24, cap=True, crease=55, rigid=False):
    """Skin a solid through horizontal sections [(z, rx, ry, cx, cy, p), ...]
    listed bottom to top, with cylindrical UVs."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    for s in secs:
        z, rx, ry = s[:3]
        cx, cy, p = (list(s[3:]) + [0.0, 0.0, 2.0][len(s) - 3:])[:3]
        rings.append([bm.verts.new((x, y, z)) for x, y in ring(rx, ry, cx, cy, p, n)])
    vlen = [0.0]
    for a, b in zip(secs, secs[1:]):
        vlen.append(vlen[-1] + abs(b[0] - a[0]) + 1e-4)
    for k, (a, b) in enumerate(zip(rings, rings[1:])):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            for loop, (u, v) in zip(f.loops, ((i, vlen[k]), (i + 1, vlen[k]), (i + 1, vlen[k + 1]), (i, vlen[k + 1]))):
                loop[uv].uv = (u / n * 1.5, v * 4)
    if cap:
        for r, top in ((rings[0], False), (rings[-1], True)):
            c = bm.verts.new((sum(v.co.x for v in r) / n, sum(v.co.y for v in r) / n, r[0].co.z))
            for i in range(n):
                j = (i + 1) % n
                f = bm.faces.new((r[i], r[j], c) if top else (r[j], r[i], c))
                for loop in f.loops:
                    loop[uv].uv = (loop.vert.co.x * 4, loop.vert.co.y * 4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _mesh(name, bm, mat)
    obj.data.set_sharp_from_angle(angle=math.radians(crease))
    PARTS.append((obj, bones if isinstance(bones, (list, tuple)) else [bones], rigid or isinstance(bones, str)))
    return obj


def blob(name, size, loc, mat, bones, p=3.0, n=20, rot=(0, 0, 0)):
    """Rounded box (padded pouch, pad, block): a superellipse loft, rigid to one bone."""
    sx, sy, sz = size
    k = 7
    secs = []
    for i in range(k + 1):
        t = -1 + 2 * i / k
        w = (1 - abs(t) ** p) ** (1 / p)
        secs.append((t * sz / 2, max(0.002, sx / 2 * w), max(0.002, sy / 2 * w), 0, 0, p))
    o = zloft(name, secs, mat, bones, n=n, cap=True)
    o.location = loc
    o.rotation_euler = rot
    return o


def oriented(obj, rot, loc):
    obj.rotation_euler = rot; obj.location = loc
    return obj


def box_uv(obj, scale=4.0):
    me = obj.data
    if me.uv_layers:
        return
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a, b = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            uv.data[li].uv = (a * scale, b * scale)


# ---------------------------------------------------------------- body parts
def leg(M, s, L, T):
    hx = 0.1 * s
    th, sh, ft = f'thigh_{L}', f'shin_{L}', f'foot_{L}'
    # trousers: hip → knee → bloused cuff over the boot
    zloft(f'thigh{L}', [(0.46, 0.062, 0.066, hx), (0.6, 0.074, 0.08, hx), (0.75, 0.084, 0.09, hx), (0.88, 0.09, 0.094, hx), (0.96, 0.095, 0.098, hx * 0.8)],
          M['pants'], ['hips', th, sh])
    blob(f'cargo{L}', (0.04, 0.11, 0.13), (hx + s * 0.08, 0.0, 0.72), M['pants'], th)
    blob(f'cargo_flap{L}', (0.045, 0.115, 0.03), (hx + s * 0.082, 0.0, 0.79), M['pants'], th)
    if s > 0:
        blob('holster', (0.05, 0.1, 0.17), (hx + 0.1, 0.0, 0.8), M['strap'], th)
        blob('holster_grip', (0.034, 0.06, 0.06), (hx + 0.1, -0.02, 0.9), M['metal'], th, rot=(0.3, 0, 0))
        for z in (0.72, 0.84):
            zloft(f'thigh_strap{z}', [(z - 0.012, 0.092, 0.096, hx), (z + 0.012, 0.092, 0.096, hx)], M['strap'], th, cap=False)
    blob(f'kneepad{L}', (0.11, 0.05, 0.11), (hx, 0.06, 0.48), M['strap'], sh, p=2.6)
    zloft(f'shin{L}', [(0.12, 0.052, 0.055, hx), (0.16, 0.06, 0.064, hx), (0.3, 0.056, 0.06, hx, -0.005), (0.42, 0.062, 0.064, hx), (0.52, 0.064, 0.066, hx)],
          M['pants'], [th, sh, ft])
    zloft(f'boot{L}', [(0.0, 0.058, 0.14, hx, 0.045, 2.6), (0.04, 0.06, 0.14, hx, 0.045, 2.6), (0.06, 0.058, 0.12, hx, 0.035, 2.4),
                       (0.085, 0.056, 0.085, hx, 0.012), (0.12, 0.056, 0.064, hx), (0.165, 0.058, 0.062, hx)], M['boots'], [sh, ft])
    zloft(f'sole{L}', [(-0.012, 0.062, 0.145, hx, 0.045, 3.0), (0.012, 0.064, 0.147, hx, 0.045, 3.0)], M['strap'], ft)
    for k in range(3):
        z = 0.1 + k * 0.022
        zloft(f'lace{L}{k}', [(z - 0.004, 0.035, 0.008, hx, 0.058 - k * 0.004), (z + 0.004, 0.035, 0.008, hx, 0.058 - k * 0.004)], M['strap'], ft, n=8)


def torso(M, T):
    Z = lambda z: 0.92 + z
    # shirt body: hips → waist → chest → shoulders, with deltoid caps
    zloft('shirt', [(Z(-0.06), 0.165, 0.11), (Z(0.06), 0.158, 0.1), (Z(0.2), 0.168, 0.108), (Z(0.36), 0.2, 0.118), (Z(0.46), 0.212, 0.12),
                    (Z(0.53), 0.19, 0.11), (Z(0.58), 0.13, 0.085), (Z(0.62), 0.06, 0.055)], M['shirt'], ['hips', 'spine', 'chest', 'neck'])
    for s, L in ((-1, 'L'), (1, 'R')):
        oriented(zloft(f'deltoid{L}', [(-0.07, 0.05, 0.06), (-0.02, 0.066, 0.07), (0.03, 0.06, 0.064), (0.06, 0.03, 0.04)], M['shirt'], ['chest', f'upperarm_{L}']),
                 (0, 0, 0), (s * 0.205, 0, 1.4))
    zloft('belt', [(Z(-0.01), 0.172, 0.116), (Z(0.045), 0.172, 0.116)], M['strap'], 'hips', cap=False)
    blob('buckle', (0.06, 0.016, 0.04), (0, 0.118, Z(0.018)), M['metal'], 'hips')
    # plate carrier with cummerbund and shoulder straps
    zloft('carrier', [(Z(0.14), 0.19, 0.136, 0, 0, 3.2), (Z(0.2), 0.195, 0.14, 0, 0, 3.2), (Z(0.42), 0.198, 0.142, 0, 0, 3.2),
                      (Z(0.48), 0.185, 0.134, 0, 0, 3.2)], M['vest'], ['spine', 'chest'])
    for sx in (-1, 1):
        blob(f'carrier_strap{sx}', (0.07, 0.27, 0.05), (sx * 0.12, 0.0, Z(0.5)), M['vest'], 'chest', p=2.4)
    for i in (-1, 0, 1):
        blob(f'mag_pouch{i}', (0.075, 0.05, 0.12), (i * 0.08, 0.16, Z(0.27)), M['vest'], 'spine', p=2.8)
        blob(f'mag_flap{i}', (0.078, 0.054, 0.025), (i * 0.08, 0.162, Z(0.335)), M['strap'], 'spine', p=2.8)
    blob('admin_pouch', (0.17, 0.04, 0.08), (0, 0.155, Z(0.41)), M['vest'], 'chest', p=3.2)
    for sx in (-1, 1):
        blob(f'side_pouch{sx}', (0.05, 0.09, 0.11), (sx * 0.2, 0.02, Z(0.24)), M['vest'], 'spine', p=2.8)
    if T:
        blob('pack', (0.27, 0.12, 0.32), (0, -0.2, Z(0.34)), M['vest'], 'chest', p=3.0)
        blob('pack_pocket', (0.2, 0.05, 0.13), (0, -0.265, Z(0.26)), M['vest'], 'chest', p=2.8)
        oriented(zloft('bedroll', [(-0.15, 0.045, 0.045), (0.15, 0.045, 0.045)], M['shirt'], 'chest', n=16), (0, PI / 2, 0), (0, -0.2, Z(0.53)))
    else:
        blob('radio', (0.075, 0.05, 0.17), (-0.12, -0.17, Z(0.36)), M['strap'], 'chest', p=3.4)
        zloft('antenna', [(Z(0.44), 0.005, 0.005, -0.14, -0.175), (Z(0.78), 0.003, 0.003, -0.14, -0.175)], M['strap'], 'chest', n=8)
        blob('hydration', (0.2, 0.06, 0.26), (0.03, -0.17, Z(0.3)), M['vest'], 'chest', p=2.8)


def head(M, T):
    z0 = 0.92 + 0.6
    zloft('neck_skin', [(z0 - 0.02, 0.058, 0.054), (z0 + 0.1, 0.05, 0.05)], M['head'] if T else M['skin'], ['chest', 'neck', 'head'])
    hz = z0 + 0.1
    face, skull = M['skin'], (M['head'] if T else M['skin'])
    H = 'head'
    zloft('skull', [(hz - 0.01, 0.03, 0.035, 0, 0.01), (hz + 0.01, 0.068, 0.078, 0, 0.012), (hz + 0.05, 0.088, 0.1, 0, 0.008), (hz + 0.1, 0.095, 0.106),
                    (hz + 0.15, 0.09, 0.1, 0, -0.004), (hz + 0.19, 0.07, 0.08, 0, -0.008), (hz + 0.215, 0.03, 0.04, 0, -0.008)], skull, H, n=28)
    blob('nose', (0.022, 0.03, 0.04), (0, 0.1, hz + 0.08), face if not T else M['head'], H, p=2.2)
    blob('brow', (0.13, 0.03, 0.02), (0, 0.09, hz + 0.115), skull, H, p=2.4)
    blob('jaw', (0.12, 0.08, 0.05), (0, 0.045, hz + 0.02), skull, H, p=2.2)
    for sx in (-1, 1):
        blob(f'ear{sx}', (0.018, 0.034, 0.05), (sx * 0.093, -0.004, hz + 0.095), skull, H, p=2.2)
    if T:
        # balaclava eye opening, goggles pushed up, scarf around the neck
        band = zloft('eye_band', [(hz + 0.09, 0.08, 0.098, 0, 0.012), (hz + 0.125, 0.081, 0.098, 0, 0.012)], face, H, cap=False, n=28)
        bm = bmesh.new(); bm.from_mesh(band.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < 0.04], context='FACES')
        bm.to_mesh(band.data); bm.free()
        for sx in (-1, 1):
            blob(f'eye{sx}', (0.018, 0.006, 0.01), (sx * 0.032, 0.098, hz + 0.108), M['lens'], H, p=2)
        zloft('scarf', [(z0 - 0.03, 0.1, 0.09), (z0 + 0.01, 0.085, 0.08, 0, 0.006), (z0 + 0.05, 0.068, 0.068, 0, 0.01), (z0 + 0.08, 0.06, 0.064, 0, 0.012)],
              M['shirt'], ['chest', 'neck'])
        gz, gy = hz + 0.17, 0.085
        zloft('goggle_strap', [(gz - 0.012, 0.097, 0.1), (gz + 0.012, 0.094, 0.097)], M['strap'], H, cap=False, n=28)
    else:
        zloft('helmet', [(hz + 0.075, 0.118, 0.13, 0, -0.008), (hz + 0.12, 0.122, 0.132, 0, -0.006), (hz + 0.17, 0.11, 0.12, 0, -0.004),
                         (hz + 0.21, 0.085, 0.094), (hz + 0.235, 0.05, 0.055), (hz + 0.245, 0.01, 0.01)], M['helmet'], H, n=32)
        zloft('helmet_rim', [(hz + 0.07, 0.122, 0.134, 0, -0.008), (hz + 0.082, 0.123, 0.135, 0, -0.008)], M['strap'], H, cap=False, n=32)
        for sx in (-1, 1):
            oriented(zloft(f'earcup{sx}', [(-0.018, 0.04, 0.046), (0.018, 0.04, 0.046), (0.024, 0.03, 0.036)], M['strap'], H, n=20), (0, sx * PI / 2, 0), (sx * 0.1, 0, hz + 0.085))
            blob(f'helmet_rail{sx}', (0.012, 0.09, 0.018), (sx * 0.12, -0.01, hz + 0.115), M['strap'], H, p=3)
            blob(f'eye{sx}', (0.018, 0.006, 0.01), (sx * 0.032, 0.1, hz + 0.106), M['lens'], H, p=2)
        blob('nvg_mount', (0.05, 0.03, 0.04), (0, 0.13, hz + 0.15), M['strap'], H, p=3)
        blob('mouth', (0.04, 0.006, 0.008), (0, 0.098, hz + 0.045), M['strap'], H, p=2)
        gz, gy = hz + 0.112, 0.098
        gz = hz + 0.165   # CT wears the goggles up on the helmet brim
        gy = 0.108
    blob('goggles', (0.17, 0.045, 0.05), (0, gy, gz), M['strap'], H, p=3.2)
    for sx in (-1, 1):
        oriented(zloft(f'lens{sx}', [(-0.004, 0.032, 0.022), (0.004, 0.03, 0.02)], M['lens'], H, n=20), (PI / 2, 0, 0), (sx * 0.04, gy + 0.022, gz))


def arm(M, s, L, T):
    sx = 0.218 * s
    sz = 1.44
    ua, fa, hd = f'upperarm_{L}', f'forearm_{L}', f'hand_{L}'
    blob(f'shoulder_pad{L}', (0.12, 0.13, 0.07), (sx + s * 0.01, 0, sz + 0.005), M['vest'] if not T else M['shirt'], ua, p=2.4)
    zloft(f'upper{L}', [(sz - 0.3, 0.05, 0.052, sx), (sz - 0.2, 0.056, 0.058, sx), (sz - 0.08, 0.062, 0.064, sx), (sz + 0.03, 0.064, 0.066, sx)], M['shirt'], ['chest', ua, fa])
    blob(f'patch{L}', (0.012, 0.06, 0.07), (sx + s * 0.06, 0, sz - 0.1), M['vest'], ua, p=3.5)
    ez = sz - 0.28
    zloft(f'fore{L}', [(ez - 0.25, 0.04, 0.042, sx), (ez - 0.12, 0.048, 0.05, sx), (ez + 0.03, 0.052, 0.054, sx)], M['skin'] if T else M['shirt'], [ua, fa, hd])
    if T:
        zloft(f'sleeve_roll{L}', [(ez - 0.06, 0.056, 0.058, sx), (ez + 0.03, 0.058, 0.06, sx)], M['shirt'], [ua, fa], cap=False)
    zloft(f'cuff{L}', [(ez - 0.26, 0.044, 0.046, sx), (ez - 0.22, 0.046, 0.048, sx)], M['glove'], [fa, hd], cap=False)
    # glove: palm, four curled fingers and a thumb
    hz = ez - 0.25
    zloft(f'hand{L}', [(hz - 0.085, 0.022, 0.034, sx, 0.004, 2.6), (hz - 0.05, 0.03, 0.045, sx, 0.004, 2.6), (hz - 0.01, 0.03, 0.044, sx, 0, 2.6),
                       (hz + 0.01, 0.026, 0.038, sx)], M['glove'], hd)
    blob(f'knuckles{L}', (0.018, 0.07, 0.026), (sx + s * 0.024, 0.004, hz - 0.06), M['strap'], hd, p=3)
    for k in range(4):
        y = -0.026 + k * 0.017
        f = zloft(f'finger{L}{k}', [(0, 0.0085, 0.0085), (0.025, 0.008, 0.008), (0.045, 0.0072, 0.0072)], M['glove'], hd, n=10)
        oriented(f, (-0.5, s * 0.15, 0), (sx - s * 0.004, y, hz - 0.08))
        f.rotation_euler = (PI + 0.35, 0, 0)
    th = zloft(f'thumb{L}', [(0, 0.011, 0.011), (0.05, 0.009, 0.009)], M['glove'], hd, n=10)
    oriented(th, (-0.6, 0, -s * 0.3), (sx - s * 0.014, 0.034, hz - 0.03))


# ---------------------------------------------------------------- skinning
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (a + ab * t - p).length


def bind(obj, bones, rigid):
    """Vertex groups for a part: one bone (gear) or a distance blend across its bones."""
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    me = obj.data
    me.transform(mw)                     # bake placement so rest positions are world/rest space
    obj.matrix_world = Matrix.Identity(4)
    groups = {b: obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b) for b in bones}
    if rigid:
        groups[bones[0]].add(list(range(len(me.vertices))), 1.0, 'REPLACE')
        return
    for v in me.vertices:
        p = v.co
        ws = [(b, 1.0 / (seg_dist(p, *SEG[b]) ** 6 + 1e-10)) for b in bones]
        ws.sort(key=lambda x: -x[1])
        ws = ws[:3]
        tot = sum(w for _, w in ws)
        for b, w in ws:
            if w / tot > 0.01:
                groups[b].add([v.index], w / tot, 'REPLACE')


def build(team):
    reset()
    PARTS.clear()
    M = mats(team)
    T = team == 't'
    arm_obj = build_armature()
    for s, L in ((-1, 'L'), (1, 'R')):
        leg(M, s, L, T)
    torso(M, T)
    head(M, T)
    for s, L in ((-1, 'L'), (1, 'R')):
        arm(M, s, L, T)
    for obj, bones, rigid in PARTS:
        box_uv(obj)
        bind(obj, bones, rigid)
    # one skinned mesh per material keeps draw calls low
    by_mat = {}
    for obj, _, _ in PARTS:
        by_mat.setdefault(obj.data.materials[0].name, []).append(obj)
    for name, objs in by_mat.items():
        if len(objs) > 1:
            make_active(objs[0], objs)
            bpy.ops.object.join()
        o = objs[0]
        o.name = 'body_' + name.replace('char_', '')
        o.parent = arm_obj
        mod = o.modifiers.new('rig', 'ARMATURE')
        mod.object = arm_obj
    return arm_obj


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=False, export_yup=True, export_skins=True,
                              export_animations=False, export_materials='EXPORT', export_normals=True, export_texcoords=True,
                              use_visible=False, use_active_scene=True)


def main(argv):
    out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(ROOT, 'public', 'models', 'characters')
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else list(TEAMS)
    os.makedirs(out, exist_ok=True)
    report = {}
    for team in only:
        build(team)
        if '--preview' in argv:
            from preview import render_preview
            render_preview(os.path.join(out, f'{team}.png'), size=(800, 1000), angle=(0.12, 0, PI - 0.6), lens=60)
            build(team)
        export(os.path.join(out, f'{team}.glb'))
        report[team] = stats()
        print(f'{team}: {report[team]} tris')
    return report


if __name__ == '__main__':
    main(sys.argv)
