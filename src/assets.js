// Loads the Blender-built models (public/models/*.glb) once at startup.
// Everything that uses them falls back to the procedural versions if a file is
// missing or fails to load, so the game still runs without the assets.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'models/';
const WEAPONS = ['ak47', 'm4a1', 'awp', 'glock', 'usp', 'deagle'];
const KNIVES = ['standard', 'bayonet', 'combat', 'karambit', 'butterfly', 'flip', 'gut', 'bowie', 'push', 'navaja', 'stiletto', 'kukri', 'tanto', 'survival', 'cleaver'];
const MAPS = ['dunehold'];
const CHARACTERS = ['t', 'ct'];

export const assets = { weapons: {}, maps: {}, colliders: {}, characters: {} };

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  const jobs = [
    ...WEAPONS.map(id => [id, `weapons/${id}.glb`, (g) => { assets.weapons[id] = g.scene; }]),
    ...KNIVES.map(k => [`knife:${k}`, `weapons/knife_${k}.glb`, (g) => { assets.weapons[`knife:${k}`] = g.scene; }]),
    ...MAPS.map(m => [m, `maps/${m}.glb`, (g) => { assets.maps[m] = g.scene; }]),
    ...CHARACTERS.map(c => [`char:${c}`, `characters/${c}.glb`, (g) => { assets.characters[c] = g.scene; }]),
  ];
  let done = 0;
  const total = jobs.length + MAPS.length;
  const tick = () => onProgress(++done / total);
  await Promise.all([
    ...jobs.map(([, path, store]) => loader.loadAsync(BASE + path).then(store).catch(() => {}).finally(tick)),
    ...MAPS.map(m => fetch(BASE + `maps/${m}.colliders.json`).then(r => (r.ok ? r.json() : null)).then(c => { if (c) assets.colliders[m] = c; }).catch(() => {}).finally(tick)),
  ]);
  return assets;
}
