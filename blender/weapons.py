"""Weapon models for Vantage, built in Blender and exported as .glb.

Material name prefixes tell the game how to treat each part:
  skin_*   painted surface that receives weapon finishes
  metal_*  bare steel
  detail_* polymer / rubber / wood / glass / brass that keep their own look
Empties mark anchor points: muzzle, grip, fore. Objects named mag, slide,
bolt, bfA, bfB, karambitPivot are animated by the game.
"""
import math
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa
import bpy

PI = math.pi


def mats():
    return {
        'paint': material('skin_paint', (0.11, 0.12, 0.13, 1), 0.35, 0.5),
        'wood': material('skin_wood', (0.42, 0.18, 0.07, 1), 0.0, 0.45),
        'poly': material('skin_polymer', (0.09, 0.09, 0.1, 1), 0.05, 0.7),
        'tan': material('skin_tan', (0.33, 0.36, 0.24, 1), 0.1, 0.6),
        'blade': material('skin_blade', (0.75, 0.77, 0.8, 1), 1.0, 0.18),
        'steel': material('metal_steel', (0.35, 0.37, 0.4, 1), 0.9, 0.32),
        'dark': material('metal_dark', (0.06, 0.065, 0.07, 1), 0.8, 0.42),
        'rubber': material('detail_rubber', (0.03, 0.03, 0.03, 1), 0.0, 0.95),
        'polymer': material('detail_polymer', (0.06, 0.06, 0.065, 1), 0.05, 0.75),
        'lens': material('detail_lens', (0.15, 0.3, 0.45, 1), 0.9, 0.05),
        'brass': material('detail_brass', (0.7, 0.5, 0.2, 1), 1.0, 0.3),
        'cord': material('detail_cord', (0.18, 0.17, 0.12, 1), 0.0, 0.9),
        'horn': material('detail_horn', (0.25, 0.14, 0.07, 1), 0.05, 0.35),
        'woodd': material('detail_wood', (0.4, 0.2, 0.08, 1), 0.0, 0.5),
    }


def rivets(prefix, pts, M, r=0.0026, y=0.0235):
    for i, (x, z) in enumerate(pts):
        for s in (-1, 1):
            sphere(f'{prefix}{i}{s}', r, (x, s * y, z), M['steel'], scale=(1, 0.45, 1), segs=12)


def trigger_group(M, x0, x1, ztop, depth, mat):
    t = 0.0045
    guard = extrude('guard', [('M', x0, ztop), ('L', x0, ztop - depth * 0.6), ('Q', x0, ztop - depth, x0 + depth * 0.4, ztop - depth),
                              ('L', x1 - 0.004, ztop - depth), ('Q', x1, ztop - depth, x1, ztop - depth + 0.006), ('L', x1, ztop)], 0.012, mat, bevel=0.0015)
    hole = extrude('cutter', [('M', x0 + t, ztop + 0.01), ('L', x1 - t, ztop + 0.01), ('L', x1 - t, ztop - depth + t + 0.004),
                              ('L', x0 + depth * 0.4, ztop - depth + t), ('Q', x0 + t, ztop - depth + t, x0 + t, ztop - depth * 0.6)], 0.05, None, bevel=0)
    cut(guard, hole)
    tx = (x0 + x1) / 2 + 0.002
    extrude('trigger', [('M', tx - 0.003, ztop), ('Q', tx + 0.005, ztop - depth * 0.45, tx - 0.004, ztop - depth * 0.78),
                        ('L', tx - 0.009, ztop - depth * 0.72), ('Q', tx - 0.002, ztop - depth * 0.45, tx - 0.009, ztop)], 0.006, M['dark'], bevel=0.001)


