"""Materials for the characters, baked into one texture set per character.

Every part carries a 'phys' UV map in metres (its own construction
coordinates), so patterns come out at real-world size: cordura grain,
webbing rows 25 mm wide on a 38 mm pitch with bar-tacks, the shemagh's woven
check, knit ribs. Dirt and wear come from world position (dust collects low
on trousers and boots, edges of hard gear rub bright) and from baked ambient
occlusion.

The bake writes four images in the 'atlas' UV layout: base colour (with
occlusion multiplied in), tangent-space normal, and roughness/metal packed
the glTF way (green = roughness, blue = metal). The game gets one material.
"""
import math
import os

import bpy
import numpy as np

# ---------------------------------------------------------------- palettes (linear RGB)
PAL = {
    'ct': {
        'shirt': (0.05, 0.062, 0.098), 'pants': (0.044, 0.054, 0.085), 'glove': (0.018, 0.018, 0.019),
        'boot': (0.016, 0.015, 0.015), 'sole': (0.01, 0.01, 0.01), 'knit': (0.014, 0.014, 0.016),
        'carrier': (0.052, 0.054, 0.056), 'molle': (0.052, 0.054, 0.056), 'pouch': (0.056, 0.058, 0.06),
        'webbing': (0.03, 0.031, 0.033), 'elastic': (0.02, 0.02, 0.022), 'cord': (0.015, 0.015, 0.015),
        'belt': (0.04, 0.041, 0.043), 'helmet': (0.045, 0.047, 0.05), 'velcro': (0.06, 0.062, 0.064),
        'kneepad': (0.022, 0.023, 0.025), 'polymer': (0.022, 0.023, 0.025), 'radio': (0.03, 0.031, 0.033),
        'skin': (0.42, 0.25, 0.17),
        'gpad': (0.012, 0.012, 0.013), 'gcuff': (0.026, 0.026, 0.028), 'stitch': (0.05, 0.05, 0.052), 'wrap': (0.075, 0.08, 0.085),
    },
    't': {
        'jacket': (0.105, 0.108, 0.062), 'pants': (0.14, 0.11, 0.07), 'glove': (0.07, 0.04, 0.022),
        'boot': (0.27, 0.19, 0.11), 'sole': (0.05, 0.04, 0.032), 'shemagh': (0.52, 0.47, 0.36),
        'canvas': (0.22, 0.19, 0.115), 'webbing': (0.09, 0.085, 0.05), 'wood': (0.2, 0.11, 0.05),
        'skin': (0.36, 0.2, 0.12),
        'gpad': (0.045, 0.026, 0.014), 'gcuff': (0.03, 0.02, 0.012), 'stitch': (0.2, 0.15, 0.085), 'wrap': (0.46, 0.41, 0.3),
    },
}
COMMON = {
    'mag': (0.018, 0.018, 0.019), 'rubber': (0.012, 0.012, 0.012), 'metal': (0.12, 0.12, 0.125),
    'gunmetal': (0.03, 0.03, 0.032), 'foam': (0.01, 0.01, 0.01), 'lens': (0.004, 0.005, 0.006),
    'frame': (0.012, 0.012, 0.012), 'patch': (0.012, 0.012, 0.013), 'eye': (0.7, 0.66, 0.62),
    'knuckle': (0.016, 0.016, 0.017),
}
# roughness, metal, grain bump strength, grain scale (1/m), kind
LOOK = {
    'shirt': (0.86, 0, 0.25, 900, 'fabric'), 'jacket': (0.9, 0, 0.35, 700, 'fabric'), 'pants': (0.88, 0, 0.3, 800, 'fabric'),
    'glove': (0.62, 0, 0.2, 1200, 'leather'), 'boot': (0.58, 0, 0.2, 900, 'leather'), 'sole': (0.92, 0, 0.4, 300, 'rubber'),
    'knit': (0.95, 0, 0.5, 600, 'knit'), 'shemagh': (0.93, 0, 0.35, 800, 'shemagh'),
    'carrier': (0.78, 0, 0.35, 1100, 'cordura'), 'molle': (0.78, 0, 0.35, 1100, 'molle'), 'pouch': (0.78, 0, 0.35, 1100, 'cordura'),
    'canvas': (0.92, 0, 0.45, 650, 'canvas'), 'webbing': (0.7, 0, 0.3, 1400, 'webbing'), 'elastic': (0.8, 0, 0.3, 1400, 'webbing'),
    'cord': (0.75, 0, 0.2, 2000, 'plain'), 'belt': (0.72, 0, 0.3, 1100, 'cordura'), 'velcro': (1.0, 0, 0.6, 1600, 'plain'),
    'helmet': (0.62, 0, 0.12, 700, 'paint'), 'kneepad': (0.5, 0, 0.1, 500, 'paint'), 'polymer': (0.48, 0, 0.08, 500, 'paint'),
    'radio': (0.5, 0, 0.08, 500, 'paint'), 'mag': (0.42, 0, 0.1, 600, 'paint'), 'rubber': (0.88, 0, 0.15, 900, 'plain'),
    'metal': (0.38, 0.85, 0.05, 900, 'metal'), 'gunmetal': (0.35, 0.7, 0.05, 900, 'metal'), 'foam': (1.0, 0, 0.6, 900, 'plain'),
    'lens': (0.06, 0.6, 0.0, 100, 'plain'), 'frame': (0.4, 0.2, 0.05, 500, 'paint'), 'patch': (0.8, 0, 0.2, 1200, 'patch'),
    'wood': (0.7, 0, 0.3, 300, 'plain'), 'skin': (0.55, 0, 0.15, 1500, 'skin'), 'eye': (0.12, 0, 0.0, 100, 'eye'),
    # glove construction: moulded knuckle guard, padded panels, wrist strap, thread, cloth wraps
    'knuckle': (0.36, 0, 0.06, 600, 'paint'), 'gpad': (0.66, 0, 0.3, 1500, 'leather'), 'gcuff': (0.78, 0, 0.3, 1400, 'webbing'),
    'stitch': (0.8, 0, 0.25, 3000, 'plain'), 'wrap': (0.93, 0, 0.35, 900, 'fabric'),
}


