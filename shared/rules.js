// The world is 760 x 760: the old 240 x 240 land in the middle, four regions around it.
export const HALF = 380;
export const VILLAGE_R = 17;
export const RIVER_HW = 3.2;
export const BRIDGES = [-300, -180, -60, 0, 60, 180, 300];
export const SPEED = 7;
// The power shrine stands alone outside the village; the shops and sages are in it.
export const SHRINE = { x: 6, z: 84 };
export const riverX = (z) => 34 + Math.sin(z * 0.035) * 7;
export function inWater(x, z) {
  if (Math.abs(x - riverX(z)) > RIVER_HW) return false;
  for (const b of BRIDGES) if (Math.abs(z - b) < 2.4) return false;
  return true;
}
export const inVillage = (x, z) => x * x + z * z < VILLAGE_R * VILLAGE_R;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * How much each outer region owns a point (0..1 each; whatever is left is the central land).
 * The middle 260 x 260 is the old land; beyond it the region is chosen by the dominant axis.
 */
export function regionWeights(x, z) {
  const outer = smoothstep(130, 160, Math.max(Math.abs(x), Math.abs(z)));
  const vert = smoothstep(-15, 15, Math.abs(z) - Math.abs(x));
  return {
    snow: z > 0 ? outer * vert : 0, volcano: z < 0 ? outer * vert : 0,
    swamp: x < 0 ? outer * (1 - vert) : 0, desert: x > 0 ? outer * (1 - vert) : 0,
  };
}
export function regionAt(x, z) {
  const w = regionWeights(x, z);
  let best = 'core', bw = 0.5;
  for (const [k, v] of Object.entries(w)) if (v > bw) { best = k; bw = v; }
  return best;
}
export const REGIONS = {
  core: { name: 'Đồng Cỏ Xanh' }, swamp: { name: 'Đầm Lầy U Ám' }, desert: { name: 'Sa Mạc Vàng' },
  snow: { name: 'Vùng Băng Tuyết' }, volcano: { name: 'Vùng Núi Lửa' },
};
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
  // Swamp
  { type: 'bog', x: -180, z: 30, n: 6, r: 8, zone: 'Vũng Bùn Độc' },
  { type: 'bog', x: -200, z: -60, n: 6, r: 8, zone: 'Vũng Bùn Độc' },
  { type: 'bog', x: -170, z: 110, n: 5, r: 8, zone: 'Vũng Bùn Độc' },
  { type: 'bandit', x: -250, z: 40, n: 5, r: 8, zone: 'Sào Huyệt Đạo Tặc' },
  { type: 'bandit', x: -240, z: -110, n: 5, r: 8, zone: 'Sào Huyệt Đạo Tặc' },
  { type: 'bandit', x: -230, z: 130, n: 5, r: 8, zone: 'Sào Huyệt Đạo Tặc' },
  { type: 'witch', x: -310, z: -20, n: 4, r: 8, zone: 'Rừng Phù Thủy' },
  { type: 'witch', x: -300, z: 100, n: 4, r: 8, zone: 'Rừng Phù Thủy' },
  { type: 'witch', x: -320, z: -120, n: 4, r: 8, zone: 'Rừng Phù Thủy' },
  { type: 'archmage', x: -345, z: 35, n: 1, r: 10, zone: 'Tháp Đại Pháp Sư' },
  // Desert
  { type: 'sandfox', x: 180, z: -30, n: 5, r: 8, zone: 'Cồn Cát' },
  { type: 'sandfox', x: 190, z: 90, n: 5, r: 8, zone: 'Cồn Cát' },
  { type: 'sandfox', x: 175, z: -110, n: 5, r: 8, zone: 'Cồn Cát' },
  { type: 'raider', x: 250, z: 20, n: 5, r: 8, zone: 'Trại Cướp Sa Mạc' },
  { type: 'raider', x: 240, z: 130, n: 5, r: 8, zone: 'Trại Cướp Sa Mạc' },
  { type: 'raider', x: 255, z: -100, n: 5, r: 8, zone: 'Trại Cướp Sa Mạc' },
  { type: 'mummy', x: 310, z: 60, n: 5, r: 8, zone: 'Lăng Mộ Cát' },
  { type: 'mummy', x: 320, z: -40, n: 5, r: 8, zone: 'Lăng Mộ Cát' },
  { type: 'mummy', x: 300, z: 150, n: 5, r: 8, zone: 'Lăng Mộ Cát' },
  { type: 'pharaoh', x: 345, z: -130, n: 1, r: 10, zone: 'Kim Tự Tháp' },
  // Snow
  { type: 'icefox', x: -40, z: 190, n: 5, r: 8, zone: 'Rừng Tuyết' },
  { type: 'icefox', x: 60, z: 200, n: 5, r: 8, zone: 'Rừng Tuyết' },
  { type: 'icefox', x: 0, z: 232, n: 5, r: 7, zone: 'Rừng Tuyết' },
  { type: 'frostskel', x: -90, z: 260, n: 5, r: 8, zone: 'Mộ Băng' },
  { type: 'frostskel', x: 90, z: 270, n: 5, r: 8, zone: 'Mộ Băng' },
  { type: 'frostskel', x: 0, z: 288, n: 5, r: 7, zone: 'Mộ Băng' },
  { type: 'frostknight', x: -60, z: 330, n: 4, r: 8, zone: 'Pháo Đài Băng' },
  { type: 'frostknight', x: 60, z: 335, n: 4, r: 8, zone: 'Pháo Đài Băng' },
  { type: 'frostking', x: 0, z: 355, n: 1, r: 10, zone: 'Ngai Vua Băng' },
  // Volcano
  { type: 'magma', x: -50, z: -180, n: 5, r: 8, zone: 'Dòng Dung Nham' },
  { type: 'magma', x: 60, z: -190, n: 5, r: 8, zone: 'Dòng Dung Nham' },
  { type: 'magma', x: 0, z: -215, n: 5, r: 7, zone: 'Dòng Dung Nham' },
  { type: 'fireskel', x: -90, z: -260, n: 5, r: 8, zone: 'Nghĩa Trang Lửa' },
  { type: 'fireskel', x: 90, z: -265, n: 5, r: 8, zone: 'Nghĩa Trang Lửa' },
  { type: 'fireskel', x: 0, z: -282, n: 5, r: 7, zone: 'Nghĩa Trang Lửa' },
  { type: 'darkknight', x: -60, z: -330, n: 4, r: 8, zone: 'Thành Hắc Ám' },
  { type: 'darkknight', x: 60, z: -330, n: 4, r: 8, zone: 'Thành Hắc Ám' },
  { type: 'demon', x: 0, z: -356, n: 1, r: 10, zone: 'Ngai Ma Vương' },
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
// Outer-region monsters: stats follow their level so the curve continues from the old land.
const mob = (name, lv, o = {}) => {
  const boss = !!o.boss, k = boss ? 6 : 1;
  return { name, lv, hp: Math.round((0.75 * lv * lv + 10 * lv) * k), dmg: Math.round((1.2 * lv + 5) * (boss ? 1.6 : 1)), speed: 4.4, range: boss ? 4 : 2,
    atkCd: boss ? 2.1 : 1.3, r: boss ? 1.5 : 0.55, gold: [Math.round(lv * 3 * k), Math.round(lv * 4.5 * k)], respawn: boss ? 60 : 12, ...o };
};
Object.assign(ENEMIES, {
  bog: mob('Slime Độc', 40, { speed: 3.4, r: 0.6 }),
  bandit: mob('Đạo Tặc Rừng', 48, { speed: 5.2 }),
  witch: mob('Phù Thủy Đầm', 58, { range: 2.4 }),
  archmage: mob('Đại Pháp Sư', 85, { boss: true }),
  sandfox: mob('Cáo Sa Mạc', 45, { speed: 5.8, r: 0.6 }),
  raider: mob('Cướp Sa Mạc', 55, { range: 2.3 }),
  mummy: mob('Xác Ướp', 65, { speed: 3.8 }),
  pharaoh: mob('Vua Cát', 95, { boss: true }),
  icefox: mob('Cáo Tuyết', 60, { speed: 6, r: 0.6 }),
  frostskel: mob('Xương Băng', 70),
  frostknight: mob('Hiệp Sĩ Băng', 80, { range: 2.3 }),
  frostking: mob('Vua Băng', 110, { boss: true }),
  magma: mob('Slime Dung Nham', 85, { speed: 3.6, r: 0.6 }),
  fireskel: mob('Xương Lửa', 95),
  darkknight: mob('Hiệp Sĩ Hắc Ám', 105, { range: 2.3 }),
  demon: mob('Ma Vương', 150, { boss: true, range: 4.5 }),
});
for (const t of Object.values(ENEMIES)) t.windup = t.boss ? 0.9 : t.lv >= 30 ? 0.65 : 0.45;
export const ENEMY_LIST = CAMPS.flatMap((c, ci) => Array.from({ length: c.n }, () => ({ camp: ci, type: c.type }))).map((e, id) => ({ ...e, id }));