# ================================================================ AK-47
def ak47():
    M = mats()
    # receiver (stamped) with rounded rear and trunnion step
    rec = extrude('receiver', [('M', -0.08, -0.008), ('L', 0.235, -0.008), ('L', 0.235, 0.052), ('L', 0.21, 0.058), ('L', -0.02, 0.058),
                               ('Q', -0.07, 0.058, -0.08, 0.04)], 0.046, M['paint'], bevel=0.0025)
    # magwell / ejection port (right side = -Y) and lightening dimple
    cut(rec, cutter_box((0.075, 0.02, 0.018), (0.09, -0.023, 0.042)))
    cut(rec, cutter_box((0.022, 0.006, 0.012), (0.2, 0.024, 0.03)))
    # dust cover with stiffening ribs
    dc = extrude('dustcover', [('M', -0.06, 0.056), ('L', 0.21, 0.056), ('Q', 0.215, 0.07, 0.2, 0.074), ('L', -0.03, 0.074), ('Q', -0.06, 0.072, -0.06, 0.056)],
                 0.042, M['paint'], bevel=0.004)
    for i, x in enumerate((0.0, 0.05, 0.1, 0.15)):
        box(f'dcrib{i}', (0.006, 0.043, 0.004), (x, 0, 0.073), M['paint'], bevel=0.0012)
    # bolt carrier visible through the port + charging handle
    box('carrier', (0.07, 0.006, 0.014), (0.09, -0.019, 0.042), M['steel'], bevel=0.001)
    cyl('charging', 0.004, 0.03, (0.13, -0.035, 0.042), M['steel'], axis='Y')
    sphere('charging_knob', 0.0055, (0.13, -0.05, 0.042), M['steel'])
    # selector lever (right side)
    sel = extrude('selector', [('M', -0.05, 0.035), ('L', 0.09, 0.03), ('L', 0.095, 0.022), ('L', 0.0, 0.022), ('L', -0.05, 0.028)], 0.003, M['steel'], y=-0.0255, bevel=0.0007)
    cyl('selector_pivot', 0.005, 0.004, (-0.045, -0.025, 0.031), M['steel'], axis='Y')
    rivets('rivet', [(-0.055, 0.008), (-0.005, 0.008), (0.17, 0.008), (0.215, 0.008), (0.215, 0.04), (0.03, 0.002)], M)
    # rear sight block + leaf
    extrude('rs_block', [('M', 0.22, 0.072), ('L', 0.285, 0.072), ('L', 0.285, 0.082), ('L', 0.235, 0.09), ('L', 0.22, 0.086)], 0.03, M['dark'], bevel=0.0015)
    extrude('rs_leaf', [('M', 0.23, 0.088), ('L', 0.29, 0.084), ('L', 0.29, 0.088), ('L', 0.235, 0.093)], 0.018, M['dark'], bevel=0.0006)
    # stock: wood with buttplate and sling loop
    stock = extrude('stock', [('M', -0.07, 0.042), ('L', -0.37, 0.022), ('Q', -0.405, 0.02, -0.41, -0.005), ('L', -0.415, -0.1),
                              ('Q', -0.41, -0.118, -0.39, -0.116), ('L', -0.13, -0.04), ('Q', -0.09, -0.028, -0.07, -0.006)], 0.042, M['wood'], bevel=0.007, bevel_segs=4)
    extrude('buttplate', [('M', -0.408, 0.017), ('L', -0.421, 0.017), ('L', -0.426, -0.109), ('L', -0.412, -0.116)], 0.044, M['dark'], bevel=0.003)
    torus('sling_rear', 0.008, 0.0016, (-0.3, 0, -0.085), M['steel'], rot=(0, 0, 0))
    # pistol grip with finger grooves
    grip = extrude('grip', [('M', -0.03, -0.006), ('L', 0.005, -0.006), ('Q', -0.005, -0.06, -0.025, -0.115), ('Q', -0.035, -0.128, -0.055, -0.122),
                            ('L', -0.062, -0.116), ('Q', -0.045, -0.06, -0.03, -0.006)], 0.032, M['wood'], bevel=0.007, bevel_segs=4)
    for i in range(4):
        cut(grip, cutter_box((0.003, 0.04, 0.008), (-0.006 - i * 0.004, 0, -0.03 - i * 0.02), rot=(0, 0.35, 0)))
    trigger_group(M, 0.005, 0.07, -0.006, 0.034, M['paint'])
    # curved magazine with ribs and floor plate
    mag = extrude('mag', [('M', 0.082, -0.008), ('L', 0.14, -0.008), ('Q', 0.158, -0.11, 0.215, -0.205), ('L', 0.17, -0.232),
                          ('Q', 0.115, -0.13, 0.082, -0.008)], 0.034, M['paint'], bevel=0.0035)
    # ribs follow the magazine's curved centre line
    def qb(p0, c, p1, t):
        u = 1 - t
        return (u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1])
    def centre(t):
        f = qb((0.14, -0.008), (0.158, -0.11), (0.215, -0.205), t)
        b = qb((0.082, -0.008), (0.115, -0.13), (0.17, -0.232), t)
        return ((f[0] + b[0]) / 2, (f[1] + b[1]) / 2), math.hypot(f[0] - b[0], f[1] - b[1])
    for i, t in enumerate((0.28, 0.48, 0.68, 0.98)):
        (cx, cz), span = centre(t)
        (ax, az), _ = centre(t + 0.01)
        tx, tz = ax - cx, az - cz
        nx, nz = tz, -tx
        ang = math.atan2(-nz, nx)
        r = box('magrib%d' % i if i < 3 else 'mag_floor', (span + 0.004, 0.037 if i < 3 else 0.039, 0.004 if i < 3 else 0.007), (cx, 0, cz), M['paint'], bevel=0.0012, rot=(0, ang, 0))
        r.parent = mag
    # lower handguard with finger groove and vent slots
    lhg = extrude('lower_hg', [('M', 0.235, -0.012), ('L', 0.44, -0.004), ('Q', 0.455, 0.0, 0.455, 0.018), ('L', 0.455, 0.045), ('L', 0.235, 0.045)],
                  0.052, M['wood'], bevel=0.009, bevel_segs=4)
    cut(lhg, cutter_box((0.18, 0.06, 0.004), (0.345, 0, 0.004)))
    for i in range(3):
        box(f'hg_band{i}', (0.006, 0.054, 0.05), (0.24 + i * 0.1, 0, 0.018), M['dark'], bevel=0.0012) if i == 0 else None
    # upper handguard + gas tube with vents
    extrude('upper_hg', [('M', 0.24, 0.05), ('L', 0.43, 0.05), ('Q', 0.445, 0.07, 0.43, 0.08), ('L', 0.25, 0.08), ('Q', 0.235, 0.068, 0.24, 0.05)],
            0.038, M['wood'], bevel=0.009, bevel_segs=4)
    gt = tube('gas_tube', 0.43, 0.53, 0.011, M['dark'], z=0.066)
    for i in range(3):
        cut(gt, cutter_cyl(0.0035, 0.04, (0.45 + i * 0.022, 0, 0.066)))
    # gas block, front sight base with hood, bayonet lug
    extrude('gas_block', [('M', 0.52, 0.018), ('L', 0.555, 0.018), ('L', 0.555, 0.078), ('L', 0.53, 0.078), ('L', 0.52, 0.06)], 0.024, M['dark'], bevel=0.002)
    extrude('fsb', [('M', 0.635, 0.018), ('L', 0.665, 0.018), ('L', 0.66, 0.06), ('L', 0.65, 0.083), ('L', 0.64, 0.083), ('L', 0.635, 0.06)], 0.022, M['dark'], bevel=0.002)
    torus('fs_hood', 0.012, 0.0018, (0.652, 0, 0.078), M['dark'], rot=(0, PI / 2, 0))
    box('fs_post', (0.003, 0.003, 0.014), (0.652, 0, 0.078), M['dark'], bevel=0)
    # barrel, cleaning rod, muzzle brake with slanted slot
    tube('barrel', 0.44, 0.7, 0.0105, M['dark'], z=0.03)
    tube('cleaning_rod', 0.44, 0.66, 0.0028, M['steel'], z=0.012)
    mb = lathe('muzzle_brake', [(0.69, 0.0001), (0.69, 0.0135), (0.692, 0.0145), (0.735, 0.0145), (0.742, 0.012), (0.742, 0.006), (0.742, 0.0001)], M['dark'], z=0.03)
    cut(mb, cutter_box((0.02, 0.03, 0.02), (0.73, 0, 0.045), rot=(0, 0.5, 0)))
    cut(mb, cutter_cyl(0.0045, 0.06, (0.72, 0, 0.03), axis='X'))
    empty('muzzle', (0.745, 0, 0.03))
    empty('grip', (-0.025, 0, -0.05))
    empty('fore', (0.33, 0, 0.0))


