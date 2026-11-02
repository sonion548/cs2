"""Renders a quick studio preview of the current scene (Cycles, CPU)."""
import math
import bpy
from mathutils import Vector


def render_preview(path, size=(1200, 600), angle=(0.2, 0.0, -0.55), dist_scale=1.0, target=None, ortho=False, samples=24):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w') if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.05, 0.05, 0.055, 1)
    bg.inputs['Strength'].default_value = 1.0

    # bounds of visible meshes
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in scene.objects:
        if o.type != 'MESH' or o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    center = target or (lo + hi) / 2
    radius = (hi - lo).length / 2

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 70
    if ortho:
        cam_data.type = 'ORTHO'; cam_data.ortho_scale = radius * 2.2
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    pitch, _, yaw = angle
    d = radius / math.tan(cam_data.angle / 2) * 1.05 * dist_scale
    dirv = Vector((math.cos(pitch) * math.sin(yaw), -math.cos(pitch) * math.cos(yaw), math.sin(pitch)))
    cam.location = center + dirv * d
    cam.rotation_euler = (-dirv).to_track_quat('-Z', 'Y').to_euler()
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
