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
//           ring   spin about the finger ring (karambit, skeleton knife, talon)
//           ringW  0..1: the knife moves off the fist onto the index finger
//           hang   0..1: on the finger, turned so its weight hangs straight
//                  below (a swing on ring is then a pendulum)
//           rev    end over end about the grip, in the hand (a flip to a
//                  reverse grip and back, a windmill)
//           bb bh  balisong: blade and free handle angles against the hand
//           slide  along its length in the hand (balisong flips: held by the end)
//           free   0..1: the knife is out of the hand (in the air, falling, spun
//                  on a finger), so the wrist doesn't pump with its flips
//           kx ky  moved in the hand, across the flat and across the edge (an
//                  aerial coming down clear of the palm and thumb into the hand)
//   fingers th ix mi  open (1 = straight, negative = tighter): thumb, index,
//                  the other three
//           rp     added to the ring and little fingers (tucked in when a
//                  balisong is held by the end of its handle)
//           wave   a roll travelling across the fingers (radians), as when
//                  the fingers walk a handle round
//   left    l...   the same hand channels for the second push dagger
// `end` sets where a channel finishes (a full turn is as good as none).

const PI = Math.PI, TAU = PI * 2;
// the flat of a forward-held blade turned to you, brought up toward the middle
// (yaw is given too, as 0: a channel left out of a key isn't held there, it
// carries on toward its next key, so a sideways bend meant for one move would
// creep in through the moves before it)
const SHOW = { roll: 0.12, flex: -0.5, yaw: 0, x: -0.054, y: 0.036, z: 0.018 };
const show = (o = {}) => ({ ...SHOW, ...o });
// the other side: the forearm rolled out and the wrist bent back, so the flat
// that was facing away is turned to you (and a drift of the same, for a hold)
const OVER = { roll: 0.8, flex: 0.85, yaw: 0, x: -0.05, y: 0.04, z: 0.018 };
const over = (o = {}) => ({ ...OVER, ...o });
const OVER2 = { roll: 0.9, flex: 0.78, y: 0.042 };
const LOOSE = { ix: 0.3, mi: 0.38, th: 0.25 };
const GRIP = { ix: 0, mi: 0, th: 0, wave: 0 };
const OPEN = { ix: 0.85, mi: 0.95, th: 0.7 };   // let go for a toss

// A toss and catch from pose `p`: the hand opens, the knife rises, turns end
// over end `turns` times and drops back in, the fist closing round it.
function toss(t0, p, flip0, turns = 1, h = 0.075, d = 0.62) {
  const f1 = flip0 + TAU * turns;
  return [
    [t0, { ...knifeOnly(p), flip: flip0, lift: 0 }],
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
    [t0, { ...knifeOnly(p), twirl: from }],
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
    [t0, { ...knifeOnly(p), ring: from, ringW: 0 }],
    [t0 + 0.16, { ...p, roll: r - 0.25, flex: f + 0.32, y: y - 0.004, ix: 0.3, mi: 0.1, th: 0.2, ring: from - 0.12, ringW: 0 }],
    [t0 + 0.32, { ...p, roll: r + 0.15, flex: f - 0.18, y: y + 0.008, ix: 0.95, mi: -0.1, th: 0.35, ring: from + 1.1, ringW: 1 }],
    [t0 + 0.32 + d * 0.5, { ...p, roll: r + 0.05, flex: f - 0.05, ix: 0.95, mi: -0.2, th: -0.05, ring: from + (to - from) * 0.56, ringW: 1 }],
    [t0 + 0.32 + d, { ...p, ix: 0.95, mi: -0.2, th: -0.05, ring: to - 0.7, ringW: 1 }],
    [t0 + 0.46 + d, { ...p, flex: f - 0.14, y: y - 0.004, ix: 0.55, mi: 0.25, th: 0.3, ring: to - 0.12, ringW: 0.55 }],
    [t0 + 0.6 + d, { ...p, ...GRIP, flex: f + 0.06, y: y - 0.006, ring: to, ringW: 0 }],
    [t0 + 0.8 + d, { ...p, ...GRIP, ring: to, ringW: 0 }],
  ];
}

// Balisong, flipped the way flippers do it. For the flips the knife is let
// slide out through the fist until only the ends of the handles are held
// (BS): the thumb and the index finger pinch the end of the held handle and
// the ring and little fingers, with nothing left to hold, tuck into the palm,
// so nothing of the hand is in the way of the swinging parts and the hand
// never has to open. A basic close or open is three swings, all the same
// way round (a real balisong's blade only turns half a turn against each
// handle, so the free handle makes a whole turn each time): the free handle
// swings out round the pin until it stops against the blade, the blade swings
// over to the other side, and the free handle carries on round into the hand
// and shuts against the held one. The viewmodel turns the wrist with every
// swing, a moment ahead of it, so each is seen to be thrown from the hand.
export const BS = -0.095;
const PINCH = { slide: BS, th: -0.45, ix: 0.04, mi: 0.06, rp: -0.4 };
// dir -1 closes (from open), +1 opens (from closed); bh0 / bb0: the free
// handle's and the blade's angles going in; settle: ease back to the pinch
// after the catch (left off when another move follows straight on)
function basic(t0, p, dir, bh0, bb0, d = 0.66, settle = true) {
  const H = PI * dir, r = p.roll || 0, x = p.x || 0, y = p.y || 0, f = p.flex || 0;
  const q = (o = {}) => ({ ...p, ...PINCH, ...o });
  // the free handle passes the index finger going out on an open and coming
  // home on a close: the finger lifts out of its way and curls back round
  // the handles after (on a close, closing on it as it lands)
  const up = { ix: 0.98, mi: 0.14 }, upd = { ix: 0.97, mi: 0.12 };
  const I = dir > 0 ? [up, upd, { ix: 0.15 }, { ix: 0.06 }, { ix: 0.04 }] : [{ ix: 0.1 }, { ix: 0.12 }, { ix: 0.14 }, up, upd];
  return [
    // the handle thrown out round the pin: it slows as it meets the blade and
    // drifts on past while the blade swings over (nothing stops dead in the
    // middle of a move), then comes on round, still going hard when it slaps shut
    [t0 + d * 0.04, { bh: bh0 }], [t0 + d * 0.42, { bh: bh0 + 0.9 * H }], [t0 + d * 0.56, { bh: bh0 + 1.06 * H }],
    [t0 + d * 0.885, { bh: bh0 + 2 * H - 0.3 * dir }], [t0 + d * 0.94, { bh: bh0 + 2 * H }],
    // the blade over to the other side, landing hard in the held handle
    [t0 + d * 0.3, { bb: bb0 }], [t0 + d * 0.64, { bb: bb0 + H - 0.25 * dir }], [t0 + d * 0.7, { bb: bb0 + H }],
    // the hand rides it (with the wrist's pump on top, in the viewmodel):
    // rises and turns with the throw, comes back as the blade goes over,
    // turns again for the handle, and gives with the catch
    [t0, q({ roll: r - 0.05, y: y - 0.002, ...I[0] })],
    [t0 + d * 0.25, q({ roll: r + 0.08, x: x - 0.004, y: y + 0.006, ...I[1] })],
    [t0 + d * 0.5, q({ roll: r - 0.06, x: x + 0.003, y: y + 0.003, ...I[2] })],
    [t0 + d * 0.75, q({ roll: r + 0.05, y: y + 0.005, ...I[3] })],
    [t0 + d * 0.92, q({ y: y + 0.001, ...I[4] })],
    [t0 + d * 1.0, q({ y: y - 0.005, flex: f + 0.05, ix: -0.08, mi: -0.04, th: -0.52 })],
    ...(settle ? [[t0 + d * 1.2, q({ y: y + 0.001 })]] : []),
  ];
}

