"""Renders a quick studio preview of the current scene (Cycles on CPU when
headless, EEVEE inside a running Blender)."""
import math
import bpy
from mathutils import Vector


def _bounds(scene):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    for o in scene.objects:
        if o.type != 'MESH' or o.hide_render or o.get('_cutter'):
            continue
        ev = o.evaluated_get(dg)
        mw = ev.matrix_world
        for v in ev.data.vertices:
            w = mw @ v.co
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def render_preview(path, size=(1200, 600), angle=(0.2, 0.0, -0.55), dist_scale=1.0, target=None, ortho=False, samples=24, lens=70):
    scene = bpy.context.scene
    if bpy.app.background:
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = samples
        scene.cycles.device = 'CPU'
    else:
        scene.render.engine = 'BLENDER_EEVEE'
        scene.eevee.taa_render_samples = max(16, samples)
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.05, 0.05, 0.055, 1)
    bg.inputs['Strength'].default_value = 1.0

    lo, hi = _bounds(scene)
    center = target or (lo + hi) / 2
    radius = (hi - lo).length / 2

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = lens
    cam_data.sensor_fit = 'HORIZONTAL'
    if ortho:
        cam_data.type = 'ORTHO'; cam_data.ortho_scale = radius * 2.2
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    pitch, _, yaw = angle
    fov = min(cam_data.angle, 2 * math.atan(math.tan(cam_data.angle / 2) * size[1] / size[0]) * 1.6)
    d = radius / math.tan(fov / 2) * 1.05 * dist_scale
    dirv = Vector((math.cos(pitch) * math.sin(yaw), -math.cos(pitch) * math.cos(yaw), math.sin(pitch)))
    cam.location = center + dirv * d
    cam.rotation_euler = (-dirv).to_track_quat('-Z', 'Y').to_euler()
    cam_data.clip_start = d * 0.01
    cam_data.clip_end = d * 10
    scene.camera = cam

    for i, (loc, energy, col) in enumerate([((2, -3, 3), 900, (1, 0.95, 0.9)), ((-3, 2, 2), 500, (0.75, 0.85, 1)), ((0, 3, -1), 250, (1, 1, 1))]):
        ld = bpy.data.lights.new(f'l{i}', 'AREA')
        ld.energy = energy * max(0.05, radius) ** 2; ld.color = col; ld.size = 2 * max(0.2, radius)
        lo_ = bpy.data.objects.new(f'l{i}', ld)
        lo_.location = center + Vector(loc) * max(0.3, radius) * 2
        lo_.rotation_euler = (center - lo_.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo_)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
