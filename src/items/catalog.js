// Item catalogue: original skins, knife finishes, stickers and cases.
import { KNIFE_TYPES } from '../shared/knives.js';

export const RARITIES = [
  { id: 'standard', name: 'Standard', color: '#4f7cff', odds: 0.7920 },
  { id: 'superior', name: 'Superior', color: '#8c52ff', odds: 0.1600 },
  { id: 'exotic', name: 'Exotic', color: '#d23cd8', odds: 0.0360 },
  { id: 'mythic', name: 'Mythic', color: '#e8423a', odds: 0.0090 },
  { id: 'legendary', name: 'Legendary', color: '#e7b53c', odds: 0.0030 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, tier: i }]));

export const CONDITIONS = [
  { id: 'FN', name: 'Factory New', max: 0.07 },
  { id: 'MW', name: 'Minimal Wear', max: 0.15 },
  { id: 'FT', name: 'Field-Tested', max: 0.38 },
  { id: 'WW', name: 'Well-Worn', max: 0.45 },
  { id: 'BS', name: 'Battle-Scarred', max: 1.0 },
];
export function condition(f) { return CONDITIONS.find(c => f <= c.max) || CONDITIONS[4]; }

export const WEAPON_NAMES = { ak47: 'AK-47', m4a1: 'M4A1', awp: 'AWP', glock: 'Glock-18', usp: 'USP', deagle: 'Desert Eagle' };

