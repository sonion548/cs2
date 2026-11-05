// Pattern templates. Every skin has a pattern number (its seed, 0-999, rolled
// when it drops). For most finishes the number only moves the design around.
// For the finishes below, each number maps to a named pattern from the
// finish's template, with its own look, rarity and price, so a drop can be a
// one-in-a-hundred blue gem:
//   Tempered Bloom (heat-tinted steel): how much of the steel turns blue.
//     1 in 100 patterns is a Blue Gem (nearly all blue), 3 in 100 a Tier 2
//     Blue Gem, 1 in 40 a Gold Gem (almost no blue); the rest are 20-60% blue.
//   Fades: how far the fade runs, 80-99%; 1 in 20 is a Full Fade.
//   Phased swirls (Nebula Swirl): Phase 1-4 change which colour leads, and
//     rare gem phases replace the colours with one jewel tone: Sapphire and
//     Ruby (1.5 in 100 each) and Black Pearl (under 1 in 100).
//   Dopplers (Doppler Wave, Gamma Wave): candy-coloured metal in four phases,
//     each its own palette (Phase 2, pink, is the favourite), and rare gems:
//     Ruby and Sapphire (1.5 in 100 each) and Black Pearl (under 1 in 100) on
//     the Doppler Wave, Emerald (2 in 100) on the green Gamma Wave.
// Used by the finish painter (the look), the economy (the price) and the UI
// (the name), so all three always agree.

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const GEMS = {
  Sapphire: ['#020a2a', '#0a2a8a', '#2a6aff', '#bfe0ff'],
  Ruby: ['#1a0206', '#6a0a1a', '#e0203a', '#ffb0b8'],
  'Black Pearl': ['#05030a', '#2a1240', '#6a2a8a', '#d6a8ff'],
};

// Doppler palettes, dark to bright: [name, palette, price multiplier], and
// gems as [name, chance, palette, price multiplier].
const DOPPLER = {
  wave: {
    phases: [
      ['Phase 1', ['#040208', '#140a24', '#3a1458', '#a33aa8'], 0.95],   // mostly black, a little purple
      ['Phase 2', ['#10041a', '#5a1460', '#e0429e', '#ffb2e2'], 1.3],    // pink and purple
      ['Phase 3', ['#020c14', '#0a3450', '#169a9e', '#9ef0dc'], 0.9],    // teal
      ['Phase 4', ['#040824', '#22359a', '#5e86ff', '#e2a6ff'], 1.15],   // bright blue with pink
    ],
    gems: [
      ['Black Pearl', 0.008, ['#020208', '#120a2e', '#3a1e78', '#9a6ad8'], 4],
      ['Ruby', 0.015, ['#140204', '#5a0612', '#d0142e', '#ff8a96'], 5],
      ['Sapphire', 0.015, ['#020618', '#08227a', '#1e5aff', '#9ec6ff'], 5],
    ],
  },
  gamma: {
    phases: [
      ['Phase 1', ['#020a04', '#0a3018', '#1e8a3a', '#9ee06a'], 1],
      ['Phase 2', ['#020a06', '#0a3a22', '#22b45a', '#d6ff9a'], 1.15],
      ['Phase 3', ['#020a0a', '#08343a', '#18a08a', '#a6f0d6'], 0.9],
      ['Phase 4', ['#030812', '#0a2a4a', '#1e8aa0', '#a6e6ff'], 1],
    ],
    gems: [['Emerald', 0.02, ['#010a04', '#033a14', '#0ad04a', '#9effb6'], 4.5]],
  },
};

// { name, special, mult, params } for a skin definition and pattern number.
// special: a pattern worth calling out (gems, full fades); params feed the
// finish painter; mult scales the market price.
export function patternInfo(def, seed) {
  const f = def?.finish;
  if (!f) return { name: '', special: false, mult: 1, params: null };
  const u = hash01(`${def.id}#${seed}`), v = hash01(`${def.id}~${seed}`);
  if (f.type === 'tempered') {
    if (u < 0.01) return { name: 'Blue Gem (Tier 1)', special: true, mult: 8, params: { blue: 0.93 + v * 0.05 } };
    if (u < 0.04) return { name: 'Blue Gem (Tier 2)', special: true, mult: 3.2, params: { blue: 0.8 + v * 0.1 } };
    if (u > 0.975) return { name: 'Gold Gem', special: true, mult: 2, params: { blue: 0.03 + v * 0.05 } };
    const blue = 0.25 + v * 0.38;
    return { name: `${Math.round(blue * 100)}% blue`, special: false, mult: 1 + Math.max(0, blue - 0.5) * 1.5, params: { blue } };
  }
  if (f.type === 'gradient') {
    if (u > 0.95) return { name: 'Full Fade', special: true, mult: 1.7, params: { fade: 1 } };
    const fade = 0.8 + v * 0.19;
    return { name: `${Math.round(fade * 100)}% fade`, special: false, mult: 1 + (fade - 0.8) * 1.5, params: { fade } };
  }
  if (f.type === 'doppler') {
    const T = DOPPLER[f.variant] || DOPPLER.wave;
    let acc = 0;
    for (const [name, chance, palette, mult] of T.gems) { acc += chance; if (u < acc) return { name, special: true, mult, params: { palette } }; }
    const [name, palette, mult] = T.phases[Math.min(T.phases.length - 1, Math.floor(v * T.phases.length))];
    return { name, special: false, mult, params: { palette } };
  }
  if (f.type === 'swirl' && f.phases) {
    if (u < 0.008) return { name: 'Black Pearl', special: true, mult: 6, params: { gem: GEMS['Black Pearl'] } };
    if (u < 0.023) return { name: 'Ruby', special: true, mult: 4.5, params: { gem: GEMS.Ruby } };
    if (u < 0.038) return { name: 'Sapphire', special: true, mult: 4.5, params: { gem: GEMS.Sapphire } };
    const phase = 1 + Math.floor(v * 4);
    return { name: `Phase ${phase}`, special: false, mult: [1, 1.15, 1, 1.1][phase - 1], params: { phase } };
  }
  return { name: '', special: false, mult: 1, params: null };
}

// Does this finish have a pattern template?
export const hasPatterns = (def) => !!def?.finish && (def.finish.type === 'tempered' || def.finish.type === 'gradient' || def.finish.type === 'doppler' || (def.finish.type === 'swirl' && !!def.finish.phases));
