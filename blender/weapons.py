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
    # stamped receiver with magazine dimples on both sides
    rec = extrude('receiver', [('M', -0.08, -0.008), ('L', 0.235, -0.008), ('L', 0.235, 0.056), ('L', -0.02, 0.056),
                               ('Q', -0.07, 0.056, -0.08, 0.04)], 0.046, M['paint'], bevel=0.0022)
    cut(rec, cutter_box((0.075, 0.02, 0.018), (0.09, -0.023, 0.042)))           # ejection port (right)
    for s in (-1, 1):
        cut(rec, cutter_box((0.05, 0.004, 0.018), (0.112, s * 0.0245, 0.016)))   # mag dimples
    # trunnion blocks front and rear
    box('trunnion', (0.03, 0.048, 0.05), (0.218, 0, 0.026), M['paint'], bevel=0.002)
    # rounded dust cover with transverse ribs and a rear lip
    dc = lambda w, h, zc: rrect(w, h, 0.0015, cz=zc, top_r=min(w / 2 - 0.0005, h - 0.002))
    loft('dustcover', [(-0.066, dc(0.036, 0.012, 0.061)), (-0.056, dc(0.044, 0.02, 0.064)), (0.2, dc(0.044, 0.02, 0.064)),
                       (0.214, dc(0.04, 0.016, 0.062))], M['paint'])
    for i, x in enumerate((-0.035, 0.03, 0.095, 0.16)):
        section(f'dcrib{i}', dc(0.0465, 0.0225, 0.0645), x, x + 0.007, M['paint'])
    box('dc_button', (0.012, 0.016, 0.012), (-0.072, 0, 0.06), M['steel'], bevel=0.002)
    # bolt carrier through the port, charging handle with a hooked knob
    box('carrier', (0.07, 0.006, 0.014), (0.09, -0.019, 0.042), M['steel'], bevel=0.001)
    cyl('charging', 0.004, 0.03, (0.13, -0.035, 0.042), M['steel'], axis='Y')
    sphere('charging_knob', 0.006, (0.13, -0.05, 0.043), M['steel'], scale=(1.2, 0.9, 1))
    # long selector lever on the right
    extrude('selector', [('M', -0.05, 0.036), ('L', 0.092, 0.031), ('Q', 0.1, 0.03, 0.098, 0.022), ('L', 0.0, 0.022), ('L', -0.05, 0.028)],
            0.003, M['steel'], y=-0.0255, bevel=0.0007)
    cyl('selector_pivot', 0.0055, 0.004, (-0.045, -0.025, 0.031), M['steel'], axis='Y')
    rivets('rivet', [(-0.055, 0.006), (-0.005, 0.006), (0.17, 0.006), (0.212, 0.006), (0.212, 0.044), (0.03, 0.0)], M)
    # rear sight block + tangent leaf with notch
    puffy('rs_block', [('M', 0.22, 0.068), ('L', 0.29, 0.068), ('L', 0.29, 0.08), ('L', 0.24, 0.09), ('L', 0.22, 0.086)], 0.032, M['dark'], r=0.003, rings=2)
    leaf = extrude('rs_leaf', [('M', 0.228, 0.088), ('L', 0.292, 0.083), ('L', 0.292, 0.089), ('L', 0.232, 0.095)], 0.02, M['dark'], bevel=0.0006)
    cut(leaf, cutter_box((0.012, 0.004, 0.006), (0.232, 0, 0.096)))
    box('rs_slider', (0.01, 0.024, 0.008), (0.26, 0, 0.088), M['steel'], bevel=0.0012)
    # wooden stock with a moulded cross-section, steel buttplate and sling loop
    puffy('stock', [('M', -0.07, 0.044), ('L', -0.37, 0.024), ('Q', -0.405, 0.022, -0.41, -0.005), ('L', -0.415, -0.1),
                    ('Q', -0.41, -0.118, -0.39, -0.116), ('L', -0.13, -0.04), ('Q', -0.09, -0.028, -0.07, -0.006)], 0.044, M['wood'], r=0.013, rings=4)
    puffy('buttplate', [('M', -0.406, 0.019), ('L', -0.42, 0.019), ('L', -0.426, -0.11), ('L', -0.411, -0.118)], 0.046, M['dark'], r=0.006, rings=3)
    for i, z in enumerate((-0.005, -0.09)):
        cyl(f'bp_screw{i}', 0.003, 0.004, (-0.427, 0, z), M['steel'], axis='X')
    puffy('stock_tang', [('M', -0.08, 0.05), ('L', -0.14, 0.046), ('L', -0.14, 0.028), ('L', -0.08, 0.03)], 0.047, M['paint'], r=0.003, rings=2)
    torus('sling_rear', 0.008, 0.0018, (-0.3, 0, -0.088), M['steel'], rot=(0, 0, 0))
    # wooden pistol grip with finger grooves
    grip = puffy('grip', [('M', -0.03, -0.006), ('L', 0.005, -0.006), ('Q', -0.004, -0.06, -0.024, -0.115), ('Q', -0.035, -0.13, -0.056, -0.123),
                          ('L', -0.063, -0.116), ('Q', -0.046, -0.06, -0.03, -0.006)], 0.032, M['wood'], r=0.01, rings=3)
    for i in range(4):
        cut(grip, cutter_cyl(0.0045, 0.05, (0.0, 0, -0.032 - i * 0.02), axis='Y'))
    trigger_group(M, 0.005, 0.07, -0.006, 0.034, M['paint'])
    # curved magazine with stamped ribs and floor plate
    mag = puffy('mag', [('M', 0.082, -0.008), ('L', 0.14, -0.008), ('Q', 0.158, -0.11, 0.215, -0.205), ('L', 0.17, -0.232),
                        ('Q', 0.115, -0.13, 0.082, -0.008)], 0.034, M['paint'], r=0.004, rings=2)

    def qb(p0, c, p1, t):
        u = 1 - t
        return (u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1])

    def centre(t):
        f = qb((0.14, -0.008), (0.158, -0.11), (0.215, -0.205), t)
        b = qb((0.082, -0.008), (0.115, -0.13), (0.17, -0.232), t)
        return ((f[0] + b[0]) / 2, (f[1] + b[1]) / 2), math.hypot(f[0] - b[0], f[1] - b[1])
    for i, t in enumerate((0.22, 0.42, 0.62, 0.985)):
        (cx, cz), span = centre(t)
        (ax, az), _ = centre(t + 0.01)
        tx, tz = ax - cx, az - cz
        ang = math.atan2(tx, tz)
        last = i == 3
        r = box('mag_floor' if last else f'magrib{i}', (span + 0.003, 0.039 if last else 0.036, 0.008 if last else 0.004), (cx, 0, cz),
                M['paint'], bevel=0.0018 if last else 0.0012, rot=(0, ang, 0))
        r.parent = mag
    # lower handguard: rounded U with finger grooves; front retainer band
    hg = lambda w, h, zc, r=0.02: rrect(w, h, r, cz=zc, top_r=0.005)
    lhg = loft('lower_hg', [(0.236, hg(0.05, 0.046, 0.018)), (0.245, hg(0.055, 0.05, 0.018)), (0.42, hg(0.055, 0.05, 0.018)),
                            (0.445, hg(0.05, 0.044, 0.02, 0.018))], M['wood'])
    for s in (-1, 1):
        cut(lhg, cutter_cyl(0.0055, 0.15, (0.34, s * 0.03, 0.022), axis='X'))
    section('hg_retainer', rrect(0.058, 0.056, 0.02, cz=0.02, top_r=0.006), 0.236, 0.246, M['dark'])
    section('hg_band', rrect(0.054, 0.05, 0.018, cz=0.02, top_r=0.006), 0.442, 0.456, M['dark'])
    # upper handguard over the gas tube, with heat vents
    uh = lambda w, h: rrect(w, h, 0.004, cz=0.066, top_r=min(w / 2 - 0.0005, h - 0.0045))
    up = loft('upper_hg', [(0.246, uh(0.032, 0.026)), (0.256, uh(0.04, 0.032)), (0.42, uh(0.04, 0.032)), (0.432, uh(0.034, 0.028))], M['wood'])
    for i in range(3):
        cut(up, cutter_box((0.012, 0.06, 0.006), (0.29 + i * 0.05, 0, 0.07)))
    gt = tube('gas_tube', 0.43, 0.53, 0.011, M['dark'], z=0.066)
    for i in range(3):
        cut(gt, cutter_cyl(0.0035, 0.04, (0.45 + i * 0.022, 0, 0.066)))
    # gas block, front sight base with protective ears, bayonet lug
    puffy('gas_block', [('M', 0.52, 0.018), ('L', 0.556, 0.018), ('L', 0.556, 0.08), ('L', 0.53, 0.08), ('L', 0.52, 0.06)], 0.026, M['dark'], r=0.004, rings=2)
    puffy('fsb', [('M', 0.632, 0.016), ('L', 0.666, 0.016), ('L', 0.662, 0.062), ('L', 0.636, 0.062)], 0.024, M['dark'], r=0.004, rings=2)
    for s in (-1, 1):
        puffy(f'fs_ear{s}', [('M', 0.638, 0.058), ('L', 0.664, 0.058), ('L', 0.66, 0.088), ('Q', 0.652, 0.096, 0.643, 0.088)], 0.004, M['dark'], y=s * 0.0095, r=0.0012, rings=1)
    cyl('fs_post', 0.002, 0.03, (0.652, 0, 0.074), M['dark'], axis='Z', segs=12)
    box('bayonet_lug', (0.025, 0.012, 0.01), (0.64, 0, 0.01), M['dark'], bevel=0.0015)
    # barrel, cleaning rod, slant muzzle brake
    tube('barrel', 0.44, 0.7, 0.0105, M['dark'], z=0.03)
    tube('cleaning_rod', 0.44, 0.665, 0.0028, M['steel'], z=0.011)
    sphere('rod_tip', 0.0042, (0.665, 0, 0.011), M['steel'])
    mb = lathe('muzzle_brake', [(0.69, 0.0001), (0.69, 0.0135), (0.692, 0.0145), (0.735, 0.0145), (0.742, 0.012), (0.742, 0.006), (0.742, 0.0001)], M['dark'], z=0.03)
    cut(mb, cutter_box((0.02, 0.03, 0.02), (0.73, 0, 0.045), rot=(0, 0.5, 0)))
    cut(mb, cutter_cyl(0.0045, 0.06, (0.72, 0, 0.03), axis='X'))
    empty('muzzle', (0.745, 0, 0.03))
    empty('grip', (-0.025, 0, -0.05))
    empty('fore', (0.33, 0, 0.0))


