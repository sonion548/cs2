"""Anatomical base for the Vantage characters: the CC0 MakeHuman hm08 mesh
(blender/assets/makehuman), shaped with its macro targets, re-posed and
skinned onto the game's 17-bone skeleton.

Everything here is plain numpy so it can run inside or outside Blender.

Coordinates: MakeHuman data is in decimetres, Y up, facing +Z, the
character's left on +X. Everything this module returns is in metres in the
Blender frame the other build scripts use: +Z up, facing +Y, the character's
left on -X, feet on Z = 0.
"""
import gzip
import json
import os

import numpy as np

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'makehuman')


def _open(name):
    return gzip.open(os.path.join(ASSETS, name + '.gz'), 'rt')


def to_blender(p):
    """MakeHuman (dm, Y up, facing +Z) -> Blender (m, Z up, facing +Y)."""
    p = np.asarray(p, dtype=np.float64)
    return np.stack([-p[..., 0], p[..., 2], p[..., 1]], axis=-1) * 0.1


# ---------------------------------------------------------------- base mesh
_BASE = None


def base():
    """The base mesh: verts (N,3) in MakeHuman space, uvs (M,2), and faces as
    (vertex indices, uv indices, group name) triples."""
    global _BASE
    if _BASE:
        return _BASE
    V, UV, F = [], [], []
    group = None
    with _open('base.obj') as f:
        for line in f:
            if line.startswith('v '):
                V.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                UV.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                group = line.split()[1]
            elif line.startswith('f '):
                parts = [t.split('/') for t in line.split()[1:]]
                F.append(([int(p[0]) - 1 for p in parts], [int(p[1]) - 1 for p in parts], group))
    _BASE = (np.array(V), np.array(UV), F)
    return _BASE


def target(rel):
    """Sparse morph target: (vertex indices, offsets) in MakeHuman space."""
    idx, d = [], []
    with _open(rel.replace('/', '__')) as f:
        for line in f:
            if not line.strip() or line[0] == '#':
                continue
            p = line.split()
            idx.append(int(p[0])); d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d).reshape(-1, 3)


# ---------------------------------------------------------------- macro shaping
def _tri(v, lo, mid, hi):
    """MakeHuman's three-way split of a 0..1 slider: weights for min/average/max."""
    if v < 0.5:
        a = max(0.0, 1 - v * 2)
        return {lo: a, mid: 1 - a, hi: 0.0}
    a = max(0.0, v * 2 - 1)
    return {lo: 0.0, mid: 1 - a, hi: a}


