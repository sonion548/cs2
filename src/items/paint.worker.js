// Paints skin textures off the main thread. Painting a finish at full size
// takes up to a few seconds on slower machines; done on the page mid-match
// (a bot switching to a skinned gun, picking up a gun) it froze the game.
import { SKINS } from './catalog.js';
import { paintFinish } from './finishes.js';
import { applyWear } from './wear.js';

self.onmessage = async (e) => {
  const { id, defId, float, seed, size } = e.data;
  try {
    const def = SKINS[defId];
    const { canvas, metal, rough } = paintFinish(def, seed, size, size / 2);
    applyWear(canvas, float, seed + (def.seedOffset || 0));
    // flipped here, because WebGL doesn't flip ImageBitmaps on upload the way it does canvases
    const bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY' });
    self.postMessage({ id, bitmap, metal, rough }, [bitmap]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