# ================================================================ M4A1
def picatinny(name, x0, x1, z0, z1, M, w=0.022):
    rail = extrude(name, [('M', x0, z0), ('L', x1, z0), ('L', x1, z1), ('L', x0, z1)], w, M['paint'], bevel=0.0008)
    n = int((x1 - x0) / 0.0102)
    for i in range(n):
        cut(rail, cutter_box((0.0052, w + 0.01, 0.006), (x0 + 0.006 + i * 0.0102, 0, z1 + 0.001)))
    return rail


def m4a1():
    M = mats()
    up = extrude('upper', [('M', -0.06, 0.02), ('L', 0.175, 0.02), ('L', 0.175, 0.075), ('L', -0.05, 0.075), ('Q', -0.06, 0.07, -0.06, 0.055)], 0.05, M['paint'], bevel=0.003)
    cut(up, cutter_box((0.065, 0.02, 0.02), (0.07, -0.025, 0.045)))   # ejection port
    box('dust_door', (0.062, 0.003, 0.018), (0.07, -0.027, 0.045), M['dark'], bevel=0.0008)
    box('bolt_face', (0.06, 0.006, 0.014), (0.07, -0.021, 0.045), M['steel'], bevel=0.001)
    # brass deflector + forward assist
    puffy('deflector', [('M', 0.016, 0.048), ('L', 0.04, 0.048), ('Q', 0.036, 0.066, 0.02, 0.072), ('L', 0.016, 0.072)], 0.012, M['paint'], y=-0.031, r=0.003, rings=2)
    cyl('fwd_assist', 0.008, 0.024, (0.0, -0.03, 0.058), M['dark'], axis='Y', bevel=0.001)
    # full-length top rail over upper and handguard
    picatinny('rail', -0.055, 0.425, 0.072, 0.083, M)
    # lower receiver with flared magwell, bolt catch, mag release
    lo = puffy('lower', [('M', -0.06, 0.022), ('L', 0.135, 0.022), ('L', 0.135, -0.012), ('L', 0.118, -0.042), ('L', 0.047, -0.042),
                         ('L', 0.043, -0.015), ('L', -0.035, -0.012), ('Q', -0.06, -0.01, -0.06, 0.01)], 0.048, M['paint'], r=0.0035, rings=2)
    cut(lo, cutter_box((0.06, 0.06, 0.03), (0.082, 0, -0.035)))
    section('magwell_flare', rrect(0.054, 0.008, 0.003), 0.044, 0.122, M['paint']).location.z = -0.04
    box('bolt_catch', (0.012, 0.004, 0.018), (0.035, 0.026, 0.01), M['dark'], bevel=0.0008)
    cyl('mag_release', 0.005, 0.006, (0.04, -0.026, 0.0), M['dark'], axis='Y')
    cyl('selector', 0.0055, 0.004, (-0.03, 0.026, 0.008), M['dark'], axis='Y')
    box('selector_lever', (0.018, 0.003, 0.005), (-0.025, 0.028, 0.008), M['dark'], bevel=0.0006, rot=(0, -0.4, 0))
    rivets('pin', [(-0.045, 0.012), (0.12, 0.01), (0.003, 0.002), (0.025, 0.002)], M, r=0.003, y=0.0245)
    # charging handle (T)
    puffy('charging', [('M', -0.078, 0.068), ('L', -0.04, 0.068), ('L', -0.04, 0.078), ('L', -0.078, 0.078)], 0.046, M['dark'], r=0.003, rings=2)
    # buffer tube + collapsible stock with cheek weld, sling slot and rubber pad
    tube('buffer_tube', -0.27, -0.055, 0.016, M['dark'], z=0.045)
    lathe('castle_nut', [(-0.07, 0.0001), (-0.07, 0.019), (-0.06, 0.019), (-0.06, 0.0001)], M['dark'], z=0.045, segs=12)
    st = puffy('stock', [('M', -0.17, 0.07), ('L', -0.305, 0.07), ('Q', -0.318, 0.068, -0.32, 0.052), ('L', -0.324, -0.07),
                         ('Q', -0.312, -0.08, -0.297, -0.07), ('L', -0.205, -0.004), ('Q', -0.18, 0.016, -0.17, 0.036)], 0.05, M['poly'], r=0.01, rings=3)
    cut(st, puffy('cutter', [('M', -0.26, -0.008), ('L', -0.296, -0.036), ('L', -0.298, 0.01), ('L', -0.262, 0.02)], 0.12, None, r=0.0, rings=1))
    puffy('cheek', [('M', -0.18, 0.068), ('L', -0.3, 0.068), ('Q', -0.31, 0.08, -0.29, 0.086), ('L', -0.2, 0.084), ('Q', -0.18, 0.08, -0.18, 0.068)], 0.048, M['poly'], r=0.009, rings=3)
    puffy('buttpad', [('M', -0.318, 0.065), ('L', -0.336, 0.065), ('L', -0.34, -0.075), ('L', -0.324, -0.078)], 0.052, M['rubber'], r=0.006, rings=3)
    box('stock_lever', (0.05, 0.012, 0.006), (-0.2, 0, 0.02), M['dark'], bevel=0.0015, rot=(0, 0.25, 0))
    # pistol grip with finger groove + texture bands
    g = puffy('grip', [('M', -0.022, -0.012), ('L', 0.008, -0.012), ('Q', 0.0, -0.06, -0.012, -0.112), ('Q', -0.018, -0.124, -0.04, -0.12),
                       ('L', -0.048, -0.112), ('Q', -0.04, -0.08, -0.03, -0.06), ('Q', -0.034, -0.04, -0.022, -0.012)], 0.03, M['polymer'], r=0.009, rings=3)
    for i in range(5):
        cut(g, cutter_box((0.05, 0.034, 0.0018), (-0.02, 0, -0.04 - i * 0.012), rot=(0, 0.35, 0)))
    trigger_group(M, 0.008, 0.06, -0.01, 0.03, M['paint'])
    # STANAG magazine with ribs and floor plate
    mag = puffy('mag', [('M', 0.052, -0.035), ('L', 0.112, -0.035), ('Q', 0.122, -0.12, 0.135, -0.195), ('L', 0.078, -0.205), ('Q', 0.064, -0.12, 0.052, -0.035)],
                0.028, M['paint'], r=0.0035, rings=2)
    for i in range(3):
        r = box(f'magrib{i}', (0.003, 0.03, 0.12), (0.075 + i * 0.012, 0, -0.12), M['paint'], bevel=0.0008, rot=(0, -0.12, 0)); r.parent = mag
    fp = puffy('mag_floor', [('M', 0.072, -0.196), ('L', 0.14, -0.188), ('L', 0.142, -0.2), ('L', 0.076, -0.21)], 0.034, M['polymer'], r=0.003, rings=2); fp.parent = mag
    # free-float handguard with M-LOK slots
    hgs = rrect(0.058, 0.058, 0.014, cz=0.043)
    hg = loft('handguard', [(0.175, rrect(0.054, 0.054, 0.013, cz=0.043)), (0.18, hgs), (0.415, hgs), (0.425, rrect(0.054, 0.054, 0.013, cz=0.043))], M['paint'])
    for i in range(5):
        x = 0.205 + i * 0.043
        for s in (-1, 1):
            cut(hg, cutter_box((0.03, 0.012, 0.0075), (x, s * 0.029, 0.043)))
        cut(hg, cutter_box((0.03, 0.0075, 0.012), (x, 0, 0.014)))
    lathe('barrel_nut', [(0.165, 0.0001), (0.165, 0.03), (0.177, 0.03), (0.177, 0.0001)], M['dark'], z=0.043, segs=24)
    # flip-up sights
    fs = puffy('front_sight', [('M', 0.392, 0.082), ('L', 0.418, 0.082), ('L', 0.412, 0.114), ('L', 0.398, 0.114)], 0.026, M['dark'], r=0.002, rings=2)
    cut(fs, cutter_box((0.03, 0.014, 0.018), (0.405, 0, 0.1)))
    box('fs_post', (0.003, 0.003, 0.024), (0.405, 0, 0.098), M['dark'], bevel=0)
    rs = puffy('rear_sight', [('M', -0.032, 0.082), ('L', 0.0, 0.082), ('L', -0.005, 0.112), ('L', -0.026, 0.112)], 0.026, M['dark'], r=0.002, rings=2)
    cut(rs, cutter_cyl(0.004, 0.04, (-0.015, 0, 0.104), axis='X'))
    torus('sling_front', 0.008, 0.0015, (0.4, 0, 0.004), M['steel'], rot=(0, 0, 0))
    # barrel + birdcage flash hider with real slots
    tube('barrel', 0.415, 0.58, 0.0095, M['dark'], z=0.042)
    lathe('gas_block', [(0.43, 0.0001), (0.43, 0.014), (0.45, 0.014), (0.45, 0.0001)], M['dark'], z=0.042, segs=20)
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
    body = puffy('chassis', [
        ('M', 0.32, 0.03), ('L', -0.12, 0.03), ('L', -0.14, 0.05), ('Q', -0.3, 0.068, -0.62, 0.062), ('Q', -0.64, 0.06, -0.642, 0.04),
        ('L', -0.65, -0.11), ('Q', -0.64, -0.13, -0.62, -0.126), ('L', -0.3, -0.06), ('Q', -0.2, -0.045, -0.17, -0.1), ('L', -0.15, -0.13),
        ('Q', -0.13, -0.142, -0.105, -0.13), ('L', -0.07, -0.04), ('L', 0.32, -0.035), ('Q', 0.335, -0.03, 0.335, 0.0), ('L', 0.335, 0.015), ('Q', 0.333, 0.03, 0.32, 0.03)],
        0.064, M['tan'], r=0.016, rings=4)
    thumb = extrude('cutter', [('M', -0.25, 0.03), ('Q', -0.2, 0.04, -0.15, 0.025), ('Q', -0.13, 0.0, -0.15, -0.03), ('Q', -0.2, -0.035, -0.25, -0.03), ('Q', -0.27, 0.0, -0.25, 0.03)], 0.2, None, bevel=0)
    cut(body, thumb)
    # shallow flutes along both sides of the forend
    for s in (-1, 1):
        for i in range(2):
            cut(body, cutter_box((0.2, 0.006, 0.008), (0.19, s * 0.033, 0.012 - i * 0.022)))
    puffy('buttpad', [('M', -0.64, 0.058), ('L', -0.668, 0.058), ('L', -0.678, -0.12), ('L', -0.648, -0.126)], 0.068, M['rubber'], r=0.008, rings=3)
    puffy('cheek', [('M', -0.33, 0.062), ('L', -0.58, 0.062), ('Q', -0.6, 0.075, -0.58, 0.092), ('L', -0.36, 0.09), ('Q', -0.33, 0.08, -0.33, 0.062)], 0.052, M['tan'], r=0.012, rings=3)
    for i, x in enumerate((-0.4, -0.52)):
        cyl(f'cheek_post{i}', 0.0045, 0.012, (x, 0, 0.06), M['steel'], axis='Z')
    cyl('cheek_knob', 0.007, 0.012, (-0.45, -0.034, 0.075), M['dark'], axis='Y')
    trigger_group(M, -0.075, -0.015, -0.035, 0.032, M['tan'])
    # receiver, bolt shroud, bolt handle
    rec = tube('receiver', -0.13, 0.17, 0.024, M['dark'], z=0.052)
    cut(rec, cutter_box((0.08, 0.03, 0.02), (0.03, -0.022, 0.06)))
    picatinny('scope_rail', -0.12, 0.16, 0.07, 0.08, M, w=0.02)
    tube('bolt_shroud', -0.165, -0.12, 0.016, M['steel'], z=0.052)
    bolt = empty('bolt', (-0.09, 0, 0.05))
    stem = cyl('bolt_stem', 0.0045, 0.055, (0, -0.028, 0), M['steel'], axis='Y'); stem.parent = bolt
    knob = sphere('bolt_knob', 0.011, (0, -0.058, -0.004), M['dark'], scale=(1, 1, 1.15)); knob.parent = bolt
    bolt.rotation_euler = (-0.4, 0, 0)
    # magazine + release
    puffy('mag', [('M', -0.03, -0.035), ('L', 0.06, -0.035), ('L', 0.058, -0.09), ('L', -0.028, -0.09)], 0.046, M['dark'], r=0.004, rings=2)
    box('mag_release', (0.014, 0.03, 0.006), (0.07, 0, -0.04), M['steel'], bevel=0.0015)
    # fluted barrel and muzzle brake with ports
    bar = lathe('barrel', [(0.16, 0.0001), (0.16, 0.018), (0.25, 0.0165), (0.7, 0.0125), (0.7, 0.0001)], M['dark'], z=0.052, segs=36)
    for i in range(6):
        a = i / 6 * PI * 2
        cut(bar, cutter_box((0.32, 0.004, 0.004), (0.45, math.cos(a) * 0.0145, 0.052 + math.sin(a) * 0.0145), rot=(a, 0, 0)))
    mb = lathe('muzzle_brake', [(0.695, 0.0001), (0.695, 0.02), (0.78, 0.02), (0.785, 0.017), (0.785, 0.0001)], M['dark'], z=0.052)
    for i in range(3):
        cut(mb, cutter_box((0.012, 0.06, 0.03), (0.72 + i * 0.022, 0, 0.052)))
    cut(mb, cutter_cyl(0.007, 0.2, (0.74, 0, 0.052), axis='X'))
    # folded bipod under the forend, sling stud
    box('bipod_head', (0.03, 0.04, 0.016), (0.3, 0, -0.045), M['dark'], bevel=0.003)
    for s in (-1, 1):
        cyl(f'bipod_leg{s}', 0.005, 0.2, (0.2, s * 0.013, -0.048), M['dark'], axis='X')
        sphere(f'bipod_foot{s}', 0.008, (0.1, s * 0.013, -0.048), M['rubber'])
    torus('sling_rear', 0.009, 0.0018, (-0.5, 0, -0.108), M['steel'], rot=(0, 0, 0))
    # scope: tube, bells, turrets, rings, flip caps
    sy = 0.128
    lathe('scope', [(-0.17, 0.0001), (-0.17, 0.023), (-0.12, 0.024), (-0.1, 0.0158), (0.17, 0.0158), (0.21, 0.029), (0.27, 0.03), (0.27, 0.0001)], M['paint'], z=sy, segs=40)
    lathe('eyepiece_ring', [(-0.15, 0.0001), (-0.15, 0.0245), (-0.14, 0.0245), (-0.14, 0.0001)], M['rubber'], z=sy, segs=40)
    lathe('power_ring', [(-0.105, 0.0001), (-0.105, 0.0185), (-0.085, 0.0185), (-0.085, 0.0001)], M['rubber'], z=sy, segs=40)
    box('turret_base', (0.05, 0.036, 0.036), (0.03, 0, sy), M['paint'], bevel=0.005)
    for name, loc, axis in (('turret_top', (0.03, 0, sy + 0.026), 'Z'), ('turret_side', (0.03, -0.026, sy), 'Y'), ('turret_par', (0.03, 0.026, sy), 'Y')):
        t = cyl(name, 0.013, 0.022, loc, M['dark'], axis=axis, segs=28)
        if axis == 'Z':
            for k in range(16):
                a = k / 16 * PI * 2
                cut(t, cutter_box((0.002, 0.002, 0.03), (loc[0] + math.cos(a) * 0.0135, math.sin(a) * 0.0135, loc[2])))
    for i, x in enumerate((-0.06, 0.12)):
        lathe(f'ring{i}', [(x - 0.011, 0.0001), (x - 0.011, 0.021), (x + 0.011, 0.021), (x + 0.011, 0.0001)], M['dark'], z=sy)
        box(f'ring_base{i}', (0.022, 0.03, sy - 0.07), (x, 0, (sy + 0.07) / 2), M['dark'], bevel=0.003)
        cyl(f'ring_bolt{i}', 0.004, 0.036, (x, 0, sy + 0.012), M['steel'], axis='Y')
    cyl('lens_front', 0.027, 0.002, (0.268, 0, sy), M['lens'], axis='X', segs=40)
    cyl('lens_back', 0.02, 0.002, (-0.168, 0, sy), M['lens'], axis='X', segs=40)
    cap = cyl('cap_front', 0.031, 0.006, (0.275, 0.0, sy), M['polymer'], axis='X', segs=40)
    cap.location = (0.282, 0.0, sy + 0.03); cap.rotation_euler = (0, PI / 2 - 1.2, 0)
    empty('muzzle', (0.79, 0, 0.052))
    empty('grip', (-0.12, 0, -0.06))
    empty('fore', (0.2, 0, -0.01))


