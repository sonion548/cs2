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

    def weights_at(self, p):
        """Bone weights at a point, interpolated across the nearest body triangle."""
        loc, _, idx, _ = self.bvh.find_nearest(Vector(p))
        t = self.tris[idx]
        A, B, C = (self.V[i] for i in t)
        bc = _bary(np.array(loc), A, B, C)
        return bc[0] * self.W[t[0]] + bc[1] * self.W[t[1]] + bc[2] * self.W[t[2]]

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
    if bone:
        W = np.zeros((n, len(BONES))); W[:, BI[bone]] = 1
    else:
        W = np.array([body.weights_at(v.co[:]) for v in me.vertices])
    if only:
        mask = np.array([b in only for b in BONES], float)
        W = W * mask
        s_ = W.sum(axis=1, keepdims=True)
        # anything left without weight (the shoulder end) follows the upper arm on its side
        lone = s_[:, 0] < 1e-6
        V = np.array([v.co[:] for v in me.vertices])
        W[lone & (V[:, 0] < 0), BI['upperarm_L']] = 1
        W[lone & (V[:, 0] >= 0), BI['upperarm_R']] = 1
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
    groups = {b: obj.vertex_groups.new(name=b) for b in BONES}
    for i in range(n):
        ws = W[i, top[i]]
        s = ws.sum()
        if s <= 0:
            continue
        for j, w in zip(top[i], ws / s):
            if w > 0.004:
                groups[BONES[j]].add([i], float(w), 'REPLACE')


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
        gloves(body, M)
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
        gloves(body, M, ease=0.0022, cuff=0.045, guard=False, flare=0.006)
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
    """Glove faces onto a second material (the same baked textures), so the
    glTF has the gloves as their own primitive."""
    ga = me.attributes.get('glove')
    if ga is None:
        return
    flags = [0] * len(me.polygons)
    ga.data.foreach_get('value', flags)
    me.attributes.remove(me.attributes['glove'])
    if not any(flags) or not me.materials:
        return
    gm = me.materials[0].copy()
    gm.name = f'char_{team}_glove'
    me.materials.append(gm)
    me.polygons.foreach_set('material_index', [1 if f else 0 for f in flags])


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
        if base == 'gloves':
            # remembered through the join so the gloves can get their own
            # material slot (glove skins replace just that part in the game)
            ga = obj.data.attributes.new('glove', 'INT', 'FACE')
            ga.data.foreach_set('value', [1] * len(obj.data.polygons))
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
    arm, body = build(team)
    keep = {'shirt', 'gloves'}
    kept = [(o, m, b) for o, m, b in PARTS if o.name.split('.')[0] in keep]
    for obj, mat, bone in PARTS:
        if obj.name.split('.')[0] not in keep:
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
    bpy.ops.object.mode_set(mode='OBJECT')
    char = finish(team, rig, body, bake=True, size=size, lift=0.0, bones=ARM_BONES, reduce=False, lods=())
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
    BODY_EXTRA.clear(); BODY_EXTRA.update(grip=0.3)
    try:
        arm, body = build(team)
    finally:
        BODY_EXTRA.clear()
    src = next(o for o, _, _ in PARTS if o.name.split('.')[0] == 'gloves')
    mat = bpy.data.materials.new('skin_glove')
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
    for o in list(bpy.context.scene.objects):
        if o.name not in ('glove_L', 'glove_R'):
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
