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


# ================================================================ shared parts
def shift(cmds, dx=0.0, dz=0.0, s=1.0):
    """Move/scale a side-profile path (all point pairs, arcs keep their angles)."""
    out = []
    for c in cmds:
        if c[0] == 'A':
            out.append(('A', c[1] * s + dx, c[2] * s + dz, c[3] * s, c[4], c[5]))
        else:
            v = c[1:]
            out.append((c[0], *[v[i] * s + (dx if i % 2 == 0 else dz) for i in range(len(v))]))
    return out


# AR-style pistol grip; (0, 0) is the top front corner where it meets the receiver
GRIP_AR = [('M', -0.03, 0.0), ('L', 0.0, 0.0), ('Q', -0.008, -0.048, -0.02, -0.1), ('Q', -0.026, -0.112, -0.048, -0.108),
           ('L', -0.056, -0.1), ('Q', -0.048, -0.068, -0.038, -0.048), ('Q', -0.042, -0.028, -0.03, 0.0)]


def ar_grip(M, dx, dz, mat=None, grooves=True):
    g = puffy('grip', shift(GRIP_AR, dx, dz), 0.03, mat or M['polymer'], r=0.009, rings=3)
    if grooves:
        for i in range(4):
            cut(g, cutter_box((0.05, 0.034, 0.0018), (dx - 0.022, 0, dz - 0.035 - i * 0.013), rot=(0, 0.35, 0)))
    return g


def box_mag(M, x_front, z_top, length, depth, width, rake=0.08, mat='paint', ribs=2, name='mag'):
    """Straight box magazine hanging from (x_front, z_top), raked forward by `rake`."""
    xb = x_front + rake * length
    mag = puffy(name, [('M', x_front - depth, z_top), ('L', x_front, z_top), ('L', xb, z_top - length), ('L', xb - depth, z_top - length)],
                width, M[mat], r=0.0035, rings=2)
    for i in range(ribs):
        t = (i + 1) / (ribs + 1)
        r = box(f'{name}rib{i}', (0.003, width + 0.002, length * 0.6), (x_front - depth * t + rake * length * 0.5, 0, z_top - length * 0.5),
                M[mat], bevel=0.0008, rot=(0, -math.atan(rake), 0))
        r.parent = mag
    fp = puffy(f'{name}_floor', [('M', xb - depth - 0.003, z_top - length + 0.004), ('L', xb + 0.004, z_top - length + 0.004),
                                 ('L', xb + 0.004, z_top - length - 0.008), ('L', xb - depth - 0.003, z_top - length - 0.008)],
               width + 0.004, M['polymer'], r=0.0025, rings=2)
    fp.parent = mag
    return mag


def curved_mag(M, front, front_c, front_end, back_end, back_c, back, width, mat='paint', name='mag'):
    """Curved magazine from two quadratic edges (front top → bottom, bottom → back top)."""
    mag = puffy(name, [('M', *back), ('L', *front), ('Q', *front_c, *front_end), ('L', *back_end), ('Q', *back_c, *back)],
                width, M[mat], r=0.0035, rings=2)
    fp = box(f'{name}_floor', (math.dist(front_end, back_end) + 0.006, width + 0.004, 0.008),
             ((front_end[0] + back_end[0]) / 2, 0, (front_end[1] + back_end[1]) / 2), M['polymer'], bevel=0.002,
             rot=(0, -math.atan2(front_end[1] - back_end[1], front_end[0] - back_end[0]), 0))
    fp.parent = mag
    return mag


