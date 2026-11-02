"""Third-person characters for Vantage (one per team), built in Blender and
exported as public/models/characters/<team>.glb.

The node hierarchy is the game's animation rig. Empties are the joints and
keep zero rotation so the game can pose them directly:

  body > legL|legR (hip) > kneeL|kneeR
       > torso > neck > head
               > armL|armR (shoulder) > elbowL|elbowR
               > gunHolder

Blender space: +Z up, +Y = the direction the character faces (glTF export
turns that into the game's -Z forward). Origin at the feet.
Material names (char_*) tell the game which shared material to use.
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Matrix, Vector
from lib import reset, material, link, empty, apply_all, export_glb, stats, scene, puffy

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

# ---------------------------------------------------------------- shapes

def ring(rx, ry, cx=0.0, cy=0.0, p=2.0, n=24):
    """Superellipse: p=2 is an ellipse, larger p is squarer."""
    pts = []
    for i in range(n):
        a = i / n * PI * 2
        c, s = math.cos(a), math.sin(a)
        pts.append((cx + rx * math.copysign(abs(c) ** (2 / p), c), cy + ry * math.copysign(abs(s) ** (2 / p), s)))
    return pts


def zloft(name, secs, mat, parent=None, n=24, cap=True, crease=55):
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
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(crease))
    obj = bpy.data.objects.new(name, me)
    link(obj)
    if parent is not None:
        attach(obj, parent)
    return obj


def blob(name, size, loc, mat, parent=None, p=3.0, n=20, rot=(0, 0, 0)):
    """Rounded box (padded pouch, pad, block): a superellipse loft."""
    sx, sy, sz = size
    k = 7
    secs = []
    for i in range(k + 1):
        t = -1 + 2 * i / k
        w = (1 - abs(t) ** p) ** (1 / p)
        secs.append((t * sz / 2, max(0.002, sx / 2 * w), max(0.002, sy / 2 * w), 0, 0, p))
    o = zloft(name, secs, mat, None, n=n, cap=True)
    o.location = loc
    o.rotation_euler = rot
    if parent is not None:
        attach(o, parent)
    return o


def attach(obj, parent):
    """Parent while keeping the object's current world placement, with an
    identity parent-inverse (so the exported local transform is plain)."""
    bpy.context.view_layer.update()
    w = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ w
    return obj


def joint(name, loc, parent=None):
    e = empty(name, loc)
    e.empty_display_size = 0.05
    if parent is not None:
        attach(e, parent)
    return e


def box_uv(obj, scale=4.0):
    """World box-projected UVs for meshes that don't have any."""
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

def leg(M, side, body, T):
    s = 'L' if side < 0 else 'R'
    hip = joint(f'leg{s}', (0.1 * side, 0, 0.92), body)
    hx = 0.1 * side
    # thigh with a little taper and a cargo pocket on the outside
    zloft(f'thigh{s}', [(0.48, 0.062, 0.064, hx), (0.6, 0.074, 0.08, hx), (0.75, 0.084, 0.09, hx), (0.9, 0.088, 0.092, hx), (0.96, 0.08, 0.085, hx)], M['pants'], hip)
    blob(f'cargo{s}', (0.04, 0.11, 0.13), (hx + side * 0.078, 0.0, 0.72), M['pants'], hip)
    blob(f'cargo_flap{s}', (0.045, 0.115, 0.03), (hx + side * 0.08, 0.0, 0.79), M['pants'], hip)
    if side > 0:
        blob('holster', (0.05, 0.1, 0.17), (hx + 0.1, 0.0, 0.8), M['strap'], hip)
        blob('holster_grip', (0.034, 0.06, 0.06), (hx + 0.1, -0.02, 0.9), M['metal'], hip, rot=(0.3, 0, 0))
        for z in (0.72, 0.84):
            zloft(f'thigh_strap{z}', [(z - 0.012, 0.09, 0.094, hx), (z + 0.012, 0.09, 0.094, hx)], M['strap'], hip, cap=False)
    knee = joint(f'knee{s}', (hx, 0, 0.48), hip)
    blob(f'kneepad{s}', (0.11, 0.05, 0.11), (hx, 0.06, 0.48), M['strap'], knee, p=2.6)
    # shin, bloused trouser cuff, boot
    zloft(f'shin{s}', [(0.12, 0.052, 0.055, hx), (0.16, 0.06, 0.064, hx), (0.3, 0.056, 0.06, hx, -0.005), (0.42, 0.062, 0.064, hx), (0.5, 0.062, 0.064, hx)], M['pants'], knee)
    zloft(f'boot{s}', [(0.0, 0.058, 0.14, hx, 0.045, 2.6), (0.04, 0.06, 0.14, hx, 0.045, 2.6), (0.06, 0.058, 0.12, hx, 0.035, 2.4),
                       (0.085, 0.056, 0.085, hx, 0.012), (0.12, 0.056, 0.064, hx), (0.165, 0.058, 0.062, hx)], M['boots'], knee)
    zloft(f'sole{s}', [(-0.012, 0.062, 0.145, hx, 0.045, 3.0), (0.012, 0.064, 0.147, hx, 0.045, 3.0)], M['strap'], knee)
    for k in range(3):
        z = 0.1 + k * 0.022
        zloft(f'lace{s}{k}', [(z - 0.004, 0.035, 0.008, hx, 0.058 - k * 0.004), (z + 0.004, 0.035, 0.008, hx, 0.058 - k * 0.004)], M['strap'], knee, n=8)
    return hip


