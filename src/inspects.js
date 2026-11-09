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

// Fanning: basic flips run straight into one another, closing and opening in
// turn, n of them (from open; an even n ends open).
function fan(t0, p, n, d = 0.34) {
  const out = [];
  for (let i = 0, dir = -1; i < n; i++, dir = -dir) {
    out.push(...basic(t0 + i * d, p, dir, dir < 0 ? 0 : -TAU, dir < 0 ? 0 : -PI, d, i === n - 1));
  }
  return out;
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

// The skeleton knife let go onto the index finger by its ring, hanging from
// it and swinging (a pendulum dying away), then swung up and over the finger
// once and caught back in the fist.
function pendulum(t0, p, d = 1.7) {
  const SP = { ix: 0.92, mi: -0.15, th: 0.3, rp: 0 };
  const k = [
    [t0, { ...knifeOnly(p), ...GRIP, ring: 0, ringW: 0, hang: 0 }],
    [t0 + 0.18, { ...p, ix: 0.6, mi: 0.55, th: 0.35, ring: 0.2, ringW: 0.5, hang: 0.4 }],
    [t0 + 0.36, { ...p, ...SP, ring: 0.9, ringW: 1, hang: 1 }],
  ];
  // the swing, out and back, smaller each time: three swings of a damped
  // pendulum, keyed densely so it moves like one (keyed only at the ends of
  // each swing, it lurched as it turned)
  const n = 36;
  for (let i = 1; i <= n; i++) { const u = i / n; k.push([t0 + 0.36 + d * u, { ring: 0.9 * Math.pow(0.72, 6 * u) * Math.cos(6 * PI * u) }]); }
  const t1 = t0 + 0.36 + d;
  k.push([t1 + 0.18, { ...p, ...SP, ring: -0.65, hang: 1 }],                             // drawn back for the throw (any further and the forearm hides it)
    [t1 + 0.5, { ...p, ...SP, flex: (p.flex || 0) - 0.15, ring: TAU * 0.55, hang: 0.4 }], // round over the finger
    [t1 + 0.72, { ...p, ix: 0.55, mi: 0.3, th: 0.3, ring: TAU - 0.15, ringW: 0.45, hang: 0 }],
    [t1 + 0.88, { ...p, ...GRIP, ring: TAU, ringW: 0, hang: 0 }]);
  return { keys: k, t: t1 + 0.88 };
}

// The talon flicked round the index finger through its front ring: half a
// turn back into a reverse hold (the claw hanging down and back), held, half
// a turn forward again, and a full turn the other way, caught in the fist.
function ringFlicks(t0, p) {
  const SP = { ix: 0.4, mi: 0.75, th: 0.35, rp: 0 };
  return [
    [t0, { ...knifeOnly(p), ...GRIP, ring: 0, ringW: 0 }],
    [t0 + 0.14, { ...p, ...SP, flex: (p.flex || 0) + 0.15, ring: -0.15, ringW: 0.9 }],
    [t0 + 0.36, { ...p, ...SP, flex: (p.flex || 0) - 0.1, ring: PI, ringW: 1 }],
    // it swings on a little past and settles back (stopped dead, it jarred)
    [t0 + 0.46, { ring: PI + 0.22 }], [t0 + 0.62, { ring: PI - 0.07 }],
    [t0 + 0.8, { ...p, ...SP, roll: (p.roll || 0) + 0.2, ring: PI + 0.05, ringW: 1 }],
    [t0 + 1.04, { ...p, ...SP, ring: 0.05, ringW: 1 }],
    [t0 + 1.2, { ...p, ...SP, flex: (p.flex || 0) + 0.12, ring: 0.2, ringW: 1 }],
    [t0 + 1.62, { ...p, ...SP, ring: -TAU + 0.5, ringW: 1 }],
    [t0 + 1.8, { ...p, ix: 0.3, mi: 0.3, th: 0.2, ring: -TAU + 0.08, ringW: 0.4 }],
    [t0 + 1.95, { ...p, ...GRIP, ring: -TAU, ringW: 0 }],
  ];
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

// Balisong: real flipping tricks, in a row. Up with the flat of the blade to
// you and let slide out to the ends of the handles; a basic close, the closed
// knife turned to you (the blade hidden between the handles), a basic open;
// fanning (four flips run into each other); back into the fist for a Chaplin
// (spun round the index finger); out again, closed, and an aerial (tossed up,
// turning once and opening in the air, caught in the fist); the open knife
// shown and back to the grip. One inspect in twenty (the viewmodel picks)
// fumbles the catch: the knife falls, the hand goes down after it and comes
// back up with it closed, shakes it off and flips it open.
function balisong(drop) {
  const F = show({ flex: -0.28, y: 0.036 });                  // the pose the flips are done in
  const EASE = { ix: 0.2, mi: 0.24, th: -0.6, rp: 0.08 };     // the grip loosened to let the knife slide (the thumb tucked clear of the handles' ends)
  const CH = { roll: 0, flex: 0, yaw: 0, x: -0.012, y: 0.032, z: 0 };   // for the Chaplin: the index finger points away, the spin faces you
  // slid out to the ends of the handles (every channel is held up to a move:
  // a key far back would otherwise have it drift across the moves between)
  const out = (t) => [[t, show({ flex: -0.24, y: 0.038, ...EASE, slide: 0 })], [t + 0.2, { ...F, ...PINCH }]];
  const into = (t, pose) => [[t, { slide: BS }], [t + 0.1, show({ flex: -0.36, y: 0.038, ...EASE })], [t + 0.28, { ...pose, slide: 0, ...GRIP, rp: 0 }]];
  const air = aerial(7.4, F, drop);
  const keys = seq(
    [[0.36, show({ flex: -0.32, y: 0.03 })], [0.46, { slide: 0 }]], out(0.6),
    basic(0.9, F, -1, 0, 0),
    // shut: the wrist turns it to you and back
    [[1.75, show({ roll: 0.3, flex: -0.42, y: 0.04, ...PINCH })], [1.98, show({ roll: 0.06, flex: -0.3, y: 0.038, ...PINCH })]],
    basic(2.08, F, 1, -TAU, -PI, 0.66, false),
    fan(2.78, F, 4, 0.34),
    into(4.24, CH),
    chaplin(4.62, CH, 2, 0.85),
    out(6.4),
    basic(6.78, F, -1, 0, 0, 0.6, false),
    air.keys,
  );
  const tc = air.tc;
  if (drop) keys.push(...out(tc + 0.1), ...basic(tc + 0.42, F, 1, -TAU, -PI), ...into(tc + 1.2, show({ flex: -0.42, y: 0.036 })));
  // caught: the hand turns back over, the open knife shown flat to you
  else keys.push([tc + 0.42, show({ flex: -0.44, y: 0.036, ...GRIP })], [tc + 0.72, show({ roll: 0.1, flex: -0.46, y: 0.037, ...GRIP })]);
  return { len: tc + (drop ? 1.95 : 1.12), fluid: true, end: { flip: drop ? 0 : -TAU, ring: 2 * TAU }, keys };
}

export const KNIFE_INSPECTS = {
  // Field knife: brought up in a salute, tip up and the flat to you; turned a
  // half turn in the fingers to show the other face, still upright, and the
  // rest of the way round; lowered.
  standard: { len: 4.5, fluid: true, end: { twirl: TAU }, keys: (() => {
    const S = { roll: 1.6, flex: 1.3, yaw: 0, x: -0.04, y: 0.03, z: 0.02 }, S2 = { ...S, roll: 1.64, y: 0.033 };
    return seq(
      [[0.4, show({ flex: -0.4 })], [1.0, S], [1.4, S2]],
      twirl(1.45, S2, 0, PI, 0.45),
      [[2.55, { ...S, twirl: PI }], [2.9, { ...S2, roll: 1.58, twirl: PI }]],
      twirl(2.95, S, PI, PI, 0.45),
      [[4.0, show({ roll: 0.15, flex: -0.42, twirl: TAU })]],
    );
  })() },
  // Bayonet: a flick of the wrist turns it end over end into a reverse grip;
  // the fist turned to show it, the blade standing out from the little-finger
  // side; flicked back round into the normal grip (the turn across the view),
  // then the other face.
  bayonet: { len: 4.6, fluid: true, end: { rev: TAU }, keys: (() => {
    const R1 = show({ roll: -1.05, flex: -0.6, yaw: -0.3, x: -0.08, y: 0.055 }), R2 = show({ roll: -1.2, flex: -0.55, yaw: -0.25, x: -0.078, y: 0.057 });
    return seq(
      [[0.4, show({ flex: -0.35, y: 0.032 })]],
      revFlip(0.45, show({ flex: -0.35, y: 0.032 }), 0, PI, 0.42, 0.02),
      [[1.45, { ...R1, rev: PI }], [1.95, { ...R2, rev: PI }]],
      revFlip(2.0, R2, PI, PI, 0.42, 0.02),
      [[3.1, over({ rev: TAU })], [3.6, over({ ...OVER2, rev: TAU })], [4.1, show({ roll: 0.15, rev: TAU })]],
    );
  })() },
  // Combat bayonet: a drill: a slash across, a stab straight out, then the
  // wrist turned to put the saw back toward you, and the other face.
  combat: { len: 4.3, fluid: true, keys: [
    [0.35, show({ flex: -0.3, y: 0.03 })],
    [0.62, show({ yaw: 0.35, flex: -0.15, x: 0.02, y: 0.04, z: 0.01 })],          // wound up to the right
    [0.82, show({ yaw: -0.55, flex: -0.35, x: -0.075, y: 0.026, z: -0.02 })],     // the slash across
    [1.08, show({ yaw: -0.2, flex: -0.3, x: -0.05, y: 0.03 })],
    [1.3, show({ flex: -0.05, x: -0.04, y: 0.034, z: 0.03, mi: -0.1 })],           // drawn back
    [1.46, show({ flex: 0.1, x: -0.035, y: 0.036, z: -0.06, mi: -0.12 })],         // the stab
    [1.72, show({ flex: -0.3, x: -0.05, y: 0.035 })],
    [2.25, show({ roll: 1.05, flex: -0.6, y: 0.05 })],                             // the saw back toward you
    [2.7, show({ roll: 1.12, flex: -0.65, y: 0.052 })],
    [3.2, over()], [3.65, over(OVER2)], [4.0, show({ roll: 0.15 })],
  ] },
  // Flip knife: tossed high, turning twice end over end, caught; a half turn
  // in the fingers shows the other face, and back round.
  flip: { len: 4.6, fluid: true, end: { flip: 2 * TAU, twirl: TAU }, keys: seq(
    [[0.35, show({ flex: -0.25, y: 0.026 })]],
    toss(0.4, show({ flex: -0.25, y: 0.026 }), 0, 2, 0.11, 0.86),
    [[1.75, show({ flex: -0.45, y: 0.034, flip: 2 * TAU })]],
    twirl(1.8, show({ flex: -0.45, y: 0.034, flip: 2 * TAU }), 0, PI, 0.42),
    [[2.95, show({ roll: 0.4, flex: -0.4, y: 0.036, flip: 2 * TAU, twirl: PI })]],
    twirl(3.05, show({ roll: 0.2, flip: 2 * TAU }), PI, PI, 0.42),
  ) },
  // Gut hook: the wrist turns the hook on the spine up toward you, and it's
  // pulled back twice as if catching something on it; the other face.
  gut: { len: 4.3, fluid: true, keys: [
    [0.4, show({ flex: -0.4 })],
    [0.95, show({ roll: 0.95, flex: -0.55, y: 0.05 })],                            // the hook to you
    [1.25, show({ roll: 0.95, flex: -0.4, y: 0.052, z: -0.02 })],
    [1.45, show({ roll: 1.0, flex: -0.75, y: 0.046, z: 0.024, mi: -0.12 })],       // pull
    [1.7, show({ roll: 0.95, flex: -0.42, y: 0.052, z: -0.018 })],
    [1.9, show({ roll: 1.0, flex: -0.78, y: 0.046, z: 0.026, mi: -0.12 })],        // pull
    [2.25, show({ roll: 0.9, flex: -0.55, y: 0.05 })],
    [2.8, over()], [3.3, over(OVER2)], [3.85, show({ roll: 0.15 })],
  ] },
  // Bowie: weighed in the hand (the grip eases and it bounces in the palm
  // twice), then a slow, heavy chop down and back up, and the long blade
  // turned over slowly.
  bowie: { len: 4.8, fluid: true, keys: [
    [0.4, show({ flex: -0.3, y: 0.028 })],
    [0.62, show({ flex: -0.3, y: 0.02, ...LOOSE, lift: 0.012 })], [0.78, show({ flex: -0.3, y: 0.03, ...GRIP, lift: 0 })],
    [0.98, show({ flex: -0.3, y: 0.022, ...LOOSE, lift: 0.012 })], [1.14, show({ flex: -0.3, y: 0.031, ...GRIP, lift: 0 })],
    [1.6, show({ flex: 0.25, yaw: 0.35, y: 0.06, x: -0.03 })],                     // raised for the chop
    [1.92, show({ flex: -0.75, yaw: -0.25, y: 0.006, x: -0.05, z: -0.02 })],        // down
    [2.35, show({ flex: -0.4, y: 0.034 })],
    [3.0, over()], [3.6, over(OVER2)], [4.2, show({ roll: 0.15 })],
  ] },
  // Push daggers, one in each fist: up into a boxer's guard; a jab with the
  // left, a cross with the right, an uppercut with the left; the blades
  // crossed in front of the face and the right drawn along the left with a
  // scrape; apart, each fist turned palm up to show the blade's other face,
  // and back down.
  push: { len: 5.2, fluid: true, keys: (() => {
    const R0 = { roll: 0, flex: -0.15, yaw: 0, x: -0.02, y: 0.05, z: 0.01 };
    const L0 = { lroll: 0, lflex: -0.15, lyaw: 0, lx: 0.02, ly: 0.05, lz: 0.01 };
    const L = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ['l' + k, k === 'x' ? -v : v]));
    const pose = (r = {}, l = {}, f = {}) => ({ ...R0, ...r, ...L0, ...L(l), ...f });
    const punch = { z: -0.065, flex: 0.35, y: 0.056 }, cocked = { z: 0.02, flex: -0.25 };
    const upper = { z: -0.03, y: 0.085, flex: -0.6, roll: 0.4 };
    const cross = { x: -0.07, y: 0.07, z: -0.02, yaw: -0.8, roll: -0.25 }, cross2 = { ...cross, x: -0.035, y: 0.074 };
    return [
      [0.4, pose()],
      [0.62, pose({}, cocked, { mi: -0.1 })], [0.78, pose({}, punch, { mi: -0.12 })], [0.98, pose({}, {})],           // jab
      [1.12, pose(cocked, {}, { mi: -0.1 })], [1.3, pose({ ...punch, x: -0.045, yaw: -0.3 }, {}, { mi: -0.12 })], [1.52, pose({}, {})],   // cross
      [1.68, pose({}, { y: 0.03, z: 0.02 })], [1.86, pose({}, upper, { mi: -0.12 })], [2.1, pose({}, {})],              // uppercut
      [2.5, pose(cross, cross)],
      [2.95, pose(cross2, { ...cross, x: -0.085 }, { th: -0.1 })],                     // the scrape
      [3.15, pose(cross, cross)],
      [3.55, pose({ roll: 1.7, flex: -0.15, y: 0.06 }, { roll: 1.7, flex: -0.15, y: 0.06 }, { th: 0.06 })],
      [4.15, pose({ roll: 1.78, flex: -0.12, y: 0.062 }, { roll: 1.78, flex: -0.12, y: 0.062 })],
      [4.6, pose()],
    ];
  })() },
  // Navaja: snapped out from the wrist as if flicking it open, then a long
  // look down the curve of the edge (the wrist turned to sight along it), and
  // the other face.
  navaja: { len: 4.4, fluid: true, keys: [
    [0.35, show({ flex: -0.2, y: 0.026 })],
    [0.55, show({ flex: 0.35, yaw: 0.3, y: 0.02, z: 0.02, ...LOOSE })],          // cocked back
    [0.7, show({ flex: -0.55, yaw: -0.35, y: 0.04, z: -0.015, ...GRIP })],        // the snap
    [0.86, show({ flex: -0.42, yaw: -0.15, y: 0.036 })],
    [1.5, show({ roll: -0.35, flex: -0.15, yaw: -0.9, x: -0.02, y: 0.055, z: 0.03 })],   // sighting along the edge
    [2.15, show({ roll: -0.4, flex: -0.12, yaw: -0.95, x: -0.018, y: 0.057, z: 0.032 })],
    [2.6, show({ flex: -0.45, y: 0.036 })],
    [3.1, over()], [3.55, over(OVER2)], [3.95, show({ roll: 0.15 })],
  ] },
  // Stiletto: spun fast in the fingers three times like a pen, stopped dead
  // with the point out toward the middle, then the other face.
  stiletto: { len: 4.2, fluid: true, end: { twirl: 3 * TAU }, keys: seq(
    [[0.35, show({ flex: -0.42 })]],
    twirl(0.4, show({ flex: -0.42 }), 0, 3 * TAU, 0.95),
    [[1.75, show({ flex: -0.15, yaw: -0.4, x: -0.06, y: 0.04, z: -0.025, twirl: 3 * TAU })],     // the point out
     [2.2, show({ flex: -0.12, yaw: -0.42, x: -0.062, y: 0.041, z: -0.027, twirl: 3 * TAU })],
     [2.75, over({ twirl: 3 * TAU })], [3.25, over({ ...OVER2, twirl: 3 * TAU })], [3.7, show({ roll: 0.15, twirl: 3 * TAU })]],
  ) },
  // Kukri: the grip eases and the heavy blade swings loose from the fingers
  // like a pendulum, back and forth; the fist closes on it with a chop, and
  // the curved blade is turned over.
  kukri: { len: 4.7, fluid: 'all', keys: [
    [0.4, show({ flex: -0.3, y: 0.03 })],
    [0.6, show({ flex: -0.2, y: 0.032, ix: 0.38, mi: 0.4, th: 0.3, rev: 0.25 })],
    [0.92, show({ flex: -0.2, y: 0.034, ix: 0.42, mi: 0.4, th: 0.3, rev: -0.42 })],
    [1.24, show({ flex: -0.2, y: 0.034, ix: 0.38, mi: 0.4, th: 0.3, rev: 0.45 })],
    [1.54, show({ flex: -0.2, y: 0.034, ix: 0.38, mi: 0.4, th: 0.3, rev: -0.3 })],
    [1.8, show({ flex: -0.2, y: 0.033, ix: 0.2, mi: 0.3, th: 0.25, rev: 0.12 })],
    [2.05, show({ flex: 0.3, y: 0.055, ...GRIP, rev: 0 })],                        // up for the chop
    [2.3, show({ flex: -0.7, y: 0.012, z: -0.015, rev: 0 })],                      // the chop
    [2.65, show({ flex: -0.4, y: 0.032 })],
    [3.2, over()], [3.7, over(OVER2)], [4.15, show({ roll: 0.15 })],
  ] },
  // Tanto: held level across the view at eye height, edge up, and drawn
  // slowly sideways as if sighting along the edge to its angled point;
  // lowered and turned over.
  tanto: { len: 4.6, fluid: true, keys: [
    [0.4, show({ flex: -0.35 })],
    [1.0, show({ roll: 2.2, flex: -0.35, yaw: 0.35, x: -0.01, y: 0.075, z: 0.0 })],    // level, edge up
    [1.95, show({ roll: 2.25, flex: -0.35, yaw: 0.38, x: -0.07, y: 0.078, z: 0.0 })],  // drawn across
    [2.4, show({ roll: 2.2, flex: -0.35, yaw: 0.35, x: -0.06, y: 0.076 })],
    [2.95, show({ flex: -0.45, y: 0.036 })],
    [3.45, over()], [3.9, over(OVER2)], [4.25, show({ roll: 0.15 })],
  ] },
  // Survival knife: turned to put the saw back toward you and sawn back and
  // forth three times; the other face.
  survival: { len: 4.4, fluid: true, keys: [
    [0.4, show({ flex: -0.35 })],
    [0.95, show({ roll: 1.0, flex: -0.6, y: 0.05 })],
    [1.15, show({ roll: 1.0, flex: -0.6, y: 0.05, x: -0.07, z: -0.02 })],
    [1.38, show({ roll: 1.0, flex: -0.6, y: 0.048, x: -0.035, z: 0.015 })],
    [1.6, show({ roll: 1.0, flex: -0.6, y: 0.05, x: -0.072, z: -0.02 })],
    [1.83, show({ roll: 1.0, flex: -0.6, y: 0.048, x: -0.035, z: 0.015 })],
    [2.05, show({ roll: 1.0, flex: -0.6, y: 0.05, x: -0.072, z: -0.02 })],
    [2.3, show({ roll: 0.95, flex: -0.55, y: 0.049, x: -0.05 })],
    [2.85, over()], [3.35, over(OVER2)], [3.85, show({ roll: 0.15 })],
  ] },
  // Skeleton knife: let go onto the index finger by its ring, it hangs and
  // swings there like a pendulum, then it's swung round over the finger and
  // caught; the other face.
  skeleton: { len: 5.5, fluid: true, end: { ring: TAU }, keys: (() => {
    const P0 = show({ roll: -0.1, flex: -0.15, x: -0.045, y: 0.105, z: -0.02 });   // up, so it hangs in view
    const pd = pendulum(0.4, P0);
    return seq([[0.35, P0]], pd.keys,
      [[pd.t + 0.45, over({ ring: TAU })], [pd.t + 0.95, over({ ...OVER2, ring: TAU })], [pd.t + 1.4, show({ roll: 0.15, ring: TAU })]]);
  })() },
  // Hawkbill: the wrist turns the hooked point down and it rakes back twice,
  // like a claw; the other face.
  hawkbill: { len: 4.3, fluid: true, keys: [
    [0.4, show({ flex: -0.35 })],
    [0.85, show({ roll: -0.3, flex: 0.2, yaw: 0.25, y: 0.05, z: -0.03 })],
    [1.08, show({ roll: -0.25, flex: -0.45, yaw: -0.1, y: 0.024, z: 0.02, mi: -0.12 })],   // rake
    [1.35, show({ roll: -0.3, flex: 0.2, yaw: 0.25, y: 0.05, z: -0.03 })],
    [1.58, show({ roll: -0.25, flex: -0.48, yaw: -0.1, y: 0.022, z: 0.022, mi: -0.12 })],  // rake
    [1.95, show({ flex: -0.42, y: 0.036 })],
    [2.6, over()], [3.1, over(OVER2)], [3.7, show({ roll: 0.15 })],
  ] },
  // Trench knife: two punches with the knuckle guard (a jab and a hook), then
  // the fist turned to show the guard's studs, and the blade's other face.
  trench: { len: 4.4, fluid: true, keys: [
    [0.35, show({ flex: -0.15, y: 0.035 })],
    [0.55, show({ flex: -0.2, y: 0.03, z: 0.02, mi: -0.1 })],
    [0.72, show({ flex: 0.2, y: 0.045, z: -0.052, mi: -0.14 })],                   // jab
    [0.95, show({ flex: -0.1, y: 0.036 })],
    [1.15, show({ yaw: 0.45, x: 0.025, y: 0.04, z: 0.0, mi: -0.1 })],
    [1.36, show({ yaw: -0.6, x: -0.07, y: 0.045, z: -0.04, mi: -0.14 })],          // hook
    [1.65, show({ flex: -0.2, y: 0.036 })],
    [2.2, show({ roll: -0.9, flex: 0.3, y: 0.05, x: -0.04 })],                     // the guard to you
    [2.65, show({ roll: -0.95, flex: 0.32, y: 0.052, x: -0.042 })],
    [3.15, over()], [3.6, over(OVER2)], [4.0, show({ roll: 0.15 })],
  ] },
  // Cord knife: the hand turns palm up and the knife spins twice flat on the
  // open palm, caught as it comes round; turned back over to show the other
  // face.
  cord: { len: 4.7, fluid: true, end: { flip: 2 * TAU }, keys: seq(
    [[0.35, show({ flex: -0.3 })]],
    palmSpin(0.4, show({ flex: -0.3 }), 2, 1.05),
    [[2.6, show({ flex: -0.4, y: 0.036, flip: 2 * TAU })], [3.1, over({ flip: 2 * TAU })], [3.6, over({ ...OVER2, flip: 2 * TAU })], [4.15, show({ roll: 0.15, flip: 2 * TAU })]],
  ) },
  // Falchion: the forearm rolls out to show the broad blade, then it's spun
  // end over end in the hand like a windmill, all the way round, and the
  // fist closes on it; the other face.
  falchion: { len: 4.7, fluid: true, end: { rev: TAU }, keys: seq(
    [[0.4, show({ flex: -0.3 })], [0.95, show({ roll: 0.9, flex: -0.45, y: 0.05 })], [1.35, show({ roll: 0.95, flex: -0.48, y: 0.052 })]],
    revFlip(1.45, show({ roll: 0.3, flex: -0.3, y: 0.04 }), 0, TAU, 0.6, 0.012),
    [[2.75, show({ flex: -0.42, y: 0.036, rev: TAU })], [3.25, over({ rev: TAU })], [3.7, over({ ...OVER2, rev: TAU })], [4.15, show({ roll: 0.15, rev: TAU })]],
  ) },
  // Talon: flicked round the index finger through its front ring, half a turn
  // back into a reverse hold and half a turn forward again, then a full turn
  // the other way and caught; the other face.
  talon: { len: 4.6, fluid: true, end: { ring: -TAU }, keys: seq(
    [[0.35, show({ roll: -0.1, flex: -0.2, y: 0.045 })]],
    ringFlicks(0.4, show({ roll: -0.1, flex: -0.2, y: 0.045 })),
    [[2.75, over({ ring: -TAU })], [3.25, over({ ...OVER2, ring: -TAU })], [3.75, show({ roll: 0.15, ring: -TAU })]],
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