# ================================================================ pistols
def pistol(len_, slide_h, frame_len, rake, grip_len, slide_mat_key='paint', rounded=False, deagle=False, slide_w=0.028):
    M = mats()
    stop = 0.016 + slide_h
    zc = 0.016 + slide_h / 2
    top_r = 0.011 if rounded else 0.0045
    sec = lambda w, h, z: rrect(w, h, 0.002, cz=z, top_r=min(top_r, w / 2 - 0.001))
    slide = loft('slide', [(-0.03, sec(slide_w - 0.004, slide_h - 0.004, zc)), (-0.027, sec(slide_w, slide_h, zc)), (len_ - 0.008, sec(slide_w, slide_h, zc)),
                           (len_, sec(slide_w - 0.006, slide_h - 0.006, zc - 0.002))], M[slide_mat_key])
    hw = slide_w / 2
    # rear + front cocking serrations on both sides only
    for s in (-1, 1):
        for i in range(7):
            cut(slide, cutter_box((0.0018, 0.003, slide_h * 0.75), (-0.022 + i * 0.0045, s * hw, zc - slide_h * 0.05)))
        for i in range(4):
            cut(slide, cutter_box((0.0018, 0.003, slide_h * 0.55), (len_ - 0.032 + i * 0.0045, s * hw, zc - slide_h * 0.1)))
    cut(slide, cutter_box((0.032, 0.012, slide_h * 0.5), (0.045, -hw + 0.004, 0.016 + slide_h * 0.7)))  # ejection port
    cut(slide, cutter_cyl(0.0055, 0.02, (len_, 0, 0.03), axis='X'))
    sp = puffy('front_sight', [('M', len_ - 0.016, stop - 0.001), ('L', len_ - 0.005, stop - 0.001), ('L', len_ - 0.006, stop + 0.006), ('L', len_ - 0.013, stop + 0.006)],
               0.004, M['dark'], r=0.001, rings=1); sp.parent = slide
    rs = puffy('rear_sight', [('M', -0.026, stop - 0.001), ('L', -0.008, stop - 0.001), ('L', -0.012, stop + 0.007), ('L', -0.026, stop + 0.007)],
               0.022, M['dark'], r=0.0015, rings=1); rs.parent = slide
    cut(rs, cutter_box((0.03, 0.004, 0.006), (-0.017, 0, stop + 0.008)))
    for s in (-1, 1):
        d = sphere(f'sight_dot{s}', 0.0012, (-0.026, s * 0.0065, stop + 0.004), M['lens'], segs=10); d.parent = slide
    br = tube('barrel_hood', 0.03, 0.06, 0.009, M['steel'], z=stop - 0.008); br.parent = slide
    # frame with dust-cover rail
    fr = puffy('frame', [('M', -0.03, 0.018), ('L', frame_len, 0.018), ('L', frame_len, 0.004), ('L', 0.05, 0.0), ('L', 0.0, -0.002),
                         ('L', -0.035, 0.004), ('Q', -0.04, 0.012, -0.03, 0.018)], slide_w - 0.002, M['poly'], r=0.003, rings=2)
    for i in range(3):
        cut(fr, cutter_box((0.005, 0.04, 0.004), (frame_len - 0.012 - i * 0.012, 0, 0.004)))
    # grip with beavertail, stippling bands and magazine base plate
    bx, gl = -0.004, grip_len
    g = puffy('grip', [('M', bx, 0.0), ('Q', bx - gl * rake * 0.4, -gl * 0.5, bx - gl * rake, -gl), ('L', bx - gl * rake - 0.036, -gl),
                       ('Q', bx - gl * rake - 0.044, -gl * 0.5, -0.04, -0.004), ('Q', -0.05, 0.006, -0.042, 0.012), ('L', -0.03, 0.006), ('L', bx, 0.0)],
              slide_w + 0.002, M['poly'], r=0.008, rings=3)
    for i in range(7):
        t = 0.18 + i * 0.1
        for side in (-1, 1):
            cut(g, cutter_box((0.03, 0.004, 0.0016), (bx - 0.019 - gl * rake * t, side * (slide_w / 2 + 0.0015), -gl * t), rot=(0, -rake, 0)))
    mag = puffy('mag', [('M', bx - gl * rake - 0.038, -gl + 0.002), ('L', bx - gl * rake + 0.002, -gl + 0.002), ('L', bx - gl * rake + 0.001, -gl - 0.01),
                        ('L', bx - gl * rake - 0.038, -gl - 0.01)], slide_w + 0.002, M['dark'], r=0.003, rings=2)
    trigger_group(M, -0.002, 0.045, -0.002, 0.026, M['poly'])
    cyl('slide_stop', 0.003, 0.004, (0.03, slide_w / 2 + 0.001, 0.012), M['steel'], axis='Y')
    box('slide_stop_lever', (0.022, 0.003, 0.005), (0.02, slide_w / 2 + 0.001, 0.012), M['dark'], bevel=0.0008)
    box('takedown', (0.01, 0.004, 0.004), (0.035, slide_w / 2 + 0.001, 0.006), M['dark'], bevel=0.0008)
    cyl('mag_button', 0.004, 0.005, (-0.006, slide_w / 2 + 0.001, -0.008), M['dark'], axis='Y')
    if deagle or rounded:
        box('hammer', (0.01, 0.008, 0.014), (-0.034, 0, stop - 0.002), M['dark'], bevel=0.001, rot=(0, -0.3, 0))
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
    M, top = pistol(0.2, 0.046, 0.19, 0.2, 0.11, slide_mat_key='steel', deagle=True, slide_w=0.032)
    rib = puffy('top_rib', [('M', 0.06, 0.06), ('L', 0.2, 0.06), ('L', 0.2, 0.072), ('L', 0.075, 0.072)], 0.014, M['steel'], r=0.002, rings=2)
    for i in range(10):
        cut(rib, cutter_box((0.003, 0.02, 0.004), (0.08 + i * 0.012, 0, 0.073)))
    for s in (-1, 1):
        for i in range(3):
            cut(bpy.data.objects['slide'], cutter_box((0.014, 0.004, 0.005), (0.12 + i * 0.022, s * 0.016, 0.05)))
    cyl('barrel_crown', 0.009, 0.004, (0.2, 0, 0.038), M['dark'], axis='X')
    empty('muzzle', (0.2, 0, 0.038)); empty('grip', (-0.02, 0, -0.045))