# ================================================================ M4A1
def m4a1():
    M = mats()
    up = extrude('upper', [('M', -0.06, 0.02), ('L', 0.175, 0.02), ('L', 0.175, 0.075), ('L', -0.05, 0.075), ('Q', -0.06, 0.07, -0.06, 0.055)], 0.05, M['paint'], bevel=0.003)
    cut(up, cutter_box((0.065, 0.02, 0.02), (0.07, -0.025, 0.045)))   # ejection port
    box('dust_door', (0.062, 0.003, 0.018), (0.07, -0.027, 0.045), M['dark'], bevel=0.0008)
    box('bolt_face', (0.06, 0.006, 0.014), (0.07, -0.021, 0.045), M['steel'], bevel=0.001)
    # brass deflector + forward assist
    extrude('deflector', [('M', 0.02, 0.05), ('L', 0.04, 0.05), ('L', 0.035, 0.07), ('L', 0.02, 0.07)], 0.012, M['paint'], y=-0.031, bevel=0.002)
    cyl('fwd_assist', 0.008, 0.024, (0.0, -0.03, 0.058), M['dark'], axis='Y', bevel=0.001)
    # picatinny rail with real slots
    rail = extrude('rail', [('M', -0.055, 0.075), ('L', 0.175, 0.075), ('L', 0.175, 0.083), ('L', -0.055, 0.083)], 0.022, M['paint'], bevel=0.0008)
    for i in range(22):
        cut(rail, cutter_box((0.0052, 0.03, 0.006), (-0.05 + i * 0.0102, 0, 0.084)))
    # lower receiver with magwell flare, bolt catch, mag release
    lo = extrude('lower', [('M', -0.06, 0.022), ('L', 0.135, 0.022), ('L', 0.135, -0.012), ('L', 0.118, -0.042), ('L', 0.047, -0.042),
                           ('L', 0.043, -0.015), ('L', -0.035, -0.012), ('Q', -0.06, -0.01, -0.06, 0.01)], 0.048, M['paint'], bevel=0.003)
    cut(lo, cutter_box((0.06, 0.06, 0.03), (0.082, 0, -0.035)))
    box('magwell_flare', (0.075, 0.052, 0.006), (0.083, 0, -0.04), M['paint'], bevel=0.0015)
    box('bolt_catch', (0.012, 0.004, 0.018), (0.035, 0.026, 0.01), M['dark'], bevel=0.0008)
    cyl('mag_release', 0.005, 0.006, (0.04, -0.026, 0.0), M['dark'], axis='Y')
    cyl('selector', 0.0055, 0.004, (-0.03, 0.026, 0.008), M['dark'], axis='Y')
    box('selector_lever', (0.018, 0.003, 0.005), (-0.025, 0.028, 0.008), M['dark'], bevel=0.0006, rot=(0, -0.4, 0))
    rivets('pin', [(-0.045, 0.012), (0.12, 0.01), (0.003, 0.002), (0.025, 0.002)], M, r=0.003, y=0.0245)
    # charging handle (T)
    extrude('charging', [('M', -0.075, 0.07), ('L', -0.04, 0.07), ('L', -0.04, 0.079), ('L', -0.075, 0.079)], 0.044, M['dark'], bevel=0.0015)
    # buffer tube + adjustable stock with castle nut
    tube('buffer_tube', -0.27, -0.055, 0.016, M['dark'], z=0.045)
    lathe('castle_nut', [(-0.07, 0.0001), (-0.07, 0.019), (-0.06, 0.019), (-0.06, 0.0001)], M['dark'], z=0.045, segs=12)
    st = extrude('stock', [('M', -0.17, 0.068), ('L', -0.3, 0.068), ('Q', -0.315, 0.066, -0.318, 0.05), ('L', -0.322, -0.07),
                           ('Q', -0.31, -0.08, -0.295, -0.07), ('L', -0.2, 0.0), ('Q', -0.175, 0.02, -0.17, 0.04)], 0.046, M['poly'], bevel=0.006, bevel_segs=4)
    # lightening slot through the stock web
    cut(st, extrude('cutter', [('M', -0.215, 0.0), ('L', -0.29, 0.045), ('L', -0.3, 0.045), ('L', -0.305, -0.04), ('L', -0.29, -0.05)], 0.1, None, bevel=0))
    extrude('buttpad', [('M', -0.318, 0.06), ('L', -0.333, 0.06), ('L', -0.337, -0.073), ('L', -0.322, -0.076)], 0.048, M['rubber'], bevel=0.004)
    # pistol grip with finger groove + texture bands
    g = extrude('grip', [('M', -0.022, -0.012), ('L', 0.008, -0.012), ('Q', 0.0, -0.06, -0.012, -0.112), ('Q', -0.018, -0.124, -0.04, -0.12),
                         ('L', -0.048, -0.112), ('Q', -0.04, -0.08, -0.03, -0.06), ('Q', -0.034, -0.04, -0.022, -0.012)], 0.03, M['polymer'], bevel=0.006, bevel_segs=4)
    for i in range(5):
        cut(g, cutter_box((0.05, 0.032, 0.0018), (-0.02, 0, -0.04 - i * 0.012), rot=(0, 0.35, 0)))
    trigger_group(M, 0.008, 0.06, -0.01, 0.03, M['paint'])
    # STANAG magazine with ribs and floor plate
    mag = extrude('mag', [('M', 0.052, -0.035), ('L', 0.112, -0.035), ('Q', 0.122, -0.12, 0.135, -0.195), ('L', 0.078, -0.205), ('Q', 0.064, -0.12, 0.052, -0.035)],
                  0.028, M['paint'], bevel=0.0025)
    for i in range(3):
        r = box(f'magrib{i}', (0.003, 0.03, 0.12), (0.075 + i * 0.012, 0, -0.12), M['paint'], bevel=0.0008, rot=(0, -0.12, 0)); r.parent = mag
    fp = box('mag_floor', (0.064, 0.032, 0.007), (0.107, 0, -0.203), M['polymer'], bevel=0.002, rot=(0, -0.15, 0)); fp.parent = mag
    # ribbed handguard with vent holes + delta ring
    prof = [(0.175, 0.0001), (0.175, 0.031)]
    for i in range(13):
        x = 0.182 + i * 0.0175
        prof += [(x, 0.029), (x + 0.007, 0.0315), (x + 0.0145, 0.029)]
    prof += [(0.41, 0.031), (0.41, 0.0001)]
    hg = lathe('handguard', prof, M['paint'], z=0.042, segs=28)
    for i in range(6):
        for a in (0.6, -0.6):
            cut(hg, cutter_cyl(0.0035, 0.03, (0.2 + i * 0.035, 0.03 * math.sin(a) * 0 + (0.03 if a > 0 else -0.03), 0.03), axis='Y'))
    lathe('delta_ring', [(0.165, 0.0001), (0.165, 0.034), (0.18, 0.036), (0.18, 0.0001)], M['dark'], z=0.042)
    # front sight base with protective ears, sling swivel
    fsb = extrude('fsb', [('M', 0.405, 0.02), ('L', 0.44, 0.02), ('L', 0.44, 0.058), ('L', 0.433, 0.06), ('L', 0.43, 0.118), ('L', 0.416, 0.118),
                          ('L', 0.413, 0.06), ('L', 0.405, 0.058)], 0.026, M['dark'], bevel=0.002)
    cut(fsb, cutter_box((0.008, 0.03, 0.03), (0.4225, 0, 0.1)))
    box('fs_post', (0.003, 0.003, 0.03), (0.4225, 0, 0.095), M['dark'], bevel=0)
    torus('sling_front', 0.008, 0.0015, (0.425, 0, 0.005), M['steel'], rot=(0, 0, 0))
    # flip-up rear sight on the rail
    extrude('rear_sight', [('M', -0.03, 0.083), ('L', 0.0, 0.083), ('L', -0.004, 0.112), ('L', -0.024, 0.112)], 0.026, M['dark'], bevel=0.0015)
    # barrel + birdcage flash hider with real slots
    tube('barrel', 0.41, 0.58, 0.0095, M['dark'], z=0.042)
    fh = lathe('flash_hider', [(0.575, 0.0001), (0.575, 0.012), (0.58, 0.0128), (0.625, 0.0128), (0.63, 0.011), (0.63, 0.0001)], M['dark'], z=0.042)
    cut(fh, cutter_cyl(0.0055, 0.08, (0.6, 0, 0.042), axis='X'))
    for i in range(5):
        a = i / 5 * PI * 2 + 0.3
        cut(fh, cutter_box((0.03, 0.004, 0.03), (0.61, math.cos(a) * 0.012, 0.042 + math.sin(a) * 0.012), rot=(a, 0, 0)))
    empty('muzzle', (0.635, 0, 0.042))
    empty('grip', (-0.02, 0, -0.05))
    empty('fore', (0.29, 0, 0.015))