// Chaplin: a flick of the wrist throws the free handle out, the index finger
// straightens forward into the crotch between the handles, and the knife is
// let go onto it and spun round it `turns` times (fast, slowing), facing you;
// then the held handle comes round into the palm, the fist closes on it and
// the free handle swings back shut. From the fist, knife open. (The viewmodel
// puts the crotch on the finger and keeps the spin going with the wrist.)
const CHAP_V = -2.2, CHAP_KY = -0.012;                                          // the free handle out this far: room for the finger between the handles
function chaplin(t0, p, turns = 2, d = 0.85) {
  const to = TAU * turns, f = p.flex || 0;
  const SP = { ix: 0.95, mi: -0.2, th: 0.35, rp: 0 };          // the index out straight, the rest tucked in
  // (going onto the finger, the thumb lifts off first and the index is
  // straightened and the other fingers open to let the handles out of the
  // fist: the free handle lies along the spine, under the thumb, and swings
  // out past it; coming back, the thumb stays up until the free handle is
  // home, then the fist closes)
  const OUTF = { ix: 0.95, mi: 0.75, th: 0.5, rp: 0 }, BACK = { ix: 0.6, mi: 0.75, th: 0.5, rp: 0 };
  return [
    [t0, { ...knifeOnly(p), ...GRIP, bh: 0, ringW: 0, ring: 0, free: 0, slide: 0, ky: 0 }],
    // (and the knife rolls a little down out of the fist, ky, so the free
    // handle's back end comes up clear of the root of the thumb)
    [t0 + 0.07, { ...p, flex: f + 0.06, ix: 0.45, mi: 0.4, th: 0.6, rp: 0, bh: -0.04, ringW: 0, ring: 0, free: 0, ky: CHAP_KY }],
    [t0 + 0.16, { ...p, flex: f + 0.16, ...OUTF, bh: CHAP_V * 0.85, ringW: 0, ring: 0, free: 0.3, ky: CHAP_KY }],
    [t0 + 0.3, { ky: 0 }],
    [t0 + 0.26, { ...p, flex: f + 0.08, ...OUTF, bh: CHAP_V, ringW: 0.6, ring: 0.3, free: 0.8 }],
    [t0 + 0.36, { ...p, ...SP, bh: CHAP_V, ringW: 1, ring: 0.85, free: 1 }],
    [t0 + 0.36 + d * 0.5, { ...p, ...SP, bh: CHAP_V, ringW: 1, ring: to * 0.6, free: 1 }],
    [t0 + 0.36 + d, { ...p, ...SP, bh: CHAP_V, ringW: 1, ring: to - 0.55, free: 1 }],
    [t0 + 0.5 + d, { ...p, ...BACK, bh: CHAP_V * 0.9, ringW: 0.4, ring: to - 0.12, free: 0.6 }],
    [t0 + 0.6 + d, { ...p, ...BACK, bh: CHAP_V * 0.45, ringW: 0, ring: to, free: 0.2 }],
    [t0 + 0.7 + d, { ...p, ...BACK, bh: 0, free: 0 }],
    [t0 + 0.84 + d, { ...p, ...GRIP, flex: f + 0.06, slide: 0 }],
  ];
}

