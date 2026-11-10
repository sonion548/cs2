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
        'dot': material('detail_dot', (0.85, 0.85, 0.8, 1), 0.0, 0.55),
        'sksteel': material('skin_steel', (0.35, 0.37, 0.4, 1), 0.9, 0.32),
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
    bore('bore', 0.7004, 0.03, 0.0042, M)
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
    bore('bore', 0.5804, 0.042, 0.005, M)
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
    # detail: the bolt's body in the port (it moves with the bolt), the safety
    # behind the handle, the bore
    bb = cyl('bolt_body', 0.016, 0.085, (0.115, 0, 0.002), M['steel'], axis='X', segs=22)
    bb.parent = bolt
    lever('safety', M, -0.118, 0.054, -(0.024 + 0.0012), 0.013, ang=PI * 0.95)
    bore('bore', 0.7004, 0.052, 0.0055, M)
    empty('muzzle', (0.79, 0, 0.052))
    empty('grip', (-0.12, 0, -0.06))
    empty('fore', (0.2, 0, -0.01))


# ================================================================ pistols
# Each pistol is built on its own, with the parts that make that gun. x runs
# along the barrel (muzzle +x), z up, y across: the right side, with the
# ejection port, is -y; stickers go on the left (+y), so that side keeps its
# flats clear. The slide starts at z = 0.016. Parts on the slide are parented
# to it so they ride with it when it cycles; the barrel stays put, so it shows
# at the muzzle when the slide locks back on an empty magazine.

def serrations(target, x0, n, pitch, zc, h, half_w, depth=0.0009, width=0.0016, tilt=0.0):
    """Cocking serrations: n grooves cut into both sides of a slide."""
    for s in (-1, 1):
        for i in range(n):
            cut(target, cutter_box((width, depth * 2, h), (x0 + i * pitch, s * half_w, zc), rot=(0, tilt, 0)))


def sight_dot(name, x_face, y, z, M, parent, r=0.0011):
    """A white dot set into the back face (at x_face) of a sight."""
    return cyl(name, r, 0.0004, (x_face - 0.00005, y, z), M['dot'], parent=parent, axis='X', segs=14)


def rear_sight(M, parent, x_back, x_front, z0, h, w, notch_w, notch_d, style='dots', name='rear_sight'):
    """Dovetailed rear sight: a block with a sloped front and a square notch,
    a white dot either side of it (style 'dots') or a white U round it ('u')."""
    zt = z0 + h
    rs = extrude(name, [('M', x_back, z0), ('L', x_front, z0), ('L', x_front - (x_front - x_back) * 0.2, zt), ('L', x_back, zt)],
                 w, M['dark'], parent=parent, bevel=0.0005)
    cut(rs, cutter_box((0.04, notch_w, notch_d * 2), (x_back, 0, zt)))
    xd = x_back - 0.0001
    if style == 'u':
        for s in (-1, 1):
            box(f'{name}_u{s}', (0.0005, 0.0012, notch_d + 0.001), (xd, s * (notch_w / 2 + 0.0008), zt - notch_d / 2 - 0.0009), M['dot'], parent=parent, bevel=0)
        box(f'{name}_ub', (0.0005, notch_w + 0.0028, 0.0012), (xd, 0, zt - notch_d - 0.0012), M['dot'], parent=parent, bevel=0)
    elif style == 'dots':
        for s in (-1, 1):
            sight_dot(f'{name}_dot{s}', x_back, s * (notch_w / 2 + 0.0022), zt - notch_d * 0.8, M, parent)
    return rs


def front_sight(M, parent, x_back, x_front, z0, h, w, dot=True, name='front_sight'):
    """Front sight post with an upright back face (a white dot in it)."""
    fs = extrude(name, [('M', x_back, z0), ('L', x_front, z0), ('L', x_front - (x_front - x_back) * 0.25, z0 + h), ('L', x_back, z0 + h)],
                 w, M['dark'], parent=parent, bevel=0.0004)
    if dot:
        sight_dot(f'{name}_dot', x_back, 0, z0 + h - 0.0022, M, parent, r=0.001)
    return fs


def barrel_tube(name, x0, x1, r, z, M, bore=0.0045, depth=0.005):
    """A barrel from x0 to its muzzle at x1: the crown chamfered and the bore
    going in, dark at the bottom."""
    b = lathe(name, [(x0, 0.0001), (x0, r), (x1 - 0.0005, r), (x1, r - 0.0005), (x1, bore), (x1 - depth, bore), (x1 - depth, 0.0001)], M['steel'], z=z, segs=28)
    smooth_by_angle(b, 40)
    cyl(name + '_bore', bore - 0.0002, 0.0004, (x1 - depth + 0.0003, 0, z), M['rubber'], axis='X', segs=16)
    return b


def finger_strap(bx, gl, rk, bumps=4, bulge=0.0038):
    """The front strap of a raked grip, top to bottom, bulging between the
    finger grooves."""
    pts = []
    for i in range(bumps):
        t0, t1 = i / bumps, (i + 1) / bumps
        x0, x1 = bx - gl * rk * t0, bx - gl * rk * t1
        pts.append(('Q', (x0 + x1) / 2 + bulge, -gl * (t0 + t1) / 2, x1, -gl * t1))
    return pts


def ring_hammer(name, X0, Z0, Z1, M, w=0.0068, hole=0.0024):
    """External hammer behind the slide: its body rises from the frame and
    flares back into a round spur with a hole through it."""
    hm = extrude(name, [('M', X0 + 0.004, Z0 + 0.001), ('L', X0 + 0.004, Z1 - 0.004), ('Q', X0 + 0.003, Z1 + 0.0012, X0 - 0.0045, Z1 + 0.0014),
                        ('Q', X0 - 0.0115, Z1 + 0.0012, X0 - 0.011, Z1 - 0.0055), ('Q', X0 - 0.0105, Z1 - 0.011, X0 - 0.0065, Z1 - 0.0135),
                        ('L', X0 - 0.0035, Z0 + 0.008), ('L', X0 - 0.003, Z0 + 0.001)], w, M['dark'], bevel=0.0006)
    cut(hm, cutter_cyl(hole, 0.02, (X0 - 0.0062, 0, Z1 - 0.0035), axis='Y'))
    return hm


def glock():
    """Striker pistol in the Glock pattern: a boxy slide with softened edges and
    a chamfered nose, rear cocking serrations, the ejection port with the
    barrel's hood in it, the extractor, a U-notch rear sight outlined in white
    and a white-dot front post, the cover plate at the back of the slide; a
    polymer frame with a one-slot accessory rail, a squared trigger guard with
    a serrated hook, the trigger with its safety blade, takedown tabs, slide
    stop and mag release; a raked grip with finger grooves and a beavertail,
    and the magazine's base plate."""
    M = mats()
    X0, X1, Z0, H, W = -0.03, 0.16, 0.016, 0.034, 0.0255
    Z1, zc, ZB = Z0 + H, Z0 + H / 2, Z0 + 0.012
    sec = lambda w, h, z, tr=0.0032: rrect(w, h, 0.0016, cz=z, top_r=tr)
    slide = loft('slide', [(X0, sec(W - 0.003, H - 0.003, zc)), (X0 + 0.0018, sec(W, H, zc)), (X1 - 0.013, sec(W, H, zc)),
                           (X1 - 0.004, sec(W - 0.002, H - 0.007, zc - 0.0015, 0.004)), (X1, sec(W - 0.005, H - 0.012, zc - 0.0022, 0.004))], M['paint'])
    serrations(slide, X0 + 0.006, 9, 0.0034, zc - 0.002, H * 0.72, W / 2)
    cut(slide, cutter_box((0.048, 0.0248, 0.014), (0.054, -0.0044, Z1 - 0.004)))      # ejection port, top and right
    cut(slide, cutter_cyl(0.0066, 0.012, (X1, 0, ZB), axis='X'))                       # muzzle
    box('extractor', (0.019, 0.0016, 0.0058), (0.022, -W / 2 - 0.0002, Z1 - 0.0115), M['dark'], parent=slide, bevel=0.0004)
    box('slide_plate', (0.0012, 0.0158, 0.017), (X0 - 0.0002, 0, zc + 0.0012), M['paint'], parent=slide, bevel=0.0004)
    rear_sight(M, slide, X0 + 0.004, X0 + 0.0165, Z1 - 0.001, 0.0076, 0.02, 0.0036, 0.0031, style='u')
    front_sight(M, slide, X1 - 0.0215, X1 - 0.0135, Z1 - 0.001, 0.0068, 0.0036)
    # the barrel: its hood fills the port, the crown sits in the slide's face
    box('barrel_hood', (0.05, 0.0158, 0.012), (0.052, 0, Z1 - 0.0062), M['steel'], bevel=0.0008)
    barrel_tube('barrel', 0.074, X1 - 0.0004, 0.0062, ZB, M)
    tube('guide_rod', 0.08, 0.149, 0.0028, M['steel'], z=Z0 + 0.0035)
    # frame: the dust cover with its rail (side grooves, one cross slot)
    fy = (W - 0.0012) / 2
    fr = puffy('frame', [('M', -0.033, Z0 + 0.002), ('L', 0.149, Z0 + 0.002), ('L', 0.149, 0.0035), ('L', 0.05, 0.0012), ('L', 0.0, -0.002),
                         ('L', -0.035, 0.004), ('Q', -0.039, 0.012, -0.033, Z0 + 0.002)], W - 0.0012, M['poly'], r=0.0024, rings=2)
    for s in (-1, 1):
        cut(fr, cutter_box((0.072, 0.0028, 0.0022), (0.111, s * fy, 0.0072)))
    cut(fr, cutter_box((0.0048, 0.04, 0.0034), (0.128, 0, 0.0033)))
    # trigger guard: squared, its front hooked and serrated
    tg = extrude('trigger_guard', [('M', -0.003, 0.002), ('L', 0.049, 0.0015), ('L', 0.051, -0.006), ('L', 0.0505, -0.019), ('Q', 0.05, -0.025, 0.044, -0.0255),
                                   ('L', 0.012, -0.0255), ('Q', 0.002, -0.0255, -0.004, -0.016), ('L', -0.006, -0.004)], 0.0115, M['poly'], bevel=0.0014)
    cut(tg, extrude('cutter', [('M', 0.002, 0.006), ('L', 0.045, 0.006), ('L', 0.0462, -0.004), ('L', 0.0458, -0.017), ('Q', 0.0455, -0.0215, 0.041, -0.0215),
                               ('L', 0.013, -0.0215), ('Q', 0.006, -0.0215, 0.0015, -0.014), ('L', -0.0005, -0.003)], 0.05, None, bevel=0))
    for i in range(5):
        cut(tg, cutter_box((0.0026, 0.02, 0.0011), (0.0512, 0, -0.0075 - i * 0.0025)))
    tx = 0.023
    extrude('trigger', [('M', tx - 0.002, 0.004), ('Q', tx + 0.006, -0.006, tx + 0.0012, -0.0185), ('L', tx - 0.004, -0.0175),
                        ('Q', tx - 0.0004, -0.006, tx - 0.0072, 0.003)], 0.0062, M['poly'], bevel=0.0008)
    extrude('trigger_blade', [('M', tx + 0.0033, -0.0033), ('Q', tx + 0.0051, -0.0087, tx + 0.00365, -0.0148), ('L', tx + 0.00085, -0.0148),
                              ('Q', tx + 0.0023, -0.0087, tx + 0.0005, -0.0033)], 0.0022, M['dark'], bevel=0.0003)
    extrude('slide_stop', [('M', 0.006, 0.0124), ('L', 0.031, 0.0124), ('L', 0.0335, 0.0156), ('L', 0.011, 0.0159)], 0.0016, M['dark'], y=fy + 0.0008, bevel=0.0003)
    for s in (-1, 1):
        tk = box(f'takedown{s}', (0.0092, 0.0016, 0.0042), (0.0445, s * (fy + 0.0006), 0.0096), M['dark'], bevel=0.0003)
        for k in range(3):
            cut(tk, cutter_box((0.0009, 0.0012, 0.006), (0.0415 + k * 0.003, s * (fy + 0.0016), 0.0096)))
    box('mag_release', (0.006, 0.0024, 0.0076), (-0.008, 0.0145, -0.0072), M['poly'], bevel=0.0008)
    for i, (x, z) in enumerate(((0.012, 0.004), (0.042, 0.004), (-0.026, 0.0095))):
        cyl(f'frame_pin{i}', 0.0012, W - 0.0004, (x, 0, z), M['steel'], axis='Y', segs=10)
    # grip: raked, finger grooves, a beavertail; the magazine's base plate
    gl, rk, bx = 0.1, 0.36, -0.004
    xb = bx - gl * rk
    puffy('grip', [('M', bx, 0.0), *finger_strap(bx, gl, rk), ('L', xb - 0.0365, -gl), ('Q', xb - 0.0445, -gl * 0.5, -0.0405, -0.004),
                   ('Q', -0.053, 0.004, -0.046, 0.0125), ('L', -0.031, 0.006), ('L', bx, 0.0)], W + 0.0045, M['poly'], r=0.0075, rings=3)
    puffy('mag', [('M', xb - 0.039, -gl + 0.0025), ('L', xb + 0.0025, -gl + 0.0025), ('L', xb + 0.0038, -gl - 0.0085), ('L', xb - 0.0405, -gl - 0.0085)],
          W + 0.0055, M['dark'], r=0.0024, rings=2)
    empty('muzzle', (X1 + 0.005, 0, ZB)); empty('grip', (-0.02, 0, -0.04))