# ================================================================ AWP-style bolt rifle
def awp():
    M = mats()
    body = extrude('chassis', [
        ('M', 0.32, 0.03), ('L', -0.12, 0.03), ('L', -0.14, 0.05), ('Q', -0.3, 0.068, -0.62, 0.062), ('Q', -0.64, 0.06, -0.642, 0.04),
        ('L', -0.65, -0.11), ('Q', -0.64, -0.13, -0.62, -0.126), ('L', -0.3, -0.06), ('Q', -0.2, -0.045, -0.17, -0.1), ('L', -0.15, -0.13),
        ('Q', -0.13, -0.142, -0.105, -0.13), ('L', -0.07, -0.04), ('L', 0.32, -0.035), ('Q', 0.335, -0.03, 0.335, 0.0), ('L', 0.335, 0.015), ('Q', 0.333, 0.03, 0.32, 0.03)],
        0.064, M['tan'], bevel=0.009, bevel_segs=4)
    thumb = extrude('cutter', [('M', -0.25, 0.03), ('Q', -0.2, 0.04, -0.15, 0.025), ('Q', -0.13, 0.0, -0.15, -0.03), ('Q', -0.2, -0.035, -0.25, -0.03), ('Q', -0.27, 0.0, -0.25, 0.03)], 0.2, None, bevel=0)
    cut(body, thumb)
    # forend vent slots + stippling bands
    for i in range(4):
        cut(body, cutter_box((0.03, 0.08, 0.012), (0.12 + i * 0.05, 0, -0.012)))
    extrude('buttpad', [('M', -0.64, 0.058), ('L', -0.665, 0.058), ('L', -0.675, -0.118), ('L', -0.648, -0.124)], 0.066, M['rubber'], bevel=0.005)
    extrude('cheek', [('M', -0.33, 0.065), ('L', -0.58, 0.064), ('Q', -0.6, 0.075, -0.58, 0.09), ('L', -0.36, 0.088), ('Q', -0.33, 0.08, -0.33, 0.065)], 0.05, M['tan'], bevel=0.008)
    cyl('cheek_knob', 0.007, 0.012, (-0.45, -0.032, 0.075), M['dark'], axis='Y')
    trigger_group(M, -0.075, -0.015, -0.035, 0.032, M['tan'])
    # receiver, bolt shroud, bolt handle
    rec = tube('receiver', -0.13, 0.17, 0.024, M['dark'], z=0.052)
    cut(rec, cutter_box((0.08, 0.03, 0.02), (0.03, -0.022, 0.06)))
    tube('bolt_shroud', -0.165, -0.12, 0.016, M['steel'], z=0.052)
    import bpy as _b
    bolt = empty('bolt', (-0.09, 0, 0.05))
    stem = cyl('bolt_stem', 0.0045, 0.055, (0, -0.028, 0), M['steel'], axis='Y'); stem.parent = bolt
    knob = sphere('bolt_knob', 0.01, (0, -0.058, -0.004), M['dark']); knob.parent = bolt
    bolt.rotation_euler = (-0.4, 0, 0)
    # magazine + release
    extrude('mag', [('M', -0.03, -0.035), ('L', 0.06, -0.035), ('L', 0.058, -0.088), ('L', -0.028, -0.088)], 0.044, M['dark'], bevel=0.003)
    # fluted barrel and muzzle brake with ports
    bar = lathe('barrel', [(0.16, 0.0001), (0.16, 0.018), (0.25, 0.0165), (0.7, 0.0125), (0.7, 0.0001)], M['dark'], z=0.052, segs=36)
    for i in range(6):
        a = i / 6 * PI * 2
        cut(bar, cutter_box((0.32, 0.004, 0.004), (0.45, math.cos(a) * 0.0145, 0.052 + math.sin(a) * 0.0145), rot=(a, 0, 0)))
    mb = lathe('muzzle_brake', [(0.695, 0.0001), (0.695, 0.02), (0.78, 0.02), (0.785, 0.017), (0.785, 0.0001)], M['dark'], z=0.052)
    for i in range(3):
        cut(mb, cutter_box((0.012, 0.06, 0.03), (0.72 + i * 0.022, 0, 0.052)))
    cut(mb, cutter_cyl(0.007, 0.2, (0.74, 0, 0.052), axis='X'))
    # bipod stud, sling studs
    cyl('stud_front', 0.004, 0.012, (0.29, 0, -0.04), M['steel'], axis='Z')
    torus('sling_rear', 0.009, 0.0018, (-0.5, 0, -0.105), M['steel'], rot=(0, 0, 0))
    # scope: tube, bells, turrets, rings, lens caps
    sy = 0.128
    lathe('scope', [(-0.17, 0.0001), (-0.17, 0.023), (-0.12, 0.024), (-0.1, 0.0158), (0.17, 0.0158), (0.21, 0.029), (0.27, 0.03), (0.27, 0.0001)], M['paint'], z=sy, segs=40)
    lathe('eyepiece_ring', [(-0.15, 0.0001), (-0.15, 0.0245), (-0.14, 0.0245), (-0.14, 0.0001)], M['rubber'], z=sy, segs=40)
    box('turret_base', (0.05, 0.036, 0.036), (0.03, 0, sy), M['paint'], bevel=0.005)
    for name, loc, axis in (('turret_top', (0.03, 0, sy + 0.026), 'Z'), ('turret_side', (0.03, -0.026, sy), 'Y'), ('turret_par', (0.03, 0.026, sy), 'Y')):
        t = cyl(name, 0.013, 0.022, loc, M['dark'], axis=axis, segs=28)
        for k in range(16):
            a = k / 16 * PI * 2
            if axis == 'Z':
                cut(t, cutter_box((0.002, 0.002, 0.03), (loc[0] + math.cos(a) * 0.0135, math.sin(a) * 0.0135, loc[2])))
    for i, x in enumerate((-0.06, 0.12)):
        lathe(f'ring{i}', [(x - 0.011, 0.0001), (x - 0.011, 0.021), (x + 0.011, 0.021), (x + 0.011, 0.0001)], M['dark'], z=sy)
        box(f'ring_base{i}', (0.022, 0.03, sy - 0.062), (x, 0, (sy + 0.062) / 2), M['dark'], bevel=0.003)
        cyl(f'ring_bolt{i}', 0.004, 0.036, (x, 0, sy + 0.012), M['steel'], axis='Y')
    lens_f = cyl('lens_front', 0.027, 0.002, (0.268, 0, sy), M['lens'], axis='X', segs=40)
    lens_b = cyl('lens_back', 0.02, 0.002, (-0.168, 0, sy), M['lens'], axis='X', segs=40)
    empty('muzzle', (0.79, 0, 0.052))
    empty('grip', (-0.12, 0, -0.06))
    empty('fore', (0.2, 0, -0.01))


