"""Shared Blender helpers for building Vantage assets headlessly.

Coordinates for weapons: +X = muzzle direction, +Z = up, +Y = the weapon's
LEFT side (glTF export maps Blender (x, y, z) -> (x, z, -y), so the left side
ends up on glTF -Z, matching the game's authoring space where +Z is right).

Run with the `bpy` module (pip install bpy) or inside a running Blender
(e.g. through the Blender MCP add-on) — see blender/README.md.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- scene

BUILD_SCENE = 'VantageBuild'


def scene():
    if bpy.app.background:
        return bpy.context.scene
    return bpy.data.scenes.get(BUILD_SCENE) or bpy.context.scene


def reset():
    """Headless: factory reset. Inside a running Blender: build into a
    dedicated scene and only clear that, so the user's own scenes and
    add-ons (like the MCP server) are left alone."""
    if bpy.app.background:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return
    sc = bpy.data.scenes.get(BUILD_SCENE) or bpy.data.scenes.new(BUILD_SCENE)
    for win in bpy.context.window_manager.windows:
        win.scene = sc
    for o in list(sc.objects):
        bpy.data.objects.remove(o)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(coll):
            if item.users == 0:
                coll.remove(item)


def material(name, color=(0.5, 0.5, 0.5, 1), metal=0.0, rough=0.5):
    """Materials are placeholders: the game swaps them by name prefix
    (skin_*, metal_*, detail_*, map surfaces...). Colours here only matter
    for preview renders."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = color
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m


def link(obj, parent=None):
    scene().collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


ANCHORS = ('muzzle', 'grip', 'fore')


def empty(name, loc, parent=None):
    if name in ANCHORS and name in bpy.data.objects:
        bpy.data.objects[name].name = name + '_part'   # anchors keep their exact names
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.empty_display_size = 0.01
    return link(e, parent)