// [weapon, name, rarity, finish params, floatRange?]
const GUN_SKINS = [
  // ---- AK-47
  ['ak47', 'Sandstorm Drift', 'standard', { type: 'camo', colors: ['#b59a6a', '#8a7048', '#d4c19a', '#5e4b30'] }],
  ['ak47', 'Rust Belt', 'standard', { type: 'digital', colors: ['#5a3b26', '#8c5a34', '#2e2520', '#a8784a'] }],
  ['ak47', 'Basalt', 'standard', { type: 'paint', base: '#2d3033', accent: '#b04a2a' }],
  ['ak47', 'Copper Contour', 'superior', { type: 'topo', base: '#2a1f1a', line: '#c87a3c' }],
  ['ak47', 'Jade Serpent', 'superior', { type: 'snake', base: '#2f6b4a', mark: '#a7c66a', dark: '#11231a' }],
  ['ak47', 'Molten Core', 'exotic', { type: 'lava', base: '#1d1715', hot: '#ff5a14', core: '#ffd36a' }, [0, 0.6]],
  ['ak47', 'Prism Break', 'exotic', { type: 'shards', colors: ['#1a1a2e', '#3a2a7a', '#7a3ac8', '#e04a9a', '#ffb23a'] }],
  ['ak47', 'Redline Rally', 'mythic', { type: 'livery', base: '#e8e4dc', band: '#c41f2a', band2: '#111', text: '#111', number: 47 }, [0, 0.5]],
  ['ak47', 'Event Horizon', 'mythic', { type: 'galaxy', colors: ['#07061a', '#2c1360', '#e0389a', '#46c2ff'] }],
  ['ak47', 'Tidecaller', 'superior', { type: 'waves', deep: '#0b2440', mid: '#1f6aa0', foam: '#eaf6fa' }],
  ['ak47', 'Black Ink', 'exotic', { type: 'ink', base: '#e9e1cf', ink: '#121212', accent: '#c0202a' }],
  ['ak47', 'Heat Shimmer', 'standard', { type: 'tiger', base: '#d48a2a', stripe: '#3a1e0e', freq: 11 }],
  // ---- M4A1
  ['m4a1', 'Urban Grid', 'standard', { type: 'digital', colors: ['#5a6068', '#33373c', '#8c939b', '#1e2124'] }],
  ['m4a1', 'Slate Ops', 'standard', { type: 'paint', base: '#3a4048', accent: '#6c8aa8' }],
  ['m4a1', 'Night Pines', 'standard', { type: 'camo', colors: ['#2a3324', '#3e4a32', '#151a12', '#5d6648'] }],
  ['m4a1', 'Honeycomb', 'superior', { type: 'hex', base: '#1d2128', line: '#d9a03a', glow: '#ffcf6a', size: 20 }],
  ['m4a1', 'Signal Trace', 'superior', { type: 'circuit', base: '#0f1a16', line: '#2f8a5a', glow: '#6affb5' }],
  ['m4a1', 'Blueprint', 'exotic', { type: 'blueprint', base: '#1c4a88', line: '#eaf3ff' }],
  ['m4a1', 'Glacier Fade', 'exotic', { type: 'gradient', colors: ['#e9f6ff', '#6cc4f0', '#2a4cc0', '#160f40'] }, [0, 0.08]],
  ['m4a1', 'Afterburner', 'mythic', { type: 'flames', base: '#141416', colors: ['#2a7aff', '#7ad0ff', '#ffffff'] }],
  ['m4a1', 'Static Storm', 'mythic', { type: 'lightning', base: '#151a2e', base2: '#2a1240', bolt: '#bfe8ff' }],
  ['m4a1', 'Coral Reef', 'superior', { type: 'scales', base: '#e0745a', edge: '#5a1e2a', size: 18 }],
  ['m4a1', 'Carbon Weave', 'standard', { type: 'carbon', base: '#16171a', sheen: '#3a3f48' }],
  ['m4a1', 'Night Market', 'exotic', { type: 'neon', base: '#0b0b12', colors: ['#ff3ea5', '#36e0ff', '#f9ff4a'] }],
  // ---- AWP
  ['awp', 'Dune Hunter', 'standard', { type: 'camo', colors: ['#c2a878', '#9a7f52', '#e0cfa4', '#6c5636'], scale: 3.5 }],
  ['awp', 'Ash Grey', 'standard', { type: 'paint', base: '#5a5c5e', accent: '#e0e0e0' }],
  ['awp', 'Pit Viper', 'superior', { type: 'snake', base: '#4a5a28', mark: '#c6c84a', dark: '#141708' }],
  ['awp', 'Big Cat', 'superior', { type: 'spots', base: '#d8b070', spot: '#9a6a30', ring: '#1a120a' }],
  ['awp', 'Folded Steel', 'exotic', { type: 'folded', base: '#a8aeb6', dark: '#33373d' }],
  ['awp', 'Wildfire', 'mythic', { type: 'flames', base: '#18120e' }],
  ['awp', 'Nebula Swirl', 'mythic', { type: 'swirl', colors: ['#1a0f3a', '#6a2ab8', '#ff5ac8', '#ffd0f0', '#3ad0ff'] }, [0, 0.08]],
  ['awp', 'Rooftop Tag', 'exotic', { type: 'graffiti', base: '#e8e3d6', colors: ['#ff4a3a', '#2a8aff', '#ffd23a', '#1a1a1a'], words: ['ONE SHOT', 'VANTAGE', 'LONG'] }],
  ['awp', 'Carp Pond', 'superior', { type: 'waves', deep: '#132a1a', mid: '#2e7a5a', foam: '#ffd28a' }],
  ['awp', 'Volt Line', 'exotic', { type: 'circuit', base: '#14101e', line: '#7a4ac8', glow: '#e07aff' }],
  ['awp', 'Cobalt Rally', 'mythic', { type: 'livery', base: '#1a3cc8', band: '#f0f0f0', band2: '#ffcc1a', number: 1 }],
  // ---- Glock
  ['glock', 'Gravel', 'standard', { type: 'digital', colors: ['#6a6660', '#4a4640', '#8c877e'] }],
  ['glock', 'Candy Apple', 'standard', { type: 'paint', base: '#b0141e' }],
  ['glock', 'Fault Line', 'superior', { type: 'lava', base: '#141a22', hot: '#3ad0ff', core: '#e6fbff' }],
  ['glock', 'Sunset Strip', 'exotic', { type: 'gradient', colors: ['#ffe07a', '#ff7a3a', '#c41e6a', '#3a0f5a'] }, [0, 0.08]],
  ['glock', 'Splash Zone', 'superior', { type: 'splatter', base: '#1a1a1e', colors: ['#3affc8', '#ff3a8a', '#ffe23a'] }],
  ['glock', 'Wasteland Scrawl', 'exotic', { type: 'graffiti', base: '#262626', colors: ['#c8ff3a', '#ff5a1a', '#ffffff'] }],
  ['glock', 'Tempered Bloom', 'mythic', { type: 'tempered' }],
  ['glock', 'Mantis', 'standard', { type: 'tiger', base: '#6a9a3a', stripe: '#1e3010', freq: 14 }],
  // ---- USP
  ['usp', 'Forest Floor', 'standard', { type: 'camo', colors: ['#3e4a2e', '#5c6a40', '#22281a', '#7a7a50'] }],
  ['usp', 'Gunmetal', 'standard', { type: 'paint', base: '#40464c' }],
  ['usp', 'Contour', 'superior', { type: 'topo', base: '#1c2430', line: '#7ab4e0' }],
  ['usp', 'Orbit', 'exotic', { type: 'galaxy', colors: ['#050510', '#16325a', '#3ac0c8', '#f0e06a'] }],
  ['usp', 'Hive Mind', 'superior', { type: 'hex', base: '#141414', line: '#3a3a3a', glow: '#ff3a3a', size: 24 }],
  ['usp', 'Ivory Ink', 'mythic', { type: 'ink', base: '#f0ece2', ink: '#0e1a2a', accent: '#1a6ac8' }],
  ['usp', 'Kelp Forest', 'standard', { type: 'scales', base: '#2a5a4a', edge: '#0e2018', size: 22 }],
  ['usp', 'Pulse', 'exotic', { type: 'neon', base: '#0a0a0a', colors: ['#3aff6a', '#3ad0ff'] }],
  // ---- Desert Eagle
  ['deagle', 'Sun-Bleached', 'standard', { type: 'camo', colors: ['#d8c8a8', '#b8a078', '#efe4cc'] }],
  ['deagle', 'Burnished', 'standard', { type: 'folded', base: '#c8a060', dark: '#5a3e1a' }],
  ['deagle', 'Golden Hour', 'exotic', { type: 'gradient', colors: ['#fff2b0', '#ffc23a', '#c86a1a', '#5a1e0a'] }],
  ['deagle', 'Thunderhead', 'mythic', { type: 'lightning', base: '#1a1a22', base2: '#2a2a3a', bolt: '#ffe86a' }],
  ['deagle', 'Pharaoh', 'superior', { type: 'scales', base: '#c8a040', edge: '#1a3a6a', size: 14 }],
  ['deagle', 'Magma Flow', 'exotic', { type: 'lava', base: '#141010' }],
  ['deagle', 'Crimson Crackle', 'superior', { type: 'shards', colors: ['#2a0a0e', '#6a0e1a', '#c41e2a', '#ff5a4a'] }],
  ['deagle', 'Grand Prix', 'mythic', { type: 'livery', base: '#141414', band: '#ffcc1a', band2: '#e0e0e0', number: 50 }],
  // ---- illustrated: original characters, artwork, street art
  ['ak47', 'Sakura Rush', 'mythic', { type: 'anime', bg: 'sakura', hair: '#ff8ab8', eyes: '#3ac87a', outfit: '#f4f4f8', collar: 'sailor', collarColor: '#1a2a5a', accent: '#e8203a', style: 'twintail', acc: 'ribbon', expression: 'smile', tag: 'HANA', at: 0.42 }],
  ['m4a1', 'Neon Idol', 'mythic', { type: 'anime', bg: 'neon', hair: '#5ae0ff', eyes: '#ff5ab0', outfit: '#1a1430', collar: 'jacket', accent: '#ff5ab0', style: 'long', acc: 'headphones', expression: 'wink', tag: 'MIRAI', tagColor: '#5ae0ff', at: 0.38 }],
  ['awp', 'Moonlit Fox', 'mythic', { type: 'anime', bg: 'sunset', hair: '#e8e8f4', eyes: '#ffb03a', outfit: '#6a1a2a', collar: 'jacket', style: 'long', acc: 'ears', expression: 'neutral', tag: 'TSUKI', at: 0.36 }],
  ['glock', 'Bubblegum', 'exotic', { type: 'anime', bg: 'speed', hair: '#b89aff', eyes: '#ff6aa8', outfit: '#ff8ac0', collar: 'hoodie', style: 'bob', acc: 'ribbon', accent: '#ffe23a', expression: 'wink', tag: 'POP', at: 0.45 }],
  ['usp', 'Oni Princess', 'mythic', { type: 'anime', bg: 'sunset', hair: '#1a1622', eyes: '#e8203a', outfit: '#2a0e1a', collar: 'jacket', style: 'long', acc: 'horns', expression: 'fierce', tag: 'AKANE', tagColor: '#ff5a5a', at: 0.4 }],
  ['deagle', 'Root Access', 'exotic', { type: 'anime', bg: 'neon', hair: '#3ae08a', eyes: '#3ad0ff', outfit: '#20242c', collar: 'hoodie', style: 'bob', acc: 'headphones', accent: '#3ae08a', expression: 'neutral', tag: 'ROOT', tagColor: '#3ae08a', at: 0.45 }],
  ['ak47', 'Koi Garden', 'exotic', { type: 'koi', water1: '#1a6a7a', water2: '#082a3a', spot: '#e8452a' }],
  ['glock', 'Lagoon', 'superior', { type: 'koi', water1: '#2a8a6a', water2: '#0a3a2a', spot: '#ffb03a' }],
  ['ak47', 'Distant Peaks', 'superior', { type: 'landscape', sky: ['#ffcf8a', '#ff8a6a', '#7a4a8a'], sun: '#fff2c0', layers: ['#a85a7a', '#7a3a6a', '#4a2050', '#24102e'] }],
  ['awp', 'Night Ridge', 'exotic', { type: 'landscape', sky: ['#0a0a2a', '#1a2a5a', '#3a5a8a'], sun: '#f0f0d0', stars: true, layers: ['#2a3a5a', '#1a2840', '#101a2a', '#060a14'] }],
  ['m4a1', 'Wildstyle', 'exotic', { type: 'wildstyle', word: 'VANTAGE', wall: '#7a4a3a', cloud: '#3ad0ff', c1: '#ffe23a', c2: '#ff3a6a' }],
  ['usp', 'Throw-Up', 'superior', { type: 'wildstyle', word: 'HOLD', wall: '#5a5a5a', cloud: '#a03aff', c1: '#3affc8', c2: '#2a6aff' }],
  ['awp', 'Comic Strike', 'mythic', { type: 'comic', bg: '#ffe14a', dots: '#ff4a3a', words: ['BLAM!', 'ZAP!'] }],
  ['deagle', 'Pop Burst', 'exotic', { type: 'comic', bg: '#7ad0ff', dots: '#2a5ac8', words: ['POW!', 'BANG!'] }],
  ['deagle', 'Flash Sheet', 'superior', { type: 'tattoo', bg: '#efe3c8', motto: 'NO RETREAT' }],
  ['m4a1', 'Old Ink', 'exotic', { type: 'tattoo', bg: '#e8dcc0', motto: 'HOLD FAST', red: '#a81a22', green: '#1e5a3a' }],
  ['glock', 'Unit 07', 'superior', { type: 'mecha', base: '#e8e6e0', c1: '#2a5ac8', c2: '#e8203a', code: '07' }],
  ['awp', 'Frame Zero', 'exotic', { type: 'mecha', base: '#3a3e44', c1: '#ff8a1a', c2: '#ffcc1a', code: '00' }],
  ['usp', 'Sticker Bomb', 'exotic', { type: 'stickerbomb', base: '#1a1a1a' }],
  ['ak47', 'Collage', 'mythic', { type: 'stickerbomb', base: '#f0f0f0' }],
];

