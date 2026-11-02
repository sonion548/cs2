// In-match money: round rewards, kill rewards and purchases. (The item
// economy for skins and cases lives in shared/economy.js.)
import { WEAPONS, GEAR, MAX_NADES, WeaponState, usableBy } from '../weapons.js';

export const ECON = {
  start: 1000, max: 15000,
  win: 3000, winObjective: 3300,
  lossBase: 1500, lossStep: 400, lossMax: 3100,
  plantBonus: 600, planter: 300, defuser: 300,
  buyTime: 20, buyRadius: 14,
};

export function lossBonus(streak) { return Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * Math.max(0, streak - 1)); }
export function addMoney(ch, n) { ch.money = Math.max(0, Math.min(ECON.max, (ch.money || 0) + n)); }

// What the item costs this character right now (a helmet alone is cheaper when they already wear a vest).
export function priceFor(ch, id) {
  if (id === 'vesthelm' && ch.armor >= 100 && !ch.helmet) return 350;
  return (WEAPONS[id] || GEAR[id])?.price ?? 0;
}

// Reason the item can't be bought, or null.
export function buyBlock(ch, id) {
  const d = WEAPONS[id] || GEAR[id];
  if (!d || d.price == null) return 'Not for sale';
  if (!usableBy(id, ch.team)) return 'Other side only';
  if (id === 'vest' && ch.armor >= 100) return 'Already armoured';
  if (id === 'vesthelm' && ch.armor >= 100 && ch.helmet) return 'Already armoured';
  if (id === 'kit' && ch.hasKit) return 'Already carrying one';
  if (d.type === 'grenade') {
    if (ch.nades.filter(n => n === id).length >= (d.max || 1)) return 'Carrying the maximum';
    if (ch.nades.length >= MAX_NADES) return 'Grenade slots full';
  }
  if ((d.slot === 1 || d.slot === 2) && ch.weapons[d.slot]?.id === id) return 'Already holding it';
  if (priceFor(ch, id) > ch.money) return 'Not enough money';
  return null;
}

// Applies a purchase. Returns { error } or { ok, dropped } where dropped is the
// weapon it replaced (the caller drops it on the ground).
export function applyBuy(ch, id) {
  const block = buyBlock(ch, id);
  if (block) return { error: block };
  const d = WEAPONS[id] || GEAR[id];
  ch.money -= priceFor(ch, id);
  let dropped = null;
  if (id === 'vest') ch.armor = 100;
  else if (id === 'vesthelm') { ch.armor = 100; ch.helmet = true; }
  else if (id === 'kit') ch.hasKit = true;
  else if (d.type === 'grenade') ch.nades.push(id);
  else { dropped = ch.weapons[d.slot]; ch.weapons[d.slot] = new WeaponState(id); }
  return { ok: true, dropped, slot: d.slot };
}