export const PATHS = [
  [[0, 0], [-27, 15], [-50, 22], [-76, 32]],
  [[0, 0], [-10, -31], [-62, -20], [-92, -62]],
  [[0, 0], [15, 30], [riverX(60) - 6, 60], [riverX(60) + 6, 60], [72, 58]],
  [[0, 0], [8, 30], [6, 60], [SHRINE.x, SHRINE.z - 6]],
  [[0, 0], [riverX(0) - 6, 0], [riverX(0) + 6, 0], [64, 18], [94, -24], [66, -50], [96, -94]],
  [[-10, -31], [riverX(-60) - 6, -60], [riverX(-60) + 6, -60], [66, -50]],
  // Swamp
  [[-76, 32], [-150, 0], [-180, 30], [-250, 40], [-282, 30], [-310, -20], [-345, 35]],
  [[-150, 0], [-200, -60], [-240, -110], [-320, -120]],
  [[-150, 0], [-170, 110], [-230, 130], [-300, 100]],
  // Desert
  [[64, 18], [150, 20], [180, -30], [255, -100], [285, -50], [320, -40], [345, -130]],
  [[150, 20], [190, 90], [250, 20], [240, 130], [310, 60], [300, 150]],
  [[150, 20], [175, -110]],
  // Snow
  [[SHRINE.x, SHRINE.z], [-10, 160], [-40, 190], [0, 232], [-90, 260], [-130, 300], [-60, 330], [0, 355]],
  [[-10, 160], [riverX(180) - 6, 180], [riverX(180) + 6, 180], [60, 200], [90, 270], [60, 335]],
  [[90, 270], [riverX(300) + 6, 300], [riverX(300) - 6, 300], [0, 288]],
  // Volcano
  [[-10, -31], [10, -155], [-50, -180], [0, -215], [-90, -260], [-130, -300], [-60, -330], [0, -356]],
  [[10, -155], [riverX(-180) - 6, -180], [riverX(-180) + 6, -180], [60, -190], [90, -265], [60, -330]],
  [[90, -265], [riverX(-300) + 6, -300], [riverX(-300) - 6, -300], [0, -282]],
];
export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az; const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/**
 * Distance to the nearest path. Answered from a 1-unit grid filled once on first use (only cells
 * within PATH_FAR of a segment are computed); anything farther reads as PATH_FAR.
 */
const PATH_FAR = 16;
let pathGrid = null;
const PG = (HALF + 40) * 2;
function buildPathGrid() {
  pathGrid = new Float32Array(PG * PG).fill(PATH_FAR);
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - PATH_FAR + PG / 2)), x1 = Math.min(PG - 1, Math.ceil(Math.max(ax, bx) + PATH_FAR + PG / 2));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz) - PATH_FAR + PG / 2)), z1 = Math.min(PG - 1, Math.ceil(Math.max(az, bz) + PATH_FAR + PG / 2));
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const d = distSeg(gx - PG / 2, gz - PG / 2, ax, az, bx, bz), k = gz * PG + gx;
      if (d < pathGrid[k]) pathGrid[k] = d;
    }
  }
}
export function pathDist(x, z) {
  if (!pathGrid) buildPathGrid();
  const gx = Math.round(x + PG / 2), gz = Math.round(z + PG / 2);
  if (gx < 0 || gz < 0 || gx >= PG || gz >= PG) return PATH_FAR;
  return pathGrid[gz * PG + gx];
}

