export const HALF = 120;
export const VILLAGE_R = 17;
export const RIVER_HW = 3.2;
export const BRIDGES = [-60, 0, 60];
export const SPEED = 7;
export const riverX = (z) => 34 + Math.sin(z * 0.035) * 7;
export function inWater(x, z) {
  if (Math.abs(x - riverX(z)) > RIVER_HW) return false;
  for (const b of BRIDGES) if (Math.abs(z - b) < 2.4) return false;
  return true;
}
export const inVillage = (x, z) => x * x + z * z < VILLAGE_R * VILLAGE_R;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const CAMPS = [
  { type: 'slime', x: -27, z: 15, n: 6, r: 7, zone: 'Đồng Cỏ Slime' },
  { type: 'slime', x: 15, z: 30, n: 5, r: 6, zone: 'Đồng Cỏ Slime' },
  { type: 'slime', x: -10, z: -31, n: 6, r: 7, zone: 'Đồng Cỏ Slime' },
  { type: 'fox', x: -62, z: -20, n: 5, r: 8, zone: 'Rừng Cáo' },
  { type: 'fox', x: -76, z: 32, n: 5, r: 8, zone: 'Rừng Cáo' },
  { type: 'fox', x: -92, z: -62, n: 5, r: 8, zone: 'Rừng Cáo' },
  { type: 'rogue', x: 64, z: 18, n: 6, r: 8, zone: 'Trại Cướp' },
  { type: 'barbarian', x: 72, z: 58, n: 5, r: 8, zone: 'Trại Cướp Rìu' },
  { type: 'minion', x: 66, z: -50, n: 5, r: 8, zone: 'Nghĩa Địa Xương' },
  { type: 'warrior', x: 94, z: -24, n: 4, r: 8, zone: 'Nghĩa Địa Xương' },
  { type: 'boss', x: 96, z: -94, n: 1, r: 10, zone: 'Hang Vua Xương' },
];
export const ENEMIES = {
  slime: { name: 'Slime', lv: 1, hp: 45, dmg: 4, speed: 3, range: 1.3, atkCd: 1.5, r: 0.6, passive: true, gold: [3, 7], respawn: 6 },
  fox: { name: 'Cáo Rừng', lv: 8, hp: 160, dmg: 11, speed: 5.6, range: 1.6, atkCd: 1.1, r: 0.6, gold: [12, 22], respawn: 9 },
  rogue: { name: 'Tên Cướp', lv: 16, hp: 320, dmg: 19, speed: 5, range: 1.9, atkCd: 1.2, r: 0.5, gold: [28, 48], respawn: 10 },
  barbarian: { name: 'Cướp Rìu', lv: 22, hp: 520, dmg: 28, speed: 4.4, range: 2.3, atkCd: 1.5, r: 0.6, gold: [45, 75], respawn: 11 },
  minion: { name: 'Lính Xương', lv: 28, hp: 700, dmg: 34, speed: 4.2, range: 1.8, atkCd: 1.3, r: 0.5, gold: [60, 95], respawn: 12 },
  warrior: { name: 'Chiến Binh Xương', lv: 36, hp: 1100, dmg: 48, speed: 4, range: 2.2, atkCd: 1.6, r: 0.55, gold: [100, 150], respawn: 14 },
  boss: { name: 'Vua Xương', lv: 50, hp: 7000, dmg: 90, speed: 3.6, range: 4, atkCd: 2.2, r: 1.5, boss: true, gold: [1200, 1600], respawn: 60 },
};
for (const t of Object.values(ENEMIES)) t.windup = t.boss ? 0.9 : t.lv >= 30 ? 0.65 : 0.45;
export const ENEMY_LIST = CAMPS.flatMap((c, ci) => Array.from({ length: c.n }, () => ({ camp: ci, type: c.type }))).map((e, id) => ({ ...e, id }));

export const PATHS = [
  [[0, 0], [-27, 15], [-50, 22], [-76, 32]],
  [[0, 0], [-10, -31], [-62, -20], [-92, -62]],
  [[0, 0], [15, 30], [riverX(60) - 6, 60], [riverX(60) + 6, 60], [72, 58]],
  [[0, 0], [riverX(0) - 6, 0], [riverX(0) + 6, 0], [64, 18], [94, -24], [66, -50], [96, -94]],
  [[-10, -31], [riverX(-60) - 6, -60], [riverX(-60) + 6, -60], [66, -50]],
];
export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az; const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function pathDist(x, z) {
  let m = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) m = Math.min(m, distSeg(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  return m;
}

const NPC_ROLE = { building_blacksmith_blue: 'weapon', building_market_green: 'armor', building_tavern_red: 'potion', building_church_blue: 'arena' };
export const VILLAGE_BUILDINGS = (() => {
  const pathAngles = PATHS.filter(p => p[0][0] === 0 && p[0][1] === 0).map(p => Math.atan2(p[1][1], p[1][0]));
  const names = ['building_blacksmith_blue', 'building_market_green', 'building_tavern_red', 'building_church_blue', 'building_home_A_blue', 'building_windmill_yellow', 'building_home_B_red', 'building_home_A_yellow', 'building_home_B_green'];
  const out = []; let k = 0;
  for (let i = 0; i < 14 && k < names.length; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.15;
    if (pathAngles.some(p => Math.abs(angDiff(a, p)) < 0.42)) continue;
    out.push({ name: names[k++], a, x: Math.cos(a) * 13, z: Math.sin(a) * 13 });
  }
  return out;
})();
export const NPCS = VILLAGE_BUILDINGS.filter(b => NPC_ROLE[b.name]).map(b => ({ role: NPC_ROLE[b.name], x: b.x * 0.66, z: b.z * 0.66, a: b.a }));
export const NPC_RANGE = 3.4;

export const SAFE_R = 6;
export const CHECKPOINTS = [
  { id: 'village', name: 'Làng Khởi Đầu', x: 0, z: 6 },
  { id: 'forest', name: 'Bìa Rừng', x: -46, z: 21 },
  { id: 'south', name: 'Đồng Nam', x: -38, z: -26 },
  { id: 'east', name: 'Bến Đông', x: 50, z: 8 },
  { id: 'grave', name: 'Cổng Nghĩa Địa', x: 80, z: -37 },
];
export const isSafe = (x, z) => inVillage(x, z) || CHECKPOINTS.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < SAFE_R * SAFE_R);