const KNIFE_FINISHES = [
  ['Vanilla', null],
  ['Tempered Bloom', { type: 'tempered' }],
  ['Folded Steel', { type: 'folded', base: '#b0b6be', dark: '#2e3238' }],
  ['Glacier Fade', { type: 'gradient', colors: ['#e9f6ff', '#6cc4f0', '#2a4cc0', '#160f40'] }],
  ['Sunset Fade', { type: 'gradient', colors: ['#ffe07a', '#ff7a3a', '#c41e6a', '#3a0f5a'] }],
  ['Nebula Swirl', { type: 'swirl', colors: ['#1a0f3a', '#6a2ab8', '#ff5ac8', '#ffd0f0', '#3ad0ff'] }],
  ['Emerald Swirl', { type: 'swirl', colors: ['#021a10', '#0a6a3a', '#3ae08a', '#c8ffd8'], metal: 0.9 }],
  ['Ruby Swirl', { type: 'swirl', colors: ['#1a0206', '#6a0a1a', '#e0203a', '#ffb0b8'], metal: 0.9 }],
  ['Night Stalker', { type: 'paint', base: '#141518' }],
  ['Forest Camo', { type: 'camo', colors: ['#3e4a2e', '#5c6a40', '#22281a', '#7a7a50'] }],
  ['Tiger Stripe', { type: 'tiger', base: '#e0a030', stripe: '#2a1606', freq: 12 }],
  ['Spider Silk', { type: 'topo', base: '#7a0e14', line: '#1a0406' }],
  ['Big Cat', { type: 'spots', base: '#d8b070', spot: '#9a6a30', ring: '#1a120a' }],
  ['Molten Core', { type: 'lava', base: '#1d1715' }],
  ['Event Horizon', { type: 'galaxy' }],
  ['Koi Pond', { type: 'koi' }],
  ['Comic Pop', { type: 'comic', words: ['SLASH!', 'SNIKT!'] }],
  ['Wild Ink', { type: 'tattoo' }],
];

