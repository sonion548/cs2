// Graphics quality for every kind of computer: four presets, an automatic
// pick from the hardware, and dynamic resolution that trades a little
// sharpness for frame rate when a scene gets heavy.
//
//   scale      render resolution relative to the screen (before the pixel-ratio cap)
//   maxDpr     cap on the device pixel ratio (hi-dpi screens cost 2-4x the pixels)
//   msaa       multisample anti-aliasing (set when a match starts)
//   shadows    'off' | 'static' (the map's shadows drawn once) | 'dynamic' (every frame, players too)
//   shadowSize shadow map resolution
//   lodBias    how much sooner characters switch to their simpler models
//   decals     bullet holes kept around
//   skyline    the buildings outside the walls
export const QUALITY = {
  low: { label: 'Low', scale: 0.7, maxDpr: 1, msaa: false, shadows: 'off', shadowSize: 0, lodBias: 1, decals: 40, skyline: false, anisotropy: 1 },
  medium: { label: 'Medium', scale: 0.85, maxDpr: 1, msaa: false, shadows: 'static', shadowSize: 2048, lodBias: 0.5, decals: 90, skyline: true, anisotropy: 2 },
  high: { label: 'High', scale: 1, maxDpr: 1.5, msaa: true, shadows: 'static', shadowSize: 4096, lodBias: 0, decals: 180, skyline: true, anisotropy: 4 },
  ultra: { label: 'Ultra', scale: 1, maxDpr: 2, msaa: true, shadows: 'dynamic', shadowSize: 4096, lodBias: 0, decals: 256, skyline: true, anisotropy: 8 },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

let detected = null;

// A best guess from the GPU name (where the browser reveals it), memory and
// core count. Dynamic resolution corrects whatever this gets wrong.
export function detectQuality() {
  if (detected) return detected;
  let tier = 'high';
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)) || '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* no WebGL info */ }
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(gpu)) tier = 'low';
  else if (/mali|adreno|powervr|videocore|intel\(r\) hd|hd graphics [2-5]\d{2}\b|gma/i.test(gpu)) tier = 'low';
  else if (/intel|uhd|iris|radeon\(tm\) graphics|vega \d+ graphics|apple gpu|apple m1\b/i.test(gpu)) tier = 'medium';
  else if (/rtx [2-9]0[6-9]0|rtx [4-9]0[7-9]0|rx [6-9][7-9]\d{2}|radeon pro w/i.test(gpu)) tier = 'ultra';
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  if ((mem <= 4 || cores <= 4) && tier !== 'low') tier = QUALITY_ORDER[Math.max(0, QUALITY_ORDER.indexOf(tier) - 1)];
  // very large hi-dpi screens push a mid-range GPU hard
  const px = screen.width * screen.height * (window.devicePixelRatio || 1) ** 2;
  if (px > 6e6 && tier === 'ultra') tier = 'high';
  detected = { tier, gpu };
  return detected;
}

export function qualityOf(settings) {
  const key = settings.quality && settings.quality !== 'auto' ? settings.quality : detectQuality().tier;
  return { key, ...(QUALITY[key] || QUALITY.medium) };
}

// Watches frame times and moves the render scale between a floor and the
// preset's own scale: down quickly when frames are slow, back up slowly.
export class DynamicResolution {
  constructor(renderer, q, enabled = true) {
    this.r = renderer;
    this.max = q.scale;
    this.min = Math.max(0.5, q.scale - 0.35);
    this.scale = q.scale;
    this.cap = Math.min(window.devicePixelRatio || 1, q.maxDpr);
    this.enabled = enabled;
    this.acc = 0; this.n = 0; this.t = 0; this.calm = 0;
    this.fps = 0;
    this.apply();
  }

  apply() { this.r.setPixelRatio(this.cap * this.scale); }

  frame(dt) {
    this.acc += dt; this.n++; this.t += dt;
    if (this.t < 1) return;
    const avg = this.acc / this.n;
    this.fps = 1 / avg;
    this.acc = 0; this.n = 0; this.t = 0;
    if (!this.enabled) return;
    if (avg > 1 / 52 && this.scale > this.min + 1e-3) {
      // slow: drop resolution a step, more when it's very slow
      this.scale = Math.max(this.min, this.scale - (avg > 1 / 35 ? 0.15 : 0.08));
      this.calm = -6;
      this.apply();
    } else if (avg < 1 / 58 && this.scale < this.max - 1e-3) {
      // smooth for a while: try a little sharper
      if (++this.calm >= 6) { this.scale = Math.min(this.max, this.scale + 0.05); this.calm = 0; this.apply(); }
    } else this.calm = Math.min(this.calm, 0);
  }
}