export const ARENA = { r: 13, slots: 16, center: (slot) => ({ x: -450 + (slot % 8) * 60, z: 300 + Math.floor(slot / 8) * 60 }), countdown: 3500, duration: 90000 };
export const inArena = (x, z) => z > 250;

export const STYLES = {
  melee: { name: 'Võ Thuật', base: 6, cd: 0.32, range: 2.4, arc: 1.3, skill: 'Chấn Địa Quyền', skillCd: 6, skillMult: 4, skillRange: 4.6 },
  sword: { name: 'Kiếm Thuật', base: 10, cd: 0.46, range: 3.2, arc: 1.7, skill: 'Phong Trảm', skillCd: 7, skillMult: 5, skillRange: 9 },
};
export const FINISHER = 1.6;
export const CRIT = { chance: 0.12, mult: 1.7 };
export const SKILL_UNLOCK = 10;
export const MAX_LV = 300;

export const SWORDS = [
  { name: 'Kiếm Gỗ', mult: 1, price: 0, color: 0xb5814f, desc: 'Kiếm tập luyện' },
  { name: 'Kiếm Sắt', mult: 1.5, price: 400, color: 0xffffff, desc: '+50% sát thương kiếm' },
  { name: 'Kiếm Thép Lam', mult: 2.1, price: 1800, color: 0x8cc4ff, emissive: 0x0a2a55, desc: '+110% sát thương kiếm' },
  { name: 'Hắc Long Kiếm', mult: 3, price: 7000, color: 0x9a6ad8, emissive: 0x3a0f77, desc: '+200% sát thương kiếm' },
];
export const GLOVES = [
  { name: 'Tay Không', mult: 1, price: 0, color: 0xe8b894, desc: 'Nắm đấm trần' },
  { name: 'Găng Da', mult: 1.4, price: 350, color: 0x8a5a32, desc: '+40% sát thương võ' },
  { name: 'Găng Sắt', mult: 2, price: 1600, color: 0xa9b3bd, desc: '+100% sát thương võ' },
  { name: 'Găng Hỏa Long', mult: 2.8, price: 6500, color: 0xff6a2a, emissive: 0x882200, desc: '+180% sát thương võ' },
];
export const ARMORS = [
  { name: 'Áo Vải', hp: 0, red: 0, price: 0, color: 0xffffff, desc: 'Không có giáp' },
  { name: 'Giáp Da', hp: 60, red: 0.05, price: 300, color: 0xd9a877, desc: '+60 máu · -5% sát thương nhận' },
  { name: 'Giáp Xích', hp: 150, red: 0.1, price: 1500, color: 0xc8d4e0, desc: '+150 máu · -10% sát thương nhận' },
  { name: 'Giáp Hiệp Sĩ Vàng', hp: 320, red: 0.16, price: 6000, color: 0xffd36b, desc: '+320 máu · -16% sát thương nhận' },
];
export const POTIONS = [
  { id: 'small', name: 'Bình Máu Nhỏ', heal: 0.35, price: 25, color: 0xff6a6a, desc: 'Hồi 35% máu' },
  { id: 'big', name: 'Bình Máu Lớn', heal: 1, price: 110, color: 0xd42a4a, desc: 'Hồi đầy máu' },
];
export const POTION_CD = 6;
export const SHOPS = { weapon: ['sword', 'glove'], armor: ['armor'], potion: ['potion'] };
export const CATALOG = { sword: SWORDS, glove: GLOVES, armor: ARMORS, potion: POTIONS };

export const xpNeed = (lv) => Math.floor(10 + lv * 4 + lv * lv * 0.55);
export const maxHpFor = (p) => 100 + (p.mastery.defense.lv - 1) * 14 + ARMORS[p.gear.armor].hp;
export const defReduceFor = (p) => Math.min(0.75, (p.mastery.defense.lv - 1) * 0.006 + ARMORS[p.gear.armor].red);
export function dmgFor(p, style, mult = 1) {
  const gear = style === 'sword' ? SWORDS[p.gear.sword].mult : GLOVES[p.gear.glove].mult;
  return STYLES[style].base * (1 + (p.mastery[style].lv - 1) * 0.1) * gear * mult;
}

export const defaultProgress = () => ({
  mastery: { melee: { lv: 1, xp: 0 }, sword: { lv: 1, xp: 0 }, defense: { lv: 1, xp: 0 } },
  gold: 0, style: 'melee',
  gear: { sword: 0, glove: 0, armor: 0 },
  owned: { sword: [0], glove: [0], armor: [0] },
  potions: { small: 0, big: 0 },
  checkpoint: 'village', checkpoints: ['village'],
});

export const ANIMS = ['Idle', 'Unarmed_Idle', 'Walking_A', 'Running_A', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Slice_Diagonal',
  '2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick', 'Hit_A', 'Death_A'];

export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,15}$/u;
export const cleanName = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
