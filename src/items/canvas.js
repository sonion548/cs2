// A 2D canvas that works both on the page and inside a worker, so skins can
// be painted off the main thread (see paint.worker.js).
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