const NPC_ROLE = { building_blacksmith_blue: 'weapon', building_market_green: 'armor', building_tavern_red: 'potion', building_church_blue: 'arena', building_home_A_blue: 'purge' };
export const VILLAGE_BUILDINGS = (() => {
  const pathAngles = PATHS.filter(p => p[0][0] === 0 && p[0][1] === 0).map(p => Math.atan2(p[1][1], p[1][0]));
  const names = ['building_blacksmith_blue', 'building_market_green', 'building_tavern_red', 'building_church_blue', 'building_home_A_blue', 'building_windmill_yellow', 'building_home_B_red', 'building_home_A_yellow', 'building_home_B_green'];
  const out = []; let k = 0;
  for (let i = 0; i < 16 && k < names.length; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.15;
    if (pathAngles.some(p => Math.abs(angDiff(a, p)) < 0.42)) continue;
    out.push({ name: names[k++], a, x: Math.cos(a) * 13, z: Math.sin(a) * 13 });
  }
  return out;
})();
export const NPCS = [
  ...VILLAGE_BUILDINGS.filter(b => NPC_ROLE[b.name]).map(b => ({ role: NPC_ROLE[b.name], x: b.x * 0.66, z: b.z * 0.66, a: b.a })),
  { role: 'shrine', x: SHRINE.x, z: SHRINE.z - 2.5, a: Math.PI / 2 },
];
export const NPC_RANGE = 3.4;

export const SAFE_R = 6;
export const CHECKPOINTS = [
  { id: 'village', name: 'Làng Khởi Đầu', x: 0, z: 6 },
  { id: 'forest', name: 'Bìa Rừng', x: -46, z: 21 },
  { id: 'south', name: 'Đồng Nam', x: -38, z: -26 },
  { id: 'east', name: 'Bến Đông', x: 50, z: 8 },
  { id: 'grave', name: 'Cổng Nghĩa Địa', x: 80, z: -37 },
  { id: 'shrine', name: 'Đền Ấn Cổ', x: SHRINE.x + 3, z: SHRINE.z - 5 },
  { id: 'swamp', name: 'Cửa Đầm Lầy', x: -150, z: 8 },
  { id: 'swamp2', name: 'Tháp Phù Thủy', x: -282, z: 38 },
  { id: 'desert', name: 'Ốc Đảo', x: 150, z: 28 },
  { id: 'desert2', name: 'Cổng Lăng Mộ', x: 285, z: -42 },
  { id: 'snow', name: 'Trạm Tuyết', x: -2, z: 160 },
  { id: 'snow2', name: 'Đỉnh Băng', x: -130, z: 308 },
  { id: 'volcano', name: 'Chân Núi Lửa', x: 18, z: -155 },
  { id: 'volcano2', name: 'Miệng Núi Lửa', x: -130, z: -292 },
];
export const isSafe = (x, z) => inVillage(x, z) || CHECKPOINTS.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < SAFE_R * SAFE_R);

// Arenas sit far outside the world so they never overlap it.
export const ARENA = { r: 13, slots: 16, center: (slot) => ({ x: -210 + (slot % 8) * 60, z: 1000 + Math.floor(slot / 8) * 60 }), countdown: 3500, duration: 90000 };
export const inArena = (x, z) => z > 900;

export const STYLES = {
  melee: { name: 'Võ Thuật', base: 6, cd: 0.32, range: 2.4, arc: 1.3, skill: 'Chấn Địa Quyền', skillCd: 6, skillMult: 4, skillRange: 4.6 },
  sword: { name: 'Kiếm Thuật', base: 10, cd: 0.46, range: 3.2, arc: 1.7, skill: 'Phong Trảm', skillCd: 7, skillMult: 5, skillRange: 9 },
  // Basic attack while a power is equipped: an elemental punch. Its three moves live on the power itself.
  power: { name: 'Sức Mạnh', base: 8, cd: 0.38, range: 2.8, arc: 1.4 },
};
export const FINISHER = 1.6;
export const CRIT = { chance: 0.12, mult: 1.7 };
export const SKILL_UNLOCK = 10;
export const MAX_LV = 300;

/* ---- Items ------------------------------------------------------------------------------------
 * Every item lives in ITEMS under a string id. `slot` says where it goes:
 *   sword, glove, shirt, hat, acc  → equipment (one of each worn at a time)
 *   potion                         → used from the quick button
 *   power                          → used from the bag to gain a special power
 *   material                       → monster drops, only sold
 * `shop` names the NPC that sells it; `gems` instead of `price` means it costs gems.
 */
export const RARITY = {
  common: { name: 'Thường', color: '#c9d3df' },
  rare: { name: 'Hiếm', color: '#5fb8ff' },
  epic: { name: 'Sử Thi', color: '#c27bff' },
  legend: { name: 'Huyền Thoại', color: '#ffc44d' },
};
export const SLOTS = {
  sword: { name: 'Kiếm', icon: 'swords' },
  glove: { name: 'Găng', icon: 'sports_mma' },
  shirt: { name: 'Áo', icon: 'apparel' },
  hat: { name: 'Mũ', icon: 'face' },
  acc: { name: 'Phụ Kiện', icon: 'diamond' },
  potion: { name: 'Thuốc', icon: 'water_drop' },
  power: { name: 'Ấn Sức Mạnh', icon: 'auto_awesome' },
  material: { name: 'Nguyên Liệu', icon: 'category' },
};
export const GEAR_SLOTS = ['sword', 'glove', 'shirt', 'hat', 'acc'];

