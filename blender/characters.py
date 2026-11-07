"""Third-person soldiers for Vantage, one per team, built headless in Blender.

    Defenders (ct): police tactical unit. Navy-grey combat uniform, charcoal
        plate carrier with an open-top triple magazine pouch, admin and radio
        pouches, high-cut helmet with rails and a comms headset, knit
        balaclava, tinted ballistic glasses, battle belt with a drop-leg
        holster, hard-cap knee pads, synthetic gloves and laced boots.
    Attackers (t): irregular militia in civilian layers. Faded field jacket,
        work trousers, a wrapped shemagh and sunglasses, a canvas AK chest rig
        (three magazine pouches between two grenade pouches, crossed back
        straps), leather belt, leather work gloves and suede desert boots.

How it's made
  body      the CC0 MakeHuman base mesh, shaped and posed by human.py
  clothing  shells grown off the body: eased away from the skin, relaxed over
            hollows so cloth bridges them, then folded where cloth bunches
            (inside of the elbow, behind the knee, at cuffs and boot tops)
  gear      modelled the way it is sewn: plate bags with binding, webbing rows
            with bar-tacks, pouch flaps, buckles, laces, rails
  textures  procedural Cycles materials baked into one atlas per team
            (colour with ambient occlusion, normal, roughness)
  rig       the game's 17 bones (src/rig.js). Skin keeps MakeHuman's own
            weights; clothing takes them from the nearest point on the body.

Blender space: +Z up, the character faces +Y, its left is -X, feet on Z = 0.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (first: it provides bmesh and mathutils)
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import cloth as C
import gear as G
import human as H
import texture as TX
from lib import reset, link, stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PI = math.pi
BONES = H.GAME_BONES
BI = {b: i for i, b in enumerate(BONES)}
BONES_X = H.GAME_BONES + H.FINGER_BONES     # the first-person arms' finger bones too


# ---------------------------------------------------------------- body
class Body:
    """The posed body with lookups for building clothes on it."""

    def __init__(self, **params):
        b = H.soldier_body(**params)
        self.V = b['V']
        self.skel = b['skeleton']
        self.mh = b['bones']
        _, self.UVs, F = H.base()
        self.faces = [f for f, _, g in F if g == 'body']
        self.face_uv = [t for f, t, g in F if g == 'body']
        self.W = H.game_weights(len(self.V))
        self.WX = None    # with finger bones, made when the first-person arms need it
        self.tris = []
        for f in self.faces:
            for k in range(1, len(f) - 1):
                self.tris.append((f[0], f[k], f[k + 1]))
        self.tris = np.array(self.tris)
        self.bvh = BVHTree.FromPolygons([Vector(v) for v in self.V], self.tris.tolist())
        # area-weighted vertex normals
        a, b_, c = self.V[self.tris[:, 0]], self.V[self.tris[:, 1]], self.V[self.tris[:, 2]]
        fn = np.cross(b_ - a, c - a)
        N = np.zeros_like(self.V)
        for k in range(3):
            np.add.at(N, self.tris[:, k], fn)
        ln = np.linalg.norm(N, axis=1, keepdims=True); ln[ln == 0] = 1
        self.N = N / ln
        self.used = np.zeros(len(self.V), bool)
        self.used[np.unique(self.tris)] = True

    def nearest(self, p):
        loc, nrm, idx, dist = self.bvh.find_nearest(Vector(p))
        return np.array(loc), np.array(nrm), idx, dist

    def weights_at(self, p, fingers=False):
        """Bone weights at a point, interpolated across the nearest body triangle
        (over BONES, or BONES_X with the finger bones)."""
        if fingers and self.WX is None:
            self.WX = H.arm_weights(len(self.V))
        W = self.WX if fingers else self.W
        loc, _, idx, _ = self.bvh.find_nearest(Vector(p))
        t = self.tris[idx]
        A, B, C = (self.V[i] for i in t)
        bc = _bary(np.array(loc), A, B, C)
        return bc[0] * W[t[0]] + bc[1] * W[t[1]] + bc[2] * W[t[2]]

    def bone_frame(self, bone):
        h, t = self.skel[bone]
        return h, t, (t - h) / np.linalg.norm(t - h)

    def joint(self, name):
        return np.array(self.mh[name][0])


def _bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    d20, d21 = v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14:
        return np.array([1.0, 0, 0])
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    out = np.clip(np.array([1 - v - w, v, w]), 0, 1)
    return out / out.sum()


# ---------------------------------------------------------------- parts
PARTS = []   # (object, material key, rigid bone or None)
# Explicit per-vertex bone weights for parts that must follow particular bones
# (object name -> one {bone: weight} per vertex); see bind().
PART_WEIGHTS = {}


def make(name, verts, faces, mat, bone=None, uv=None, closed=False):
    """Gear part: closed meshes get their faces turned consistently outward."""
    obj = new_obj(name, verts, faces, mat, bone, uv=uv)
    if closed:
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(obj.data); bm.free()
        for p in obj.data.polygons:
            p.use_smooth = True
        obj.data.set_sharp_from_angle(angle=math.radians(50))
    return obj


def new_obj(name, verts, faces, mat, bone=None, smooth=True, uv=None):
    """uv: optional per-vertex (u, v) in metres, stored as the 'phys' UV map
    the material bake uses for patterns at real-world scale."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [list(map(int, f)) for f in faces])
    me.update()
    if uv is not None:
        lay = me.uv_layers.new(name='phys')
        uvv = np.asarray(uv, float)
        for loop in me.loops:
            lay.data[loop.index].uv = tuple(uvv[loop.vertex_index])
    for p in me.polygons:
        p.use_smooth = smooth
    obj = bpy.data.objects.new(name, me)
    link(obj)
    obj['mat'] = mat
    PARTS.append((obj, mat, bone))
    return obj