def rod(name, a, b, r, mat, y=0.0, segs=14):
    """Round bar between two side-profile points (x, z)."""
    L = math.dist(a, b)
    o = cyl(name, r, L, ((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2), mat, axis='X', segs=segs)
    o.rotation_euler = (0, PI / 2 - math.atan2(b[1] - a[1], b[0] - a[0]), 0)
    return o


def optic(M, x0, x1, z, r_tube=0.0145, r_obj=0.024, r_eye=0.02, mount=True, name='scope'):
    """Telescopic sight along X with rings, turrets and lenses."""
    L = x1 - x0
    lathe(name, [(x0, 0.0001), (x0, r_eye), (x0 + L * 0.14, r_eye), (x0 + L * 0.22, r_tube), (x1 - L * 0.26, r_tube),
                 (x1 - L * 0.12, r_obj), (x1, r_obj), (x1, 0.0001)], M['paint'], z=z, segs=36)
    lathe(f'{name}_eye', [(x0 + 0.004, 0.0001), (x0 + 0.004, r_eye + 0.0008), (x0 + 0.014, r_eye + 0.0008), (x0 + 0.014, 0.0001)], M['rubber'], z=z, segs=36)
    cyl(f'{name}_turret', 0.01, 0.016, ((x0 + x1) / 2, 0, z + r_tube + 0.006), M['dark'], axis='Z', segs=20)
    cyl(f'{name}_wind', 0.01, 0.016, ((x0 + x1) / 2, -r_tube - 0.006, z), M['dark'], axis='Y', segs=20)
    cyl(f'{name}_lens_f', r_obj - 0.002, 0.002, (x1 - 0.001, 0, z), M['lens'], axis='X', segs=32)
    cyl(f'{name}_lens_b', r_eye - 0.002, 0.002, (x0 + 0.001, 0, z), M['lens'], axis='X', segs=32)
    if mount:
        for i, x in enumerate((x0 + L * 0.3, x1 - L * 0.34)):
            lathe(f'{name}_ring{i}', [(x - 0.009, 0.0001), (x - 0.009, r_tube + 0.003), (x + 0.009, r_tube + 0.003), (x + 0.009, 0.0001)], M['dark'], z=z)
            box(f'{name}_base{i}', (0.018, 0.026, 0.02), (x, 0, z - r_tube - 0.008), M['dark'], bevel=0.002)


def flash_hider(M, x, r, z, length=0.045, name='flash_hider'):
    fh = lathe(name, [(x, 0.0001), (x, r + 0.002), (x + 0.005, r + 0.0028), (x + length - 0.005, r + 0.0028), (x + length, r + 0.001), (x + length, 0.0001)], M['dark'], z=z)
    cut(fh, cutter_cyl(r * 0.6, 0.12, (x + length / 2, 0, z), axis='X'))
    for i in range(5):
        a = i / 5 * PI * 2 + 0.3
        cut(fh, cutter_box((length * 0.55, 0.004, 0.03), (x + length * 0.58, math.cos(a) * (r + 0.002), z + math.sin(a) * (r + 0.002)), rot=(a, 0, 0)))
    return fh


def flip_sights(M, x_rear, x_front, z):
    rs = puffy('rear_sight', [('M', x_rear - 0.016, z), ('L', x_rear + 0.016, z), ('L', x_rear + 0.011, z + 0.026), ('L', x_rear - 0.011, z + 0.026)], 0.024, M['dark'], r=0.002, rings=2)
    cut(rs, cutter_cyl(0.0035, 0.05, (x_rear, 0, z + 0.019), axis='X'))
    fs = puffy('front_sight', [('M', x_front - 0.013, z), ('L', x_front + 0.013, z), ('L', x_front + 0.008, z + 0.03), ('L', x_front - 0.006, z + 0.03)], 0.024, M['dark'], r=0.002, rings=2)
    cut(fs, cutter_box((0.04, 0.013, 0.016), (x_front, 0, z + 0.02)))
    box('fs_post', (0.003, 0.003, 0.02), (x_front, 0, z + 0.02), M['dark'], bevel=0)


def bipod_folded(M, x_hinge, x_feet, z, spread=0.013):
    box('bipod_head', (0.026, 0.036, 0.014), (x_hinge, 0, z + 0.004), M['dark'], bevel=0.003)
    for s in (-1, 1):
        rod(f'bipod_leg{s}', (x_feet, z), (x_hinge, z), 0.0045, M['dark'], y=s * spread)
        sphere(f'bipod_foot{s}', 0.007, (x_feet, s * spread, z), M['rubber'])


# ================================================================ SMGs
def mp5():
    M = mats()
    rec = section('receiver', rrect(0.044, 0.052, 0.006, cz=0.044, top_r=0.019), -0.06, 0.2, M['paint'], bevel=0.0015)
    cut(rec, cutter_box((0.05, 0.02, 0.018), (0.07, -0.023, 0.05)))
    tube('cocking_tube', 0.19, 0.33, 0.011, M['paint'], z=0.068)
    box('cocking_lever', (0.012, 0.022, 0.007), (0.27, 0.022, 0.068), M['dark'], bevel=0.0015)
    sphere('cocking_knob', 0.006, (0.27, 0.035, 0.068), M['dark'])
    lo = puffy('lower', [('M', -0.06, 0.022), ('L', 0.06, 0.022), ('L', 0.06, -0.006), ('L', -0.05, -0.006), ('Q', -0.06, -0.006, -0.06, 0.006)], 0.042, M['polymer'], r=0.004, rings=2)
    ar_grip(M, 0.0, -0.004)
    trigger_group(M, 0.0, 0.05, -0.004, 0.028, M['polymer'])
    cyl('selector', 0.006, 0.004, (-0.03, 0.022, 0.006), M['dark'], axis='Y')
    box('magwell', (0.036, 0.034, 0.03), (0.105, 0, 0.012), M['paint'], bevel=0.002)
    curved_mag(M, (0.122, 0.0), (0.128, -0.09), (0.158, -0.175), (0.126, -0.18), (0.096, -0.09), (0.09, 0.0), 0.026)
    hg = loft('handguard', [(0.198, rrect(0.05, 0.048, 0.016, cz=0.032, top_r=0.01)), (0.31, rrect(0.05, 0.048, 0.016, cz=0.032, top_r=0.01)),
                            (0.33, rrect(0.044, 0.042, 0.014, cz=0.034, top_r=0.01))], M['polymer'])
    for i in range(5):
        for s in (-1, 1):
            cut(hg, cutter_box((0.012, 0.01, 0.026), (0.215 + i * 0.022, s * 0.026, 0.03)))
    tube('barrel', 0.33, 0.39, 0.0085, M['dark'], z=0.048)
    lathe('lugs', [(0.37, 0.0001), (0.37, 0.011), (0.395, 0.011), (0.395, 0.0001)], M['dark'], z=0.048, segs=20)
    box('fs_base', (0.014, 0.016, 0.034), (0.352, 0, 0.068), M['dark'], bevel=0.002)
    torus('fs_hood', 0.011, 0.002, (0.352, 0, 0.09), M['dark'], rot=(0, PI / 2, 0))
    box('fs_post', (0.003, 0.003, 0.016), (0.352, 0, 0.088), M['dark'], bevel=0)
    box('rs_base', (0.03, 0.022, 0.02), (-0.035, 0, 0.074), M['dark'], bevel=0.002)
    cyl('rs_drum', 0.011, 0.02, (-0.035, 0, 0.088), M['dark'], axis='Y')
    st = puffy('stock', [('M', -0.06, 0.07), ('L', -0.29, 0.06), ('Q', -0.305, 0.058, -0.306, 0.04), ('L', -0.31, -0.06), ('Q', -0.3, -0.072, -0.285, -0.066),
                         ('L', -0.12, 0.0), ('Q', -0.08, 0.016, -0.06, 0.02)], 0.042, M['poly'], r=0.01, rings=3)
    cut(st, extrude('cutter', [('M', -0.2, 0.03), ('L', -0.27, 0.03), ('L', -0.275, -0.035), ('Q', -0.23, -0.02, -0.2, 0.0)], 0.1, None, bevel=0))
    puffy('buttpad', [('M', -0.304, 0.062), ('L', -0.318, 0.062), ('L', -0.322, -0.065), ('L', -0.308, -0.068)], 0.046, M['rubber'], r=0.005, rings=2)
    empty('muzzle', (0.395, 0, 0.048)); empty('grip', (-0.03, 0, -0.05)); empty('fore', (0.26, 0, 0.004))


def mp7():
    M = mats()
    rec = puffy('receiver', [('M', -0.08, 0.0), ('L', 0.15, 0.0), ('L', 0.17, 0.02), ('L', 0.17, 0.06), ('L', -0.06, 0.07), ('Q', -0.08, 0.07, -0.08, 0.05)],
                0.046, M['poly'], r=0.006, rings=3)
    for i in range(4):
        cut(rec, cutter_box((0.016, 0.06, 0.01), (0.08 + i * 0.022, 0, 0.03)))
    picatinny('rail', -0.06, 0.15, 0.068, 0.078, M)
    puffy('grip', [('M', -0.005, 0.0), ('L', 0.045, 0.0), ('L', 0.036, -0.11), ('Q', 0.034, -0.12, 0.02, -0.12), ('L', -0.004, -0.12), ('Q', -0.014, -0.118, -0.012, -0.1)],
          0.034, M['polymer'], r=0.009, rings=3)
    trigger_group(M, 0.046, 0.098, 0.0, 0.03, M['polymer'])
    box_mag(M, 0.03, -0.1, 0.07, 0.026, 0.026, rake=0.07, ribs=1)
    puffy('foregrip', [('M', 0.118, 0.0), ('L', 0.15, 0.0), ('L', 0.146, -0.072), ('Q', 0.144, -0.08, 0.135, -0.08), ('L', 0.126, -0.08), ('Q', 0.118, -0.08, 0.118, -0.072)],
          0.03, M['polymer'], r=0.008, rings=3)
    tube('barrel', 0.17, 0.215, 0.008, M['dark'], z=0.034)
    flash_hider(M, 0.212, 0.008, 0.034, length=0.035)
    for s in (-1, 1):
        rod(f'stock_rod{s}', (-0.21, 0.042), (-0.07, 0.042), 0.0055, M['dark'], y=s * 0.016)
    puffy('buttplate', [('M', -0.2, 0.066), ('L', -0.215, 0.066), ('L', -0.218, -0.03), ('L', -0.203, -0.032)], 0.05, M['polymer'], r=0.005, rings=2)
    flip_sights(M, -0.045, 0.135, 0.078)
    empty('muzzle', (0.25, 0, 0.034)); empty('grip', (0.016, 0, -0.045)); empty('fore', (0.134, 0, -0.035))


def ump45():
    M = mats()
    rec = puffy('receiver', [('M', -0.07, -0.01), ('L', 0.25, -0.01), ('L', 0.26, 0.01), ('L', 0.26, 0.055), ('L', -0.06, 0.065), ('Q', -0.07, 0.065, -0.07, 0.05)],
                0.05, M['poly'], r=0.006, rings=3)
    for i in range(3):
        for s in (-1, 1):
            cut(rec, cutter_box((0.03, 0.008, 0.008), (0.2, s * 0.025, 0.04 - i * 0.014)))
    cut(rec, cutter_box((0.05, 0.02, 0.016), (0.05, -0.025, 0.04)))
    picatinny('rail', -0.05, 0.2, 0.062, 0.072, M)
    ar_grip(M, 0.0, -0.01)
    trigger_group(M, 0.0, 0.05, -0.01, 0.03, M['polymer'])
    box_mag(M, 0.135, -0.01, 0.17, 0.034, 0.03, rake=0.16, ribs=2, mat='polymer')
    st = puffy('stock', [('M', -0.07, 0.058), ('L', -0.29, 0.054), ('Q', -0.3, 0.052, -0.3, 0.04), ('L', -0.302, -0.068), ('Q', -0.29, -0.078, -0.275, -0.072),
                         ('L', -0.09, -0.002), ('L', -0.07, 0.0)], 0.032, M['polymer'], r=0.006, rings=2)
    cut(st, extrude('cutter', [('M', -0.1, 0.04), ('L', -0.27, 0.036), ('L', -0.272, -0.05), ('L', -0.11, 0.008)], 0.1, None, bevel=0))
    puffy('buttpad', [('M', -0.298, 0.056), ('L', -0.31, 0.056), ('L', -0.312, -0.07), ('L', -0.3, -0.074)], 0.036, M['rubber'], r=0.004, rings=2)
    tube('barrel', 0.26, 0.3, 0.009, M['dark'], z=0.03)
    flash_hider(M, 0.296, 0.009, 0.03, length=0.035)
    box('rs_base', (0.03, 0.022, 0.016), (-0.03, 0, 0.078), M['dark'], bevel=0.002)
    cyl('rs_drum', 0.01, 0.018, (-0.03, 0, 0.09), M['dark'], axis='Y')
    flip_sights(M, -0.1, 0.18, 0.072)
    empty('muzzle', (0.335, 0, 0.03)); empty('grip', (-0.02, 0, -0.06)); empty('fore', (0.21, 0, -0.008))


def vector():
    M = mats()
    puffy('receiver', [('M', -0.07, 0.0), ('L', 0.07, 0.0), ('L', 0.125, -0.06), ('L', 0.205, -0.06), ('L', 0.225, -0.02), ('L', 0.225, 0.05), ('L', -0.06, 0.062),
                       ('Q', -0.07, 0.062, -0.07, 0.046)], 0.046, M['poly'], r=0.006, rings=3)
    picatinny('rail', -0.06, 0.22, 0.06, 0.07, M)
    ar_grip(M, 0.03, 0.0)
    trigger_group(M, 0.03, 0.075, 0.0, 0.03, M['polymer'])
    box_mag(M, 0.124, -0.04, 0.16, 0.028, 0.026, rake=0.04, ribs=1, mat='polymer')
    sh = lathe('shroud', [(0.22, 0.0001), (0.22, 0.015), (0.27, 0.015), (0.275, 0.012), (0.275, 0.0001)], M['paint'], z=0.024, segs=28)
    for i in range(4):
        cut(sh, cutter_cyl(0.004, 0.05, (0.232 + i * 0.011, 0, 0.024), axis='Y'))
    flash_hider(M, 0.272, 0.008, 0.024, length=0.03)
    st = puffy('stock', [('M', -0.07, 0.05), ('L', -0.25, 0.05), ('Q', -0.262, 0.048, -0.262, 0.035), ('L', -0.265, -0.06), ('Q', -0.255, -0.07, -0.24, -0.064),
                         ('L', -0.085, 0.0), ('L', -0.07, 0.004)], 0.03, M['polymer'], r=0.006, rings=2)
    cut(st, extrude('cutter', [('M', -0.1, 0.034), ('L', -0.24, 0.034), ('L', -0.243, -0.044), ('L', -0.11, 0.008)], 0.1, None, bevel=0))
    flip_sights(M, -0.04, 0.2, 0.07)
    empty('muzzle', (0.305, 0, 0.024)); empty('grip', (0.005, 0, -0.05)); empty('fore', (0.17, 0, -0.06))


def p90():
    M = mats()
    shell = puffy('shell', [('M', -0.2, 0.02), ('L', -0.2, -0.07), ('Q', -0.2, -0.092, -0.178, -0.092), ('L', -0.02, -0.092), ('Q', 0.03, -0.092, 0.06, -0.052),
                            ('L', 0.14, -0.034), ('Q', 0.18, -0.022, 0.2, 0.0), ('L', 0.22, 0.03), ('L', 0.22, 0.056), ('L', -0.18, 0.06), ('Q', -0.2, 0.06, -0.2, 0.04)],
                  0.056, M['poly'], r=0.013, rings=3)
    cut(shell, extrude('cutter', [('M', -0.125, -0.022), ('Q', -0.07, 0.0, -0.025, -0.03), ('Q', -0.005, -0.062, -0.045, -0.074), ('L', -0.12, -0.074),
                                  ('Q', -0.132, -0.05, -0.125, -0.022)], 0.2, None, bevel=0))
    cut(shell, extrude('cutter', [('M', 0.045, -0.034), ('Q', 0.075, -0.024, 0.105, -0.032), ('Q', 0.108, -0.058, 0.08, -0.06), ('Q', 0.048, -0.06, 0.045, -0.034)], 0.2, None, bevel=0))
    puffy('mag', [('M', -0.15, 0.058), ('L', 0.15, 0.058), ('L', 0.152, 0.082), ('L', -0.148, 0.084)], 0.05, M['polymer'], r=0.004, rings=2)
    box('optic_base', (0.08, 0.03, 0.026), (0.12, 0, 0.095), M['dark'], bevel=0.004)
    cyl('optic_lens', 0.011, 0.002, (0.08, 0, 0.1), M['lens'], axis='X', segs=24)
    tube('barrel', 0.22, 0.26, 0.009, M['dark'], z=0.02)
    flash_hider(M, 0.255, 0.009, 0.02, length=0.03)
    box('cocking', (0.02, 0.012, 0.008), (0.15, 0.032, 0.0), M['dark'], bevel=0.0015)
    empty('muzzle', (0.29, 0, 0.02)); empty('grip', (-0.075, 0, -0.06)); empty('fore', (0.075, 0, -0.06))


def mac10():
    M = mats()
    rec = puffy('receiver', [('M', -0.08, 0.0), ('L', 0.12, 0.0), ('L', 0.12, 0.062), ('L', -0.08, 0.062)], 0.05, M['paint'], r=0.004, rings=2)
    cut(rec, cutter_box((0.05, 0.02, 0.016), (0.03, -0.026, 0.04)))
    sphere('cocking_knob', 0.007, (0.05, 0, 0.07), M['dark'])
    puffy('grip', [('M', -0.012, 0.0), ('L', 0.046, 0.0), ('L', 0.04, -0.1), ('L', -0.018, -0.1)], 0.038, M['polymer'], r=0.008, rings=3)
    box_mag(M, 0.036, -0.092, 0.06, 0.05, 0.03, rake=0.06, ribs=1)
    trigger_group(M, 0.046, 0.1, 0.0, 0.028, M['paint'])
    tube('barrel', 0.12, 0.175, 0.009, M['dark'], z=0.034)
    for i in range(4):
        lathe(f'thread{i}', [(0.15 + i * 0.006, 0.0001), (0.15 + i * 0.006, 0.0102), (0.153 + i * 0.006, 0.0102), (0.153 + i * 0.006, 0.0001)], M['dark'], z=0.034, segs=20)
    torus('strap_loop', 0.012, 0.0022, (0.112, 0, -0.012), M['steel'], rot=(PI / 2, 0, 0))
    for s in (-1, 1):
        rod(f'wire{s}', (-0.24, 0.045), (-0.08, 0.045), 0.0035, M['steel'], y=s * 0.02)
    rod('wire_butt', (-0.24, -0.03), (-0.24, 0.05), 0.0045, M['steel'])
    box('wire_pad', (0.008, 0.046, 0.075), (-0.244, 0, 0.01), M['steel'], bevel=0.002)
    box('rear_sight', (0.012, 0.03, 0.014), (-0.06, 0, 0.068), M['dark'], bevel=0.002)
    box('front_sight', (0.01, 0.024, 0.016), (0.1, 0, 0.068), M['dark'], bevel=0.002)
    empty('muzzle', (0.175, 0, 0.034)); empty('grip', (0.016, 0, -0.045)); empty('fore', (0.1, 0, -0.012))


# ================================================================ rifles
def famas():
    M = mats()
    puffy('body', [('M', -0.32, 0.06), ('L', -0.32, -0.07), ('Q', -0.31, -0.086, -0.29, -0.08), ('L', -0.12, -0.02), ('L', 0.02, -0.02), ('L', 0.02, -0.03),
                   ('L', 0.25, -0.022), ('L', 0.262, 0.0), ('L', 0.262, 0.04), ('L', -0.29, 0.07), ('Q', -0.32, 0.07, -0.32, 0.06)], 0.052, M['poly'], r=0.01, rings=3)
    puffy('handle', [('M', -0.22, 0.055), ('Q', -0.19, 0.122, -0.12, 0.126), ('L', 0.16, 0.126), ('Q', 0.21, 0.12, 0.24, 0.045), ('L', 0.22, 0.045),
                     ('Q', 0.2, 0.106, 0.16, 0.109), ('L', -0.12, 0.109), ('Q', -0.18, 0.106, -0.2, 0.055)], 0.024, M['paint'], r=0.004, rings=2)
    box('handle_sight', (0.02, 0.016, 0.012), (-0.12, 0, 0.134), M['dark'], bevel=0.002)
    puffy('cheek', [('M', -0.3, 0.068), ('L', -0.18, 0.074), ('L', -0.18, 0.084), ('L', -0.29, 0.08)], 0.05, M['rubber'], r=0.004, rings=2)
    ar_grip(M, 0.07, -0.024)
    guard = puffy('guard', [('M', 0.07, -0.024), ('L', 0.17, -0.026), ('Q', 0.18, -0.06, 0.15, -0.105), ('L', 0.09, -0.11), ('Q', 0.07, -0.1, 0.07, -0.09)],
                  0.024, M['polymer'], r=0.004, rings=2)
    cut(guard, extrude('cutter', [('M', 0.078, -0.034), ('L', 0.16, -0.036), ('Q', 0.166, -0.062, 0.145, -0.096), ('L', 0.09, -0.1), ('Q', 0.078, -0.094, 0.078, -0.084)],
                       0.1, None, bevel=0))
    extrude('trigger', [('M', 0.088, -0.034), ('Q', 0.098, -0.05, 0.09, -0.066), ('L', 0.084, -0.062), ('Q', 0.09, -0.05, 0.083, -0.034)], 0.006, M['dark'], bevel=0.001)
    box_mag(M, -0.04, -0.03, 0.15, 0.03, 0.028, rake=0.05, ribs=2)
    tube('barrel', 0.26, 0.37, 0.009, M['dark'], z=0.02)
    lathe('launcher_ring', [(0.33, 0.0001), (0.33, 0.0115), (0.346, 0.0115), (0.346, 0.0001)], M['dark'], z=0.02)
    flash_hider(M, 0.365, 0.009, 0.02, length=0.03)
    empty('muzzle', (0.395, 0, 0.02)); empty('grip', (0.04, 0, -0.07)); empty('fore', (0.19, 0, -0.03))


def galil():
    M = mats()
    rec = puffy('receiver', [('M', -0.07, -0.008), ('L', 0.235, -0.008), ('L', 0.235, 0.056), ('L', -0.02, 0.058), ('Q', -0.06, 0.058, -0.07, 0.04)], 0.046, M['paint'], r=0.003, rings=2)
    cut(rec, cutter_box((0.075, 0.02, 0.018), (0.09, -0.023, 0.04)))
    loft('dustcover', [(-0.05, rrect(0.044, 0.02, 0.0015, cz=0.064, top_r=0.016)), (0.21, rrect(0.044, 0.02, 0.0015, cz=0.064, top_r=0.016))], M['paint'])
    box('charging', (0.012, 0.03, 0.01), (0.15, 0.032, 0.05), M['steel'], bevel=0.002)
    box('rear_sight', (0.02, 0.026, 0.026), (-0.02, 0, 0.085), M['dark'], bevel=0.003)
    hg = loft('handguard', [(0.236, rrect(0.054, 0.05, 0.014, cz=0.024)), (0.42, rrect(0.054, 0.05, 0.014, cz=0.024)), (0.44, rrect(0.048, 0.044, 0.012, cz=0.026))], M['poly'])
    for i in range(6):
        for s in (-1, 1):
            cut(hg, cutter_box((0.016, 0.01, 0.024), (0.26 + i * 0.028, s * 0.027, 0.024)))
    tube('barrel', 0.44, 0.64, 0.0105, M['dark'], z=0.03)
    tube('gas_tube', 0.44, 0.5, 0.008, M['dark'], z=0.062)
    puffy('gas_block', [('M', 0.5, 0.02), ('L', 0.53, 0.02), ('L', 0.53, 0.075), ('L', 0.5, 0.075)], 0.026, M['dark'], r=0.003, rings=2)
    fsb = puffy('fsb', [('M', 0.56, 0.02), ('L', 0.6, 0.02), ('L', 0.596, 0.098), ('L', 0.566, 0.098)], 0.026, M['dark'], r=0.003, rings=2)
    cut(fsb, cutter_box((0.02, 0.04, 0.02), (0.58, 0, 0.082)))
    cut(fsb, cutter_box((0.022, 0.012, 0.03), (0.575, 0, 0.04)))   # bottle-opener notch
    box('fs_post', (0.003, 0.003, 0.02), (0.58, 0, 0.082), M['dark'], bevel=0)
    flash_hider(M, 0.635, 0.0105, 0.03, length=0.04)
    ar_grip(M, 0.004, -0.008)
    trigger_group(M, 0.005, 0.07, -0.008, 0.034, M['paint'])
    curved_mag(M, (0.138, -0.008), (0.15, -0.11), (0.192, -0.218), (0.15, -0.238), (0.106, -0.13), (0.085, -0.008), 0.034)
    # skeletal folding stock: top and bottom tubes, butt
    rod('stock_top', (-0.3, 0.045), (-0.07, 0.045), 0.009, M['dark'])
    rod('stock_low', (-0.3, -0.07), (-0.07, 0.005), 0.009, M['dark'])
    puffy('butt', [('M', -0.296, 0.06), ('L', -0.318, 0.06), ('L', -0.322, -0.085), ('L', -0.3, -0.088)], 0.04, M['poly'], r=0.008, rings=2)
    box('hinge', (0.022, 0.05, 0.05), (-0.07, 0, 0.025), M['dark'], bevel=0.003)
    empty('muzzle', (0.675, 0, 0.03)); empty('grip', (-0.025, 0, -0.05)); empty('fore', (0.33, 0, -0.002))


def scarh():
    M = mats()
    up = extrude('upper', [('M', -0.06, 0.026), ('L', 0.32, 0.026), ('L', 0.32, 0.075), ('L', -0.06, 0.075)], 0.054, M['paint'], bevel=0.003)
    cut(up, cutter_box((0.07, 0.02, 0.02), (0.07, -0.027, 0.05)))
    for i in range(4):
        for s in (-1, 1):
            cut(up, cutter_box((0.028, 0.006, 0.012), (0.18 + i * 0.034, s * 0.027, 0.05)))
    picatinny('rail', -0.058, 0.32, 0.073, 0.083, M)
    lo = puffy('lower', [('M', -0.06, 0.028), ('L', 0.155, 0.028), ('L', 0.155, -0.01), ('L', 0.135, -0.042), ('L', 0.06, -0.042), ('L', 0.055, -0.012),
                         ('L', -0.04, -0.012), ('Q', -0.06, -0.01, -0.06, 0.01)], 0.05, M['poly'], r=0.004, rings=2)
    cut(lo, cutter_box((0.07, 0.06, 0.03), (0.098, 0, -0.035)))
    ar_grip(M, 0.0, -0.012)
    trigger_group(M, 0.008, 0.058, -0.012, 0.03, M['polymer'])
    box_mag(M, 0.132, -0.032, 0.125, 0.064, 0.032, rake=0.08, ribs=2)
    box('charging', (0.016, 0.026, 0.012), (0.2, 0.034, 0.06), M['dark'], bevel=0.002)
    tube('barrel', 0.32, 0.47, 0.011, M['dark'], z=0.05)
    lathe('gas_block', [(0.33, 0.0001), (0.33, 0.016), (0.35, 0.016), (0.35, 0.0001)], M['dark'], z=0.05, segs=20)
    flash_hider(M, 0.465, 0.011, 0.05, length=0.045)
    st = puffy('stock', [('M', -0.06, 0.072), ('L', -0.3, 0.072), ('Q', -0.316, 0.07, -0.318, 0.052), ('L', -0.322, -0.07), ('Q', -0.31, -0.08, -0.295, -0.07),
                         ('L', -0.12, 0.0), ('L', -0.06, 0.02)], 0.048, M['polymer'], r=0.009, rings=3)
    cut(st, extrude('cutter', [('M', -0.14, 0.04), ('L', -0.26, 0.04), ('L', -0.27, -0.03), ('L', -0.16, 0.004)], 0.1, None, bevel=0))
    puffy('cheek', [('M', -0.16, 0.07), ('L', -0.29, 0.07), ('Q', -0.3, 0.084, -0.284, 0.09), ('L', -0.17, 0.088), ('Q', -0.16, 0.08, -0.16, 0.07)], 0.046, M['polymer'], r=0.008, rings=3)
    puffy('buttpad', [('M', -0.318, 0.068), ('L', -0.334, 0.068), ('L', -0.338, -0.074), ('L', -0.322, -0.077)], 0.052, M['rubber'], r=0.006, rings=3)
    box('hinge', (0.02, 0.05, 0.05), (-0.064, 0, 0.045), M['dark'], bevel=0.003)
    flip_sights(M, -0.03, 0.3, 0.083)
    empty('muzzle', (0.51, 0, 0.05)); empty('grip', (-0.02, 0, -0.05)); empty('fore', (0.25, 0, 0.02))


def sg550():
    M = mats()
    rec = puffy('receiver', [('M', -0.06, -0.005), ('L', 0.22, -0.005), ('L', 0.22, 0.06), ('L', -0.05, 0.066), ('Q', -0.06, 0.066, -0.06, 0.05)], 0.048, M['paint'], r=0.004, rings=2)
    cut(rec, cutter_box((0.07, 0.02, 0.018), (0.08, -0.024, 0.04)))
    picatinny('rail', -0.05, 0.2, 0.064, 0.074, M)
    hg = loft('handguard', [(0.218, rrect(0.052, 0.05, 0.013, cz=0.03)), (0.41, rrect(0.052, 0.05, 0.013, cz=0.03)), (0.425, rrect(0.046, 0.044, 0.012, cz=0.032))], M['poly'])
    for i in range(5):
        for s in (-1, 1):
            cut(hg, cutter_box((0.02, 0.008, 0.012), (0.245 + i * 0.034, s * 0.026, 0.038)))
    bipod_folded(M, 0.4, 0.24, -0.003)
    tube('barrel', 0.42, 0.62, 0.009, M['dark'], z=0.035)
    flash_hider(M, 0.615, 0.009, 0.035, length=0.04)
    ar_grip(M, 0.0, -0.005)
    trigger_group(M, 0.002, 0.06, -0.005, 0.032, M['paint'])
    curved_mag(M, (0.124, -0.005), (0.134, -0.1), (0.164, -0.19), (0.124, -0.205), (0.094, -0.1), (0.082, -0.005), 0.03, mat='polymer')
    st = puffy('stock', [('M', -0.06, 0.06), ('L', -0.3, 0.056), ('Q', -0.316, 0.054, -0.318, 0.038), ('L', -0.322, -0.08), ('Q', -0.31, -0.09, -0.295, -0.082),
                         ('L', -0.1, -0.01), ('L', -0.06, 0.0)], 0.036, M['poly'], r=0.007, rings=2)
    cut(st, extrude('cutter', [('M', -0.1, 0.044), ('L', -0.29, 0.04), ('L', -0.295, -0.06), ('L', -0.12, 0.004)], 0.1, None, bevel=0))
    optic(M, -0.06, 0.18, 0.112, r_tube=0.0125, r_obj=0.02, r_eye=0.018)
    empty('muzzle', (0.655, 0, 0.035)); empty('grip', (-0.02, 0, -0.05)); empty('fore', (0.32, 0, 0.004))


def aug():
    M = mats()
    puffy('body', [('M', -0.3, 0.055), ('L', -0.3, -0.06), ('Q', -0.29, -0.078, -0.27, -0.074), ('L', -0.08, -0.03), ('L', 0.02, -0.03), ('L', 0.06, -0.034),
                   ('L', 0.2, -0.02), ('L', 0.222, 0.0), ('L', 0.222, 0.05), ('L', -0.27, 0.066), ('Q', -0.3, 0.066, -0.3, 0.055)], 0.058, M['poly'], r=0.014, rings=3)
    guard = puffy('guard', [('M', 0.02, -0.03), ('L', 0.11, -0.032), ('Q', 0.13, -0.07, 0.11, -0.12), ('L', 0.03, -0.122), ('L', 0.02, -0.11)], 0.03, M['poly'], r=0.006, rings=2)
    cut(guard, extrude('cutter', [('M', 0.045, -0.04), ('L', 0.1, -0.042), ('Q', 0.112, -0.07, 0.098, -0.108), ('L', 0.05, -0.108), ('L', 0.045, -0.1)], 0.1, None, bevel=0))
    extrude('trigger', [('M', 0.052, -0.042), ('Q', 0.062, -0.06, 0.055, -0.076), ('L', 0.048, -0.072), ('Q', 0.054, -0.06, 0.047, -0.042)], 0.006, M['dark'], bevel=0.001)
    puffy('foregrip', [('M', 0.14, -0.024), ('L', 0.175, -0.022), ('L', 0.172, -0.1), ('Q', 0.17, -0.11, 0.158, -0.11), ('L', 0.15, -0.11), ('Q', 0.14, -0.11, 0.14, -0.1)],
          0.032, M['polymer'], r=0.009, rings=3)
    box_mag(M, -0.02, -0.03, 0.15, 0.03, 0.028, rake=0.1, ribs=0, mat='polymer')
    loft('scope_mount', [(-0.12, rrect(0.03, 0.03, 0.008, cz=0.075)), (0.1, rrect(0.03, 0.03, 0.008, cz=0.075))], M['poly'])
    optic(M, -0.12, 0.12, 0.104, r_tube=0.016, r_obj=0.022, r_eye=0.02, mount=False)
    tube('barrel', 0.222, 0.36, 0.0095, M['dark'], z=0.02)
    tube('gas_cyl', 0.222, 0.3, 0.007, M['dark'], z=0.04)
    flash_hider(M, 0.355, 0.0095, 0.02, length=0.035)
    empty('muzzle', (0.39, 0, 0.02)); empty('grip', (0.03, 0, -0.075)); empty('fore', (0.158, 0, -0.07))


# ================================================================ snipers
def scout():
    M = mats()
    puffy('stock', [('M', 0.3, 0.03), ('L', -0.1, 0.03), ('L', -0.12, 0.045), ('Q', -0.28, 0.058, -0.52, 0.052), ('Q', -0.54, 0.05, -0.542, 0.035),
                    ('L', -0.55, -0.09), ('Q', -0.54, -0.108, -0.52, -0.104), ('L', -0.26, -0.05), ('Q', -0.18, -0.04, -0.15, -0.085), ('L', -0.13, -0.11),
                    ('Q', -0.115, -0.12, -0.095, -0.11), ('L', -0.06, -0.035), ('L', 0.3, -0.025), ('Q', 0.315, -0.02, 0.315, 0.0), ('Q', 0.313, 0.03, 0.3, 0.03)],
          0.05, M['poly'], r=0.012, rings=3)
    puffy('buttpad', [('M', -0.54, 0.05), ('L', -0.56, 0.05), ('L', -0.568, -0.1), ('L', -0.548, -0.106)], 0.054, M['rubber'], r=0.006, rings=2)
    trigger_group(M, -0.07, -0.015, -0.03, 0.03, M['polymer'])
    rec = tube('receiver', -0.12, 0.15, 0.019, M['dark'], z=0.048)
    cut(rec, cutter_box((0.07, 0.03, 0.016), (0.03, -0.018, 0.055)))
    tube('bolt_shroud', -0.15, -0.115, 0.013, M['steel'], z=0.048)
    bolt = empty('bolt', (-0.08, 0, 0.047))
    stem = cyl('bolt_stem', 0.004, 0.05, (0, -0.026, 0), M['steel'], axis='Y'); stem.parent = bolt
    knob = sphere('bolt_knob', 0.009, (0, -0.052, -0.004), M['dark']); knob.parent = bolt
    bolt.rotation_euler = (-0.35, 0, 0)
    puffy('mag', [('M', -0.02, -0.03), ('L', 0.04, -0.03), ('L', 0.038, -0.07), ('L', -0.018, -0.07)], 0.04, M['polymer'], r=0.004, rings=2)
    lathe('barrel', [(0.15, 0.0001), (0.15, 0.015), (0.24, 0.013), (0.64, 0.0095), (0.64, 0.0001)], M['dark'], z=0.048, segs=32)
    lathe('crown', [(0.632, 0.0001), (0.632, 0.0115), (0.652, 0.0115), (0.652, 0.0001)], M['dark'], z=0.048)
    bipod_folded(M, 0.27, 0.1, -0.034)
    optic(M, -0.13, 0.17, 0.104, r_tube=0.0135, r_obj=0.022, r_eye=0.019)
    torus('sling_rear', 0.008, 0.0016, (-0.42, 0, -0.088), M['steel'], rot=(0, 0, 0))
    empty('muzzle', (0.655, 0, 0.048)); empty('grip', (-0.1, 0, -0.055)); empty('fore', (0.18, 0, -0.012))


def dmr():
    M = mats()
    up = extrude('upper', [('M', -0.06, 0.02), ('L', 0.19, 0.02), ('L', 0.19, 0.078), ('L', -0.05, 0.078), ('Q', -0.06, 0.073, -0.06, 0.058)], 0.054, M['paint'], bevel=0.003)
    cut(up, cutter_box((0.07, 0.02, 0.022), (0.075, -0.027, 0.048)))
    cyl('fwd_assist', 0.008, 0.024, (0.0, -0.032, 0.06), M['dark'], axis='Y', bevel=0.001)
    picatinny('rail', -0.055, 0.5, 0.076, 0.086, M)
    lo = puffy('lower', [('M', -0.06, 0.022), ('L', 0.145, 0.022), ('L', 0.145, -0.012), ('L', 0.128, -0.045), ('L', 0.05, -0.045), ('L', 0.046, -0.015),
                         ('L', -0.035, -0.012), ('Q', -0.06, -0.01, -0.06, 0.01)], 0.052, M['paint'], r=0.0035, rings=2)
    cut(lo, cutter_box((0.07, 0.06, 0.03), (0.09, 0, -0.038)))
    ar_grip(M, 0.0, -0.012)
    trigger_group(M, 0.008, 0.06, -0.012, 0.03, M['paint'])
    box_mag(M, 0.128, -0.035, 0.1, 0.07, 0.032, rake=0.06, ribs=2)
    hgs = rrect(0.06, 0.06, 0.016, cz=0.046)
    hg = loft('handguard', [(0.19, rrect(0.056, 0.056, 0.014, cz=0.046)), (0.196, hgs), (0.49, hgs), (0.5, rrect(0.056, 0.056, 0.014, cz=0.046))], M['paint'])
    for i in range(6):
        for s in (-1, 1):
            cut(hg, cutter_box((0.03, 0.012, 0.0075), (0.225 + i * 0.044, s * 0.03, 0.046)))
    tube('barrel', 0.49, 0.7, 0.0105, M['dark'], z=0.046)
    mb = lathe('muzzle_brake', [(0.695, 0.0001), (0.695, 0.015), (0.745, 0.015), (0.75, 0.012), (0.75, 0.0001)], M['dark'], z=0.046)
    for i in range(3):
        cut(mb, cutter_box((0.008, 0.05, 0.022), (0.708 + i * 0.013, 0, 0.046)))
    cut(mb, cutter_cyl(0.006, 0.2, (0.72, 0, 0.046), axis='X'))
    tube('buffer_tube', -0.29, -0.055, 0.016, M['dark'], z=0.048)
    st = puffy('stock', [('M', -0.1, 0.07), ('L', -0.36, 0.068), ('Q', -0.374, 0.066, -0.376, 0.048), ('L', -0.38, -0.075), ('Q', -0.37, -0.086, -0.354, -0.08),
                         ('L', -0.14, 0.004), ('Q', -0.11, 0.016, -0.1, 0.03)], 0.05, M['poly'], r=0.011, rings=3)
    puffy('cheek', [('M', -0.16, 0.068), ('L', -0.35, 0.066), ('Q', -0.36, 0.08, -0.344, 0.088), ('L', -0.17, 0.088), ('Q', -0.16, 0.08, -0.16, 0.068)], 0.048, M['poly'], r=0.009, rings=3)
    puffy('buttpad', [('M', -0.376, 0.066), ('L', -0.392, 0.066), ('L', -0.396, -0.08), ('L', -0.38, -0.083)], 0.054, M['rubber'], r=0.006, rings=3)
    bipod_folded(M, 0.47, 0.3, 0.004)
    optic(M, -0.08, 0.22, 0.125, r_tube=0.015, r_obj=0.026, r_eye=0.021)
    empty('muzzle', (0.755, 0, 0.046)); empty('grip', (-0.02, 0, -0.05)); empty('fore', (0.33, 0, 0.016))


# ================================================================ shotguns
def pump():
    M = mats()
    rec = puffy('receiver', [('M', -0.05, 0.0), ('L', 0.12, 0.0), ('L', 0.12, 0.062), ('L', -0.04, 0.066), ('Q', -0.05, 0.066, -0.05, 0.05)], 0.044, M['paint'], r=0.004, rings=2)
    cut(rec, cutter_box((0.06, 0.02, 0.022), (0.05, -0.022, 0.04)))
    tube('barrel', 0.12, 0.56, 0.0115, M['dark'], z=0.048)
    sphere('bead', 0.0028, (0.552, 0, 0.061), M['brass'])
    tube('mag_tube', 0.12, 0.47, 0.0105, M['dark'], z=0.02)
    lathe('mag_cap', [(0.47, 0.0001), (0.47, 0.0125), (0.5, 0.0125), (0.505, 0.009), (0.505, 0.0001)], M['dark'], z=0.02)
    box('barrel_clamp', (0.016, 0.026, 0.044), (0.47, 0, 0.034), M['dark'], bevel=0.003)
    pmp = loft('pump', [(0.19, rrect(0.04, 0.036, 0.014, cz=0.02)), (0.2, rrect(0.046, 0.042, 0.017, cz=0.02)), (0.35, rrect(0.046, 0.042, 0.017, cz=0.02)),
                        (0.36, rrect(0.04, 0.036, 0.014, cz=0.02))], M['poly'])
    for i in range(8):
        cut(pmp, cutter_box((0.006, 0.06, 0.008), (0.215 + i * 0.017, 0, -0.002)))
    rod('action_bar', (0.12, 0.03), (0.2, 0.03), 0.003, M['steel'], y=0.016)
    puffy('stock', [('M', -0.05, 0.056), ('L', -0.36, 0.036), ('Q', -0.375, 0.034, -0.378, 0.016), ('L', -0.382, -0.09), ('Q', -0.372, -0.106, -0.352, -0.1),
                    ('L', -0.12, -0.03), ('Q', -0.07, -0.018, -0.05, 0.0)], 0.042, M['poly'], r=0.012, rings=3)
    puffy('buttpad', [('M', -0.375, 0.036), ('L', -0.392, 0.036), ('L', -0.396, -0.096), ('L', -0.38, -0.1)], 0.046, M['rubber'], r=0.006, rings=2)
    trigger_group(M, -0.02, 0.04, 0.0, 0.028, M['paint'])
    empty('muzzle', (0.56, 0, 0.048)); empty('grip', (-0.075, 0, -0.022)); empty('fore', (0.28, 0, 0.0))


def m1014():
    M = mats()
    rec = puffy('receiver', [('M', -0.06, -0.005), ('L', 0.16, -0.005), ('L', 0.16, 0.06), ('L', -0.05, 0.068), ('Q', -0.06, 0.068, -0.06, 0.05)], 0.046, M['paint'], r=0.004, rings=2)
    cut(rec, cutter_box((0.07, 0.02, 0.024), (0.06, -0.023, 0.035)))
    picatinny('rail', -0.05, 0.15, 0.066, 0.076, M)
    torus('ghost_ring', 0.008, 0.0025, (-0.03, 0, 0.094), M['dark'], rot=(0, PI / 2, 0))
    box('ghost_base', (0.022, 0.028, 0.012), (-0.03, 0, 0.082), M['dark'], bevel=0.002)
    tube('barrel', 0.16, 0.54, 0.0115, M['dark'], z=0.048)
    tube('mag_tube', 0.16, 0.45, 0.011, M['dark'], z=0.018)
    lathe('mag_cap', [(0.45, 0.0001), (0.45, 0.013), (0.48, 0.013), (0.485, 0.009), (0.485, 0.0001)], M['dark'], z=0.018)
    fe = loft('forend', [(0.16, rrect(0.048, 0.062, 0.016, cz=0.034)), (0.33, rrect(0.048, 0.062, 0.016, cz=0.034)), (0.345, rrect(0.042, 0.054, 0.014, cz=0.034))], M['poly'])
    for i in range(7):
        cut(fe, cutter_box((0.008, 0.06, 0.006), (0.18 + i * 0.022, 0, 0.003)))
    fsb = puffy('front_sight', [('M', 0.505, 0.056), ('L', 0.535, 0.056), ('L', 0.53, 0.082), ('L', 0.51, 0.082)], 0.026, M['dark'], r=0.002, rings=2)
    cut(fsb, cutter_box((0.04, 0.014, 0.016), (0.52, 0, 0.078)))
    box('fs_post', (0.003, 0.003, 0.018), (0.52, 0, 0.074), M['dark'], bevel=0)
    ar_grip(M, 0.0, -0.005)
    trigger_group(M, 0.006, 0.058, -0.005, 0.03, M['paint'])
    tube('buffer_tube', -0.27, -0.06, 0.016, M['dark'], z=0.045)
    puffy('stock', [('M', -0.17, 0.07), ('L', -0.305, 0.07), ('Q', -0.318, 0.068, -0.32, 0.052), ('L', -0.324, -0.07), ('Q', -0.312, -0.08, -0.297, -0.07),
                    ('L', -0.205, -0.004), ('Q', -0.18, 0.016, -0.17, 0.036)], 0.05, M['poly'], r=0.01, rings=3)
    puffy('buttpad', [('M', -0.318, 0.065), ('L', -0.336, 0.065), ('L', -0.34, -0.075), ('L', -0.324, -0.078)], 0.052, M['rubber'], r=0.006, rings=3)
    empty('muzzle', (0.54, 0, 0.048)); empty('grip', (-0.03, 0, -0.055)); empty('fore', (0.25, 0, 0.004))


def dbarrel():
    M = mats()
    for s in (-1, 1):
        tube(f'barrel{s}', 0.04, 0.4, 0.0118, M['dark'], z=0.035, y=s * 0.0118)
    box('rib', (0.36, 0.008, 0.006), (0.22, 0, 0.05), M['dark'], bevel=0.001)
    sphere('bead', 0.0026, (0.395, 0, 0.055), M['brass'])
    puffy('action', [('M', -0.06, 0.0), ('L', 0.05, 0.0), ('L', 0.05, 0.058), ('L', -0.04, 0.06), ('Q', -0.06, 0.06, -0.06, 0.045)], 0.05, M['paint'], r=0.005, rings=2)
    box('top_lever', (0.03, 0.01, 0.006), (-0.04, 0.006, 0.064), M['steel'], bevel=0.0015, rot=(0, 0, 0.4))
    for s in (-1, 1):
        extrude(f'hammer{s}', [('M', -0.05, 0.05), ('L', -0.035, 0.05), ('Q', -0.04, 0.07, -0.062, 0.074), ('L', -0.064, 0.068), ('Q', -0.048, 0.064, -0.05, 0.05)],
                0.006, M['steel'], y=s * 0.01, bevel=0.001)
    puffy('forend', [('M', 0.06, 0.02), ('L', 0.24, 0.02), ('Q', 0.25, 0.008, 0.24, -0.006), ('L', 0.07, -0.008), ('Q', 0.058, 0.004, 0.06, 0.02)], 0.046, M['wood'], r=0.012, rings=3)
    puffy('stock', [('M', -0.06, 0.05), ('L', -0.36, 0.03), ('Q', -0.38, 0.028, -0.382, 0.01), ('L', -0.385, -0.09), ('Q', -0.375, -0.105, -0.355, -0.1),
                    ('L', -0.14, -0.03), ('Q', -0.08, -0.01, -0.06, 0.0)], 0.042, M['wood'], r=0.012, rings=3)
    puffy('buttplate', [('M', -0.38, 0.03), ('L', -0.392, 0.03), ('L', -0.396, -0.094), ('L', -0.384, -0.1)], 0.044, M['dark'], r=0.004, rings=2)
    trigger_group(M, -0.035, 0.02, 0.0, 0.026, M['paint'])
    extrude('trigger2', [('M', -0.005, 0.0), ('Q', 0.003, -0.012, -0.004, -0.02), ('L', -0.009, -0.018), ('Q', -0.003, -0.01, -0.01, 0.0)], 0.006, M['dark'], bevel=0.001)
    empty('muzzle', (0.4, 0, 0.035)); empty('grip', (-0.09, 0, -0.026)); empty('fore', (0.15, 0, -0.004))


# ================================================================ machine guns
def m249():
    M = mats()
    rec = puffy('receiver', [('M', -0.07, -0.006), ('L', 0.26, -0.006), ('L', 0.26, 0.07), ('L', -0.06, 0.076), ('Q', -0.07, 0.076, -0.07, 0.06)], 0.06, M['paint'], r=0.004, rings=2)
    cut(rec, cutter_box((0.08, 0.02, 0.024), (0.12, -0.03, 0.035)))
    puffy('feed_cover', [('M', -0.02, 0.072), ('L', 0.19, 0.072), ('L', 0.19, 0.088), ('L', 0.0, 0.094), ('L', -0.02, 0.088)], 0.058, M['dark'], r=0.004, rings=2)
    picatinny('rail', 0.0, 0.18, 0.092, 0.1, M, w=0.02)
    puffy('mag', [('M', 0.05, -0.004), ('L', 0.18, -0.004), ('L', 0.175, -0.13), ('L', 0.055, -0.13)], 0.078, M['polymer'], y=0.01, r=0.006, rings=2)
    hg = loft('handguard', [(0.26, rrect(0.058, 0.05, 0.012, cz=0.018)), (0.42, rrect(0.058, 0.05, 0.012, cz=0.018)), (0.43, rrect(0.052, 0.044, 0.011, cz=0.02))], M['poly'])
    for i in range(5):
        cut(hg, cutter_box((0.018, 0.07, 0.008), (0.285 + i * 0.028, 0, 0.003)))
    tube('barrel', 0.26, 0.67, 0.012, M['dark'], z=0.046)
    loft('heat_shield', [(0.27, rrect(0.034, 0.012, 0.004, cz=0.064)), (0.42, rrect(0.034, 0.012, 0.004, cz=0.064))], M['dark'])
    tube('gas_tube', 0.43, 0.58, 0.009, M['dark'], z=0.02)
    bipod_folded(M, 0.56, 0.42, 0.006, spread=0.016)
    puffy('carry_handle', [('M', 0.33, 0.062), ('Q', 0.33, 0.1, 0.36, 0.105), ('L', 0.42, 0.105), ('Q', 0.45, 0.1, 0.45, 0.062), ('L', 0.44, 0.062),
                           ('Q', 0.44, 0.094, 0.42, 0.095), ('L', 0.36, 0.095), ('Q', 0.34, 0.094, 0.34, 0.062)], 0.012, M['dark'], y=0.02, r=0.002, rings=1)
    fs = puffy('front_sight', [('M', 0.62, 0.056), ('L', 0.645, 0.056), ('L', 0.64, 0.09), ('L', 0.625, 0.09)], 0.016, M['dark'], r=0.002, rings=1)
    flash_hider(M, 0.665, 0.012, 0.046, length=0.045)
    ar_grip(M, 0.004, -0.006)
    trigger_group(M, 0.006, 0.07, -0.006, 0.034, M['paint'])
    st = puffy('stock', [('M', -0.07, 0.066), ('L', -0.33, 0.06), ('Q', -0.348, 0.058, -0.35, 0.04), ('L', -0.354, -0.08), ('Q', -0.344, -0.092, -0.326, -0.086),
                         ('L', -0.14, -0.012), ('Q', -0.09, 0.0, -0.07, 0.006)], 0.05, M['poly'], r=0.012, rings=3)
    cut(st, extrude('cutter', [('M', -0.16, 0.036), ('L', -0.31, 0.034), ('L', -0.316, -0.05), ('L', -0.18, -0.004)], 0.1, None, bevel=0))
    puffy('buttpad', [('M', -0.348, 0.062), ('L', -0.364, 0.062), ('L', -0.368, -0.085), ('L', -0.352, -0.088)], 0.054, M['rubber'], r=0.006, rings=3)
    empty('muzzle', (0.715, 0, 0.046)); empty('grip', (-0.025, 0, -0.055)); empty('fore', (0.34, 0, -0.006))


def pkm():
    M = mats()
    rec = puffy('receiver', [('M', -0.08, -0.006), ('L', 0.24, -0.006), ('L', 0.24, 0.066), ('L', -0.07, 0.07), ('Q', -0.08, 0.07, -0.08, 0.055)], 0.052, M['paint'], r=0.003, rings=2)
    cut(rec, cutter_box((0.07, 0.02, 0.02), (0.1, -0.026, 0.035)))
    rivets('rivet', [(-0.06, 0.006), (0.02, 0.006), (0.2, 0.006), (0.2, 0.05)], M, y=0.0265)
    puffy('feed_cover', [('M', -0.03, 0.066), ('L', 0.2, 0.066), ('L', 0.2, 0.082), ('L', 0.0, 0.088), ('L', -0.03, 0.082)], 0.05, M['dark'], r=0.004, rings=2)
    box('rear_sight', (0.03, 0.022, 0.02), (0.21, 0, 0.09), M['dark'], bevel=0.002)
    bar = lathe('barrel', [(0.24, 0.0001), (0.24, 0.0135), (0.66, 0.0115), (0.66, 0.0001)], M['dark'], z=0.035, segs=32)
    for i in range(6):
        a = i / 6 * PI * 2
        cut(bar, cutter_box((0.3, 0.004, 0.004), (0.46, math.cos(a) * 0.0125, 0.035 + math.sin(a) * 0.0125), rot=(a, 0, 0)))
    tube('gas_tube', 0.24, 0.52, 0.009, M['dark'], z=0.008)
    box('gas_block', (0.03, 0.03, 0.045), (0.52, 0, 0.022), M['dark'], bevel=0.003)
    bipod_folded(M, 0.51, 0.34, -0.006, spread=0.015)
    puffy('carry_handle', [('M', 0.3, 0.048), ('Q', 0.3, 0.085, 0.33, 0.09), ('L', 0.39, 0.09), ('Q', 0.42, 0.085, 0.42, 0.048), ('L', 0.41, 0.048),
                           ('Q', 0.41, 0.079, 0.39, 0.08), ('L', 0.33, 0.08), ('Q', 0.31, 0.079, 0.31, 0.048)], 0.014, M['woodd'], r=0.003, rings=1)
    fs = puffy('front_sight', [('M', 0.62, 0.044), ('L', 0.645, 0.044), ('L', 0.64, 0.08), ('L', 0.625, 0.08)], 0.016, M['dark'], r=0.002, rings=1)
    fh = lathe('flash_hider', [(0.66, 0.0001), (0.66, 0.013), (0.73, 0.016), (0.735, 0.0001)], M['dark'], z=0.035)
    for i in range(4):
        a = i / 4 * PI * 2
        cut(fh, cutter_box((0.05, 0.004, 0.04), (0.705, math.cos(a) * 0.014, 0.035 + math.sin(a) * 0.014), rot=(a, 0, 0)))
    puffy('grip', shift(GRIP_AR, 0.004, -0.006), 0.032, M['wood'], r=0.009, rings=3)
    trigger_group(M, 0.006, 0.07, -0.006, 0.034, M['paint'])
    st = puffy('stock', [('M', -0.08, 0.06), ('L', -0.36, 0.04), ('Q', -0.38, 0.038, -0.382, 0.02), ('L', -0.39, -0.09), ('Q', -0.38, -0.105, -0.36, -0.1),
                         ('L', -0.12, -0.03), ('L', -0.08, -0.006)], 0.042, M['wood'], r=0.011, rings=3)
    cut(st, extrude('cutter', [('M', -0.14, 0.022), ('L', -0.33, 0.01), ('L', -0.336, -0.072), ('L', -0.16, -0.026)], 0.1, None, bevel=0))
    puffy('buttplate', [('M', -0.378, 0.04), ('L', -0.392, 0.04), ('L', -0.398, -0.095), ('L', -0.386, -0.1)], 0.046, M['dark'], r=0.004, rings=2)
    mag = puffy('mag', [('M', 0.05, -0.006), ('L', 0.17, -0.006), ('L', 0.168, -0.11), ('L', 0.052, -0.11)], 0.07, M['dark'], r=0.004, rings=2)
    for i in range(5):
        c = box(f'link{i}', (0.012, 0.006, 0.01), (0.07 + i * 0.016, 0.03, -0.0), M['brass'], bevel=0.001)
        c.parent = mag
    empty('muzzle', (0.735, 0, 0.035)); empty('grip', (-0.03, 0, -0.055)); empty('fore', (0.2, 0, -0.012))


# ================================================================ pistols
def m1911():
    M, top = pistol(0.17, 0.03, 0.15, 0.24, 0.105, slide_w=0.026)
    for s in (-1, 1):
        p = puffy(f'grip_panel{s}', [('M', -0.012, -0.012), ('L', -0.034, -0.096), ('L', -0.062, -0.094), ('L', -0.044, -0.014)], 0.004, M['woodd'], y=s * 0.0145, r=0.0015, rings=1)
        for k in range(4):
            cut(p, cutter_box((0.026, 0.004, 0.0012), (-0.036 - k * 0.004, s * 0.016, -0.03 - k * 0.016), rot=(0, -0.25, 0)))
    box('hammer', (0.01, 0.008, 0.014), (-0.034, 0, top - 0.002), M['dark'], bevel=0.001, rot=(0, -0.3, 0))
    puffy('beavertail', [('M', -0.03, 0.012), ('Q', -0.05, 0.014, -0.056, 0.004), ('L', -0.05, -0.002), ('L', -0.03, 0.004)], 0.02, M['poly'], r=0.003, rings=1)
    empty('muzzle', (0.175, 0, 0.03)); empty('grip', (-0.02, 0, -0.04))


def fiveseven():
    M, top = pistol(0.17, 0.03, 0.155, 0.27, 0.11, slide_w=0.027)
    for s in (-1, 1):
        box(f'slide_flat{s}', (0.09, 0.002, 0.012), (0.09, s * 0.0135, top - 0.008), M['dark'], bevel=0.0005)
    empty('muzzle', (0.175, 0, 0.03)); empty('grip', (-0.02, 0, -0.042))


def vz61():
    M = mats()
    rec = section('receiver', rrect(0.034, 0.042, 0.006, cz=0.042, top_r=0.012), -0.07, 0.12, M['paint'], bevel=0.0012)
    cut(rec, cutter_box((0.04, 0.02, 0.014), (0.04, -0.018, 0.05)))
    for s in (-1, 1):
        sphere(f'cocking{s}', 0.0045, (0.0, s * 0.02, 0.05), M['dark'])
    puffy('grip', [('M', -0.062, 0.022), ('L', -0.03, 0.022), ('Q', -0.036, -0.03, -0.044, -0.07), ('Q', -0.05, -0.08, -0.064, -0.078), ('L', -0.07, -0.074),
                   ('Q', -0.066, -0.03, -0.062, 0.022)], 0.03, M['wood'], r=0.009, rings=3)
    trigger_group(M, -0.03, 0.02, 0.022, 0.028, M['paint'])
    curved_mag(M, (0.062, 0.022), (0.068, -0.05), (0.096, -0.11), (0.074, -0.118), (0.044, -0.05), (0.038, 0.022), 0.022)
    tube('barrel', 0.12, 0.16, 0.0075, M['dark'], z=0.045)
    puffy('front_sight', [('M', 0.104, 0.06), ('L', 0.12, 0.06), ('L', 0.118, 0.074), ('L', 0.108, 0.074)], 0.016, M['dark'], r=0.002, rings=1)
    box('rear_sight', (0.012, 0.018, 0.01), (-0.05, 0, 0.066), M['dark'], bevel=0.002)
    for s in (-1, 1):
        rod(f'wire{s}', (-0.068, 0.072), (0.09, 0.072), 0.0025, M['steel'], y=s * 0.012)
    rod('wire_end', (0.09, 0.064), (0.09, 0.08), 0.0028, M['steel'])
    empty('muzzle', (0.165, 0, 0.045)); empty('grip', (-0.05, 0, -0.03))


def revolver():
    M = mats()
    fr = puffy('frame', [('M', -0.035, 0.018), ('L', 0.066, 0.018), ('L', 0.066, 0.07), ('L', -0.01, 0.074), ('Q', -0.03, 0.074, -0.038, 0.05)], 0.028, M['paint'], r=0.004, rings=2)
    cut(fr, cutter_box((0.05, 0.05, 0.044), (0.029, 0, 0.046)))   # window for the cylinder
    cylg = lathe('cylinder', [(0.006, 0.0001), (0.006, 0.017), (0.01, 0.0195), (0.05, 0.0195), (0.052, 0.017), (0.052, 0.0001)], M['steel'], z=0.046, segs=36)
    for i in range(6):
        a = i / 6 * PI * 2
        cut(cylg, cutter_cyl(0.0045, 0.04, (0.03, math.cos(a) * 0.021, 0.046 + math.sin(a) * 0.021), axis='X'))
        cut(cylg, cutter_cyl(0.0035, 0.06, (0.006, math.cos(a + PI / 6) * 0.011, 0.046 + math.sin(a + PI / 6) * 0.011), axis='X'))
    tube('barrel', 0.066, 0.2, 0.0085, M['paint'], z=0.05)
    puffy('underlug', [('M', 0.066, 0.042), ('L', 0.2, 0.042), ('L', 0.2, 0.034), ('L', 0.08, 0.03), ('L', 0.066, 0.03)], 0.016, M['paint'], r=0.003, rings=2)
    rib = puffy('top_rib', [('M', 0.066, 0.056), ('L', 0.2, 0.056), ('L', 0.2, 0.064), ('L', 0.066, 0.064)], 0.01, M['paint'], r=0.002, rings=1)
    puffy('front_sight', [('M', 0.18, 0.06), ('L', 0.196, 0.06), ('L', 0.194, 0.072), ('L', 0.184, 0.072)], 0.004, M['dark'], r=0.001, rings=1)
    extrude('hammer', [('M', -0.03, 0.06), ('L', -0.016, 0.062), ('Q', -0.022, 0.082, -0.044, 0.088), ('L', -0.046, 0.082), ('Q', -0.03, 0.078, -0.03, 0.06)], 0.008, M['steel'], bevel=0.001)
    rod('ejector', (0.054, 0.032), (0.14, 0.032), 0.0028, M['steel'])
    puffy('grip', [('M', -0.035, 0.022), ('Q', -0.045, -0.03, -0.062, -0.078), ('Q', -0.066, -0.094, -0.05, -0.096), ('L', -0.022, -0.092),
                   ('Q', -0.012, -0.04, 0.0, 0.018)], 0.034, M['woodd'], r=0.01, rings=3)
    trigger_group(M, -0.002, 0.04, 0.018, 0.026, M['paint'])
    empty('muzzle', (0.205, 0, 0.05)); empty('grip', (-0.035, 0, -0.035))


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
    parts = []
    # Everything follows one arc around (CX, CZ): the handle's back flows straight
    # into the blade's spine, and the grip underside and cutting edge run
    # concentric to it, giving the karambit its single C-shaped sweep.
    CX, CZ, R = 0.02, -0.11, 0.13
    P = lambda deg, r: (CX + math.cos(math.radians(deg)) * r, CZ + math.sin(math.radians(deg)) * r)
    J, END, TIP = 85.0, 148.0, 20.0                      # junction, ring end, tip (degrees)

    def r_in(d):
        """Grip underside: three finger grooves and a guard hook behind the blade."""
        r = 0.1
        if d < 96:
            r -= 0.013 * math.sin(math.pi * max(0.0, d - J) / (96 - J)) ** 0.8
        elif d < 141:
            r += 0.0045 * (1 - math.cos(3 * 2 * math.pi * (d - 96) / 45)) / 2
        return r

    def arc(d0, d1, rf, n):
        return [P(d0 + (d1 - d0) * i / n, rf(d0 + (d1 - d0) * i / n)) for i in range(n + 1)]

    def outline(grow=0.0):
        pts = arc(J, END, lambda d: R + grow, 40) + arc(END, J, lambda d: r_in(d) - grow, 80)
        return [('M', *pts[0])] + [('L', *p) for p in pts[1:]]

    # claw blade: spine continues the handle's arc, edge tapers in to the tip
    w = lambda d: 0.03 * ((d - TIP) / (J - TIP)) ** 0.75
    bl = arc(J + 0.6, TIP, lambda d: R, 50) + arc(TIP, J + 0.6, lambda d: R - w(d) - (0.004 if d > J - 4 else 0), 50)[1:]
    b = blade('blade', [('M', *bl[0])] + [('L', *p) for p in bl[1:]],
              lambda x, z: math.hypot(x - CX, z - CZ) < R - 0.0006 and math.degrees(math.atan2(z - CZ, x - CX)) < J - 5, 0.0055, M['blade'], seg=2)
    # thumb jimping where the thumb rests on the spine
    for i in range(6):
        d = J - 6 - i * 2.6
        x, z = P(d, R)
        cut(b, cutter_box((0.0016, 0.02, 0.004), (x, 0, z), rot=(0, -math.radians(d - 90), 0)))
    parts.append(b)
    parts.append(puffy('handle', outline(), 0.019, M['polymer'], r=0.006, rings=3, seg=2))
    parts.append(extrude('tang', outline(0.0016), 0.006, M['dark'], bevel=0.0008, seg=2))
    # safety ring continuing the arc past the handle, with a bolster
    rx, rz = P(159, 0.116)
    parts.append(torus('ring', 0.019, 0.0058, (rx, 0, rz), M['dark'], segs=40))
    bo = arc(146, 153, lambda d: R + 0.002, 6) + arc(153, 146, lambda d: 0.098, 6)
    parts.append(puffy('ring_bolster', [('M', *bo[0])] + [('L', *p) for p in bo[1:]], 0.015, M['dark'], r=0.003, rings=2, seg=2))
    # pivot screw at the blade root, two screws through the scales
    for i, d in enumerate((90, 112, 134)):
        x, z = P(d, 0.116)
        parts.append(cyl(f'screw{i}', 0.0034 if i == 0 else 0.0028, 0.0215, (x, 0, z), M['steel'], axis='Y', segs=16))
    for o in parts:
        o.parent = piv
        o.location.x += 0.03
    for o in scene().objects:   # boolean cutters move with the blade
        if o.get('_cutter'):
            o.location.x += 0.03
    return 0.17


@knife
def butterfly():
    """Balisong: the blade is shorter than the handles, as on the real thing, so
    it hides completely between them when the knife is closed (a longer blade
    would poke out past the handles and through the hand in a flip)."""
    M = mats()
    blade('blade', [('M', 0.0, 0.01), ('L', 0.084, 0.01), ('Q', 0.102, 0.008, 0.114, -0.002), ('Q', 0.086, -0.015, 0.0, -0.012)], edge_below(lambda x: 0.0), 0.005, M['blade'])
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
    # the fist closes round the middle of the handles
    return 0.114, -0.066


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
    """Push dagger (they come in pairs): a short double-edged spear blade with
    a raised centre ridge, a small guard, a slim neck that passes between the
    middle and ring fingers, and a cord-wrapped T-bar that sits across the palm."""
    M = mats()
    blade('blade', [('M', 0.012, 0.011), ('Q', 0.034, 0.02, 0.062, 0.0125), ('L', 0.1, 0.0), ('L', 0.062, -0.0125), ('Q', 0.034, -0.02, 0.012, -0.011)],
          lambda x, z: x > 0.018, 0.0055, M['blade'])
    blade('ridge', [('M', 0.016, 0.0018), ('L', 0.092, 0.0003), ('L', 0.092, -0.0003), ('L', 0.016, -0.0018)], lambda x, z: False, 0.0068, M['steel'])
    extrude('guard', [('M', 0.005, 0.021), ('Q', 0.01, 0.024, 0.014, 0.018), ('L', 0.014, -0.018), ('Q', 0.01, -0.024, 0.005, -0.021)], 0.012, M['dark'], bevel=0.0015)
    puffy('neck', [('M', -0.012, 0.0072), ('L', 0.007, 0.0062), ('L', 0.007, -0.0062), ('L', -0.012, -0.0072)], 0.011, M['dark'], r=0.004, rings=2)
    puffy('t_handle', [('M', -0.012, 0.05), ('Q', 0.001, 0.054, 0.001, 0.038), ('L', 0.001, -0.038), ('Q', 0.001, -0.054, -0.012, -0.05),
                       ('Q', -0.031, -0.044, -0.031, -0.02), ('L', -0.031, 0.02), ('Q', -0.031, 0.044, -0.012, 0.05)], 0.026, M['polymer'], r=0.0095, rings=3)
    for i in range(5):
        box(f'wrap{i}', (0.0335, 0.0285, 0.0042), (-0.015, 0, -0.03 + i * 0.015), M['cord'], bevel=0.0015)
    for z_ in (-0.044, 0.044):
        cyl(f'cap{0 if z_ < 0 else 1}', 0.0035, 0.029, (-0.012, 0, z_), M['steel'], axis='Y', segs=16)
    return 0.1, -0.016


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
def skeleton():
    """Drop-point blade on a skeletal steel frame: an open handle with a few
    turns of cord at the front and a finger ring at the end."""
    M = mats()
    blade('blade', [('M', 0.012, 0.012), ('L', 0.14, 0.012), ('Q', 0.18, 0.009, 0.2, -0.002), ('Q', 0.15, -0.017, 0.012, -0.013)],
          edge_below(lambda x: 0.0 if x < 0.14 else 0.005), 0.0045, M['blade'])
    fr = extrude('frame', [('M', 0.014, 0.012), ('L', -0.09, 0.01), ('Q', -0.104, 0.0, -0.09, -0.012), ('L', 0.014, -0.013)], 0.008, M['steel'], bevel=0.002)
    cut(fr, extrude('cutter', [('M', -0.012, 0.006), ('L', -0.08, 0.005), ('Q', -0.088, 0.0, -0.08, -0.006), ('L', -0.012, -0.007)], 0.03, None, bevel=0))
    for i in range(4):
        box(f'cord{i}', (0.006, 0.013, 0.03), (0.004 - i * 0.0085, 0, 0), M['cord'], bevel=0.002, rot=(0, 0.35, 0))
    torus('ring', 0.012, 0.0035, (-0.108, 0, 0), M['steel'], rot=(PI / 2, 0, 0))
    return 0.2


@knife
def hawkbill():
    """Folding knife with a hooked blade, the edge on the inside of the curve."""
    M = mats()
    chord = lambda x: 0.013 - 0.2416 * (x - 0.012)
    blade('blade', [('M', 0.012, 0.013), ('Q', 0.12, 0.024, 0.19, -0.03), ('Q', 0.13, -0.008, 0.012, -0.012)], lambda x, z: z < chord(x) - 0.001, 0.0045, M['blade'])
    puffy('handle', [('M', 0.018, 0.014), ('Q', -0.04, 0.02, -0.1, 0.005), ('Q', -0.114, -0.008, -0.1, -0.018), ('Q', -0.04, -0.015, 0.018, -0.016)], 0.02, M['polymer'], r=0.007, rings=3)
    cyl('pivot', 0.0075, 0.024, (0.008, 0, 0.0), M['steel'], axis='Y', bevel=0.001)
    for i in range(3):
        cyl(f'pin{i}', 0.0025, 0.023, (-0.028 - i * 0.03, 0, -0.001), M['steel'], axis='Y')
    cyl('thumb_stud', 0.0035, 0.012, (0.03, 0, 0.014), M['steel'], axis='Y')
    return 0.19


@knife
def trench():
    """Double-edged spear-point dagger with a studded knuckle guard."""
    M = mats()
    blade('blade', [('M', 0.016, 0.011), ('L', 0.15, 0.008), ('L', 0.205, 0.0), ('L', 0.15, -0.008), ('L', 0.016, -0.011)], lambda x, z: x > 0.03, 0.005, M['blade'])
    extrude('knuckle', [('M', 0.018, 0.016), ('L', 0.018, -0.05), ('Q', 0.018, -0.062, 0.004, -0.062), ('L', -0.1, -0.058), ('Q', -0.114, -0.056, -0.114, -0.044),
                        ('L', -0.114, -0.012), ('L', -0.102, -0.012), ('L', -0.102, -0.047), ('L', 0.006, -0.05), ('L', 0.006, -0.016)], 0.016, M['dark'], bevel=0.002)
    for i in range(4):
        cyl(f'stud{i}', 0.0055, 0.018, (-0.012 - i * 0.026, 0, -0.064), M['steel'], axis='Y', bevel=0.001)
    puffy('handle', [('M', 0.014, 0.014), ('L', -0.1, 0.012), ('Q', -0.11, 0.0, -0.1, -0.012), ('L', 0.014, -0.014)], 0.022, M['wood'], r=0.008, rings=3)
    box('pommel', (0.012, 0.026, 0.03), (-0.106, 0, 0), M['steel'], bevel=0.004)
    return 0.205


@knife
def cord():
    """Full-tang clip-point knife with the handle wrapped in paracord and a lanyard loop."""
    M = mats()
    blade('blade', [('M', 0.012, 0.014), ('L', 0.12, 0.014), ('Q', 0.15, 0.012, 0.165, 0.004), ('L', 0.19, 0.002), ('Q', 0.16, -0.018, 0.012, -0.015)],
          edge_below(lambda x: 0.002 if x < 0.16 else 0.006), 0.005, M['blade'])
    extrude('tang', [('M', 0.012, 0.016), ('L', -0.104, 0.014), ('L', -0.104, -0.016), ('L', 0.012, -0.017)], 0.01, M['dark'], bevel=0.002)
    handle_wrap(M, -0.1, 0.008, 0.026, 0.022, M['cord'], M['cord'], 12)
    torus('lanyard', 0.011, 0.003, (-0.115, 0, 0), M['cord'], rot=(PI / 2, 0, 0))
    return 0.19



# ================================================================ M4A1-S: the M4 with a slim
# round handguard, a long suppressor and a 20-round magazine
def m4a1s():
    m4a1()
    M = mats()
    for n in ('flash_hider', 'barrel', 'gas_block', 'handguard', 'barrel_nut', 'muzzle', 'fore', 'sling_front',
              'mag', 'mag_floor', 'magrib0', 'magrib1', 'magrib2'):
        o = bpy.data.objects.get(n)
        if o:
            for c in list(o.children):
                bpy.data.objects.remove(c, do_unlink=True)
            bpy.data.objects.remove(o, do_unlink=True)
    hg = lathe('handguard', [(0.175, 0.0001), (0.175, 0.026), (0.188, 0.029), (0.39, 0.029), (0.402, 0.025), (0.402, 0.0001)], M['paint'], z=0.043, segs=28)
    for i in range(7):
        for s_ in (-1, 1):
            cut(hg, cutter_box((0.018, 0.012, 0.007), (0.205 + i * 0.026, s_ * 0.028, 0.043)))
    lathe('delta_ring', [(0.17, 0.0001), (0.17, 0.031), (0.182, 0.031), (0.182, 0.0001)], M['dark'], z=0.043, segs=24)
    tube('barrel', 0.4, 0.45, 0.0095, M['dark'], z=0.042)
    lathe('gas_block', [(0.41, 0.0001), (0.41, 0.014), (0.428, 0.014), (0.428, 0.0001)], M['dark'], z=0.042, segs=20)
    sup = lathe('suppressor', [(0.445, 0.0001), (0.445, 0.0135), (0.458, 0.0172), (0.655, 0.0172), (0.668, 0.0148), (0.672, 0.0001)], M['dark'], z=0.042, segs=36)
    for i in range(4):
        lathe(f'sup_ring{i}', [(0.47 + i * 0.05, 0.0001), (0.47 + i * 0.05, 0.0178), (0.476 + i * 0.05, 0.0178), (0.476 + i * 0.05, 0.0001)], M['steel'], z=0.042, segs=36)
    mag = puffy('mag', [('M', 0.052, -0.035), ('L', 0.112, -0.035), ('Q', 0.118, -0.09, 0.126, -0.14), ('L', 0.07, -0.148), ('Q', 0.062, -0.09, 0.052, -0.035)],
                0.028, M['paint'], r=0.0035, rings=2)
    fp = puffy('mag_floor', [('M', 0.068, -0.14), ('L', 0.13, -0.133), ('L', 0.132, -0.145), ('L', 0.072, -0.153)], 0.034, M['polymer'], r=0.003, rings=2); fp.parent = mag
    empty('muzzle', (0.674, 0, 0.042))
    empty('fore', (0.28, 0, 0.015))


# ================================================================ Negev-style LMG: squared receiver,
# box magazine under it, long ribbed barrel shroud with a vertical grip, folding
# skeleton stock and a tall carry handle
def negev():
    M = mats()
    rec = puffy('receiver', [('M', -0.075, -0.004), ('L', 0.25, -0.004), ('L', 0.25, 0.064), ('L', 0.21, 0.074), ('L', -0.06, 0.074), ('Q', -0.075, 0.072, -0.075, 0.058)],
                0.058, M['paint'], r=0.004, rings=2)
    cut(rec, cutter_box((0.07, 0.02, 0.022), (0.11, -0.03, 0.035)))
    rivets('rivet', [(-0.055, 0.008), (0.03, 0.008), (0.2, 0.008), (0.2, 0.052), (-0.055, 0.052)], M, y=0.0295)
    puffy('feed_cover', [('M', -0.035, 0.072), ('L', 0.2, 0.072), ('L', 0.2, 0.09), ('L', 0.02, 0.096), ('L', -0.035, 0.09)], 0.056, M['dark'], r=0.004, rings=2)
    picatinny('rail', -0.02, 0.19, 0.094, 0.103, M, w=0.02)
    box('cover_latch', (0.02, 0.06, 0.012), (-0.045, 0, 0.088), M['dark'], bevel=0.002)
    mag = puffy('mag', [('M', 0.04, -0.004), ('L', 0.2, -0.004), ('L', 0.198, -0.15), ('Q', 0.19, -0.165, 0.17, -0.165), ('L', 0.06, -0.165), ('Q', 0.042, -0.165, 0.04, -0.15)],
                0.074, M['polymer'], r=0.008, rings=3)
    for i in range(3):
        r_ = box(f'mag_rib{i}', (0.15, 0.078, 0.004), (0.12, 0, -0.05 - i * 0.04), M['polymer'], bevel=0.0015); r_.parent = mag
    shroud = loft('shroud', [(0.25, rrect(0.056, 0.052, 0.012, cz=0.036)), (0.47, rrect(0.05, 0.046, 0.011, cz=0.038)), (0.48, rrect(0.042, 0.04, 0.01, cz=0.04))], M['paint'])
    for i in range(7):
        for s_ in (-1, 1):
            cut(shroud, cutter_box((0.02, 0.012, 0.01), (0.272 + i * 0.028, s_ * 0.027, 0.04)))
    bar = lathe('barrel', [(0.47, 0.0001), (0.47, 0.0128), (0.7, 0.0112), (0.7, 0.0001)], M['dark'], z=0.04, segs=32)
    for i in range(5):
        a = i / 5 * PI * 2
        cut(bar, cutter_box((0.16, 0.004, 0.004), (0.6, math.cos(a) * 0.012, 0.04 + math.sin(a) * 0.012), rot=(a, 0, 0)))
    tube('gas_tube', 0.25, 0.6, 0.008, M['dark'], z=0.012)
    box('gas_block', (0.03, 0.028, 0.042), (0.6, 0, 0.026), M['dark'], bevel=0.003)
    fh = lathe('flash_hider', [(0.7, 0.0001), (0.7, 0.0135), (0.755, 0.0155), (0.76, 0.0001)], M['dark'], z=0.04)
    for i in range(4):
        a = i / 4 * PI * 2 + 0.4
        cut(fh, cutter_box((0.04, 0.004, 0.04), (0.735, math.cos(a) * 0.014, 0.04 + math.sin(a) * 0.014), rot=(a, 0, 0)))
    bipod_folded(M, 0.59, 0.44, 0.0, spread=0.016)
    # vertical grip under the shroud
    vg = puffy('vgrip', [('M', 0.33, -0.012), ('L', 0.37, -0.012), ('L', 0.366, -0.1), ('Q', 0.364, -0.11, 0.352, -0.11), ('L', 0.342, -0.11), ('Q', 0.33, -0.11, 0.33, -0.1)],
               0.03, M['polymer'], r=0.008, rings=3)
    for i in range(4):
        cut(vg, cutter_box((0.05, 0.034, 0.0018), (0.35, 0, -0.03 - i * 0.018)))
    puffy('carry_handle', [('M', 0.29, 0.066), ('Q', 0.29, 0.112, 0.32, 0.118), ('L', 0.4, 0.118), ('Q', 0.43, 0.112, 0.43, 0.066), ('L', 0.418, 0.066),
                           ('Q', 0.418, 0.104, 0.4, 0.106), ('L', 0.32, 0.106), ('Q', 0.302, 0.104, 0.302, 0.066)], 0.014, M['dark'], y=0.0, r=0.003, rings=1)
    puffy('front_sight', [('M', 0.66, 0.05), ('L', 0.685, 0.05), ('L', 0.68, 0.088), ('L', 0.665, 0.088)], 0.016, M['dark'], r=0.002, rings=1)
    ar_grip(M, 0.004, -0.004)
    trigger_group(M, 0.006, 0.07, -0.004, 0.034, M['paint'])
    # folding skeleton stock: a frame with an open middle and a rubber pad
    st = puffy('stock', [('M', -0.075, 0.064), ('L', -0.34, 0.056), ('Q', -0.356, 0.054, -0.358, 0.038), ('L', -0.362, -0.078), ('Q', -0.352, -0.09, -0.334, -0.086),
                         ('L', -0.12, -0.01), ('Q', -0.09, 0.0, -0.075, 0.004)], 0.046, M['poly'], r=0.01, rings=3)
    cut(st, extrude('cutter', [('M', -0.12, 0.042), ('L', -0.32, 0.036), ('L', -0.326, -0.058), ('L', -0.15, -0.002)], 0.1, None, bevel=0))
    cyl('stock_hinge', 0.012, 0.05, (-0.078, 0, 0.03), M['dark'], axis='Y', bevel=0.002)
    puffy('buttpad', [('M', -0.356, 0.058), ('L', -0.372, 0.058), ('L', -0.376, -0.083), ('L', -0.36, -0.086)], 0.05, M['rubber'], r=0.006, rings=3)
    empty('muzzle', (0.762, 0, 0.04)); empty('grip', (-0.025, 0, -0.055)); empty('fore', (0.35, 0, -0.04))


GUNS = {'ak47': ak47, 'm4a1': m4a1, 'awp': awp, 'glock': glock, 'usp': usp, 'deagle': deagle,
        'm1911': m1911, 'fiveseven': fiveseven, 'vz61': vz61, 'revolver': revolver,
        'mac10': mac10, 'mp5': mp5, 'mp7': mp7, 'ump45': ump45, 'vector': vector, 'p90': p90,
        'galil': galil, 'famas': famas, 'scarh': scarh, 'sg550': sg550, 'aug': aug,
        'scout': scout, 'dmr': dmr, 'dbarrel': dbarrel, 'pump': pump, 'm1014': m1014, 'm249': m249, 'pkm': pkm,
        'm4a1s': m4a1s, 'negev': negev}


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build(name):
    reset()
    if name in GUNS:
        GUNS[name]()
    else:
        r = KNIVES[name]()
        # a knife returns its tip, or (tip, where the fist closes) when that isn't the usual spot
        tip, gx = r if isinstance(r, tuple) else (r, -0.04)
        empty('muzzle', (tip, 0, 0))
        empty('grip', (gx, 0, 0))


def lod_export(path, target=2500):
    """Third-person version of the weapon just exported: one mesh per material,
    decimated to about `target` triangles, with the muzzle/grip/fore anchors."""
    import bmesh as _bm  # noqa: F401  (bpy is loaded)
    sc = scene()
    vl = bpy.context.view_layer
    # everything into world space, flat (joining needs unparented parts)
    for o in list(sc.objects):
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in list(sc.objects):
        if o.type == 'EMPTY' and o.name.split('.')[0] not in ANCHORS:
            bpy.data.objects.remove(o)
    groups = {}
    for o in sc.objects:
        if o.type == 'MESH' and o.data.materials and o.data.materials[0]:
            groups.setdefault(o.data.materials[0].name, []).append(o)
        elif o.type == 'MESH':
            bpy.data.objects.remove(o)
    joined = []
    for name, objs in groups.items():
        for o in sc.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        vl.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        o = vl.objects.active
        o.name = f'lod_{name}'
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        joined.append(o)
    total = stats()
    ratio = min(1.0, target / max(1, total))
    if ratio < 0.98:
        for o in joined:
            mod = o.modifiers.new('dec', 'DECIMATE')
            mod.ratio = ratio
    apply_all()
    export_glb(path)
    return stats()


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
        if '--lod' in argv or '--lod-only' in argv:
            os.makedirs(os.path.join(out, 'lod'), exist_ok=True)
            print(f'  third-person: {lod_export(os.path.join(out, "lod", f"{name}.glb"))} tris')
    return report


if __name__ == '__main__':
    main(sys.argv)