def usp():
    """Hammer-fired pistol in the USP pattern, with a suppressor: a slide with
    well-rounded upper edges and rear serrations, the ejection port and
    extractor, three-dot sights, an external ring hammer; the frame's rail
    grooves, a big rounded trigger guard, the control lever (safety and
    decocker) on the left, the paddle mag release under the guard, a grip with
    chequered panels; a threaded barrel and the suppressor, ringed, with a
    stepped front cap."""
    M = mats()
    X0, X1, Z0, H, W = -0.03, 0.165, 0.016, 0.032, 0.0258
    Z1, zc, ZB = Z0 + H, Z0 + H / 2, Z0 + 0.012
    sec = lambda w, h, z, tr=0.0085: rrect(w, h, 0.0018, cz=z, top_r=tr)
    slide = loft('slide', [(X0, sec(W - 0.003, H - 0.003, zc, 0.007)), (X0 + 0.002, sec(W, H, zc)), (X1 - 0.006, sec(W, H, zc)),
                           (X1, sec(W - 0.004, H - 0.004, zc - 0.0005, 0.007))], M['paint'])
    serrations(slide, X0 + 0.005, 8, 0.0036, zc - 0.0025, H * 0.62, W / 2)
    cut(slide, cutter_box((0.046, 0.024, 0.013), (0.055, -0.0049, Z1 - 0.0035)))
    cut(slide, cutter_cyl(0.0064, 0.012, (X1, 0, ZB), axis='X'))
    box('extractor', (0.017, 0.0016, 0.0056), (0.024, -W / 2 - 0.0002, Z1 - 0.0118), M['dark'], parent=slide, bevel=0.0004)
    rear_sight(M, slide, X0 + 0.004, X0 + 0.017, Z1 - 0.002, 0.0082, 0.019, 0.0034, 0.0029)
    front_sight(M, slide, X1 - 0.016, X1 - 0.008, Z1 - 0.002, 0.0076, 0.0034)
    box('barrel_hood', (0.048, 0.0156, 0.011), (0.054, 0, Z1 - 0.0068), M['steel'], bevel=0.0008)
    lathe('barrel', [(0.075, 0.0001), (0.075, 0.0062), (X1 + 0.0002, 0.0062), (X1 + 0.0002, 0.0001)], M['steel'], z=ZB, segs=28)
    thread, x = [(X1, 0.0001), (X1, 0.0052)], X1 + 0.0003
    while x < X1 + 0.0062:
        thread += [(x, 0.0057), (x + 0.0003, 0.0057), (x + 0.0007, 0.0052)]
        x += 0.0008
    lathe('barrel_thread', thread + [(X1 + 0.0072, 0.0052), (X1 + 0.0072, 0.0001)], M['steel'], z=ZB, segs=24)
    ring_hammer('hammer', X0, Z0, Z1, M)
    # frame
    fy = (W - 0.001) / 2
    fr = puffy('frame', [('M', -0.033, Z0 + 0.002), ('L', 0.154, Z0 + 0.002), ('L', 0.154, 0.004), ('L', 0.052, 0.0014), ('L', 0.0, -0.002),
                         ('L', -0.035, 0.004), ('Q', -0.039, 0.012, -0.033, Z0 + 0.002)], W - 0.001, M['poly'], r=0.0026, rings=2)
    for s in (-1, 1):
        cut(fr, cutter_box((0.08, 0.0024, 0.0018), (0.112, s * fy, 0.0094)))
    tg = extrude('trigger_guard', [('M', -0.004, 0.002), ('L', 0.05, 0.0015), ('Q', 0.056, -0.004, 0.054, -0.016), ('Q', 0.052, -0.027, 0.04, -0.027),
                                   ('L', 0.012, -0.027), ('Q', 0.0, -0.027, -0.005, -0.014), ('L', -0.006, -0.004)], 0.0115, M['poly'], bevel=0.0015)
    cut(tg, extrude('cutter', [('M', 0.001, 0.006), ('L', 0.047, 0.006), ('Q', 0.0505, -0.004, 0.0495, -0.015), ('Q', 0.048, -0.0228, 0.039, -0.0228),
                               ('L', 0.0125, -0.0228), ('Q', 0.004, -0.0228, 0.0005, -0.013), ('L', -0.0008, -0.003)], 0.05, None, bevel=0))
    tx = 0.024
    extrude('trigger', [('M', tx - 0.002, 0.004), ('Q', tx + 0.0062, -0.006, tx + 0.0012, -0.019), ('L', tx - 0.0038, -0.018),
                        ('Q', tx - 0.0004, -0.006, tx - 0.007, 0.003)], 0.0058, M['dark'], bevel=0.0008)
    extrude('mag_paddle', [('M', -0.004, -0.024), ('L', 0.012, -0.0252), ('L', 0.012, -0.0285), ('L', -0.004, -0.0275)], 0.016, M['poly'], bevel=0.0008)
    extrude('control_lever', [('M', -0.03, 0.0125), ('L', -0.016, 0.012), ('Q', -0.008, 0.012, -0.006, 0.0068), ('L', -0.012, 0.0062), ('L', -0.03, 0.0082)],
            0.0022, M['dark'], y=fy + 0.0011, bevel=0.0004)
    cyl('lever_pivot', 0.0032, 0.0026, (-0.025, fy + 0.0011, 0.0104), M['dark'], axis='Y', segs=16)
    extrude('slide_stop', [('M', 0.004, 0.0126), ('L', 0.03, 0.0126), ('L', 0.032, 0.0157), ('L', 0.009, 0.016)], 0.0016, M['dark'], y=fy + 0.0008, bevel=0.0003)
    for i, x in enumerate((0.012, 0.045)):
        cyl(f'frame_pin{i}', 0.0012, W - 0.0002, (x, 0, 0.004), M['steel'], axis='Y', segs=10)
    # grip: a straight front strap; chequered panels framed by a smooth border
    gl, rk, bx = 0.102, 0.3, -0.004
    xb = bx - gl * rk
    puffy('grip', [('M', bx, 0.0), ('Q', bx - gl * rk * 0.4, -gl * 0.5, xb, -gl), ('L', xb - 0.0365, -gl), ('Q', xb - 0.043, -gl * 0.5, -0.0405, -0.004),
                   ('Q', -0.05, 0.006, -0.042, 0.0115), ('L', -0.031, 0.006), ('L', bx, 0.0)], W + 0.004, M['poly'], r=0.0075, rings=3)
    for s in (-1, 1):
        puffy(f'grip_panel_chequer{s}', [('M', bx - 0.011, -0.014), ('L', xb - 0.004, -gl + 0.013), ('L', xb - 0.028, -gl + 0.013), ('L', -0.04, -0.016)],
              0.0012, M['poly'], y=s * (W / 2 + 0.002), r=0.0004, rings=1)
    puffy('mag', [('M', xb - 0.0385, -gl + 0.0025), ('L', xb + 0.0022, -gl + 0.0025), ('L', xb + 0.0026, -gl - 0.0075), ('L', xb - 0.039, -gl - 0.0075)],
          W + 0.004, M['dark'], r=0.0022, rings=2)
    # the suppressor: a cone at the back, the tube ringed along its length, a stepped cap
    SX = X1 + 0.0055
    sup = lathe('suppressor', [(SX, 0.0001), (SX, 0.011), (SX + 0.0025, 0.015), (SX + 0.0045, 0.0172), (0.326, 0.0172), (0.3285, 0.0166),
                               (0.3285, 0.015), (0.334, 0.015), (0.336, 0.0132), (0.336, 0.0001)], M['paint'], z=ZB, segs=40)
    smooth_by_angle(sup, 35)
    cut(sup, cutter_cyl(0.0042, 0.02, (0.336, 0, ZB), axis='X'))
    cyl('sup_bore', 0.004, 0.0004, (0.3265, 0, ZB), M['rubber'], axis='X', segs=16)
    for i in range(9):
        x = SX + 0.02 + i * 0.0108
        r = lathe(f'sup_ring{i}', [(x, 0.0001), (x, 0.0175), (x + 0.0042, 0.0175), (x + 0.0042, 0.0001)], M['dark'], z=ZB, segs=40)
        smooth_by_angle(r, 35)
    empty('muzzle', (0.34, 0, ZB)); empty('grip', (-0.02, 0, -0.04))


