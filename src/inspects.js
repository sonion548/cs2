// Knife inspects: one choreography per knife type, as keyframes on named
// channels, sampled with a smooth curve that keeps spins moving through their
// middle keys (monotone cubic: no overshoot, starts and ends at rest).
//
// Channels (all 0 at rest; units are view-space metres and radians):
//   hand    roll   forearm turning over, about the knuckle line
//           flex   wrist bending (turns the flat of a forward-held blade to you)
//           yaw    wrist bending sideways
//           x y z  where the hand moves to (view space: +x right, +y up, +z back)
//   knife   twirl  spin about its own length, through the grip, in the fingers
//           flip   end over end about its balance point (tosses)
//           lift   up out of the hand (tosses)
//           ring   spin about the finger ring (karambit, skeleton knife)
//           ringW  0..1: the knife moves off the fist onto the index finger
//           bb bh  balisong: blade and free handle angles against the hand
//           slide  along its length in the hand (balisong flips: held by the end)
//   fingers th ix mi  open (1 = straight, negative = tighter): thumb, index,
//                  the other three
//           wave   a roll travelling across the fingers (radians), as when
//                  the fingers walk a handle round
//   left    l...   the same hand channels for the second push dagger
// `end` sets where a channel finishes (a full turn is as good as none).

const PI = Math.PI, TAU = PI * 2;
// the flat of a forward-held blade turned to you, brought up toward the middle
const SHOW = { roll: 0.12, flex: -0.5, x: -0.054, y: 0.036, z: 0.018 };
const show = (o = {}) => ({ ...SHOW, ...o });
const LOOSE = { ix: 0.3, mi: 0.38, th: 0.25 };
const GRIP = { ix: 0, mi: 0, th: 0, wave: 0 };
const OPEN = { ix: 0.85, mi: 0.95, th: 0.7 };   // let go for a toss

// A toss and catch from pose `p`: the hand opens, the knife rises, turns end
// over end `turns` times and drops back in, the fist closing round it.
function toss(t0, p, flip0, turns = 1, h = 0.075, d = 0.62) {
  const f1 = flip0 + TAU * turns;
  return [
    [t0, { ...p, flip: flip0, lift: 0 }],
    [t0 + d * 0.18, { ...p, ...OPEN, flip: flip0 + 0.3, lift: h * 0.45, y: (p.y || 0) + 0.008 }],
    [t0 + d * 0.5, { ...p, ...OPEN, flip: (flip0 + f1) / 2, lift: h }],
    [t0 + d * 0.86, { ...p, ...OPEN, flip: f1 - 0.25, lift: h * 0.3 }],
    [t0 + d, { ...p, ...GRIP, flip: f1, lift: 0, y: (p.y || 0) - 0.01 }],
    [t0 + d + 0.16, { ...p, ...GRIP, flip: f1, lift: 0 }],
  ];
}

// The knife walked round in the fingers by `by` radians from `from`.
function twirl(t0, p, from, by, d = 0.5) {
  return [
    [t0, { ...p, twirl: from }],
    [t0 + 0.15, { ...p, ...LOOSE, twirl: from + by * 0.06 }],
    [t0 + 0.15 + d, { ...p, ...LOOSE, wave: 0.42, twirl: from + by }],
    [t0 + 0.3 + d, { ...p, ...GRIP, twirl: from + by }],
  ];
}

// A spin round the index finger through the knife's ring, driven from the
// wrist: it cocks back as the grip loosens, then flicks through, the index
// finger straightening as the knife swings out onto it; the knife turns
// `turns` times, fast at first and slowing (the viewmodel moves the hand in a
// small circle just ahead of the knife and pumps the finger with each turn,
// so the hand is seen to keep it going); then the handle comes round into the
// palm, the fist closes on it and the wrist gives a little with the catch.
function ringSpin(t0, p, from, turns = 2, d = 0.9) {
  const to = from + TAU * turns, r = p.roll || 0, f = p.flex || 0, y = p.y || 0;
  return [
    [t0, { ...p, ring: from, ringW: 0 }],
    [t0 + 0.16, { ...p, roll: r - 0.25, flex: f + 0.32, y: y - 0.004, ix: 0.3, mi: 0.1, th: 0.2, ring: from - 0.12, ringW: 0 }],
    [t0 + 0.32, { ...p, roll: r + 0.15, flex: f - 0.18, y: y + 0.008, ix: 0.95, mi: -0.1, th: 0.35, ring: from + 1.1, ringW: 1 }],
    [t0 + 0.32 + d * 0.5, { ...p, roll: r + 0.05, flex: f - 0.05, ix: 0.95, mi: -0.2, th: -0.05, ring: from + (to - from) * 0.56, ringW: 1 }],
    [t0 + 0.32 + d, { ...p, ix: 0.95, mi: -0.2, th: -0.05, ring: to - 0.7, ringW: 1 }],
    [t0 + 0.46 + d, { ...p, flex: f - 0.14, y: y - 0.004, ix: 0.55, mi: 0.25, th: 0.3, ring: to - 0.12, ringW: 0.55 }],
    [t0 + 0.6 + d, { ...p, ...GRIP, flex: f + 0.06, y: y - 0.006, ring: to, ringW: 0 }],
    [t0 + 0.8 + d, { ...p, ...GRIP, ring: to, ringW: 0 }],
  ];
}