// ---------------------------------------------------------------- stickers
// Original sticker designs, drawn procedurally in stickers.js.
export const STICKER_DEFS = [
  ['gg', 'GG', 'text', { text: 'GG', bg: '#1a1a1a', fg: '#ffd23a' }],
  ['clutch', 'Clutch', 'text', { text: 'CLUTCH', bg: '#c41e2a', fg: '#fff' }],
  ['ace', 'Ace', 'text', { text: 'ACE', bg: '#111', fg: '#e8e8e8', accent: '#e7b53c' }],
  ['onehp', '1 HP', 'text', { text: '1HP', bg: '#2a0a0a', fg: '#ff3a3a' }],
  ['nice', 'Nice Shot', 'text', { text: 'NICE', bg: '#0a2a4a', fg: '#7ad0ff' }],
  ['oops', 'Oops', 'text', { text: 'OOPS', bg: '#ffd23a', fg: '#111' }],
  ['eco', 'Eco Round', 'text', { text: 'ECO', bg: '#2a5a2a', fg: '#d8ffb0' }],
  ['hold', 'Hold the Line', 'text', { text: 'HOLD', bg: '#e8e3d6', fg: '#1a1a1a', accent: '#c41e2a' }],
  ['vantage', 'Vantage Logo', 'text', { text: 'VANTAGE', bg: '#121315', fg: '#e8632b' }],
  ['crown', 'Crown', 'icon', { icon: 'crown', bg: '#3a1a6a', fg: '#ffd23a' }],
  ['flame', 'Flame', 'icon', { icon: 'flame', bg: '#1a0a06', fg: '#ff6a1a' }],
  ['bolt', 'Bolt', 'icon', { icon: 'bolt', bg: '#14182a', fg: '#ffe23a' }],
  ['star', 'Star', 'icon', { icon: 'star', bg: '#0e2a5a', fg: '#ffffff' }],
  ['eye', 'All-Seeing', 'icon', { icon: 'eye', bg: '#0a0a0a', fg: '#3affc8' }],
  ['heart', 'Heart', 'icon', { icon: 'heart', bg: '#ffd8e0', fg: '#e0203a' }],
  ['cross', 'Crosshair', 'icon', { icon: 'crosshair', bg: '#111', fg: '#4dff6a' }],
  ['dice', 'Lucky Roll', 'icon', { icon: 'dice', bg: '#e8e8e8', fg: '#111' }],
  ['skull', 'Skull', 'icon', { icon: 'skull', bg: '#1a1a1a', fg: '#e8e3d6' }],
  ['rocket', 'Rocket', 'icon', { icon: 'rocket', bg: '#0a1a3a', fg: '#ff5a3a' }],
  ['ghost', 'Ghost', 'icon', { icon: 'ghost', bg: '#2a1a4a', fg: '#f0f0ff' }],
  ['diamond', 'Diamond', 'icon', { icon: 'diamond', bg: '#06222a', fg: '#7af0ff' }],
  ['clover', 'Clover', 'icon', { icon: 'clover', bg: '#e8f5e0', fg: '#1e8a3a' }],
  ['sun', 'Sunrise', 'icon', { icon: 'sun', bg: '#ffe9c0', fg: '#e8632b' }],
  ['moon', 'Crescent', 'icon', { icon: 'moon', bg: '#0e1430', fg: '#f0e6a0' }],
  ['anchor', 'Anchor', 'icon', { icon: 'anchor', bg: '#e8eef5', fg: '#14305a' }],
  ['shield', 'Shield', 'icon', { icon: 'shield', bg: '#2a3a4a', fg: '#d8e4f0' }],
  ['sword', 'Blade', 'icon', { icon: 'sword', bg: '#3a0a0a', fg: '#e0e4ea' }],
  ['paw', 'Paw Print', 'icon', { icon: 'paw', bg: '#f5e6d0', fg: '#5a3a1a' }],
];
export const STICKER_FINISHES = [
  { id: 'paper', name: '', rarity: 'standard', mult: 1 },
  { id: 'holo', name: 'Holo', rarity: 'superior', mult: 4 },
  { id: 'foil', name: 'Foil', rarity: 'exotic', mult: 10 },
  { id: 'gold', name: 'Gold', rarity: 'mythic', mult: 30 },
];

