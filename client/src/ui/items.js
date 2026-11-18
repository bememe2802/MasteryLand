import { ITEMS, SLOTS, SHOPS, DROPS, ENEMIES, RARITY, POWER_BY_ID, POWER_UNLOCK } from '../../../shared/rules.js';

/** Helpers the item sheets share: colors, stat lines, where an item comes from. */
export const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
export const fmt = (n) => n.toLocaleString('vi-VN');
export const rarityColor = (it) => RARITY[it.rarity].color;

export function itemIcon(it) {
  if (it.slot === 'power') return POWER_BY_ID[it.power].icon;
  return SLOTS[it.slot].icon;
}

/** Short stat summary, e.g. "+110% sát thương kiếm · +4% chí mạng". */
export function statLine(it) {
  if (it.slot === 'power') return POWER_BY_ID[it.power].desc;
  if (it.slot === 'material') return `Bán ${fmt(it.sell)} vàng`;
  const out = [];
  if (it.mult > 1) out.push(`+${Math.round((it.mult - 1) * 100)}% sát thương ${it.slot === 'sword' ? 'kiếm' : 'võ'}`);
  if (it.hp) out.push(`+${it.hp} máu`);
  if (it.red) out.push(`-${Math.round(it.red * 100)}% sát thương nhận`);
  if (it.dmg) out.push(`+${Math.round(it.dmg * 100)}% sát thương`);
  if (it.crit) out.push(`+${Math.round(it.crit * 100)}% chí mạng`);
  if (it.speed) out.push(`+${Math.round(it.speed * 100)}% tốc chạy`);
  if (it.heal) out.push(it.heal >= 1 ? 'Hồi đầy máu' : `Hồi ${Math.round(it.heal * 100)}% máu`);
  return out.join(' · ') || (it.slot === 'sword' ? 'Kiếm tập luyện' : 'Trang phục thường');
}

export function powerMoves(it) {
  const pw = POWER_BY_ID[it.power];
  return pw.moves.map((m, i) => ({ ...m, lv: POWER_UNLOCK[i] }));
}

/** Where to get an item: the shop that sells it, or the monsters that drop it. */
export function sourceOf(it) {
  const out = [];
  if (it.shop) out.push(`${SHOPS[it.shop].name}${it.gems ? ` · ${it.gems} ngọc` : it.price ? ` · ${fmt(it.price)} vàng` : ''}`);
  for (const [type, list] of Object.entries(DROPS)) {
    for (const [id, chance] of list) {
      if (id === it.id || (id === 'power' && it.slot === 'power')) out.push(`${ENEMIES[type].name} rơi · ${Math.round(chance * 100 / (id === 'power' ? 20 : 1) * 10) / 10}%`);
    }
  }
  return out;
}

export const ITEM = ITEMS;