# ---------------------------------------------------------------- node helpers
class NB:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.N = self.nt.nodes
        self.Lk = self.nt.links
        for n in list(self.N):
            self.N.remove(n)
        self.out = self.N.new('ShaderNodeOutputMaterial')

    def n(self, t, **props):
        node = self.N.new(t)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def L(self, a, b):
        self.Lk.new(a, b)

    def val(self, v):
        node = self.n('ShaderNodeValue'); node.outputs[0].default_value = v
        return node.outputs[0]

    def rgb(self, c):
        node = self.n('ShaderNodeRGB'); node.outputs[0].default_value = (*c, 1)
        return node.outputs[0]

    def math(self, op, a, b=None, clamp=False):
        node = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                node.inputs[i].default_value = x
            else:
                self.L(x, node.inputs[i])
        return node.outputs[0]

    def mix(self, a, b, fac, blend='MIX'):
        node = self.n('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        ins = {s.identifier: s for s in node.inputs}
        for key, x in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
            if isinstance(x, (int, float)):
                ins[key].default_value = x
            elif isinstance(x, tuple):
                ins[key].default_value = (*x, 1) if len(x) == 3 else x
            else:
                self.L(x, ins[key])
        return {s.identifier: s for s in node.outputs}['Result_Color']

    def uv(self, name='phys'):
        node = self.n('ShaderNodeUVMap', uv_map=name)
        return node.outputs[0]

    def obj(self):
        return self.n('ShaderNodeTexCoord').outputs['Object']

    def sep(self, vec):
        node = self.n('ShaderNodeSeparateXYZ')
        self.L(vec, node.inputs[0])
        return node.outputs

    def noise(self, vec, scale, detail=4.0, rough=0.55, dims='3D'):
        node = self.n('ShaderNodeTexNoise', noise_dimensions=dims)
        self.L(vec, node.inputs['Vector'])
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = rough
        return node.outputs['Fac']

    def voronoi(self, vec, scale, feature='F1', out='Distance'):
        node = self.n('ShaderNodeTexVoronoi', feature=feature)
        self.L(vec, node.inputs['Vector'])
        node.inputs['Scale'].default_value = scale
        return node.outputs[out]

    def wave(self, vec, scale, kind='BANDS', direction='X', profile='SIN', distortion=0.0):
        node = self.n('ShaderNodeTexWave', wave_type=kind, bands_direction=direction, wave_profile=profile)
        self.L(vec, node.inputs['Vector'])
        node.inputs['Scale'].default_value = scale
        node.inputs['Distortion'].default_value = distortion
        return node.outputs['Fac']

    def ramp(self, fac, a, b, lo=0.0, hi=1.0):
        node = self.n('ShaderNodeValToRGB')
        self.L(fac, node.inputs[0])
        e = node.color_ramp.elements
        e[0].position, e[1].position = lo, hi
        e[0].color, e[1].color = (*a, 1), (*b, 1)
        return node.outputs[0]

    def vscale(self, vec, s):
        node = self.n('ShaderNodeVectorMath', operation='SCALE')
        self.L(vec, node.inputs[0]); node.inputs['Scale'].default_value = s
        return node.outputs[0]

    def frac_band(self, x, period, lo, hi, soft=0.04):
        """1 inside [lo, hi] of each period of x (fractions), soft edges."""
        f = self.math('FRACT', self.math('DIVIDE', x, period))
        up = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
        self.L(f, up.inputs['Value']); up.inputs['From Min'].default_value = lo - soft; up.inputs['From Max'].default_value = lo + soft
        dn = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
        self.L(f, dn.inputs['Value']); dn.inputs['From Min'].default_value = hi + soft; dn.inputs['From Max'].default_value = hi - soft
        return self.math('MULTIPLY', up.outputs[0], dn.outputs[0])


# ---------------------------------------------------------------- materials
def build_material(mat, team):
    """Procedural look for one material. Leaves sockets for the bake passes
    in mat['sockets'] (kept on the NB object in BUILT)."""
    name = mat.name
    base = PAL[team].get(name) or COMMON.get(name) or (0.05, 0.05, 0.05)
    rough, metal, bstr, gscale, kind = LOOK.get(name, (0.7, 0, 0.2, 800, 'plain'))
    nb = NB(mat)
    uv = nb.uv('phys')
    ob = nb.obj()
    z = nb.sep(ob)[2]
    grain = nb.noise(uv, gscale, 2.0, 0.6)
    blot = nb.noise(uv, 9.0, 3.0, 0.6)
    big = nb.noise(ob, 3.0, 2.0, 0.5)
    lighter = tuple(min(1, c * 1.45 + 0.01) for c in base)
    darker = tuple(c * 0.62 for c in base)
    col = nb.ramp(blot, darker, lighter, 0.25, 0.8)
    col = nb.mix(col, base, 0.55)
    col = nb.mix(col, nb.ramp(big, darker, lighter, 0.3, 0.75), 0.25)
    height = nb.math('MULTIPLY', grain, bstr)
    rgh = nb.math('ADD', nb.math('MULTIPLY', nb.math('SUBTRACT', blot, 0.5), 0.12), rough)

    if kind in ('fabric', 'canvas'):
        # dust gathers low down, sun and wear lift the colour on high spots
        dust = (0.3, 0.26, 0.19) if team == 't' else (0.12, 0.11, 0.1)
        lowf = nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, nb.math('DIVIDE', z, 0.75), True), 0.55)
        col = nb.mix(col, dust, nb.math('MULTIPLY', lowf, nb.noise(ob, 14.0, 3, 0.6)))
        weave = nb.wave(nb.vscale(uv, 1.0), gscale * 0.35, 'BANDS', 'DIAGONAL', 'SIN')
        height = nb.math('ADD', height, nb.math('MULTIPLY', weave, bstr * 0.5))
    if kind == 'canvas':
        col = nb.mix(col, darker, nb.math('MULTIPLY', nb.noise(uv, 40, 4, 0.7), 0.35))
    if kind in ('cordura', 'molle'):
        col = nb.mix(col, lighter, nb.math('MULTIPLY', nb.noise(uv, 60, 3, 0.6), 0.3))
    if kind == 'molle':
        # 25 mm webbing rows on a 38 mm pitch, bar-tacked every 38 mm
        sx = nb.sep(uv)
        rows = nb.frac_band(sx[1], 0.0381, 0.17, 0.83, 0.03)
        tacks = nb.frac_band(sx[0], 0.0381, 0.0, 0.07, 0.02)
        web = (base[0] * 0.75, base[1] * 0.75, base[2] * 0.78)
        col = nb.mix(col, web, nb.math('MULTIPLY', rows, 0.85))
        col = nb.mix(col, (base[0] * 0.4, base[1] * 0.4, base[2] * 0.4), nb.math('MULTIPLY', rows, nb.math('MULTIPLY', tacks, 0.7)))
        height = nb.math('ADD', height, nb.math('MULTIPLY', rows, 1.2))
        rgh = nb.math('SUBTRACT', rgh, nb.math('MULTIPLY', rows, 0.08))
    if kind == 'webbing':
        sx = nb.sep(uv)
        ribs = nb.wave(uv, 900, 'BANDS', 'Y', 'SIN')
        height = nb.math('ADD', height, nb.math('MULTIPLY', ribs, 0.25))
    if kind == 'knit':
        ribs = nb.wave(uv, 320, 'BANDS', 'X', 'SIN')
        height = nb.math('ADD', height, nb.math('MULTIPLY', ribs, 0.6))
        col = nb.mix(col, lighter, nb.math('MULTIPLY', ribs, 0.15))
    if kind == 'shemagh':
        # woven check: fine dark lines on a 14 mm grid with a dotted fill, a bold border band
        sx = nb.sep(uv)
        lu = nb.frac_band(sx[0], 0.014, 0.42, 0.58, 0.05)
        lv = nb.frac_band(sx[1], 0.014, 0.42, 0.58, 0.05)
        dots = nb.math('MULTIPLY', nb.frac_band(sx[0], 0.007, 0.35, 0.65, 0.08), nb.frac_band(sx[1], 0.007, 0.35, 0.65, 0.08))
        pat = nb.math('MAXIMUM', nb.math('MAXIMUM', lu, lv), nb.math('MULTIPLY', dots, 0.55))
        band = nb.frac_band(sx[1], 0.16, 0.05, 0.16, 0.02)
        pat = nb.math('MAXIMUM', pat, band)
        ink = (0.075, 0.07, 0.05)
        col = nb.mix(col, ink, nb.math('MULTIPLY', pat, 0.88))
        height = nb.math('ADD', height, nb.math('MULTIPLY', pat, 0.3))
    if kind == 'leather':
        cracks = nb.voronoi(uv, gscale * 0.08, 'DISTANCE_TO_EDGE', 'Distance')
        crease = nb.math('SUBTRACT', 1.0, nb.math('MULTIPLY', cracks, 14.0), True)
        col = nb.mix(col, darker, nb.math('MULTIPLY', crease, 0.35))
        height = nb.math('SUBTRACT', height, nb.math('MULTIPLY', crease, 0.4))
        if team == 't':
            dust = (0.32, 0.27, 0.2)
            col = nb.mix(col, dust, nb.math('MULTIPLY', nb.noise(ob, 18, 3, 0.6), nb.math('SUBTRACT', 0.55, nb.math('DIVIDE', z, 0.4), True)))
    if kind in ('paint', 'metal'):
        # rubbed edges: bare, brighter where the surface is most convex
        geo = nb.n('ShaderNodeNewGeometry')
        edge = nb.ramp(geo.outputs['Pointiness'], (0, 0, 0), (1, 1, 1), 0.53, 0.6)
        wear = nb.math('MINIMUM', nb.math('MULTIPLY', nb.noise(uv, 120, 3, 0.7), 0.96), 1.0)
        pnt = nb.n('ShaderNodeRGBToBW'); nb.L(edge, pnt.inputs[0])
        wear = nb.math('MULTIPLY', pnt.outputs[0], wear)
        col = nb.mix(col, tuple(min(1, c * 2.6 + 0.02) for c in base), wear)
        rgh = nb.math('SUBTRACT', rgh, nb.math('MULTIPLY', wear, 0.2))
    if kind == 'rubber':
        sx = nb.sep(uv)
        lugs = nb.math('MULTIPLY', nb.frac_band(sx[0], 0.012, 0.2, 0.75, 0.05), nb.frac_band(sx[1], 0.018, 0.1, 0.7, 0.05))
        height = nb.math('ADD', height, nb.math('MULTIPLY', lugs, 0.6))
    if kind == 'skin':
        mott = nb.noise(ob, 180, 4, 0.6)
        col = nb.mix(col, (base[0] * 0.8, base[1] * 0.62, base[2] * 0.6), nb.math('MULTIPLY', mott, 0.45))
    if kind == 'eye':
        attr = nb.n('ShaderNodeAttribute', attribute_name='eyecol')
        col = attr.outputs['Color']
    if kind == 'patch':
        img = PATCH.get(team)
        if img is not None:
            tex = nb.n('ShaderNodeTexImage', image=img, extension='CLIP')
            mp = nb.n('ShaderNodeMapping')
            nb.L(uv, mp.inputs['Vector'])
            # the panel's front face spans u 0.3 +- 0.076, v 0.2 +- 0.023 (see gear.rbox)
            mp.inputs['Location'].default_value = (-0.224 / 0.152, -0.177 / 0.046, 0)
            mp.inputs['Scale'].default_value = (1 / 0.152, 1 / 0.046, 1)
            nb.L(mp.outputs[0], tex.inputs['Vector'])
            col = nb.mix(col, (0.55, 0.56, 0.58), tex.outputs['Alpha'])

    # outputs for the passes
    bump = nb.n('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.0015
    nb.L(height, bump.inputs['Height'])
    bsdf = nb.n('ShaderNodeBsdfPrincipled')
    nb.L(col, bsdf.inputs['Base Color'])
    nb.L(rgh, bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = metal
    nb.L(bump.outputs['Normal'], bsdf.inputs['Normal'])
    emit = nb.n('ShaderNodeEmission')
    img = nb.n('ShaderNodeTexImage')
    nb.L(bsdf.outputs[0], nb.out.inputs['Surface'])
    BUILT[mat.name] = dict(nb=nb, col=col, rough=rgh, metal=metal, bsdf=bsdf, emit=emit, img=img)


BUILT = {}
PATCH = {}


def patch_image(team, text='RESPONSE'):
    """White block letters for the ID panel, rendered with PIL into an image."""
    if team != 'ct':
        return None
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None
    W, Hh = 608, 184
    im = Image.new('RGBA', (W, Hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    font = None
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'):
        if os.path.exists(f):
            font = ImageFont.truetype(f, 120)
            break
    font = font or ImageFont.load_default()
    bb = d.textbbox((0, 0), text, font=font)
    d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], (Hh - (bb[3] - bb[1])) / 2 - bb[1]), text, font=font, fill=(255, 255, 255, 255))
    img = bpy.data.images.new('patch_text', W, Hh, alpha=True)
    px = np.asarray(im, dtype=np.float32)[::-1] / 255.0
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


# ---------------------------------------------------------------- bake
def _set_target(image):
    for name, d in BUILT.items():
        d['img'].image = image
        d['nb'].N.active = d['img']
        d['img'].select = True


def _route(kind):
    for name, d in BUILT.items():
        nb = d['nb']
        for l in list(nb.out.inputs['Surface'].links):
            nb.Lk.remove(l)
        if kind == 'bsdf':
            nb.L(d['bsdf'].outputs[0], nb.out.inputs['Surface'])
            continue
        e = d['emit']
        for l in list(e.inputs['Color'].links):
            nb.Lk.remove(l)
        if kind == 'col':
            nb.L(d['col'], e.inputs['Color'])
        elif kind == 'rough':
            nb.L(d['rough'], e.inputs['Color'])
        elif kind == 'metal':
            e.inputs['Color'].default_value = (d['metal'],) * 3 + (1,)
        e.inputs['Strength'].default_value = 1.0
        nb.L(e.outputs[0], nb.out.inputs['Surface'])


def bake(obj, team, size=2048, samples=6, ao_samples=48):
    """Bake colour, roughness, metal, normal and AO for obj (UV 'atlas'
    active) and swap its materials for one textured material."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.bake.margin = 8
    sc.render.bake.use_clear = True
    PATCH[team] = patch_image(team)
    BUILT.clear()
    for m in obj.data.materials:
        build_material(m, team)
    vl = bpy.context.view_layer
    for o in sc.objects:
        o.select_set(False)
    obj.select_set(True); vl.objects.active = obj
    imgs = {}

    def run(kind, btype, color_space='Non-Color', s=samples):
        im = bpy.data.images.new(f'{team}_{kind}', size, size, alpha=False, float_buffer=kind in ('nrm',))
        im.colorspace_settings.name = color_space
        _set_target(im)
        sc.cycles.samples = s
        if btype == 'EMIT':
            bpy.ops.object.bake(type='EMIT')
        elif btype == 'NORMAL':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
        else:
            bpy.ops.object.bake(type='AO')
        imgs[kind] = im
    _route('col'); run('col', 'EMIT', 'Non-Color')
    _route('rough'); run('rough', 'EMIT')
    _route('metal'); run('metal', 'EMIT', s=1)
    _route('bsdf'); run('nrm', 'NORMAL')
    run('ao', 'AO', s=ao_samples)

    def arr(im):
        return np.array(im.pixels[:], dtype=np.float32).reshape(size, size, 4)
    col, ao = arr(imgs['col']), arr(imgs['ao'])
    rough, metal = arr(imgs['rough']), arr(imgs['metal'])
    aof = 0.35 + 0.65 * np.clip(ao[..., :1], 0, 1) ** 0.8
    lin = np.clip(col[..., :3] * aof, 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out_col = np.concatenate([srgb, np.ones_like(srgb[..., :1])], axis=-1)
    orm = np.concatenate([np.clip(ao[..., :1], 0, 1), np.clip(rough[..., :1], 0.02, 1), np.clip(metal[..., :1], 0, 1), np.ones_like(ao[..., :1])], axis=-1)

    def final(name, data, cs, sz=None):
        sz = sz or size
        im = bpy.data.images.new(name, sz, sz, alpha=False)
        im.colorspace_settings.name = cs
        im.pixels.foreach_set(data.ravel())
        im.file_format = 'JPEG'
        im.pack()
        return im
    i_col = final(f'{team}_basecolor', out_col, 'sRGB')
    # roughness and metal change slowly: half resolution is plenty
    half = orm.reshape(size // 2, 2, size // 2, 2, 4).mean(axis=(1, 3))
    i_orm = final(f'{team}_orm', half, 'Non-Color', size // 2)
    i_nrm = final(f'{team}_normal', arr(imgs['nrm']), 'Non-Color')
    # one material for the game, wired the way the glTF exporter expects
    m = bpy.data.materials.new(f'char_{team}')
    nb = NB(m)
    b = nb.n('ShaderNodeBsdfPrincipled')
    tc = nb.n('ShaderNodeTexImage', image=i_col)
    nb.L(nb.uv('atlas'), tc.inputs['Vector'])
    nb.L(tc.outputs['Color'], b.inputs['Base Color'])
    to = nb.n('ShaderNodeTexImage', image=i_orm)
    nb.L(nb.uv('atlas'), to.inputs['Vector'])
    sp = nb.n('ShaderNodeSeparateColor')
    nb.L(to.outputs['Color'], sp.inputs[0])
    nb.L(sp.outputs['Green'], b.inputs['Roughness'])
    nb.L(sp.outputs['Blue'], b.inputs['Metallic'])
    tn = nb.n('ShaderNodeTexImage', image=i_nrm)
    nb.L(nb.uv('atlas'), tn.inputs['Vector'])
    nm = nb.n('ShaderNodeNormalMap', uv_map='atlas')
    nb.L(tn.outputs['Color'], nm.inputs['Color'])
    nb.L(nm.outputs['Normal'], b.inputs['Normal'])
    nb.L(b.outputs[0], nb.out.inputs['Surface'])
    obj.data.materials.clear()
    obj.data.materials.append(m)
    for p in obj.data.polygons:
        p.material_index = 0
    for im in imgs.values():
        bpy.data.images.remove(im)
    return dict(color=i_col, orm=i_orm, normal=i_nrm)