// Aerial. The hand turns the closed knife upright, palm to you, still pinched
// by the end of its handle; the wrist dips and flicks it straight up out of
// the fingers; it turns once end over end in front of you (facing you) and
// opens in the air (the free handle swings round, the blade comes out), and
// drops back down along its length into the open hand, the fingers closing on
// it. (Caught like that it comes down in front of the palm; with the palm
// down, as in the flips, a falling knife could only come through the back of
// the hand.) Returns the keys and when the catch has settled; the caller
// turns the hand back. drop: the fingers close a moment late, the knife
// glances off them and falls out of sight, the hand goes down after it and
// comes back up with it, closed (it's flipped open again after).
// (it comes down off the palm and toward the fingers, clear of the thumb,
// tucked in out of its way, and is closed into the hand)
const AIR_T = 0.62, AIR_H = 0.05, TH_AIR = -0.45, KX_AIR = -0.02, KY_AIR = -0.025;
const UPRIGHT = { roll: 1.45, flex: 1.3, yaw: 0, x: -0.02, y: -0.004, z: 0.02 };
function aerial(t0, p, drop = false) {
  const U = UPRIGHT, uf = U.flex, uy = U.y;
  const f = p.flex || 0, y = p.y || 0, x = p.x || 0, z = p.z || 0;
  const tr = t0 + 0.6, tc = tr + AIR_T, S0 = BS - 0.015;
  const late = drop ? 0.45 : 0;
  const k = [
    [t0, { ...knifeOnly(p), ...PINCH, lift: 0, flip: 0, free: 0, bh: -TAU, bb: -PI }],
    [t0 + 0.36, { ...U, ...PINCH, slide: BS, lift: 0, flip: 0, bh: -TAU, bb: -PI }],
    [t0 + 0.5, { ...U, ...PINCH, flex: uf + 0.12, y: uy - 0.012 }],
    [tr - 0.03, { ...U, ...PINCH, ix: 0.3, th: -0.1 }],
    [tr, { ...U, ...OPEN, rp: 0, flex: uf - 0.2, y: uy + 0.014, slide: S0, lift: 0.02, flip: -0.04, free: 1, bh: -TAU, bb: -PI }],
    [tr + AIR_T * 0.45, { ...U, ...OPEN, th: TH_AIR, rp: 0, flex: uf - 0.08, y: uy + 0.016 }],
    [tc - 0.1, { ...U, ...OPEN, th: TH_AIR, rp: 0, flex: uf - 0.04, y: uy + 0.012 }],
  ];
  // in the air: up and down on a parabola, turning steadily and opening on
  // the way, coming down along its length into the hand (a fumbled one is
  // turning a little late and comes down onto the fingers at an angle)
  // (the turn is all but done as the handle reaches the fingers: it eases
  // off over the last of the flight, so the handle comes down into the hand
  // lined up instead of sweeping through it)
  // The last of the drop is along the knife's own length (it stands upright
  // then, so that's straight down too): straight down the world, which is a
  // little off its length, would bring it in toward the palm.
  const turn = (u) => { const v = Math.min(1, u / 0.76); return v * (1.35 - 0.35 * v * v); };
  // It's open before it comes down near the hand, and comes down a few
  // millimetres off the palm (kx), pressed onto it as the fingers close.
  for (let i = 1; i <= 12; i++) {
    const u = i / 12, v = Math.min(1, u / 0.8);
    k.push([tr + AIR_T * u, {
      lift: 0.02 * (1 - v) + 4 * AIR_H * v * (1 - v) + (drop ? 0.014 * u * u : 0), flip: -0.04 - (TAU - 0.04 - late) * turn(u), free: 1,
      slide: S0 * (1 - u) ** 0.6, bh: -TAU + TAU * Math.min(1, u / 0.6), bb: -PI + PI * Math.min(1, u / 0.56),
      kx: KX_AIR * Math.min(1, Math.max(0, (u - 0.45) / 0.3)), ky: KY_AIR * Math.min(1, Math.max(0, (u - 0.45) / 0.3)),
    }]);
  }
  if (!drop) {
    k.push([tc, { ...U, ...GRIP, rp: 0, y: uy + 0.004, lift: 0, flip: -TAU, slide: 0, bh: 0, bb: 0, free: 0, kx: 0, ky: 0 }],
      [tc + 0.08, { ...U, ...GRIP, y: uy - 0.006, flex: uf + 0.05 }], [tc + 0.24, { ...U, ...GRIP }]);
    return { keys: k, tc: tc + 0.24 };
  }
  // the fumble: its handle strikes the open fingers and it pops back up and
  // out toward the middle, turning the other way, the free handle and blade
  // flopping open; the fist snatches at it a moment late and closes on
  // nothing; it tumbles down clear of the hand and out of sight, and only
  // then does the hand go down after it (the knife falls on its own: its
  // lift takes the hand's drop back out)
  const tb = tc + 0.12, fall = (tau) => 2.8 * tau * tau;
  const dive = (tau) => 0.4 * (tau < 0.25 ? 0 : Math.min(1, ((tau - 0.25) / 0.35) ** 1.5));
  // (it bounces off away from the palm, kx, so it clears the closing fingers)
  // (the free handle flops open away from the held one: its pin is beside the
  // held handle's, so turned the other way it would swing into it)
  k.push([tc + 0.05, { lift: 0.034, flip: -TAU + late + 0.2, slide: -0.012, bh: -0.2, bb: -0.08, free: 1, kx: KX_AIR - 0.016, ky: KY_AIR }],
    [tb, { lift: 0.05, flip: -TAU + late + 0.6, slide: -0.03, bh: -0.6, bb: -0.3, free: 1, kx: KX_AIR - 0.034, ky: KY_AIR - 0.005 }]);
  for (let i = 1; i <= 8; i++) {
    const tau = i * 0.07;
    k.push([tb + tau, { lift: 0.05 - fall(tau) + dive(tau), flip: -TAU + late + 0.6 + 5 * tau, slide: -0.03 - 0.1 * tau,
      bh: -0.6 - 1.3 * Math.min(1, tau / 0.4), bb: -0.3 - 0.8 * Math.min(1, tau / 0.45), free: 1, kx: KX_AIR - 0.034 - 0.06 * tau, ky: KY_AIR - 0.005 }]);
  }
  k.push([tc + 0.06, { ...U, ...OPEN, th: TH_AIR, rp: 0, flex: uf - 0.02, y: uy + 0.012 }],
    [tc + 0.2, { ...U, ...GRIP, flex: uf + 0.1, y: uy + 0.002, x: U.x - 0.012 }],
    [tb + 0.25, { ...U, ...GRIP, flex: uf + 0.16, y: uy - 0.008, x: U.x - 0.01 }],
    [tb + 0.6, { ...p, ...LOOSE, flex: f + 0.3, y: y - 0.4, x: x + 0.02, z: z + 0.04 }]);
  // out of sight: picked up, back in the fist, closed
  const tp = tb + 0.78;
  k.push([tp, { ...p, ...GRIP, flex: f + 0.2, y: y - 0.42, x: x + 0.03, z: z + 0.04, lift: 0, flip: 0, slide: 0, bh: -TAU, bb: -PI, free: 0, kx: 0, ky: 0 }],
    [tp + 0.12, { ...p, ...GRIP, flex: f + 0.2, y: y - 0.42, x: x + 0.03, z: z + 0.04 }],
    // up again with it, a shake to brush it off
    [tp + 0.6, { ...p, ...GRIP, y: y + 0.004 }],
    [tp + 0.74, { ...p, ...GRIP, roll: (p.roll || 0) + 0.14 }],
    [tp + 0.86, { ...p, ...GRIP, roll: (p.roll || 0) - 0.08 }],
    [tp + 0.98, { ...p, ...GRIP }]);
  return { keys: k, tc: tp + 0.98 };
}

const seq = (...parts) => parts.flat();
// A move's opening key, minus the hand's own channels: the wrist keeps flowing
// from wherever the last move left it instead of being yanked to this move's
// pose within a few hundredths of a second.
const HAND_KEYS = ['roll', 'flex', 'yaw', 'x', 'y', 'z'];
const knifeOnly = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !HAND_KEYS.includes(k)));

// A flip end over end in the hand, about the grip (rev): the wrist cocks,
// the grip eases, the knife turns `by` (PI: into a reverse grip, TAU: all the
// way round) and the fist closes on it again; h pops it a touch out of the
// palm on the way (a flick).
// (it turns across the face of the palm, pushed out off it, kx, while it goes
// round: turned where it lies, the blade would sweep through the palm)
// (the fingers stay open until the blade has come round past them)
const KX_REV = -0.017;
function revFlip(t0, p, from, by, d = 0.5, h = 0) {
  const f = p.flex || 0;
  return [
    [t0, { ...knifeOnly(p), rev: from, lift: 0, kx: 0 }],
    [t0 + 0.12, { ...p, ...LOOSE, flex: f + 0.16, rev: from - by * 0.03, kx: KX_REV * 0.6 }],
    [t0 + 0.12 + d * 0.5, { ...p, ix: 0.6, mi: 0.62, th: 0.5, flex: f - 0.1, rev: from + by * 0.55, lift: h, kx: KX_REV }],
    [t0 + 0.12 + d, { ...p, ix: 0.45, mi: 0.5, th: 0.35, rev: from + by * 0.97, lift: 0, kx: KX_REV * 0.6 }],
    [t0 + 0.26 + d, { ...p, ...GRIP, flex: f + 0.05, rev: from + by, kx: 0 }],
  ];
}

// ---------------------------------------------------------------- tricks
// What the knife inspects are made of: tricks, each thrown from the wrist the
// way the karambit's spin is (it cocks one way as the grip eases and flicks
// the other to send the knife off, and gives a little with the catch) and,
// once the knife is moving, moving the way it would by itself: tossed, it
// turns at a steady rate on a parabola; spun in the fingers or round the
// hand, it starts fast and slows. Each takes its start time, the pose the
// hand does it in and where the knife's turn starts from, and returns its
// keys, when the hand has settled (t) and where the turn ended up, so tricks
// chain one into the next.

// A half-turn toss lands this far back along the knife's length (it turns
// about its balance point, which sits this far out from the grip, halved).
const TOSS_SLIDE = 0.08;
// in the air: keyed densely enough to move steadily
const flightKeys = (air) => Math.max(8, Math.round(air / 0.045));