const list = [];
const add = (slot, shop, rows) => rows.forEach(([id, name, rarity, cost, color, stats = {}, extra = {}]) =>
  list.push({ id, name, slot, shop, rarity, color, ...(typeof cost === 'string' ? { gems: +cost } : { price: cost }), ...stats, ...extra }));

add('sword', 'weapon', [
  ['sw_wood', 'Kiếm Gỗ', 'common', 0, 0xb5814f, { mult: 1 }],
  ['sw_iron', 'Kiếm Sắt', 'common', 400, 0xffffff, { mult: 1.5 }],
  ['sw_curve', 'Đao Lưỡi Cong', 'rare', 1200, 0xdfe6ee, { mult: 1.8, crit: 0.03 }],
  ['sw_blue', 'Kiếm Thép Lam', 'rare', 1800, 0x8cc4ff, { mult: 2.1 }, { emissive: 0x0a2a55 }],
  ['sw_saber', 'Mã Tấu Hải Tặc', 'rare', 3200, 0xd8c08a, { mult: 2.4, crit: 0.04 }],
  ['sw_jade', 'Kiếm Ngọc Bích', 'epic', 5000, 0x6fe0a8, { mult: 2.7 }, { emissive: 0x0a4a2a }],
  ['sw_dragon', 'Hắc Long Kiếm', 'epic', 7000, 0x9a6ad8, { mult: 3 }, { emissive: 0x3a0f77 }],
  ['sw_flame', 'Viêm Đao', 'epic', 12000, 0xff7a3a, { mult: 3.4, crit: 0.05 }, { emissive: 0x7a1a00 }],
  ['sw_moon', 'Nguyệt Quang Kiếm', 'legend', '40', 0xe8f0ff, { mult: 3.9, crit: 0.06 }, { emissive: 0x3a5a9a }],
  ['sw_king', 'Vương Kiếm Xương', 'legend', 0, 0xd9c8ff, { mult: 4.2, crit: 0.08 }, { emissive: 0x4a1a7a, shop: null }],
]);
add('glove', 'weapon', [
  ['gl_leather', 'Găng Da', 'common', 350, 0x8a5a32, { mult: 1.4 }],
  ['gl_iron', 'Găng Sắt', 'common', 1600, 0xa9b3bd, { mult: 2 }, { metal: true }],
  ['gl_spike', 'Găng Gai', 'rare', 2600, 0x6a6f78, { mult: 2.3, crit: 0.04 }, { metal: true }],
  ['gl_fire', 'Găng Hỏa Long', 'epic', 6500, 0xff6a2a, { mult: 2.8 }, { emissive: 0x882200 }],
  ['gl_thunder', 'Găng Sấm Sét', 'epic', 11000, 0xffe066, { mult: 3.3, crit: 0.05 }, { emissive: 0x6a5a00 }],
  ['gl_titan', 'Găng Titan', 'legend', '35', 0x5fd8ff, { mult: 3.8, crit: 0.06 }, { emissive: 0x0a4a6a, metal: true }],
]);
add('shirt', 'armor', [
  ['sh_tee', 'Áo Thun Trắng', 'common', 0, 0xf4f4f0, { hp: 0, red: 0 }],
  ['sh_sailor', 'Áo Thủy Thủ', 'common', 300, 0x3a6ec8, { hp: 50, red: 0.04 }],
  ['sh_leather', 'Áo Giáp Da', 'common', 700, 0xa8743f, { hp: 90, red: 0.06 }],
  ['sh_chain', 'Giáp Xích', 'rare', 1500, 0xb9c4d0, { hp: 150, red: 0.1 }, { metal: true }],
  ['sh_coat', 'Áo Khoác Thuyền Trưởng', 'rare', 3500, 0x2a2f4a, { hp: 220, red: 0.12 }],
  ['sh_gold', 'Giáp Hiệp Sĩ Vàng', 'epic', 6000, 0xffd36b, { hp: 320, red: 0.16 }, { metal: true }],
  ['sh_dragon', 'Giáp Vảy Rồng', 'legend', '45', 0x2fae6a, { hp: 450, red: 0.2 }, { emissive: 0x0a3a1a }],
]);
add('hat', 'armor', [
  ['ht_band', 'Khăn Bandana', 'common', 150, 0xd83a3a, { hp: 20, red: 0.01 }],
  ['ht_nonla', 'Nón Lá', 'common', 250, 0xe8d49a, { hp: 30, red: 0.02 }],
  ['ht_helm', 'Mũ Sắt', 'rare', 1200, 0xc8d0da, { hp: 80, red: 0.04 }, { metal: true }],
  ['ht_tricorn', 'Mũ Thuyền Trưởng', 'epic', 3000, 0x2a2420, { hp: 120, red: 0.05 }],
  ['ht_crown', 'Vương Miện Xương', 'legend', 0, 0xd9b3ff, { hp: 200, red: 0.08 }, { emissive: 0x4a1a7a, shop: null }],
]);
add('acc', 'armor', [
  ['ac_cape', 'Áo Choàng Đỏ', 'rare', 800, 0xc8303a, { dmg: 0.05 }],
  ['ac_amulet', 'Bùa Hộ Mệnh', 'rare', 2000, 0x6fd0ff, { hp: 80 }],
  ['ac_boots', 'Giày Gió', 'rare', 1500, 0x9ae6c8, { speed: 0.1 }],
  ['ac_ring', 'Nhẫn Bạo Kích', 'epic', 2500, 0xff5fa0, { crit: 0.06 }],
  ['ac_fang', 'Nanh Cáo', 'rare', 0, 0xf0e6d0, { dmg: 0.04, speed: 0.04 }, { shop: null }],
  ['ac_skull', 'Bùa Xương', 'epic', 0, 0xe8e2d0, { crit: 0.04, hp: 40 }, { shop: null }],
]);
add('potion', 'potion', [
  ['pot_s', 'Bình Máu Nhỏ', 'common', 25, 0xff6a6a, { heal: 0.35 }],
  ['pot_l', 'Bình Máu Lớn', 'rare', 110, 0xd42a4a, { heal: 1 }],
]);
add('material', null, [
  ['mt_gel', 'Thạch Slime', 'common', 0, 0x8dff7a, {}, { sell: 4 }],
  ['mt_fur', 'Lông Cáo', 'common', 0, 0xe0884a, {}, { sell: 15 }],
  ['mt_cloth', 'Khăn Cướp', 'common', 0, 0xb84040, {}, { sell: 30 }],
  ['mt_axe', 'Mảnh Rìu', 'rare', 0, 0x9aa0a8, {}, { sell: 45 }],
  ['mt_bone', 'Xương Cũ', 'rare', 0, 0xe8e2d0, {}, { sell: 60 }],
  ['mt_soul', 'Hồn Xương', 'epic', 0, 0xb36bff, {}, { sell: 110 }],
  ['mt_venom', 'Túi Nọc Độc', 'rare', 0, 0x9ae040, {}, { sell: 140 }],
  ['mt_sand', 'Cát Vàng', 'rare', 0, 0xe8c66a, {}, { sell: 160 }],
  ['mt_ice', 'Băng Tinh', 'epic', 0, 0x9ae6ff, {}, { sell: 220 }],
  ['mt_ember', 'Than Hồng', 'epic', 0, 0xff6a2a, {}, { sell: 280 }],
]);