# ================================================================ knives
def handle_wrap(M, x0, x1, h, w, mat, wrap, turns):
    puffy('handle', [('M', x0, h / 2), ('L', x1, h / 2), ('Q', x1 + 0.006, 0, x1, -h / 2), ('L', x0, -h / 2), ('Q', x0 - 0.008, 0, x0, h / 2)], w, mat, r=w * 0.38, rings=3)
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
    puffy('handle', [('M', 0.012, 0.014), ('L', -0.1, 0.012), ('Q', -0.11, 0, -0.1, -0.014), ('L', 0.012, -0.015)], 0.022, M['polymer'], r=0.0084, rings=3)
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
    h = puffy('handle', [('M', 0.016, 0.014), ('Q', -0.04, 0.02, -0.07, 0.0), ('L', -0.075, -0.012), ('Q', -0.04, 0.0, 0.016, -0.014)], 0.022, M['polymer'], r=0.0084, rings=3)
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
    h = puffy('handle', [('M', 0.016, 0.014), ('L', -0.095, 0.012), ('Q', -0.108, 0.0, -0.095, -0.014), ('L', 0.016, -0.016), ('Q', 0.024, 0.0, 0.016, 0.014)], 0.02, M['polymer'], r=0.0076, rings=3)
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
    puffy('handle', [('M', 0.012, 0.016), ('Q', -0.05, 0.022, -0.105, 0.014), ('Q', -0.118, 0.0, -0.105, -0.02), ('Q', -0.05, -0.022, 0.012, -0.02)], 0.024, M['woodd'], r=0.0091, rings=3)
    for i, x in enumerate((-0.07, -0.025)):
        cyl(f'rivet{i}', 0.0035, 0.026, (x, 0, -0.002), M['brass'], axis='Y')
    box('pommel', (0.012, 0.026, 0.036), (-0.11, 0, -0.003), M['brass'], bevel=0.005)
    return 0.255