// Tossed up end over end about its balance point and caught: `turns` turns,
// up `h` metres and back down in `air` seconds. half: an extra half turn, so
// it's caught the other way round (into a reverse grip, or back out of one);
// its handle then comes down where its blade went up, so it drifts back along
// its length in the air to land in the hand (slide).
function tossT(t0, p, { turns = 1, half = false, h = 0.08, air = 0.62, from = 0, slide0 = 0 } = {}) {
  const f = p.flex || 0, y = p.y || 0, r = p.roll || 0;
  const by = TAU * turns + (half ? PI : 0), s1 = half ? (slide0 ? 0 : TOSS_SLIDE) : slide0;
  const tr = t0 + 0.22, tc = tr + air;
  const k = [
    [t0, { ...knifeOnly(p), flip: from, lift: 0, slide: slide0 }],
    [t0 + 0.14, { ...p, ...LOOSE, flex: f + 0.22, roll: r - 0.04, y: y - 0.01 }],        // the wrist cocks down, the grip eases
    [tr, { ...p, ...OPEN, flex: f - 0.12, roll: r + 0.05, y: y + 0.012 }],               // the flick, letting go
    [tr + air * 0.5, { ...p, ...OPEN, flex: f - 0.04, y: y + 0.006 }],
    [tc - 0.06, { ...p, ix: 0.6, mi: 0.7, th: 0.5, flex: f - 0.02, y: y + 0.008 }],      // up a touch to meet it
    [tc, { ...p, ...GRIP, flex: f + 0.03, y: y + 0.002 }],                               // caught,
    [tc + 0.09, { ...p, ...GRIP, flex: f + 0.1, y: y - 0.008 }],                         // the wrist giving with it
    [tc + 0.28, { ...p, ...GRIP }],
  ];
  const n = flightKeys(air);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    k.push([tr + air * u, { flip: from + by * u, lift: 4 * h * u * (1 - u), slide: slide0 + (s1 - slide0) * u }]);
  }
  return { keys: k, t: tc + 0.28, flip: from + by, slide: s1 };
}

// Stood upright in the fist and tossed straight up spinning about its own
// length (both faces flashing by as it turns), caught as it comes down.
const UPR = { roll: 1.6, flex: 1.3, yaw: 0, x: -0.04, y: 0.03, z: 0.02 };   // upright, point up, the flat to you
function spiralToss(t0, { turns = 2, h = 0.07, air = 0.6, from = 0 } = {}) {
  const U = UPR, uf = U.flex, uy = U.y, by = TAU * turns;
  const t1 = t0 + 0.42, tr = t1 + 0.18, tc = tr + air;
  const k = [
    [t0, { twirl: from, lift: 0 }],
    [t1, { ...U, ...GRIP }],                                             // turned upright
    [t1 + 0.12, { ...U, ...LOOSE, flex: uf + 0.1, y: uy - 0.01 }],       // dipped
    [tr, { ...U, ...OPEN, flex: uf - 0.1, y: uy + 0.012 }],              // the flick up, letting go
    [tc - 0.06, { ...U, ix: 0.6, mi: 0.7, th: 0.5, y: uy + 0.008 }],
    [tc, { ...U, ...GRIP, y: uy + 0.002 }],
    [tc + 0.09, { ...U, ...GRIP, flex: uf + 0.08, y: uy - 0.008 }],
    [tc + 0.26, { ...U, ...GRIP }],
  ];
  const n = flightKeys(air);
  for (let i = 0; i <= n; i++) { const u = i / n; k.push([tr + air * u, { twirl: from + by * u, lift: 4 * h * u * (1 - u) }]); }
  return { keys: k, t: tc + 0.26, twirl: from + by };
}

// Spun round the hand end over end about the grip (let go across the face of
// the palm, pushed off it so the blade clears it): `turns` turns, fast off
// the flick and slowing, the fist closing on it as it comes round.
function windmill(t0, p, { turns = 1, from = 0, d = 0.55 } = {}) {
  const f = p.flex || 0, r = p.roll || 0, y = p.y || 0, by = TAU * turns;
  // (the fingers stay out straight while it goes round, clear of the blade,
  // and only close on the handle as it comes home)
  const t1 = t0 + 0.2, t2 = t1 + d, SP = { ix: 0.82, mi: 0.86, th: 0.55 }, KX = KX_REV * 1.25;
  return { keys: [
    [t0, { ...knifeOnly(p), rev: from, kx: 0 }],
    [t0 + 0.12, { ...p, ...LOOSE, flex: f + 0.2, roll: r - 0.06, y: y - 0.004, rev: from - 0.12, kx: KX * 0.5 }],   // cocked
    [t1, { ...p, ...SP, flex: f - 0.16, roll: r + 0.06, y: y + 0.006, rev: from + 0.9, kx: KX }],                   // the flick
    [t1 + d * 0.45, { ...p, ...SP, flex: f - 0.05, rev: from + by * 0.6, kx: KX }],
    [t2 - 0.05, { ...p, ...SP, rev: from + by - 0.28, kx: KX * 0.8 }],
    [t2, { ...p, ...GRIP, flex: f + 0.06, y: y - 0.004, rev: from + by, kx: 0 }],                                   // caught
    [t2 + 0.2, { ...p, ...GRIP }],
  ], t: t2 + 0.2, rev: from + by };
}

// Walked round in the fingers about its own length, like a pen: the wrist
// rolls against it to start it and the fingers roll it on (a wave across
// them), fast and slowing; `turns` turns.
function penSpin(t0, p, { turns = 1, from = 0, d = 0.6 } = {}) {
  const r = p.roll || 0, f = p.flex || 0, by = TAU * turns;
  const t1 = t0 + 0.16, t2 = t1 + d;
  return { keys: [
    [t0, { ...knifeOnly(p), twirl: from }],
    [t0 + 0.1, { ...p, ...LOOSE, roll: r - 0.12, twirl: from - 0.08 }],
    [t1, { ...p, ...LOOSE, wave: 0.5, roll: r + 0.08, twirl: from + Math.min(1.1, by * 0.22) }],
    [t1 + d * 0.45, { ...p, ...LOOSE, wave: 0.42, roll: r + 0.04, twirl: from + by * 0.62 }],
    [t2, { ...p, ...LOOSE, wave: 0.2, twirl: from + by }],
    [t2 + 0.14, { ...p, ...GRIP, flex: f + 0.04 }],
    [t2 + 0.3, { ...p, ...GRIP }],
  ], t: t2 + 0.3, twirl: from + by };
}

