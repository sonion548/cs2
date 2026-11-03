// Texture worker: generates surfaces off the main thread (several run in parallel).
import { generateArrays } from './texgen.js';

self.onmessage = (e) => {
  const { id, name, seed, scale } = e.data;
  try {
    const { size, rgba, normal } = generateArrays(name, seed, scale);
    const transfer = [rgba.buffer];
    if (normal) transfer.push(normal.buffer);
    self.postMessage({ id, size, rgba, normal }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