def macro_targets(muscle=0.5, weight=0.5, height=0.5, proportions=0.5, ethnic=(1 / 3, 1 / 3, 1 / 3)):
    """(target, weight) pairs for a young adult man, following MakeHuman's
    macro modifier rules (gender 1, age 25)."""
    out = []
    for name, w in zip(('african', 'asian', 'caucasian'), ethnic):
        if w > 0:
            out.append((f'macrodetails/{name}-male-young.target', w))
    mus = _tri(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle')
    wei = _tri(weight, 'minweight', 'averageweight', 'maxweight')
    hmax = max(0.0, height * 2 - 1)
    ideal = max(0.0, proportions * 2 - 1)
    for m, wm in mus.items():
        for k, wk in wei.items():
            w = wm * wk
            if w <= 0 or m == 'minmuscle':
                continue
            out.append((f'macrodetails/universal-male-young-{m}-{k}.target', w))
            if hmax > 0:
                out.append((f'macrodetails/height/male-young-{m}-{k}-maxheight.target', w * hmax))
            if ideal > 0:
                out.append((f'macrodetails/proportions/male-young-{m}-{k}-idealproportions.target', w * ideal))
    return out


def shaped(**params):
    V = base()[0].copy()
    for rel, w in macro_targets(**params):
        idx, d = target(rel)
        if len(idx):
            V[idx] += d * w
    return V


# ---------------------------------------------------------------- skeleton & weights
_SKEL = None


def mhskel():
    global _SKEL
    if not _SKEL:
        with _open('default.mhskel') as f:
            _SKEL = json.load(f)
    return _SKEL


def mh_bones(Vb):
    """MakeHuman skeleton fitted to blender-space verts Vb: name -> (head, tail, parent)."""
    sk = mhskel()
    J = {k: Vb[v].mean(axis=0) for k, v in sk['joints'].items()}
    return {n: (J[b['head']], J[b['tail']], b['parent']) for n, b in sk['bones'].items()}


def mh_weights():
    """MakeHuman skin weights: bone -> (vertex indices, weights)."""
    with _open('default_weights.mhw') as f:
        w = json.load(f)['weights']
    return {b: (np.array([p[0] for p in l], dtype=np.int64), np.array([p[1] for p in l])) for b, l in w.items()}


# MakeHuman bone -> game bone(s)
def game_bone(mh):
    side = '_L' if mh.endswith('.L') else '_R' if mh.endswith('.R') else ''
    base_ = mh[:-2] if side else mh
    if base_ in ('root', 'spine05', 'pelvis'):
        return [('hips', 1.0)]
    if base_ in ('spine04', 'spine03', 'spine02'):
        return [('spine', 1.0)]
    if base_ in ('spine01', 'breast', 'clavicle'):
        return [('chest', 1.0)]
    if base_ == 'shoulder01':
        return [('chest', 0.45), ('upperarm' + side, 0.55)]
    if base_.startswith('upperarm'):
        return [('upperarm' + side, 1.0)]
    if base_.startswith('lowerarm'):
        return [('forearm' + side, 1.0)]
    if base_ in ('wrist',) or base_.startswith(('metacarpal', 'finger')):
        return [('hand' + side, 1.0)]
    if base_.startswith('upperleg'):
        return [('thigh' + side, 1.0)]
    if base_.startswith('lowerleg'):
        return [('shin' + side, 1.0)]
    if base_ == 'foot' or base_.startswith('toe'):
        return [('foot' + side, 1.0)]
    if base_.startswith('neck'):
        return [('neck', 1.0)]
    return [('head', 1.0)]   # head, jaw, eyes, tongue and the facial bones


GAME_BONES = ['hips', 'spine', 'chest', 'neck', 'head',
              'upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'forearm_R', 'hand_R',
              'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R']
GAME_PARENT = {'hips': None, 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck',
               'upperarm_L': 'chest', 'forearm_L': 'upperarm_L', 'hand_L': 'forearm_L',
               'upperarm_R': 'chest', 'forearm_R': 'upperarm_R', 'hand_R': 'forearm_R',
               'thigh_L': 'hips', 'shin_L': 'thigh_L', 'foot_L': 'shin_L',
               'thigh_R': 'hips', 'shin_R': 'thigh_R', 'foot_R': 'shin_R'}


# The first-person arms also get finger bones: three per finger, thumb = 1.
FINGER_BONES = [f'finger{fi}_{k}_{s}' for s in ('L', 'R') for fi in range(1, 6) for k in range(1, 4)]


def finger_bone(mh):
    """MakeHuman finger segment 'finger2-1.R' -> 'finger2_1_R' (None for other bones)."""
    if mh.startswith('finger') and mh[-2:] in ('.L', '.R'):
        fi, k = mh[6:-2].split('-')
        return f'finger{fi}_{k}_{mh[-1]}'
    return None


def arm_weights(n, W=None):
    """(n, 17 + 30) weights over GAME_BONES + FINGER_BONES: like game_weights,
    but each finger segment keeps its own weight instead of joining the hand."""
    W = W or mh_weights()
    names = GAME_BONES + FINGER_BONES
    out = np.zeros((n, len(names)))
    col = {b: i for i, b in enumerate(names)}
    for mh, (idx, w) in W.items():
        fb = finger_bone(mh)
        for g, f in ([(fb, 1.0)] if fb else game_bone(mh)):
            np.add.at(out[:, col[g]], idx, w * f)
    s = out.sum(axis=1, keepdims=True)
    s[s == 0] = 1
    return out / s


def game_weights(n, W=None):
    """(n, 17) weight matrix over GAME_BONES from the MakeHuman weights."""
    W = W or mh_weights()
    out = np.zeros((n, len(GAME_BONES)))
    col = {b: i for i, b in enumerate(GAME_BONES)}
    for mh, (idx, w) in W.items():
        for g, f in game_bone(mh):
            np.add.at(out[:, col[g]], idx, w * f)
    s = out.sum(axis=1, keepdims=True)
    s[s == 0] = 1
    return out / s


# ---------------------------------------------------------------- posing (linear blend skinning on the MH skeleton)
def rot(axis, angle):
    axis = np.asarray(axis, dtype=np.float64)
    axis = axis / np.linalg.norm(axis)
    x, y, z = axis
    c, s, C = np.cos(angle), np.sin(angle), 1 - np.cos(angle)
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def between(a, b):
    """Shortest rotation taking direction a to direction b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); s = np.linalg.norm(v); c = float(np.dot(a, b))
    if s < 1e-9:
        return np.eye(3)
    return rot(v, np.arctan2(s, c))


def pose(Vb, bones, W, local):
    """Deform Vb with the MakeHuman skeleton. `local` maps bone -> 3x3 rotation
    about the bone's head, in the rest (world) frame; children inherit their
    parent's motion. Returns posed verts and posed bones (name -> head, tail)."""
    order, seen = [], set()

    def visit(n):
        if n in seen:
            return
        p = bones[n][2]
        if p:
            visit(p)
        seen.add(n); order.append(n)
    for n in bones:
        visit(n)
    M = {}
    for n in order:
        h = bones[n][0]
        R = local.get(n, np.eye(3))
        A = np.eye(4); A[:3, :3] = R; A[:3, 3] = h - R @ h        # rotate about the rest head
        p = bones[n][2]
        M[n] = (M[p] @ A) if p else A
    out = np.zeros_like(Vb)
    tot = np.zeros(len(Vb))
    for n, (idx, w) in W.items():
        if n not in M:
            continue
        m = M[n]
        out[idx] += (Vb[idx] @ m[:3, :3].T + m[:3, 3]) * w[:, None]
        tot[idx] += w
    free = tot < 1e-6
    out[~free] /= tot[~free, None]
    out[free] = Vb[free]
    posed = {}
    for n, (h, t, p) in bones.items():
        m = M[n]
        posed[n] = (m[:3, :3] @ h + m[:3, 3], m[:3, :3] @ t + m[:3, 3])
    return out, posed, M


# ---------------------------------------------------------------- the soldier body
def _palm(P, side):
    """Unit normal out of the palm of hand `side` ('L'/'R') from posed bones P."""
    w = P[f'wrist.{side}'][0]
    a = P[f'finger2-1.{side}'][0] - w
    b = P[f'finger5-1.{side}'][0] - w
    n = np.cross(a, b) if side == 'R' else np.cross(b, a)
    return n / np.linalg.norm(n)


def soldier_body(muscle=0.8, weight=0.55, height=0.55, proportions=0.85, ethnic=(0.2, 0.2, 0.6), eye_height=1.625,
                 grip=1.0, abduct=9.0, elbow=14.0, curl=None, spread=None, thumb_to=None):
    """Shaped, re-posed body in Blender space (metres, feet on Z=0).

    Arms hang at the sides (abduct degrees out, elbows bent `elbow` degrees
    forward, palms facing the thighs), fingers curl around an imaginary grip
    (`grip` 0..1), legs come in to hip width. `curl` scales the curl per side
    and finger ({'R': {2: 0.2, ...}}, 1 = thumb ... 5 = little finger) and
    `spread` swings a finger toward the thumb in degrees (an index finger laid
    along a gun's frame). Returns a dict with verts, faces/uvs/groups, posed
    MakeHuman bones and the game skeleton."""
    V = to_blender(shaped(muscle=muscle, weight=weight, height=height, proportions=proportions, ethnic=ethnic))
    _, UV, F = base()
    body_idx = np.array(sorted({i for f, _, g in F if g == 'body' for i in f}))
    V[:, 2] -= V[body_idx, 2].min()
    eyes = np.array(sorted({i for f, _, g in F if g in ('helper-l-eye', 'helper-r-eye') for i in f}))
    V *= eye_height / V[eyes, 2].mean()
    bones = mh_bones(V)
    W = mh_weights()
    local = {}

    def apply(new):
        nonlocal V, bones
        local.clear(); local.update(new)
        V2, P, _ = pose(V, bones, W, local)
        V = V2
        bones = {n: (P[n][0], P[n][1], bones[n][2]) for n in bones}

    # 1. arms down: rotate about the forward axis, shared between shoulder girdle and joint
    rots = {}
    for side, sx in (('L', -1), ('R', 1)):
        sh, el = bones[f'upperarm01.{side}'][0], bones[f'lowerarm01.{side}'][0]
        cur = el - sh
        a = np.radians(abduct)
        want = np.array([sx * np.sin(a), 0.02, -np.cos(a)])
        R = between(cur, want)
        ang = np.arccos(np.clip(np.dot(cur / np.linalg.norm(cur), want / np.linalg.norm(want)), -1, 1))
        ax = np.cross(cur, want); ax /= np.linalg.norm(ax)
        rots[f'clavicle.{side}'] = rot(ax, ang * 0.08)
        rots[f'shoulder01.{side}'] = rot(ax, ang * 0.17)
        rots[f'upperarm01.{side}'] = rot(ax, ang * 0.75)
    apply(rots)
    # 2. elbows almost straight, hinged in their own bend plane
    rots = {}
    for side in ('L', 'R'):
        sh, el, wr = bones[f'upperarm01.{side}'][0], bones[f'lowerarm01.{side}'][0], bones[f'wrist.{side}'][0]
        u, f = el - sh, wr - el
        hinge = np.cross(u, f); hinge /= np.linalg.norm(hinge)
        bend = np.arccos(np.clip(np.dot(u, f) / np.linalg.norm(u) / np.linalg.norm(f), -1, 1))
        rots[f'lowerarm01.{side}'] = rot(hinge, -(bend - np.radians(elbow)))
    apply(rots)
    # 3. forearm twist so the palms face the thighs, then line the hand up with the forearm
    rots = {}
    for side, sx in (('L', -1), ('R', 1)):
        el, wr = bones[f'lowerarm01.{side}'][0], bones[f'wrist.{side}'][0]
        axis = (wr - el) / np.linalg.norm(wr - el)
        n = _palm(bones, side)
        want = np.array([-sx, 0.15, 0.0])                       # toward the body's midline, a touch forward
        want -= axis * np.dot(want, axis); want /= np.linalg.norm(want)
        n2 = n - axis * np.dot(n, axis); n2 /= np.linalg.norm(n2)
        ang = np.arctan2(np.dot(np.cross(n2, want), axis), np.dot(n2, want))
        rots[f'lowerarm02.{side}'] = rot(axis, ang * 0.7)
        rots[f'wrist.{side}'] = rot(axis, ang * 0.3)
    apply(rots)
    rots = {}
    for side in ('L', 'R'):
        el, wr = bones[f'lowerarm01.{side}'][0], bones[f'wrist.{side}'][0]
        hand = bones[f'finger3-1.{side}'][0] - wr
        rots[f'wrist.{side}'] = between(hand, (wr - el) / np.linalg.norm(wr - el) * np.linalg.norm(hand) * 0.97 + _palm(bones, side) * 0.03 * np.linalg.norm(hand))
    apply(rots)
    # 4. fingers curl toward the palm, thumb wraps across
    if grip > 0:
        rots = {}
        for side in ('L', 'R'):
            n = _palm(bones, side)
            cs = (curl or {}).get(side, {})
            sp = (spread or {}).get(side, {})
            thumb = bones[f'finger1-1.{side}'][0]
            for fi, angs in ((2, (38, 52, 30)), (3, (42, 55, 30)), (4, (46, 55, 30)), (5, (50, 52, 28))):
                f = grip * cs.get(fi, 1.0)
                for k, a in enumerate(angs, 1):
                    b = f'finger{fi}-{k}.{side}'
                    h, t, _ = bones[b]
                    d = (t - h) / np.linalg.norm(t - h)
                    ax = np.cross(d, n); ax /= np.linalg.norm(ax)
                    R = rot(ax, np.radians(a) * f)
                    if k == 1 and sp.get(fi):
                        # swing toward the thumb, within the palm plane
                        toward = thumb - h
                        toward = toward - n * np.dot(toward, n)
                        sign = 1.0 if np.dot(np.cross(n, d), toward) > 0 else -1.0
                        R = rot(n, sign * np.radians(sp[fi])) @ R
                    rots[b] = R
            f = grip * cs.get(1, 1.0)
            # thumb_to: a closed fist's thumb lies across the curled fingers. Aim
            # the thumb at that spot, given in the hand's frame (metres along the
            # hand from the wrist, out in front of the palm, across toward the
            # little finger); bending its joints alone only swung it out or back.
            Ropp = None
            if thumb_to is not None:
                w = bones[f'wrist.{side}'][0]
                L = bones[f'finger3-1.{side}'][0] - w; L /= np.linalg.norm(L)
                nn = n - L * np.dot(n, L); nn /= np.linalg.norm(nn)
                S = bones[f'finger5-1.{side}'][0] - bones[f'finger2-1.{side}'][0]
                S = S - L * np.dot(S, L) - nn * np.dot(S, nn); S /= np.linalg.norm(S)
                target = w + L * thumb_to[0] + nn * thumb_to[1] + S * thumb_to[2]
                h1 = bones[f'finger1-1.{side}'][0]
                Ropp = between(bones[f'finger1-3.{side}'][1] - h1, target - h1)
            for k, a in enumerate((18, 22, 25), 1):
                b = f'finger1-{k}.{side}'
                h, t, _ = bones[b]
                d = (t - h) / np.linalg.norm(t - h)
                ax = np.cross(d, n); ax /= np.linalg.norm(ax)
                R = rot(ax, np.radians(a) * f)
                rots[b] = Ropp @ R if (k == 1 and Ropp is not None) else R
        apply(rots)
    # 5. legs in to about hip width (ankles a few cm outside the hip joints)
    rots = {}
    for side, sx in (('L', -1), ('R', 1)):
        hip, ank = bones[f'upperleg01.{side}'][0], bones[f'foot.{side}'][0]
        cur = ank - hip
        rots[f'upperleg01.{side}'] = between(cur, np.array([sx * 0.03, cur[1], cur[2]]))
    apply(rots)
    # back on the ground after posing
    dz = V[body_idx, 2].min()
    V[:, 2] -= dz
    off = np.array([0.0, 0.0, dz])
    bones = {n: (h - off, t - off, p) for n, (h, t, p) in bones.items()}
    return dict(V=V, UV=UV, F=F, bones=bones, body_idx=body_idx, skeleton=game_skeleton(bones))


def game_skeleton(B):
    """Game bone -> (head, tail) from posed MakeHuman bones."""
    hipL, hipR = B['upperleg01.L'][0], B['upperleg01.R'][0]
    hips_h = np.array([0.0, (B['root'][0][1] + hipL[1]) / 2, (hipL[2] + hipR[2]) / 2])
    S = {
        'hips': (hips_h, B['spine04'][0]),
        'spine': (B['spine04'][0], B['spine01'][0]),
        'chest': (B['spine01'][0], B['neck01'][0]),
        'neck': (B['neck01'][0], B['head'][0]),
        'head': (B['head'][0], B['head'][1]),
    }
    for s in ('L', 'R'):
        S[f'upperarm_{s}'] = (B[f'upperarm01.{s}'][0], B[f'lowerarm01.{s}'][0])
        S[f'forearm_{s}'] = (B[f'lowerarm01.{s}'][0], B[f'wrist.{s}'][0])
        S[f'hand_{s}'] = (B[f'wrist.{s}'][0], B[f'finger3-1.{s}'][0])
        S[f'thigh_{s}'] = (B[f'upperleg01.{s}'][0], B[f'lowerleg01.{s}'][0])
        S[f'shin_{s}'] = (B[f'lowerleg01.{s}'][0], B[f'foot.{s}'][0])
        S[f'foot_{s}'] = (B[f'foot.{s}'][0], B[f'toe3-1.{s}'][0])
    return {k: (np.array(h, dtype=float), np.array(t, dtype=float)) for k, (h, t) in S.items()}