/* ---- Special powers ---------------------------------------------------------------------------
 * 20 powers, each an item ("Ấn") bought at the shrine and used from the bag. One power at a time;
 * removing it costs gold at the village sage. Each has three moves, unlocked by power mastery.
 *
 * A move's `k` (kind) decides its shape; every kind fires along the player's facing:
 *   bolt  projectile(s): range, speed, r (radius), count, spread, pierce
 *   cone  instant fan in front: range, arc
 *   line  instant beam: range, w (half width)
 *   nova  burst around the player: radius
 *   dash  rush forward hitting along the path: range, w
 *   leap  jump forward, slam on landing: range, radius
 *   zone  field placed ahead that ticks: dist, radius, ticks, every
 * `fx` adds an effect on enemies hit: burn, slow, stun, pull, knock; `heal` heals the caster (share of max HP).
 */
export const POWER_UNLOCK = [1, 12, 30];
const RAR_MULT = { common: 1, rare: 1.15, epic: 1.3, legend: 1.5 };
const POWER_PRICE = { common: 2500, rare: 8000, epic: 20000, legend: '50' };
const P = (id, name, rarity, color, icon, desc, moves) => ({ id, name, rarity, color, icon, desc, moves });
const M = (n, icon, k, cd, mult, o = {}) => ({ n, icon, k, cd, mult, ...o });
export const POWERS = [
  P('bubble', 'Ấn Bọt Nước', 'common', 0x8fe3ff, 'bubble_chart', 'Thổi bong bóng làm chậm kẻ địch', [
    M('Bóng Bay', 'bubble_chart', 'bolt', 4, 2.6, { range: 12, speed: 14, r: 0.8, count: 3, spread: 0.25, fx: 'slow' }),
    M('Màn Bọt', 'blur_on', 'zone', 9, 1, { dist: 5, radius: 3.5, ticks: 5, every: 0.5, fx: 'slow' }),
    M('Bong Bóng Khổng Lồ', 'radio_button_unchecked', 'bolt', 14, 7, { range: 14, speed: 9, r: 2, pierce: true, fx: 'stun' }),
  ]),
  P('spring', 'Ấn Lò Xo', 'common', 0xc8e86a, 'height', 'Nảy bật, lao tới cực nhanh', [
    M('Đấm Bật', 'sports_mma', 'line', 4, 3, { range: 6, w: 1.1, fx: 'knock' }),
    M('Nảy Vọt', 'call_made', 'leap', 8, 4, { range: 9, radius: 3.2 }),
    M('Liên Hoàn Bật', 'keyboard_double_arrow_right', 'dash', 13, 6.5, { range: 12, w: 1.8, fx: 'knock' }),
  ]),
  P('leaf', 'Ấn Lá Rừng', 'common', 0x6fd05a, 'eco', 'Lá cây sắc như dao, hồi máu nhẹ', [
    M('Phi Diệp', 'eco', 'bolt', 3.5, 2.4, { range: 13, speed: 24, r: 0.5, count: 5, spread: 0.18 }),
    M('Rễ Trói', 'grass', 'zone', 10, 0.9, { dist: 6, radius: 3, ticks: 4, every: 0.5, fx: 'stun' }),
    M('Rừng Hồi Sinh', 'forest', 'nova', 15, 5, { radius: 5.5, heal: 0.25 }),
  ]),
  P('sound', 'Ấn Âm Ba', 'common', 0xf0a0ff, 'graphic_eq', 'Sóng âm đánh xuyên qua hàng địch', [
    M('Tiếng Hét', 'campaign', 'cone', 4, 2.8, { range: 6, arc: 1.4, fx: 'knock' }),
    M('Sóng Âm', 'graphic_eq', 'line', 8, 4, { range: 14, w: 1.5 }),
    M('Chấn Âm', 'surround_sound', 'nova', 13, 6, { radius: 6, fx: 'stun' }),
  ]),
  P('fire', 'Ấn Hỏa', 'rare', 0xff6a2a, 'local_fire_department', 'Lửa thiêu đốt kẻ địch theo thời gian', [
    M('Hỏa Cầu', 'local_fire_department', 'bolt', 4, 3, { range: 15, speed: 22, r: 0.9, fx: 'burn' }),
    M('Phun Lửa', 'whatshot', 'cone', 8, 4.6, { range: 7, arc: 1.2, fx: 'burn' }),
    M('Cột Lửa', 'mode_heat', 'zone', 14, 1.6, { dist: 6, radius: 4, ticks: 6, every: 0.4, fx: 'burn' }),
  ]),
  P('ice', 'Ấn Băng', 'rare', 0x8fd8ff, 'ac_unit', 'Đóng băng, làm chậm và choáng', [
    M('Mũi Băng', 'ac_unit', 'bolt', 4, 2.8, { range: 15, speed: 26, r: 0.6, count: 3, spread: 0.12, fx: 'slow' }),
    M('Băng Địa', 'severe_cold', 'line', 9, 4.4, { range: 12, w: 1.6, fx: 'stun' }),
    M('Kỷ Băng Hà', 'mode_cool', 'nova', 15, 7, { radius: 7, fx: 'stun' }),
  ]),
  P('wind', 'Ấn Phong', 'rare', 0xbff0e0, 'air', 'Gió cắt và đẩy lùi kẻ địch', [
    M('Phong Nhận', 'air', 'bolt', 3.5, 2.8, { range: 16, speed: 30, r: 0.8, pierce: true }),
    M('Lốc Xoáy', 'cyclone', 'zone', 9, 1.1, { dist: 6, radius: 3.5, ticks: 6, every: 0.4, fx: 'pull' }),
    M('Cuồng Phong', 'storm', 'dash', 13, 6.5, { range: 13, w: 2.2, fx: 'knock' }),
  ]),
  P('stone', 'Ấn Đá', 'rare', 0xb08a5a, 'landslide', 'Đá cứng, đòn nặng gây choáng', [
    M('Đá Lăn', 'landslide', 'bolt', 5, 3.4, { range: 13, speed: 16, r: 1.2, pierce: true, fx: 'knock' }),
    M('Giáp Đá Dậm', 'terrain', 'nova', 9, 4.5, { radius: 4.5, fx: 'stun' }),
    M('Núi Đè', 'filter_hdr', 'leap', 14, 7.5, { range: 8, radius: 4.5, fx: 'stun' }),
  ]),
  P('water', 'Ấn Thủy', 'rare', 0x3aa0ff, 'water', 'Sóng nước cuốn trôi kẻ địch', [
    M('Đạn Nước', 'water_drop', 'bolt', 3.5, 2.6, { range: 14, speed: 24, r: 0.6, count: 4, spread: 0.1 }),
    M('Sóng Thần', 'waves', 'line', 9, 4.6, { range: 13, w: 2.2, fx: 'knock' }),
    M('Xoáy Nước', 'cyclone', 'zone', 14, 1.5, { dist: 5, radius: 4, ticks: 6, every: 0.45, fx: 'pull', heal: 0.15 }),
  ]),
  P('poison', 'Ấn Độc', 'rare', 0xa0e040, 'coronavirus', 'Độc ăn mòn, gây sát thương lâu dài', [
    M('Phi Độc', 'coronavirus', 'bolt', 3.5, 2.4, { range: 14, speed: 20, r: 0.7, count: 2, spread: 0.15, fx: 'burn' }),
    M('Đầm Độc', 'science', 'zone', 9, 1.2, { dist: 5, radius: 4, ticks: 6, every: 0.5, fx: 'slow' }),
    M('Rồng Độc', 'pest_control', 'line', 14, 6.5, { range: 14, w: 1.8, fx: 'burn' }),
  ]),
  P('thunder', 'Ấn Lôi', 'epic', 0xffe24a, 'bolt', 'Sấm sét nhanh như chớp, gây choáng', [
    M('Tia Chớp', 'bolt', 'line', 3.5, 3.4, { range: 15, w: 1, fx: 'stun' }),
    M('Lôi Bộ', 'flash_on', 'dash', 8, 4.8, { range: 12, w: 1.6 }),
    M('Thiên Lôi', 'thunderstorm', 'zone', 14, 2.2, { dist: 6, radius: 4.5, ticks: 5, every: 0.35, fx: 'stun' }),
  ]),
  P('shadow', 'Ấn Bóng Tối', 'epic', 0x7a4ad8, 'dark_mode', 'Bóng tối kéo kẻ địch lại gần', [
    M('Hắc Cầu', 'dark_mode', 'bolt', 4, 3.2, { range: 15, speed: 18, r: 1, fx: 'pull' }),
    M('Bóng Lướt', 'blur_linear', 'dash', 8, 4.8, { range: 11, w: 1.8, fx: 'slow' }),
    M('Hố Đen', 'radio_button_checked', 'zone', 15, 2, { dist: 6, radius: 5, ticks: 6, every: 0.4, fx: 'pull' }),
  ]),
  P('light', 'Ấn Ánh Sáng', 'epic', 0xfff6c0, 'flare', 'Ánh sáng xuyên thấu với tốc độ cao', [
    M('Quang Tiễn', 'flare', 'bolt', 3, 2.6, { range: 18, speed: 40, r: 0.5, count: 3, spread: 0.08, pierce: true }),
    M('Quang Tốc', 'light_mode', 'dash', 7, 4.4, { range: 15, w: 1.4 }),
    M('Thánh Quang', 'wb_sunny', 'line', 14, 8, { range: 18, w: 1.6, fx: 'stun' }),
  ]),
  P('crystal', 'Ấn Pha Lê', 'epic', 0xb8f0ff, 'diamond', 'Pha lê sắc nhọn, phòng thủ cao', [
    M('Mảnh Pha Lê', 'diamond', 'bolt', 3.5, 2.6, { range: 14, speed: 26, r: 0.5, count: 5, spread: 0.2 }),
    M('Gai Pha Lê', 'change_history', 'line', 9, 5, { range: 11, w: 1.6, fx: 'stun' }),
    M('Lăng Kính', 'hexagon', 'nova', 14, 7, { radius: 6, heal: 0.2 }),
  ]),
  P('lava', 'Ấn Dung Nham', 'epic', 0xff4a1a, 'volcano', 'Dung nham nóng chảy, sát thương cực lớn', [
    M('Nắm Đấm Nham', 'sports_mma', 'bolt', 4.5, 3.8, { range: 13, speed: 18, r: 1.1, fx: 'burn' }),
    M('Phun Trào', 'volcano', 'nova', 9, 5.2, { radius: 5, fx: 'burn' }),
    M('Mưa Dung Nham', 'local_fire_department', 'zone', 15, 2.4, { dist: 7, radius: 5, ticks: 6, every: 0.4, fx: 'burn' }),
  ]),
  P('blast', 'Ấn Bộc Phá', 'epic', 0xffa040, 'destruction', 'Mọi thứ chạm vào đều phát nổ', [
    M('Đạn Nổ', 'destruction', 'bolt', 4, 3.4, { range: 13, speed: 20, r: 0.9, fx: 'knock' }),
    M('Bước Nổ', 'local_fire_department', 'leap', 8, 4.8, { range: 9, radius: 4, fx: 'knock' }),
    M('Đại Bộc Phá', 'brightness_7', 'nova', 15, 8, { radius: 7, fx: 'knock' }),
  ]),
  P('gravity', 'Ấn Trọng Lực', 'legend', 0x9a7aff, 'public', 'Điều khiển trọng lực, đè bẹp kẻ địch', [
    M('Trọng Áp', 'arrow_downward', 'zone', 5, 1.5, { dist: 6, radius: 3.5, ticks: 3, every: 0.3, fx: 'slow' }),
    M('Lực Hút', 'public', 'nova', 9, 4.5, { radius: 8, fx: 'pull' }),
    M('Thiên Thạch', 'nightlight', 'leap', 15, 10, { range: 10, radius: 6, fx: 'stun' }),
  ]),
  P('void', 'Ấn Hư Không', 'legend', 0x5ad8ff, 'all_inclusive', 'Xé rách không gian, dịch chuyển tức thời', [
    M('Vết Nứt', 'all_inclusive', 'line', 4, 3.8, { range: 16, w: 1.3 }),
    M('Dịch Chuyển', 'move_up', 'dash', 7, 4.2, { range: 14, w: 2 }),
    M('Hư Vô', 'blur_circular', 'zone', 15, 2.6, { dist: 7, radius: 5, ticks: 5, every: 0.4, fx: 'stun' }),
  ]),
  P('dragon', 'Ấn Long Hồn', 'legend', 0x3ae08a, 'pets', 'Hồn rồng cổ đại, mạnh mẽ toàn diện', [
    M('Long Tức', 'whatshot', 'cone', 4, 4, { range: 8, arc: 1.1, fx: 'burn' }),
    M('Long Trảo', 'pets', 'dash', 8, 5.2, { range: 11, w: 2, fx: 'knock' }),
    M('Long Vũ', 'tornado', 'nova', 15, 9, { radius: 7.5, fx: 'stun', heal: 0.15 }),
  ]),
  P('star', 'Ấn Tinh Tú', 'legend', 0xffd0f0, 'star', 'Gọi sao trời rơi xuống chiến trường', [
    M('Sao Băng', 'star', 'bolt', 3.5, 2.8, { range: 16, speed: 30, r: 0.6, count: 5, spread: 0.14 }),
    M('Tinh Vân', 'auto_awesome', 'zone', 9, 1.6, { dist: 6, radius: 4.5, ticks: 5, every: 0.4, fx: 'slow' }),
    M('Siêu Tân Tinh', 'brightness_high', 'leap', 15, 10, { range: 9, radius: 6.5, fx: 'knock' }),
  ]),
];
export const POWER_BY_ID = Object.fromEntries(POWERS.map(p => [p.id, p]));
for (const pw of POWERS) list.push({ id: `pw_${pw.id}`, name: pw.name, slot: 'power', shop: 'shrine', rarity: pw.rarity, color: pw.color, power: pw.id,
  ...(typeof POWER_PRICE[pw.rarity] === 'string' ? { gems: +POWER_PRICE[pw.rarity] } : { price: POWER_PRICE[pw.rarity] }) });