def deagle():
    """Gas-operated magnum in the Desert Eagle pattern: the fixed barrel rides on
    top at the front, polygonal in section, a long flute down each side, a
    grooved sighting rib and the front sight at the muzzle; the slide is full
    height at the back (serrations, the rear sight, the ambidextrous safety,
    the ejection port showing the bolt) and runs on under the barrel; a spur
    hammer, the barrel-release button, slide stop, a squared trigger guard and
    a big grip. Its steel takes the weapon finish (skin_steel)."""
    M = mats()
    X0, Z0, W, ZB, ZT = -0.034, 0.016, 0.032, 0.046, 0.058
    XJ = 0.064                                    # where the barrel meets the back of the slide
    slide = puffy('slide', [('M', X0, Z0), ('L', 0.19, Z0), ('L', 0.19, 0.0355), ('L', XJ, 0.0355), ('L', XJ, ZT), ('L', X0, ZT)],
                  W, M['sksteel'], r=0.0022, rings=2)
    serrations(slide, X0 + 0.007, 9, 0.0036, 0.034, 0.022, W / 2)
    cut(slide, cutter_box((0.034, 0.014, 0.017), (0.041, -W / 2 + 0.003, ZT - 0.0035)))          # ejection port
    cyl('breech_bolt', 0.0062, 0.034, (0.041, -0.006, 0.05), M['dark'], parent=slide, axis='X', segs=20)
    box('bolt_extractor', (0.012, 0.0016, 0.004), (0.036, -0.0122, 0.0525), M['steel'], parent=slide, bevel=0.0003)
    for s in (-1, 1):   # the safety, on the slide, both sides
        cyl(f'safety_drum{s}', 0.0042, 0.0026, (X0 + 0.0055, s * (W / 2 + 0.0011), 0.0485), M['dark'], parent=slide, axis='Y', segs=18)
        extrude(f'safety{s}', [('M', X0 + 0.004, 0.0465), ('L', X0 + 0.017, 0.047), ('Q', X0 + 0.0195, 0.0495, X0 + 0.0165, 0.0515), ('L', X0 + 0.004, 0.0515)],
                0.0022, M['dark'], parent=slide, y=s * (W / 2 + 0.0013), bevel=0.0004)
    rear_sight(M, slide, X0 + 0.004, X0 + 0.019, ZT - 0.001, 0.0085, 0.022, 0.0042, 0.0034)
    # the barrel: flats over the bore, flutes down its sides, the rib on top
    def bsec(s=1.0):
        zc = 0.0465
        pts = [(-0.014, 0.0355), (0.014, 0.0355), (0.014, 0.0505), (0.0068, ZT), (-0.0068, ZT), (-0.014, 0.0505)]
        return [(y * s, zc + (z - zc) * s) for y, z in pts]
    br = loft('barrel', [(XJ - 0.002, bsec(0.95)), (XJ + 0.002, bsec()), (0.196, bsec()), (0.2, bsec(0.95))], M['sksteel'], n=96)
    for s in (-1, 1):
        cut(br, cutter_box((0.094, 0.0024, 0.0075), (0.13, s * 0.014, 0.0435)))
        for x in (0.083, 0.177):
            cut(br, cutter_cyl(0.00375, 0.0024, (x, s * 0.014, 0.0435), axis='Y', segs=16))
    cut(br, cutter_cyl(0.0058, 0.016, (0.2, 0, ZB), axis='X'))
    cyl('bore', 0.0056, 0.0004, (0.1924, 0, ZB), M['rubber'], axis='X', segs=18)
    rib = extrude('top_rib', [('M', 0.07, ZT - 0.0006), ('L', 0.197, ZT - 0.0006), ('L', 0.197, ZT + 0.0028), ('L', 0.07, ZT + 0.0028)], 0.0078, M['sksteel'], bevel=0.0004)
    for i in range(15):
        cut(rib, cutter_box((0.0016, 0.012, 0.0016), (0.077 + i * 0.0074, 0, ZT + 0.0028)))
    front_sight(M, None, 0.184, 0.195, ZT + 0.0022, 0.0062, 0.0042)
    # frame
    fy = (W - 0.002) / 2
    puffy('frame', [('M', -0.036, 0.018), ('L', 0.19, 0.018), ('L', 0.19, 0.004), ('L', 0.064, 0.0014), ('L', 0.0, -0.002), ('L', -0.038, 0.004),
                    ('Q', -0.042, 0.012, -0.036, 0.018)], W - 0.002, M['sksteel'], r=0.003, rings=2)
    cyl('barrel_release', 0.0045, 0.0024, (0.07, fy + 0.0011, 0.0095), M['dark'], axis='Y', segs=20)
    extrude('slide_stop', [('M', 0.008, 0.0128), ('L', 0.036, 0.0128), ('L', 0.038, 0.0162), ('L', 0.012, 0.0165)], 0.0018, M['dark'], y=fy + 0.0008, bevel=0.0003)
    hm = extrude('hammer', [('M', X0 + 0.004, 0.019), ('L', X0 + 0.004, 0.042), ('Q', X0 + 0.003, 0.0505, X0 - 0.006, 0.054), ('L', X0 - 0.0135, 0.0525),
                            ('Q', X0 - 0.008, 0.047, X0 - 0.006, 0.04), ('L', X0 - 0.004, 0.019)], 0.0078, M['dark'], bevel=0.0007)
    for k in range(4):
        cut(hm, cutter_box((0.0012, 0.012, 0.0036), (X0 - 0.0115 + k * 0.0024, 0, 0.0535), rot=(0, 0.45, 0)))
    tg = extrude('trigger_guard', [('M', -0.004, 0.002), ('L', 0.058, 0.0015), ('L', 0.06, -0.007), ('L', 0.059, -0.022), ('Q', 0.058, -0.029, 0.05, -0.029),
                                   ('L', 0.014, -0.029), ('Q', 0.002, -0.029, -0.005, -0.016), ('L', -0.006, -0.004)], 0.013, M['sksteel'], bevel=0.0015)
    cut(tg, extrude('cutter', [('M', 0.001, 0.006), ('L', 0.054, 0.006), ('L', 0.0552, -0.005), ('L', 0.0548, -0.02), ('Q', 0.0545, -0.025, 0.048, -0.025),
                               ('L', 0.015, -0.025), ('Q', 0.006, -0.025, 0.001, -0.014), ('L', -0.0008, -0.003)], 0.05, None, bevel=0))
    tx = 0.027
    extrude('trigger', [('M', tx - 0.002, 0.004), ('Q', tx + 0.007, -0.006, tx + 0.0015, -0.021), ('L', tx - 0.0045, -0.02),
                        ('Q', tx - 0.0004, -0.006, tx - 0.0075, 0.003)], 0.0068, M['dark'], bevel=0.0008)
    cyl('mag_release', 0.0042, 0.004, (-0.012, 0.0185, -0.007), M['dark'], axis='Y', segs=16)
    gl, rk, bx = 0.11, 0.2, -0.006
    xb = bx - gl * rk
    puffy('grip', [('M', bx, 0.0), ('Q', bx + 0.004, -0.025, bx - gl * rk * 0.3, -gl * 0.32), ('Q', bx - gl * rk * 0.5 + 0.004, -gl * 0.62, xb, -gl),
                   ('L', xb - 0.043, -gl), ('Q', xb - 0.05, -gl * 0.5, -0.046, -0.004), ('Q', -0.056, 0.006, -0.048, 0.013), ('L', -0.036, 0.006), ('L', bx, 0.0)],
          W + 0.006, M['poly'], r=0.009, rings=3)
    puffy('mag', [('M', xb - 0.045, -gl + 0.0025), ('L', xb + 0.002, -gl + 0.0025), ('L', xb + 0.003, -gl - 0.0095), ('L', xb - 0.046, -gl - 0.0095)],
          W + 0.004, M['steel'], r=0.0026, rings=2)
    empty('muzzle', (0.205, 0, ZB)); empty('grip', (-0.022, 0, -0.045))


# ================================================================ small parts
def set_origin(obj, loc):
    """Moves an object's origin to loc without moving its mesh, so it turns
    about that point (the revolver's cylinder about its own axis)."""
    from mathutils import Matrix
    obj.data.transform(Matrix.Translation((-loc[0], -loc[1], -loc[2])))
    obj.location = loc


def pins(prefix, pts, half_w, M, r=0.0022, mat='steel'):
    """Cross pins (takedown, pivot, trigger and hammer pins): a flat head on
    each side of the receiver."""
    for i, (x, z) in enumerate(pts):
        for s in (-1, 1):
            cyl(f'{prefix}{i}{s}', r, 0.0016, (x, s * (half_w + 0.0002), z), M[mat], axis='Y', segs=14)


def screws(prefix, pts, half_w, M, r=0.0026, sides=(-1, 1), mat='dark'):
    """Socket-head screws, a hex socket in each."""
    for i, (x, z) in enumerate(pts):
        for s in sides:
            sc = cyl(f'{prefix}{i}{s}', r, 0.0014, (x, s * (half_w + 0.0003), z), M[mat], axis='Y', segs=16)
            cut(sc, cutter_cyl(r * 0.45, 0.002, (x, s * (half_w + 0.001), z), axis='Y', segs=6))


def lever(name, M, x, z, y, length, ang=0.0, w=0.0045, t=0.002, hub=0.0052):
    """A control lever on a side (selector, safety, catch): a round hub and a
    flat blade off it at angle ang (0 points forward, +x; pi/2 up)."""
    c, s = math.cos(ang), math.sin(ang)
    P = lambda u, v: (x + u * c - v * s, z + u * s + v * c)
    a, b, q, d, e = P(0, -w / 2), P(length, -w * 0.35), P(length + w * 0.4, 0), P(length, w * 0.35), P(0, w / 2)
    extrude(name, [('M', *a), ('L', *b), ('Q', *q, *d), ('L', *e)], t, M['dark'], y=y, bevel=0.0004)
    cyl(name + '_hub', hub, t + 0.0008, (x, y, z), M['dark'], axis='Y', segs=18)


def port_carrier(M, x0, x1, z, half_w, h=0.014, name='bolt_carrier'):
    """The bolt carrier seen through a right-side ejection port: its face a
    little in from the side, a relief cut along it."""
    yc = -half_w + 0.0085
    b = box(name, (x1 - x0, 0.01, h), ((x0 + x1) / 2, yc, z), M['steel'], bevel=0.0008)
    cut(b, cutter_box(((x1 - x0) * 0.55, 0.003, h * 0.32), ((x0 + x1) / 2 - (x1 - x0) * 0.1, yc - 0.005, z)))
    return b


def side_rail(name, x0, x1, z, half_w, M, side, h=0.015):
    """A short accessory rail on a side, slotted across."""
    y = side * (half_w + 0.003)
    r = box(name, (x1 - x0, 0.006, h), ((x0 + x1) / 2, y, z), M['dark'], bevel=0.0007)
    for i in range(int((x1 - x0) / 0.0102)):
        cut(r, cutter_box((0.0052, 0.004, h + 0.004), (x0 + 0.006 + i * 0.0102, y + side * 0.003, z)))
    return r


def seam(target, x0, x1, z, half_w, w=0.0008, d=0.0007):
    """A parting line along both sides of a part, where shell halves or upper
    and lower meet."""
    for s in (-1, 1):
        cut(target, cutter_box((x1 - x0, d * 2, w), ((x0 + x1) / 2, s * half_w, z)))


def sling_swivel(name, x, z, M, y=0.0):
    """A sling stud under a part (its underside at z) and the swivel loop
    hanging from it."""
    cyl(name + '_stud', 0.0032, 0.008, (x, y, z - 0.002), M['steel'], axis='Z', segs=12)
    torus(name, 0.0075, 0.0016, (x, y, z - 0.0125), M['steel'])


def bore(name, x, z, r, M, y=0.0):
    """The dark bore at a muzzle."""
    cyl(name, r, 0.0006, (x, y, z), M['rubber'], axis='X', segs=18)


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
    # detail: the pressed channel along the receiver, the bolt through the
    # port, push pins, the selector's lever, mag release and paddle, the peep
    # through the sight drum, a sling loop, the bore
    seam(rec, -0.055, 0.195, 0.034, 0.022, w=0.0016)
    port_carrier(M, 0.047, 0.093, 0.05, 0.022, h=0.015)
    pins('pin', [(-0.045, 0.012), (0.048, 0.012)], 0.021, M, r=0.0026)
    lever('selector_lever', M, -0.03, 0.006, 0.021 + 0.0022, 0.015, ang=PI * 0.8)
    cyl('mag_button', 0.004, 0.004, (0.105, -0.0175, 0.016), M['dark'], axis='Y', segs=14)
    box('mag_paddle', (0.005, 0.02, 0.013), (0.083, 0, -0.008), M['dark'], bevel=0.001, rot=(0, 0.3, 0))
    cut(bpy.data.objects['rs_drum'], cutter_cyl(0.002, 0.03, (-0.035, 0, 0.094), axis='X', segs=12))
    sling_swivel('sling_front', 0.352, 0.0395, M)
    bore('bore', 0.3954, 0.048, 0.0055, M)
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
    # detail: the parting line, ejection port and bolt, the T charging handle
    # at the back under the rail, ambidextrous selectors, short side rails at
    # the front, pins, the bore
    seam(rec, -0.075, 0.15, 0.022, 0.023)
    cut(rec, cutter_box((0.04, 0.012, 0.013), (0.04, -0.023, 0.05)))
    port_carrier(M, 0.022, 0.058, 0.05, 0.023, h=0.011)
    box('charging', (0.012, 0.052, 0.007), (-0.07, 0, 0.0625), M['dark'], bevel=0.0015)
    for s in (-1, 1):
        lever(f'selector{s}', M, 0.002, 0.03, s * (0.023 + 0.0012), 0.014, ang=PI * 0.85)
        side_rail(f'side_rail{s}', 0.1, 0.16, 0.044, 0.023, M, s, h=0.012)
    pins('pin', [(-0.05, 0.012), (0.03, 0.006), (0.125, 0.012)], 0.023, M)
    bore('bore', 0.2154, 0.034, 0.0045, M)
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
    # detail: the parting line, bolt in the port, the charging handle on the
    # left front, ambidextrous selectors, mag paddle, a rail underneath, the
    # stock's hinge, pins, the bore
    seam(rec, -0.065, 0.255, 0.012, 0.025)
    port_carrier(M, 0.027, 0.073, 0.04, 0.025, h=0.013)
    box('charging', (0.012, 0.02, 0.009), (0.228, 0.035, 0.045), M['dark'], bevel=0.0015)
    cyl('charging_knob', 0.006, 0.01, (0.228, 0.047, 0.045), M['dark'], axis='Y', segs=16)
    for s in (-1, 1):
        lever(f'selector{s}', M, -0.035, 0.014, s * (0.025 + 0.0012), 0.016, ang=PI * 0.85)
    box('mag_paddle', (0.005, 0.026, 0.014), (0.097, 0, -0.016), M['dark'], bevel=0.001, rot=(0, 0.25, 0))
    rb = box('rail_under', (0.07, 0.02, 0.008), (0.205, 0, -0.013), M['dark'], bevel=0.0007)
    for i in range(6):
        cut(rb, cutter_box((0.0052, 0.03, 0.004), (0.176 + i * 0.0102, 0, -0.017)))
    cyl('stock_hinge', 0.009, 0.054, (-0.07, 0, 0.03), M['dark'], axis='Y', segs=20)
    pins('pin', [(-0.05, 0.004), (0.065, -0.004), (0.24, 0.0)], 0.025, M)
    bore('bore', 0.3004, 0.03, 0.005, M)
    empty('muzzle', (0.335, 0, 0.03)); empty('grip', (-0.02, 0, -0.06)); empty('fore', (0.21, 0, -0.008))