@knife
def push():
    M = mats()
    blade('blade', [('M', 0.0, 0.016), ('L', 0.06, 0.012), ('Q', 0.1, 0.004, 0.12, 0.0), ('Q', 0.1, -0.004, 0.06, -0.012), ('L', 0.0, -0.016)], lambda x, z: x > 0.02, 0.005, M['blade'])
    puffy('t_handle', [('M', -0.012, 0.045), ('Q', 0.004, 0.05, 0.004, 0.03), ('L', 0.004, -0.03), ('Q', 0.004, -0.05, -0.012, -0.045), ('Q', -0.022, 0, -0.012, 0.045)], 0.026, M['polymer'], r=0.0099, rings=3)
    return 0.12


@knife
def navaja():
    M = mats()
    blade('blade', [('M', 0.012, 0.008), ('Q', 0.12, 0.016, 0.22, 0.006), ('Q', 0.12, -0.016, 0.012, -0.01)], edge_below(lambda x: 0.0), 0.004, M['blade'])
    puffy('handle', [('M', 0.016, 0.01), ('Q', -0.06, 0.02, -0.13, -0.004), ('Q', -0.136, -0.016, -0.124, -0.02), ('Q', -0.06, -0.006, 0.016, -0.012)], 0.018, M['horn'], r=0.0068, rings=3)
    lathe('bolster', [(0.006, 0.0001), (0.006, 0.012), (0.02, 0.011), (0.02, 0.0001)], M['brass'])
    for i in range(4):
        cyl(f'pin{i}', 0.002, 0.02, (-0.02 - i * 0.03, 0, 0.002 - i * 0.003), M['brass'], axis='Y')
    return 0.22