def torso(M, body, T):
    t = joint('torso', (0, 0, 0.92), body)
    z0 = 0.92
    Z = lambda z: z0 + z
    # shirt body: hips → waist → chest → shoulders
    zloft('shirt', [(Z(-0.06), 0.165, 0.11), (Z(0.06), 0.158, 0.1), (Z(0.2), 0.168, 0.108), (Z(0.36), 0.2, 0.118), (Z(0.46), 0.212, 0.12),
                    (Z(0.53), 0.19, 0.11), (Z(0.58), 0.13, 0.085), (Z(0.62), 0.06, 0.055)], M['shirt'], t)
    # belt + buckle
    zloft('belt', [(Z(-0.01), 0.172, 0.116), (Z(0.045), 0.172, 0.116)], M['strap'], t, cap=False)
    blob('buckle', (0.06, 0.016, 0.04), (0, 0.118, Z(0.018)), M['metal'], t)
    # plate carrier: front and back plates with a cummerbund, shoulder straps
    zloft('carrier', [(Z(0.14), 0.19, 0.136, 0, 0, 3.2), (Z(0.2), 0.195, 0.14, 0, 0, 3.2), (Z(0.42), 0.198, 0.142, 0, 0, 3.2),
                      (Z(0.48), 0.185, 0.134, 0, 0, 3.2)], M['vest'], t)
    for sx in (-1, 1):
        blob(f'carrier_strap{sx}', (0.07, 0.27, 0.05), (sx * 0.12, 0.0, Z(0.5)), M['vest'], t, p=2.4)
    # front placard: three magazine pouches and an admin pouch
    for i in (-1, 0, 1):
        blob(f'mag_pouch{i}', (0.075, 0.05, 0.12), (i * 0.08, 0.16, Z(0.27)), M['vest'], t, p=2.8)
        blob(f'mag_flap{i}', (0.078, 0.054, 0.025), (i * 0.08, 0.162, Z(0.335)), M['strap'], t, p=2.8)
    blob('admin_pouch', (0.17, 0.04, 0.08), (0, 0.155, Z(0.41)), M['vest'], t, p=3.2)
    for sx in (-1, 1):
        blob(f'side_pouch{sx}', (0.05, 0.09, 0.11), (sx * 0.2, 0.02, Z(0.24)), M['vest'], t, p=2.8)
    if T:
        # assault pack on the back with a rolled mat
        blob('pack', (0.27, 0.12, 0.32), (0, -0.2, Z(0.34)), M['vest'], t, p=3.0)
        blob('pack_pocket', (0.2, 0.05, 0.13), (0, -0.265, Z(0.26)), M['vest'], t, p=2.8)
        roll = zloft('bedroll', [(-0.15, 0.045, 0.045), (0.15, 0.045, 0.045)], M['shirt'], None, n=16)
        roll.rotation_euler = (0, PI / 2, 0); roll.location = (0, -0.2, Z(0.53)); attach(roll, t)
    else:
        # radio, antenna and a hydration pouch on the back
        blob('radio', (0.075, 0.05, 0.17), (-0.12, -0.17, Z(0.36)), M['strap'], t, p=3.4)
        zloft('antenna', [(Z(0.44), 0.005, 0.005, -0.14, -0.175), (Z(0.78), 0.003, 0.003, -0.14, -0.175)], M['strap'], t, n=8)
        blob('hydration', (0.2, 0.06, 0.26), (0.03, -0.17, Z(0.3)), M['vest'], t, p=2.8)
    return t