# ================================================================ pistols
def pistol(len_, slide_h, frame_len, rake, grip_len, slide_mat_key='paint', rounded=False, deagle=False):
    M = mats()
    stop = 0.016 + slide_h
    slide = extrude('slide', [('M', -0.03, 0.016), ('L', len_, 0.016), ('L', len_, stop - 0.006), ('Q', len_, stop, len_ - 0.008, stop),
                              ('L', -0.024, stop), ('Q', -0.03, stop, -0.03, stop - 0.006)], 0.028, M[slide_mat_key], bevel=0.006 if rounded else 0.003, bevel_segs=4)
    # rear + front cocking serrations
    for i in range(7):
        cut(slide, cutter_box((0.0018, 0.04, slide_h * 0.8), (-0.022 + i * 0.0045, 0, 0.016 + slide_h * 0.45)))
    for i in range(4):
        cut(slide, cutter_box((0.0018, 0.04, slide_h * 0.6), (len_ - 0.03 + i * 0.0045, 0, 0.016 + slide_h * 0.4)))
    cut(slide, cutter_box((0.032, 0.012, slide_h * 0.5), (0.045, -0.012, 0.016 + slide_h * 0.65)))  # ejection port
    cut(slide, cutter_cyl(0.0055, 0.02, (len_, 0, 0.03), axis='X'))
    sp = box('front_sight', (0.006, 0.004, 0.006), (len_ - 0.01, 0, stop + 0.003), M['dark'], bevel=0.001); sp.parent = slide
    rs = box('rear_sight', (0.008, 0.016, 0.006), (-0.018, 0, stop + 0.003), M['dark'], bevel=0.001); rs.parent = slide
    for o in ('front_sight', 'rear_sight'):
        pass
    br = tube('barrel_hood', 0.03, 0.06, 0.009, M['steel'], z=stop - 0.008); br.parent = slide
    # frame with dust-cover rail
    fr = extrude('frame', [('M', -0.03, 0.018), ('L', frame_len, 0.018), ('L', frame_len, 0.004), ('L', 0.05, 0.0), ('L', 0.0, -0.002),
                           ('L', -0.035, 0.004), ('Q', -0.04, 0.012, -0.03, 0.018)], 0.026, M['poly'], bevel=0.003)
    for i in range(3):
        cut(fr, cutter_box((0.005, 0.04, 0.004), (frame_len - 0.012 - i * 0.012, 0, 0.004)))
    # grip with stippling bands, mag well, magazine base plate
    bx, gl = -0.004, grip_len
    g = extrude('grip', [('M', bx, 0.0), ('Q', bx - gl * rake * 0.4, -gl * 0.5, bx - gl * rake, -gl), ('L', bx - gl * rake - 0.036, -gl),
                         ('Q', bx - gl * rake - 0.042, -gl * 0.5, -0.038, 0.004), ('L', bx, 0.0)], 0.03, M['poly'], bevel=0.006, bevel_segs=4)
    # shallow texture grooves on both grip panels
    for i in range(7):
        t = 0.18 + i * 0.1
        for side in (-1, 1):
            cut(g, cutter_box((0.03, 0.004, 0.0016), (bx - 0.019 - gl * rake * t, side * 0.0155, -gl * t), rot=(0, -rake, 0)))
    mag = box('mag', (0.036, 0.03, 0.009), (bx - gl * rake - 0.018, 0, -gl - 0.004), M['dark'], bevel=0.002)
    trigger_group(M, -0.002, 0.045, -0.002, 0.026, M['poly'])
    cyl('slide_stop', 0.003, 0.004, (0.03, 0.015, 0.012), M['steel'], axis='Y')
    box('takedown', (0.01, 0.004, 0.004), (0.035, 0.015, 0.006), M['dark'], bevel=0.0008)
    box('hammer', (0.01, 0.008, 0.014), (-0.034, 0, stop - 0.002), M['dark'], bevel=0.001, rot=(0, -0.3, 0)) if deagle or rounded else None
    return M, stop