@knife
def stiletto():
    M = mats()
    blade('blade', [('M', 0.015, 0.008), ('L', 0.21, 0.004), ('Q', 0.225, 0.0, 0.232, 0.0), ('Q', 0.225, -0.002, 0.21, -0.004), ('L', 0.015, -0.008)], lambda x, z: abs(z) > 0.003, 0.004, M['blade'])
    box('guard', (0.01, 0.016, 0.028), (0.012, 0, 0), M['steel'], bevel=0.003)
    puffy('handle', [('M', 0.008, 0.012), ('L', -0.11, 0.01), ('Q', -0.118, 0, -0.11, -0.01), ('L', 0.008, -0.012)], 0.016, M['horn'], r=0.0061, rings=3)
    box('pommel', (0.012, 0.018, 0.022), (-0.114, 0, 0), M['steel'], bevel=0.004)
    return 0.232


@knife
def kukri():
    M = mats()
    blade('blade', [('M', 0.015, 0.014), ('Q', 0.12, 0.03, 0.24, -0.025), ('Q', 0.245, -0.045, 0.22, -0.045), ('Q', 0.14, -0.05, 0.05, -0.02),
                    ('L', 0.035, -0.024), ('L', 0.03, -0.016), ('L', 0.015, -0.014)], lambda x, z: z < -0.012 and x > 0.05, 0.007, M['blade'])
    box('bolster', (0.008, 0.026, 0.04), (0.012, 0, 0), M['brass'], bevel=0.003)
    puffy('handle', [('M', 0.008, 0.016), ('Q', -0.05, 0.022, -0.1, 0.012), ('Q', -0.122, 0.0, -0.11, -0.022), ('Q', -0.05, -0.012, 0.008, -0.016)], 0.026, M['woodd'], r=0.0099, rings=3)
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
    puffy('handle', [('M', 0.015, 0.012), ('L', -0.1, 0.01), ('Q', -0.11, 0, -0.1, -0.012), ('L', 0.015, -0.012)], 0.022, M['woodd'], r=0.0084, rings=3)
    for i, x in enumerate((-0.07, -0.02)):
        cyl(f'rivet{i}', 0.003, 0.024, (x, 0, 0), M['brass'], axis='Y')
    return 0.18


GUNS = {'ak47': ak47, 'm4a1': m4a1, 'awp': awp, 'glock': glock, 'usp': usp, 'deagle': deagle}


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build(name):
    reset()
    if name in GUNS:
        GUNS[name]()
    else:
        tip = KNIVES[name]()
        empty('muzzle', (tip, 0, 0))
        empty('grip', (-0.04, 0, 0))


def main(argv):
    out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(ROOT, 'public', 'models', 'weapons')
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else list(GUNS) + [f'knife_{k}' for k in KNIVES]
    preview = '--preview' in argv
    os.makedirs(out, exist_ok=True)
    report = {}
    for name in only:
        key = name.replace('knife_', '')
        build(key)
        if preview:
            from preview import render_preview
            apply_all()
            render_preview(os.path.join(out, f'{name}.png'), size=(1000, 500), angle=(0.12, 0, -0.35 if key in GUNS else -0.0))
            build(key)
        export_glb(os.path.join(out, f'{name}.glb'))
        report[name] = stats()
        print(f'{name}: {report[name]} tris')
    return report


if __name__ == '__main__':
    main(sys.argv)