// Balisong: a close (free handle round once, blade back into the handles) or
// an open (blade swings out the front, the handle round again), each flicked
// from the wrist with the fingers lifting to let the handle by.
// The knife slides out in the hand so it's held by the far end of one handle
// and the blade swings round the pin clear of the fingers, as flippers hold it.
const SLIDE = -0.068;
function bali(t0, p, bb, bh, d = 0.42) {
  const r = p.roll || 0, f = p.flex || 0, y = p.y || 0;
  p = { ...p, slide: SLIDE };
  return [
    // wind up: the wrist cocks the other way
    [t0, { ...p, bb, bh, roll: r + 0.55, flex: f + 0.15, y }],
    // snap: the forearm turns over, the free handle and blade go round
    [t0 + d * 0.45, { ...p, bb: bb + PI * 0.5, bh: bh - PI * 1.05, roll: r - 0.8, flex: f - 0.25, y: y + 0.014, mi: 0.6, ix: 0.3, th: 0.25 }],
    // catch: the handle slaps back into the palm
    [t0 + d, { ...p, bb: bb + PI, bh: bh - TAU, roll: r + 0.1, flex: f, y: y - 0.006, ...GRIP }],
  ];
}

const seq = (...parts) => parts.flat();

export const KNIFE_INSPECTS = {
  standard: { len: 3.9, end: { twirl: TAU }, keys: seq(
    [[0.45, show()], [1.15, show({ flex: -0.58, y: 0.04 })]],
    twirl(1.2, show({ flex: -0.56 }), 0, PI),
    [[2.65, show({ roll: 0.6, flex: -0.25, twirl: PI })], [2.95, show({ roll: 0.5, flex: -0.3, twirl: PI })]],
    twirl(3.0, show({ roll: 0.2 }), PI, PI, 0.4),
  ) },
  bayonet: { len: 4.0, end: { flip: TAU }, keys: seq(
    [[0.4, show({ flex: -0.3, y: 0.03 })]],
    toss(0.5, show({ flex: -0.25, y: 0.03 }), 0, 1),
    [[2.0, show({ flex: -0.6, flip: TAU })], [2.75, show({ roll: 0.65, flex: -0.3, flip: TAU })], [3.4, show({ roll: 0.2, flip: TAU })]],
  ) },
  combat: { len: 3.9, end: { twirl: 2 * TAU }, keys: seq(
    [[0.45, show({ flex: -0.45 })]],
    twirl(0.55, show({ flex: -0.45 }), 0, TAU, 0.45),
    twirl(1.35, show({ flex: -0.4 }), TAU, TAU, 0.45),
    [[2.6, show({ roll: 0.6, flex: -0.25, twirl: 2 * TAU })], [3.3, show({ roll: 0.2, twirl: 2 * TAU })]],
  ) },
  // one continuous spin on the index finger (three turns), back into the fist,
  // a look down the blade, then the wrist turns it over to show the other side
  karambit: { len: 5.0, fluid: true, end: { ring: 3 * TAU }, keys: seq(
    [[0.28, show({ roll: -0.15, flex: -0.12, y: 0.045 })]],
    ringSpin(0.32, show({ roll: -0.1, flex: -0.1, y: 0.05 }), 0, 3, 1.4),
    [[2.85, show({ roll: 0.58, flex: -0.35, y: 0.05, ring: 3 * TAU })],
      [3.35, show({ roll: 0.66, flex: -0.42, y: 0.052, ring: 3 * TAU, th: 0.08 })],
      // in a reverse grip the handle lies across the palm, so bending the
      // wrist turns the blade about its own length: the other face
      [3.9, show({ roll: 0.32, flex: 0.95, y: 0.055, ring: 3 * TAU })],
      [4.45, show({ roll: 0.38, flex: 1.02, y: 0.052, ring: 3 * TAU, th: 0.08 })]],
  ) },
  butterfly: { len: 4.6, end: { bb: 6 * PI, bh: -12 * PI, twirl: TAU }, keys: seq(
    [[0.35, show({ flex: -0.3, y: 0.03 })]],
    bali(0.45, show({ flex: -0.25, y: 0.035 }), 0, 0),                    // close
    bali(0.95, show({ flex: -0.25, y: 0.035 }), PI, -TAU),                // open
    twirl(1.45, show({ flex: -0.35, bb: TAU, bh: -2 * TAU, slide: SLIDE }), 0, TAU, 0.45),
    bali(2.4, show({ flex: -0.25, y: 0.035, twirl: TAU }), TAU, -2 * TAU, 0.34),       // fast close,
    bali(2.78, show({ flex: -0.25, y: 0.035, twirl: TAU }), 3 * PI, -3 * TAU, 0.34),  // open,
    bali(3.16, show({ flex: -0.25, y: 0.035, twirl: TAU }), 4 * PI, -4 * TAU, 0.34),  // close,
    bali(3.54, show({ flex: -0.25, y: 0.035, twirl: TAU }), 5 * PI, -5 * TAU, 0.34),  // open
    [[4.15, show({ flex: -0.55, bb: 6 * PI, bh: -12 * PI, twirl: TAU })]],
  ) },
  flip: { len: 3.8, end: { twirl: TAU, flip: TAU }, keys: seq(
    [[0.4, show({ flex: -0.35 })]],
    twirl(0.45, show({ flex: -0.35 }), 0, TAU, 0.42),
    [[1.75, show({ roll: 0.6, flex: -0.3, twirl: TAU })]],
    toss(1.85, show({ flex: -0.3, twirl: TAU }), 0, 1, 0.065, 0.58),
    [[3.2, show({ flex: -0.45, twirl: TAU, flip: TAU })]],
  ) },
  gut: { len: 3.7, end: { twirl: TAU }, keys: seq(
    [[0.45, show({ flex: -0.6 })], [1.15, show({ flex: -0.62, roll: 0.25 })]],
    twirl(1.2, show({ flex: -0.55 }), 0, PI),
    [[2.65, show({ roll: 0.6, flex: -0.3, twirl: PI })]],
    twirl(2.75, show({ roll: 0.2 }), PI, PI, 0.42),
  ) },
  bowie: { len: 4.2, end: { flip: TAU }, keys: seq(
    [[0.5, show({ flex: -0.45, y: 0.03, z: 0.03 })], [1.25, show({ flex: -0.55, z: 0.03 })], [1.9, show({ roll: 0.7, flex: -0.25 })]],
    toss(2.0, show({ roll: 0.3, flex: -0.3 }), 0, 1, 0.085, 0.7),
    [[3.5, show({ flex: -0.42, flip: TAU })]],
  ) },
  // Push daggers, one in each fist. The T-bar stays clenched in the palm the
  // whole time (it can't turn in the hand), so it's all forearms, wrists and
  // grips: up into a guard, the right forearm turned to show one face of its
  // blade and then the other while the left waits, the left the same, a jab
  // with each fist (the grip squeezing first), the blades brought in point to
  // point and tapped together, and back down.
  push: { len: 4.7, fluid: true, keys: (() => {
    const R0 = { roll: 0, flex: -0.15, yaw: 0, x: -0.02, y: 0.045, z: 0 };
    const L0 = { lroll: 0, lflex: -0.15, lyaw: 0, lx: 0.02, ly: 0.045, lz: 0 };
    const L = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ['l' + k, k === 'x' ? -v : v]));
    const pose = (r = {}, l = {}, f = {}) => ({ ...R0, ...r, ...L0, ...L(l), ...f });
    const faceA = { roll: -0.5, flex: -0.35, y: 0.052 }, faceB = { roll: 0.4, flex: -0.3, y: 0.05 };
    const jab = { z: -0.05, flex: 0.45, y: 0.06 }, back = { z: 0.008, flex: -0.2 };
    const meet = { x: -0.075, y: 0.064, z: -0.012, yaw: -0.85, flex: -0.15 };
    return [
      [0.42, pose()],
      [0.9, pose(faceA, { y: 0.043 })],
      [1.35, pose(faceB, { y: 0.047 }, { th: 0.06 })],
      [1.7, pose({}, faceA)],
      [2.15, pose({ y: 0.043 }, faceB, { th: 0.06 })],
      [2.45, pose({}, {}, { mi: -0.1 })],
      [2.62, pose(jab, {}, { mi: -0.12 })],
      [2.8, pose(back, {})],
      [2.95, pose({}, jab, { mi: -0.12 })],
      [3.13, pose({}, back, { mi: 0.06 })],
      [3.5, pose(meet, meet)],
      [3.62, pose({ ...meet, x: -0.08, yaw: -0.9 }, { ...meet, x: -0.08, yaw: -0.9 }, { th: -0.1 })],
      [3.78, pose({ ...meet, x: -0.068 }, { ...meet, x: -0.068 })],
      [4.25, { roll: 0, flex: -0.03, yaw: 0, x: -0.004, y: 0.008, z: 0, lroll: 0, lflex: -0.03, lyaw: 0, lx: 0.004, ly: 0.008, lz: 0 }],
    ];
  })() },
  navaja: { len: 3.9, end: { twirl: TAU }, keys: seq(
    [[0.5, show({ flex: -0.42 })], [1.3, show({ roll: 0.55, flex: -0.3 })], [1.7, show({ roll: 0.2, flex: -0.5 })]],
    twirl(1.75, show({ flex: -0.5 }), 0, PI, 0.55),
    [[3.0, show({ flex: -0.55, roll: 0.3, twirl: PI })]],
    twirl(3.05, show({ roll: 0.15 }), PI, PI, 0.4),
  ) },
  stiletto: { len: 3.5, end: { twirl: 2 * TAU }, keys: seq(
    [[0.4, show({ flex: -0.5 })]],
    twirl(0.45, show({ flex: -0.45 }), 0, 2 * TAU, 0.6),
    [[1.9, show({ flex: -0.6, twirl: 2 * TAU })], [2.6, show({ roll: 0.6, flex: -0.3, twirl: 2 * TAU })], [3.1, show({ roll: 0.2, twirl: 2 * TAU })]],
  ) },
  kukri: { len: 4.2, end: { flip: TAU }, keys: seq(
    [[0.5, show({ flex: -0.7, y: 0.03 })], [1.2, show({ flex: -0.72, roll: 0.15 })], [1.85, show({ roll: 0.8, flex: -0.3 })]],
    toss(1.95, show({ roll: 0.3, flex: -0.35 }), 0, 1, 0.08, 0.7),
    [[3.5, show({ flex: -0.5, flip: TAU })]],
  ) },
  tanto: { len: 3.8, end: { twirl: TAU }, keys: seq(
    [[0.45, show({ flex: -0.5 })], [1.0, show({ flex: -0.78, y: 0.045 })]],
    twirl(1.1, show({ flex: -0.55 }), 0, PI),
    [[2.55, show({ roll: 0.6, flex: -0.3, twirl: PI })]],
    twirl(2.75, show({ roll: 0.2 }), PI, PI, 0.42),
  ) },
  survival: { len: 3.8, end: { twirl: TAU }, keys: seq(
    [[0.45, show({ flex: -0.45 })], [1.1, show({ roll: 0.7, flex: -0.25 })], [1.4, show({ roll: 0.3, flex: -0.45 })]],
    twirl(1.45, show({ flex: -0.45 }), 0, TAU, 0.8),
    [[3.0, show({ flex: -0.55, twirl: TAU })]],
  ) },
  // Skeleton knife: a slow roll up to look along the blade, a flick from the
  // wrist onto the index finger through the ring, two turns that start fast
  // and ease off, caught back in the fist, then a turn of the wrist to show
  // the other face and an easy settle, every move running into the next.
  skeleton: { len: 4.8, fluid: true, end: { ring: 2 * TAU }, keys: seq(
    [[0.4, show({ flex: -0.38, roll: 0.08, y: 0.034 })],
      [0.85, show({ flex: -0.52, roll: 0.3, y: 0.04, x: -0.058 })],
      [1.2, show({ flex: -0.32, roll: 0.16, y: 0.046, th: 0.06 })]],
    ringSpin(1.25, show({ roll: 0.04, flex: -0.16, y: 0.048 }), 0, 2, 1.05),
    [[3.4, show({ roll: 0.42, flex: -0.34, y: 0.043, ring: 2 * TAU })],
      [3.85, show({ roll: 0.62, flex: -0.26, y: 0.04, ring: 2 * TAU, th: 0.06 })],
      [4.3, show({ roll: 0.28, flex: -0.14, y: 0.02, ring: 2 * TAU })]],
  ) },
  hawkbill: { len: 3.8, end: { twirl: TAU }, keys: seq(
    [[0.45, show({ flex: -0.6, roll: -0.2 })], [1.1, show({ flex: -0.62, roll: -0.15 })]],
    twirl(1.15, show({ flex: -0.5 }), 0, PI),
    [[2.6, show({ roll: 0.55, flex: -0.3, twirl: PI })]],
    twirl(2.75, show({ roll: 0.2 }), PI, PI, 0.42),
  ) },
  trench: { len: 3.7, end: {}, keys: seq(
    [[0.45, show({ roll: 0.6, flex: -0.2 })], [1.1, show({ roll: 0.65, flex: -0.25, wave: 0.15 })],
      [1.35, show({ roll: 0.3, flex: -0.1, z: -0.05, mi: -0.25, ix: -0.15 })], [1.6, show({ roll: 0.3, flex: -0.2 })],
      [2.3, show({ flex: -0.6 })], [2.9, show({ roll: 0.5, flex: -0.35 })], [3.3, show({ roll: 0.15 })]],
  ) },
  cord: { len: 3.7, end: { twirl: TAU }, keys: seq(
    [[0.45, show({ flex: -0.45 })]],
    twirl(0.5, show({ flex: -0.42 }), 0, TAU, 0.55),
    [[1.85, show({ flex: -0.6, twirl: TAU })], [2.55, show({ roll: 0.6, flex: -0.3, twirl: TAU })], [3.2, show({ roll: 0.2, twirl: TAU })]],
  ) },
};