def glock():
    M, top = pistol(0.16, 0.034, 0.14, 0.32, 0.1)
    empty('muzzle', (0.165, 0, 0.03)); empty('grip', (-0.02, 0, -0.04))


def usp():
    M, top = pistol(0.165, 0.032, 0.15, 0.28, 0.102, rounded=True)
    sup = lathe('suppressor', [(0.165, 0.0001), (0.165, 0.012), (0.172, 0.0175), (0.33, 0.0175), (0.336, 0.014), (0.336, 0.0001)], M['paint'], z=0.03, segs=36)
    for i in range(10):
        lathe(f'sup_ring{i}', [(0.18 + i * 0.015, 0.0001), (0.18 + i * 0.015, 0.0179), (0.183 + i * 0.015, 0.0179), (0.183 + i * 0.015, 0.0001)], M['dark'], z=0.03, segs=36)
    empty('muzzle', (0.34, 0, 0.03)); empty('grip', (-0.02, 0, -0.04))


def deagle():
    M, top = pistol(0.2, 0.046, 0.19, 0.2, 0.11, slide_mat_key='steel', deagle=True)
    rib = extrude('top_rib', [('M', 0.06, 0.062), ('L', 0.2, 0.062), ('L', 0.2, 0.072), ('L', 0.075, 0.072)], 0.012, M['steel'], bevel=0.0015)
    for i in range(10):
        cut(rib, cutter_box((0.003, 0.02, 0.004), (0.08 + i * 0.012, 0, 0.073)))
    for i in range(3):
        box(f'port{i}', (0.012, 0.03, 0.004), (0.12 + i * 0.022, 0, 0.05), M['dark'], bevel=0.001)
    empty('muzzle', (0.2, 0, 0.038)); empty('grip', (-0.02, 0, -0.045))


# ================================================================ knives
def handle_wrap(M, x0, x1, h, w, mat, wrap, turns):
    extrude('handle', [('M', x0, h / 2), ('L', x1, h / 2), ('Q', x1 + 0.006, 0, x1, -h / 2), ('L', x0, -h / 2), ('Q', x0 - 0.008, 0, x0, h / 2)], w, mat, bevel=w * 0.4, bevel_segs=4)
    for i in range(turns):
        x = x0 + (i + 0.5) * (x1 - x0) / turns
        box(f'wrap{i}', (0.008, w + 0.003, h + 0.003), (x, 0, 0), wrap, bevel=0.003, rot=(0, 0.35, 0))


def edge_below(z_line):
    """Points below z_line(x) are on the sharpened edge."""
    return lambda x, z: z < z_line(x)


KNIVES = {}

def knife(fn):
    KNIVES[fn.__name__] = fn
    return fn


@knife
def standard():
    M = mats()
    blade('blade', [('M', 0.02, 0.012), ('L', 0.15, 0.012), ('Q', 0.19, 0.008, 0.215, -0.004), ('Q', 0.16, -0.018, 0.02, -0.014)], edge_below(lambda x: 0.0 if x < 0.15 else 0.006), 0.0045, M['blade'])
    box('guard', (0.012, 0.02, 0.042), (0.016, 0, 0), M['dark'], bevel=0.003)
    extrude('handle', [('M', 0.012, 0.014), ('L', -0.1, 0.012), ('Q', -0.11, 0, -0.1, -0.014), ('L', 0.012, -0.015)], 0.022, M['polymer'], bevel=0.008, bevel_segs=4)
    for i in range(6):
        box(f'grip{i}', (0.003, 0.024, 0.026), (-0.08 + i * 0.012, 0, 0), M['rubber'], bevel=0.001)
    return 0.215


@knife
def bayonet():
    M = mats()
    blade('blade', [('M', 0.02, 0.013), ('L', 0.17, 0.013), ('L', 0.2, 0.002), ('Q', 0.215, -0.002, 0.225, -0.004), ('Q', 0.17, -0.02, 0.02, -0.016)],
          edge_below(lambda x: 0.0 if x < 0.17 else 0.004), 0.005, M['blade'])
    b = blade('fuller', [('M', 0.04, 0.009), ('L', 0.15, 0.009), ('L', 0.15, 0.004), ('L', 0.04, 0.004)], lambda x, z: False, 0.0056, M['steel'])
    extrude('guard', [('M', 0.012, 0.03), ('L', 0.022, 0.03), ('L', 0.022, -0.026), ('L', 0.012, -0.026)], 0.024, M['dark'], bevel=0.003)
    torus('muzzle_ring', 0.009, 0.0025, (0.017, 0, 0.03), M['dark'], rot=(0, PI / 2, 0))
    handle_wrap(M, -0.1, 0.012, 0.028, 0.024, M['polymer'], M['rubber'], 6)
    box('pommel', (0.012, 0.026, 0.03), (-0.104, 0, 0), M['steel'], bevel=0.004)
    return 0.225


@knife
def combat():
    M = mats()
    teeth = []
    x = 0.12
    while x > 0.05:
        teeth += [('L', x, 0.019), ('L', x - 0.005, 0.014)]
        x -= 0.01
    bl = blade('blade', [('M', 0.02, -0.018), ('Q', 0.17, -0.02, 0.23, 0.0), ('L', 0.2, 0.014), ('L', 0.13, 0.014)] + teeth + [('L', 0.02, 0.014)],
               edge_below(lambda x: -0.004), 0.006, M['blade'])
    cut(bl, cutter_cyl(0.008, 0.03, (0.055, 0, -0.002), axis='Y'))
    extrude('guard', [('M', 0.008, 0.032), ('Q', 0.02, 0.028, 0.02, 0.0), ('L', 0.02, -0.03), ('L', 0.008, -0.03)], 0.026, M['dark'], bevel=0.003)
    handle_wrap(M, -0.11, 0.01, 0.03, 0.026, M['polymer'], M['rubber'], 8)
    return 0.23