// ---------------------------------------------------------------- build defs
function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

const PRICE_BAND = { standard: [8, 40], superior: [40, 180], exotic: [180, 700], mythic: [700, 3000], legendary: [3500, 25000] };

export const SKINS = {};
for (const [weapon, name, rarity, finish, range] of GUN_SKINS) {
  const id = `${weapon}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const [lo, hi] = PRICE_BAND[rarity];
  const h = hashStr(id);
  SKINS[id] = {
    id, kind: 'skin', weapon, name, rarity, finish, floatRange: range || [0, 1],
    basePrice: Math.round(lo + (h % 1000) / 1000 * (hi - lo)), seedOffset: h % 997,
  };
}
for (const [type, label] of Object.entries(KNIFE_TYPES)) {
  if (type === 'standard') continue;
  for (const [fname, finish] of KNIFE_FINISHES) {
    const id = `knife:${type}:${fname.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const h = hashStr(id);
    const [lo, hi] = PRICE_BAND.legendary;
    const typeMult = { karambit: 1.8, butterfly: 1.7, combat: 1.4, bayonet: 1.2, kukri: 1.1 }[type] || 1;
    SKINS[id] = {
      id, kind: 'skin', weapon: `knife:${type}`, knife: type, name: fname, rarity: 'legendary', finish,
      floatRange: finish && finish.type === 'gradient' ? [0, 0.08] : [0, 1],
      basePrice: Math.round((lo + (h % 1000) / 1000 * (hi - lo) * 0.4) * typeMult * (finish ? 1 : 0.7)), seedOffset: h % 997,
    };
  }
}

