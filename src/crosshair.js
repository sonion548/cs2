// Crosshair drawn on a small canvas from the player's settings. Shared by the
// HUD and the settings page preview.

export const DEFAULT_CROSSHAIR = {
  style: 'dynamic',      // 'dynamic' opens with movement/firing, 'static' never moves
  length: 6, thickness: 2, gap: 3,
  color: '#4dff6a', alpha: 1,
  outline: true, outlineThickness: 1,
  dot: false, tStyle: false,
};

export function crosshairFrom(settings) {
  const c = { ...DEFAULT_CROSSHAIR, ...(settings.crosshair || {}) };
  // older saves kept a few loose keys
  if (!settings.crosshair) {
    if (settings.crosshairColor) c.color = settings.crosshairColor;
    if (settings.crosshairSize) c.length = settings.crosshairSize;
    if (settings.crosshairDot) c.dot = true;
  }
  return c;
}

// spread: extra gap in pixels for dynamic crosshairs.
export function drawCrosshair(canvas, cfg, spread = 0) {
  const gap = Math.round(cfg.gap + (cfg.style === 'dynamic' ? spread : 0));
  const L = Math.round(cfg.length), T = Math.max(1, Math.round(cfg.thickness)), O = cfg.outline ? Math.max(1, Math.round(cfg.outlineThickness)) : 0;
  const size = 2 * (gap + L + O + 2) + T;
  if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
  const x = canvas.getContext('2d');
  x.clearRect(0, 0, size, size);
  const c = Math.floor(size / 2) - Math.floor(T / 2);   // top-left of the centre pixel block
  const rects = [
    [c - gap - L, c, L, T], [c + T + gap, c, L, T],
    [c, c + T + gap, T, L],
  ];
  if (!cfg.tStyle) rects.push([c, c - gap - L, T, L]);
  if (cfg.dot) rects.push([c, c, T, T]);
  x.globalAlpha = cfg.alpha;
  if (O) {
    x.fillStyle = '#000';
    for (const [rx, ry, rw, rh] of rects) x.fillRect(rx - O, ry - O, rw + 2 * O, rh + 2 * O);
  }
  x.fillStyle = cfg.color;
  for (const [rx, ry, rw, rh] of rects) x.fillRect(rx, ry, rw, rh);
  x.globalAlpha = 1;
}