// ---------------------------------------------------------------- sampling
// Per channel: keys at their times, starting from rest at 0 and ending at
// `end` (or rest) at `len`; tangents for a monotone cubic through them.
// With `fluid`, the hand's own channels pass through their keys without
// stopping (the next move already under way: a touch of follow-through)
// instead of easing to a halt at every key; spins keep the monotone curve so
// they never run backwards.
const HAND_CH = new Set(['roll', 'flex', 'yaw', 'x', 'y', 'z', 'lroll', 'lflex', 'lyaw', 'lx', 'ly', 'lz']);
export function compileInspect(def) {
  const tracks = {};
  for (const [t, ch] of def.keys) for (const [k, v] of Object.entries(ch)) (tracks[k] ||= [[0, 0]]).push([t, v]);
  for (const [k, tr] of Object.entries(tracks)) {
    tr.sort((a, b) => a[0] - b[0]);
    // keys for the same moment: the last one wins
    for (let i = tr.length - 1; i > 0; i--) if (Math.abs(tr[i][0] - tr[i - 1][0]) < 1e-6) tr.splice(i - 1, 1);
    if (tr[tr.length - 1][0] < def.len - 1e-6) tr.push([def.len, def.end?.[k] ?? 0]);
    tracks[k] = def.fluid && HAND_CH.has(k) ? withFlow(tr) : withTangents(tr);
  }
  return { len: def.len, tracks };
}