def head(M, t, T):
    z0 = 0.92 + 0.6
    neck = joint('neck', (0, 0, z0), t)
    zloft('neck_skin', [(z0 - 0.02, 0.058, 0.054), (z0 + 0.1, 0.05, 0.05)], M['skin'] if not T else M['head'], neck)
    h = joint('head', (0, 0, z0 + 0.1), neck)
    hz = z0 + 0.1
    face = M['skin']
    skull = M['head'] if T else M['skin']
    # head: egg shape slightly longer front-to-back
    zloft('skull', [(hz - 0.01, 0.03, 0.035, 0, 0.01), (hz + 0.01, 0.068, 0.078, 0, 0.012), (hz + 0.05, 0.088, 0.1, 0, 0.008), (hz + 0.1, 0.095, 0.106),
                    (hz + 0.15, 0.09, 0.1, 0, -0.004), (hz + 0.19, 0.07, 0.08, 0, -0.008), (hz + 0.215, 0.03, 0.04, 0, -0.008)], skull, h, n=28)
    blob('nose', (0.022, 0.03, 0.04), (0, 0.1, hz + 0.08), face if not T else M['head'], h, p=2.2)
    for sx in (-1, 1):
        blob(f'ear{sx}', (0.018, 0.034, 0.05), (sx * 0.093, -0.004, hz + 0.095), skull, h, p=2.2)
    if T:
        # balaclava eye opening, goggles pushed up, scarf around the neck
        zloft('eye_band', [(hz + 0.09, 0.08, 0.098, 0, 0.012), (hz + 0.125, 0.081, 0.098, 0, 0.012)], face, h, cap=False, n=28)
        _cull_back(bpy.data.objects['eye_band'], keep_y=0.04)
        zloft('scarf', [(z0 - 0.03, 0.1, 0.09), (z0 + 0.01, 0.085, 0.08, 0, 0.006), (z0 + 0.05, 0.068, 0.068, 0, 0.01), (z0 + 0.08, 0.06, 0.064, 0, 0.012)], M['shirt'], neck)
        goggle_z, goggle_y = hz + 0.17, 0.085
        zloft('goggle_strap', [(goggle_z - 0.012, 0.097, 0.1), (goggle_z + 0.012, 0.094, 0.097)], M['strap'], h, cap=False, n=28)
    else:
        # helmet with rim, ear protection, rail mount and goggles over the brim
        zloft('helmet', [(hz + 0.075, 0.118, 0.13, 0, -0.008), (hz + 0.12, 0.122, 0.132, 0, -0.006), (hz + 0.17, 0.11, 0.12, 0, -0.004),
                         (hz + 0.21, 0.085, 0.094), (hz + 0.235, 0.05, 0.055), (hz + 0.245, 0.01, 0.01)], M['helmet'], h, n=32)
        zloft('helmet_rim', [(hz + 0.07, 0.122, 0.134, 0, -0.008), (hz + 0.082, 0.123, 0.135, 0, -0.008)], M['strap'], h, cap=False, n=32)
        for sx in (-1, 1):
            cup = zloft(f'earcup{sx}', [(-0.018, 0.04, 0.046), (0.018, 0.04, 0.046), (0.024, 0.03, 0.036)], M['strap'], None, n=20)
            cup.rotation_euler = (0, sx * PI / 2, 0); cup.location = (sx * 0.1, 0, hz + 0.085); attach(cup, h)
            blob(f'helmet_rail{sx}', (0.012, 0.09, 0.018), (sx * 0.12, -0.01, hz + 0.115), M['strap'], h, p=3)
        blob('nvg_mount', (0.05, 0.03, 0.04), (0, 0.13, hz + 0.15), M['strap'], h, p=3)
        goggle_z, goggle_y = hz + 0.112, 0.098
    # goggles: frame + two lenses
    blob('goggles', (0.17, 0.045, 0.05), (0, goggle_y, goggle_z), M['strap'], h, p=3.2)
    for sx in (-1, 1):
        lens = zloft(f'lens{sx}', [(-0.004, 0.032, 0.022), (0.004, 0.03, 0.02)], M['lens'], None, n=20)
        lens.rotation_euler = (PI / 2, 0, 0); lens.location = (sx * 0.04, goggle_y + 0.022, goggle_z); attach(lens, h)
    return h