def obj_from_bm(name, bm, mat, bone=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    obj = bpy.data.objects.new(name, me)
    link(obj)
    obj['mat'] = mat
    PARTS.append((obj, mat, bone))
    return obj


def mesh_arrays(obj):
    me = obj.data
    V = np.array([v.co[:] for v in me.vertices])
    F = [list(p.vertices) for p in me.polygons]
    return V, F


# ---------------------------------------------------------------- skeleton
def build_armature(skel):
    data = bpy.data.armatures.new('rig')
    arm = bpy.data.objects.new('rig', data)
    link(arm)
    vl = bpy.context.view_layer
    for o in bpy.context.scene.objects:
        o.select_set(False)
    arm.select_set(True)
    vl.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name in BONES:
        h, t = skel[name]
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = Vector(h), Vector(t)
        eb.roll = 0
    for name in BONES:
        p = H.GAME_PARENT[name]
        if p:
            data.edit_bones[name].parent = data.edit_bones[p]
            data.edit_bones[name].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def bind(obj, body, bone=None, smooth_iters=0, only=None):
    """Vertex groups for a part: rigid to one bone, or taken from the body
    (optionally only over a subset of bones, renormalised)."""
    me = obj.data
    n = len(me.vertices)
    fingers = bool(only) and any(b.startswith('finger') for b in only)
    names = BONES_X if fingers else BONES
    IX = {b: i for i, b in enumerate(names)}
    if bone and bone not in IX:
        bone = None      # a finger bone on a model without them: the body's weights there
    if bone:
        W = np.zeros((n, len(names))); W[:, IX[bone]] = 1
    elif obj.name in PART_WEIGHTS and len(PART_WEIGHTS[obj.name]) == n:
        # weights given bone by bone (finger bones fall back to their hand on
        # models without finger bones)
        W = np.zeros((n, len(names)))
        for i, wd in enumerate(PART_WEIGHTS[obj.name]):
            for bname, w in wd.items():
                W[i, IX[bname] if bname in IX else IX['hand_' + bname[-1]]] += w
    elif obj.name in SHELLS and len(SHELLS[obj.name].src) == n:
        # a garment grown off the body: each vertex takes the weights of the body
        # vertex it grew from. Looking up the nearest body surface instead can land
        # on the next finger over where fingers touch (in a fist), and that finger
        # then drags a strip of glove with it when the hand opens.
        if fingers and body.WX is None:
            body.WX = H.arm_weights(len(body.V))
        W = (body.WX if fingers else body.W)[SHELLS[obj.name].src].copy()
    else:
        W = np.array([body.weights_at(v.co[:], fingers) for v in me.vertices])
    if only:
        mask = np.array([b in only for b in names], float)
        W = W * mask
        s_ = W.sum(axis=1, keepdims=True)
        # anything left without weight (the shoulder end) follows the upper arm on its side
        lone = s_[:, 0] < 1e-6
        V = np.array([v.co[:] for v in me.vertices])
        W[lone & (V[:, 0] < 0), IX['upperarm_L']] = 1
        W[lone & (V[:, 0] >= 0), IX['upperarm_R']] = 1
        W = W / np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
        if smooth_iters:
            nb = [[] for _ in range(n)]
            for e in me.edges:
                a, b = e.vertices
                nb[a].append(b); nb[b].append(a)
            for _ in range(smooth_iters):
                W = np.array([(W[i] + W[nb[i]].mean(axis=0)) / 2 if nb[i] else W[i] for i in range(n)])
    # four strongest influences, normalised
    top = np.argsort(-W, axis=1)[:, :4]
    groups = {b: obj.vertex_groups.new(name=b) for b in names}
    for i in range(n):
        ws = W[i, top[i]]
        s = ws.sum()
        if s <= 0:
            continue
        for j, w in zip(top[i], ws / s):
            if w > 0.004:
                groups[names[j]].add([i], float(w), 'REPLACE')


# ---------------------------------------------------------------- build
PROFILES = {
    'ct': dict(body=dict(muscle=0.82, weight=0.55, height=0.55, proportions=0.85, ethnic=(0.25, 0.15, 0.6)), window=(0.064, 0.022, 0.004)),
    't': dict(body=dict(muscle=0.7, weight=0.45, height=0.5, proportions=0.75, ethnic=(0.3, 0.3, 0.4)), window=(0.066, 0.025, 0.006)),
}


def eyeballs(body, mat='eye'):
    """MakeHuman's eye helpers, coloured by angle from straight ahead (pupil, iris, white)."""
    _, _, F = H.base()
    faces = [f for f, _, g in F if g in ('helper-l-eye', 'helper-r-eye')]
    used = sorted({i for f in faces for i in f})
    remap = {o: i for i, o in enumerate(used)}
    obj = new_obj('eyes', body.V[used], [[remap[i] for i in f] for f in faces], mat)
    me = obj.data
    colr = me.color_attributes.new('eyecol', 'FLOAT_COLOR', 'POINT')
    V = body.V[used]
    for side in (-1, 1):
        m = np.sign(V[:, 0]) == side
        c = V[m].mean(axis=0)
        d = V - c
        cosang = d[:, 1] / np.maximum(np.linalg.norm(d, axis=1), 1e-9)
        for i in np.where(m)[0]:
            a = cosang[i]
            rgb = (0.02, 0.02, 0.02) if a > 0.975 else (0.16, 0.1, 0.06) if a > 0.9 else (0.78, 0.74, 0.7)
            colr.data[i].color = (*rgb, 1)
    return obj


def body_mesh(body, keep=None, name='skin', mat='skin'):
    """The body itself (or the faces where keep(face centre) is true), with MakeHuman UVs."""
    faces = body.faces if keep is None else [f for f in body.faces if keep(body.V[f].mean(axis=0))]
    used = sorted({i for f in faces for i in f})
    remap = {o: i for i, o in enumerate(used)}
    obj = new_obj(name, body.V[used], [[remap[i] for i in f] for f in faces], mat)
    return obj


# ---------------------------------------------------------------- landmarks
class Marks:
    """Heights and points on this body that the garments are cut to."""

    def __init__(self, b):
        S = b.skel
        self.hip = S['hips'][0][2]
        self.waist = self.hip + 0.06            # where a belt sits, on the hip bones
        self.knee = S['shin_L'][0][2]
        self.ankle = S['foot_L'][0][2]
        self.shoulder = S['upperarm_L'][0][2]
        self.elbow = S['forearm_L'][0][2]
        self.wrist = S['hand_L'][0][2]
        self.neck = S['neck'][0][2]
        self.chin = S['head'][0][2] - 0.005
        self.crotch = self.hip - 0.1
        eyes = [i for f, _, g in H.base()[2] if g in ('helper-l-eye', 'helper-r-eye') for i in f]
        self.eye = b.V[eyes].mean(axis=0)


def col(W, *names):
    return sum(W[:, BI[n]] for n in names)


SHELLS = {}


def shell_obj(name, sh, mat, bone=None):
    obj = new_obj(name, sh.P, sh.F, mat, bone)
    SHELLS[obj.name] = sh
    return obj


def torso_only(obj, M):
    """(object, mask) leaving out the sleeves hanging beside the torso, for
    placing gear on the torso (the shoulders stay in for straps)."""
    sh = SHELLS[obj.name]
    W = sh.body.W[sh.src]
    arms = col(W, 'upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'forearm_R', 'hand_R')
    return (obj, (arms < 0.4) | (sh.P[:, 2] > M.shoulder - 0.02))


# ---------------------------------------------------------------- garments
def trousers(b, M, *, bottom, ease_leg=0.016, ease_seat=0.012, blouse=None, flare=0.0, seed=11, mat='pants'):
    """Trousers from the waistband down: bloused into boots, or hanging over them."""
    arms = ('upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'forearm_R', 'hand_R')

    def test(V, W):
        return (V[:, 2] < M.waist + 0.012) & (V[:, 2] > bottom) & (col(W, 'foot_L', 'foot_R') < 0.5) & (col(W, *arms) < 0.2)

    def ease(P, W):
        z = P[:, 2]
        e = 0.012 + (ease_seat - 0.012) * C.smoothstep(M.waist, M.waist - 0.12, z)
        e = e + (ease_leg - ease_seat) * C.smoothstep(M.crotch, M.knee + 0.1, z)
        # less on the inside of the thigh, where the legs nearly touch
        inner = np.abs(P[:, 0]) < 0.07
        e = np.where(inner & (z > M.knee), e * 0.55, e)
        if blouse:
            # puffed out and hanging over the boot top, then tucked tight inside it
            e = e + 0.016 * C.smoothstep(blouse + 0.11, blouse + 0.03, z)
            e = np.where(z < blouse + 0.002, 0.004 + (e - 0.004) * C.smoothstep(blouse - 0.016, blouse + 0.002, z), e)
        if flare:
            e = e + flare * C.smoothstep(M.ankle + 0.25, bottom, z)
        return e
    sh = C.Shell(b, C.region(b, test), ease, relax=6)
    sh.trim((0, 0, M.waist + 0.012), (0, 0, 1))
    sh.trim((0, 0, bottom), (0, 0, 1), reach=0.03)
    for side, sd in (('L', 1), ('R', 2)):
        th, sn = f'thigh_{side}', f'shin_{side}'
        legs = [th, sn]
        kn = b.skel[sn][0]
        # behind the knee: compression folds, and a couple of softer ones in front
        sh.rings(sn, legs, -0.07, 0.07, 4, 0.006, 0.016, arc=(math.pi * 0.55, math.pi * 1.45), seed=seed + sd)
        sh.rings(sn, legs, -0.12, -0.02, 2, 0.004, 0.02, arc=(-0.9, 0.9), slope=0.6, seed=seed + 10 + sd)
        # down the shin: long shallow drape folds, and the stack at the bottom
        sh.pleats(sn, legs, 0.12, 0.34, 5, 0.003, phase=sd, sharp=3, seed=seed + 20 + sd)
        if blouse:
            ub = kn[2] - blouse        # distance down the shin to the boot top
            sh.pleats(sn, legs, ub - 0.11, ub + 0.005, 7, 0.008, phase=sd * 1.3, sharp=2.4, seed=seed + 30 + sd)
            sh.rings(sn, legs, ub - 0.09, ub - 0.025, 3, 0.005, 0.012, seed=seed + 40 + sd)
        else:
            sh.rings(sn, legs, (kn[2] - bottom) - 0.16, (kn[2] - bottom) - 0.02, 4, 0.006, 0.014, slope=0.5, seed=seed + 40 + sd)
        # crotch: pulls running from the crotch toward the outside of the knee
        hip = b.skel[th][0]
        sgn = -1 if side == 'L' else 1
        c0 = np.array([sgn * 0.035, hip[1] + 0.06, M.crotch + 0.02])
        for k in range(2):
            c1 = np.array([sgn * (0.12 + 0.02 * k), kn[1] + 0.07, kn[2] + 0.17 + 0.07 * k])
            sh.pull(c0, c1, 0.018, 0.0035 - k * 0.001, members=legs + ['hips'])
        # seat: folds under the buttock where the leg meets it
        sh.rings(th, legs, 0.07, 0.13, 2, 0.003, 0.018, arc=(math.pi * 0.6, math.pi * 1.4), seed=seed + 50 + sd)
    # gathered under the belt
    sh.pleats('spine', ['hips', 'spine'], -0.11, -0.03, 14, 0.0025, sharp=2, seed=seed + 60)
    sh.push_out(0.35, 0.002)
    sh.hem(0.005, 0.012)
    return shell_obj('trousers', sh, mat)


def shirt(b, M, *, tuck=True, ease_body=0.007, ease_sleeve=0.013, cuff_z=None, seed=21, mat='shirt', hem_z=None):
    """Long-sleeved shirt or jacket: torso, sleeves to the wrist, neck opening."""
    cuff = cuff_z if cuff_z is not None else M.wrist + 0.035
    low = M.waist - 0.07 if tuck else hem_z

    def test(V, W):
        arm = col(W, 'upperarm_L', 'forearm_L', 'upperarm_R', 'forearm_R', 'hand_L', 'hand_R')
        hand = col(W, 'hand_L', 'hand_R')
        neckline = V[:, 2] < M.neck + 0.03 - 0.035 * C.smoothstep(-0.02, 0.06, V[:, 1])
        torso = (V[:, 2] > low) & neckline & (col(W, 'head') < 0.05) & (arm < 0.5)
        sleeve = (arm >= 0.5) & (hand < 0.2) & (V[:, 2] > cuff)
        return (torso | sleeve) & ((col(W, 'thigh_L', 'thigh_R') < 0.6) if tuck else (V[:, 2] > low))

    def ease(P, W):
        arm = col(W, 'upperarm_L', 'forearm_L', 'upperarm_R', 'forearm_R')
        e = ease_body + (ease_sleeve - ease_body) * np.clip(arm * 1.4, 0, 1)
        if tuck:
            e = e - (ease_body - 0.004) * C.smoothstep(M.waist + 0.03, M.waist - 0.01, P[:, 2])
        else:
            e = e + 0.01 * C.smoothstep(M.waist + 0.08, M.waist - 0.05, P[:, 2])
        return e
    sh = C.Shell(b, C.region(b, test), ease, relax=6)
    for side in ('L', 'R'):
        h, t, ax = b.bone_frame(f'forearm_{side}')
        sh.trim(t + ax * (cuff - t[2]) / ax[2], ax)
    if not tuck:
        sh.trim((0, 0, low), (0, 0, 1))
    for side, sd in (('L', 1), ('R', 2)):
        ua, fa = f'upperarm_{side}', f'forearm_{side}'
        arm = [ua, fa]
        # inside of the elbow: a fan of compression folds (arms are bent most of the time)
        sh.rings(fa, arm, -0.06, 0.05, 4, 0.006, 0.014, arc=(-1.9, 0.6), slope=0.9, seed=seed + sd)
        # cuff: stacked rings where the sleeve rides on the glove
        L = np.linalg.norm(b.skel[fa][1] - b.skel[fa][0])
        sh.rings(fa, arm, L - 0.1, L - 0.035, 3, 0.005, 0.012, slope=0.5, seed=seed + 10 + sd)
        # upper arm: long diagonal pulls from the armpit
        sh.rings(ua, arm, 0.05, 0.2, 3, 0.0035, 0.02, arc=(-2.4, -0.4), slope=1.4, seed=seed + 20 + sd)
        sh.pleats(fa, arm, 0.06, L - 0.1, 4, 0.0025, phase=sd, sharp=3, seed=seed + 30 + sd)
    sh.push_out(0.35, 0.002)
    sh.hem(0.004, 0.01)
    return shell_obj('shirt', sh, mat)


def _side_masks(b, V, W, bone):
    """Per side: (u along the bone from its head, in metres) for verts on that side."""
    out = {}
    for side in ('L', 'R'):
        h, t, ax = b.bone_frame(f'{bone}_{side}')
        out[side] = ((V - h) @ ax, (V[:, 0] < 0) if side == 'L' else (V[:, 0] > 0))
    return out


def gloves(b, M, *, cuff=0.055, ease=0.0016, mat='glove', guard=True, flare=0.004):
    """Gloves grown off the hands, with a cuff up the wrist and a padded knuckle guard."""
    def test(V, W):
        ok = np.zeros(len(V), bool)
        for side in ('L', 'R'):
            h, t, ax = b.bone_frame(f'hand_{side}')
            u = (V - h) @ ax
            this = (V[:, 0] < 0) if side == 'L' else (V[:, 0] > 0)
            ok |= this & (u > -cuff) & (col(W, f'hand_{side}', f'forearm_{side}') > 0.5)
        return ok

    def ease_fn(P, W):
        e = np.full(len(P), ease)
        for side in ('L', 'R'):
            h, t, ax = b.bone_frame(f'hand_{side}')
            u = (P - h) @ ax
            this = (P[:, 0] < 0) if side == 'L' else (P[:, 0] > 0)
            e = np.where(this, ease + flare * C.smoothstep(-0.015, -cuff, u) + 0.001 * C.smoothstep(0.02, -0.01, u), e)
        return e
    sh = C.Shell(b, C.region(b, test), ease_fn, relax=1, keep=0.8, gap=0.0012)
    for side in ('L', 'R'):
        h, t, ax = b.bone_frame(f'hand_{side}')
        sh.trim(h - ax * cuff, ax, reach=0.02)
        if guard:
            # knuckle guard: a padded ridge across the back of the hand over the knuckles
            k2, k5 = b.joint(f'finger2-1.{side}'), b.joint(f'finger5-1.{side}')
            n = H._palm(b.mh, side)
            back = -n
            sh.pull(k2 + back * 0.012, k5 + back * 0.012, 0.014, 0.0035, members=[f'hand_{side}'], taper=(0.02, 0.98))
            sh.pull(h + back * 0.02 + ax * 0.03, h + back * 0.02 + ax * 0.055, 0.02, 0.002, members=[f'hand_{side}'], taper=(0.1, 0.9))
        # a couple of creases across the back of the wrist
        sh.rings(f'hand_{side}', [f'hand_{side}', f'forearm_{side}'], -0.04, -0.012, 2, 0.0015, 0.006, seed=5 + (side == 'R'))
    sh.push_out(0.6, 0.001)
    sh.hem(0.003, 0.008)
    return shell_obj('gloves', sh, mat)


# Glove construction parts. Each part's faces carry its kind through the join
# (the 'glove' face attribute: 1 for the glove itself) and end up as their own
# material, 'char_<team>_glove_<kind>', so the game can show just the parts a
# glove type has and put the glove finish on them.
GLOVE_PART = {'knuckle': 2, 'cuff': 3, 'seam': 4, 'wrap': 5, 'palm': 6, 'pad': 7, 'panel': 8}
PART_OF = {v: k for k, v in GLOVE_PART.items()}
# The parts each team's own gloves wear (the third-person models get only
# these; the first-person arms and the display gloves get every part).
TEAM_GLOVE_PARTS = {'ct': {'knuckle', 'pad', 'cuff', 'seam'}, 't': {'cuff', 'seam'}}
GLOVE_DETAILS = None     # None: the team's own parts; or a set of kinds to build


TAU = 2 * math.pi


def _unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def _unit_rows(V):
    V = np.asarray(V, float)
    return V / np.linalg.norm(V, axis=1, keepdims=True)


def glove_details(b, glove, kinds, cuff):
    """Construction on top of the glove shell, made the way real gloves are:
    a moulded knuckle guard over the knuckles, padded panels on the back of
    the hand and the fingers, a wrist strap with a hook-and-loop tab, raised
    seams down the sides of every finger and round the fingertips, a palm pad,
    and for fight wraps, cloth bands wound round the knuckles, across the back
    of the hand and round the wrist. Everything is placed on this glove by ray
    casts, from inside the hand where fingers could be in the way."""
    S = G.Surface([glove])

    def out_hit(p, d, reach=0.07):
        # from a point inside the hand outward: the first glove face hit
        d = _unit(d)
        loc, nn = S.ray(p, d, reach)
        return (None, None) if loc is None else (loc, -nn)

    def in_hit(p, d, reach=0.08):
        # from outside in, toward a point inside the hand (misses inner folds)
        d = _unit(d)
        loc, nn = S.ray(p + d * reach, -d, reach * 1.6)
        return (None, None) if loc is None else (loc, nn)

    def part(kind, side, V, F, UV, mat, bone=None, smooth_below=None):
        o = make(f'glove_{kind}', V, F, mat, bone, UV, closed=True)
        if smooth_below:
            o.data.set_sharp_from_angle(angle=math.radians(smooth_below))
        o['glovepart'] = GLOVE_PART[kind]
        o['gside'] = side
        return o

    def grid_sheet(kind, side, rows, cols, at, d, inner, outer, mat, bone, edge=0.0025, hit=in_hit):
        """A padded panel over a patch of the glove: `at(s, x)` gives a point
        inside the hand for row s and column x, `d` the direction to cast."""
        G_, N_ = [], []
        for s in rows:
            gr, nr = [], []
            for x in cols:
                loc, nn = hit(at(s, x), d)
                if loc is None:
                    # past the edge of the hand: the nearest point of the glove
                    loc, nn = S.nearest(at(s, x) + _unit(d) * 0.012)
                    nn = nn if nn @ d > 0 else -nn
                gr.append(loc); nr.append(nn)
            G_.append(gr); N_.append(nr)
        N_ = np.array(N_)
        # soften the normals so the panel doesn't copy every ripple of the glove
        for _ in range(2):
            N2 = N_.copy()
            N2[1:-1, :] += N_[:-2, :] + N_[2:, :]
            N2[:, 1:-1] += N_[:, :-2] + N_[:, 2:]
            N_ = N2 / np.linalg.norm(N2, axis=2, keepdims=True)
        V, F, UV = G.sheet(np.array(G_), N_, inner, outer, edge=edge)
        return part(kind, side, V, F, UV, mat, bone)

    def loop(kind, side, center, e1, e2, width, thick, mat, bone=None, n=30, ease=0.0012, hit=out_hit):
        """A band right round the hand or wrist in the plane (e1, e2) through
        `center`. Hit distances are smoothed round the loop so the band
        bridges the gaps between fingers instead of dipping into them."""
        A = np.linspace(0, TAU, n, endpoint=False)
        D = np.array([math.cos(a) * e1 + math.sin(a) * e2 for a in A])
        r = np.full(n, np.nan); NN = np.zeros((n, 3))
        for i, d in enumerate(D):
            loc, nn = hit(center, d)
            if loc is not None:
                r[i] = (loc - center) @ d; NN[i] = nn
        if np.isnan(r).sum() > n // 4:
            return None
        ok = ~np.isnan(r)
        r[~ok] = np.interp(np.flatnonzero(~ok), np.flatnonzero(ok), r[ok], period=n)
        # a cloth band can't follow a hollow narrower than itself: take the
        # largest radius over a window, then smooth
        k = 1
        r = np.array([r[[(i + j) % n for j in range(-k, k + 1)]].max() for i in range(n)])
        for _ in range(3):
            r = (np.roll(r, 1) + 2 * r + np.roll(r, -1)) / 4
        P = center + D * (r + ease)[:, None]
        N = D.copy()
        N[ok] = _unit_rows(D[ok] * 0.6 + NN[ok] * 0.4)
        V, F, UV = G.strap(P, N, width, thick, closed=True, rounded=False)
        return part(kind, side, V, F, UV, mat, bone)

    for side in ('L', 'R'):
        hb = f'hand_{side}'
        n = H._palm(b.mh, side)
        back = -n
        w = b.joint(f'wrist.{side}')
        h, t, ax = b.bone_frame(hb)
        hand_dir = _unit(b.joint(f'finger3-1.{side}') - w)
        across = _unit(np.cross(hand_dir, n))
        back_h = _unit(back - hand_dir * (back @ hand_dir))
        K = [b.joint(f'finger{fi}-1.{side}') for fi in range(2, 6)]
        Kc = np.mean(K, axis=0)
        L = float((Kc - w) @ hand_dir)                        # wrist to knuckles
        half = float(abs((K[0] - K[3]) @ across)) / 2         # half the knuckle span
        mid = w + hand_dir * ((Kc - w) @ hand_dir) + across * ((Kc - w) @ across)

        def on_hand(s, x):
            # a point inside the hand, s along it from the wrist, x across
            return w + hand_dir * s + across * (x + float((Kc - w) @ across) * s / L) + n * 0.002

        if 'knuckle' in kinds:
            # moulded guard: a band across the knuckle line with a dome over each knuckle
            Kx = [float((k - w) @ across) for k in K]
            Ks = [float((k - w) @ hand_dir) for k in K]
            xs = np.linspace(min(Kx) - 0.0045, max(Kx) + 0.0045, 15)
            ks = np.interp(xs, sorted(Kx), [s for _, s in sorted(zip(Kx, Ks))])

            def kat(s, x, xs=xs, ks=ks):
                return w + hand_dir * (np.interp(x, xs, ks) + s) + across * x + n * 0.004
            grid_sheet('knuckle', side, np.linspace(-0.019, 0.003, 6), xs, kat, back_h, -0.0007, 0.0034, 'knuckle', hb, edge=0.002)
            for k in K:
                loc, nn = in_hit(k + n * 0.004 - hand_dir * 0.003, back_h)
                if loc is None:
                    continue
                V, F, UV = G.rbox((0.0152, 0.0036, 0.0124), 0.0032, n=2, bulge=0.0009)
                o, R = G.frame(loc + nn * 0.0024, across, nn)
                V = V + np.array([0, 0.0018, 0])
                part('knuckle', side, G.place(V, o, R), F, UV, 'knuckle', hb)

        if 'panel' in kinds:
            # padded back-of-hand panel in two pieces, a flex gap between them
            s0, s1 = 0.024, L - 0.026
            sm = (s0 + s1) / 2
            xs = np.linspace(-half * 0.92, half * 0.92, 9)
            for a_, b_ in ((s0, sm - 0.0018), (sm + 0.0018, s1)):
                grid_sheet('panel', side, np.linspace(a_, b_, 5), xs, on_hand, back_h, -0.0006, 0.0026, 'gpad', hb, edge=0.0022)

        if 'palm' in kinds:
            # palm pad over the heel of the hand, toward the little finger
            xs = np.sort(np.linspace(-half * 0.55, half * 0.8, 9) * np.sign(float((K[3] - K[0]) @ across)))
            grid_sheet('palm', side, np.linspace(0.014, 0.042, 6), xs, lambda s, x: on_hand(s, x) - n * 0.004,
                       n, -0.0006, 0.0028, 'gpad', hb, edge=0.0022, hit=out_hit)

        if 'pad' in kinds:
            # padded plates on the backs of the first two segments of each finger
            for fi in range(2, 6):
                for k in (1, 2):
                    hh, tt = (np.array(v) for v in b.mh[f'finger{fi}-{k}.{side}'][:2])
                    d = _unit(tt - hh)
                    a = _unit(across - d * (across @ d))
                    bd = _unit(np.cross(d, a))
                    loc, nn = out_hit(hh + (tt - hh) * 0.52, bd)
                    if loc is None:
                        continue
                    ln = float(np.linalg.norm(tt - hh))
                    V, F, UV = G.rbox((0.0102, 0.0026, ln * (0.5 if k == 1 else 0.56)), 0.0012, n=1, bulge=0.0005)
                    o, R = G.frame(loc - nn * 0.0005, a, nn)
                    V = V + np.array([0, 0.0013, 0])
                    part('pad', side, G.place(V, o, R), F, UV, 'gpad', f'finger{fi}_{k}_{side}')

        if 'cuff' in kinds:
            # wrist strap round the cuff, and a hook-and-loop tab over it on the back
            e1 = _unit(back - ax * (back @ ax))
            e2 = np.cross(ax, e1)
            c0 = h + ax * (-cuff * 0.52)
            A = np.linspace(0, TAU, 36, endpoint=False)
            P, N = [], []
            for a_ in A:
                d = math.cos(a_) * e1 + math.sin(a_) * e2
                loc, nn = in_hit(c0, d, 0.07)
                if loc is not None:
                    P.append(loc); N.append(nn)
            if len(P) > 28:
                P = G.smooth_path(np.r_[P[-2:], P, P[:2]], 2)[2:-2]
                V, F, UV = G.strap(P + np.array(N) * 0.0002, N, 0.0155, 0.0026, closed=True)
                part('cuff', side, V, F, UV, 'gcuff')
                # the tab: wider, on top of the strap, from just past the back of
                # the wrist round toward the thumb side
                sgn = 1.0 if float(e2 @ (b.joint(f'finger1-1.{side}') - w)) > 0 else -1.0
                arc = [i for i, a_ in enumerate(A) if -0.55 < (a_ if a_ < math.pi else a_ - TAU) * sgn < 0.6]
                arc.sort(key=lambda i: (A[i] if A[i] < math.pi else A[i] - TAU) * sgn)
                if len(arc) > 3:
                    Pa = np.array([P[i] for i in arc]); Na = np.array([N[i] for i in arc])
                    V, F, UV = G.strap(Pa + Na * 0.0026, Na, 0.0195, 0.0024, cap=True)
                    part('cuff', side, V, F, UV, 'gcuff')

        if 'seam' in kinds:
            # raised seams down both sides of each finger and over its tip
            for fi in range(1, 6):
                segs = [tuple(np.array(v) for v in b.mh[f'finger{fi}-{k}.{side}'][:2]) for k in (1, 2, 3)]
                ks = [1, 2, 3]
                if fi == 1:
                    segs, ks = segs[1:], ks[1:]          # the thumb's first bone is inside the hand
                bones = [f'finger{fi}_{k}_{side}' for k in ks]
                # the bone before each segment: the hand, or the thumb's first bone
                before = [hb if fi > 1 else f'finger1_1_{side}'] + bones[:-1]

                def seg_w(si, f):
                    # each point follows its own finger segment, blended into the
                    # one before it just past the joint (a seam bound by nearest
                    # skin would follow the next finger where fingers touch, and
                    # stretch into a sheet when one finger moves on its own)
                    if f < 0.25:
                        t = 0.5 + 0.5 * f / 0.25
                        return {bones[si]: t, before[si]: 1 - t}
                    return {bones[si]: 1.0}
                frames = []
                for hh, tt in segs:
                    d = _unit(tt - hh)
                    a = across if fi > 1 else _unit(np.cross(d, n))
                    a = _unit(a - d * (a @ d))
                    frames.append((hh, tt, d, a, _unit(np.cross(d, a))))
                sides, side_w = [], []
                for sgn in (1, -1):
                    pts, wts = [], []
                    for si, (hh, tt, d, a, bd) in enumerate(frames):
                        for f in np.linspace(0.18 if si == 0 else 0.0, 1.0, 3, endpoint=False):
                            loc, nn = out_hit(hh + (tt - hh) * f, a * sgn * 0.86 + bd * 0.5)
                            if loc is not None:
                                pts.append(loc + nn * 0.0002); wts.append(seg_w(si, f))
                    sides.append(pts); side_w.append(wts)
                hh, tt, d, a, bd = frames[-1]
                tip_c = tt - d * 0.0065
                arc, arc_w = [], []
                for phi in np.linspace(0, math.pi, 7)[1:-1]:
                    loc, nn = out_hit(tip_c, (a * math.cos(phi) + d * math.sin(phi)) * 0.86 + bd * 0.5)
                    if loc is not None:
                        arc.append(loc + nn * 0.0002); arc_w.append({bones[-1]: 1.0})
                path = sides[0] + arc + sides[1][::-1]
                pw = side_w[0] + arc_w + side_w[1][::-1]
                if len(path) < 8:
                    continue
                path = G.smooth_path(path, 2)
                V, F, UV = G.tube(path, 0.0009, sides=5)
                o = part('seam', side, V, F, UV, 'stitch', smooth_below=85)
                PART_WEIGHTS[o.name] = [pw[i // 5] for i in range(len(V))]

        if 'wrap' in kinds:
            # fight wraps: round the knuckles, twice across the back of the hand
            # (crossing), and round the wrist
            loop('wrap', side, Kc - hand_dir * 0.006 + n * 0.003, back_h, across, 0.021, 0.0019, 'wrap', hb)
            for tilt in (0.55, -0.55):
                pn = _unit(hand_dir * math.cos(tilt) + across * math.sin(tilt))
                e1 = _unit(back_h - pn * (back_h @ pn))
                loop('wrap', side, mid - hand_dir * L * 0.42 + n * 0.004, e1, np.cross(pn, e1), 0.019, 0.0019, 'wrap', hb)
            for u, tilt in ((-0.004, 0.1), (-0.022, -0.12)):
                pn = _unit(ax * math.cos(tilt) + across * math.sin(tilt))
                e1 = _unit(back - pn * (back @ pn))
                loop('wrap', side, h + ax * u, e1, np.cross(pn, e1), 0.02, 0.0019, 'wrap', None, hit=in_hit)


def boots(b, M, *, top, ease=0.005, toe_h=0.05, mat='boot', seed=31, n=40):
    """Boot uppers lofted through sections of the foot and ankle: a roomy toe
    box, a heel counter, a padded collar at the shaft top. Returns the object
    and, per side, the bottom outline (for the sole)."""
    zs = list(np.r_[0.004, 0.009, 0.014, 0.02, 0.027, 0.035, 0.044, 0.054, 0.065, 0.077, 0.09, np.linspace(0.104, top, max(3, int((top - 0.104) / 0.014)) + 1)])
    Vall, Fall, outlines = [], [], {}
    for side in ('L', 'R'):
        this = (b.V[:, 0] < 0) if side == 'L' else (b.V[:, 0] > 0)
        pick = lambda V: this & (col(b.W, f'foot_{side}', f'shin_{side}') > 0.3) & (V[:, 2] < top + 0.03)
        L = C.Loft(b.V, b.faces, zs, n=n, pick=pick, center_smooth=3, radius_smooth=1)
        # flat bottom: the upper meets the sole along the full footprint
        L.r[0] = np.maximum(L.r[0], L.r[2]); L.r[1] = np.maximum(L.r[1], L.r[2])
        front = np.cos(L.a).clip(0, 1) ** 1.5
        tip = (L.c[2, 1] + L.r[2][np.argmin(np.abs(L.a))])

        def ease_fn(z, a, L=L, tip=tip):
            e = ease + 0.003 * C.smoothstep(top - 0.05, top, z)
            # toe box: the front of the low sections reaches forward to a rounded toe
            want = tip + 0.006 - 0.04 * np.clip((z - 0.012) / toe_h, 0, 1) ** 1.6
            k = int(np.argmin(np.abs(L.z - z)))
            have = L.c[k, 1] + L.r[k]
            grow = np.clip(want - have, 0, None) * np.cos(a).clip(0, 1) ** 2 * (z < toe_h + 0.02)
            # heel counter sits a little proud of the heel
            back = (-np.cos(a)).clip(0, 1) ** 2 * 0.003 * (z < 0.08)
            return e + grow + back
        P = L.points(ease_fn)
        V, F = C.ring_mesh(P, cap_bottom=True)
        base = len(Vall)
        Vall += list(V); Fall += [[base + i for i in f] for f in F]
        outlines[side] = P[0, :, :2].copy()
    sh = C.Shell.__new__(C.Shell)
    sh.body = b; sh.P = np.array(Vall); sh.F = Fall
    sh.src = np.array([int(b.bvh.find_nearest(Vector(p))[2]) for p in sh.P])
    sh.src = b.tris[sh.src, 0]
    sh.ease = np.full(len(sh.P), ease)
    sh.nb, sh.boundary, sh.bedges = C.adjacency(sh.F, len(sh.P))
    for side, sd in (('L', 1), ('R', 2)):
        sn = f'shin_{side}'
        Ls = np.linalg.norm(b.skel[sn][1] - b.skel[sn][0])
        # flex creases across the instep and around the ankle
        sh.rings(f'foot_{side}', [f'foot_{side}'], 0.035, 0.07, 3, 0.0016, 0.006, arc=(-1.1, 1.1), slope=0.4, seed=seed + sd)
        sh.rings(sn, [sn, f'foot_{side}'], Ls - 0.12, Ls - 0.03, 3, 0.0018, 0.008, slope=0.6, seed=seed + 10 + sd)
    sh.hem(0.008, 0.016, only=lambda c: c[2] > 0.05)
    return shell_obj('boots', sh, mat), outlines


def sole(outline, side, *, thick=0.03, lip=0.005, mat='sole', heel=0.006):
    """Rubber sole under one boot: its footprint grown by a lip, with a heel block."""
    c = outline.mean(axis=0)
    d = outline - c
    r = np.linalg.norm(d, axis=1, keepdims=True)
    ring = c + d * (r + lip) / r
    n = len(ring)
    back = lambda y: heel * C.smoothstep(c[1] - 0.03, c[1] - 0.08, y)
    layers = [(0.006, 0.994), (0.0, 1.0), (-0.45, 1.0), (-1.0, 0.99)]
    V, F = [], []
    for z, sc in layers:
        for x, y in ring:
            px, py = c[0] + (x - c[0]) * sc, c[1] + (y - c[1]) * sc
            V.append((px, py, z if z >= 0 else z * (thick + back(py))))
    for li in range(len(layers) - 1):
        for k in range(n):
            a, bb = li * n + k, li * n + (k + 1) % n
            F.append([a, bb, bb + n, a + n])
    top_c = len(V); V.append((c[0], c[1], 0.006))
    bot_c = len(V); V.append((c[0], c[1], -thick))
    last = (len(layers) - 1) * n
    for k in range(n):
        F.append([top_c, (k + 1) % n, k][::-1])
        F.append([bot_c, last + (k + 1) % n, last + k][::-1])
    return new_obj(f'sole_{side}', np.array(V), F, mat)


def face_window(V, eye, half_w, half_h, drop=0.0, round_=4.0):
    """True for points inside an eye opening (rounded rectangle seen from the front)."""
    x = V[:, 0] / half_w
    z = (V[:, 2] - eye[2] - drop) / half_h
    return ((np.abs(x) ** round_ + np.abs(z) ** round_) < 1) & (V[:, 1] > eye[1] - 0.05)


def eye_hole(sh, eye, half_w, half_h, drop=0.0, round_=4.0):
    """Pull the edge of a face opening onto its rounded-rectangle outline."""
    for loop in sh.loops():
        c = sh.P[loop].mean(axis=0)
        if c[1] < eye[1] - 0.04 or abs(c[2] - eye[2]) > 0.06:
            continue
        for i in loop:
            x = sh.P[i, 0] / half_w
            z = (sh.P[i, 2] - eye[2] - drop) / half_h
            r = (abs(x) ** round_ + abs(z) ** round_) ** (1 / round_)
            if r > 1e-6:
                sh.P[i, 0] = x / r * half_w
                sh.P[i, 2] = eye[2] + drop + z / r * half_h


def head_loft(b, M, z0, n=48, step=0.0075):
    """Sections through the head and neck from z0 to the crown."""
    top = b.V[b.used][:, 2].max()
    zs = np.r_[np.arange(z0, top - 0.012, step), top - 0.006, top - 0.002]
    pick = lambda V: (col(b.W, 'head', 'neck') > 0.3) & (V[:, 2] > z0 - 0.02)
    return C.Loft(b.V, b.faces, zs, n=n, pick=pick, center_smooth=2, radius_smooth=1)


def window_keep(L, M, half_w, half_h, drop=0.0):
    """keep(k, j) for ring_mesh: False on the faces of a frontal opening."""
    zc = M.eye[2] + drop

    def keep(k, j):
        z = (L.z[k] + L.z[k + 1]) / 2
        a = (L.a[j] + L.a[(j + 1) % len(L.a)]) / 2 if j < len(L.a) - 1 else L.a[j]
        x = math.sin(a) * L.radius_at(z, j)
        front = math.cos(a) > 0.3
        return not (front and abs(z - zc) < half_h and abs(x) < half_w)
    return keep


def balaclava(b, M, *, mat='knit', ease=0.0026):
    """Knit balaclava stretched over head and neck, with an opening for the eyes."""
    L = head_loft(b, M, M.neck - 0.05)
    P = L.points(ease + 0.002 * C.smoothstep(M.neck + 0.03, M.neck - 0.04, L.z)[:, None].repeat(1, 1) if False else ease)
    V, F = C.ring_mesh(P, keep=window_keep(L, M, 0.06, 0.02, 0.004), cap_top=True)
    sh = shell_from(b, V, F, ease)
    eye_hole(sh, M.eye, 0.064, 0.022, 0.004)
    # knit gathers at the neck
    sh.rings('neck', ['neck', 'chest', 'head'], -0.03, 0.05, 4, 0.0016, 0.007, seed=41)
    sh.hem(0.0035, 0.008, only=lambda c: c[2] > M.neck + 0.05)
    shell_obj('balaclava', sh, mat)
    return L


def shemagh(b, M, *, mat='shemagh', seed=51):
    """A shemagh wound around head, face and neck, leaving a slit for the eyes;
    knotted at the back with one end hanging down."""
    win = (0.066, 0.025, 0.006)
    L = head_loft(b, M, M.neck - 0.075, step=0.007)

    def ease_fn(z, a):
        front = np.cos(a).clip(0, 1)
        e = 0.008 + 0.004 * front
        # wound thick around the neck and lower face, spreading onto the collar
        e = e + 0.016 * C.smoothstep(M.eye[2] - 0.02, M.neck + 0.02, z) * (0.6 + 0.4 * front)
        e = e + 0.014 * C.smoothstep(M.neck + 0.01, M.neck - 0.07, z)
        return e
    P = L.points(ease_fn)
    V, F = C.ring_mesh(P, keep=window_keep(L, M, win[0] - 0.004, win[1] - 0.002, win[2]), cap_top=True)
    sh = shell_from(b, V, F, 0.01)
    eye_hole(sh, M.eye, win[0], win[1], win[2], round_=3.0)
    # wraps: long ridges spiralling round the head, bunched turns round the neck
    sh.rings('head', ['head'], 0.02, 0.17, 6, 0.0045, 0.011, slope=1.6, wobble=0.006, seed=seed, spread=0.6)
    sh.rings('neck', ['neck', 'head', 'chest'], -0.06, 0.09, 6, 0.006, 0.012, slope=0.9, wobble=0.005, seed=seed + 1)
    # the knot at the back of the head
    hd = b.skel['head'][0]
    knot = np.array([0.025, hd[1] - 0.1, M.eye[2] - 0.005])
    sh.bulge(knot, 0.045, 0.014, members=['head', 'neck'])
    sh.pull(knot + [0.0, 0.0, 0.03], knot + [0.05, 0.03, 0.06], 0.012, 0.005, members=['head'])
    sh.pull(knot + [-0.01, 0.0, -0.02], knot + [-0.06, 0.035, -0.05], 0.012, 0.005, members=['head', 'neck'])
    sh.hem(0.004, 0.01, only=lambda c: c[2] > M.neck + 0.04)
    shell_obj('shemagh', sh, mat)
    # the hanging end: a strip of cloth from the knot down over the upper back
    tail(b, M, knot, mat)
    return L


def tail(b, M, knot, mat, length=0.3, w0=0.11, w1=0.085, seed=57):
    """A loose end of cloth falling from the knot, lying on the back."""
    rng = np.random.default_rng(seed)
    rows, cols = 14, 7
    V, F = [], []
    for i in range(rows + 1):
        t = i / rows
        w = w0 + (w1 - w0) * t
        # path: down and slightly to one side, lying on the jacket
        cx = knot[0] + 0.03 * t + 0.01 * math.sin(t * 3)
        cz = knot[2] - 0.02 - length * t
        for j in range(cols + 1):
            s_ = (j / cols - 0.5)
            x = cx + s_ * w
            # find the back surface here and sit 1.5-3 cm off it
            hit = b.bvh.ray_cast(Vector((x, -0.5, cz)), Vector((0, 1, 0)), 1.0)
            y = (hit[0].y if hit[0] is not None else knot[1]) - 0.026 - 0.004 * math.sin(t * 2.2)
            # lengthwise folds, deeper toward the free end
            y -= (0.004 + 0.006 * t) * math.sin(s_ * math.pi * 3 + rng.random() * 0.3 + 1.1)
            V.append((x, y, cz))
    for i in range(rows):
        for j in range(cols):
            a = i * (cols + 1) + j
            F.append([a, a + 1, a + cols + 2, a + cols + 1])
    sh = shell_from(b, V, F, 0.02)
    sh.hem(0.003, 0.004)
    return shell_obj('shemagh_tail', sh, mat)


def shell_from(b, V, F, ease):
    sh = C.Shell.__new__(C.Shell)
    sh.body = b; sh.P = np.array(V, float); sh.F = [list(f) for f in F]
    tri = np.array([int(b.bvh.find_nearest(Vector(p))[2]) for p in sh.P])
    sh.src = b.tris[tri, 0]
    sh.ease = np.full(len(sh.P), ease)
    sh.nb, sh.boundary, sh.bedges = C.adjacency(sh.F, len(sh.P))
    return sh


def build(team):
    reset()
    PARTS.clear()
    SHELLS.clear()
    PART_WEIGHTS.clear()
    P = PROFILES[team]
    body = Body(**{**P['body'], **BODY_EXTRA})
    arm = build_armature(body.skel)
    M = Marks(body)
    win = P.get('window', (0.064, 0.022, 0.004))
    body_mesh(body, keep=lambda c: abs(c[0]) < win[0] + 0.012 and -win[1] - 0.005 < c[2] - M.eye[2] - win[2] < win[1] + 0.012 and c[1] > M.eye[1] - 0.045)
    eyeballs(body)
    if team == 'ct':
        pants = trousers(body, M, bottom=0.195, blouse=0.215, ease_leg=0.022, ease_seat=0.014)
        top = shirt(body, M, tuck=True)
        gl = gloves(body, M)
        glove_details(body, gl, GLOVE_DETAILS or TEAM_GLOVE_PARTS[team], cuff=0.055)
        _, ol = boots(body, M, top=0.215)
        sole(ol['L'], 'L'); sole(ol['R'], 'R')
        L = balaclava(body, M)
        surf = G.Surface([pants, torso_only(top, M)])
        G.ct_kit(body, M, surf, make, L)
        G.battle_belt(body, M, surf, make)
        G.holster(body, M, surf, make)
        G.knee_pads(body, M, surf, make)
        hs, zrim = G.helmet(body, M, L, make)
        G.headset(body, M, hs, zrim, make)
        G.eyewear(body, M, L, make, 'ballistic')
    else:
        pants = trousers(body, M, bottom=0.05, ease_leg=0.028, ease_seat=0.02, flare=0.012)
        top = shirt(body, M, tuck=False, ease_body=0.02, ease_sleeve=0.02, hem_z=0.87, mat='jacket')
        gl = gloves(body, M, ease=0.0022, cuff=0.045, guard=False, flare=0.006)
        glove_details(body, gl, GLOVE_DETAILS or TEAM_GLOVE_PARTS[team], cuff=0.045)
        L = shemagh(body, M)
        _, ol = boots(body, M, top=0.15, ease=0.007)
        sole(ol['L'], 'L', thick=0.022, lip=0.004, heel=0.004); sole(ol['R'], 'R', thick=0.022, lip=0.004, heel=0.004)
        surf = G.Surface([pants, torso_only(top, M)])
        G.chest_rig(body, M, surf, make)
        G.eyewear(body, M, L, make, 'sun')
    for obj, mat, bone in PARTS:
        m = bpy.data.materials.get(mat) or bpy.data.materials.new(mat)
        obj.data.materials.append(m)
    return arm, body


# ---------------------------------------------------------------- finishing
SOLE = {'ct': 0.03, 't': 0.022}
DECIMATE = {'gloves': 0.5, 'balaclava': 0.8, 'shemagh': 0.8, 'skin': 0.7}
CYL = ('balaclava', 'shemagh', 'boots', 'helmet')


def phys_uv(obj):
    """Give a part without construction UVs a metric 'phys' map: cylindrical
    round a vertical axis for lofted parts, otherwise each face projected on
    its dominant axis."""
    me = obj.data
    if me.uv_layers.get('phys'):
        return
    lay = me.uv_layers.new(name='phys')
    V = np.array([v.co[:] for v in me.vertices])
    cyl = obj.name.split('.')[0] in CYL
    if cyl:
        c = V.mean(axis=0)
        ang = np.arctan2(V[:, 0] - c[0], V[:, 1] - c[1])
        R = 0.11
        for p in me.polygons:
            a = [ang[me.loops[li].vertex_index] for li in p.loop_indices]
            if max(a) - min(a) > math.pi:
                a = [x + 2 * math.pi if x < 0 else x for x in a]
            for li, aa in zip(p.loop_indices, a):
                lay.data[li].uv = (aa * R, V[me.loops[li].vertex_index, 2])
        return
    for p in me.polygons:
        ax = int(np.argmax(np.abs(p.normal)))
        o = [i for i in range(3) if i != ax]
        for li in p.loop_indices:
            co = V[me.loops[li].vertex_index]
            lay.data[li].uv = (co[o[0]] + ax * 0.37, co[o[1]])


def decimate(obj, ratio):
    mod = obj.modifiers.new('dec', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = False
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear()
    old = obj.data
    obj.data = me
    bpy.data.meshes.remove(old)


def split_gloves(me, team):
    """Glove faces onto their own materials (the same baked textures), so the
    glTF has the gloves as their own primitive, and each kind of glove part
    ('char_<team>_glove_knuckle', ...) as another."""
    ga = me.attributes.get('glove')
    if ga is None:
        return
    flags = [0] * len(me.polygons)
    ga.data.foreach_get('value', flags)
    me.attributes.remove(me.attributes['glove'])
    if not any(flags) or not me.materials:
        return
    slot = {}
    for v in sorted(set(flags) - {0}):
        gm = me.materials[0].copy()
        gm.name = f'char_{team}_glove' + ('' if v == 1 else f'_{PART_OF[v]}')
        slot[v] = len(me.materials)
        me.materials.append(gm)
    me.polygons.foreach_set('material_index', [slot.get(f, 0) for f in flags])


def finish(team, arm, body, bake=True, size=2048, lift=None, bones=None, reduce=True, lods=(0.32, 0.1)):
    """Weights, sole offset, one joined mesh, atlas UVs, baked textures."""
    vl = bpy.context.view_layer
    for obj, mat, bone in PARTS:
        base = obj.name.split('.')[0]
        if reduce and base in DECIMATE:
            decimate(obj, DECIMATE[base])
        phys_uv(obj)
        bind(obj, body, bone, only=bones)
        if not obj.data.materials:
            m = bpy.data.materials.get(mat) or bpy.data.materials.new(mat)
            obj.data.materials.append(m)
        gp = int(obj.get('glovepart', 0)) or (1 if base == 'gloves' else 0)
        if gp:
            # remembered through the join so the gloves (and each kind of glove
            # part) get their own material slot: glove skins replace just those
            ga = obj.data.attributes.new('glove', 'INT', 'FACE')
            ga.data.foreach_set('value', [gp] * len(obj.data.polygons))
    # stand on the soles: everything up by the sole thickness
    lift = SOLE[team] if lift is None else lift
    for obj, _, _ in PARTS:
        obj.data.transform(Matrix.Translation((0, 0, lift)))
    for o in bpy.context.scene.objects:
        o.select_set(False)
    arm.select_set(True); vl.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in arm.data.edit_bones:
        eb.head.z += lift; eb.tail.z += lift
    bpy.ops.object.mode_set(mode='OBJECT')
    # one mesh
    objs = [o for o, _, _ in PARTS]
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    vl.objects.active = objs[0]
    bpy.ops.object.join()
    char = objs[0]
    char.name = f'body_{team}'
    me = char.data
    # atlas layout
    atlas = me.uv_layers.new(name='atlas')
    me.uv_layers.active = atlas
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.002, area_weight=0.0)
    bpy.ops.uv.pack_islands(margin=0.0025, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    if bake:
        TX.bake(char, team, size=size)
    split_gloves(me, team)
    # only the atlas goes to the game (colours are in the textures now)
    ph = me.uv_layers.get('phys')
    if ph:
        me.uv_layers.remove(ph)
    for ca in list(me.color_attributes):
        me.color_attributes.remove(ca)
    out = [char]
    if lods:
        # simpler versions for distance, sharing the skeleton, UVs and textures
        for k, ratio in enumerate(lods, 1):
            o = bpy.data.objects.new(f'{char.name}_lod{k}', char.data.copy())
            link(o)
            for vg in char.vertex_groups:
                o.vertex_groups.new(name=vg.name)
            decimate(o, ratio)
            out.append(o)
    for o in out:
        o.parent = arm
        mod = o.modifiers.new('rig', 'ARMATURE')
        mod.object = arm
    return char


# ---------------------------------------------------------------- first-person arms
ARM_BONES = ['upperarm_R', 'forearm_R', 'hand_R', 'upperarm_L', 'forearm_L', 'hand_L']


# Extra body settings for one build (the gun-holding arms change the hands).
BODY_EXTRA = {}

# First-person hands for guns: the right index finger lies straight along the
# frame (off the trigger), the other fingers wrap a pistol grip, the thumb runs
# forward along the frame; the left hand's fingers wrap round the right hand.
GUN_HANDS = dict(
    curl={'R': {1: 0.35, 2: 0.22, 3: 1.6, 4: 1.6, 5: 1.6}, 'L': {1: 0.85, 2: 1.35, 3: 1.4, 4: 1.45, 5: 1.45}},
    spread={'R': {2: 14}},
)


# First-person hands for knives, grenades and the bomb: a closed fist with the
# thumb wrapped round the handle, its tip resting on the middle joints of the
# index and middle fingers (at the default pose it stuck out past the handle).
FIST_HANDS = dict(curl={'R': {1: 0.0}, 'L': {1: 0.0}}, thumb_to=(0.108, 0.073, -0.004))


def export_fist_arms(team, path, size=1024):
    """The arms for knives, grenades and the bomb (see FIST_HANDS)."""
    BODY_EXTRA.clear(); BODY_EXTRA.update(FIST_HANDS)
    try:
        export_arms(team, path, size=size)
    finally:
        BODY_EXTRA.clear()


def export_gun_arms(team, path, size=1024):
    """The arms for holding guns (see GUN_HANDS); knives keep the fist."""
    BODY_EXTRA.clear(); BODY_EXTRA.update(GUN_HANDS)
    try:
        export_arms(team, path, size=size)
    finally:
        BODY_EXTRA.clear()


def export_arms(team, path, size=1024):
    """The arms as the player sees them: sleeves from the shoulder down and
    the gloves, skinned to six free bones (no hierarchy) that the viewmodel
    places directly every frame."""
    global GLOVE_DETAILS
    GLOVE_DETAILS = set(GLOVE_PART)      # every glove part: the game shows the ones a glove has
    try:
        arm, body = build(team)
    finally:
        GLOVE_DETAILS = None
    keep = {'shirt', 'gloves'}
    wanted = lambda o: o.name.split('.')[0] in keep or o.get('glovepart')
    kept = [(o, m, b) for o, m, b in PARTS if wanted(o)]
    for obj, mat, bone in PARTS:
        if not wanted(obj):
            bpy.data.objects.remove(obj)
    PARTS[:] = kept
    # sleeves only: drop the torso of the shirt
    for obj, mat, bone in PARTS:
        if obj.name.startswith('shirt'):
            sh = SHELLS[obj.name]
            W = sh.body.W[sh.src]
            armw = col(W, *ARM_BONES)
            bm = bmesh.new(); bm.from_mesh(obj.data)
            bm.verts.ensure_lookup_table()
            drop = [f for f in bm.faces if min(armw[v.index] for v in f.verts) < 0.3]
            bmesh.ops.delete(bm, geom=drop, context='FACES')
            bm.to_mesh(obj.data); bm.free()
    bpy.data.objects.remove(arm)
    # free bones: each one a root, so the game can place them independently
    data = bpy.data.armatures.new('arms')
    rig = bpy.data.objects.new('arms', data)
    link(rig)
    vl = bpy.context.view_layer
    for o in bpy.context.scene.objects:
        o.select_set(False)
    rig.select_set(True); vl.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name in ARM_BONES:
        h, t = body.skel[name]
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = Vector(h), Vector(t)
        eb.roll = 0
    # finger bones under each hand, three segments a finger (the thumb is
    # finger 1), each rolled so it bends toward the palm about its own X axis:
    # the game opens, closes and rolls the fingers for inspects and grabs
    for side in ('L', 'R'):
        n = H._palm(body.mh, side)
        w = body.mh[f'wrist.{side}'][0]
        hand_dir = body.mh[f'finger3-1.{side}'][0] - w
        across = np.cross(hand_dir / np.linalg.norm(hand_dir), n)
        for fi in range(1, 6):
            parent = data.edit_bones[f'hand_{side}']
            for k in range(1, 4):
                h, t, _ = body.mh[f'finger{fi}-{k}.{side}']
                eb = data.edit_bones.new(f'finger{fi}_{k}_{side}')
                eb.head, eb.tail = Vector(tuple(h)), Vector(tuple(t))
                eb.parent = parent; eb.use_connect = False
                d = (t - h) / np.linalg.norm(t - h)
                ax = across if fi > 1 else np.cross(d, n)
                ax = ax - d * float(ax @ d); ax = ax / np.linalg.norm(ax)
                eb.align_roll(Vector(tuple(np.cross(ax, d))))     # Z = X x Y
                parent = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    char = finish(team, rig, body, bake=True, size=size, lift=0.0, bones=ARM_BONES + H.FINGER_BONES, reduce=False, lods=())
    char.name = f'arms_{team}'
    for o in bpy.context.scene.objects:
        o.select_set(False)
    export(path)


def export_glove_display(team, path):
    """The gloves on their own with relaxed hands, for the inventory, case and
    market previews: one mesh per hand ('glove_L', 'glove_R'), each in its
    hand's frame (x from the wrist to the fingertips, z out of the back of the
    hand, origin mid-hand). Material 'skin_glove' and no textures: the game
    paints the finish on."""
    global GLOVE_DETAILS
    BODY_EXTRA.clear(); BODY_EXTRA.update(grip=0.3)
    GLOVE_DETAILS = set(GLOVE_PART)
    try:
        arm, body = build(team)
    finally:
        BODY_EXTRA.clear()
        GLOVE_DETAILS = None
    src = next(o for o, _, _ in PARTS if o.name.split('.')[0] == 'gloves')
    mat = bpy.data.materials.new('skin_glove')
    # glove parts, one mesh per side and kind: 'glove_L_knuckle', ...
    groups = {}
    for o, _, _ in PARTS:
        if o.get('glovepart'):
            groups.setdefault((o['gside'], PART_OF[int(o['glovepart'])]), []).append(o)
    keep = {'glove_L', 'glove_R'}
    for side in ('L', 'R'):
        o = src.copy(); o.data = src.data.copy(); o.name = f'glove_{side}'
        link(o)
        bm = bmesh.new(); bm.from_mesh(o.data)
        drop = [f for f in bm.faces if (f.calc_center_median().x < 0) != (side == 'L')]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        bm.to_mesh(o.data); bm.free()
        h, t, ax = body.bone_frame(f'hand_{side}')
        back = -H._palm(body.mh, side)
        back = back - ax * float(back @ ax); back = back / np.linalg.norm(back)
        y = np.cross(back, ax)
        R = Matrix((tuple(ax), tuple(y), tuple(back))).to_4x4()   # rows: world -> hand frame
        o.data.transform(R @ Matrix.Translation(-(Vector(tuple(h)) + Vector(tuple(ax)) * 0.06)))
        o.data.materials.clear(); o.data.materials.append(mat)
        o.matrix_world = Matrix.Identity(4)
        o.data.uv_layers.new(name='uv')
        for (gs, kind), objs in groups.items():
            if gs != side:
                continue
            Vs, Fs = [], []
            for po in objs:
                V, F = mesh_arrays(po)
                Fs += [[i + sum(len(v) for v in Vs) for i in f] for f in F]
                Vs.append(V)
            name = f'glove_{side}_{kind}'
            me = bpy.data.meshes.new(name)
            me.from_pydata([tuple(map(float, v)) for v in np.concatenate(Vs)], [], Fs)
            me.transform(R @ Matrix.Translation(-(Vector(tuple(h)) + Vector(tuple(ax)) * 0.06)))
            for p in me.polygons:
                p.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(50))
            me.materials.append(bpy.data.materials.get(f'skin_glove_{kind}') or bpy.data.materials.new(f'skin_glove_{kind}'))
            me.uv_layers.new(name='uv')
            po = bpy.data.objects.new(name, me)
            link(po)
            keep.add(name)
    for o in list(bpy.context.scene.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o)
    PARTS.clear()
    export(path)


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=False, export_yup=True, export_skins=True,
                              export_animations=False, export_materials='EXPORT', export_normals=True, export_texcoords=True,
                              export_image_format='JPEG', export_jpeg_quality=88, use_visible=False, use_active_scene=True)


def main(argv):
    out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(ROOT, 'public', 'models', 'characters')
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else list(PROFILES)
    os.makedirs(out, exist_ok=True)
    report = {}
    size = int(argv[argv.index('--size') + 1]) if '--size' in argv else 2048
    for team in only:
        arm, body = build(team)
        finish(team, arm, body, bake='--no-bake' not in argv, size=size)
        export(os.path.join(out, f'{team}.glb'))
        report[team] = stats()
        print(f'{team}: {report[team]} tris')
        if '--no-arms' not in argv:
            export_fist_arms(team, os.path.join(out, f'arms_{team}.glb'), size=min(size, 1024))
            print(f'{team} arms: {stats()} tris')
            export_gun_arms(team, os.path.join(out, f'arms_{team}_gun.glb'), size=min(size, 1024))
            print(f'{team} gun arms: {stats()} tris')
    return report


if __name__ == '__main__':
    main(sys.argv)