export const STICKERS = {};
for (const [key, name, style, design] of STICKER_DEFS) {
  for (const f of STICKER_FINISHES) {
    const id = `sticker:${key}:${f.id}`;
    STICKERS[id] = { id, kind: 'sticker', key, name: f.name ? `${name} (${f.name})` : name, style, design, finishType: f.id, rarity: f.rarity, basePrice: Math.round((6 + hashStr(id) % 20) * f.mult) };
  }
}

// ---------------------------------------------------------------- cases
const sk = (w, n) => `${w}:${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
export const CASES = {
  dunehold: {
    id: 'dunehold', name: 'Dunehold Case', price: 120, color: '#c8a46a',
    skins: [sk('ak47', 'Sandstorm Drift'), sk('awp', 'Dune Hunter'), sk('deagle', 'Sun-Bleached'), sk('glock', 'Gravel'), sk('usp', 'Forest Floor'), sk('m4a1', 'Night Pines'),
      sk('ak47', 'Copper Contour'), sk('awp', 'Big Cat'), sk('deagle', 'Pharaoh'),
      sk('deagle', 'Golden Hour'), sk('ak47', 'Black Ink'),
      sk('awp', 'Wildfire')],
    knives: ['bowie', 'kukri', 'navaja'],
  },
  nightfall: {
    id: 'nightfall', name: 'Nightfall Case', price: 160, color: '#5a62c8',
    skins: [sk('m4a1', 'Urban Grid'), sk('usp', 'Gunmetal'), sk('ak47', 'Basalt'), sk('m4a1', 'Carbon Weave'), sk('awp', 'Ash Grey'),
      sk('m4a1', 'Honeycomb'), sk('usp', 'Hive Mind'), sk('usp', 'Contour'),
      sk('m4a1', 'Night Market'), sk('usp', 'Orbit'),
      sk('ak47', 'Event Horizon'), sk('usp', 'Ivory Ink')],
    knives: ['karambit', 'butterfly', 'stiletto'],
  },
  voltage: {
    id: 'voltage', name: 'Voltage Case', price: 140, color: '#3ad0ff',
    skins: [sk('glock', 'Candy Apple'), sk('m4a1', 'Slate Ops'), sk('ak47', 'Heat Shimmer'), sk('glock', 'Mantis'),
      sk('m4a1', 'Signal Trace'), sk('glock', 'Fault Line'), sk('glock', 'Splash Zone'),
      sk('usp', 'Pulse'), sk('awp', 'Volt Line'), sk('m4a1', 'Blueprint'),
      sk('m4a1', 'Static Storm'), sk('deagle', 'Thunderhead')],
    knives: ['flip', 'gut', 'push', 'survival'],
  },
  tidebreak: {
    id: 'tidebreak', name: 'Tidebreak Case', price: 130, color: '#2e9ac8',
    skins: [sk('ak47', 'Rust Belt'), sk('usp', 'Kelp Forest'), sk('deagle', 'Burnished'),
      sk('ak47', 'Tidecaller'), sk('awp', 'Carp Pond'), sk('m4a1', 'Coral Reef'), sk('ak47', 'Jade Serpent'),
      sk('m4a1', 'Glacier Fade'), sk('awp', 'Folded Steel'),
      sk('awp', 'Nebula Swirl')],
    knives: ['bayonet', 'combat', 'tanto'],
  },
  ember: {
    id: 'ember', name: 'Ember Case', price: 180, color: '#e8632b',
    skins: [sk('awp', 'Pit Viper'), sk('deagle', 'Crimson Crackle'),
      sk('ak47', 'Prism Break'), sk('glock', 'Sunset Strip'), sk('glock', 'Wasteland Scrawl'), sk('deagle', 'Magma Flow'), sk('awp', 'Rooftop Tag'), sk('ak47', 'Molten Core'),
      sk('ak47', 'Redline Rally'), sk('glock', 'Tempered Bloom'), sk('awp', 'Cobalt Rally'), sk('deagle', 'Grand Prix'), sk('m4a1', 'Afterburner')],
    knives: ['cleaver', 'karambit', 'kukri', 'bayonet'],
  },
  canvas: {
    id: 'canvas', name: 'Canvas Case', price: 220, color: '#ff8ab8',
    skins: [sk('glock', 'Lagoon'), sk('ak47', 'Distant Peaks'), sk('deagle', 'Flash Sheet'), sk('glock', 'Unit 07'),
      sk('glock', 'Bubblegum'), sk('deagle', 'Root Access'), sk('ak47', 'Koi Garden'), sk('awp', 'Night Ridge'), sk('m4a1', 'Old Ink'),
      sk('ak47', 'Sakura Rush'), sk('m4a1', 'Neon Idol'), sk('awp', 'Moonlit Fox'), sk('usp', 'Oni Princess')],
    knives: ['butterfly', 'karambit', 'flip', 'tanto'],
  },
  street: {
    id: 'street', name: 'Street Case', price: 200, color: '#ffe23a',
    skins: [sk('usp', 'Throw-Up'), sk('glock', 'Splash Zone'), sk('awp', 'Big Cat'),
      sk('m4a1', 'Wildstyle'), sk('deagle', 'Pop Burst'), sk('awp', 'Frame Zero'), sk('usp', 'Sticker Bomb'), sk('glock', 'Wasteland Scrawl'),
      sk('awp', 'Comic Strike'), sk('ak47', 'Collage'), sk('ak47', 'Redline Rally')],
    knives: ['bowie', 'gut', 'push', 'cleaver', 'combat'],
  },
};
// sanity: every listed skin must exist
for (const c of Object.values(CASES)) for (const s of c.skins) if (!SKINS[s]) console.warn('Missing skin in case', c.id, s); // eslint-disable-line no-console

export const STICKER_CAPSULE = { id: 'capsule', name: 'Sticker Capsule', price: 90, color: '#e7b53c' };
export const KEY_PRICE = 250;

export function itemDef(item) {
  if (item.kind === 'skin') return SKINS[item.defId];
  if (item.kind === 'sticker') return STICKERS[item.defId];
  if (item.kind === 'case') return item.defId === 'capsule' ? STICKER_CAPSULE : CASES[item.defId];
  return null;
}

export function itemTitle(item) {
  const d = itemDef(item);
  if (!d) return 'Unknown item';
  if (item.kind === 'skin') {
    const w = d.knife ? KNIFE_TYPES[d.knife] : WEAPON_NAMES[d.weapon];
    return { weapon: (d.knife ? '★ ' : '') + w + (item.tally != null ? ' · Tally' : ''), name: d.name };
  }
  if (item.kind === 'sticker') return { weapon: 'Sticker', name: d.name };
  return { weapon: 'Container', name: d.name };
}