@knife
def karambit():
    M = mats()
    piv = empty('karambitPivot', (0, 0, 0))
    b = blade('blade', [('M', 0.015, 0.012), ('Q', 0.09, 0.03, 0.13, -0.02), ('Q', 0.14, -0.05, 0.12, -0.075), ('Q', 0.11, -0.04, 0.085, -0.022), ('Q', 0.05, -0.004, 0.015, -0.012)],
              lambda x, z: z < -0.006 and not (x > 0.11 and z > -0.03), 0.005, M['blade'])
    h = extrude('handle', [('M', 0.016, 0.014), ('Q', -0.04, 0.02, -0.07, 0.0), ('L', -0.075, -0.012), ('Q', -0.04, 0.0, 0.016, -0.014)], 0.022, M['polymer'], bevel=0.006, bevel_segs=4)
    ring = torus('ring', 0.019, 0.0065, (-0.088, 0, -0.012), M['dark'])
    for i, o in enumerate((b, h, ring)):
        o.parent = piv
    for o in (b, h, ring):
        o.location.x += 0.03
    for i in range(3):
        cyl(f'screw{i}', 0.003, 0.024, (0.03 - i * 0.03 + 0.03, 0, 0.002), M['steel'], axis='Y').parent = piv
    return 0.17


@knife
def butterfly():
    M = mats()
    blade('blade', [('M', 0.0, 0.01), ('L', 0.15, 0.01), ('Q', 0.18, 0.008, 0.2, -0.002), ('Q', 0.15, -0.015, 0.0, -0.012)], edge_below(lambda x: 0.0), 0.005, M['blade'])
    for name, side in (('bfA', 1), ('bfB', -1)):
        piv = empty(name, (0.003, 0, 0))
        hz = -0.0005 if side > 0 else -0.0125
        h = extrude(f'{name}_handle', [('M', 0.0, hz), ('L', -0.125, hz), ('Q', -0.132, hz + 0.007, -0.125, hz + 0.013), ('L', 0.0, hz + 0.013)], 0.008, M['steel'], y=side * 0.0065, bevel=0.002)
        for k, (a, bnd) in enumerate(((-0.02, -0.05), (-0.065, -0.1))):
            cut(h, cutter_box((abs(bnd - a), 0.02, 0.005), ((a + bnd) / 2, side * 0.0065, hz + 0.0065)))
        h.parent = piv
        h.location.x -= 0.003
        pin = cyl(f'{name}_pin', 0.0022, 0.022, (-0.118, 0, hz + 0.0065), M['brass'], axis='Y'); pin.parent = piv
    latch = box('latch', (0.03, 0.002, 0.004), (-0.11, 0, -0.006), M['steel'], bevel=0.0005)
    cyl('pivot_pin', 0.004, 0.022, (0.003, 0, 0), M['brass'], axis='Y')
    return 0.2


@knife
def flip():
    M = mats()
    b = blade('blade', [('M', 0.012, 0.012), ('L', 0.12, 0.014), ('Q', 0.17, 0.01, 0.19, -0.004), ('Q', 0.14, -0.02, 0.012, -0.014)], edge_below(lambda x: -0.002), 0.005, M['blade'])
    cut(b, cutter_cyl(0.005, 0.03, (0.035, 0, 0.004), axis='Y'))
    h = extrude('handle', [('M', 0.016, 0.014), ('L', -0.095, 0.012), ('Q', -0.108, 0.0, -0.095, -0.014), ('L', 0.016, -0.016), ('Q', 0.024, 0.0, 0.016, 0.014)], 0.02, M['polymer'], bevel=0.006)
    for i in range(5):
        cut(h, cutter_box((0.008, 0.03, 0.002), (-0.08 + i * 0.016, 0, 0.0), rot=(0, 0.7, 0)))
    cyl('pivot', 0.0045, 0.022, (0.008, 0, 0), M['steel'], axis='Y')
    box('clip', (0.07, 0.002, 0.008), (-0.05, -0.0115, 0.006), M['steel'], bevel=0.0008)
    return 0.19


@knife
def gut():
    M = mats()
    blade('blade', [('M', 0.012, 0.014), ('L', 0.08, 0.016), ('Q', 0.09, 0.0, 0.1, 0.012), ('L', 0.11, 0.02), ('Q', 0.16, 0.02, 0.185, -0.002), ('Q', 0.13, -0.022, 0.012, -0.016)],
          lambda x, z: z < -0.004 or (0.08 < x < 0.1 and z < 0.012 and z > 0.0), 0.005, M['blade'])
    handle_wrap(M, -0.1, 0.012, 0.028, 0.022, M['polymer'], M['rubber'], 5)
    box('guard', (0.01, 0.024, 0.034), (0.012, 0, 0), M['dark'], bevel=0.003)
    return 0.185


@knife
def bowie():
    M = mats()
    blade('blade', [('M', 0.02, 0.016), ('L', 0.17, 0.016), ('L', 0.21, 0.008), ('Q', 0.24, 0.002, 0.255, -0.002), ('Q', 0.2, -0.026, 0.02, -0.02)],
          lambda x, z: z < -0.004 or (x > 0.17 and z < 0.01 and z > 0.0), 0.006, M['blade'])
    extrude('guard', [('M', 0.012, 0.03), ('Q', 0.02, 0.034, 0.024, 0.03), ('L', 0.024, -0.034), ('Q', 0.02, -0.038, 0.012, -0.034)], 0.024, M['brass'], bevel=0.003)
    extrude('handle', [('M', 0.012, 0.016), ('Q', -0.05, 0.022, -0.105, 0.014), ('Q', -0.118, 0.0, -0.105, -0.02), ('Q', -0.05, -0.022, 0.012, -0.02)], 0.024, M['woodd'], bevel=0.008, bevel_segs=4)
    for i, x in enumerate((-0.07, -0.025)):
        cyl(f'rivet{i}', 0.0035, 0.026, (x, 0, -0.002), M['brass'], axis='Y')
    box('pommel', (0.012, 0.026, 0.036), (-0.11, 0, -0.003), M['brass'], bevel=0.005)
    return 0.255


@knife
def push():
    M = mats()
    blade('blade', [('M', 0.0, 0.016), ('L', 0.06, 0.012), ('Q', 0.1, 0.004, 0.12, 0.0), ('Q', 0.1, -0.004, 0.06, -0.012), ('L', 0.0, -0.016)], lambda x, z: x > 0.02, 0.005, M['blade'])
    extrude('t_handle', [('M', -0.012, 0.045), ('Q', 0.004, 0.05, 0.004, 0.03), ('L', 0.004, -0.03), ('Q', 0.004, -0.05, -0.012, -0.045), ('Q', -0.022, 0, -0.012, 0.045)], 0.026, M['polymer'], bevel=0.008, bevel_segs=4)
    return 0.12