/** How far a move can reach from where it was cast (for hit checks). */
export function moveReach(mv) {
  switch (mv.k) {
    case 'bolt': case 'cone': case 'line': return mv.range;
    case 'nova': return mv.radius;
    case 'dash': return mv.range + mv.w;
    case 'leap': return mv.range + mv.radius;
    case 'zone': return mv.dist + mv.radius;
  }
  return 6;
}
/** How many times one cast may hit the same target. */
export const moveHits = (mv) => (mv.k === 'zone' ? mv.ticks : mv.k === 'bolt' ? mv.count || 1 : 1);
/** How long after the cast hits may still arrive (seconds). */
export const moveWindow = (mv) => 1.2 + (mv.k === 'bolt' ? mv.range / mv.speed : mv.k === 'zone' ? mv.ticks * mv.every + 0.3 : mv.k === 'dash' || mv.k === 'leap' ? 0.6 : 0);
export const PURGE_COST = 1000;

export const ITEMS = Object.fromEntries(list.map(it => [it.id, it]));
for (const it of list) {
  if (it.shop === undefined) it.shop = null;
  it.sell = it.sell ?? (it.price ? Math.floor(it.price * 0.4) : it.gems ? 0 : 0);
}
export const ITEM_LIST = list;
export const SHOPS = {
  weapon: { name: 'Lò Rèn', tabs: ['sword', 'glove'] },
  armor: { name: 'Tiệm Trang Phục', tabs: ['shirt', 'hat', 'acc'] },
  potion: { name: 'Tiệm Thuốc', tabs: ['potion'] },
  shrine: { name: 'Đền Ấn Cổ', tabs: ['power'] },
};
export const SELL_AT = ['weapon', 'armor', 'potion'];
export const POTION_CD = 6;