def mesh_obj(name, bm, mat, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    if mat is not None:
        me.materials.append(mat)
    return link(obj, parent)

# ---------------------------------------------------------------- 2D paths

def sample_path(cmds, seg=10):
    """Path mini-language (same as the JS generator):
    ('M',x,z) ('L',x,z) ('Q',cx,cz,x,z) ('C',c1x,c1z,c2x,c2z,x,z) ('A',cx,cz,r,a0,a1)
    Returns a list of (x, z) points (closed implicitly)."""
    pts = []
    cur = (0, 0)
    for c in cmds:
        k = c[0]
        if k == 'M':
            cur = (c[1], c[2]); pts.append(cur)
        elif k == 'L':
            cur = (c[1], c[2]); pts.append(cur)
        elif k == 'Q':
            x0, z0 = cur
            for i in range(1, seg + 1):
                t = i / seg; u = 1 - t
                pts.append((u * u * x0 + 2 * u * t * c[1] + t * t * c[3], u * u * z0 + 2 * u * t * c[2] + t * t * c[4]))
            cur = (c[3], c[4])
        elif k == 'C':
            x0, z0 = cur
            for i in range(1, seg + 1):
                t = i / seg; u = 1 - t
                pts.append((u ** 3 * x0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t ** 3 * c[5],
                            u ** 3 * z0 + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t ** 3 * c[6]))
            cur = (c[5], c[6])
        elif k == 'A':
            cx, cz, r, a0, a1 = c[1:6]
            n = max(8, int(abs(a1 - a0) / (math.pi * 2) * 48))
            for i in range(n + 1):
                a = a0 + (a1 - a0) * i / n
                pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
            cur = pts[-1]
    # drop duplicates
    out = []
    for p in pts:
        if not out or (abs(out[-1][0] - p[0]) > 1e-6 or abs(out[-1][1] - p[1]) > 1e-6):
            out.append(p)
    if len(out) > 2 and abs(out[0][0] - out[-1][0]) < 1e-6 and abs(out[0][1] - out[-1][1]) < 1e-6:
        out.pop()
    return out


def _signed_area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

# ---------------------------------------------------------------- solids

def extrude(name, cmds, width, mat, parent=None, y=0.0, bevel=0.002, bevel_segs=3, seg=10):
    """Side profile in the XZ plane extruded along Y (centred on y)."""
    pts = sample_path(cmds, seg)
    if _signed_area(pts) < 0:
        pts = pts[::-1]
    bm = bmesh.new()
    vs = [bm.verts.new((x, y - width / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, width, 0), verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_obj(name, bm, mat, parent)
    if bevel > 0:
        add_bevel(obj, bevel, bevel_segs)
    return obj


def puffy(name, cmds, width, mat, parent=None, y=0.0, r=0.006, rings=3, seg=12):
    """Side profile extruded along Y with soft, moulded edges: a wide clamped
    bevel rounds the side faces into the edge (works on concave outlines)."""
    obj = extrude(name, cmds, width, mat, parent, y, bevel=0, seg=seg)
    if r > 0:
        m = add_bevel(obj, min(r, width * 0.45), rings + 1)
        m.angle_limit = math.radians(30)
        m.profile = 0.6
    return obj


def resample(pts, n):
    """Closed polyline -> n points evenly spaced by arc length."""
    segs = [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    lens = [math.dist(a, b) for a, b in segs]
    total = sum(lens)
    out, i, acc = [], 0, 0.0
    for k in range(n):
        d = k / n * total
        while acc + lens[i] < d and i < len(lens) - 1:
            acc += lens[i]; i += 1
        t = (d - acc) / lens[i] if lens[i] else 0
        (ax, az), (bx, bz) = segs[i]
        out.append((ax + (bx - ax) * t, az + (bz - az) * t))
    return out


def rrect(w, h, r, cy=0.0, cz=0.0, top_r=None):
    """Rounded rectangle cross-section (Y width, Z height) as path commands.
    top_r rounds only the two upper corners differently (e.g. slides)."""
    tr = r if top_r is None else top_r
    y0, y1, z0, z1 = cy - w / 2, cy + w / 2, cz - h / 2, cz + h / 2
    P = math.pi
    return [('M', y0 + r, z0), ('L', y1 - r, z0), ('A', y1 - r, z0 + r, r, -P / 2, 0), ('L', y1, z1 - tr),
            ('A', y1 - tr, z1 - tr, tr, 0, P / 2), ('L', y0 + tr, z1), ('A', y0 + tr, z1 - tr, tr, P / 2, P),
            ('L', y0, z0 + r), ('A', y0 + r, z0 + r, r, P, P * 1.5)]


def loft(name, sections, mat, parent=None, n=48, cap=True, crease=40):
    """Skin a solid through cross-sections along X.
    sections: [(x, yz_path_cmds_or_points), ...] from back to front."""
    rings = []
    for x, sec in sections:
        pts = sec if isinstance(sec[0][0], (int, float)) else sample_path(sec, 8)
        if _signed_area(pts) < 0:
            pts = pts[::-1]
        rings.append((x, resample(pts, n)))
    bm = bmesh.new()
    vr = [[bm.verts.new((x, yy, zz)) for yy, zz in ring] for x, ring in rings]
    for a, b in zip(vr, vr[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], b[i], b[j], a[j]))
    if cap:
        bm.faces.new(vr[0]); bm.faces.new(vr[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_obj(name, bm, mat, parent)
    smooth_by_angle(obj, crease)
    return obj


def section(name, yz_cmds, x0, x1, mat, parent=None, bevel=0.0, n=48, crease=40):
    """Constant cross-section (YZ plane) run along X from x0 to x1."""
    obj = loft(name, [(x0, yz_cmds), (x1, yz_cmds)], mat, parent, n=n, crease=crease)
    if bevel:
        add_bevel(obj, bevel, 2)
    return obj


def smooth_by_angle(obj, angle=40):
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(angle))


def lathe(name, prof, mat, parent=None, z=0.0, y=0.0, segs=32):
    """Round part along X. prof = [(x, r), ...] from back to front."""
    bm = bmesh.new()
    rings = []
    for x, r in prof:
        ring = []
        for i in range(segs):
            a = i / segs * math.pi * 2
            ring.append(bm.verts.new((x, y + math.cos(a) * r, z + math.sin(a) * r)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            try:
                bm.faces.new((a[i], a[j], b[j], b[i]))
            except ValueError:
                pass
    # caps
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        try:
            f = bm.faces.new(ring[::-1] if flip else ring)
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_obj(name, bm, mat, parent)
    smooth(obj)
    return obj


def tube(name, x0, x1, r, mat, parent=None, z=0.0, y=0.0, segs=28, chamfer=0.0008):
    return lathe(name, [(x0, 0.0001), (x0, r - chamfer), (x0 + chamfer, r), (x1 - chamfer, r), (x1, r - chamfer), (x1, 0.0001)], mat, parent, z, y, segs)


def box(name, size, loc, mat, parent=None, bevel=0.0015, segs=2, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    obj = mesh_obj(name, bm, mat, parent)
    obj.location = loc
    obj.rotation_euler = rot
    if bevel > 0:
        add_bevel(obj, bevel, segs)
    return obj


def cyl(name, r, depth, loc, mat, parent=None, axis='Y', segs=24, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=depth)
    obj = mesh_obj(name, bm, mat, parent)
    obj.location = loc
    if axis == 'Y':
        obj.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == 'X':
        obj.rotation_euler = (0, math.pi / 2, 0)
    smooth(obj)
    if bevel:
        add_bevel(obj, bevel, 2)
    return obj


def sphere(name, r, loc, mat, parent=None, segs=20, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    obj = mesh_obj(name, bm, mat, parent)
    obj.location = loc
    obj.scale = scale
    smooth(obj)
    return obj


def torus(name, R, r, loc, mat, parent=None, rot=(math.pi / 2, 0, 0), segs=32):
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = i / segs * math.pi * 2
        ring = []
        for j in range(12):
            b = j / 12 * math.pi * 2
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % segs]
        for j in range(12):
            k = (j + 1) % 12
            bm.faces.new((a[j], b[j], b[k], a[k]))
    obj = mesh_obj(name, bm, mat, parent)
    obj.location = loc
    obj.rotation_euler = rot
    smooth(obj)
    return obj

# ---------------------------------------------------------------- modifiers

def add_bevel(obj, width, segs=3):
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segs
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(35)
    m.harden_normals = True
    smooth(obj)
    wn = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    return m


def smooth(obj):
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True


def cut(target, cutter, tolerant=False):
    """Boolean difference; the cutter object is removed afterwards.
    tolerant: for a hole through a ground blade (its pinched edge makes the
    mesh awkward for the exact solver, which can leave the hole closed)."""
    m = target.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.solver = 'EXACT'
    m.object = cutter
    if tolerant:
        m.use_hole_tolerant = True
        m.use_self = True
    # move boolean before bevel so the cut edges get bevelled too
    first = next((i for i, x in enumerate(target.modifiers) if x.type != 'BOOLEAN'), None)
    if first is not None and first < len(target.modifiers) - 1:
        target.modifiers.move(len(target.modifiers) - 1, first)
    m.name = 'cut_done'
    cutter.hide_render = True
    cutter.display_type = 'WIRE'
    cutter['_cutter'] = True
    return m


def cutter_box(size, loc, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    obj = mesh_obj('cutter', bm, None)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def cutter_cyl(r, depth, loc, axis='Y', segs=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=depth)
    obj = mesh_obj('cutter', bm, None)
    obj.location = loc
    obj.rotation_euler = (math.pi / 2, 0, 0) if axis == 'Y' else (0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)
    return obj


def apply_all():
    """Apply modifiers on every mesh and delete boolean cutters."""
    for obj in list(scene().objects):
        if obj.get('_cutter'):
            continue
        if obj.type != 'MESH' or not obj.modifiers:
            continue
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        old = obj.data
        obj.modifiers.clear()
        obj.data = me
        bpy.data.meshes.remove(old)
    for obj in list(scene().objects):
        if obj.get('_cutter'):
            bpy.data.objects.remove(obj)

# ---------------------------------------------------------------- knife blades

def blade(name, cmds, edge_flags, thick, mat, parent=None, grind=0.35, seg=14):
    """Knife blade with a real ground edge.
    cmds: outline path; edge_flags: function(x, z) -> True for points on the
    sharpened edge. The outline is extruded, the side faces inset to form the
    grind line, and edge-side outline points are pinched to near zero width."""
    pts = sample_path(cmds, seg)
    if _signed_area(pts) < 0:
        pts = pts[::-1]
    bm = bmesh.new()
    t = thick / 2
    front = [bm.verts.new((x, t, z)) for x, z in pts]
    back = [bm.verts.new((x, -t, z)) for x, z in pts]
    f1 = bm.faces.new(front[::-1])
    f2 = bm.faces.new(back)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    # inset both flats to create the grind boundary
    h = max(z for _, z in pts) - min(z for _, z in pts)
    bmesh.ops.inset_region(bm, faces=[f1, f2], thickness=h * grind * 0.5, use_even_offset=True)
    # pinch outline vertices on the edge side
    for v in front + back:
        if edge_flags(v.co.x, v.co.z):
            v.co.y *= 0.06
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_obj(name, bm, mat, parent)
    for p in obj.data.polygons:
        p.use_smooth = False
    wn = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    return obj

# ---------------------------------------------------------------- export

def bake_ao(distance=0.022, samples=32, strength=0.85, floor=0.3):
    """Ambient occlusion baked into each mesh's vertex colours ('AO'): the
    crevices between parts, under rails and round pins, inside ports and
    grooves come out darker, so a model's detail reads in the game (which
    multiplies its materials by it). Occlusion from every part of the model
    within `distance`; softened (strength) and never darker than `floor`.
    Meshes that already carry it (a third-person copy joined from them) are
    left as they are."""
    sc = scene()
    meshes = [o for o in sc.objects if o.type == 'MESH' and not o.get('_cutter') and len(o.data.vertices)]
    todo = [o for o in meshes if 'AO' not in o.data.color_attributes]
    if not todo:
        return
    try:
        bpy.ops.preferences.addon_enable(module='cycles')
    except Exception:
        pass
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    if sc.world is None:
        sc.world = bpy.data.worlds.new('world')
    sc.world.light_settings.distance = distance
    for o in todo:
        ca = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        o.data.color_attributes.active_color = ca
    for o in sc.objects:
        o.select_set(o in todo)
    bpy.context.view_layer.objects.active = todo[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for o in todo:
        for c in o.data.color_attributes['AO'].data:
            a = max(floor, 1 - (1 - c.color[0]) * strength)
            c.color = (a, a, a, 1.0)


def export_glb(path, ao=None):
    apply_all()
    if ao:
        bake_ao(ao)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_apply=True, export_yup=True,
        export_extras=True, export_materials='EXPORT', export_normals=True,
        export_texcoords=True, use_visible=False, use_active_scene=True,
        export_vertex_color='ACTIVE' if ao else 'MATERIAL',
    )


def stats():
    tris = 0
    for obj in scene().objects:
        if obj.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return tris
