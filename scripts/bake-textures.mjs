// Bakes the generated surfaces (src/texgen.js) into WebP files in public/textures/,
// so the game loads them instead of spending seconds generating them on start.
// Needs python3 with Pillow for the WebP encoding. Run: npm run bake:textures
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GEN, MATCH_SURFACES, generateArrays } from '../src/texgen.js';

const out = new URL('../public/textures/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'vantage-tex-'));
const jobs = [];
for (const [name, seed] of MATCH_SURFACES) {
  const t0 = Date.now();
  const { size, rgba, normal } = generateArrays(name, seed, 1);
  const base = `${name}-${seed}`;
  writeFileSync(join(tmp, base + '.raw'), rgba);
  jobs.push([join(tmp, base + '.raw'), size, join(out, base + '.webp'), 90]);
  if (normal) {
    writeFileSync(join(tmp, base + '-n.raw'), normal);
    jobs.push([join(tmp, base + '-n.raw'), size, join(out, base + '-n.webp'), 92]);
  }
  console.log(`${base}: ${size}px in ${Date.now() - t0} ms${GEN[name].normal ? ' (+ normal map)' : ''}`);
}
const py = `
import json, sys
from PIL import Image
for raw, size, dst, q in json.loads(sys.argv[1]):
    Image.frombytes('RGBA', (size, size), open(raw, 'rb').read()).convert('RGB').save(dst, 'WEBP', quality=q, method=6)
`;
execFileSync('python3', ['-c', py, JSON.stringify(jobs)], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${jobs.length} files to public/textures/`);