/* ---- Drops ------------------------------------------------------------------------------------ */
export const DROPS = {
  slime: [['mt_gel', 0.4]],
  fox: [['mt_fur', 0.35], ['ac_fang', 0.03]],
  rogue: [['mt_cloth', 0.3], ['ht_band', 0.04]],
  barbarian: [['mt_axe', 0.3]],
  minion: [['mt_bone', 0.35]],
  warrior: [['mt_soul', 0.25], ['ac_skull', 0.03]],
  boss: [['mt_soul', 1], ['ht_crown', 0.12], ['sw_king', 0.06], ['power', 0.15]],
  bog: [['mt_venom', 0.3]], bandit: [['mt_venom', 0.25], ['ht_band', 0.03]], witch: [['mt_venom', 0.35], ['ac_ring', 0.02]],
  archmage: [['mt_venom', 1], ['ac_amulet', 0.2], ['power', 0.25]],
  sandfox: [['mt_sand', 0.3], ['ac_fang', 0.04]], raider: [['mt_sand', 0.3]], mummy: [['mt_sand', 0.4], ['ac_skull', 0.03]],
  pharaoh: [['mt_sand', 1], ['sw_king', 0.08], ['power', 0.25]],
  icefox: [['mt_ice', 0.3]], frostskel: [['mt_ice', 0.35]], frostknight: [['mt_ice', 0.4], ['ht_helm', 0.03]],
  frostking: [['mt_ice', 1], ['ht_crown', 0.15], ['power', 0.3]],
  magma: [['mt_ember', 0.3]], fireskel: [['mt_ember', 0.35]], darkknight: [['mt_ember', 0.4], ['sw_flame', 0.02]],
  demon: [['mt_ember', 1], ['sw_king', 0.12], ['ht_crown', 0.12], ['power', 0.4]],
};
/** Gems for a boss kill, by level. */
export const bossGems = (t) => Math.max(5, Math.round(t.lv / 10));
export const BOSS_GEMS = 5;

