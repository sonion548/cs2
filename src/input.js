// Key bindings. Each action maps to one or two codes: keyboard `KeyboardEvent.code`
// values, or Mouse0–Mouse4 for mouse buttons and WheelUp / WheelDown.

export const ACTIONS = [
  ['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Strafe left'], ['right', 'Strafe right'],
  ['jump', 'Jump'], ['crouch', 'Crouch'], ['walk', 'Walk (quiet)'],
  ['fire', 'Fire'], ['alt', 'Scope / alt fire'], ['reload', 'Reload'], ['use', 'Use · plant · defuse · pick up'], ['drop', 'Drop weapon'],
  ['primary', 'Primary weapon'], ['secondary', 'Pistol'], ['knife', 'Knife'], ['grenade', 'Grenades (press again to cycle)'], ['bomb', 'Bomb'],
  ['lastWeapon', 'Last weapon'], ['inspect', 'Inspect weapon'], ['buy', 'Buy menu'], ['scoreboard', 'Scoreboard'],
];

export const DEFAULT_BINDS = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  jump: ['Space'], crouch: ['ControlLeft', 'KeyC'], walk: ['ShiftLeft'],
  fire: ['Mouse0'], alt: ['Mouse2'], reload: ['KeyR'], use: ['KeyE'], drop: ['KeyG'],
  primary: ['Digit1'], secondary: ['Digit2'], knife: ['Digit3'], grenade: ['Digit4'], bomb: ['Digit5'],
  lastWeapon: ['KeyQ'], inspect: ['KeyF'], buy: ['KeyB'], scoreboard: ['Tab'],
};

export function bindsFrom(settings) {
  const out = {};
  for (const [a] of ACTIONS) out[a] = [...(settings.binds?.[a] || DEFAULT_BINDS[a])];
  return out;
}

// Reverse lookup: code → actions bound to it.
export function actionMap(binds) {
  const m = new Map();
  for (const [a, codes] of Object.entries(binds)) for (const c of codes) if (c) (m.get(c) || m.set(c, []).get(c)).push(a);
  return m;
}

const NAMES = {
  Mouse0: 'Mouse 1', Mouse1: 'Mouse 3', Mouse2: 'Mouse 2', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', WheelUp: 'Wheel up', WheelDown: 'Wheel down',
  ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', AltLeft: 'L-Alt', AltRight: 'R-Alt',
  Space: 'Space', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', Backquote: '`', Escape: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