// Catmull-Rom tangents (a little tighter), still at rest at both ends.
function withFlow(tr) {
  const n = tr.length, m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = 0.8 * (tr[i + 1][1] - tr[i - 1][1]) / Math.max(1e-6, tr[i + 1][0] - tr[i - 1][0]);
  return { t: tr.map(k => k[0]), v: tr.map(k => k[1]), m };
}

function withTangents(tr) {
  const n = tr.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((tr[i + 1][1] - tr[i][1]) / Math.max(1e-6, tr[i + 1][0] - tr[i][0]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] > 0 ? (d[i - 1] + d[i]) / 2 : 0;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return { t: tr.map(k => k[0]), v: tr.map(k => k[1]), m };
}

function sampleTrack(tr, t) {
  const T = tr.t, n = T.length;
  if (t <= T[0]) return tr.v[0];
  if (t >= T[n - 1]) return tr.v[n - 1];
  let i = 1; while (T[i] < t) i++;
  const h = T[i] - T[i - 1], s = (t - T[i - 1]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * tr.v[i - 1] + (s3 - 2 * s2 + s) * h * tr.m[i - 1] + (-2 * s3 + 3 * s2) * tr.v[i] + (s3 - s2) * h * tr.m[i];
}

// The pose at time t (channels the inspect doesn't use stay undefined).
export function samplePose(ins, t, out = {}) {
  for (const k in out) out[k] = 0;
  for (const k in ins.tracks) out[k] = sampleTrack(ins.tracks[k], t);
  return out;
}

// How fast a channel is changing at time t (per second).
export function channelRate(ins, key, t) {
  const tr = ins.tracks[key];
  if (!tr) return 0;
  const e = 1 / 240;
  return (sampleTrack(tr, t + e) - sampleTrack(tr, t - e)) / (2 * e);
}

const cache = {};
export function inspectFor(type) {
  return (cache[type] ||= compileInspect(KNIFE_INSPECTS[type] || KNIFE_INSPECTS.standard));
}