@knife
def navaja():
    M = mats()
    blade('blade', [('M', 0.012, 0.008), ('Q', 0.12, 0.016, 0.22, 0.006), ('Q', 0.12, -0.016, 0.012, -0.01)], edge_below(lambda x: 0.0), 0.004, M['blade'])
    extrude('handle', [('M', 0.016, 0.01), ('Q', -0.06, 0.02, -0.13, -0.004), ('Q', -0.136, -0.016, -0.124, -0.02), ('Q', -0.06, -0.006, 0.016, -0.012)], 0.018, M['horn'], bevel=0.006, bevel_segs=4)
    lathe('bolster', [(0.006, 0.0001), (0.006, 0.012), (0.02, 0.011), (0.02, 0.0001)], M['brass'])
    for i in range(4):
        cyl(f'pin{i}', 0.002, 0.02, (-0.02 - i * 0.03, 0, 0.002 - i * 0.003), M['brass'], axis='Y')
    return 0.22


@knife
def stiletto():
    M = mats()
    blade('blade', [('M', 0.015, 0.008), ('L', 0.21, 0.004), ('Q', 0.225, 0.0, 0.232, 0.0), ('Q', 0.225, -0.002, 0.21, -0.004), ('L', 0.015, -0.008)], lambda x, z: abs(z) > 0.003, 0.004, M['blade'])
    box('guard', (0.01, 0.016, 0.028), (0.012, 0, 0), M['steel'], bevel=0.003)
    extrude('handle', [('M', 0.008, 0.012), ('L', -0.11, 0.01), ('Q', -0.118, 0, -0.11, -0.01), ('L', 0.008, -0.012)], 0.016, M['horn'], bevel=0.006)
    box('pommel', (0.012, 0.018, 0.022), (-0.114, 0, 0), M['steel'], bevel=0.004)
    return 0.232


@knife
def kukri():
    M = mats()
    blade('blade', [('M', 0.015, 0.014), ('Q', 0.12, 0.03, 0.24, -0.025), ('Q', 0.245, -0.045, 0.22, -0.045), ('Q', 0.14, -0.05, 0.05, -0.02),
                    ('L', 0.035, -0.024), ('L', 0.03, -0.016), ('L', 0.015, -0.014)], lambda x, z: z < -0.012 and x > 0.05, 0.007, M['blade'])
    box('bolster', (0.008, 0.026, 0.04), (0.012, 0, 0), M['brass'], bevel=0.003)
    extrude('handle', [('M', 0.008, 0.016), ('Q', -0.05, 0.022, -0.1, 0.012), ('Q', -0.122, 0.0, -0.11, -0.022), ('Q', -0.05, -0.012, 0.008, -0.016)], 0.026, M['woodd'], bevel=0.009, bevel_segs=4)
    for i in range(3):
        lathe(f'ring{i}', [(-0.03 - i * 0.02, 0.0001), (-0.03 - i * 0.02, 0.0175), (-0.026 - i * 0.02, 0.0175), (-0.026 - i * 0.02, 0.0001)], M['brass'])
    return 0.24


@knife
def tanto():
    M = mats()
    blade('blade', [('M', 0.015, 0.014), ('L', 0.19, 0.014), ('L', 0.215, 0.002), ('L', 0.195, -0.016), ('L', 0.015, -0.016)], lambda x, z: z < -0.006 or x > 0.19, 0.006, M['blade'])
    extrude('tsuba', [('M', 0.006, 0.026), ('Q', 0.018, 0.03, 0.018, 0.0), ('Q', 0.018, -0.03, 0.006, -0.03)], 0.03, M['dark'], bevel=0.004)
    handle_wrap(M, -0.12, 0.006, 0.028, 0.022, M['polymer'], M['cord'], 9)
    return 0.215


@knife
def survival():
    M = mats()
    teeth = []
    x = 0.11
    while x > 0.04:
        teeth += [('L', x, 0.019), ('L', x - 0.0045, 0.014)]
        x -= 0.009
    blade('blade', [('M', 0.012, -0.016), ('Q', 0.15, -0.018, 0.195, 0.002), ('L', 0.16, 0.014), ('L', 0.115, 0.014)] + teeth + [('L', 0.012, 0.014)], edge_below(lambda x: -0.004), 0.006, M['blade'])
    extrude('tang', [('M', 0.012, 0.016), ('L', -0.1, 0.014), ('L', -0.1, -0.016), ('L', 0.012, -0.018)], 0.012, M['dark'], bevel=0.002)
    handle_wrap(M, -0.098, 0.006, 0.024, 0.02, M['cord'], M['cord'], 11)
    torus('lanyard', 0.01, 0.003, (-0.112, 0, 0), M['cord'], rot=(PI / 2, 0, 0))
    return 0.195


@knife
def cleaver():
    M = mats()
    b = blade('blade', [('M', 0.015, 0.02), ('L', 0.16, 0.024), ('Q', 0.18, 0.024, 0.18, 0.0), ('L', 0.175, -0.045), ('Q', 0.1, -0.05, 0.015, -0.04)], edge_below(lambda x: -0.02), 0.006, M['blade'])
    cut(b, cutter_cyl(0.006, 0.03, (0.155, 0, 0.01), axis='Y'))
    extrude('handle', [('M', 0.015, 0.012), ('L', -0.1, 0.01), ('Q', -0.11, 0, -0.1, -0.012), ('L', 0.015, -0.012)], 0.022, M['woodd'], bevel=0.007, bevel_segs=4)
    for i, x in enumerate((-0.07, -0.02)):
        cyl(f'rivet{i}', 0.003, 0.024, (x, 0, 0), M['brass'], axis='Y')
    return 0.18


GUNS = {'ak47': ak47, 'm4a1': m4a1, 'awp': awp, 'glock': glock, 'usp': usp, 'deagle': deagle}


def build(name):
    reset()
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(coll):
            coll.remove(item)
    if name in GUNS:
        GUNS[name]()
    else:
        tip = KNIVES[name]()
        empty('muzzle', (tip, 0, 0))
        empty('grip', (-0.04, 0, 0))


if __name__ == '__main__':
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'public/models/weapons'
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(GUNS) + [f'knife_{k}' for k in KNIVES]
    preview = '--preview' in sys.argv
    os.makedirs(out, exist_ok=True)
    for name in only:
        key = name.replace('knife_', '')
        build(key)
        if preview:
            from preview import render_preview
            apply_all()
            render_preview(os.path.join(out, f'{name}.png'), size=(1000, 500), angle=(0.12, 0, -0.35 if key in GUNS else -0.0))
            build(key)
        export_glb(os.path.join(out, f'{name}.glb'))
        print(f'{name}: {stats()} tris')