// Round the index finger through the knife's ring, either way (dir -1:
// backwards), driven from the wrist like the karambit's spin.
function ringSpinDir(t0, p, from, turns = 2, d = 0.9, dir = 1) {
  const to = from + TAU * turns * dir, r = p.roll || 0, f = p.flex || 0, y = p.y || 0;
  return { keys: [
    [t0, { ...knifeOnly(p), ring: from, ringW: 0 }],
    [t0 + 0.16, { ...p, roll: r - 0.25 * dir, flex: f + 0.32 * dir, y: y - 0.004, ix: 0.3, mi: 0.1, th: 0.2, ring: from - 0.12 * dir, ringW: 0 }],
    [t0 + 0.32, { ...p, roll: r + 0.15 * dir, flex: f - 0.18 * dir, y: y + 0.008, ix: 0.95, mi: -0.1, th: 0.35, ring: from + 1.1 * dir, ringW: 1 }],
    [t0 + 0.32 + d * 0.5, { ...p, roll: r + 0.05 * dir, flex: f - 0.05 * dir, ix: 0.95, mi: -0.2, th: -0.05, ring: from + (to - from) * 0.56, ringW: 1 }],
    [t0 + 0.32 + d, { ...p, ix: 0.95, mi: -0.2, th: -0.05, ring: to - 0.7 * dir, ringW: 1 }],
    [t0 + 0.46 + d, { ...p, flex: f - 0.14 * dir, y: y - 0.004, ix: 0.55, mi: 0.25, th: 0.3, ring: to - 0.12 * dir, ringW: 0.55 }],
    [t0 + 0.6 + d, { ...p, ...GRIP, flex: f + 0.06, y: y - 0.006, ring: to, ringW: 0 }],
    [t0 + 0.8 + d, { ...p, ...GRIP, ring: to, ringW: 0 }],
  ], t: t0 + 0.8 + d, ring: to };
}

// The wrist turns the knife over to show its other face, and back to the grip.
function showFaces(t0) {
  return { keys: [[t0, show({ flex: -0.42, y: 0.036 })], [t0 + 0.5, over()], [t0 + 0.95, over(OVER2)], [t0 + 1.4, show({ roll: 0.15 })]], t: t0 + 1.4 };
}

// A knife's inspect from tricks in a row: all their keys, its length (a little
// past the last), and where each turn ends up (end), so nothing unwinds.
function routine(parts, tail = 0.4) {
  const keys = parts.flatMap(q => (Array.isArray(q) ? q : q.keys));
  const t = Math.max(...keys.map(k => k[0]));
  const end = {};
  for (const ch of ['flip', 'rev', 'twirl', 'ring', 'ltwirl']) {
    let at = -1;
    for (const [kt, o] of keys) if (ch in o && kt >= at) { at = kt; end[ch] = o[ch]; }
  }
  return { len: t + tail, fluid: true, end, keys };
}

// The cord knife spun on the palm: the hand turns palm up and opens flat, the
// knife spins round twice on it (about its middle), and the fingers close on
// the handle as it comes round.
function palmSpin(t0, p, turns = 2, d = 1.05) {
  const U = { roll: 1.45, flex: 1.3, yaw: 0, x: -0.02, y: 0.0, z: 0.02 };
  const FLAT = { ix: 0.95, mi: 0.95, th: 1.0, rp: 0 };
  return [
    [t0, { ...knifeOnly(p), ...GRIP, flip: 0, kx: 0 }],
    [t0 + 0.38, { ...U, ...GRIP, flip: 0, kx: 0 }],
    [t0 + 0.52, { ...U, ...FLAT, flip: 0.12, kx: -0.01 }],
    [t0 + 0.52 + d * 0.5, { ...U, ...FLAT, y: 0.004, flip: TAU * turns * 0.58, kx: -0.011 }],
    [t0 + 0.52 + d, { ...U, ...FLAT, flip: TAU * turns - 0.25, kx: -0.01 }],
    [t0 + 0.66 + d, { ...U, ...GRIP, flip: TAU * turns, kx: 0 }],
  ];
}

// Balisong: real flipping tricks, in a row. Straight from the fist into a
// Chaplin (spun round the index finger); out to the ends of the handles, a
// basic close, and an aerial (tossed up, turning once and opening in the air,
// caught in the fist); the open knife shown and back to the grip. One inspect
// in twenty (the viewmodel picks) fumbles the catch: the knife falls, the hand
// goes down after it and comes back up with it closed, shakes it off and flips
// it open.
function balisong(drop) {
  const F = show({ flex: -0.28, y: 0.036 });                  // the pose the flips are done in
  const EASE = { ix: 0.2, mi: 0.24, th: -0.6, rp: 0.08 };     // the grip loosened to let the knife slide (the thumb tucked clear of the handles' ends)
  const CH = { roll: 0, flex: 0, yaw: 0, x: -0.012, y: 0.032, z: 0 };   // for the Chaplin: the index finger points away, the spin faces you
  // slid out to the ends of the handles (every channel is held up to a move:
  // a key far back would otherwise have it drift across the moves between)
  const out = (t) => [[t, show({ flex: -0.24, y: 0.038, ...EASE, slide: 0 })], [t + 0.2, { ...F, ...PINCH }]];
  const into = (t, pose) => [[t, { slide: BS }], [t + 0.1, show({ flex: -0.36, y: 0.038, ...EASE })], [t + 0.28, { ...pose, slide: 0, ...GRIP, rp: 0 }]];
  // (the hand comes up into the Chaplin's pose first, the knife still in the fist)
  const T0 = 0.5, air = aerial(T0 + 2.78, F, drop);
  const keys = seq(
    [[0.4, { ...CH, ...GRIP, rp: 0, slide: 0 }]],
    chaplin(T0, CH, 2, 0.85),
    out(T0 + 1.78),
    basic(T0 + 2.16, F, -1, 0, 0, 0.6, false),
    air.keys,
  );
  const tc = air.tc;
  if (drop) keys.push(...out(tc + 0.1), ...basic(tc + 0.42, F, 1, -TAU, -PI), ...into(tc + 1.2, show({ flex: -0.42, y: 0.036 })));
  // caught: the hand turns back over, the open knife shown flat to you
  else keys.push([tc + 0.42, show({ flex: -0.44, y: 0.036, ...GRIP })], [tc + 0.72, show({ roll: 0.1, flex: -0.46, y: 0.037, ...GRIP })]);
  return { len: tc + (drop ? 1.95 : 1.12), fluid: true, end: { flip: drop ? 0 : -TAU, ring: 2 * TAU }, keys };
}