/* ---- Shrine stock: six powers, reshuffled every 30 minutes, the same on server and client. ---- */
export const SHRINE_PERIOD = 30 * 60 * 1000;
export function shrineStock(now) {
  const period = Math.floor(now / SHRINE_PERIOD);
  let a = period * 2654435761 >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const weight = { common: 6, rare: 4, epic: 2, legend: 1 };
  const pool = POWERS.map(p => ({ id: p.id, w: weight[p.rarity] }));
  const out = [];
  while (out.length < 6) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = rnd() * total;
    const i = pool.findIndex(p => (r -= p.w) < 0);
    out.push(pool.splice(i, 1)[0].id);
  }
  return { ids: out, endsAt: (period + 1) * SHRINE_PERIOD };
}

/* ---- Derived stats ---------------------------------------------------------------------------- */
export const xpNeed = (lv) => Math.floor(10 + lv * 4 + lv * lv * 0.55);
const gearOf = (p) => GEAR_SLOTS.map(s => ITEMS[p.gear[s]]).filter(Boolean);
const sumStat = (p, k) => gearOf(p).reduce((s, it) => s + (it[k] || 0), 0);
export const masteryOf = (p, key) => (key === 'power' ? p.power : p.mastery[key]);
export const maxHpFor = (p) => Math.round(100 + (p.mastery.defense.lv - 1) * 14 + sumStat(p, 'hp'));
export const defReduceFor = (p) => Math.min(0.75, (p.mastery.defense.lv - 1) * 0.006 + sumStat(p, 'red'));
export const critFor = (p) => CRIT.chance + sumStat(p, 'crit');
export const speedFor = (p) => SPEED * (1 + Math.min(0.2, sumStat(p, 'speed')));
export function dmgFor(p, style, mult = 1) {
  const bonus = 1 + sumStat(p, 'dmg');
  if (style === 'power') {
    if (!p.power) return 0;
    return STYLES.power.base * (1 + (p.power.lv - 1) * 0.1) * RAR_MULT[POWER_BY_ID[p.power.id].rarity] * mult * bonus;
  }
  const gear = style === 'sword' ? ITEMS[p.gear.sword]?.mult || 1 : ITEMS[p.gear.glove]?.mult || 1;
  return STYLES[style].base * (1 + (p.mastery[style].lv - 1) * 0.1) * gear * mult * bonus;
}
/** Can this player fight with this style right now? */
export const styleOk = (p, s) => s === 'melee' || (s === 'sword' && !!p.gear.sword) || (s === 'power' && !!p.power);

export const defaultProgress = () => ({
  mastery: { melee: { lv: 1, xp: 0 }, sword: { lv: 1, xp: 0 }, defense: { lv: 1, xp: 0 } },
  gold: 0, gems: 0, style: 'melee',
  gear: { sword: 'sw_wood', glove: null, shirt: 'sh_tee', hat: null, acc: null },
  inv: { sw_wood: 1, sh_tee: 1 },
  power: null, // { id, lv, xp }
  quests: {}, // quest id -> kills so far (only accepted quests)
  checkpoint: 'village', checkpoints: ['village'],
});
/** Count of an item in the bag, including what is worn (worn items stay in the bag). */
export const invCount = (p, id) => p.inv[id] || 0;

export const ANIMS = ['Idle', 'Unarmed_Idle', 'Walking_A', 'Running_A', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Slice_Diagonal',
  '2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick', 'Hit_A', 'Death_A', 'Cast_A'];

export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,15}$/u;
export const cleanName = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();

/* ---- Kill quests ------------------------------------------------------------------------------
 * Every checkpoint has a quest board. Each monster type has one repeatable quest, posted on the
 * board closest to its camps: kill `count` of them, then hand it in at that board.
 */
export const QUEST_MAX = 5;
export const QUESTS = (() => {
  const out = [];
  for (const [type, t] of Object.entries(ENEMIES)) {
    const camps = CAMPS.filter(c => c.type === type);
    const cx = camps.reduce((a, c) => a + c.x, 0) / camps.length, cz = camps.reduce((a, c) => a + c.z, 0) / camps.length;
    let board = CHECKPOINTS[0], bd = Infinity;
    for (const c of CHECKPOINTS) { const d = Math.hypot(c.x - cx, c.z - cz); if (d < bd) { bd = d; board = c; } }
    const count = t.boss ? 1 : t.passive ? 8 : 10;
    const avgGold = (t.gold[0] + t.gold[1]) / 2;
    out.push({
      id: `q_${type}`, type, board: board.id, count,
      gold: Math.round(avgGold * count * (t.boss ? 3 : 1.5) / 10) * 10,
      xp: Math.round(t.lv * (t.boss ? 60 : 18)),
      gems: t.boss ? Math.max(3, Math.round(t.lv / 20)) : t.lv >= 40 ? 1 : 0,
    });
  }
  return out;
})();
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map(q => [q.id, q]));
export const BOARD_OFF = { x: 3.2, z: -1.2 };
