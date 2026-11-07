// Item catalogue: original skins, knife finishes, stickers and cases.
import { KNIFE_TYPES } from '../shared/knives.js';
import { WEAPONS } from '../weapons.js';

export const RARITIES = [
  { id: 'standard', name: 'Standard', color: '#4f7cff', odds: 0.7900 },
  { id: 'superior', name: 'Superior', color: '#8c52ff', odds: 0.1600 },
  { id: 'exotic', name: 'Exotic', color: '#d23cd8', odds: 0.0360 },
  { id: 'mythic', name: 'Mythic', color: '#e8423a', odds: 0.0090 },
  { id: 'legendary', name: 'Legendary', color: '#e7b53c', odds: 0.0050 },   // knives (and gloves): 1 in 200
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

export const WEAPON_NAMES = Object.fromEntries(Object.values(WEAPONS).filter(w => w.slot === 1 || w.slot === 2).map(w => [w.id, w.name]));

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

// Finishes for the expanded arsenal, plus extra finishes for the original six.
const MORE_SKINS = [
  // ---- M1911
  ['m1911', 'Parkerized', 'standard', { type: 'paint', base: '#3c3e3a' }],
  ['m1911', 'Walnut Grain', 'standard', { type: 'woodgrain', light: '#a8703c', dark: '#4a2a14' }],
  ['m1911', 'Gilt Crackle', 'superior', { type: 'kintsugi', base: '#16161a' }],
  ['m1911', 'Pattern Steel', 'exotic', { type: 'damascus' }],
  ['m1911', 'Brass Knuckle', 'mythic', { type: 'anodized', base: '#c89a3a', edge: '#5a3a10' }],
  // ---- Five-seveN
  ['fiveseven', 'Graphite', 'standard', { type: 'carbon', base: '#1a1b1e', sheen: '#3c414a' }],
  ['fiveseven', 'Sand Grid', 'standard', { type: 'digital', colors: ['#c8b48a', '#9a8460', '#e0d2b0'] }],
  ['fiveseven', 'Cobalt Anodize', 'superior', { type: 'anodized', base: '#1e4ab8', edge: '#0a1a4a' }],
  ['fiveseven', 'Oil Slick', 'exotic', { type: 'hydro', colors: ['#1a0a3a', '#2a6ac8', '#3ae0a8', '#e8d03a', '#c83a8a'] }],
  ['fiveseven', 'Overclock', 'mythic', { type: 'circuit', base: '#0a0e1a', line: '#3a8aff', glow: '#c8f0ff' }],
  // ---- Skorpion
  ['vz61', 'Olive Drab', 'standard', { type: 'paint', base: '#4a5236' }],
  ['vz61', 'Brick Dust', 'standard', { type: 'camo', colors: ['#8a4a32', '#5a2e1e', '#b8805a'] }],
  ['vz61', 'Wasp', 'superior', { type: 'tiger', base: '#e8c02a', stripe: '#141414', freq: 16 }],
  ['vz61', 'Scorch Marks', 'exotic', { type: 'flames', base: '#1a1410' }],
  ['vz61', 'Venom', 'mythic', { type: 'snake', base: '#1e6a2a', mark: '#d8f04a', dark: '#06140a' }],
  // ---- .357 Revolver
  ['revolver', 'Nickel', 'standard', { type: 'paint', base: '#a8acb2' }],
  ['revolver', 'Ironwood', 'standard', { type: 'woodgrain', light: '#7a4a2a', dark: '#2a160a' }],
  ['revolver', 'Engraved', 'superior', { type: 'damascus', light: '#d8c8a0', dark: '#6a5a3a', layers: 20 }],
  ['revolver', 'Ruby Fade', 'exotic', { type: 'gradient', colors: ['#ffd0d8', '#e83a5a', '#8a0a2a', '#2a0410'] }, [0, 0.08]],
  ['revolver', 'High Noon', 'mythic', { type: 'landscape', sky: ['#ffe0a0', '#ff9a4a', '#c84a2a'], sun: '#fff6d0', layers: ['#c87a4a', '#9a4a2a', '#6a2a1a', '#3a140a'] }],
  // ---- MAC-10
  ['mac10', 'Rust Bucket', 'standard', { type: 'camo', colors: ['#6a3a1e', '#9a5a2e', '#3a2414'] }],
  ['mac10', 'Highlighter', 'standard', { type: 'paint', base: '#d8e03a', accent: '#1a1a1a' }],
  ['mac10', 'Candy Swirl', 'superior', { type: 'hydro', colors: ['#ff8ac8', '#ffffff', '#8ad8ff'] }],
  ['mac10', 'Glitch', 'exotic', { type: 'neon', base: '#08080c', colors: ['#ff2a6a', '#2affd0'] }],
  ['mac10', 'Riot', 'mythic', { type: 'graffiti', base: '#1e1e1e', colors: ['#ff4a1a', '#ffe23a', '#3ad0ff', '#ffffff'], words: ['RIOT', 'NO RULES'] }],
  // ---- MP5
  ['mp5', 'Field Grey', 'standard', { type: 'paint', base: '#5a5e60' }],
  ['mp5', 'Woodland', 'standard', { type: 'camo', colors: ['#3a4a2a', '#5a6a3a', '#2a2018', '#7a7a4a'] }],
  ['mp5', 'Ice Floe', 'superior', { type: 'marble', base: '#e8f0f6', vein: '#5a8ab0', vein2: '#b0c8dc' }],
  ['mp5', 'Tidepool', 'exotic', { type: 'waves', deep: '#062a3a', mid: '#1a8aa0', foam: '#e0fff8' }],
  ['mp5', 'Hard Light', 'mythic', { type: 'lightning', base: '#0e0a1e', base2: '#2a0a3a', bolt: '#e8a0ff' }],
  // ---- MP7
  ['mp7', 'Charcoal', 'standard', { type: 'carbon', base: '#141416', sheen: '#2e3238' }],
  ['mp7', 'Urban Fade', 'standard', { type: 'digital', colors: ['#7a7e84', '#4a4e54', '#a8acb2'] }],
  ['mp7', 'Hornet', 'superior', { type: 'hex', base: '#141414', line: '#e8b81a', glow: '#ffe07a', size: 16 }],
  ['mp7', 'Arc Flash', 'exotic', { type: 'lightning', base: '#0a1420', base2: '#0a2a3a', bolt: '#9af0ff' }],
  ['mp7', 'Starfall', 'mythic', { type: 'galaxy', colors: ['#05050f', '#1a0a4a', '#8a3ae0', '#ffe0ff'] }],
  // ---- UMP-45
  ['ump45', 'Desert Tan', 'standard', { type: 'paint', base: '#a89068' }],
  ['ump45', 'Gravel Pit', 'standard', { type: 'digital', colors: ['#6a645a', '#8a8478', '#4a463e'] }],
  ['ump45', 'Oxide', 'superior', { type: 'lava', base: '#1a1410', hot: '#c85a1a', core: '#f0a03a' }],
  ['ump45', 'Royal Marble', 'exotic', { type: 'marble', base: '#1a1430', vein: '#e8c86a', vein2: '#4a3a7a' }],
  ['ump45', 'Shogun', 'mythic', { type: 'scales', base: '#a81a1a', edge: '#1a0a0a', size: 16 }],
  // ---- Vector
  ['vector', 'Arctic', 'standard', { type: 'camo', colors: ['#e8ecf0', '#b0b8c0', '#808890'] }],
  ['vector', 'Blackout', 'standard', { type: 'paint', base: '#18191b' }],
  ['vector', 'Laser Grid', 'superior', { type: 'circuit', base: '#100818', line: '#c83aff', glow: '#ffb0ff' }],
  ['vector', 'Riptide', 'exotic', { type: 'hydro', colors: ['#0a1a3a', '#1a6ac8', '#3ae0ff', '#f0ffff'] }],
  ['vector', 'Afterimage', 'mythic', { type: 'neon', base: '#06060a', colors: ['#3affe0', '#ff3ad0', '#fff03a'] }],
  // ---- P90
  ['p90', 'Dust Storm', 'standard', { type: 'camo', colors: ['#c8b088', '#a08860', '#e8d8b8'], scale: 3 }],
  ['p90', 'Teal Line', 'standard', { type: 'paint', base: '#1e5a5a', accent: '#e8e0c8' }],
  ['p90', 'Bumblebee', 'superior', { type: 'hex', base: '#1a1a1a', line: '#ffd21a', glow: '#fff08a', size: 22 }],
  ['p90', 'Neon Rider', 'exotic', { type: 'livery', base: '#0a0a12', band: '#ff3aa8', band2: '#3ad0ff', number: 90 }],
  ['p90', 'Dreamscape', 'mythic', { type: 'swirl', colors: ['#2a0a4a', '#8a3ac8', '#ff8ad8', '#fff0a8', '#3ae0ff'] }],
  // ---- Galil
  ['galil', 'Savanna', 'standard', { type: 'camo', colors: ['#b8a070', '#8a7448', '#d8c8a0', '#5a4a2a'] }],
  ['galil', 'Iron Grey', 'standard', { type: 'paint', base: '#4a4c50', accent: '#c8c8c8' }],
  ['galil', 'Leopard', 'superior', { type: 'spots', base: '#e0b878', spot: '#8a5a2a', ring: '#1a0e06' }],
  ['galil', 'Copper Patina', 'exotic', { type: 'marble', base: '#3a8a7a', vein: '#c87a3a', vein2: '#a8e0d0' }],
  ['galil', 'Firestarter', 'mythic', { type: 'flames', base: '#120c0a', colors: ['#ff3a1a', '#ffa01a', '#fff0a0'] }],
  // ---- FAMAS
  ['famas', 'Pine Needle', 'standard', { type: 'camo', colors: ['#2a3a24', '#4a5a34', '#1a2014'] }],
  ['famas', 'Steel Blue', 'standard', { type: 'paint', base: '#2a4a6a' }],
  ['famas', 'Circuit Rider', 'superior', { type: 'circuit', base: '#0a1410', line: '#3ac86a', glow: '#b0ffc8' }],
  ['famas', 'Ripple', 'exotic', { type: 'waves', deep: '#0a1a2a', mid: '#3a6aa0', foam: '#e8f4ff' }],
  ['famas', 'Grand Tour', 'mythic', { type: 'livery', base: '#f0ece0', band: '#1a4ac8', band2: '#e8203a', number: 25 }],
  // ---- SCAR-H
  ['scarh', 'Flat Dark Earth', 'standard', { type: 'paint', base: '#6a5a44' }],
  ['scarh', 'Multiterrain', 'standard', { type: 'camo', colors: ['#8a8058', '#5a5236', '#b0a47a', '#3a3424'] }],
  ['scarh', 'Hex Plate', 'superior', { type: 'hex', base: '#2a2c30', line: '#7a8088', glow: '#c8d0d8', size: 18 }],
  ['scarh', 'Volcanic', 'exotic', { type: 'lava', base: '#141010', hot: '#ff4a14', core: '#ffe06a' }],
  ['scarh', 'Gilded Age', 'mythic', { type: 'damascus', light: '#f0d070', dark: '#5a3a10', layers: 28 }],
  // ---- SG 550
  ['sg550', 'Alpine', 'standard', { type: 'camo', colors: ['#e8ecf0', '#5a6a5a', '#2a3a2a'] }],
  ['sg550', 'Gunmetal Grey', 'standard', { type: 'paint', base: '#3e4246' }],
  ['sg550', 'Contour Map', 'superior', { type: 'topo', base: '#1a2a1a', line: '#8ac86a' }],
  ['sg550', 'Glass Cannon', 'exotic', { type: 'shards', colors: ['#0a1a2a', '#1a4a6a', '#3a8ac8', '#a8e0ff', '#ffffff'] }],
  ['sg550', 'Crown Jewel', 'mythic', { type: 'kintsugi', base: '#1a0a3a', gold: '#f0c84a' }],
  // ---- AUG
  ['aug', 'Sage', 'standard', { type: 'paint', base: '#7a8a6a' }],
  ['aug', 'Splinter', 'standard', { type: 'digital', colors: ['#5a6a4a', '#3a4a2a', '#8a9a6a', '#2a2a1a'] }],
  ['aug', 'Ocean Anodize', 'superior', { type: 'anodized', base: '#1a8aa8', edge: '#0a2a4a' }],
  ['aug', 'Northern Lights', 'exotic', { type: 'gradient', colors: ['#0a1a2a', '#1a6a5a', '#3ae0a0', '#c8a0ff'] }],
  ['aug', 'Crystal Lattice', 'mythic', { type: 'shards', colors: ['#1a0a2a', '#4a1a6a', '#a03ac8', '#e8a0ff', '#ffffff'] }],
  // ---- Scout
  ['scout', 'Hunter Green', 'standard', { type: 'paint', base: '#2a4a2a' }],
  ['scout', 'Birchwood', 'standard', { type: 'woodgrain', light: '#d8c0a0', dark: '#8a6a4a', rings: 30 }],
  ['scout', 'Falcon', 'superior', { type: 'scales', base: '#c8b088', edge: '#3a2a1a', size: 12 }],
  ['scout', 'Frostbite', 'exotic', { type: 'marble', base: '#f0f6ff', vein: '#3a6ac8', vein2: '#a8c8f0' }],
  ['scout', 'Lone Wolf', 'mythic', { type: 'landscape', sky: ['#0a0a1a', '#1a1a4a', '#4a3a8a'], sun: '#f0f0ff', stars: true, layers: ['#2a2a4a', '#1a1a3a', '#0e0e24', '#06060e'] }],
  // ---- SR-25
  ['dmr', 'Tan Polymer', 'standard', { type: 'paint', base: '#a08a68' }],
  ['dmr', 'Midnight', 'standard', { type: 'camo', colors: ['#1a1e2a', '#2a3040', '#0e1018'] }],
  ['dmr', 'Damask', 'superior', { type: 'damascus', light: '#b8bcc4', dark: '#2a2c32' }],
  ['dmr', 'Solar Flare', 'exotic', { type: 'swirl', colors: ['#2a0a00', '#c83a0a', '#ff9a1a', '#fff0a0'] }],
  ['dmr', 'Monarch', 'mythic', { type: 'hydro', colors: ['#1a0a00', '#e86a0a', '#ffb01a', '#141414', '#ffffff'] }],
  // ---- Double Barrel
  ['dbarrel', 'Case Hardened', 'standard', { type: 'hydro', colors: ['#3a4a6a', '#8a6a3a', '#5a3a6a', '#a8a8a8'] }],
  ['dbarrel', 'Old Oak', 'standard', { type: 'woodgrain', light: '#9a6a3a', dark: '#3a2010' }],
  ['dbarrel', 'Buckshot', 'superior', { type: 'spots', base: '#2a2a2a', spot: '#6a6a6a', ring: '#0a0a0a' }],
  ['dbarrel', 'Moonshine', 'exotic', { type: 'gradient', colors: ['#f0f0d0', '#c8a85a', '#6a4a1a', '#1a1006'] }],
  ['dbarrel', 'Outlaw', 'mythic', { type: 'tattoo', bg: '#e8d8b8', motto: 'LAST CALL' }],
  // ---- M870
  ['pump', 'Black Synthetic', 'standard', { type: 'paint', base: '#1c1c1e' }],
  ['pump', 'Marsh', 'standard', { type: 'camo', colors: ['#4a4a2a', '#6a6a3a', '#2a2a1a', '#8a7a4a'] }],
  ['pump', 'Blaze', 'superior', { type: 'tiger', base: '#ff6a1a', stripe: '#1a0a04', freq: 10 }],
  ['pump', 'Swamp Thing', 'exotic', { type: 'snake', base: '#3a5a1a', mark: '#a8c83a', dark: '#0a1404' }],
  ['pump', 'Thunder Road', 'mythic', { type: 'livery', base: '#141414', band: '#e8203a', band2: '#f0f0f0', number: 87 }],
  // ---- M1014
  ['m1014', 'Urban', 'standard', { type: 'digital', colors: ['#5a5e64', '#3a3e44', '#8a8e94'] }],
  ['m1014', 'Sandbar', 'standard', { type: 'paint', base: '#b8a07a' }],
  ['m1014', 'Breaker', 'superior', { type: 'shards', colors: ['#1a1a1a', '#3a3a3a', '#6a6a6a', '#e8c03a'] }],
  ['m1014', 'Molten Steel', 'exotic', { type: 'lava', base: '#1a1a1e', hot: '#ff7a1a', core: '#fff0b0' }],
  ['m1014', 'Pop Shot', 'mythic', { type: 'comic', bg: '#ff8ad0', dots: '#3a1a8a', words: ['BOOM!', 'KA-POW!'] }],
  // ---- M249
  ['m249', 'Ranger', 'standard', { type: 'paint', base: '#4a5a3a' }],
  ['m249', 'Barricade', 'standard', { type: 'digital', colors: ['#7a6a4a', '#5a4a32', '#a8987a'] }],
  ['m249', 'Ammo Belt', 'superior', { type: 'carbon', base: '#2a2418', sheen: '#8a6a2a' }],
  ['m249', 'Hail Storm', 'exotic', { type: 'lightning', base: '#1a1e24', base2: '#2a3a4a', bolt: '#f0f8ff' }],
  ['m249', 'Siege Engine', 'mythic', { type: 'mecha', base: '#c8c4b8', c1: '#e8632b', c2: '#1a1a1a', code: '249' }],
  // ---- PKM
  ['pkm', 'Steppe', 'standard', { type: 'camo', colors: ['#9a8a5a', '#6a5a3a', '#c8b88a'] }],
  ['pkm', 'Red Oak', 'standard', { type: 'woodgrain', light: '#a85a2a', dark: '#4a1a0a' }],
  ['pkm', 'Tundra', 'superior', { type: 'digital', colors: ['#e0e4e8', '#9aa0a8', '#5a6068'] }],
  ['pkm', 'Iron Curtain', 'exotic', { type: 'folded', base: '#8a8e94', dark: '#2a2c30' }],
  ['pkm', 'Bear Claw', 'mythic', { type: 'ink', base: '#efe8d8', ink: '#141414', accent: '#a81a1a' }],
  // ---- M4A1-S
  ['m4a1s', 'Quiet Hours', 'standard', { type: 'digital', colors: ['#3a4250', '#252a33', '#6a7686', '#14171c'] }],
  ['m4a1s', 'Dusk Patrol', 'standard', { type: 'camo', colors: ['#6a5a4a', '#3e3428', '#9a8a70', '#24201a'] }],
  ['m4a1s', 'Night Cipher', 'superior', { type: 'circuit', base: '#0c1416', line: '#1e7a6a', glow: '#5affd2' }],
  ['m4a1s', 'Moonwake', 'exotic', { type: 'waves', deep: '#070d24', mid: '#2a3e8a', foam: '#d8e4ff' }],
  ['m4a1s', 'Velvet Ghost', 'exotic', { type: 'gradient', colors: ['#f2e8ff', '#a87ae8', '#4a1e8a', '#0e0620'] }, [0, 0.08]],
  ['m4a1s', 'Hush Protocol', 'mythic', { type: 'mecha', base: '#d8dce0', c1: '#2a8aff', c2: '#101418', code: 'A1-S' }],
  // ---- Negev
  ['negev', 'Sandbar', 'standard', { type: 'camo', colors: ['#c2a878', '#9a7f52', '#e0cfa4', '#6c5636'] }],
  ['negev', 'Bunker', 'standard', { type: 'paint', base: '#4a5038', accent: '#a8a070' }],
  ['negev', 'Lattice', 'superior', { type: 'hex', base: '#1a1d22', line: '#e8b23a', glow: '#ffd87a', size: 18 }],
  ['negev', 'Thunderhead', 'exotic', { type: 'lightning', base: '#141a26', base2: '#2a1a3a', bolt: '#e8f4ff' }],
  ['negev', 'Lionheart', 'mythic', { type: 'mecha', base: '#e8c84a', c1: '#a81a1a', c2: '#141414', code: 'NG-7' }],
  // ---- more for the original six
  ['ak47', 'Steelwork', 'standard', { type: 'damascus' }],
  ['ak47', 'Bloodwood', 'superior', { type: 'woodgrain', light: '#8a2a1a', dark: '#2a0806', rings: 18 }],
  ['ak47', 'Gold Seam', 'exotic', { type: 'kintsugi', base: '#121214' }],
  ['m4a1', 'Anodized Red', 'standard', { type: 'anodized', base: '#a81a1a', edge: '#3a0606' }],
  ['m4a1', 'Ivory Marble', 'superior', { type: 'marble', base: '#f4f0e8', vein: '#4a4a52', vein2: '#c8c0b0' }],
  ['m4a1', 'Petrol', 'exotic', { type: 'hydro', colors: ['#0a0a1a', '#3a1a8a', '#1aa8a8', '#e8d03a'] }],
  ['awp', 'Viper Steel', 'standard', { type: 'damascus', light: '#a8b0a0', dark: '#2a3024' }],
  ['awp', 'Heirloom', 'superior', { type: 'woodgrain', light: '#b07a42', dark: '#4a2812' }],
  ['awp', 'Obsidian Vein', 'exotic', { type: 'marble', base: '#0e0e12', vein: '#c83aff', vein2: '#2a1a3a' }],
  ['glock', 'Anodized Teal', 'standard', { type: 'anodized', base: '#1a8a8a', edge: '#0a3030' }],
  ['glock', 'Mosaic', 'superior', { type: 'kintsugi', base: '#e8e0d0', gold: '#2a6ac8' }],
  ['glock', 'Ripcurl', 'exotic', { type: 'hydro', colors: ['#ff6a3a', '#ffd23a', '#3ac8ff', '#1a1a4a'] }],
  ['usp', 'Bone', 'standard', { type: 'marble', base: '#e8e0cc', vein: '#9a8a6a', vein2: '#c8bca0' }],
  ['usp', 'Blued Steel', 'superior', { type: 'damascus', light: '#6a8ab8', dark: '#141e30' }],
  ['usp', 'Purple Haze', 'exotic', { type: 'anodized', base: '#6a1ab8', edge: '#1a0a3a' }],
  ['deagle', 'Ebony', 'standard', { type: 'woodgrain', light: '#3a2a1a', dark: '#0a0604' }],
  ['deagle', 'Gold Crack', 'superior', { type: 'kintsugi', base: '#1a1a1a', gold: '#ffd04a' }],
  ['deagle', 'Chrome Swirl', 'exotic', { type: 'hydro', colors: ['#e8ecf0', '#8a9098', '#2a2e34', '#c8d0d8'] }],
];
GUN_SKINS.push(...MORE_SKINS);

const KNIFE_FINISHES = [
  ['Vanilla', null],
  ['Tempered Bloom', { type: 'tempered' }],
  ['Folded Steel', { type: 'folded', base: '#b0b6be', dark: '#2e3238' }],
  ['Glacier Fade', { type: 'gradient', colors: ['#e9f6ff', '#6cc4f0', '#2a4cc0', '#160f40'] }],
  ['Sunset Fade', { type: 'gradient', colors: ['#ffe07a', '#ff7a3a', '#c41e6a', '#3a0f5a'] }],
  ['Nebula Swirl', { type: 'swirl', colors: ['#1a0f3a', '#6a2ab8', '#ff5ac8', '#ffd0f0', '#3ad0ff'], phases: true }],
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
  ['Damascus Steel', { type: 'damascus' }],
  ['Black Marble', { type: 'marble', base: '#101014', vein: '#d8d8e0', vein2: '#2a2a34' }],
  ['Gold Vein', { type: 'kintsugi', base: '#141416' }],
  ['Hydro Dip', { type: 'hydro', colors: ['#1a0a3a', '#e8203a', '#ffd23a', '#3ad0ff'] }],
  // phases and gems come from the pattern template (patterns.js)
  ['Doppler Wave', { type: 'doppler' }],
  ['Gamma Wave', { type: 'doppler', variant: 'gamma' }],
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

// legendary (knives) was 3,500-25,000, so a good knife took about 8 matches of credits
const PRICE_BAND = { standard: [8, 40], superior: [40, 180], exotic: [180, 700], mythic: [700, 3000], legendary: [15750, 112500] };

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
    const typeMult = { karambit: 1.8, butterfly: 1.7, skeleton: 1.5, combat: 1.4, bayonet: 1.2, kukri: 1.1, hawkbill: 1.1 }[type] || 1;
    SKINS[id] = {
      id, kind: 'skin', weapon: `knife:${type}`, knife: type, name: fname, rarity: 'legendary', finish,
      floatRange: finish && (finish.type === 'gradient' || finish.type === 'doppler') ? [0, 0.08] : [0, 1],
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
    knives: ['karambit', 'butterfly', 'stiletto', 'skeleton'],
  },
  voltage: {
    id: 'voltage', name: 'Voltage Case', price: 140, color: '#3ad0ff',
    skins: [sk('glock', 'Candy Apple'), sk('m4a1', 'Slate Ops'), sk('ak47', 'Heat Shimmer'), sk('glock', 'Mantis'),
      sk('m4a1', 'Signal Trace'), sk('glock', 'Fault Line'), sk('glock', 'Splash Zone'),
      sk('usp', 'Pulse'), sk('awp', 'Volt Line'), sk('m4a1', 'Blueprint'),
      sk('m4a1', 'Static Storm'), sk('deagle', 'Thunderhead')],
    knives: ['flip', 'gut', 'push', 'survival', 'hawkbill'],
  },
  tidebreak: {
    id: 'tidebreak', name: 'Tidebreak Case', price: 130, color: '#2e9ac8',
    skins: [sk('ak47', 'Rust Belt'), sk('usp', 'Kelp Forest'), sk('deagle', 'Burnished'),
      sk('ak47', 'Tidecaller'), sk('awp', 'Carp Pond'), sk('m4a1', 'Coral Reef'), sk('ak47', 'Jade Serpent'),
      sk('m4a1', 'Glacier Fade'), sk('awp', 'Folded Steel'),
      sk('awp', 'Nebula Swirl')],
    knives: ['bayonet', 'combat', 'tanto', 'trench'],
  },
  ember: {
    id: 'ember', name: 'Ember Case', price: 180, color: '#e8632b',
    skins: [sk('awp', 'Pit Viper'), sk('deagle', 'Crimson Crackle'),
      sk('ak47', 'Prism Break'), sk('glock', 'Sunset Strip'), sk('glock', 'Wasteland Scrawl'), sk('deagle', 'Magma Flow'), sk('awp', 'Rooftop Tag'), sk('ak47', 'Molten Core'),
      sk('ak47', 'Redline Rally'), sk('glock', 'Tempered Bloom'), sk('awp', 'Cobalt Rally'), sk('deagle', 'Grand Prix'), sk('m4a1', 'Afterburner')],
    knives: ['survival', 'karambit', 'kukri', 'bayonet'],
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
    knives: ['bowie', 'gut', 'push', 'navaja', 'combat'],
  },
  workshop: {
    id: 'workshop', name: 'Workshop Case', price: 190, color: '#a8703c',
    skins: [sk('ak47', 'Steelwork'), sk('m4a1', 'Anodized Red'), sk('awp', 'Viper Steel'), sk('glock', 'Anodized Teal'), sk('usp', 'Bone'), sk('deagle', 'Ebony'),
      sk('ak47', 'Bloodwood'), sk('m4a1', 'Ivory Marble'), sk('awp', 'Heirloom'), sk('glock', 'Mosaic'), sk('usp', 'Blued Steel'), sk('deagle', 'Gold Crack'),
      sk('ak47', 'Gold Seam'), sk('m4a1', 'Petrol'), sk('awp', 'Obsidian Vein'), sk('glock', 'Ripcurl'), sk('usp', 'Purple Haze'), sk('deagle', 'Chrome Swirl')],
    knives: ['bowie', 'stiletto', 'tanto', 'navaja', 'cord'],
  },
};
// The expanded arsenal's finishes go into the existing cases, matched by look
// (desert camo to Dunehold, fire to Ember, street art to Street...), with a cap
// so every case gains about the same number.
const NEW_GUNS = ['m1911', 'fiveseven', 'vz61', 'revolver', 'mac10', 'mp5', 'mp7', 'ump45', 'vector', 'p90',
  'galil', 'famas', 'scarh', 'sg550', 'aug', 'scout', 'dmr', 'dbarrel', 'pump', 'm1014', 'm249', 'pkm', 'm4a1s', 'negev'];
const CASE_THEME = {
  camo: 'dunehold', digital: 'dunehold', spots: 'dunehold', tiger: 'dunehold', topo: 'dunehold',
  carbon: 'nightfall', hex: 'nightfall', galaxy: 'nightfall', swirl: 'nightfall', paint: 'nightfall',
  circuit: 'voltage', lightning: 'voltage', neon: 'voltage', anodized: 'voltage',
  waves: 'tidebreak', scales: 'tidebreak', snake: 'tidebreak', marble: 'tidebreak', gradient: 'tidebreak',
  lava: 'ember', flames: 'ember', shards: 'ember',
  landscape: 'canvas', tattoo: 'canvas', ink: 'canvas', mecha: 'canvas', koi: 'canvas',
  graffiti: 'street', comic: 'street', livery: 'street', hydro: 'street',
  damascus: 'workshop', woodgrain: 'workshop', kintsugi: 'workshop', folded: 'workshop',
};
{
  const ids = Object.keys(CASES), added = Object.fromEntries(ids.map(id => [id, 0]));
  const newSkins = MORE_SKINS.filter(([w]) => NEW_GUNS.includes(w));
  const cap = Math.ceil(newSkins.length / ids.length) + 2;
  for (const [w, n, , finish] of newSkins) {
    let cid = CASE_THEME[finish.type] || ids[0];
    if (added[cid] >= cap) cid = ids.reduce((a, b) => (added[b] < added[a] ? b : a));
    CASES[cid].skins.push(sk(w, n)); added[cid]++;
  }
}
// sanity: every listed skin must exist
for (const c of Object.values(CASES)) for (const s of c.skins) if (!SKINS[s]) console.warn('Missing skin in case', c.id, s); // eslint-disable-line no-console

export const STICKER_CAPSULE = { id: 'capsule', name: 'Sticker Capsule', price: 90, color: '#e7b53c' };
// A gift every player gets once: opens without a key into a guaranteed knife
// (or gloves). It can't be bought or sold.
export const GOLD_CASE = { id: 'gold', name: 'Gold Case', price: 0, color: '#e7b53c', gold: true };
// Every gun finish in the game in one case (and every knife type), for a
// little more than any other case.
CASES.universal = {
  id: 'universal', name: 'Universal Case', color: '#a58aff',
  price: Math.max(...Object.values(CASES).map(c => c.price)) + 40,
  skins: Object.values(SKINS).filter(s => !s.knife).map(s => s.id),
  knives: Object.keys(KNIFE_TYPES).filter(k => k !== 'standard'),
};
export const KEY_PRICE = 250;

export function itemDef(item) {
  if (item.kind === 'skin') return SKINS[item.defId];
  if (item.kind === 'sticker') return STICKERS[item.defId];
  if (item.kind === 'case') return item.defId === 'capsule' ? STICKER_CAPSULE : item.defId === 'gold' ? GOLD_CASE : CASES[item.defId];
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