def vector():
    M = mats()
    rec = puffy('receiver', [('M', -0.07, 0.0), ('L', 0.07, 0.0), ('L', 0.125, -0.06), ('L', 0.205, -0.06), ('L', 0.225, -0.02), ('L', 0.225, 0.05), ('L', -0.06, 0.062),
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
    # detail: the parting line, port and bolt, the charging handle on the
    # left, ambidextrous selectors, side rails at the front, the stock hinge,
    # pins, the bore
    seam(rec, -0.065, 0.22, 0.03, 0.023)
    cut(rec, cutter_box((0.045, 0.012, 0.013), (0.05, -0.023, 0.045)))
    port_carrier(M, 0.03, 0.07, 0.045, 0.023, h=0.011)
    box('charging', (0.014, 0.014, 0.009), (0.16, 0.03, 0.04), M['dark'], bevel=0.0015)
    cyl('charging_knob', 0.0055, 0.008, (0.16, 0.039, 0.04), M['dark'], axis='Y', segs=16)
    for s in (-1, 1):
        lever(f'selector{s}', M, -0.035, 0.02, s * (0.023 + 0.0012), 0.015, ang=PI * 0.85)
        side_rail(f'side_rail{s}', 0.17, 0.22, 0.012, 0.023, M, s, h=0.012)
    cyl('stock_hinge', 0.009, 0.05, (-0.07, 0, 0.028), M['dark'], axis='Y', segs=20)
    pins('pin', [(-0.055, 0.012), (0.02, 0.012), (0.09, -0.012), (0.135, -0.048), (0.19, -0.048), (0.205, 0.035)], 0.023, M)
    bore('bore', 0.2754, 0.024, 0.0045, M)
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
    # detail: the shell's parting line, a rubber butt plate, charging handles
    # both sides, the magazine latch, the sight's eyepiece, screws, a sling
    # loop, the bore
    seam(shell, -0.19, 0.2, -0.006, 0.028)
    puffy('buttpad', [('M', -0.199, 0.052), ('L', -0.21, 0.052), ('L', -0.21, -0.082), ('L', -0.199, -0.086)], 0.058, M['rubber'], r=0.004, rings=2)
    box('cocking_r', (0.02, 0.012, 0.008), (0.15, -0.032, 0.0), M['dark'], bevel=0.0015)
    box('mag_latch', (0.014, 0.034, 0.01), (-0.158, 0, 0.068), M['dark'], bevel=0.002)
    hood = lathe('optic_hood', [(0.07, 0.0001), (0.07, 0.0145), (0.09, 0.0145), (0.09, 0.0001)], M['dark'], z=0.1, segs=28)
    cut(hood, cutter_cyl(0.0115, 0.05, (0.08, 0, 0.1), axis='X', segs=28))
    screws('screw', [(-0.16, 0.035), (-0.02, 0.038), (0.12, 0.02)], 0.028, M)
    sling_swivel('sling_rear', -0.18, -0.092, M)
    bore('bore', 0.2604, 0.02, 0.005, M)
    empty('muzzle', (0.29, 0, 0.02)); empty('grip', (-0.075, 0, -0.06)); empty('fore', (0.075, 0, -0.06))


def mac10():
    M = mats()
    rec = puffy('receiver', [('M', -0.08, 0.0), ('L', 0.12, 0.0), ('L', 0.12, 0.062), ('L', -0.08, 0.062)], 0.05, M['paint'], r=0.004, rings=2)
    cut(rec, cutter_box((0.05, 0.02, 0.016), (0.03, -0.026, 0.04)))
    ck = cyl('cocking_knob', 0.0075, 0.016, (0.05, 0, 0.067), M['dark'], axis='Z', segs=20)
    cut(ck, cutter_box((0.02, 0.0025, 0.005), (0.05, 0, 0.075)))
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
    # rear peep between protective ears; front post between ears
    box('rear_sight', (0.012, 0.03, 0.005), (-0.06, 0, 0.0645), M['dark'], bevel=0.0012)
    for s in (-1, 1):
        box(f'rs_ear{s}', (0.012, 0.003, 0.012), (-0.06, s * 0.0125, 0.073), M['dark'], bevel=0.0008)
        box(f'fs_ear{s}', (0.01, 0.003, 0.013), (0.1, s * 0.01, 0.0735), M['dark'], bevel=0.0008)
    ap = box('rs_aperture', (0.004, 0.012, 0.011), (-0.06, 0, 0.0725), M['dark'], bevel=0.0006)
    cut(ap, cutter_cyl(0.0018, 0.02, (-0.06, 0, 0.0745), axis='X', segs=12))
    box('front_sight', (0.01, 0.022, 0.005), (0.1, 0, 0.0645), M['dark'], bevel=0.0012)
    box('fs_post', (0.003, 0.003, 0.011), (0.1, 0, 0.0715), M['dark'], bevel=0)
    # detail: the bolt's slot along the top, the seam between the stamped
    # halves, the bolt through the port, safety, pins, barrel nut, stock mount
    cut(rec, cutter_box((0.09, 0.0055, 0.008), (0.02, 0, 0.062)))
    seam(rec, -0.078, 0.118, 0.026, 0.025)
    port_carrier(M, 0.007, 0.053, 0.04, 0.025, h=0.014)
    lever('safety', M, 0.072, 0.009, -(0.025 + 0.0012), 0.013, ang=-0.5)
    pins('pin', [(-0.062, 0.012), (0.0, 0.009), (0.104, 0.012)], 0.025, M)
    lathe('barrel_nut', [(0.12, 0.0001), (0.12, 0.0135), (0.127, 0.0135), (0.128, 0.012), (0.128, 0.0001)], M['dark'], z=0.034, segs=20)
    box('stock_mount', (0.01, 0.046, 0.016), (-0.084, 0, 0.045), M['dark'], bevel=0.002)
    bore('bore', 0.1754, 0.034, 0.0065, M)
    empty('muzzle', (0.175, 0, 0.034)); empty('grip', (0.016, 0, -0.045)); empty('fore', (0.1, 0, -0.012))


# ================================================================ rifles
def famas():
    M = mats()
    body = puffy('body', [('M', -0.32, 0.06), ('L', -0.32, -0.07), ('Q', -0.31, -0.086, -0.29, -0.08), ('L', -0.12, -0.02), ('L', 0.02, -0.02), ('L', 0.02, -0.03),
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
    # detail: the shell's parting line, ejection port and bolt behind the
    # grip, a rubber butt pad, the charging handle under the carry handle, the
    # bipod's legs folded along the sides, screws, a sling loop, the bore
    seam(body, -0.31, 0.25, 0.006, 0.026)
    cut(body, cutter_box((0.06, 0.012, 0.014), (-0.1, -0.026, 0.032)))
    port_carrier(M, -0.128, -0.072, 0.032, 0.026, h=0.012)
    puffy('buttpad', [('M', -0.319, 0.062), ('L', -0.33, 0.062), ('L', -0.332, -0.076), ('L', -0.321, -0.082)], 0.054, M['rubber'], r=0.004, rings=2)
    box('charging', (0.016, 0.012, 0.024), (0.02, 0, 0.065), M['dark'], bevel=0.002)
    for s in (-1, 1):
        rod(f'bipod_leg{s}', (0.06, 0.028), (0.245, 0.028), 0.0038, M['dark'], y=s * 0.0295)
        sphere(f'bipod_foot{s}', 0.0055, (0.06, s * 0.0295, 0.028), M['rubber'])
    box('bipod_head', (0.016, 0.066, 0.012), (0.245, 0, 0.028), M['dark'], bevel=0.002)
    screws('screw', [(-0.26, 0.02), (-0.16, 0.035), (0.0, 0.01), (0.2, 0.012)], 0.026, M)
    sling_swivel('sling_rear', -0.28, -0.0765, M)
    bore('bore', 0.3704, 0.02, 0.0048, M)
    empty('muzzle', (0.395, 0, 0.02)); empty('grip', (0.04, 0, -0.07)); empty('fore', (0.19, 0, -0.03))


def galil():
    M = mats()
    rec = puffy('receiver', [('M', -0.07, -0.008), ('L', 0.235, -0.008), ('L', 0.235, 0.056), ('L', -0.02, 0.058), ('Q', -0.06, 0.058, -0.07, 0.04)], 0.046, M['paint'], r=0.003, rings=2)
    cut(rec, cutter_box((0.075, 0.02, 0.018), (0.09, -0.023, 0.04)))
    loft('dustcover', [(-0.05, rrect(0.044, 0.02, 0.0015, cz=0.064, top_r=0.016)), (0.21, rrect(0.044, 0.02, 0.0015, cz=0.064, top_r=0.016))], M['paint'])
    box('charging', (0.012, 0.03, 0.01), (0.15, 0.032, 0.05), M['steel'], bevel=0.002)
    rs = box('rear_sight', (0.02, 0.026, 0.026), (-0.02, 0, 0.085), M['dark'], bevel=0.003)
    cut(rs, cutter_cyl(0.0022, 0.04, (-0.02, 0, 0.092), axis='X', segs=12))
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
    # detail: the bolt carrier in the port, the long selector on the right and
    # the thumb selector on the left, rivets, front trunnion, the charging
    # handle's upturned knob, mag catch, a sling loop, the bore
    port_carrier(M, 0.055, 0.125, 0.04, 0.023, h=0.016)
    extrude('selector_r', [('M', -0.05, 0.036), ('L', 0.092, 0.031), ('Q', 0.1, 0.03, 0.098, 0.022), ('L', 0.0, 0.022), ('L', -0.05, 0.028)],
            0.003, M['dark'], y=-0.0245, bevel=0.0007)
    cyl('selector_pivot', 0.0055, 0.004, (-0.045, -0.0245, 0.031), M['dark'], axis='Y')
    lever('selector_l', M, -0.045, 0.031, 0.023 + 0.0012, 0.017, ang=PI * 0.12)
    rivets('rivet', [(-0.055, 0.006), (-0.005, 0.006), (0.17, 0.006), (0.212, 0.006), (0.212, 0.044)], M, y=0.0235)
    box('trunnion', (0.03, 0.048, 0.05), (0.218, 0, 0.024), M['paint'], bevel=0.002)
    cyl('charging_knob', 0.0048, 0.016, (0.15, 0.045, 0.058), M['steel'], axis='Z', segs=14)
    box('mag_catch', (0.008, 0.026, 0.012), (0.08, 0, -0.012), M['dark'], bevel=0.001)
    sling_swivel('sling_front', 0.52, 0.0195, M)
    bore('bore', 0.6404, 0.03, 0.0058, M)
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
    # detail: the bolt carrier in the port, the charging handle's knob, side
    # rails at the front, selector, mag release, bolt catch, pins, screws, the
    # stock's folding button, a sling loop, the bore
    port_carrier(M, 0.037, 0.103, 0.05, 0.027, h=0.017)
    cyl('charging_knob', 0.0058, 0.012, (0.2, 0.051, 0.06), M['dark'], axis='Y', segs=16)
    for s in (-1, 1):
        side_rail(f'side_rail{s}', 0.25, 0.315, 0.035, 0.027, M, s, h=0.013)
    lever('selector', M, -0.03, 0.012, 0.025 + 0.0012, 0.018, ang=PI * 0.85)
    cyl('mag_button', 0.0048, 0.005, (0.118, -0.0265, 0.002), M['dark'], axis='Y', segs=14)
    box('bolt_catch', (0.012, 0.004, 0.016), (0.108, 0.0265, 0.012), M['dark'], bevel=0.0008)
    pins('pin', [(-0.045, 0.016), (0.145, 0.016), (0.005, 0.0), (0.026, 0.0)], 0.025, M, r=0.0026)
    screws('screw', [(-0.04, 0.036), (0.15, 0.036)], 0.027, M)
    cyl('stock_button', 0.0045, 0.05, (-0.08, 0, 0.06), M['dark'], axis='Y', segs=14)
    sling_swivel('sling_front', 0.34, 0.034, M)
    bore('bore', 0.4704, 0.05, 0.006, M)
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
    # detail: the parting line, the bolt carrier in the port, the charging
    # handle on the right, selector, pins, the stock hinge, a sling loop, the
    # bore
    seam(rec, -0.055, 0.215, 0.014, 0.024)
    port_carrier(M, 0.047, 0.113, 0.04, 0.024, h=0.016)
    box('charging', (0.012, 0.016, 0.01), (0.17, -0.031, 0.044), M['steel'], bevel=0.0015)
    sphere('charging_knob', 0.0062, (0.17, -0.041, 0.045), M['dark'], scale=(1.1, 0.9, 1.0))
    lever('selector', M, -0.03, 0.012, 0.024 + 0.0012, 0.017, ang=PI * 0.85)
    pins('pin', [(-0.045, 0.012), (0.15, 0.01), (0.005, 0.0), (0.026, 0.0)], 0.024, M)
    box('stock_hinge', (0.014, 0.05, 0.04), (-0.066, 0, 0.03), M['dark'], bevel=0.003)
    sling_swivel('sling_front', 0.435, 0.026, M)
    bore('bore', 0.6204, 0.035, 0.005, M)
    empty('muzzle', (0.655, 0, 0.035)); empty('grip', (-0.02, 0, -0.05)); empty('fore', (0.32, 0, 0.004))


def aug():
    M = mats()
    body = puffy('body', [('M', -0.3, 0.055), ('L', -0.3, -0.06), ('Q', -0.29, -0.078, -0.27, -0.074), ('L', -0.08, -0.03), ('L', 0.02, -0.03), ('L', 0.06, -0.034),
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
    # detail: the shell's parting line, ejection port and bolt behind the
    # grip, a rubber butt pad, the cross-bolt safety, the charging handle on
    # the left, the barrel's locking collar, screws, a sling loop, the bore
    seam(body, -0.29, 0.215, 0.004, 0.029)
    cut(body, cutter_box((0.06, 0.012, 0.014), (-0.12, -0.029, 0.03)))
    port_carrier(M, -0.148, -0.092, 0.03, 0.029, h=0.012)
    puffy('buttpad', [('M', -0.299, 0.056), ('L', -0.31, 0.056), ('L', -0.31, -0.064), ('L', -0.299, -0.07)], 0.06, M['rubber'], r=0.004, rings=2)
    cyl('safety_button', 0.0042, 0.068, (0.03, 0, -0.022), M['dark'], axis='Y', segs=14)
    box('charging', (0.014, 0.012, 0.009), (0.17, 0.035, 0.035), M['dark'], bevel=0.0015)
    cyl('charging_knob', 0.0055, 0.008, (0.17, 0.043, 0.035), M['dark'], axis='Y', segs=14)
    lathe('barrel_collar', [(0.222, 0.0001), (0.222, 0.0135), (0.236, 0.0135), (0.24, 0.011), (0.24, 0.0001)], M['dark'], z=0.02, segs=24)
    screws('screw', [(-0.25, 0.02), (-0.03, 0.02), (0.18, 0.02)], 0.029, M)
    sling_swivel('sling_rear', -0.27, -0.074, M)
    bore('bore', 0.3604, 0.02, 0.005, M)
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
    # detail: the bolt's body in the port (it moves with the bolt), the safety
    # behind the handle, a sling stud up front, the bore
    bb = cyl('bolt_body', 0.0125, 0.075, (0.115, 0, 0.001), M['steel'], axis='X', segs=20)
    bb.parent = bolt
    lever('safety', M, -0.105, 0.05, -(0.019 + 0.0012), 0.011, ang=PI * 0.95)
    sling_swivel('sling_front', 0.24, -0.027, M)
    bore('bore', 0.6524, 0.048, 0.0042, M)
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
    # detail: as on an AR: the port's dust cover hanging open and the bolt
    # carrier, a brass deflector, the T charging handle, selector, mag
    # release, bolt catch, pins, castle nut, gas block, a sling loop, the bore
    box('dust_door', (0.066, 0.002, 0.018), (0.075, -0.0292, 0.03), M['dark'], bevel=0.0006)
    port_carrier(M, 0.042, 0.108, 0.048, 0.027, h=0.018)
    puffy('deflector', [('M', 0.018, 0.05), ('L', 0.042, 0.05), ('Q', 0.038, 0.069, 0.022, 0.075), ('L', 0.018, 0.075)], 0.012, M['paint'], y=-0.033, r=0.003, rings=2)
    puffy('charging', [('M', -0.08, 0.072), ('L', -0.04, 0.072), ('L', -0.04, 0.081), ('L', -0.08, 0.081)], 0.05, M['dark'], r=0.003, rings=2)
    lever('selector', M, -0.03, 0.008, 0.026 + 0.0012, 0.017, ang=PI * 0.85)
    cyl('mag_release', 0.005, 0.006, (0.042, -0.027, 0.0), M['dark'], axis='Y', segs=14)
    box('bolt_catch', (0.012, 0.004, 0.018), (0.037, 0.028, 0.01), M['dark'], bevel=0.0008)
    rivets('pin', [(-0.045, 0.012), (0.13, 0.01), (0.003, 0.002), (0.025, 0.002)], M, r=0.003, y=0.0255)
    lathe('castle_nut', [(-0.07, 0.0001), (-0.07, 0.019), (-0.06, 0.019), (-0.06, 0.0001)], M['dark'], z=0.048, segs=12)
    lathe('gas_block', [(0.505, 0.0001), (0.505, 0.015), (0.525, 0.015), (0.525, 0.0001)], M['dark'], z=0.046, segs=20)
    sling_swivel('sling_front', 0.515, 0.031, M)
    bore('bore', 0.7004, 0.046, 0.0052, M)
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
    # detail: the bolt in the port, the loading port underneath with its
    # lifter, pins, the cross-bolt safety, sling studs, the bore
    port_carrier(M, 0.022, 0.078, 0.04, 0.022, h=0.018)
    cut(rec, cutter_box((0.07, 0.028, 0.01), (0.08, 0, 0.0)))
    box('lifter', (0.068, 0.026, 0.003), (0.08, 0, 0.0055), M['dark'], bevel=0.0006)
    pins('pin', [(-0.035, 0.012), (0.03, 0.012)], 0.022, M)
    cyl('safety', 0.0038, 0.05, (-0.032, 0, 0.006), M['dark'], axis='Y', segs=14)
    sling_swivel('sling_front', 0.49, 0.0075, M)
    sling_swivel('sling_rear', -0.32, -0.0903, M)
    bore('bore', 0.5604, 0.048, 0.0093, M)
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
    # detail: the bolt in the port with its charging handle, the loading port
    # and lifter, the bolt release, pins, a sling stud, the bore
    port_carrier(M, 0.027, 0.093, 0.035, 0.023, h=0.02)
    cyl('charging', 0.0045, 0.016, (0.08, -0.03, 0.035), M['steel'], axis='Y', segs=14)
    sphere('charging_knob', 0.0058, (0.08, -0.039, 0.035), M['dark'])
    cut(rec, cutter_box((0.07, 0.028, 0.01), (0.11, 0, -0.005)))
    box('lifter', (0.068, 0.026, 0.003), (0.11, 0, 0.0005), M['dark'], bevel=0.0006)
    cyl('bolt_release', 0.0042, 0.004, (0.13, -0.0235, 0.012), M['dark'], axis='Y', segs=14)
    pins('pin', [(-0.045, 0.01), (0.05, 0.004)], 0.023, M)
    sling_swivel('sling_front', 0.47, 0.005, M)
    bore('bore', 0.5404, 0.048, 0.0093, M)
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
    # detail: both bores, the hinge pin, a border line round the action's
    # sides, the safety on the tang, the forend latch, a sling stud
    for s in (-1, 1):
        bore(f'bore{s}', 0.4004, 0.035, 0.0093, M, y=s * 0.0118)
    pins('hinge_pin', [(0.044, 0.01)], 0.025, M, r=0.0055)
    seam(bpy.data.objects['action'], -0.052, 0.042, 0.008, 0.025)
    seam(bpy.data.objects['action'], -0.045, 0.042, 0.05, 0.025)
    box('safety', (0.012, 0.006, 0.004), (-0.07, 0, 0.0513), M['steel'], bevel=0.001)
    box('forend_latch', (0.03, 0.012, 0.004), (0.2, 0, -0.008), M['steel'], bevel=0.001)
    sling_swivel('sling_rear', -0.33, -0.0919, M)
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
    # detail: the bolt carrier in the port, the charging handle on the right,
    # the cover latch, the feed tray on the left with the belt running up into
    # it from the box, rivets, the cross-bolt safety, a sling loop, the bore
    port_carrier(M, 0.082, 0.158, 0.035, 0.03, h=0.02)
    box('charging', (0.016, 0.016, 0.012), (0.215, -0.038, 0.036), M['dark'], bevel=0.002)
    cyl('charging_knob', 0.006, 0.012, (0.215, -0.05, 0.036), M['dark'], axis='Y', segs=16)
    box('cover_latch', (0.016, 0.05, 0.01), (-0.028, 0, 0.086), M['dark'], bevel=0.002)
    box('feed_tray', (0.04, 0.008, 0.03), (0.085, 0.034, 0.05), M['dark'], bevel=0.0015)
    mag = bpy.data.objects['mag']
    for i in range(5):
        lk = box(f'belt{i}', (0.026, 0.008, 0.009), (0.085, 0.041, 0.002 + i * 0.0105), M['brass'], bevel=0.0012)
        lk.parent = mag
    rivets('rivet', [(-0.05, 0.008), (0.0, 0.008), (0.22, 0.008), (0.22, 0.058)], M, y=0.0305)
    cyl('safety', 0.0042, 0.066, (-0.012, 0, 0.004), M['dark'], axis='Y', segs=14)
    sling_swivel('sling_front', 0.6, 0.034, M)
    bore('bore', 0.6704, 0.046, 0.0065, M)
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
    # detail: the bolt carrier in the port, the charging handle on the right,
    # the cover latch, barrel latch, safety, a sling loop, the hole down the
    # flash hider and the bore
    port_carrier(M, 0.067, 0.133, 0.035, 0.026, h=0.016)
    box('charging', (0.014, 0.018, 0.012), (0.16, -0.035, 0.02), M['dark'], bevel=0.002)
    cyl('charging_knob', 0.0062, 0.012, (0.16, -0.048, 0.02), M['dark'], axis='Y', segs=16)
    box('cover_latch', (0.016, 0.044, 0.01), (-0.038, 0, 0.08), M['dark'], bevel=0.002)
    box('barrel_latch', (0.016, 0.008, 0.024), (0.232, 0.03, 0.04), M['dark'], bevel=0.0015)
    lever('safety', M, -0.012, 0.004, 0.026 + 0.0012, 0.016, ang=-0.45)
    cut(fh, cutter_cyl(0.0068, 0.2, (0.7, 0, 0.035), axis='X'))
    sling_swivel('sling_front', 0.53, -0.0005, M)
    bore('bore', 0.6604, 0.035, 0.0065, M)
    empty('muzzle', (0.735, 0, 0.035)); empty('grip', (-0.03, 0, -0.055)); empty('fore', (0.2, 0, -0.012))


# ================================================================ more pistols
def m1911():
    """Single-action .45 in the 1911 pattern: a slim slide with a rounded top,
    fine rear serrations, a lowered ejection port, the firing-pin stop plate
    at the back, the barrel bushing and recoil-spring plug at the muzzle; a
    steel frame with the grip safety (beavertail), thumb safety, slide stop,
    mag release, a ring hammer, the long trigger with lightening holes, a round
    trigger guard, chequered walnut panels held by two slotted screws each and
    a chequered mainspring housing."""
    M = mats()
    X0, X1, Z0, H, W = -0.03, 0.17, 0.016, 0.03, 0.0236
    Z1, zc, ZB = Z0 + H, Z0 + H / 2, Z0 + 0.0155
    sec = lambda w, h, z, tr=0.0075: rrect(w, h, 0.0012, cz=z, top_r=tr)
    slide = loft('slide', [(X0, sec(W - 0.003, H - 0.003, zc)), (X0 + 0.0018, sec(W, H, zc)), (X1 - 0.003, sec(W, H, zc)),
                           (X1, sec(W - 0.002, H - 0.002, zc))], M['paint'])
    serrations(slide, X0 + 0.005, 13, 0.0022, zc - 0.0015, H * 0.62, W / 2, width=0.0011)
    cut(slide, cutter_box((0.04, 0.014, 0.016), (0.056, -W / 2 + 0.0035, Z1 - 0.0065)))     # lowered port
    cut(slide, cutter_cyl(0.0079, 0.008, (X1, 0, ZB), axis='X'))
    box('stop_plate', (0.0008, 0.0095, 0.012), (X0 - 0.0002, 0, Z1 - 0.012), M['dark'], parent=slide, bevel=0.0003)
    cyl('extractor_tail', 0.0018, 0.0008, (X0 - 0.0002, -0.0058, Z1 - 0.0085), M['dark'], parent=slide, axis='X', segs=12)
    rear_sight(M, slide, X0 + 0.004, X0 + 0.015, Z1 - 0.001, 0.0065, 0.017, 0.0032, 0.0026, style=None)
    front_sight(M, slide, X1 - 0.014, X1 - 0.007, Z1 - 0.001, 0.0062, 0.0032, dot=False)
    tube('bushing', X1 - 0.004, X1 + 0.002, 0.0078, M['steel'], parent=slide, z=ZB, segs=28)
    cyl('spring_plug', 0.0036, 0.0024, (X1 + 0.0004, 0, Z0 + 0.0045), M['steel'], parent=slide, axis='X', segs=18)
    box('barrel_hood', (0.042, 0.0135, 0.009), (0.056, 0, ZB + 0.0025), M['steel'], bevel=0.0008)
    barrel_tube('barrel', 0.075, X1 + 0.0028, 0.0058, ZB, M, bore=0.0045, depth=0.004)
    fy = (W - 0.0008) / 2
    puffy('frame', [('M', -0.033, Z0 + 0.002), ('L', 0.15, Z0 + 0.002), ('L', 0.15, 0.003), ('L', 0.048, 0.0012), ('L', 0.0, -0.002),
                    ('L', -0.035, 0.004), ('Q', -0.039, 0.012, -0.033, Z0 + 0.002)], W - 0.0008, M['paint'], r=0.0018, rings=2)
    tg = extrude('trigger_guard', [('M', -0.004, 0.002), ('L', 0.046, 0.0015), ('Q', 0.054, -0.004, 0.052, -0.014), ('Q', 0.05, -0.0255, 0.036, -0.026),
                                   ('L', 0.012, -0.026), ('Q', 0.0, -0.026, -0.005, -0.014), ('L', -0.006, -0.004)], 0.0098, M['paint'], bevel=0.0012)
    cut(tg, extrude('cutter', [('M', 0.0005, 0.006), ('L', 0.044, 0.006), ('Q', 0.0488, -0.004, 0.0478, -0.0135), ('Q', 0.046, -0.0222, 0.035, -0.0222),
                               ('L', 0.0125, -0.0222), ('Q', 0.004, -0.0222, 0.0002, -0.013), ('L', -0.0008, -0.003)], 0.05, None, bevel=0))
    tx = 0.017
    tr = extrude('trigger', [('M', tx - 0.004, 0.003), ('L', tx + 0.004, 0.003), ('L', tx + 0.0042, -0.015), ('Q', tx + 0.0042, -0.018, tx + 0.001, -0.018),
                             ('L', tx - 0.004, -0.017)], 0.0062, M['steel'], bevel=0.0006)
    for k in range(2):
        cut(tr, cutter_cyl(0.0012, 0.02, (tx, 0, -0.004 - k * 0.0045), axis='Y', segs=10))
    ring_hammer('hammer', X0, Z0, Z1, M, w=0.0064, hole=0.0022)
    # grip safety (beavertail) and the thumb safety on the left
    puffy('beavertail', [('M', -0.03, 0.013), ('Q', -0.048, 0.016, -0.056, 0.006), ('Q', -0.057, 0.0, -0.051, -0.002), ('L', -0.044, -0.03),
                         ('L', -0.04, -0.03), ('L', -0.035, 0.004)], W - 0.002, M['paint'], r=0.0025, rings=2)
    extrude('thumb_safety', [('M', -0.03, 0.0138), ('L', -0.012, 0.0136), ('Q', -0.006, 0.0136, -0.006, 0.0172), ('L', -0.012, 0.0186), ('L', -0.03, 0.0176)],
            0.0024, M['dark'], y=fy + 0.001, bevel=0.0004)
    extrude('slide_stop', [('M', 0.004, 0.0122), ('L', 0.03, 0.012), ('L', 0.032, 0.0152), ('L', 0.008, 0.0158)], 0.0018, M['dark'], y=fy + 0.0008, bevel=0.0003)
    cyl('slide_stop_pin', 0.0026, 0.0016, (0.03, -fy - 0.0006, 0.0136), M['steel'], axis='Y', segs=14)
    mr = cyl('mag_release', 0.0038, 0.0028, (-0.008, fy + 0.0012, -0.0075), M['dark'], axis='Y', segs=16)
    for k in range(3):
        cut(mr, cutter_box((0.009, 0.0012, 0.0007), (-0.008, fy + 0.0026, -0.0091 + k * 0.0016)))
    gl, rk, bx = 0.105, 0.24, -0.004
    xb = bx - gl * rk
    puffy('grip', [('M', bx, 0.0), ('Q', bx - gl * rk * 0.45, -gl * 0.5, xb, -gl), ('L', xb - 0.034, -gl), ('L', -0.044, -0.03), ('L', -0.035, 0.004),
                   ('L', bx, 0.0)], W - 0.0004, M['paint'], r=0.003, rings=2)
    puffy('mainspring_housing_chequer', [('M', -0.044, -0.031), ('L', xb - 0.032, -gl + 0.001), ('L', xb - 0.0365, -gl + 0.001), ('L', -0.0485, -0.031)],
          W - 0.002, M['dark'], r=0.0018, rings=1)
    top, bot = ((-0.0093 - 0.0368) / 2, -0.013), ((-0.0328 - 0.0584) / 2, -0.098)
    for s in (-1, 1):
        puffy(f'grip_panel_chequer{s}', [('M', -0.0093, -0.012), ('L', -0.0328, -0.098), ('L', -0.0584, -0.098), ('L', -0.0368, -0.014)],
              0.0034, M['woodd'], y=s * (W / 2 + 0.0012), r=0.0012, rings=1)
        for k, t in enumerate((0.15, 0.85)):
            x, z = top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t
            sc = cyl(f'panel_screw{s}{k}', 0.0026, 0.0012, (x, s * (W / 2 + 0.0031), z), M['steel'], axis='Y', segs=16)
            cut(sc, cutter_box((0.0058, 0.0012, 0.0007), (x, s * (W / 2 + 0.0037), z), rot=(0, 0.6, 0)))
    puffy('mag', [('M', xb - 0.033, -gl + 0.002), ('L', xb + 0.0015, -gl + 0.002), ('L', xb + 0.002, -gl - 0.006), ('L', xb - 0.0335, -gl - 0.006)],
          W, M['dark'], r=0.002, rings=2)
    empty('muzzle', (X1 + 0.006, 0, ZB)); empty('grip', (-0.02, 0, -0.04))


def fiveseven():
    """Polymer pistol in the Five-seveN pattern: a long, tall slide capped on
    top with a polymer cover, stepped down at the front, with angled rear
    serrations, the ejection port and three-dot sights; a frame with a
    three-slot rail, a trigger guard hooked at the front, the ambidextrous mag
    release, a long, slim grip for the twenty-round magazine and its base
    plate."""
    M = mats()
    X0, X1, Z0, H, W = -0.032, 0.172, 0.016, 0.031, 0.0258
    Z1, zc, ZB = Z0 + H, Z0 + H / 2, Z0 + 0.011
    sec = lambda w, h, z, tr=0.0035: rrect(w, h, 0.0016, cz=z, top_r=tr)
    slide = loft('slide', [(X0, sec(W - 0.003, H - 0.003, zc)), (X0 + 0.002, sec(W, H, zc)), (X1 - 0.03, sec(W, H, zc)),
                           (X1 - 0.027, sec(W - 0.002, H - 0.004, zc - 0.002)), (X1 - 0.003, sec(W - 0.002, H - 0.004, zc - 0.002)),
                           (X1, sec(W - 0.005, H - 0.008, zc - 0.003))], M['paint'])
    serrations(slide, X0 + 0.006, 8, 0.0034, zc - 0.0015, H * 0.62, W / 2, tilt=-0.35)
    cut(slide, cutter_box((0.05, 0.0245, 0.013), (0.058, -0.0045, Z1 - 0.004)))
    cut(slide, cutter_cyl(0.006, 0.012, (X1, 0, ZB), axis='X'))
    box('extractor', (0.016, 0.0016, 0.0052), (0.024, -W / 2 - 0.0002, Z1 - 0.0115), M['dark'], parent=slide, bevel=0.0004)
    # the polymer cover over the top of the slide, either side of the port
    for nm, xa, xb_ in (('slide_cap', X0 + 0.014, 0.03), ('slide_cap_front', 0.086, X1 - 0.031)):
        puffy(nm, [('M', xa - 0.002, Z1 - 0.009), ('L', xb_, Z1 - 0.009), ('L', xb_, Z1 + 0.0004), ('L', xa, Z1 + 0.0004)], W + 0.0012, M['poly'],
              parent=slide, r=0.0016, rings=1)
    rear_sight(M, slide, X0 + 0.004, X0 + 0.016, Z1 - 0.001, 0.0072, 0.0195, 0.0034, 0.0029)
    front_sight(M, slide, X1 - 0.044, X1 - 0.036, Z1 - 0.001, 0.0068, 0.0034)
    box('barrel_hood', (0.052, 0.0156, 0.011), (0.058, 0, Z1 - 0.0062), M['steel'], bevel=0.0008)
    barrel_tube('barrel', 0.083, X1 - 0.0004, 0.0057, ZB, M, bore=0.0035)
    fy = (W - 0.0012) / 2
    fr = puffy('frame', [('M', -0.035, Z0 + 0.002), ('L', 0.162, Z0 + 0.002), ('L', 0.162, 0.0035), ('L', 0.052, 0.0012), ('L', 0.0, -0.002),
                         ('L', -0.037, 0.004), ('Q', -0.041, 0.012, -0.035, Z0 + 0.002)], W - 0.0012, M['poly'], r=0.0024, rings=2)
    for s in (-1, 1):
        cut(fr, cutter_box((0.084, 0.0028, 0.0022), (0.118, s * fy, 0.0072)))
    for i in range(3):
        cut(fr, cutter_box((0.0045, 0.04, 0.0032), (0.104 + i * 0.016, 0, 0.0032)))
    tg = extrude('trigger_guard', [('M', -0.004, 0.002), ('L', 0.05, 0.0015), ('L', 0.052, -0.005), ('Q', 0.056, -0.012, 0.052, -0.02), ('Q', 0.049, -0.026, 0.04, -0.026),
                                   ('L', 0.012, -0.026), ('Q', 0.0, -0.026, -0.005, -0.014), ('L', -0.006, -0.004)], 0.0112, M['poly'], bevel=0.0014)
    cut(tg, extrude('cutter', [('M', 0.0008, 0.006), ('L', 0.047, 0.006), ('L', 0.0478, -0.004), ('Q', 0.0505, -0.012, 0.0478, -0.0185), ('Q', 0.0455, -0.0222, 0.039, -0.0222),
                               ('L', 0.0125, -0.0222), ('Q', 0.004, -0.0222, 0.0002, -0.013), ('L', -0.0008, -0.003)], 0.05, None, bevel=0))
    tx = 0.023
    extrude('trigger', [('M', tx - 0.002, 0.004), ('Q', tx + 0.006, -0.006, tx + 0.0012, -0.0185), ('L', tx - 0.004, -0.0175),
                        ('Q', tx - 0.0004, -0.006, tx - 0.0072, 0.003)], 0.006, M['dark'], bevel=0.0008)
    for s in (-1, 1):
        box(f'mag_release{s}', (0.006, 0.0022, 0.0074), (-0.0085, s * 0.0141, -0.0072), M['poly'], bevel=0.0008)
    extrude('slide_stop', [('M', 0.006, 0.0124), ('L', 0.031, 0.0124), ('L', 0.0335, 0.0156), ('L', 0.011, 0.0159)], 0.0016, M['dark'], y=fy + 0.0008, bevel=0.0003)
    for i, x in enumerate((0.012, 0.043)):
        cyl(f'frame_pin{i}', 0.0012, W - 0.0004, (x, 0, 0.004), M['steel'], axis='Y', segs=10)
    gl, rk, bx = 0.114, 0.27, -0.004
    xb = bx - gl * rk
    puffy('grip', [('M', bx, 0.0), ('Q', bx - gl * rk * 0.42, -gl * 0.5, xb, -gl), ('L', xb - 0.0345, -gl), ('Q', xb - 0.041, -gl * 0.5, -0.0405, -0.004),
                   ('Q', -0.051, 0.006, -0.043, 0.0118), ('L', -0.031, 0.006), ('L', bx, 0.0)], W + 0.002, M['poly'], r=0.0075, rings=3)
    puffy('mag', [('M', xb - 0.037, -gl + 0.0025), ('L', xb + 0.0022, -gl + 0.0025), ('L', xb + 0.003, -gl - 0.008), ('L', xb - 0.0375, -gl - 0.008)],
          W + 0.003, M['poly'], r=0.0024, rings=2)
    empty('muzzle', (X1 + 0.005, 0, ZB)); empty('grip', (-0.02, 0, -0.042))


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
    rs = box('rear_sight', (0.012, 0.018, 0.01), (-0.05, 0, 0.066), M['dark'], bevel=0.002)
    cut(rs, cutter_box((0.02, 0.0035, 0.006), (-0.05, 0, 0.071)))
    for s in (-1, 1):
        rod(f'wire{s}', (-0.068, 0.072), (0.09, 0.072), 0.0025, M['steel'], y=s * 0.012)
    rod('wire_end', (0.09, 0.064), (0.09, 0.08), 0.0028, M['steel'])
    # detail: slots the cocking knobs ride in and their stems, the end cap and
    # barrel nut, selector, mag catch, pins, the front sight's ears, the bore
    for s in (-1, 1):
        cut(rec, cutter_box((0.05, 0.004, 0.0055), (-0.005, s * 0.017, 0.05)))
        cyl(f'cocking_stem{s}', 0.0022, 0.006, (0.0, s * 0.0175, 0.05), M['dark'], axis='Y', segs=10)
        box(f'fs_ear{s}', (0.012, 0.0022, 0.016), (0.112, s * 0.0065, 0.08), M['dark'], bevel=0.0006)
    box('end_cap', (0.008, 0.035, 0.043), (-0.073, 0, 0.042), M['dark'], bevel=0.003)
    lathe('barrel_nut', [(0.118, 0.0001), (0.118, 0.0125), (0.128, 0.0125), (0.13, 0.011), (0.13, 0.0001)], M['dark'], z=0.045, segs=20)
    lever('selector', M, -0.045, 0.031, 0.017 + 0.0012, 0.016, ang=PI * 0.92)
    box('mag_catch', (0.006, 0.02, 0.012), (0.034, 0, 0.017), M['dark'], bevel=0.001)
    pins('pin', [(-0.038, 0.027), (0.01, 0.027)], 0.017, M)
    box('fs_post', (0.003, 0.003, 0.012), (0.112, 0, 0.078), M['dark'], bevel=0)
    pins('grip_screw', [(-0.051, -0.028)], 0.015, M, r=0.003)
    bore('bore', 0.1604, 0.045, 0.0055, M)
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
    puffy('grip_chequer', [('M', -0.035, 0.022), ('Q', -0.045, -0.03, -0.062, -0.078), ('Q', -0.066, -0.094, -0.05, -0.096), ('L', -0.022, -0.092),
                   ('Q', -0.012, -0.04, 0.0, 0.018)], 0.034, M['woodd'], r=0.01, rings=3)
    trigger_group(M, -0.002, 0.04, 0.018, 0.026, M['paint'])
    # detail: chamber mouths in the cylinder's face (and the cylinder turns
    # about its own axis), the rear sight's notch in the top strap, the
    # cylinder latch, side-plate screws, the bore, the grip's screw
    for i in range(6):
        a = i / 6 * PI * 2 + PI / 6
        cut(cylg, cutter_cyl(0.0042, 0.012, (0.052, math.cos(a) * 0.011, 0.046 + math.sin(a) * 0.011), axis='X', segs=14))
    set_origin(cylg, (0.0, 0.0, 0.046))
    cut(fr, cutter_box((0.014, 0.0035, 0.006), (-0.016, 0, 0.0745)))
    extrude('cylinder_latch', [('M', -0.014, 0.045), ('L', 0.0, 0.0455), ('L', 0.0, 0.052), ('L', -0.014, 0.0525)], 0.0024, M['dark'], y=0.0145, bevel=0.0005)
    screws('sideplate_screw', [(-0.024, 0.034), (-0.004, 0.024), (-0.018, 0.058)], 0.014, M, r=0.0022, sides=(1,))
    bore('bore', 0.2004, 0.05, 0.0045, M)
    pins('grip_screw', [(-0.035, -0.045)], 0.017, M, r=0.0035)
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
    """Balisong, built like a real one (sandwich construction). The blade's
    tang carries two pivot pins, one near the edge and one near the spine, and
    each handle turns on its own: a pair of liners straddling the blade, one
    liner either side of it, with a scale on the outside, Torx screws and a
    spacer closing its butt end. Open, the handles lie along the blade's edge
    and spine sides and meet in the middle, the tang between them; the held
    handle (bfA) is the one on the edge side. Closed, the blade sits in the
    channels between both pairs of liners, its spine in one handle and its edge
    in the other (only a thin line of each shows along the open edges, as on the
    real thing). Each pin sits halfway up its handle, so either way the two
    handles stack into the same bar. The blade (centred between the pins) is
    shorter than the handles, and the spacers and latch sit beyond the reach of
    its tip, so it swings past them in a flip."""
    M = mats()
    # pivot x, each handle's height, butt end, liner thickness, the gap between
    # blade and liner (washers), the blade's thickness
    PX, H, END, TL, G, TB = 0.003, 0.0135, -0.132, 0.0024, 0.0004, 0.0036
    ZA, ZB = -H / 2, H / 2          # the pins: the held handle's (edge side), the free handle's (spine side)
    RT = 0.0043                     # the tang round each pin
    LY = TB / 2 + G + TL / 2        # the liners' middles, either side of the blade
    LO = TB / 2 + G + TL            # their outer faces
    c45 = RT * math.cos(PI / 4)
    blade('blade', [('M', 0.012, 0.01115), ('L', 0.068, 0.01135), ('Q', 0.093, 0.01095, 0.114, -0.00035),     # spine, clip to the point
                    ('Q', 0.095, -0.01135, 0.034, -0.01065), ('L', 0.025, -0.01035),                        # belly and edge
                    ('Q', 0.0195, -0.01045, 0.019, -0.00745), ('Q', 0.0185, -0.00515, 0.015, -0.00565),     # the choil
                    ('L', PX + c45, ZA - c45), ('A', PX, ZA, RT, -PI / 4, -PI),                             # the tang, round both pins
                    ('L', PX - RT, ZB), ('A', PX, ZB, RT, PI, PI / 4), ('L', 0.012, 0.01115)],
          lambda x, z: (x > 0.025 and z < -0.0019) or (x > 0.086 and z > -0.00045), TB, M['blade'])      # the edge, and the swedge up the clip

    def handle(name, zp, side_out):
        """One handle on the pin at height zp; side_out: +1 if its outer long edge is above (spine side)."""
        piv = empty(name, (PX, 0, zp))
        z0, z1 = zp - H / 2, zp + H / 2
        # the corner on the outer long edge is well rounded, the one on the seam
        # (where the two handles meet) nearly square, so they close flush
        ro, rs = 0.005, 0.0015
        r0, r1 = (rs, ro) if side_out > 0 else (ro, rs)
        outline = [('M', END + r0, z0), ('L', PX, z0), ('A', PX, zp, H / 2, -PI / 2, PI / 2), ('L', END + r1, z1),
                   ('Q', END, z1, END, z1 - r1), ('L', END, z0 + r0), ('Q', END, z0, END + r0, z0)]
        sx0, sx1, sh = END + 0.012, PX - 0.0112, H / 2 - 0.0019
        scale_outline = [('M', sx0, zp - sh), ('L', sx1, zp - sh), ('A', sx1, zp, sh, -PI / 2, PI / 2), ('L', sx0, zp + sh),
                         ('A', sx0, zp, sh, PI / 2, 3 * PI / 2)]
        parts = []
        for s in (1, -1):
            parts.append(extrude(f'{name}_liner{"LR"[s < 0]}', outline, TL, M['steel'], y=s * LY, bevel=0.0005, bevel_segs=2, seg=8))
            sc = extrude(f'{name}_scale{"LR"[s < 0]}', scale_outline, 0.0012, M['polymer'], y=s * (LO + 0.0006), bevel=0.0003, bevel_segs=1, seg=8)
            for k in range(9):                                           # grip grooves across it
                cut(sc, cutter_box((0.0013, 0.0012, 0.03), (sx0 + 0.008 + k * 0.0104, s * (LO + 0.0012), zp), rot=(0, 0.55, 0)))
            parts.append(sc)
            # Torx screws: the pivot and the butt
            for k, (x, r) in enumerate(((PX, 0.0042), (END + 0.007, 0.0022))):
                parts.append(cyl(f'{name}_screw{k}{"LR"[s < 0]}', r, 0.0012, (x, s * (LO + 0.0004), zp), M['steel'], axis='Y', segs=16, bevel=0.0002))
                parts.append(cyl(f'{name}_torx{k}{"LR"[s < 0]}', r * 0.38, 0.0012, (x, s * (LO + 0.0007), zp), M['dark'], axis='Y', segs=6))
        # the spacer closing the butt end between the liners
        parts.append(box(f'{name}_spacer', (0.007, 2 * (TB / 2 + G) - 0.0002, H - 0.0012), (END + 0.0075, 0, zp), M['dark'], bevel=0.0006))
        for o in parts:
            o.parent = piv
            o.location.x -= PX
            o.location.z -= zp
        return piv

    handle('bfA', ZA, -1)
    handle('bfB', ZB, 1)
    # bronze washers either side of the tang at each pin, and the pins
    for zp in (ZA, ZB):
        for s in (1, -1):
            cyl(f'washer{"AB"[zp > 0]}{"LR"[s < 0]}', 0.0047, 0.00038, (PX, s * (TB / 2 + G / 2), zp), M['brass'], axis='Y', segs=24)
        cyl(f'pivot_pin{"AB"[zp > 0]}', 0.0024, 2 * LO, (PX, 0, zp), M['steel'], axis='Y', segs=16)
    # the latch: a lever in the held handle's butt end, along the seam side, in
    # the strip the closed blade leaves free
    latch = box('latch', (0.009, 2 * (TB / 2 + G) - 0.0004, 0.0018), (END + 0.0035, 0, -0.0011), M['dark'], bevel=0.0004)
    latch.parent = bpy.data.objects['bfA']
    latch.location.x -= PX
    latch.location.z -= ZA
    # the fist closes round the middle of the handles
    return 0.114, -0.066


@knife
def flip():
    M = mats()
    b = blade('blade', [('M', 0.012, 0.012), ('L', 0.12, 0.014), ('Q', 0.17, 0.01, 0.19, -0.004), ('Q', 0.14, -0.02, 0.012, -0.014)], edge_below(lambda x: -0.002), 0.005, M['blade'])
    cut(b, cutter_cyl(0.005, 0.03, (0.035, 0, 0.004), axis='Y'), tolerant=True)
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
    """A skeleton knife in the real style: a drop-point blade with a round
    hole through it near the spine, ground from the same flat bar as its
    open-frame handle (a long window through the handle), a wrap of cord
    round the front of the handle and a finger ring at the end."""
    M = mats()
    b = blade('blade', [('M', 0.012, 0.012), ('L', 0.14, 0.012), ('Q', 0.18, 0.009, 0.2, -0.002), ('Q', 0.15, -0.017, 0.012, -0.013)],
              edge_below(lambda x: 0.0 if x < 0.14 else 0.005), 0.0045, M['blade'])
    # the round hole, near the base of the blade up by the spine
    cut(b, cutter_cyl(0.0056, 0.03, (0.047, 0, 0.0035), axis='Y', segs=32), tolerant=True)
    # the frame: as thick as the blade, so it reads as one piece of steel
    fr = extrude('frame', [('M', 0.014, 0.012), ('L', -0.09, 0.0105), ('Q', -0.104, 0.0, -0.09, -0.0115), ('L', 0.014, -0.013)], 0.0052, M['steel'], bevel=0.0012)
    cut(fr, extrude('cutter', [('M', -0.03, 0.0055), ('L', -0.08, 0.0048), ('Q', -0.0875, 0.0, -0.08, -0.0055), ('L', -0.03, -0.0062),
                               ('Q', -0.024, 0.0, -0.03, 0.0055)], 0.03, None, bevel=0))
    # the cord: wound tight round the front of the frame
    for i in range(7):
        box(f'cord{i}', (0.0042, 0.0098, 0.0285), (0.006 - i * 0.0048, 0, -0.0004), M['cord'], bevel=0.0018, rot=(0, 0.32, 0))
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
def falchion():
    """Falchion: a broad, single-edged blade that widens toward the tip, its
    edge sweeping out in a long convex curve and the spine dropping in a short
    clip to the point, with a fuller under the spine; a narrow brass guard, a
    contoured wooden handle pinned in brass and a steel pommel cap."""
    M = mats()
    blade('blade', [('M', 0.013, 0.011), ('L', 0.15, 0.012), ('Q', 0.181, 0.0105, 0.203, -0.006), ('Q', 0.193, -0.027, 0.14, -0.0265), ('Q', 0.07, -0.02, 0.013, -0.013)],
          edge_below(lambda x: -0.002 if x < 0.16 else 0.004), 0.0052, M['blade'])
    blade('fuller', [('M', 0.032, 0.0078), ('L', 0.122, 0.0088), ('L', 0.122, 0.0050), ('L', 0.032, 0.0040)], lambda x, z: False, 0.0058, M['steel'])
    extrude('guard', [('M', 0.006, 0.019), ('L', 0.014, 0.019), ('L', 0.014, -0.024), ('Q', 0.0105, -0.0295, 0.006, -0.024)], 0.024, M['brass'], bevel=0.0025)
    puffy('handle', [('M', 0.006, 0.013), ('Q', -0.045, 0.017, -0.092, 0.011), ('L', -0.099, 0.0095), ('L', -0.099, -0.0145), ('Q', -0.05, -0.022, 0.006, -0.015)],
          0.022, M['woodd'], r=0.0075, rings=3)
    extrude('pommel', [('M', -0.098, 0.0105), ('L', -0.109, 0.009), ('Q', -0.1155, -0.002, -0.109, -0.016), ('L', -0.098, -0.0155)], 0.0235, M['steel'], bevel=0.003)
    for i, x in enumerate((-0.026, -0.07)):
        cyl(f'pin{i}', 0.0024, 0.0234, (x, 0, -0.001), M['brass'], axis='Y', segs=16)
    return 0.203


@knife
def talon():
    """Talon: a short, deeply hooked claw of a blade, the edge on the inside
    of the curve, on a slim handle with a ring for the index finger at its
    front, under the blade (it's held in a normal grip with that finger through
    the ring; the karambit's ring is at its pommel, held the other way)."""
    M = mats()
    chord = lambda x: 0.012 - 0.3176 * (x - 0.012)
    blade('blade', [('M', 0.012, 0.012), ('C', 0.06, 0.031, 0.13, 0.024, 0.16, -0.035), ('C', 0.122, -0.006, 0.07, -0.0045, 0.012, -0.011)],
          lambda x, z: z < chord(x) - 0.001, 0.0048, M['blade'])
    extrude('bolster', [('M', 0.004, 0.0145), ('L', 0.016, 0.0145), ('L', 0.016, -0.0135), ('L', 0.004, -0.0135)], 0.021, M['dark'], bevel=0.002)
    puffy('handle', [('M', 0.006, 0.013), ('Q', -0.04, 0.0165, -0.094, 0.0095), ('Q', -0.107, -0.002, -0.094, -0.0135), ('Q', -0.04, -0.0115, 0.006, -0.0135)],
          0.0195, M['polymer'], r=0.007, rings=3)
    for i in range(4):
        box(f'groove{i}', (0.0022, 0.0205, 0.004), (-0.03 - i * 0.012, 0, 0.0125 - i * 0.0006), M['rubber'], bevel=0.0008)
    torus('ring', 0.0205, 0.0046, (0.004, 0, -0.037), M['dark'], segs=40)
    extrude('ring_web', [('M', -0.006, -0.0105), ('L', 0.014, -0.0105), ('L', 0.012, -0.0175), ('L', -0.004, -0.0175)], 0.0085, M['dark'], bevel=0.001)
    cyl('screw0', 0.0028, 0.021, (0.010, 0, 0.0), M['steel'], axis='Y', segs=16)
    cyl('screw1', 0.0022, 0.0205, (-0.075, 0, -0.001), M['steel'], axis='Y', segs=16)
    return 0.16, -0.046


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
    # where the index finger goes through the front of the bow: a ring spin goes
    # round it there (an unseen marker: no material, hidden by the game)
    torus('ringmark', 0.0085, 0.0012, (-0.008, 0, -0.03), None)
    return 0.205


@knife
def cord():
    """Full-tang clip-point knife with the handle wrapped in paracord and a lanyard loop."""
    M = mats()
    blade('blade', [('M', 0.012, 0.014), ('L', 0.12, 0.014), ('Q', 0.15, 0.012, 0.165, 0.004), ('L', 0.19, 0.002), ('Q', 0.16, -0.018, 0.012, -0.015)],
          edge_below(lambda x: 0.002 if x < 0.16 else 0.006), 0.005, M['blade'])
    extrude('tang', [('M', 0.012, 0.016), ('L', -0.104, 0.014), ('L', -0.104, -0.016), ('L', 0.012, -0.017)], 0.01, M['dark'], bevel=0.002)
    handle_wrap(M, -0.1, 0.008, 0.026, 0.022, M['cord'], M['cord'], 12)
    torus('ring', 0.011, 0.003, (-0.115, 0, 0), M['cord'], rot=(PI / 2, 0, 0))   # the lanyard loop (a ring spin goes round the finger through it)
    return 0.19



# ================================================================ M4A1-S: the M4 with a slim
# round handguard, a long suppressor and a 20-round magazine
def m4a1s():
    m4a1()
    M = mats()
    for n in ('flash_hider', 'barrel', 'gas_block', 'handguard', 'barrel_nut', 'muzzle', 'fore', 'sling_front',
              'mag', 'mag_floor', 'magrib0', 'magrib1', 'magrib2', 'bore'):
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
    cut(sup, cutter_cyl(0.0045, 0.02, (0.672, 0, 0.042), axis='X'))
    bore('bore', 0.6624, 0.042, 0.0043, M)
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
    # detail: the bolt carrier in the port, the charging handle on the right,
    # a selector, the hole down the flash hider and the bore
    port_carrier(M, 0.077, 0.143, 0.035, 0.029, h=0.018)
    box('charging', (0.016, 0.016, 0.012), (0.2, -0.037, 0.03), M['dark'], bevel=0.002)
    cyl('charging_knob', 0.0062, 0.012, (0.2, -0.05, 0.03), M['dark'], axis='Y', segs=16)
    lever('selector', M, -0.03, 0.01, 0.029 + 0.0012, 0.017, ang=PI * 0.85)
    cut(fh, cutter_cyl(0.0068, 0.2, (0.73, 0, 0.04), axis='X'))
    bore('bore', 0.7004, 0.04, 0.0065, M)
    empty('muzzle', (0.762, 0, 0.04)); empty('grip', (-0.025, 0, -0.055)); empty('fore', (0.35, 0, -0.04))


GUNS = {'ak47': ak47, 'm4a1': m4a1, 'awp': awp, 'glock': glock, 'usp': usp, 'deagle': deagle,
        'm1911': m1911, 'fiveseven': fiveseven, 'vz61': vz61, 'revolver': revolver,
        'mac10': mac10, 'mp5': mp5, 'mp7': mp7, 'ump45': ump45, 'vector': vector, 'p90': p90,
        'galil': galil, 'famas': famas, 'scarh': scarh, 'sg550': sg550, 'aug': aug,
        'scout': scout, 'dmr': dmr, 'dbarrel': dbarrel, 'pump': pump, 'm1014': m1014, 'm249': m249, 'pkm': pkm,
        'm4a1s': m4a1s, 'negev': negev}


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# how far round each point the models' baked occlusion looks (m)
AO_DIST = 0.022


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
    for o in joined:   # decimation can leave degenerate faces on small parts
        o.data.validate()
    export_glb(path, ao=AO_DIST)
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
        export_glb(os.path.join(out, f'{name}.glb'), ao=AO_DIST)
        report[name] = stats()
        print(f'{name}: {report[name]} tris')
        if '--lod' in argv or '--lod-only' in argv:
            os.makedirs(os.path.join(out, 'lod'), exist_ok=True)
            print(f'  third-person: {lod_export(os.path.join(out, "lod", f"{name}.glb"))} tris')
    return report


if __name__ == '__main__':
    main(sys.argv)