def _cull_back(obj, keep_y):
    """Remove the back half of a band so it only shows across the face."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < keep_y], context='FACES')
    bm.to_mesh(obj.data); bm.free()


def arm(M, side, t, T):
    s = 'L' if side < 0 else 'R'
    sx = 0.22 * side
    sz = 0.92 + 0.52
    sh = joint(f'arm{s}', (sx, 0, sz), t)
    blob(f'shoulder_pad{s}', (0.13, 0.13, 0.08), (sx, 0, sz + 0.01), M['vest'] if not T else M['shirt'], sh, p=2.4)
    zloft(f'upper{s}', [(sz - 0.29, 0.05, 0.052, sx), (sz - 0.2, 0.056, 0.058, sx), (sz - 0.08, 0.062, 0.064, sx), (sz + 0.02, 0.062, 0.064, sx)], M['shirt'], sh)
    blob(f'patch{s}', (0.012, 0.06, 0.07), (sx + side * 0.06, 0, sz - 0.1), M['vest'], sh, p=3.5)
    el = joint(f'elbow{s}', (sx, 0, sz - 0.28), sh)
    ez = sz - 0.28
    # forearm with rolled sleeve, glove with knuckle guard
    zloft(f'fore{s}', [(ez - 0.24, 0.04, 0.042, sx), (ez - 0.12, 0.048, 0.05, sx), (ez + 0.02, 0.052, 0.054, sx)], M['shirt'] if not T else M['skin'], el)
    if T:
        zloft(f'sleeve_roll{s}', [(ez - 0.06, 0.056, 0.058, sx), (ez + 0.02, 0.058, 0.06, sx)], M['shirt'], el, cap=False)
    zloft(f'cuff{s}', [(ez - 0.25, 0.044, 0.046, sx), (ez - 0.21, 0.046, 0.048, sx)], M['glove'], el, cap=False)
    zloft(f'hand{s}', [(ez - 0.34, 0.024, 0.036, sx, 0.004, 2.6), (ez - 0.3, 0.03, 0.046, sx, 0.004, 2.6), (ez - 0.26, 0.03, 0.044, sx, 0, 2.6),
                       (ez - 0.24, 0.026, 0.038, sx)], M['glove'], el)
    blob(f'knuckles{s}', (0.016, 0.07, 0.03), (sx + side * 0.026, 0.004, ez - 0.29), M['strap'], el, p=3)
    thumb = zloft(f'thumb{s}', [(0, 0.011, 0.011), (0.05, 0.009, 0.009)], M['glove'], None, n=10)
    thumb.rotation_euler = (-0.6, 0, 0); thumb.location = (sx - side * 0.01, 0.035, ez - 0.27); attach(thumb, el)
    return sh


def build(team):
    reset()
    M = mats(team)
    T = team == 't'
    root = empty('character', (0, 0, 0))
    body = joint('body', (0, 0, 0), root)
    for side in (-1, 1):
        leg(M, side, body, T)
    t = torso(M, body, T)
    head(M, t, T)
    for side in (-1, 1):
        arm(M, side, t, T)
    # gun anchor in front of the chest (game: 0.12, 0.38, -0.3 from the torso)
    joint('gunHolder', (0.12, 0.3, 0.92 + 0.38), t)
    for o in scene().objects:
        if o.type == 'MESH':
            box_uv(o)
    return root


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
        export_glb(os.path.join(out, f'{team}.glb'))
        report[team] = stats()
        print(f'{team}: {report[team]} tris')
    return report


if __name__ == '__main__':
    main(sys.argv)