export const KNIFE_INSPECTS = {
  // Field knife: tossed once end over end and caught, walked once round in the
  // fingers, the other face.
  standard: (() => {
    const P = show({ flex: -0.3, y: 0.032 });
    const a = tossT(0.38, P, { turns: 1, h: 0.075, air: 0.58 });
    const b = penSpin(a.t + 0.04, P, { turns: 1, d: 0.6 });
    return routine([[[0.33, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
  // Bayonet: spun twice round the hand, flipped into a reverse grip (the
  // blade shown standing out of the fist), flipped back across the view.
  bayonet: (() => {
    const P = show({ flex: -0.35, y: 0.034 });
    const R1 = show({ roll: -1.05, flex: -0.6, yaw: -0.3, x: -0.08, y: 0.055 }), R2 = show({ roll: -1.2, flex: -0.55, yaw: -0.25, x: -0.078, y: 0.057 });
    const a = windmill(0.38, P, { turns: 2, d: 0.85 });
    const t1 = a.t + 0.02, t2 = t1 + 0.68, t3 = t2 + 0.82, t4 = t3 + 0.68;
    return routine([[[0.33, P]], a,
      revFlip(t1, P, a.rev, PI, 0.42, 0.02),
      [[t2 + 0.3, { ...R1, rev: a.rev + PI }], [t2 + 0.76, { ...R2, rev: a.rev + PI }]],
      revFlip(t3, R2, a.rev + PI, PI, 0.42, 0.02),
      showFaces(t4 + 0.5)]);
  })(),
  // Combat bayonet: tossed one and a half turns and caught in a reverse
  // grip, shown that way, tossed back out of it the same way.
  combat: (() => {
    const P = show({ flex: -0.3, y: 0.032 });
    const R2 = show({ roll: -1.2, flex: -0.55, yaw: -0.25, x: -0.078, y: 0.057 });
    const a = tossT(0.38, P, { turns: 1, half: true, h: 0.085, air: 0.66 });
    const b = tossT(a.t + 0.72, R2, { turns: 1, half: true, h: 0.085, air: 0.66, from: a.flip, slide0: a.slide });
    return routine([[[0.33, P]], a, [[a.t + 0.32, R2]], b, showFaces(b.t + 0.5)]);
  })(),
  // Flip knife: tossed high, twice end over end, caught; walked twice round
  // in the fingers; the other face.
  flip: (() => {
    const P = show({ flex: -0.25, y: 0.028 }), P2 = show({ flex: -0.42, y: 0.034 });
    const a = tossT(0.38, P, { turns: 2, h: 0.115, air: 0.82 });
    const b = penSpin(a.t + 0.04, P2, { turns: 2, d: 0.85 });
    return routine([[[0.33, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
  // Gut hook: spun fast three times round in the fingers, flicked up once and
  // caught, the hook turned to you.
  gut: (() => {
    const P = show({ flex: -0.38, y: 0.034 });
    const a = penSpin(0.38, P, { turns: 3, d: 0.95 });
    const b = tossT(a.t + 0.04, P, { turns: 1, h: 0.06, air: 0.52 });
    return routine([[[0.33, P]], a, b, [[b.t + 0.4, show({ roll: 0.95, flex: -0.55, y: 0.05 })], [b.t + 0.8, show({ roll: 0.95, flex: -0.5, y: 0.052 })]],
      showFaces(b.t + 1.0)]);
  })(),
  // Bowie: stood on end and tossed up spinning about its length, caught; then
  // swung once round the hand, heavily; the other face.
  bowie: (() => {
    const P = show({ flex: -0.32, y: 0.03 });
    const a = spiralToss(0.38, { turns: 2, h: 0.07, air: 0.64 });
    const b = windmill(a.t + 0.5, P, { turns: 1, d: 0.75 });
    return routine([[[0.33, P]], a, [[a.t + 0.45, P]], b, showFaces(b.t + 0.06)]);
  })(),
  // Push daggers: each walked twice round in its fist (the left a beat behind
  // the right), up into a guard, both twirled once more together, and both
  // fists turned palm up to show the blades' other faces.
  push: (() => {
    const R0 = { roll: 0, flex: -0.15, yaw: 0, x: -0.02, y: 0.05, z: 0.01 };
    const L0 = { lroll: 0, lflex: -0.15, lyaw: 0, lx: 0.02, ly: 0.05, lz: 0.01 };
    const L = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ['l' + k, k === 'x' ? -v : v]));
    const pose = (r = {}, l = {}, f = {}) => ({ ...R0, ...r, ...L0, ...L(l), ...f });
    const OPENW = { ix: 0.8, mi: 0.88, th: 0.6, rp: 0 };
    const spin = (ch, t0, from, by, d) => [[t0, { [ch]: from }], [t0 + 0.1, { [ch]: from - 0.08 }], [t0 + 0.16, { [ch]: from + 1.0 }],
      [t0 + 0.16 + d * 0.45, { [ch]: from + by * 0.62 }], [t0 + 0.16 + d, { [ch]: from + by }]];
    return routine([
      // (the fists open wide while the daggers spin: the blade comes out
      // between the fingers, and turning in a closed fist it would cut them)
      [[0.4, pose()], [0.55, pose({ roll: -0.1 }, {}, OPENW)], [1.0, pose({ roll: 0.06 }, { roll: -0.1 }, { ...OPENW, wave: 0.3 })],
       [1.6, pose({}, { roll: 0.06 }, { ...OPENW, wave: 0.25 })], [1.85, pose({}, {}, GRIP)]],
      spin('twirl', 0.5, 0, 2 * TAU, 0.75), spin('ltwirl', 0.78, 0, 2 * TAU, 0.75),
      // both up into a guard and twirled once more together
      [[2.25, pose({ y: 0.07, z: -0.01, flex: -0.3 }, { y: 0.07, z: -0.01, flex: -0.3 }, OPENW)], [2.95, pose({ y: 0.072, z: -0.01, flex: -0.3 }, { y: 0.072, z: -0.01, flex: -0.3 }, { ...OPENW, wave: 0.25 })],
       [3.15, pose({ y: 0.07 }, { y: 0.07 }, GRIP)]],
      spin('twirl', 2.3, 2 * TAU, TAU, 0.6), spin('ltwirl', 2.3, 2 * TAU, TAU, 0.6),
      // palms up, the other faces, and back
      [[3.6, pose({ roll: 1.7, flex: -0.15, y: 0.06 }, { roll: 1.7, flex: -0.15, y: 0.06 }, { th: 0.06 })],
       [4.15, pose({ roll: 1.78, flex: -0.12, y: 0.062 }, { roll: 1.78, flex: -0.12, y: 0.062 })], [4.6, pose()]],
    ]);
  })(),
  // Navaja: swung once round the hand off a quick flick, walked twice round in
  // the fingers, the other face.
  navaja: (() => {
    const P = show({ flex: -0.3, y: 0.03 });
    const a = windmill(0.38, P, { turns: 1, d: 0.5 });
    const b = penSpin(a.t + 0.04, P, { turns: 2, d: 0.75 });
    return routine([[[0.33, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
  // Stiletto: spun three times round in the fingers like a pen, stood on end
  // and tossed up spinning about its length, caught point up; the other face.
  stiletto: (() => {
    const P = show({ flex: -0.42 });
    const a = penSpin(0.38, P, { turns: 3, d: 0.85 });
    const b = spiralToss(a.t + 0.04, { turns: 3, h: 0.08, air: 0.64, from: a.twirl });
    return routine([[[0.33, P]], a, b, showFaces(b.t + 0.5)]);
  })(),
  // Kukri: the heavy blade swung once round the hand, then tossed once end
  // over end and caught; the other face.
  kukri: (() => {
    const P = show({ flex: -0.3, y: 0.03 });
    const a = windmill(0.38, P, { turns: 1, d: 0.78 });
    const b = tossT(a.t + 0.04, P, { turns: 1, h: 0.065, air: 0.6 });
    return routine([[[0.33, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
  // Tanto: flipped into a reverse grip, spun twice about its length there,
  // flipped back; the other face.
  tanto: (() => {
    const P = show({ flex: -0.35, y: 0.032 });
    const R2 = show({ roll: -1.2, flex: -0.55, yaw: -0.25, x: -0.078, y: 0.057 });
    const b = penSpin(1.42, R2, { turns: 2, d: 0.72 });
    const t3 = b.t + 0.04;
    return routine([[[0.33, P]], revFlip(0.38, P, 0, PI, 0.42, 0.02), [[1.36, { ...R2, rev: PI }]], b,
      revFlip(t3, R2, PI, PI, 0.42, 0.02), showFaces(t3 + 1.15)]);
  })(),
  // Survival knife: stood on end and tossed up spinning about its length,
  // caught; tossed high twice end over end; the other face.
  survival: (() => {
    const P = show({ flex: -0.3, y: 0.03 });
    const a = spiralToss(0.38, { turns: 2, h: 0.07, air: 0.62 });
    const b = tossT(a.t + 0.5, P, { turns: 2, h: 0.1, air: 0.76 });
    return routine([[[0.33, P]], a, [[a.t + 0.45, P]], b, showFaces(b.t + 0.06)]);
  })(),
  // Skeleton knife: spun twice round the index finger through its ring, then
  // twice back the other way; the other face.
  skeleton: (() => {
    const P = show({ roll: -0.1, flex: -0.12, y: 0.048 });
    const a = ringSpinDir(0.32, P, 0, 2, 0.95, 1);
    const b = ringSpinDir(a.t + 0.06, P, a.ring, 2, 0.95, -1);
    return routine([[[0.28, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
  // Hawkbill: walked twice round in the fingers, swung once round the hand;
  // the other face.
  hawkbill: (() => {
    const P = show({ flex: -0.35, y: 0.032 });
    const a = penSpin(0.38, P, { turns: 2, d: 0.75 });
    const b = windmill(a.t + 0.04, P, { turns: 1, d: 0.55 });
    return routine([[[0.33, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
  // Trench knife: let go onto the index finger through the front of its
  // knuckle bow and spun twice round it, caught; the studs turned to you.
  trench: (() => {
    const P = show({ roll: -0.1, flex: -0.15, y: 0.045 });
    const a = ringSpinDir(0.32, P, 0, 2, 1.0, 1);
    return routine([[[0.28, P]], a,
      [[a.t + 0.45, show({ roll: -0.9, flex: 0.3, y: 0.05, x: -0.04 })], [a.t + 0.9, show({ roll: -0.95, flex: 0.32, y: 0.052, x: -0.042 })]],
      showFaces(a.t + 1.1)]);
  })(),
  // Cord knife: spun three times round the index finger through its lanyard
  // loop, caught; spun twice flat on the open palm; the other face.
  cord: (() => {
    const P = show({ roll: -0.1, flex: -0.12, y: 0.048 }), P2 = show({ flex: -0.3 });
    const a = ringSpinDir(0.32, P, 0, 3, 1.25, 1);
    const b = palmSpin(a.t + 0.04, P2, 2, 1.05);
    const tb = a.t + 0.04 + 0.66 + 1.05;
    return routine([[[0.28, P]], a, b, showFaces(tb + 0.5)]);
  })(),
  // Falchion: swung twice round the hand, walked once round in the fingers;
  // the other face.
  falchion: (() => {
    const P = show({ flex: -0.3, y: 0.032 });
    const a = windmill(0.38, P, { turns: 2, d: 0.85 });
    const b = penSpin(a.t + 0.04, P, { turns: 1, d: 0.6 });
    return routine([[[0.33, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
  // Talon: spun twice round the index finger through its ring, then once back
  // the other way; the other face.
  talon: (() => {
    const P = show({ roll: -0.1, flex: -0.2, y: 0.045 });
    const a = ringSpinDir(0.32, P, 0, 2, 0.9, 1);
    const b = ringSpinDir(a.t + 0.06, P, a.ring, 1, 0.6, -1);
    return routine([[[0.28, P]], a, b, showFaces(b.t + 0.06)]);
  })(),
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
  butterfly: balisong(false),
  butterflyDrop: balisong(true),
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
    tracks[k] = (def.fluid === 'all' || (def.fluid && HAND_CH.has(k))) ? withFlow(tr) : withTangents(tr);
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

// The pose at time t (channels the inspect doesn't use stay undefined),
// softened over a few hundredths of a second either side (a binomial blur):
// keys set close together, or one move cutting straight into the next, would
// otherwise jolt the hand from one speed to another within a frame or two.
const BLUR = [[-0.06, 1], [-0.03, 4], [0, 6], [0.03, 4], [0.06, 1]];
// a balisong's handle slapping shut stays crisp: softened over less time
const BLUR_SPAN = { bh: 0.4, bb: 0.6 };
// (an inspect runs on for BLUR_TAIL past its end, so the window has slid
// right onto the resting pose before the inspect lets go: stopping at the end
// itself would jump the last hair)
export const BLUR_TAIL = 0.06;
export function samplePose(ins, t, out = {}) {
  for (const k in out) out[k] = 0;
  for (const k in ins.tracks) {
    const tr = ins.tracks[k], sp = BLUR_SPAN[k] || 1;
    let v = 0;
    for (const [dt, w] of BLUR) v += w * sampleTrack(tr, Math.min(ins.len, Math.max(0, t + dt * sp)));
    out[k] = v / 16;
  }
  return out;
}

// The pose at time t as keyed, without the softening (a knife attack's strike
// has to stay sharp).
export function samplePoseSharp(ins, t, out = {}) {
  for (const k in out) out[k] = 0;
  for (const k in ins.tracks) out[k] = sampleTrack(ins.tracks[k], Math.min(ins.len, Math.max(0, t)));
  return out;
}

// ---------------------------------------------------------------- attacks
// Knife attacks, as turns of the hand about the grip in view space (rx pitch,
// ry yaw: + turns the knife's point to the left, rz roll: + takes the top over
// to the left) and moves (dx dy dz, metres; +x right, +y up, +z back). Left
// click slashes across the view, edge first: from the right, cutting across
// and down to the left, and the next one back the other way from the left.
// Right click stabs: the wrist turns the point forward as the arm draws back,
// then drives it straight out, holds a moment and comes back.
const ak = (t, rx, ry, rz, dx, dy, dz) => [t, { rx, ry, rz, dx, dy, dz }];
export const KNIFE_ATTACKS = {
  slashA: { len: 0.44, keys: [
    ak(0.07, -0.1, -0.25, -0.75, 0.035, 0.05, 0.01),          // wound up: out to the right and up, the blade raised
    ak(0.19, 0.12, 0.12, 0.5, -0.095, -0.012, -0.03),         // the cut, across and down to the left
    ak(0.26, 0.14, 0.15, 0.58, -0.105, -0.018, -0.02),        // follow-through
    ak(0.44, 0, 0, 0, 0, 0, 0),
  ] },
  slashB: { len: 0.44, keys: [
    ak(0.07, 0.12, 0.3, 0.5, -0.08, 0.035, 0.0),              // wound up across to the left
    ak(0.19, -0.15, -0.4, -0.7, 0.045, -0.01, -0.03),         // the backhand cut, up and across to the right
    ak(0.26, -0.17, -0.45, -0.76, 0.05, -0.014, -0.02),
    ak(0.44, 0, 0, 0, 0, 0, 0),
  ] },
  stab: { len: 0.8, keys: [
    ak(0.17, -0.2, -0.9, -0.1, 0.005, 0.04, 0.05),            // drawn back and up, the point turned forward
    ak(0.27, -0.08, -1.05, 0.0, -0.055, 0.085, -0.055),       // driven straight out at the middle
    ak(0.42, -0.08, -1.03, 0, -0.052, 0.082, -0.05),          // held a moment
    ak(0.8, 0, 0, 0, 0, 0, 0),
  ] },
  // a reverse grip (karambit) hooks the claw forward and down instead
  stabReverse: { len: 0.8, keys: [
    ak(0.17, -0.35, 0.1, 0.1, 0.01, 0.035, 0.04),             // the fist drawn back and up, the claw cocked
    ak(0.27, 0.45, -0.1, -0.05, -0.035, -0.005, -0.075),      // driven forward and down
    ak(0.42, 0.42, -0.1, -0.05, -0.032, -0.003, -0.068),
    ak(0.8, 0, 0, 0, 0, 0, 0),
  ] },
  // push daggers punch straight out (both at once for the heavy)
  stabPunch: { len: 0.7, keys: [
    ak(0.14, 0.1, 0, 0, 0.004, -0.008, 0.035),                // drawn back
    ak(0.23, -0.18, 0, 0, -0.018, 0.018, -0.085),             // the punch
    ak(0.36, -0.16, 0, 0, -0.016, 0.016, -0.078),
    ak(0.7, 0, 0, 0, 0, 0, 0),
  ] },
};
const atkCache = {};
export function attackFor(kind) {
  return (atkCache[kind] ||= compileInspect(KNIFE_ATTACKS[kind]));
}

// How fast a channel is changing at time t (per second).
export function channelRate(ins, key, t) {
  const tr = ins.tracks[key];
  if (!tr) return 0;
  const e = 1 / 240;
  return (sampleTrack(tr, t + e) - sampleTrack(tr, t - e)) / (2 * e);
}

// The same, smoothed: the average rate over a short window either side,
// softened like the pose (so a drive built on it has no jolts in it either).
export function channelRateSmooth(ins, key, t, h = 0.04) {
  const tr = ins.tracks[key];
  if (!tr) return 0;
  const at = (x) => sampleTrack(tr, Math.min(ins.len, Math.max(0, x)));
  let v = 0;
  for (const [dt, w] of BLUR) v += w * (at(t + dt + h) - at(t + dt - h)) / (2 * h);
  return v / 16;
}

const cache = {};
export function inspectFor(type) {
  return (cache[type] ||= compileInspect(KNIFE_INSPECTS[type] || KNIFE_INSPECTS.standard));
}

// ---------------------------------------------------------------- guns
// Gun inspects, one per kind of weapon: turns of the whole gun in view space
// (rx pitch, ry yaw, rz roll: + takes the top over to the left, toward the
// middle of the view) and moves (dx dy dz, metres), and drop, 0..1: the
// support hand letting go. Both hands stay on the gun otherwise (the arms are
// solved to its grips every frame). The hand channels all flow through their
// keys (nothing stops dead at a key), softened like the knives.
const gk = (t, rx, ry, rz, dx, dy, dz, o = {}) => [t, { rx, ry, rz, dx, dy, dz, ...o }];
// Long guns: up and tilted away to show the near (left) side, then rolled
// right over toward you to show the far (right) side (the forearm turns it:
// the turns pivot on the wrist, the support hand goes round with the
// handguard), and back down. A little drift in each hold so it never freezes.
// R: the far-side pose (roll, height); a scoped rifle rolls less and stays
// lower, so its scope doesn't swing up into your face. The gun dips a little
// as it goes over (rolling it at full height brings its top past your eye).
const longGun = (len, s = 1, R = [0.3, 0.66, 1.26, -0.02, 0.054, 0.02]) => ({ len, fluid: 'all', keys: [
  gk(0.5 * s, 0.18, 0.46, -0.6, -0.018, 0.018, 0),
  gk(1.0 * s, 0.2, 0.52, -0.68, -0.022, 0.022, 0.002),
  gk(1.45 * s, 0.22, 0.5, -0.62, -0.024, 0.024, 0.004),
  gk(1.8 * s, 0.25, 0.57, 0.32, -0.022, 0.004, -0.006),
  gk(2.15 * s, ...R),
  gk(2.75 * s, R[0] + 0.03, R[1] + 0.04, R[2] + 0.06, R[3] - 0.002, R[4] + 0.004, R[5] + 0.002),
  gk(3.3 * s, R[0], R[1] + 0.02, R[2] + 0.02, R[3], R[4] + 0.001, R[5]),
] });
// Pistols: the support hand lets go and the shooting hand does it alone,
// further round (a pistol is light), and the support hand comes back.
const PISTOL = { len: 4.3, fluid: 'all', keys: [
  gk(0.32, 0.06, 0.25, -0.25, -0.01, 0.01, 0, { drop: 1 }),
  gk(0.6, 0.16, 0.45, -0.65, -0.015, 0.02, 0, { drop: 1 }),
  gk(1.4, 0.18, 0.5, -0.6, -0.02, 0.022, 0, { drop: 1 }),
  gk(2.05, 0.3, 0.6, 1.4, -0.02, 0.045, 0.015, { drop: 1 }),
  gk(2.6, 0.32, 0.65, 1.46, -0.022, 0.048, 0.016, { drop: 1 }),
  gk(3.2, 0.3, 0.62, 1.42, -0.02, 0.046, 0.015, { drop: 1 }),
  gk(3.85, 0.04, 0.1, 0.1, 0, 0.006, 0.002, { drop: 0.6 }),
] };
export const GUN_INSPECTS = {
  rifle: longGun(4.5), smg: longGun(4.4), shotgun: longGun(4.5), lmg: longGun(4.7, 1.05),
  sniper: longGun(4.7, 1.05, [0.28, 0.55, 1.15, -0.015, 0.035, 0.0]),
  pistol: PISTOL,
  // a grenade: turned one way, then the hand rolls over to show it lying in
  // the palm
  grenade: { len: 4.0, fluid: 'all', keys: [
    gk(0.45, 0.15, 0.45, -0.6, -0.015, 0.015, 0), gk(1.25, 0.18, 0.5, -0.66, -0.018, 0.018, 0.002),
    gk(1.95, 0.28, 0.5, 1.08, -0.02, 0.062, 0.01), gk(2.8, 0.3, 0.54, 1.14, -0.021, 0.065, 0.011),
  ] },
  // the bomb (and anything else): turned to one side, then over to the other
  default: { len: 4.0, fluid: 'all', keys: [
    gk(0.45, 0.15, 0.45, -0.6, -0.015, 0.015, 0), gk(1.25, 0.18, 0.5, -0.66, -0.018, 0.018, 0.002),
    gk(1.9, 0.25, 0.55, 1.1, -0.015, 0.05, 0.015), gk(2.8, 0.27, 0.6, 1.16, -0.016, 0.052, 0.016),
  ] },
};
const gunCache = {};
export function gunInspectFor(type) {
  return (gunCache[type] ||= compileInspect(GUN_INSPECTS[type] || GUN_INSPECTS.default));
}
export function clearGunInspectCache() { for (const k in gunCache) delete gunCache[k]; }
