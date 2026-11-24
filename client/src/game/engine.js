import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  HALF, VILLAGE_R, RIVER_HW, BRIDGES, SPEED, riverX, inWater, inVillage, clamp, angDiff, CAMPS, ENEMIES, PATHS, distSeg, pathDist,
  VILLAGE_BUILDINGS, NPCS, NPC_RANGE, SAFE_R, CHECKPOINTS, isSafe, ARENA, STYLES, FINISHER, CRIT, SHRINE,
  ITEMS, POTION_CD, SHOPS, POWER_BY_ID, ENEMY_LIST, AVATAR, defaultAvatar, avatarCode, parseAvatar, movesOf, unlockOf, aimKind, moveReach, CHAIN_HOP, STAT_INFO, pointsLeft, REGIONS, regionAt, regionWeights, QUESTS, QUEST_BY_ID, BOARD_OFF, xpNeed, maxHpFor, defReduceFor, dmgFor, critFor, speedFor, masteryOf, styleOk,
  defaultProgress, ANIMS, LANDMARKS, landmarkAt, CHESTS, CHEST_CD,
} from '../../../shared/rules.js';
import { api, ensureLogin, logout, connect } from './net.js';
import { buildLandmarks, buildRegionProps, landmarkGround } from './biomes.js';
import { createAmbient, dayState, rainState, clock as skyClock } from './ambient.js';
import { sfx, sound } from './sfx.js';
import { ui, input, game, toast, bigText, showZone, openModal, closeModal } from '../ui/state.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry32(20261110);
const rr = (a, b) => a + rand() * (b - a);
const fx = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lerpAngle = (a, b, t) => a + angDiff(b, a) * t;

function zoneAt(x, z) {
  if (P.arena) return 'Đấu Trường';
  if (inVillage(x, z)) return 'Làng Khởi Đầu';
  if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 16) return 'Đền Ấn Cổ';
  const lm = landmarkAt(x, z, 4);
  if (lm) return lm.name;
  for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < c.r + 10) return c.zone;
  const region = regionAt(x, z);
  if (region !== 'core') return REGIONS[region].name;
  if (x > riverX(z)) return z < -18 ? 'Nghĩa Địa Xương' : 'Vùng Đất Phía Đông';
  if (x < -42) return 'Rừng Cáo';
  return 'Đồng Cỏ Xanh';
}
const isRocky = (x, z) => x > riverX(z) + 6 && z < -18;
function vnoise(x, z) { return Math.sin(x * 0.31 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.29 + Math.sin(x * 0.13) * 2); }
const REGION_GROUND = { snow: [0.9, 0.94, 0.98], swamp: [0.3, 0.4, 0.27], desert: [0.9, 0.78, 0.52], volcano: [0.36, 0.3, 0.29] };
// Multiply color, plus an emissive lift so snow can whiten textures (a multiply alone only darkens).
const REGION_TINT = { snow: [0xdde8f4, 0x7a8898], swamp: [0x7a9a6a, 0], desert: [0x9a8460, 0x1a1408], volcano: [0x5a4a44, 0] };
const REGION_SKY = { core: 0x9fd3f0, snow: 0xdcecf8, swamp: 0x93a894, desert: 0xf2dcae, volcano: 0x7a5a50 };
function groundColor(x, z) {
  let r = 0.50, g = 0.74, b = 0.33;
  const forest = smooth(-34, -48, x);
  r = lerp(r, 0.36, forest); g = lerp(g, 0.60, forest); b = lerp(b, 0.28, forest);
  const rx = riverX(z);
  const east = smooth(rx + 4, rx + 12, x);
  const rocky = east * smooth(-12, -28, z);
  const dry = east * (1 - rocky);
  r = lerp(r, 0.66, dry); g = lerp(g, 0.72, dry); b = lerp(b, 0.38, dry);
  r = lerp(r, 0.50, rocky); g = lerp(g, 0.50, rocky); b = lerp(b, 0.46, rocky);
  const w = regionWeights(x, z);
  for (const [k, [cr, cg, cb]] of Object.entries(REGION_GROUND)) { const t = w[k]; if (t) { r = lerp(r, cr, t); g = lerp(g, cg, t); b = lerp(b, cb, t); } }
  if (w.volcano > 0.5) { const v = Math.max(0, vnoise(x * 0.6, z * 0.6) - 0.6) * 1.6 * w.volcano; r = lerp(r, 0.85, v); g = lerp(g, 0.32, v); b = lerp(b, 0.12, v); }
  if (w.desert > 0.5) { const v = Math.sin(x * 0.08 + Math.sin(z * 0.05) * 3) * 0.03 * w.desert; r += v; g += v; b += v * 0.5; }
  const nn = vnoise(x, z) * 0.03; r += nn; g += nn * 1.2; b += nn * 0.5;
  const lg = landmarkGround(x, z, [r, g, b]); r = lg[0]; g = lg[1]; b = lg[2];
  const p = 1 - smooth(1.6, 3.2, pathDist(x, z));
  r = lerp(r, 0.78, p); g = lerp(g, 0.64, p); b = lerp(b, 0.43, p);
  const v = 1 - smooth(7, 10, Math.hypot(x, z));
  r = lerp(r, 0.80, v); g = lerp(g, 0.70, v); b = lerp(b, 0.52, v);
  const sand = 1 - smooth(RIVER_HW + 0.3, RIVER_HW + 2.2, Math.abs(x - rx));
  r = lerp(r, 0.92, sand); g = lerp(g, 0.84, sand); b = lerp(b, 0.60, sand);
  return [r, g, b];
}

const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const SKY = 0x9fd3f0;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 42, 80);
const camera = new THREE.PerspectiveCamera(40, 1, 1, 130);
const CAM_OFF = new THREE.Vector3(0, 21, 13.5);
let camDist = 1;
const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x5d6b3a, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const overlay = $('overlay');
const octx = overlay.getContext('2d');
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camDist = w < h ? 1.35 : 1;
  const dpr = Math.min(devicePixelRatio, 2);
  overlay.width = w * dpr; overlay.height = h * dpr; octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);

const matCache = new Map();
const mat = (c, opts) => { const k = c + JSON.stringify(opts || {}); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...opts })); return matCache.get(k); };
function mesh(geo, m, x = 0, y = 0, z = 0, parent = scene) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const A = {};
async function loadAssets() {
  const files = ['world', 'anims', 'hero', 'heroine', 'hairs', 'ual', 'knight', 'rogue', 'barbarian', 'mage', 'skeleton_minion', 'skeleton_warrior', 'fox'];
  let done = 0;
  await Promise.all(files.map(f => loader.loadAsync(`assets/${f}.glb`).then(g => { A[f] = g; ui.loading.progress = ++done / files.length; })));
  A.scenes = Object.fromEntries(A.world.scenes.map(s => [s.name, s]));
}

// Obstacles live in a grid of OB_CELL cells; each is filed under every cell its circle (plus a margin
// for the mover's own radius) touches, so a lookup only reads the mover's cell.
const obstacles = [];
const OB_CELL = 8, OB_MARGIN = 2, obGrid = new Map(), NO_OBS = [];
const obKey = (i, j) => (i + 512) * 1024 + (j + 512);
function addObs(x, z, r) {
  const o = { x, z, r }; obstacles.push(o);
  const m = r + OB_MARGIN;
  for (let i = Math.floor((x - m) / OB_CELL); i <= Math.floor((x + m) / OB_CELL); i++)
    for (let j = Math.floor((z - m) / OB_CELL); j <= Math.floor((z + m) / OB_CELL); j++) {
      const k = obKey(i, j); let l = obGrid.get(k); if (!l) obGrid.set(k, l = []); l.push(o);
    }
}
const obsAround = (x, z) => obGrid.get(obKey(Math.floor(x / OB_CELL), Math.floor(z / OB_CELL))) || NO_OBS;
function obsNear(x, z, pad) {
  for (let i = Math.floor((x - pad) / OB_CELL); i <= Math.floor((x + pad) / OB_CELL); i++)
    for (let j = Math.floor((z - pad) / OB_CELL); j <= Math.floor((z + pad) / OB_CELL); j++)
      for (const o of obGrid.get(obKey(i, j)) || NO_OBS) if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
  return false;
}
const world = { npcs: [], checkpoints: [], arenas: new Map() };
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3a = new THREE.Vector3(), v3s = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
// Instanced scenery, split into CHUNK-sized squares so the camera only draws the chunks it sees.
const CHUNK = 64;
const tintedMats = new Map();
function tinted(m, [mul, glow]) {
  const k = m.uuid + mul + ':' + glow;
  if (!tintedMats.has(k)) { const c = m.clone(); c.color.multiply(new THREE.Color(mul)); if (glow) c.emissive = new THREE.Color(glow); tintedMats.set(k, c); }
  return tintedMats.get(k);
}
function inst(name, items, { shadow = true, tint } = {}) {
  const src = A.scenes[name];
  if (!src || !items.length) return;
  src.updateMatrixWorld(true);
  const groups = new Map();
  for (const it of items) { const k = obKey(Math.floor(it.x / CHUNK), Math.floor(it.z / CHUNK)); let l = groups.get(k); if (!l) groups.set(k, l = []); l.push(it); }
  src.traverse(o => {
    if (!o.isMesh) return;
    const material = tint ? tinted(o.material, tint) : o.material;
    for (const list of groups.values()) {
      const im = new THREE.InstancedMesh(o.geometry, material, list.length);
      list.forEach((it, i) => { q4.setFromAxisAngle(yAxis, it.ry || 0); m4.compose(v3a.set(it.x, it.y || 0, it.z), q4, v3s.setScalar(it.s)).multiply(o.matrixWorld); im.setMatrixAt(i, m4); });
      im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
      scene.add(im);
    }
  });
}

function buildGround() {
  // 10 x 10 tiles so off-screen ground is culled; ~2.2 units between vertices.
  const N = 10, size = (HALF * 2 + 60) / N, seg = 38;
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const c = new THREE.Color();
  for (let ti = 0; ti < N; ti++) for (let tj = 0; tj < N; tj++) {
    const cx = -HALF - 30 + (ti + 0.5) * size, cz = -HALF - 30 + (tj + 0.5) * size;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2); g.translate(cx, 0, cz);
    const pos = g.attributes.position; const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const k = groundColor(x, z);
      c.setRGB(k[0], k[1], k[2], THREE.SRGBColorSpace);
      cols.set([c.r, c.g, c.b], i * 3);
      if (inWater(x, z) || Math.abs(x - riverX(z)) < RIVER_HW - 0.3) pos.setY(i, -0.6);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const ground = new THREE.Mesh(g, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  const verts = [], idx = [];
  const zs = []; for (let z = -HALF - 30; z <= HALF + 30; z += 3) zs.push(z);
  zs.forEach((z, i) => { const x = riverX(z); verts.push(x - RIVER_HW - 0.4, -0.12, z, x + RIVER_HW + 0.4, -0.12, z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  world.water = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x46b4ea, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82 }));
  world.water.receiveShadow = true; scene.add(world.water);

  const wood = mat(0x9a6a3e), dark = mat(0x6e4a2a);
  for (const bz of BRIDGES) {
    const br = new THREE.Group(); br.position.set(riverX(bz), 0, bz); scene.add(br);
    for (let i = -5; i <= 5; i++) mesh(new THREE.BoxGeometry(0.82, 0.2, 4.6), wood, i * 0.9, 0.12 + Math.cos(i / 5 * 1.2) * 0.25, 0, br).rotation.z = -Math.sin(i / 5 * 1.2) * 0.12;
    for (const s of [-2.35, 2.35]) for (let i = -4; i <= 4; i += 2) mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), dark, i * 0.95, 0.6, s, br);
    for (const s of [-2.35, 2.35]) mesh(new THREE.BoxGeometry(8, 0.16, 0.16), dark, 0, 1.08, s, br);
  }
  const lilies = [], plants = [];
  for (let z = -HALF; z < HALF; z += 2.5) {
    if (BRIDGES.some(b => Math.abs(z - b) < 4)) continue;
    if (rand() < 0.35) lilies.push({ x: riverX(z) + rr(-2.4, 2.4), z, y: -0.1, s: rr(6, 9), ry: rr(0, 6) });
    if (rand() < 0.3) plants.push({ x: riverX(z) + pick([-1, 1]) * rr(RIVER_HW - 0.4, RIVER_HW + 0.4), z, y: -0.15, s: rr(7, 10), ry: rr(0, 6) });
  }
  inst('waterlily_A', lilies, { shadow: false });
  inst('waterplant_A', plants);
}

const HUMAN_HIDE = {
  knight: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword'],
  rogue: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
  barbarian: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug', '2H_Axe'],
  mage: ['Spellbook', 'Spellbook_open', '1H_Wand'],
};
const NPC_LOOK = {
  weapon: { model: 'barbarian', show: ['1H_Axe'], icon: 'storefront', color: 0xffd36b },
  armor: { model: 'knight', show: ['Round_Shield'], icon: 'shield', color: 0x8cc4ff },
  potion: { model: 'mage', show: [], icon: 'science', color: 0xff7a9a },
  arena: { model: 'knight', show: ['2H_Sword'], icon: 'stadium', color: 0xff8a4a, tint: 0xffb0a0 },
  purge: { model: 'mage', show: [], icon: 'auto_fix_off', color: 0xb36bff, tint: 0xc8a8ff },
  shrine: { model: 'mage', show: ['1H_Wand'], icon: 'auto_awesome', color: 0x5fd8ff, tint: 0xa8e8ff },
};
// The shrine: a stone dais ringed by pillars, each topped by a floating crystal in a power's color.
function buildShrine() {
  const g = new THREE.Group(); g.position.set(SHRINE.x, 0, SHRINE.z); scene.add(g);
  mesh(new THREE.CylinderGeometry(7, 7.6, 0.5, 10), mat(0xb8b2a4), 0, 0.25, 0, g);
  mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.4, 10), mat(0xd4cebe), 0, 0.6, 0, g);
  world.shrineGems = [];
  const cols = [0xff6a2a, 0x8fd8ff, 0xffe24a, 0x7a4ad8, 0x3ae08a, 0xffd0f0];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 6, z = Math.sin(a) * 6;
    mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.2, 6), mat(0x9a948a), x, 1.6, z, g);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: cols[i], emissive: cols[i], emissiveIntensity: 0.6, roughness: 0.25 }));
    gem.position.set(x, 3.8, z); g.add(gem); world.shrineGems.push(gem);
    addObs(SHRINE.x + x, SHRINE.z + z, 0.7);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x5fd8ff, emissiveIntensity: 0.8, roughness: 0.2 }));
  core.position.set(0, 3, 0); g.add(core); world.shrineCore = core;
  addObs(SHRINE.x, SHRINE.z, 1);
}
function buildVillage() {
  buildShrine();
  inst('building_well_blue', [{ x: 0, z: 0, s: 4, ry: 0.3 }]);
  addObs(0, 0, 1.5);
  const props = [];
  for (const b of VILLAGE_BUILDINGS) {
    inst(b.name, [{ x: b.x, z: b.z, s: 4.4, ry: Math.atan2(-b.x, -b.z) }]);
    addObs(b.x, b.z, 2.4);
    const side = b.a + 0.32;
    props.push({ n: pick(['barrel', 'crate_A_big', 'sack', 'crate_B_small']), x: Math.cos(side) * 10, z: Math.sin(side) * 10, s: 5.5, ry: rr(0, 6) });
  }
  const byName = {};
  for (const p of props) (byName[p.n] ||= []).push(p);
  for (const [nm, list] of Object.entries(byName)) inst(nm, list);
  for (const p of props) addObs(p.x, p.z, 0.6);
  inst('flag_blue', [{ x: 4.5, z: -14.5, s: 6 }, { x: -14, z: -5, s: 6, ry: 1 }]);
  for (const n of NPCS) {
    const look = NPC_LOOK[n.role];
    const rig = new Rig(A[look.model], A.anims.animations, 0.85, { hide: HUMAN_HIDE[look.model], tint: look.tint });
    for (const s of look.show) if (rig.nodes[s]) rig.nodes[s].visible = true;
    rig.root.position.set(n.x, 0, n.z); rig.root.rotation.y = Math.atan2(-n.x, -n.z);
    rig.play('Idle'); rig.mixer.setTime(Math.random() * 3);
    scene.add(rig.root);
    const mk = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: look.color, emissive: look.color, emissiveIntensity: 0.5, roughness: 0.3 }));
    mk.position.set(n.x, 2.75, n.z); scene.add(mk);
    addObs(n.x, n.z, 0.6);
    world.npcs.push({ ...n, rig, mk, look });
  }
}

function buildCheckpoints() {
  // The village edge: a glowing band on the ground. Past it players can fight each other.
  const edge = new THREE.Mesh(new THREE.RingGeometry(VILLAGE_R - 0.35, VILLAGE_R, 160),
    new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.45, depthWrite: false }));
  edge.rotation.x = -Math.PI / 2; edge.position.y = 0.06; scene.add(edge);
  const ringGeo = new THREE.RingGeometry(SAFE_R - 0.15, SAFE_R, 64);
  const flags = [];
  for (const c of CHECKPOINTS) {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); scene.add(g);
    mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.5, 8), mat(0x9a9aa6), 0, 0.25, 0, g);
    mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.1, 6), mat(0x8a8a96), 0, 1, 0, g);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, emissive: 0x000000, roughness: 0.25 }));
    crystal.position.y = 2.1; crystal.scale.y = 1.6; crystal.castShadow = true; g.add(crystal);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.18, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    flags.push({ x: c.x + 1.6, z: c.z - 0.6, s: 6, ry: 0.5 });
    addObs(c.x, c.z, 1.1);
    world.checkpoints.push({ ...c, crystal });
    // Quest board: two posts, a plank, a floating gold marker.
    const bx = c.x + BOARD_OFF.x, bz = c.z + BOARD_OFF.z;
    const bg = new THREE.Group(); bg.position.set(bx, 0, bz); bg.rotation.y = 0.35; scene.add(bg);
    for (const sx of [-0.75, 0.75]) mesh(new THREE.BoxGeometry(0.16, 1.9, 0.16), mat(0x6e4a2a), sx, 0.95, 0, bg);
    mesh(new THREE.BoxGeometry(1.9, 1.1, 0.14), mat(0x9a6a3e), 0, 1.45, 0, bg);
    for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.42, 0.5, 0.02), mat(0xf2e6c8), -0.55 + i * 0.55, 1.45, 0.08, bg).rotation.z = (i - 1) * 0.08;
    const mk = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffb020, emissiveIntensity: 0.7, roughness: 0.3 }));
    mk.position.set(bx, 2.75, bz); scene.add(mk);
    addObs(bx, bz, 0.7);
    world.npcs.push({ role: 'quest', board: c.id, x: bx, z: bz, rig: null, mk, look: { icon: 'assignment', color: 0xffd36b } });
  }
  inst('flag_blue', flags);
}

function buildNature() {
  const items = {};
  // Items are grouped by model and region so each region's copies can be tinted (snowy, scorched...).
  const add = (nm, it, r, region = 'core') => { const k = `${nm}|${region}`; (items[k] ||= []).push(it); if (r) addObs(it.x, it.z, r); };
  const free = (x, z, pad) => {
    if (Math.hypot(x, z) < VILLAGE_R + 3) return false;
    if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 12) return false;
    if (Math.abs(x - riverX(z)) < RIVER_HW + 2.2) return false;
    // pad is roughly the object's own radius, so big rocks keep clear of camps, lairs and paths.
    for (const c of CAMPS) if (Math.abs(x - c.x) < c.r + 6 + pad && Math.hypot(x - c.x, z - c.z) < c.r + 4 + pad) return false;
    for (const c of CHECKPOINTS) if (Math.abs(x - c.x) < SAFE_R + 1 && Math.hypot(x - c.x, z - c.z) < SAFE_R + 1) return false;
    if (pathDist(x, z) < 3.6 + pad * 0.8) return false;
    if (landmarkAt(x, z, pad + 2)) return false;
    if (CHESTS.some(c => Math.abs(x - c.x) < 3 + pad && Math.hypot(x - c.x, z - c.z) < 3 + pad)) return false;
    return !obsNear(x, z, pad);
  };
  world.props = buildRegionProps({ scene, addObs, free, regionAt, rand, isForest: (x) => x < -40 });
  const TREE_DENSITY = { swamp: 0.8, desert: 0.03, snow: 0.35, volcano: 0.05 };
  let trees = 0;
  for (let t = 0; t < 140000 && trees < 4200; t++) {
    const x = rr(-HALF + 2, HALF - 2), z = rr(-HALF + 2, HALF - 2);
    const region = regionAt(x, z);
    const forest = region === 'swamp' || (region === 'core' && x < -40), east = x > riverX(z) + 6, rocky = region === 'core' && isRocky(x, z);
    const dens = region === 'core' ? (forest ? 0.9 : rocky ? 0.12 : east ? 0.18 : 0.25) : TREE_DENSITY[region];
    if (rand() > dens) continue;
    if ((forest || region === 'snow') && rand() < 0.75) {
      const s = rr(3.2, 4.2);
      if (!free(x, z, 0.85 * s)) continue;
      add(pick(['trees_A_large', 'trees_A_medium', 'trees_B_large', 'trees_B_medium']), { x, z, s, ry: rr(0, 6) }, 0.8 * s, region);
    } else {
      const s = rr(3.6, 4.6);
      if (!free(x, z, 1.4)) continue;
      add(rocky || region === 'volcano' || region === 'desert' ? 'tree_single_A' : pick(['tree_single_A', 'tree_single_B', 'tree_single_B']), { x, z, s, ry: rr(0, 6) }, 0.32 * s, region);
    }
    trees++;
  }
  const ROCK_DENSITY = { swamp: 0.04, desert: 0.2, snow: 0.18, volcano: 0.7 };
  let rocks = 0;
  for (let t = 0; t < 60000 && rocks < 1600; t++) {
    const x = rr(-HALF + 2, HALF - 2), z = rr(-HALF + 2, HALF - 2);
    const region = regionAt(x, z), rocky = region === 'volcano' || (region === 'core' && isRocky(x, z));
    if (rand() > (region === 'core' ? (rocky ? 0.8 : 0.05) : ROCK_DENSITY[region])) continue;
    const big = rocky && rand() < 0.25;
    const s = big ? rr(4.5, 6.5) : rr(6, rocky ? 12 : 9);
    if (!free(x, z, big ? 0.9 * s : 0.2 * s)) continue;
    if (big) add(pick(['mountain_A', 'mountain_B']), { x, z, s, ry: rr(0, 6) }, 0.8 * s, region);
    else add(pick(['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E']), { x, z, s, ry: rr(0, 6) }, 0.17 * s, region);
    rocks++;
  }
  // Rolling hills (not in the desert, swamp or volcano).
  for (let t = 0; t < 25000 && (trees = (items['hill_single_A|core']?.length || 0) + (items['hill_single_A|desert']?.length || 0) + (items['hill_single_A|snow']?.length || 0)) < 420; t++) {
    const x = rr(-HALF, HALF), z = rr(-HALF, HALF);
    const region = regionAt(x, z);
    if (region === 'volcano' || region === 'swamp' || region === 'desert' || (region === 'core' && isRocky(x, z)) || !free(x, z, 1)) continue;
    if (region === 'core' && rand() < 0.3) continue;
    add('hill_single_A', { x, z, s: rr(5, 8), ry: rr(0, 6), y: -0.05 }, 0, region);
  }
  for (let i = -HALF - 8; i <= HALF + 8; i += 11) for (const [x, z] of [[i, -HALF - 6], [i, HALF + 6], [-HALF - 6, i], [HALF + 6, i]])
    add(pick(['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees']), { x: x + rr(-2, 2), z: z + rr(-2, 2), s: rr(8, 11), ry: rr(0, 6) }, 0, regionAt(x * 0.95, z * 0.95));
  for (const [k, list] of Object.entries(items)) { const [nm, region] = k.split('|'); inst(nm, list, { tint: REGION_TINT[region] }); }

  const tufts = [], flowers = [];
  for (let t = 0; t < 30000 && tufts.length < 9000; t++) {
    const x = rr(-HALF, HALF), z = rr(-HALF, HALF);
    const region = regionAt(x, z);
    if ((region !== 'core' && region !== 'swamp') || Math.abs(x - riverX(z)) < RIVER_HW + 1 || inVillage(x, z) || isRocky(x, z) || pathDist(x, z) < 2 || landmarkAt(x, z, 1)) continue;
    (region === 'core' && rand() < 0.2 ? flowers : tufts).push({ x, z, s: rr(0.7, 1.3), r: rr(0, 6) });
  }
  const dummy = new THREE.Object3D();
  const tuftG = new THREE.ConeGeometry(0.1, 0.55, 3); tuftG.translate(0, 0.27, 0);
  const tm = new THREE.InstancedMesh(tuftG, mat(0x6fb43f), tufts.length * 3);
  let ti = 0;
  for (const t of tufts) for (let j = 0; j < 3; j++) { dummy.position.set(t.x + Math.cos(j * 2.1) * 0.15, 0, t.z + Math.sin(j * 2.1) * 0.15); dummy.rotation.set(Math.cos(j * 2.1 + t.r) * 0.3, t.r, Math.sin(j * 2.1) * 0.3); dummy.scale.setScalar(t.s); dummy.updateMatrix(); tm.setMatrixAt(ti++, dummy.matrix); }
  scene.add(tm);
  const fm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), flowers.length);
  const fc = [0xffe14d, 0xff7fb0, 0xffffff, 0xb59cff, 0xff8a4d].map(c => new THREE.Color(c));
  flowers.forEach((t, i) => { dummy.position.set(t.x, 0.3, t.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); fm.setMatrixAt(i, dummy.matrix); fm.setColorAt(i, fc[i % fc.length]); });
  scene.add(fm);

  // Camp dressing, by the kind of monster living there.
  const camp = (types, fn) => CAMPS.filter(c => types.includes(c.type)).forEach(fn);
  const tents = [], barrels = [], crates = [], racks = [], flags = [], lumber = [], fires = [];
  camp(['rogue', 'barbarian', 'bandit', 'raider'], c => {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.5, x = c.x + Math.cos(a) * (c.r + 2), z = c.z + Math.sin(a) * (c.r + 2);
      tents.push({ x, z, s: 7, ry: Math.atan2(c.x - x, c.z - z) }); addObs(x, z, 1.9);
      const b = a + 0.55; barrels.push({ x: c.x + Math.cos(b) * (c.r + 1), z: c.z + Math.sin(b) * (c.r + 1), s: 5.5 });
      crates.push({ x: c.x + Math.cos(b + 0.2) * (c.r + 2.4), z: c.z + Math.sin(b + 0.2) * (c.r + 2.4), s: 5.5, ry: rr(0, 3) });
    }
    racks.push({ x: c.x + 2.2, z: c.z - c.r - 1, s: 6 });
    flags.push({ x: c.x - 3, z: c.z - c.r - 1.5, s: 7 });
    lumber.push({ x: c.x + c.r, z: c.z + 1, s: 5, ry: 1.2 });
    fires.push(c);
  });
  inst('tent', tents); inst('barrel', barrels); inst('crate_A_big', crates); inst('weaponrack', racks); inst('flag_red', flags); inst('resource_lumber', lumber);
  world.fires = fires.map(c => {
    addObs(c.x, c.z, 0.9);
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); scene.add(g);
    for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 5), mat(0x5a3a22), 0, 0.12, 0, g).rotation.set(Math.PI / 2, 0, i * 1.25);
    const f1 = mesh(new THREE.ConeGeometry(0.45, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0xffa23a }), 0, 0.6, 0, g);
    const f2 = mesh(new THREE.ConeGeometry(0.25, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xfff08a }), 0, 0.5, 0, g);
    f1.castShadow = f2.castShadow = false;
    return { f1, f2 };
  });
  const stones = [], ruins = [];
  camp(['minion', 'frostknight', 'darkknight'], c => ruins.push({ x: c.x - c.r - 3, z: c.z + 3, s: 5.5, ry: 0.6 }));
  camp(['warrior', 'mummy', 'witch'], c => ruins.push({ x: c.x + c.r + 2, z: c.z - 4, s: 5.5, ry: 2.2 }));
  for (const r of ruins) addObs(r.x, r.z, 3);
  inst('building_destroyed', ruins);
  camp(['minion', 'warrior', 'mummy', 'frostskel', 'fireskel'], c => {
    for (let i = 0; i < 10; i++) {
      const a = rr(0, 6.28), d = rr(c.r * 0.9, c.r + 6), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (obsNear(x, z, 0.8)) continue;
      stones.push({ x, z, ry: rr(-0.3, 0.3) }); addObs(x, z, 0.5);
    }
  });
  const sg = new THREE.BoxGeometry(0.8, 1.1, 0.25); sg.translate(0, 0.55, 0);
  const sm = new THREE.InstancedMesh(sg, mat(0x9a9aa2), stones.length); sm.castShadow = true;
  stones.forEach((s, i) => { dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.ry, rr(-0.12, 0.12)); dummy.scale.setScalar(1); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); });
  scene.add(sm);
  // Every boss lair: a broken ring of pillars topped with crystals in the region's color.
  const LAIR = { boss: [0xb36bff, 0x6a22cc], archmage: [0x9a7aff, 0x3a1a8a], pharaoh: [0xffd36b, 0x8a5a00], frostking: [0x9ae6ff, 0x1a6a9a], demon: [0xff5a3a, 0x8a1a00] };
  camp(Object.keys(LAIR), c => {
    for (let i = 0; i < 9; i++) {
      if (i === 6) continue;
      const a = (i / 9) * Math.PI * 2, x = c.x + Math.cos(a) * (c.r + 3), z = c.z + Math.sin(a) * (c.r + 3);
      mesh(new THREE.CylinderGeometry(0.7, 0.85, 5, 8), mat(0x7a7682), x, 2.5, z);
      mesh(new THREE.OctahedronGeometry(0.55), mat(LAIR[c.type][0], { emissive: LAIR[c.type][1], roughness: 0.3 }), x, 5.7, z);
      addObs(x, z, 1);
    }
  });
}

function buildArena(slot) {
  if (world.arenas.has(slot)) return;
  const c = ARENA.center(slot);
  const g = new THREE.Group(); g.position.set(c.x, 0, c.z); scene.add(g);
  const base = new THREE.Mesh(new THREE.CircleGeometry(60, 48), mat(0x3d4636)); base.rotation.x = -Math.PI / 2; base.position.y = -0.4; base.receiveShadow = true; g.add(base);
  const floor = mesh(new THREE.CylinderGeometry(ARENA.r + 1, ARENA.r + 1.6, 0.6, 64), mat(0xb9ab92), 0, -0.3, 0, g);
  floor.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.RingGeometry(ARENA.r * 0.45, ARENA.r * 0.48, 64), new THREE.MeshBasicMaterial({ color: 0x8a7a5e })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.02; g.add(inner);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, x = Math.cos(a) * (ARENA.r + 1.3), z = Math.sin(a) * (ARENA.r + 1.3);
    mesh(new THREE.BoxGeometry(1, i % 2 ? 2.2 : 3.4, 1), mat(0x8c8678), x, i % 2 ? 1.1 : 1.7, z, g);
    if (!(i % 4)) { const f = mesh(new THREE.ConeGeometry(0.35, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xffa23a }), x, 3.8, z, g); f.castShadow = false; }
  }
  world.arenas.set(slot, g);
}

class Rig {
  constructor(src, clips, scale, { hide = [], tint, emissive, alias } = {}) {
    this.root = new THREE.Group();
    this.model = cloneSkinned(src.scene);
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.nodes = {};
    this.mats = [];
    this.model.traverse(o => {
      this.nodes[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        o.material.userData.baseColor = o.material.color.clone();
        if (tint) o.material.color.multiply(new THREE.Color(tint));
        if (emissive) o.material.emissive.setHex(emissive);
        o.material.userData.baseEmissive = o.material.emissive.clone();
        this.mats.push(o.material);
      }
    });
    for (const nm of hide) if (this.nodes[nm]) this.nodes[nm].visible = false;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    if (alias) {
      // Each game name gets its own copy of the clip, so `clip` (sent to other players) stays the game name.
      const byName = Object.fromEntries(clips.map(c => [c.name, c]));
      for (const [name, real] of Object.entries(alias)) {
        const c = byName[real]; if (!c) continue;
        const k = c.clone(); k.name = name;
        this.actions[name] = this.mixer.clipAction(k);
      }
    } else for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.cur = null;
  }
  attach(bone, obj) { const b = this.nodes[bone]; if (b) b.add(obj); return obj; }
  play(name, { fade = 0.15, once = false, dur, restart = false, speed = 1 } = {}) {
    const a = this.actions[name]; if (!a) return;
    if (this.cur === a && !restart && !once) { a.timeScale = speed; return; }
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = dur ? a.getClip().duration / dur : speed;
    a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    a.play();
    this.cur = a;
  }
  get clip() { return this.cur ? this.cur.getClip().name : 'Idle'; }
  flash(k, color = 0xffffff) { for (const m of this.mats) { if (k <= 0) m.emissive.copy(m.userData.baseEmissive); else m.emissive.setHex(color).multiplyScalar(k); } }
}
function measureLength(obj) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3();
  obj.traverse(o => {
    if (o.isSkinnedMesh) { o.computeBoundingBox(); b.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    else if (o.isMesh) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  });
  const s = b.getSize(new THREE.Vector3());
  return Math.max(s.x, s.y, s.z);
}

const STYLE_UI = {
  melee: { icon: 'sports_mma', skillIcon: 'explosion', anims: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick'] },
  sword: { icon: 'swords', skillIcon: 'cyclone', anims: ['1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop'] },
  power: { icon: 'auto_awesome', anims: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick'] },
};
const STYLE_ORDER = ['melee', 'sword', 'power'];
const ONCE_ANIMS = new Set([...STYLE_UI.melee.anims, ...STYLE_UI.sword.anims, '2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop', 'Hit_A', 'Death_A', 'Cast_A',
  'Roll', 'Jump_Start', 'Jump_Land', 'Spell_Enter', 'Spell_Exit']);
const ENEMY_LOOK = {
  slime: { kind: 'slime', hue: [0.27, 0.36], burst: 0x8dff7a },
  bog: { kind: 'slime', hue: [0.74, 0.82], burst: 0xb88aff },
  magma: { kind: 'slime', hue: [0.02, 0.07], glow: 0.35, burst: 0xff8a3a },
  fox: { kind: 'fox' },
  sandfox: { kind: 'fox', tint: 0xffe2a8 },
  icefox: { kind: 'fox', tint: 0xdff2ff },
  rogue: { model: 'rogue', scale: 0.85, atk: '1H_Melee_Attack_Chop', idle: 'Idle' },
  bandit: { model: 'rogue', scale: 0.9, atk: '1H_Melee_Attack_Chop', idle: 'Idle', tint: 0x88b07a },
  barbarian: { model: 'barbarian', scale: 0.95, atk: '2H_Melee_Attack_Chop', idle: 'Idle', show: ['2H_Axe'] },
  raider: { model: 'barbarian', scale: 0.95, atk: '1H_Melee_Attack_Chop', idle: 'Idle', show: ['1H_Axe'], tint: 0xf0d0a0 },
  witch: { model: 'mage', scale: 0.9, atk: '1H_Melee_Attack_Chop', idle: 'Idle', show: ['1H_Wand'], tint: 0xb89aff },
  archmage: { model: 'mage', scale: 2, atk: '2H_Melee_Attack_Chop', idle: 'Idle', show: ['1H_Wand'], tint: 0x9a7aff, emissive: 0x2a0a50 },
  minion: { model: 'skeleton_minion', scale: 0.85, atk: 'Unarmed_Melee_Attack_Punch_A', idle: 'Unarmed_Idle', bone: true },
  mummy: { model: 'skeleton_minion', scale: 0.9, atk: 'Unarmed_Melee_Attack_Punch_A', idle: 'Unarmed_Idle', bone: true, tint: 0xf0dcb0 },
  frostskel: { model: 'skeleton_minion', scale: 0.9, atk: 'Unarmed_Melee_Attack_Punch_A', idle: 'Unarmed_Idle', bone: true, tint: 0xb0dcff, emissive: 0x0a2a4a },
  warrior: { model: 'skeleton_warrior', scale: 0.95, atk: '1H_Melee_Attack_Chop', idle: 'Idle', bone: true, attach: [['handslotr', 'knight', '1H_Sword'], ['handslotl', 'knight', 'Round_Shield']] },
  fireskel: { model: 'skeleton_warrior', scale: 0.95, atk: '1H_Melee_Attack_Chop', idle: 'Idle', bone: true, tint: 0xff9a70, emissive: 0x3a0a00, attach: [['handslotr', 'barbarian', '1H_Axe']] },
  boss: { model: 'skeleton_warrior', scale: 2.1, atk: '2H_Melee_Attack_Chop', idle: 'Idle', emissive: 0x2a0a40, bone: true, attach: [['handslotr', 'barbarian', '2H_Axe']] },
  pharaoh: { model: 'skeleton_warrior', scale: 2.1, atk: '2H_Melee_Attack_Chop', idle: 'Idle', tint: 0xffd890, emissive: 0x3a2a00, bone: true, attach: [['handslotr', 'knight', '2H_Sword']] },
  frostknight: { model: 'knight', scale: 0.95, atk: '1H_Melee_Attack_Chop', idle: 'Idle', show: ['1H_Sword', 'Round_Shield'], tint: 0xb8e4ff },
  darkknight: { model: 'knight', scale: 0.95, atk: '1H_Melee_Attack_Chop', idle: 'Idle', show: ['1H_Sword', 'Spike_Shield'], tint: 0x6a5a80, emissive: 0x1a0a20 },
  frostking: { model: 'knight', scale: 2.2, atk: '2H_Melee_Attack_Chop', idle: 'Idle', show: ['2H_Sword'], tint: 0xd8f2ff, emissive: 0x0a3a5a },
  demon: { model: 'barbarian', scale: 2.3, atk: '2H_Melee_Attack_Chop', idle: 'Idle', show: ['2H_Axe'], tint: 0xff7a6a, emissive: 0x4a0a00 },
};
const MASTERY_INFO = { melee: ['Võ Thuật', 'sports_mma'], sword: ['Kiếm Thuật', 'swords'], power: ['Sức Mạnh', 'auto_awesome'] };

let prog = defaultProgress();
let me = { id: 0, name: '', rating: 1000, wins: 0, losses: 0 };
let net = { send() { } };
let hudDirty = true;

const P = { x: 0, z: 6, rot: Math.PI, hp: 100, mhp: 100, atkCd: 0, combo: 0, comboT: 0, actT: 0, mvCd: { melee: [0, 0], sword: [0, 0], power: [0, 0, 0, 0] }, shieldT: 0, potCd: 0, dash: null, leap: null, dead: false, deadT: 0,
  shake: 0, r: 0.45, flash: 0, pending: [], kx: 0, kz: 0, arena: null, cpSent: 0 };
let player;

/* ---- People ----------------------------------------------------------------------------------
 * Players are Quaternius' base characters (CC0), male or female, picked in the character creator
 * with hair, eyes, skin and a scarf. Clothes are painted over the body per vertex: each vertex takes
 * the region of its strongest bone (shirt, sleeve, pants, skin, boots) and the shader mixes that
 * cloth color over the skin where the mask is 1. On top go a few adventurer pieces: scarf, belt,
 * strap, knee pads and boot cuffs, like a cartoon hero.
 */
const PANTS = 0x2f5fb8, BOOTS = 0xc0782c, LEATHER = 0x8a4a22;
const REGION = { shirt: 0, sleeve: 1, shorts: 2, skin: 3, shoes: 4 };
const BONE_REGION = { pelvis: 'shorts', thigh: 'shorts', calf: 'shorts', spine_01: 'shirt', spine_02: 'shirt', spine_03: 'shirt', clavicle: 'shirt',
  upperarm: 'sleeve', lowerarm: 'sleeve', foot: 'shoes', ball: 'shoes', ball_leaf: 'shoes' };
// Game animation names -> clips in ual.glb (Quaternius Universal Animation Library, CC0).
const HERO_ANIMS = {
  Idle: 'Sword_Idle', Unarmed_Idle: 'Idle_Loop', Walking_A: 'Walk_Loop', Running_A: 'Jog_Fwd_Loop',
  '1H_Melee_Attack_Chop': 'Sword_Attack', '1H_Melee_Attack_Slice_Horizontal': 'Sword_Attack', '1H_Melee_Attack_Slice_Diagonal': 'Sword_Attack',
  '2H_Melee_Attack_Spin': 'Sword_Attack', '2H_Melee_Attack_Chop': 'Sword_Attack',
  Unarmed_Melee_Attack_Punch_A: 'Punch_Jab', Unarmed_Melee_Attack_Punch_B: 'Punch_Cross', Unarmed_Melee_Attack_Kick: 'Punch_Cross',
  Hit_A: 'Hit_Chest', Death_A: 'Death01', Cast_A: 'Spell_Simple_Shoot',
  Roll: 'Roll', Jump_Start: 'Jump_Start', Jump_Land: 'Jump_Land', Spell_Enter: 'Spell_Simple_Enter', Spell_Exit: 'Spell_Simple_Exit', Dance: 'Dance_Loop',
};
const HERO_SCALE = 1.4;
// Where things sit on each body in its bind pose (model units), measured from the models.
const BODY = {
  m: { asset: 'hero', head: [0, 1.6, -0.017], neckY: 1.49, neckR: 0.085, belt: [1.01, -0.025, 0.168, 0.127], knee: [0.125, 0.52, 0.02], ankle: [0.115, 0.24, -0.07, 0.058] },
  f: { asset: 'heroine', head: [0, 1.55, -0.011], neckY: 1.455, neckR: 0.074, belt: [0.99, -0.04, 0.188, 0.126], knee: [0.11, 0.51, 0.01], ankle: [0.1, 0.23, -0.07, 0.052] },
};
const regionCache = new WeakMap();
function regionsOf(o) {
  let r = regionCache.get(o.geometry);
  if (r) return r;
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
  r = new Uint8Array(si.count);
  for (let i = 0; i < si.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    const bone = o.skeleton.bones[best]?.name.replace(/_[lr]$/, '') || '';
    r[i] = REGION[BONE_REGION[bone] || 'skin'];
  }
  regionCache.set(o.geometry, r);
  return r;
}
// The skin texture is a tan tone; this scales it toward the chosen one.
const SKIN_BASE = new THREE.Color().setRGB(0.42, 0.2, 0.09);
/** The body material, with vertex colors meaning "cloth color (rgb) over the skin, by mask (a)". */
function clothMaterial(base) {
  const m = base.clone();
  m.vertexColors = true;
  m.userData.skin = { value: new THREE.Color(1, 1, 1) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.skinTint = m.userData.skin;
    sh.fragmentShader = 'uniform vec3 skinTint;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#if defined( USE_COLOR_ALPHA )\n  diffuseColor.rgb = mix( min( diffuseColor.rgb * skinTint, vec3( 1.0 ) ), vColor.rgb, vColor.a );\n#endif');
  };
  m.customProgramCacheKey = () => 'cloth-over-skin';
  m.userData.baseEmissive = m.emissive.clone();
  return m;
}
const tmpColor = new THREE.Color();
function paint(rig, colors) {
  for (const { o, reg } of rig.paint) {
    const c = o.geometry.attributes.color;
    for (let i = 0; i < reg.length; i++) {
      const skin = reg[i] === REGION.skin;
      tmpColor.setHex(skin ? 0xffffff : colors[reg[i]]);
      c.setXYZW(i, tmpColor.r, tmpColor.g, tmpColor.b, skin ? 0 : 1);
    }
    c.needsUpdate = true;
  }
}
/** Eyes drawn on a canvas in the layout of the model's eye texture: iris centred, sclera around it. */
const eyeTex = new Map();
function eyeTexture(style, color) {
  const key = style + color;
  if (eyeTex.has(key)) return eyeTex.get(key);
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const sclera = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  sclera.addColorStop(0, '#ffffff'); sclera.addColorStop(0.6, '#f3eeec'); sclera.addColorStop(1, '#d9b9b0');
  g.fillStyle = sclera; g.fillRect(0, 0, S, S);
  const R = { round: 34, sparkle: 38, sharp: 27, cat: 33 }[style];
  const col = new THREE.Color(color), dark = col.clone().multiplyScalar(0.35), light = col.clone().lerp(new THREE.Color(1, 1, 1), 0.35);
  const iris = g.createRadialGradient(128, 136, R * 0.15, 128, 128, R);
  iris.addColorStop(0, `#${light.getHexString()}`); iris.addColorStop(0.7, `#${col.getHexString()}`); iris.addColorStop(1, `#${dark.getHexString()}`);
  g.fillStyle = iris; g.beginPath();
  if (style === 'sharp') g.ellipse(128, 128, R * 0.95, R, 0, 0, 6.3); else g.arc(128, 128, R, 0, 6.3);
  g.fill();
  g.lineWidth = 3; g.strokeStyle = `#${dark.getHexString()}`; g.stroke();
  g.fillStyle = '#0c0a10'; g.beginPath();
  if (style === 'cat') g.ellipse(128, 128, R * 0.16, R * 0.78, 0, 0, 6.3); else g.arc(128, 128, R * (style === 'sharp' ? 0.36 : 0.44), 0, 6.3);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.95)';
  g.beginPath(); g.arc(128 - R * 0.35, 128 - R * 0.38, R * (style === 'sparkle' ? 0.3 : 0.22), 0, 6.3); g.fill();
  if (style !== 'sharp') { g.beginPath(); g.arc(128 + R * 0.38, 128 + R * 0.34, R * (style === 'sparkle' ? 0.16 : 0.1), 0, 6.3); g.fill(); }
  if (style === 'sparkle') {
    g.beginPath(); g.arc(128 + R * 0.05, 128 - R * 0.55, R * 0.08, 0, 6.3); g.fill();
    g.globalAlpha = 0.35; g.fillStyle = `#${light.getHexString()}`; g.beginPath(); g.ellipse(128, 128 + R * 0.55, R * 0.6, R * 0.25, 0, 0, 6.3); g.fill(); g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  eyeTex.set(key, t);
  return t;
}
// A katana, built from a few shapes: curved single-edged blade, round guard, cord-wrapped grip.
// Its local +Y runs from the grip to the tip; the hand bone holds it at the grip.
function buildKatana() {
  const g = new THREE.Group();
  const L = 0.86, W = 0.034;
  const blade = new THREE.Shape();
  blade.moveTo(0, 0); blade.lineTo(W, 0);
  blade.quadraticCurveTo(W + 0.03, L * 0.55, W * 0.35 + 0.045, L);   // cutting edge, gently curved
  blade.lineTo(0.035, L - 0.02);
  blade.quadraticCurveTo(0.028, L * 0.55, 0, 0);                    // back of the blade
  const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1, curveSegments: 10 });
  bladeGeo.translate(-W / 2, 0.035, -0.004);
  g.userData.blade = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0xe6edf5, metalness: 0.9, roughness: 0.22 }));
  g.userData.blade.material.userData.baseEmissive = new THREE.Color(0);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.8, roughness: 0.35 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 0.9 });
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 18), gold);
  guard.position.y = 0.028;
  const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), gold);
  habaki.position.y = 0.05;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.27, 10), wrap);
  grip.position.y = -0.115;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.019, 0.022, 10), gold);
  cap.position.y = -0.26;
  for (const o of [g.userData.blade, guard, habaki, grip, cap]) { o.castShadow = true; g.add(o); }
  // Diamond cord pattern on the grip.
  const knot = new THREE.Mesh(new THREE.OctahedronGeometry(0.012), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }));
  for (let i = 0; i < 6; i++) { const k = knot.clone(); k.position.set(0, -0.22 + i * 0.042, 0.017); k.scale.set(1, 1.3, 0.5); g.add(k); }
  return g;
}
const HAT_GEO = {
  cone: new THREE.ConeGeometry(0.95, 0.5, 20, 1, true),
  band: new THREE.CylinderGeometry(0.6, 0.62, 0.2, 16, 1, true),
  brim3: new THREE.CylinderGeometry(0.9, 0.9, 0.1, 3),
  crown: new THREE.CylinderGeometry(0.48, 0.4, 0.42, 16, 1, true),
  cap: new THREE.CylinderGeometry(0.5, 0.56, 0.4, 16),
  spike: new THREE.ConeGeometry(0.08, 0.28, 5),
  gem: new THREE.OctahedronGeometry(0.11),
};
function buildHat(id) {
  const it = ITEMS[id], g = new THREE.Group();
  const m = mat(it.color, { emissive: it.emissive || 0, metalness: it.metal ? 0.6 : 0, roughness: it.metal ? 0.35 : 0.8, side: THREE.DoubleSide });
  const add = (geo, x, y, z, rx = 0, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); o.castShadow = true; g.add(o); return o; };
  if (id === 'ht_nonla') add(HAT_GEO.cone, 0, 1.12, 0.05);
  else if (id === 'ht_band') { add(HAT_GEO.band, 0, 0.82, 0.06, 0.12); add(new THREE.ConeGeometry(0.12, 0.35, 4), 0, 0.82, -0.62, -1.9); }
  else if (id === 'ht_tricorn') { add(HAT_GEO.brim3, 0, 1.02, 0.05, 0, Math.PI); add(HAT_GEO.cap, 0, 1.2, 0.05); }
  else if (id === 'ht_helm') {
    const dome = add(new THREE.SphereGeometry(0.66, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.72, 0.04);
    dome.scale.set(1, 1.05, 1.08);
    add(new THREE.CylinderGeometry(0.67, 0.69, 0.16, 20, 1, true), 0, 0.74, 0.04);
    add(new THREE.BoxGeometry(0.08, 0.22, 1.25), 0, 1.38, 0.02);           // crest
    add(new THREE.BoxGeometry(0.1, 0.42, 0.06), 0, 0.5, 0.7);              // nose guard
  }
  else if (id === 'ht_crown') { add(HAT_GEO.crown, 0, 1.2, 0.05); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(HAT_GEO.spike, Math.cos(a) * 0.44, 1.5, 0.05 + Math.sin(a) * 0.44); } }
  return g;
}
function buildTrinket(id) {
  const it = ITEMS[id];
  const m = new THREE.MeshStandardMaterial({ color: it.color, emissive: it.color, emissiveIntensity: 0.45, roughness: 0.3 });
  const o = new THREE.Mesh(id === 'ac_fang' ? new THREE.ConeGeometry(0.07, 0.24, 5) : HAT_GEO.gem, m);
  if (id === 'ac_fang') o.rotation.x = Math.PI;
  return o;
}
/** Attach obj to a bone so that it keeps world units, whatever scale the bone carries. */
function attachUnscaled(rig, bone, obj) {
  const b = rig.nodes[bone];
  if (!b) return obj;
  const holder = new THREE.Group();
  rig.model.updateMatrixWorld(true);
  const ws = new THREE.Vector3(); b.getWorldScale(ws);
  holder.scale.setScalar(rig.root.scale.x / ws.x);
  holder.add(obj); b.add(holder);
  return obj;
}
/**
 * A group on a bone in which children are placed in the model's own bind-pose coordinates (the
 * space the body was modelled in: +Y up, +Z forward), so they follow the bone from where they sit.
 */
function bindHolder(rig, bone, extra) {
  const b = rig.nodes[bone];
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  rig.model.updateMatrixWorld(true);
  holder.matrix.copy(b.matrixWorld).invert().multiply(rig.model.matrixWorld);
  if (extra) holder.matrix.multiply(extra);
  b.add(holder);
  return holder;
}
const accMat = (c, o) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o }); m.userData.baseEmissive = new THREE.Color(0); return m; };
function addTo(parent, geo, m, x, y, z, rig) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); if (rig && !rig.mats.includes(m)) rig.mats.push(m); return o; }
/** Hair from hairs.glb; a style made for the other body is moved and scaled to fit this head. */
function buildHair(rig, av, B) {
  const H = AVATAR.hair[av.hair], fit = BODY[H.fit];
  const k = H.fit === av.g ? 1 : av.g === 'f' ? 0.95 : 1.05;
  const m = new THREE.Matrix4().makeTranslation(...B.head).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-fit.head[0], -fit.head[1], -fit.head[2]));
  const holder = bindHolder(rig, 'Head', m);
  const hairMat = (o) => { const x = o.material.clone(); x.color.setHex(AVATAR.hairColor[av.hc]); x.userData.baseEmissive = x.emissive.clone(); rig.mats.push(x); return x; };
  const add = (node) => { const h = cloneSkinned(A.hairs.scene.getObjectByName(node)); h.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = hairMat(o); } }); holder.add(h); return h; };
  const hair = add(H.node);
  if (av.beard && av.g === 'm') add('Hair_Beard');
  // Spiky cartoon hair: tufts over a short cut, sweeping up and back.
  if (H.spikes) {
    const sm = accMat(AVATAR.hairColor[av.hc], { roughness: 0.6 });
    const [hx, hy, hz] = fit.head;
    const tuft = new THREE.ConeGeometry(0.045, 0.16, 5);
    const spots = [[0, 0.24, 0.07, -0.5, 0], [-0.06, 0.23, 0.05, -0.4, 0.4], [0.06, 0.23, 0.05, -0.4, -0.4], [0, 0.25, -0.02, -0.9, 0], [-0.07, 0.22, -0.03, -0.8, 0.7],
      [0.07, 0.22, -0.03, -0.8, -0.7], [-0.09, 0.17, 0.02, 0, 1.1], [0.09, 0.17, 0.02, 0, -1.1], [0, 0.2, -0.09, -1.4, 0], [-0.05, 0.21, 0.09, 0.3, 0.6]];
    for (const [x, y, z, rx, rz] of spots) { const t = addTo(hair, tuft, sm, hx + x, hy + y - 0.07, hz + z, rig); t.rotation.set(rx, 0, rz); }
  }
  return hair;
}
/** Scarf, belt, chest strap, knee pads, boot cuffs: the adventurer outfit worn over the clothes. */
function buildOutfit(rig, av, B) {
  const leather = accMat(LEATHER), metal = accMat(0xb8bcc4, { metalness: 0.7, roughness: 0.35 }), pad = accMat(0x8a8e96, { roughness: 0.55 });
  rig.mats.push(leather, metal, pad);
  const sc = AVATAR.scarf[av.sc];
  if (sc >= 0) {
    const cloth = accMat(sc, { roughness: 0.9 }); rig.mats.push(cloth);
    const neck = bindHolder(rig, 'spine_03');
    const ring = addTo(neck, new THREE.TorusGeometry(B.neckR, 0.04, 8, 18), cloth, 0, B.neckY, -0.03);
    ring.rotation.x = Math.PI / 2 + 0.3; ring.scale.set(1, 1.2, 1.3);
    // The knotted triangle hanging over the chest.
    const flap = addTo(neck, new THREE.ConeGeometry(0.1, 0.16, 3, 1), cloth, 0, B.neckY - 0.09, B.neckR * 0.75);
    flap.rotation.set(Math.PI + 0.35, 0, 0); flap.scale.set(1.15, 1, 0.35);
  }
  const hips = bindHolder(rig, 'pelvis');
  const [by, bz, rx, rz] = B.belt;
  const belt = addTo(hips, new THREE.TorusGeometry(1, 0.024, 6, 28), leather, 0, by, bz);
  belt.rotation.x = Math.PI / 2; belt.scale.set(rx + 0.012, rz + 0.012, 1);
  addTo(hips, new THREE.BoxGeometry(0.07, 0.055, 0.02), metal, 0, by, bz + rz + 0.012);
  addTo(hips, new THREE.BoxGeometry(0.06, 0.07, 0.04), leather, rx * 0.85, by - 0.02, bz + rz * 0.45).rotation.y = 0.9;
  if (av.g === 'm') {
    // Strap from the right shoulder across the chest to the left hip, with a metal clasp.
    const chest = bindHolder(rig, 'spine_02');
    const strap = addTo(chest, new THREE.BoxGeometry(0.045, 0.5, 0.014), leather, 0.0, 1.22, 0.128);
    strap.rotation.set(-0.12, 0, -0.62);
    addTo(chest, new THREE.BoxGeometry(0.04, 0.04, 0.012), metal, 0.0, 1.22, 0.138).rotation.z = -0.62;
  }
  for (const s of ['l', 'r']) {
    const sx = s === 'l' ? 1 : -1;
    const calf = bindHolder(rig, `calf_${s}`);
    const [kx, ky, kz] = B.knee;
    const kp = addTo(calf, new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pad, kx * sx, ky, kz + 0.01);
    kp.rotation.x = Math.PI / 2; kp.scale.set(1, 1, 0.45);
    const [ax, ay, az, ar] = B.ankle;
    const cuff = addTo(calf, new THREE.TorusGeometry(ar, 0.022, 6, 16), accMat(BOOTS), ax * sx, ay, az);
    cuff.rotation.x = Math.PI / 2; cuff.scale.set(1, 1.35, 1);
    rig.mats.push(cuff.material);
  }
}
function makeHuman(av = defaultAvatar('m')) {
  const B = BODY[av.g];
  const rig = new Rig(A[B.asset], A.ual.animations, HERO_SCALE, { alias: HERO_ANIMS });
  rig.av = avatarCode(av);
  rig.paint = [];
  const skin = new THREE.Color(AVATAR.skin[av.skin]);
  rig.model.traverse(o => {
    if (!o.isMesh) return;
    if (/Hair/.test(o.material.name)) o.material.color.setHex(AVATAR.hairColor[av.hc]).multiplyScalar(0.8);   // eyebrows
    if (/Eye/.test(o.material.name)) { o.material.map = eyeTexture(AVATAR.eyes[av.eye].id, AVATAR.eyeColor[av.ec]); o.material.roughness = 0.15; }
    if (!o.isSkinnedMesh || !/Superhero/.test(o.material.name)) return;
    const reg = regionsOf(o);
    o.geometry = o.geometry.clone();
    o.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(reg.length * 4), 4));
    const m = clothMaterial(o.material);
    m.normalScale.setScalar(0.35);
    m.userData.skin.value.setRGB(skin.r / SKIN_BASE.r, skin.g / SKIN_BASE.g, skin.b / SKIN_BASE.b);
    rig.mats[rig.mats.indexOf(o.material)] = m;
    o.material = m;
    rig.paint.push({ o, reg });
  });
  rig.hair = buildHair(rig, av, B);
  buildOutfit(rig, av, B);
  rig.sword = attachUnscaled(rig, 'hand_r', buildKatana());
  // In hand_r's frame the fingers run along +Y and the knuckles from pinky to index along +Z: the
  // blade leaves the fist on the thumb side (+Z) with its edge toward the knuckles (+Y).
  rig.sword.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  rig.sword.position.set(-0.03, 0.09, 0.08);
  rig.mats.push(rig.sword.userData.blade.material);
  const gg = new THREE.IcosahedronGeometry(0.075, 0);
  rig.gloves = ['hand_l', 'hand_r'].map(b => { const g = new THREE.Mesh(gg, mat(0xffffff)); g.castShadow = true; g.position.set(0, 0.07, 0); g.scale.set(1.15, 1.25, 1); return attachUnscaled(rig, b, g); });
  rig.hatSlot = attachUnscaled(rig, 'Head', new THREE.Group());
  rig.hatSlot.scale.setScalar(0.3); rig.hatSlot.position.set(0, -0.03, 0);
  rig.chestSlot = attachUnscaled(rig, 'spine_03', new THREE.Group());
  rig.chestSlot.position.set(0, 0.05, 0.16);
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.95, 1, 4).translate(0, -0.47, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.85 }));
  cape.material.userData.baseEmissive = new THREE.Color(0);
  cape.position.set(0, 0.18, -0.13); cape.rotation.x = 0.12; cape.castShadow = true;
  rig.cape = attachUnscaled(rig, 'spine_03', cape);
  // Shield bubble, shown while a shield move is up.
  rig.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  rig.bubble.position.y = 1.3; rig.bubble.visible = false; rig.root.add(rig.bubble);
  // A slightly larger head (hair and hat with it) reads better from the top-down camera and gives
  // a friendlier, cartoon look. Done last so everything on the head was placed at bind size.
  if (rig.nodes.Head) rig.nodes.Head.scale.setScalar(1.12);
  rig.lookKey = '';
  applyLook(rig, {});
  return rig;
}
const lookOf = (p) => ({ style: p.style, ...p.gear, power: p.power?.id });
function applyLook(rig, L) {
  const key = JSON.stringify(L);
  if (key === rig.lookKey) return;
  rig.lookKey = key;
  const sw = ITEMS[L.sword], gl = ITEMS[L.glove], sh = ITEMS[L.shirt] || ITEMS.sh_tee, hat = ITEMS[L.hat], acc = ITEMS[L.acc];
  const pw = POWER_BY_ID[L.power];
  rig.sword.visible = L.style === 'sword' && !!sw;
  if (sw) {
    const bm = rig.sword.userData.blade.material;
    bm.color.setHex(0xe6edf5).lerp(tmpColor.setHex(sw.color), 0.45); bm.emissive.setHex(sw.emissive || 0);
    bm.userData.baseEmissive = bm.emissive.clone();
  }
  // Fists glow in the power's color while fighting with it.
  const glow = L.style === 'power' && pw;
  for (const x of rig.gloves) {
    x.visible = (L.style === 'melee' && !!gl) || !!glow;
    x.material = glow ? mat(pw.color, { emissive: pw.color, roughness: 0.3 }) : gl ? mat(gl.color, { emissive: gl.emissive || 0, roughness: 0.5, metalness: gl.metal ? 0.6 : 0 }) : x.material;
  }
  const shoes = L.acc === 'ac_boots' ? acc.color : BOOTS;
  paint(rig, [sh.color, sh.color, PANTS, 0, shoes]);
  for (const { o } of rig.paint) { o.material.metalness = sh.metal ? 0.35 : 0; o.material.roughness = sh.metal ? 0.45 : 0.8; }
  rig.hatSlot.clear();
  if (hat) rig.hatSlot.add(buildHat(L.hat));
  rig.cape.visible = L.acc === 'ac_cape';
  if (rig.cape.visible) rig.cape.material.color.setHex(acc.color);
  rig.chestSlot.clear();
  if (acc && ['ac_amulet', 'ac_ring', 'ac_fang', 'ac_skull'].includes(L.acc)) rig.chestSlot.add(buildTrinket(L.acc));
}
const PLAYER_RING = (() => {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  // Small chevron on the ground ring: shows where the next hit will land.
  const tri = new THREE.Shape(); tri.moveTo(0, 0.32); tri.lineTo(-0.2, 0); tri.lineTo(0.2, 0); tri.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.8, depthWrite: false }));
  arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.045, 0.74);
  const g = new THREE.Group(); g.add(ring, arrow); return g;
})();
/** (Re)build the local player's body from their looks; keeps position and animation state. */
function buildPlayer(av = prog.avatar || defaultAvatar('m')) {
  const old = player;
  player = makeHuman(av);
  player.root.add(PLAYER_RING);
  if (old) { player.root.position.copy(old.root.position); player.root.rotation.copy(old.root.rotation); scene.remove(old.root); }
  scene.add(player.root);
  applyGear();
  player.play(idleAnim());
}
const idleAnim = () => (prog.style === 'sword' ? 'Idle' : 'Unarmed_Idle');
const applyGear = () => applyLook(player, lookOf(prog));

const remotes = new Map();
class Remote {
  constructor(id, name) {
    this.id = id; this.name = name || '';
    this.rig = makeHuman();
    this.x = this.tx = 0; this.z = this.tz = 0; this.r = this.tr = 0; this.hp = 100; this.a = -1; this.seen = 0; this.fresh = true;
    scene.add(this.rig.root);
  }
  apply(e, now) {
    const [, x, z, r, a, hp, look, name] = e;
    if (name) this.name = name;
    this.tx = x; this.tz = z; this.tr = r; this.hp = hp; this.seen = now;
    if (this.fresh || Math.hypot(x - this.x, z - this.z) > 15) { this.x = x; this.z = z; this.r = r; this.fresh = false; }
    if (typeof look === 'string') {
      const [style, sword, glove, shirt, hat, acc, power, avc] = look.split('|');
      const av = parseAvatar(avc) || defaultAvatar('m');
      if (avatarCode(av) !== this.rig.av) { scene.remove(this.rig.root); this.rig = makeHuman(av); scene.add(this.rig.root); this.a = -1; }
      applyLook(this.rig, { style, sword, glove, shirt, hat, acc, power });
    }
    if (a !== this.a) { this.a = a; const nm = ANIMS[a] || 'Idle'; this.rig.play(nm, { once: ONCE_ANIMS.has(nm), fade: 0.1, dur: ONCE_ANIMS.has(nm) && nm !== 'Death_A' ? 0.5 : undefined }); }
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * 12);
    this.x = lerp(this.x, this.tx, k); this.z = lerp(this.z, this.tz, k); this.r = lerpAngle(this.r, this.tr, k);
    this.rig.root.position.set(this.x, 0, this.z); this.rig.root.rotation.y = this.r;
    this.rig.mixer.update(dt);
    this.flashT = (this.flashT || 0) - dt; this.rig.flash(this.flashT > 0 ? this.flashT * 5 : 0);
    this.shieldT = (this.shieldT || 0) - dt; this.rig.bubble.visible = this.shieldT > 0;
  }
  dispose() { scene.remove(this.rig.root); }
}

function buildSlime(L) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const hue = rr(L.hue[0], L.hue[1]);
  const jelly = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.65, 0.55), roughness: 0.25, transparent: true, opacity: 0.9, emissive: new THREE.Color().setHSL(hue, 0.8, L.glow || 0.12) });
  mesh(new THREE.SphereGeometry(0.62, 18, 12), jelly, 0, 0.48, 0, body).scale.set(1, 0.78, 1);
  mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 }), -0.18, 0.72, 0.22, body).scale.set(1, 0.6, 1);
  for (const x of [-0.18, 0.18]) { mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xffffff, { roughness: 0.3 }), x, 0.58, 0.5, body); mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0x1a1a1a, { roughness: 0.2 }), x, 0.58, 0.59, body); }
  const base = jelly.emissive.clone();
  return { root, body, height: 1.2, flash: (k, c = 0xffffff) => { if (k <= 0) jelly.emissive.copy(base); else jelly.emissive.setHex(c).multiplyScalar(k); } };
}

const enemies = [];
class Enemy {
  constructor(id, type, camp) {
    this.id = id; this.t = ENEMIES[type]; this.type = type; this.camp = camp;
    const a = rand() * Math.PI * 2, d = rand() * camp.r * 0.8;
    this.hx = camp.x + Math.cos(a) * d; this.hz = camp.z + Math.sin(a) * d;
    const L = this.look = ENEMY_LOOK[type];
    this.fox = L.kind === 'fox'; this.slime = L.kind === 'slime';
    if (this.slime) this.m = buildSlime(L);
    else if (this.fox) { this.rig = new Rig(A.fox, A.fox.animations, Enemy.foxScale, { tint: L.tint }); this.m = { root: this.rig.root, height: 1.4 }; }
    else {
      this.rig = new Rig(A[L.model], A.anims.animations, L.scale, { hide: HUMAN_HIDE[L.model] || [], emissive: L.emissive, tint: L.tint });
      for (const s of L.show || []) if (this.rig.nodes[s]) this.rig.nodes[s].visible = true;
      for (const [bone, model, node] of L.attach || []) this.rig.attach(bone, A[model].scene.getObjectByName(node).clone());
      this.m = { root: this.rig.root, height: 2.45 * L.scale };
    }
    scene.add(this.m.root);
    this.reset();
  }
  flash(k, c) { if (this.rig) this.rig.flash(k, c); else this.m.flash(k, c); }
  idleAnim() { return this.fox ? 'Survey' : this.look.idle; }
  reset() {
    this.x = this.hx; this.z = this.hz; this.hp = this.t.hp; this.dead = false; this.aggro = false; this.returning = false;
    this.cd = rr(0.2, 0.6); this.kx = 0; this.kz = 0; this.rot = rand() * 6; this.wT = rand() * 3; this.wx = this.x; this.wz = this.z;
    this.hitT = 0; this.lunge = 0; this.showBar = 0; this.deadT = 0; this.stagger = 0; this.slowT = 0; this.stunT = 0; this.burnT = 0; this.burnAcc = 0;
    const r = this.m.root; r.visible = true; r.scale.setScalar(1); r.rotation.set(0, this.rot, 0); r.position.y = 0;
    if (this.rig) this.rig.play(this.idleAnim(), { fade: 0 });
    this.flash(0);
  }
  /** kind: undefined for a basic hit, 's' for a style skill, 'p' for a power move (the server checks each). */
  damage(dmg, kx, kz, crit, kind) {
    if (this.dead) return;
    net.send({ t: 'he', e: this.id, k: kind });
    this.hp -= dmg; this.aggro = true; this.returning = false; this.hitT = 0.12; this.showBar = 4;
    const heavy = this.t.boss ? 0.15 : 1;
    this.kx += kx * heavy; this.kz += kz * heavy;
    floatText(this.x, this.m.height + 0.3, this.z, Math.round(dmg), crit ? '#ffcf3a' : '#ffffff', crit ? 22 : 17);
    sfx.hit(crit);
    spawnBurst(this.x, this.m.height * 0.5, this.z, this.look.burst || (this.look.bone ? 0xe8e2d0 : 0xff6a5a), 5, 3);
    if (this.rig && !this.t.boss && !this.fox) { this.rig.play('Hit_A', { once: true, dur: 0.35, fade: 0.05 }); this.stagger = 0.3; }
    if (this.hp <= 0) this.die();
  }
  /** Damage over time from burn: local only, the server already credited it with the hit that caused it. */
  dot(dmg) {
    if (this.dead) return;
    this.hp -= dmg; this.showBar = 4; this.aggro = true;
    floatText(this.x, this.m.height + 0.3, this.z, Math.round(dmg), '#ff9a4a', 14);
    if (this.hp <= 0) this.die();
  }
  applyStatus(fx, dmg, cx, cz) {
    if (fx === 'slow') this.slowT = 2.5;
    else if (fx === 'stun') this.stunT = this.t.boss ? 0.35 : 1.2;
    else if (fx === 'burn') { this.burnT = 3; this.burnDmg = dmg * 0.075; }
    else if (fx === 'pull') { const dx = cx - this.x, dz = cz - this.z, d = Math.hypot(dx, dz) || 1; const k = this.t.boss ? 1.5 : 7; this.kx = dx / d * k * Math.min(1, d / 2); this.kz = dz / d * k * Math.min(1, d / 2); }
  }
  die() {
    this.dead = true; this.deadT = 0; this.respawn = this.t.respawn;
    net.send({ t: 'ke', e: this.id });
    spawnBurst(this.x, 0.8, this.z, 0xffffff, 12, 6);
    if (this.rig && !this.fox) this.rig.play('Death_A', { once: true, fade: 0.08 });
    this.flash(0);
  }
  update(dt, time) {
    const r = this.m.root;
    if (this.dead) {
      this.deadT += dt;
      if (this.rig && !this.fox) { this.rig.mixer.update(dt); if (this.deadT > 1.3) r.position.y = -(this.deadT - 1.3) * 1.5; if (this.deadT > 2.2) r.visible = false; }
      else if (this.fox) { r.rotation.z = Math.min(this.deadT * 6, Math.PI / 2); if (this.deadT > 1) r.position.y = -(this.deadT - 1) * 1.5; if (this.deadT > 1.8) r.visible = false; this.rig.mixer.update(dt * 0.3); }
      else { r.scale.setScalar(Math.max(0, 1 - this.deadT / 0.35)); if (this.deadT > 0.35) r.visible = false; }
      this.respawn -= dt; if (this.respawn <= 0) this.reset();
      return;
    }
    const dx = P.x - this.x, dz = P.z - this.z, d = Math.hypot(dx, dz);
    const homeD = Math.hypot(this.x - this.hx, this.z - this.hz);
    const safe = P.dead || P.arena || isSafe(P.x, P.z);
    if (!this.aggro && !this.t.passive && !safe && d < (this.t.boss ? 13 : 7.5)) this.aggro = true;
    if (this.aggro && (safe || homeD > (this.t.boss ? 22 : 26) || d > 22)) { this.aggro = false; this.returning = true; }
    let mvx = 0, mvz = 0, sp = this.t.speed * (this.slowT > 0 ? 0.5 : 1);
    this.cd -= dt; this.stagger -= dt; this.slowT -= dt; this.stunT -= dt;
    if (this.burnT > 0) { this.burnT -= dt; this.burnAcc += dt; if (this.burnAcc >= 0.5) { this.burnAcc = 0; this.dot(this.burnDmg); if (this.dead) return; } }
    if (this.stunT > 0) {
      mvx = 0;
    } else if (this.lunge > 0) {
      // A fox jumps at you as it bites.
      this.lunge -= dt; mvx = dx / (d || 1); mvz = dz / (d || 1); sp = 9;
    } else if (this.stagger > 0) {
      mvx = 0;
    } else if (this.aggro) {
      this.rot = Math.atan2(dx, dz);
      if (d > this.t.range * 0.85) { mvx = dx / d; mvz = dz / d; }
      else if (this.cd <= 0) {
        this.cd = this.t.atkCd;
        if (this.rig && !this.fox) this.rig.play(this.look.atk, { once: true, dur: 0.5, fade: 0.06, restart: true });
        if (this.fox) this.lunge = 0.12;
        if (!P.dead && !safe && d < this.t.range * 1.15 + P.r) enemyHitsMe(this);
        if (this.t.boss || this.type === 'barbarian') { spawnRing(this.x + (dx / d) * this.t.range * 0.45, this.z + (dz / d) * this.t.range * 0.45, this.t.range, 0xd9c3a0, 0.3); P.shake = Math.max(P.shake, this.t.boss ? 0.45 : 0.12); }
        else spawnBurst(P.x, 1.2, P.z, 0xffffff, 4, 2);
      }
    } else if (this.returning) {
      const hx = this.hx - this.x, hz = this.hz - this.z;
      if (homeD < 0.8) { this.returning = false; this.hp = this.t.hp; }
      else { mvx = hx / homeD; mvz = hz / homeD; sp *= 1.3; this.rot = Math.atan2(hx, hz); this.hp = Math.min(this.t.hp, this.hp + this.t.hp * 0.3 * dt); }
    } else {
      this.wT -= dt;
      if (this.wT <= 0) { this.wT = rr(2, 5); const a = rand() * 6.28, rd = rand() * this.camp.r * 0.7; this.wx = this.camp.x + Math.cos(a) * rd; this.wz = this.camp.z + Math.sin(a) * rd; }
      const wx = this.wx - this.x, wz = this.wz - this.z, wd = Math.hypot(wx, wz);
      if (wd > 0.5) { mvx = wx / wd; mvz = wz / wd; sp *= 0.35; this.rot = Math.atan2(wx, wz); }
      if (this.hp < this.t.hp) this.hp = Math.min(this.t.hp, this.hp + this.t.hp * 0.05 * dt);
    }
    const kd = Math.exp(-dt * 9); const kmx = this.kx * dt, kmz = this.kz * dt; this.kx *= kd; this.kz *= kd;
    moveEntity(this, mvx * sp * dt + kmx, mvz * sp * dt + kmz, this.t.r);
    const moving = mvx || mvz;
    r.position.set(this.x, 0, this.z);
    r.rotation.y = lerpAngle(r.rotation.y, this.rot, 1 - Math.exp(-dt * 12));
    if (this.rig) {
      if (this.fox) this.rig.play(moving ? (sp > 3 ? 'Run' : 'Walk') : 'Survey', { fade: 0.2, speed: sp > 6 ? 1.6 : 1 });
      else if (this.stagger <= 0 && this.cd < this.t.atkCd - 0.45) this.rig.play(moving ? (sp > 2.5 ? 'Running_A' : 'Walking_A') : this.look.idle, { fade: 0.2 });
      this.rig.mixer.update(dt);
    } else {
      const b = Math.abs(Math.sin(time * 4 + this.hx));
      this.m.body.position.y = moving ? b * 0.35 : b * 0.06;
      this.m.body.scale.set(1 + (1 - b) * 0.12, 1 - (1 - b) * 0.14, 1 + (1 - b) * 0.12);
      if (this.cd > this.t.atkCd - 0.25) { const k = (this.cd - this.t.atkCd + 0.25) / 0.25; this.m.body.scale.set(1 + k * 0.25, 1 - k * 0.3, 1 + k * 0.25); }
    }
    this.hitT -= dt;
    const status = this.stunT > 0 ? 0xfff27a : this.burnT > 0 ? 0xff7a2a : this.slowT > 0 ? 0x7ad8ff : 0;
    this.flash(this.hitT > 0 ? this.hitT * 6 : status ? 0.35 : 0, this.hitT > 0 ? 0xffffff : status);
    this.showBar -= dt;
  }
}

function blocked(x, z) {
  if (P.arena) { const c = P.arena.center; return Math.hypot(x - c.x, z - c.z) > ARENA.r; }
  return Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1 || inWater(x, z);
}
function moveEntity(e, dx, dz, r) {
  if (!blocked(e.x + dx, e.z)) e.x += dx;
  if (!blocked(e.x, e.z + dz)) e.z += dz;
  if (e === P && P.arena) return;
  for (const o of obsAround(e.x, e.z)) {
    const ox = e.x - o.x, oz = e.z - o.z, min = o.r + r;
    if (Math.abs(ox) > min || Math.abs(oz) > min) continue;
    const d = Math.hypot(ox, oz);
    if (d < min && d > 0.0001) { const nx = e.x + (ox / d) * (min - d), nz = e.z + (oz / d) * (min - d); if (!blocked(nx, nz)) { e.x = nx; e.z = nz; } }
  }
}

function rollDmg(style, mult) {
  const crit = Math.random() < critFor(prog);
  return { dmg: dmgFor(prog, style, mult) * fx(0.9, 1.1) * (crit ? CRIT.mult : 1), crit };
}
// No auto-aim: every attack (and later every gun shot) goes where the player is facing.
// Pressing attack while steering snaps the facing to the stick first, so you can turn mid-combo.
function aimNow() { if (P.aim != null) P.rot = P.aim; return P.rot; }
const facing = (rot = P.rot) => ({ x: Math.sin(rot), z: Math.cos(rot) });
const inFront = (dx, dz, d, rot, halfArc) => { const f = facing(rot); return Math.acos(clamp((dx * f.x + dz * f.z) / d, -1, 1)) <= halfArc; };
function canHitRemote(r) {
  if (r.hp <= 0) return false;
  if (P.arena) return P.arena.opp.id === r.id && P.arena.state === 'fight';
  return !isSafe(P.x, P.z) && !isSafe(r.x, r.z);
}
function hitRemotes(test, k, kb) {
  for (const r of remotes.values()) {
    if (!canHitRemote(r)) continue;
    const dx = r.x - P.x, dz = r.z - P.z, d = Math.hypot(dx, dz) || 1;
    if (!test(r, dx, dz, d)) continue;
    net.send({ t: 'hp', id: r.id, k, kx: (dx / d) * kb, kz: (dz / d) * kb });
  }
}
function attack() {
  if (P.dead || P.atkCd > 0 || P.dash || P.leap || P.actT > 0.25 || arenaFrozen()) return;
  const style = prog.style, st = STYLES[style];
  if (!styleOk(prog, style)) return;
  const rot = aimNow();
  P.combo = P.comboT > 0 ? (P.combo + 1) % 3 : 0; P.comboT = 0.9;
  const finisher = P.combo === 2;
  P.atkCd = st.cd * (finisher ? 1.35 : 1);
  P.actT = P.atkCd * 1.15;
  player.play(STYLE_UI[style].anims[P.combo], { once: true, dur: P.atkCd * 1.6, fade: 0.06 });
  if (style === 'sword') sfx.slash(); else sfx.swing();
  net.send({ t: 'sw', r: Math.round(rot * 100) / 100 });
  P.pending.push({ t: st.cd * 0.35, fn: () => strike(style, finisher, rot) });
}
function strike(style, finisher, rot) {
  const st = STYLES[style];
  const { x: fx0, z: fz0 } = facing(rot);
  // Only bodies actually overlapping the player get hit from the side; everything else must be in the swing arc.
  const inArc = (dx, dz, d, r) => d - r <= st.range && (d <= r + 0.3 || inFront(dx, dz, d, rot, st.arc / 2));
  let hits = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
    if (!inArc(dx, dz, d, e.t.r)) continue;
    const { dmg, crit } = rollDmg(style, finisher ? FINISHER : 1);
    const kb = finisher ? 9 : 3;
    e.damage(dmg, (dx / d) * kb, (dz / d) * kb, crit);
    hits++;
  }
  hitRemotes((r, dx, dz, d) => inArc(dx, dz, d, 0.8), finisher ? 'f' : undefined, finisher ? 6 : 2);
  const sw = ITEMS[prog.gear.sword], gl = ITEMS[prog.gear.glove], pw = prog.power && POWER_BY_ID[prog.power.id];
  if (style === 'sword') spawnSlash(P.x, P.z, rot, st.range, finisher ? 0xffffff : sw?.emissive ? sw.color : 0xdff0ff, P.combo);
  else if (style === 'power' && pw) { spawnBurst(P.x + fx0 * 1.4, 1.1, P.z + fz0 * 1.4, pw.color, hits ? 9 : 5, 3.5); if (finisher) spawnFan(P.x, P.z, rot, st.range, st.arc, pw.color, 0.2); }
  else spawnBurst(P.x + fx0 * 1.1, 1.2, P.z + fz0 * 1.1, hits ? (gl?.emissive ? 0xff8a3a : 0xffd27a) : 0xffffff, hits ? 7 : 3, 3);
  if (hits) P.shake = Math.max(P.shake, finisher ? 0.18 : 0.07);
}
function updateDash(dt) {
  const D = P.dash; D.t += dt;
  const { x: fx0, z: fz0 } = facing(D.rot);
  moveEntity(P, fx0 * (D.dist / D.dur) * dt, fz0 * (D.dist / D.dur) * dt, P.r);
  spawnBurst(P.x, 1, P.z, D.color, 2, 1.5);
  if (D.trail) D.trail(P.x, P.z);
  for (const e of enemies) {
    if (e.dead || D.hit.has(e)) continue;
    if (distSeg(e.x, e.z, D.sx, D.sz, P.x, P.z) < D.w + e.t.r) { D.hit.add(e); D.onHit(e, fx0, fz0); }
  }
  for (const r of remotes.values()) {
    if (D.hit.has(r) || !canHitRemote(r)) continue;
    if (distSeg(r.x, r.z, D.sx, D.sz, P.x, P.z) < D.w + 0.4) { D.hit.add(r); D.onRemote(r, fx0, fz0); }
  }
  if (D.t >= D.dur) { P.dash = null; D.onEnd(); if (D.hit.size) P.shake = 0.25; }
}

/* ---- Moves -------------------------------------------------------------------------------------
 * Every style's moves (fists, sword, powers) go through castMove. runMove draws a move and, when it
 * is the local player's (mine), also applies its hits. Other players' moves arrive as 'fx' messages
 * and are only drawn; their damage comes from the server.
 */
const shots = [], zones = [], timers = [], auras = [];
const later = (t, fn) => timers.push({ t, fn });
function eachTarget(test, fn) {
  for (const e of enemies) if (!e.dead && e.m.root.visible && test(e.x, e.z, e.t.r)) fn(e, false);
  for (const r of remotes.values()) if (canHitRemote(r) && test(r.x, r.z, 0.4)) fn(r, true);
}
let castStyle = 'power';
function powerHit(t, remote, mv, ox, oz) {
  const dx = t.x - ox, dz = t.z - oz, d = Math.hypot(dx, dz) || 1;
  const kb = mv.fx === 'knock' ? 12 : mv.fx === 'pull' ? -6 : 3;
  const kx = (dx / d) * kb, kz = (dz / d) * kb;
  if (remote) { net.send({ t: 'hp', id: t.id, k: 'p', kx, kz }); t.flashT = 0.15; return; }
  const { dmg, crit } = rollDmg(castStyle, mv.mult);
  t.damage(dmg, kx, kz, crit, 'p');
  t.applyStatus(mv.fx, dmg, ox, oz);
}
const SWORD_GLOW = 0xcfe8ff, FIST_GLOW = 0xffb34d;
function moveColor(style, pwId) {
  if (style === 'power') return POWER_BY_ID[pwId]?.color ?? 0xffffff;
  if (style === 'sword') { const sw = ITEMS[prog.gear.sword]; return sw?.emissive ? sw.color : SWORD_GLOW; }
  return FIST_GLOW;
}
/** Nearest thing worth hitting within reach, for a tap without aiming. */
function autoTarget(reach) {
  let best = null, bd = reach;
  eachTarget((tx, tz) => Math.hypot(tx - P.x, tz - P.z) < reach, (t) => { const d = Math.hypot(t.x - P.x, t.z - P.z); if (d < bd) { bd = d; best = t; } });
  return best;
}
const CAST_ANIM = { bolt: 'Cast_A', chain: 'Cast_A', line: 'Cast_A', cone: 'Unarmed_Melee_Attack_Punch_B', nova: 'Jump_Land', aura: 'Spell_Exit', shield: 'Spell_Exit',
  dash: 'Roll', leap: 'Jump_Start', blink: 'Spell_Enter', zone: 'Spell_Exit', meteor: 'Cast_A' };
function castAnim(style, mv) {
  if (style === 'sword' && (mv.k === 'dash' || mv.k === 'bolt')) return '2H_Melee_Attack_Spin';
  if (style === 'melee' && mv.k === 'dash') return 'Unarmed_Melee_Attack_Kick';
  return CAST_ANIM[mv.k];
}
function moveReady(i) {
  const style = prog.style, mv = movesOf(prog, style)[i];
  return mv && styleOk(prog, style) && !P.dead && !P.dash && !P.leap && !arenaFrozen() && P.mvCd[style][i] <= 0 && masteryOf(prog, style).lv >= unlockOf(style)[i] ? mv : null;
}
/** aim: { r, d } from dragging the button, or null for a tap (aims at the nearest target). */
function castMove(i, aim) {
  const style = prog.style, mv = moveReady(i);
  if (!mv) return;
  const kind = aimKind(mv);
  let rot, d = 0;
  if (aim) { rot = aim.r; d = kind === 'point' ? clamp(aim.d, 0, mv.range) : 0; }
  else {
    const t = kind !== 'self' && autoTarget(kind === 'point' ? mv.range + 1 : Math.min(moveReach(mv), 14) + 1);
    if (t) { rot = Math.atan2(t.x - P.x, t.z - P.z); d = clamp(Math.hypot(t.x - P.x, t.z - P.z), 0, mv.range || 0); }
    else { rot = aimNow(); d = kind === 'point' ? mv.range * 0.6 : 0; }
  }
  P.rot = rot;
  P.mvCd[style][i] = mv.cd;
  net.send({ t: 'pw', m: i, r: Math.round(rot * 100) / 100, d: Math.round(d * 100) / 100 });
  player.play(castAnim(style, mv), { once: true, dur: mv.k === 'leap' ? 0.55 : 0.5, fade: 0.05 });
  P.actT = mv.k === 'leap' ? 0.6 : 0.42; P.atkCd = Math.max(P.atkCd, 0.25);
  if (mv.heal) { floatText(P.x, 2.8, P.z, `+${Math.round(P.mhp * mv.heal)}`, '#7dff9a', 16); spawnBurst(P.x, 1.2, P.z, 0x7dff9a, 10, 3); }
  castStyle = style;
  sfx.cast(mv.k, mv.fx);
  runMove(mv, moveColor(style, prog.power?.id), P, rot, d, true);
}
function runMove(mv, color, who, rot, d, mine) {
  const fxv = Math.sin(rot), fzv = Math.cos(rot);
  const ox = who.x, oz = who.z, tx = ox + fxv * d, tz = oz + fzv * d;
  const hitsAround = (cx, cz, R) => eachTarget((x, z, tr) => Math.hypot(x - cx, z - cz) - tr <= R, (t, rem) => powerHit(t, rem, mv, cx, cz));
  switch (mv.k) {
    case 'bolt': {
      const n = mv.count || 1;
      later(0.12, () => { for (let i = 0; i < n; i++) shots.push(makeShot(who.x, who.z, rot + (i - (n - 1) / 2) * (mv.spread || 0), mv, color, mine)); });
      break;
    }
    case 'cone': later(0.12, () => {
      const [x, z] = [who.x, who.z];
      spawnFan(x, z, rot, mv.range, mv.arc, color, 0.35); spawnFan(x, z, rot, mv.range * 0.7, mv.arc * 0.8, 0xffffff, 0.2);
      for (let i = 0; i < 4; i++) spawnBurst(x + fxv * mv.range * (0.3 + i * 0.18), 1, z + fzv * mv.range * (0.3 + i * 0.18), color, 5, 5);
      if (mine) eachTarget((ex, ez, tr) => { const dx = ex - x, dz = ez - z, dd = Math.hypot(dx, dz) || 1; return dd - tr <= mv.range && (dd <= tr + 0.3 || inFront(dx, dz, dd, rot, mv.arc / 2)); }, (t, rem) => powerHit(t, rem, mv, x, z));
    }); break;
    case 'line': later(0.12, () => {
      const [x, z] = [who.x, who.z], ex = x + fxv * mv.range, ez = z + fzv * mv.range;
      if (mv.vis === 'spikes') for (let s = 1.2; s < mv.range; s += 1.1) later(s * 0.025, () => spawnSpike(x + fxv * s, z + fzv * s, color, 0.9 + Math.random() * 0.6));
      else if (mv.vis === 'wave') spawnWave(x, z, rot, mv.range, mv.w, color);
      else spawnBeam(x, z, rot, mv.range, mv.w * (mv.vis === 'beam' ? 1.5 : 1), color);
      if (mine) eachTarget((tx2, tz2, tr) => distSeg(tx2, tz2, x, z, ex, ez) <= mv.w + tr, (t, rem) => powerHit(t, rem, mv, x, z));
    }); break;
    case 'chain': later(0.1, () => {
      // From the hand to the first target ahead, then on to the nearest one not hit yet.
      let from = [who.x, who.z]; const hit = new Set();
      let first = null, fd = mv.range;
      eachTarget((ex, ez) => { const dx = ex - from[0], dz = ez - from[1], dd = Math.hypot(dx, dz) || 1; return dd < mv.range && inFront(dx, dz, dd, rot, 0.6); },
        (t) => { const dd = Math.hypot(t.x - from[0], t.z - from[1]); if (dd < fd) { fd = dd; first = t; } });
      if (!first) { spawnBolt(from[0], from[1], from[0] + fxv * mv.range, from[1] + fzv * mv.range, color); return; }
      let cur = first;
      for (let j = 0; cur && j <= mv.jumps; j++) {
        spawnBolt(from[0], from[1], cur.x, cur.z, color); spawnBurst(cur.x, 1.1, cur.z, color, 6, 4);
        hit.add(cur);
        if (mine) powerHit(cur, remotes.has(cur.id) && cur instanceof Remote, mv, from[0], from[1]);
        from = [cur.x, cur.z];
        let next = null, nd = CHAIN_HOP;
        eachTarget((ex, ez) => Math.hypot(ex - from[0], ez - from[1]) < CHAIN_HOP, (t) => { if (hit.has(t)) return; const dd = Math.hypot(t.x - from[0], t.z - from[1]); if (dd < nd) { nd = dd; next = t; } });
        cur = next;
      }
    }); break;
    case 'nova': later(0.25, () => {
      const [x, z] = [who.x, who.z];
      spawnRing(x, z, mv.radius, color, 0.5); spawnRing(x, z, mv.radius * 0.6, 0xffffff, 0.35); spawnDome(x, z, mv.radius, color, 0.45);
      spawnBurst(x, 0.6, z, color, 24, 8);
      if (mine) { P.shake = 0.35; hitsAround(x, z, mv.radius); }
    }); break;
    case 'aura':
      auras.push({ who, mv, color, mine, n: 0, next: 0.15, ang: 0, ring: spawnAuraRing(who, mv.radius, color) });
      break;
    case 'shield': {
      who.shieldT = mv.dur; who.shieldColor = color;
      spawnRing(ox, oz, mv.radius, color, 0.45); spawnBurst(ox, 1.2, oz, color, 18, 5);
      if (mine) hitsAround(ox, oz, mv.radius);
      break;
    }
    case 'dash':
      if (mine) {
        P.dash = { t: 0, dur: 0.3, rot, sx: P.x, sz: P.z, dist: mv.range, w: mv.w, hit: new Set(), color,
          trail: (x, z) => spawnGhost(x, z, rot, color),
          onHit: (e) => powerHit(e, false, mv, P.x - fxv, P.z - fzv),
          onRemote: (r) => powerHit(r, true, mv, P.x - fxv, P.z - fzv),
          onEnd: () => { spawnFan(P.x, P.z, rot, 3, 2.2, color, 0.25); spawnBurst(P.x, 1, P.z, color, 12, 5); if (castStyle === 'sword') spawnSlash(P.x, P.z, rot, 3.4, 0xffffff, 0); } };
      } else spawnBeam(ox, oz, rot, mv.range, mv.w * 0.6, color);
      break;
    case 'leap':
      spawnRing(tx, tz, mv.radius, color, 0.55);
      if (mine) P.leap = { t: 0, dur: 0.55, dist: d, rot, mv, color };
      else later(0.55, () => { spawnRing(tx, tz, mv.radius, color, 0.5); spawnDome(tx, tz, mv.radius, color, 0.4); spawnBurst(tx, 0.6, tz, color, 20, 7); });
      break;
    case 'blink': {
      spawnBurst(ox, 1.2, oz, color, 16, 4); spawnRing(ox, oz, 1.6, color, 0.3); spawnPillar(ox, oz, color, 0.35);
      const land = () => {
        spawnPillar(tx, tz, color, 0.4); spawnRing(tx, tz, mv.radius, color, 0.45); spawnDome(tx, tz, mv.radius, color, 0.35); spawnBurst(tx, 1, tz, color, 20, 6);
        if (mine) { P.shake = 0.25; hitsAround(P.x, P.z, mv.radius); }
      };
      if (mine) {
        player.root.visible = false;
        later(0.16, () => {
          // Land at the farthest free spot along the way.
          let k = 1; while (k > 0 && blocked(P.x + fxv * d * k, P.z + fzv * d * k)) k -= 0.1;
          P.x += fxv * d * Math.max(0, k); P.z += fzv * d * Math.max(0, k);
          player.root.visible = true; player.play('Spell_Exit', { once: true, dur: 0.4, fade: 0.05 });
          land();
        });
      } else later(0.16, land);
      break;
    }
    case 'zone': later(0.15, () => zones.push(makeZone(tx, tz, mv, color, mine))); break;
    case 'meteor': spawnMeteor(tx, tz, mv, color, () => { if (mine) { P.shake = 0.5; hitsAround(tx, tz, mv.radius); } }); break;
  }
}
const shotGeo = new THREE.SphereGeometry(1, 12, 8);
const crescentGeo = new THREE.TorusGeometry(1, 0.16, 6, 20, Math.PI);
function makeShot(x, z, rot, mv, color, mine) {
  const crescent = mv.vis === 'crescent';
  const m = new THREE.Mesh(crescent ? crescentGeo : shotGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  if (crescent) { m.rotation.set(-Math.PI / 2, 0, rot + Math.PI); m.scale.setScalar(mv.r * 1.2); }
  else {
    const core = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.scale.setScalar(0.45); m.add(core);
    m.scale.setScalar(mv.r * 0.75);
  }
  m.position.set(x, 1.1, z); scene.add(m);
  return { m, x, z, vx: Math.sin(rot) * mv.speed, vz: Math.cos(rot) * mv.speed, left: mv.range, mv, color, mine, hit: new Set() };
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i], step = Math.hypot(s.vx, s.vz) * dt;
    s.x += s.vx * dt; s.z += s.vz * dt; s.left -= step;
    s.m.position.set(s.x, 1.1, s.z);
    if (Math.random() < 0.6) spawnBurst(s.x, 1.1, s.z, s.color, 1, 0.6);
    let stop = s.left <= 0 || (!P.arena && blocked(s.x, s.z) && !inWater(s.x, s.z));
    if (s.mine && !stop) eachTarget((tx, tz, tr) => Math.hypot(tx - s.x, tz - s.z) <= s.mv.r + tr, (t, rem) => {
      if (stop || s.hit.has(t)) return;
      s.hit.add(t); powerHit(t, rem, s.mv, s.x - s.vx * 0.05, s.z - s.vz * 0.05);
      spawnBurst(s.x, 1.1, s.z, s.color, 8, 4);
      if (!s.mv.pierce) stop = true;
    });
    if (stop) { spawnBurst(s.x, 1.1, s.z, s.color, 5, 3); scene.remove(s.m); s.m.material.dispose(); s.m.children[0]?.material.dispose(); shots.splice(i, 1); }
  }
}
const zoneGeo = new THREE.CircleGeometry(1, 40);
function makeZone(x, z, mv, color, mine) {
  const m = new THREE.Mesh(zoneGeo, groundMat(color, 0.3));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); m.scale.setScalar(mv.radius); scene.add(m);
  spawnRing(x, z, mv.radius, color, 0.4);
  let swirl = null;
  if (mv.vis === 'vortex') {
    swirl = new THREE.Mesh(new THREE.RingGeometry(0.3, 1, 40, 1, 0, Math.PI * 1.4), groundMat(0xffffff, 0.3));
    swirl.rotation.x = -Math.PI / 2; swirl.position.set(x, 0.12, z); swirl.scale.setScalar(mv.radius); scene.add(swirl);
  }
  return { m, swirl, x, z, mv, color, mine, n: 0, next: 0, t: 0 };
}
function updateZones(dt, time) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const Z = zones[i], R = Z.mv.radius;
    Z.next -= dt; Z.t += dt;
    Z.m.material.opacity = 0.3 + Math.sin(time * 10) * 0.06;
    if (Z.swirl) { Z.swirl.rotation.z -= dt * 6; if (Math.random() < 0.5) { const a = Math.random() * 6.28, r = R * Math.random(); spawnBurst(Z.x + Math.cos(a) * r, 0.4 + Math.random() * 2, Z.z + Math.sin(a) * r, Z.color, 1, 1); } }
    if (Z.mv.vis === 'rain' && Math.random() < 0.7) { const a = Math.random() * 6.28, r = R * Math.sqrt(Math.random()); spawnDrop(Z.x + Math.cos(a) * r, Z.z + Math.sin(a) * r, Z.color); }
    if (Z.next <= 0 && Z.n < Z.mv.ticks) {
      Z.n++; Z.next = Z.mv.every;
      spawnRing(Z.x, Z.z, R, Z.color, Z.mv.every * 0.9);
      const rx = Z.x + fx(-1, 1) * R * 0.5, rz = Z.z + fx(-1, 1) * R * 0.5;
      if (Z.mv.vis === 'spikes') for (let k = 0; k < 5; k++) { const a = Math.random() * 6.28, r = R * Math.sqrt(Math.random()); spawnSpike(Z.x + Math.cos(a) * r, Z.z + Math.sin(a) * r, Z.color, 0.8 + Math.random() * 0.5); }
      else if (Z.mv.vis === 'lightning') { spawnSkyBolt(rx, rz, Z.color); spawnRing(rx, rz, 1.4, 0xffffff, 0.25); }
      else spawnBurst(rx, 0.5, rz, Z.color, 6, 4);
      if (Z.mine) eachTarget((tx, tz, tr) => Math.hypot(tx - Z.x, tz - Z.z) - tr <= R, (t, rem) => powerHit(t, rem, Z.mv, Z.x, Z.z));
    }
    if (Z.n >= Z.mv.ticks && Z.next <= 0) {
      scene.remove(Z.m); Z.m.material.dispose();
      if (Z.swirl) { scene.remove(Z.swirl); Z.swirl.geometry.dispose(); Z.swirl.material.dispose(); }
      zones.splice(i, 1);
    }
  }
}
function updateAuras(dt) {
  for (let i = auras.length - 1; i >= 0; i--) {
    const A2 = auras[i]; A2.next -= dt; A2.ang += dt * 7;
    A2.ring.position.set(A2.who.x, 0.15, A2.who.z); A2.ring.rotation.z = A2.ang;
    if (Math.random() < 0.6) { const a = A2.ang * 1.3 + Math.random(), r = A2.mv.radius * (0.6 + Math.random() * 0.4); spawnBurst(A2.who.x + Math.cos(a) * r, 0.5 + Math.random(), A2.who.z + Math.sin(a) * r, A2.color, 1, 1.5); }
    if (A2.next <= 0 && A2.n < A2.mv.ticks) {
      A2.n++; A2.next = A2.mv.every;
      spawnRing(A2.who.x, A2.who.z, A2.mv.radius, A2.color, 0.35);
      if (A2.mine) eachTarget((tx, tz, tr) => Math.hypot(tx - P.x, tz - P.z) - tr <= A2.mv.radius, (t, rem) => powerHit(t, rem, A2.mv, P.x, P.z));
    }
    if (A2.n >= A2.mv.ticks && A2.next <= 0) { scene.remove(A2.ring); A2.ring.material.dispose(); auras.splice(i, 1); }
  }
}
function updateLeap(dt) {
  const L = P.leap; L.t += dt;
  const { x: fx0, z: fz0 } = facing(L.rot);
  moveEntity(P, fx0 * (L.dist / L.dur) * dt, fz0 * (L.dist / L.dur) * dt, P.r);
  const k = Math.min(1, L.t / L.dur);
  player.root.position.y = Math.sin(k * Math.PI) * 2.8;
  if (Math.random() < 0.5) spawnBurst(P.x, player.root.position.y + 1, P.z, L.color, 1, 1);
  if (k >= 1) {
    P.leap = null; player.root.position.y = 0;
    player.play('Jump_Land', { once: true, dur: 0.4, fade: 0.05 });
    const mv = L.mv, ox = P.x, oz = P.z;
    spawnRing(ox, oz, mv.radius, L.color, 0.5); spawnDome(ox, oz, mv.radius, L.color, 0.4); spawnBurst(ox, 0.5, oz, L.color, 24, 8); P.shake = 0.4;
    sfx.cast('land');
    eachTarget((tx, tz, tr) => Math.hypot(tx - ox, tz - oz) - tr <= mv.radius, (t, rem) => powerHit(t, rem, mv, ox, oz));
  }
}
function updateTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); t.fn(); } }
}

/* ---- Move effects -------------------------------------------------------------------------------- */
const addFx = (obj, dur, upd, dispose) => { scene.add(obj); effects.push({ obj, t: 0, dur, upd, dispose }); };
const glowMat = (color, opacity = 0.85) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
// Marks on the ground use plain blending: added light washes out to white on sand and snow.
const groundMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
const spikeGeo = new THREE.ConeGeometry(0.28, 1.6, 5); spikeGeo.translate(0, 0.8, 0);
function spawnSpike(x, z, color, h) {
  const m = new THREE.Mesh(spikeGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3, transparent: true }));
  m.position.set(x, 0, z); m.rotation.set(fx(-0.25, 0.25), Math.random() * 6, fx(-0.25, 0.25));
  spawnBurst(x, 0.3, z, color, 2, 2);
  addFx(m, 0.6, (k) => { const up = k < 0.2 ? k / 0.2 : 1; m.scale.set(1, h * up * (k > 0.7 ? (1 - k) / 0.3 : 1), 1); m.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1; }, () => m.material.dispose());
}
function spawnWave(x, z, rot, range, w, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * 2.4, 1.6, 0.7), glowMat(color, 0.6));
  m.rotation.y = rot;
  addFx(m, 0.45, (k) => { m.position.set(x + Math.sin(rot) * range * k, 0.8 * (1 - k * 0.5), z + Math.cos(rot) * range * k); m.material.opacity = 0.65 * (1 - k * 0.7); if (Math.random() < 0.8) spawnBurst(m.position.x + fx(-w, w), 0.6, m.position.z, color, 2, 3); },
    () => { m.geometry.dispose(); m.material.dispose(); });
}
function spawnBolt(x1, z1, x2, z2, color) {
  const pts = [], n = 9;
  for (let i = 0; i <= n; i++) { const k = i / n, j = i && i < n ? 0.35 : 0; pts.push(new THREE.Vector3(lerp(x1, x2, k) + fx(-j, j), 1.2 + fx(-j, j), lerp(z1, z2, k) + fx(-j, j))); }
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 5), glowMat(0xffffff, 1));
  const halo = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.2, 5), glowMat(color, 0.6));
  tube.add(halo);
  addFx(tube, 0.22, (k) => { tube.material.opacity = 1 - k; halo.material.opacity = 0.6 * (1 - k); }, () => { tube.geometry.dispose(); tube.material.dispose(); halo.geometry.dispose(); halo.material.dispose(); });
}
function spawnSkyBolt(x, z, color) {
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(x + (i && i < 8 ? fx(-0.6, 0.6) : 0), 14 - i * 1.75, z + (i && i < 8 ? fx(-0.6, 0.6) : 0)));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.1, 5), glowMat(0xffffff, 1));
  const halo = new THREE.Mesh(tube.geometry, glowMat(color, 0.5)); halo.scale.set(2.5, 1, 2.5); halo.position.set(-x * 1.5, 0, -z * 1.5);
  tube.add(halo);
  spawnBurst(x, 0.3, z, color, 8, 5);
  addFx(tube, 0.2, (k) => { tube.material.opacity = 1 - k; halo.material.opacity = 0.5 * (1 - k); }, () => { tube.geometry.dispose(); tube.material.dispose(); halo.material.dispose(); });
}
const domeGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
function spawnDome(x, z, R, color, dur) {
  const m = new THREE.Mesh(domeGeo, groundMat(color, 0.4)); m.position.set(x, 0, z);
  addFx(m, dur, (k) => { m.scale.set(R * (0.4 + 0.6 * k), R * 0.6 * (0.4 + 0.6 * k), R * (0.4 + 0.6 * k)); m.material.opacity = 0.4 * (1 - k); }, () => m.material.dispose());
}
const pillarGeo = new THREE.CylinderGeometry(0.6, 0.9, 6, 16, 1, true); pillarGeo.translate(0, 3, 0);
function spawnPillar(x, z, color, dur) {
  const m = new THREE.Mesh(pillarGeo, glowMat(color, 0.7)); m.position.set(x, 0, z);
  addFx(m, dur, (k) => { m.scale.set(1 - k * 0.8, 1 + k * 0.3, 1 - k * 0.8); m.material.opacity = 0.7 * (1 - k); }, () => m.material.dispose());
}
const ghostGeo = new THREE.CapsuleGeometry(0.35, 1.3, 4, 8); ghostGeo.translate(0, 1.1, 0);
function spawnGhost(x, z, rot, color) {
  const m = new THREE.Mesh(ghostGeo, glowMat(color, 0.35)); m.position.set(x, 0, z); m.rotation.y = rot;
  addFx(m, 0.25, (k) => { m.material.opacity = 0.35 * (1 - k); }, () => m.material.dispose());
}
const dropGeo = new THREE.ConeGeometry(0.12, 0.7, 5); dropGeo.rotateX(Math.PI);
function spawnDrop(x, z, color) {
  const m = new THREE.Mesh(dropGeo, glowMat(color, 0.9));
  addFx(m, 0.35, (k) => { m.position.set(x, 9 * (1 - k), z); if (k >= 1) spawnBurst(x, 0.2, z, color, 2, 2); }, () => m.material.dispose());
}
function spawnAuraRing(who, R, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(R * 0.82, R, 40, 1, 0, Math.PI * 1.6), groundMat(color, 0.6));
  m.rotation.x = -Math.PI / 2; m.position.set(who.x, 0.15, who.z); scene.add(m);
  return m;
}
const rockGeo = new THREE.IcosahedronGeometry(1, 1);
function spawnMeteor(x, z, mv, color, onHit) {
  // Warning circle that fills up, then the rock lands.
  const warn = new THREE.Mesh(zoneGeo, groundMat(color, 0.25)); warn.rotation.x = -Math.PI / 2; warn.position.set(x, 0.09, z);
  addFx(warn, mv.delay, (k) => { warn.scale.setScalar(mv.radius * k); warn.material.opacity = 0.2 + 0.2 * k; }, () => warn.material.dispose());
  spawnRing(x, z, mv.radius, color, mv.delay);
  const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.5 }));
  const glow = new THREE.Mesh(shotGeo, glowMat(color, 0.5)); glow.scale.setScalar(1.6); rock.add(glow);
  const r = Math.min(1.6, mv.radius * 0.3), sx = x - 6, sz = z - 9, sy = 22;
  rock.scale.setScalar(r);
  addFx(rock, mv.delay, (k) => {
    rock.position.set(lerp(sx, x, k), lerp(sy, 0.5, k * k), lerp(sz, z, k)); rock.rotation.x += 0.2; rock.rotation.z += 0.13;
    if (Math.random() < 0.9) spawnBurst(rock.position.x, rock.position.y, rock.position.z, color, 1, 1);
  }, () => {
    rock.material.dispose(); glow.material.dispose();
    spawnRing(x, z, mv.radius, color, 0.55); spawnRing(x, z, mv.radius * 0.6, 0xffffff, 0.4); spawnDome(x, z, mv.radius, color, 0.5);
    spawnBurst(x, 0.6, z, color, 30, 9);
    if (Math.hypot(x - P.x, z - P.z) < 30) sfx.cast('boom');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; spawnSpike(x + Math.cos(a) * mv.radius * 0.5, z + Math.sin(a) * mv.radius * 0.5, color, 0.6); }
    onHit();
  });
}

/* ---- Aiming (drag a move button, like a MOBA) ---------------------------------------------------
 * While a move button is held, the ground shows where it will go: an arrow for moves aimed at a
 * direction, a circle within reach for moves aimed at a spot, a ring around the player for the rest.
 * The button's drag maps straight onto the ground: screen right is world +X, screen down is +Z.
 */
const aimFx = { group: new THREE.Group(), on: -1, rot: 0, k: 0, cancel: false };
(() => {
  const g = aimFx.group;
  // Plain (not additive) blending, so the marks stay readable on light ground.
  const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const reachM = flat(0x0a1830, 0.16), lineM = flat(0x4fd0ff, 0.42), spotM = flat(0x4fd0ff, 0.3);
  aimFx.reach = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 64), flat(0xffffff, 0.75));
  aimFx.reachFill = new THREE.Mesh(zoneGeo, reachM);
  const bar = new THREE.PlaneGeometry(1, 1); bar.translate(0, 0.5, 0);
  aimFx.bar = new THREE.Mesh(bar, lineM);
  const tri = new THREE.Shape(); tri.moveTo(0, 0.6); tri.lineTo(-0.5, 0); tri.lineTo(0.5, 0); tri.closePath();
  aimFx.tip = new THREE.Mesh(new THREE.ShapeGeometry(tri), lineM);
  aimFx.spot = new THREE.Mesh(zoneGeo, spotM);
  aimFx.spotRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), flat(0xffffff, 0.9));
  aimFx.fan = new THREE.Mesh(new THREE.CircleGeometry(1, 32, 0, 1), lineM);
  for (const m of [aimFx.reach, aimFx.reachFill, aimFx.bar, aimFx.tip, aimFx.spot, aimFx.spotRing, aimFx.fan]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.11; m.renderOrder = 5; g.add(m); }
  g.visible = false;
  aimFx.mats = [lineM, spotM];
})();
function aimMove(i, phase, dx = 0, dy = 0, k = 0, cancel = false) {
  if (phase === 'start') {
    if (!moveReady(i)) return false;
    aimFx.on = i; aimFx.k = 0; aimFx.rot = P.rot; aimFx.cancel = false;
    if (!aimFx.group.parent) scene.add(aimFx.group);
    aimFx.group.visible = true;
    return true;
  }
  if (aimFx.on !== i) return false;
  if (phase === 'move') {
    if (k > 0.05) aimFx.rot = Math.atan2(dx, dy);
    aimFx.k = k; aimFx.cancel = cancel;
    return true;
  }
  aimFx.on = -1; aimFx.group.visible = false;
  if (phase === 'end' && !cancel) {
    const mv = movesOf(prog, prog.style)[i];
    castMove(i, k > 0.15 && mv ? { r: aimFx.rot, d: k * (mv.range || 0) } : null);
  }
  return true;
}
function updateAim() {
  if (aimFx.on < 0) return;
  const mv = movesOf(prog, prog.style)[aimFx.on];
  if (!mv || P.dead) { aimFx.on = -1; aimFx.group.visible = false; return; }
  const kind = aimKind(mv), g = aimFx.group, rot = aimFx.rot;
  g.position.set(P.x, 0, P.z);
  for (const m of aimFx.mats) m.color.setHex(aimFx.cancel ? 0xff4a3a : 0x4fd0ff);
  const reach = kind === 'self' ? mv.radius : kind === 'point' ? mv.range : Math.min(moveReach(mv), 18);
  aimFx.reach.scale.setScalar(reach); aimFx.reachFill.scale.setScalar(reach);
  aimFx.bar.visible = aimFx.tip.visible = kind === 'dir' && mv.k !== 'cone';
  aimFx.fan.visible = mv.k === 'cone';
  aimFx.spot.visible = aimFx.spotRing.visible = kind === 'point';
  aimFx.reachFill.visible = kind !== 'dir';
  if (kind === 'dir') {
    const w = mv.k === 'bolt' ? Math.max(0.8, mv.r * 2 + (mv.spread || 0) * (mv.count || 1) * 4) : mv.k === 'chain' ? 1.2 : mv.w * 2;
    const len = mv.k === 'chain' ? mv.range : moveReach(mv);
    aimFx.bar.scale.set(w, len - 0.6, 1); aimFx.bar.rotation.z = rot + Math.PI;
    aimFx.tip.scale.setScalar(Math.max(1, w)); aimFx.tip.rotation.z = rot + Math.PI;
    aimFx.tip.position.set(Math.sin(rot) * (len - 0.6), 0.11, Math.cos(rot) * (len - 0.6));
    if (mv.k === 'cone') { aimFx.fan.geometry.dispose(); aimFx.fan.geometry = new THREE.CircleGeometry(mv.range, 28, rot - Math.PI / 2 - mv.arc / 2, mv.arc); }
  } else if (kind === 'point') {
    const d = aimFx.k * mv.range;
    for (const m of [aimFx.spot, aimFx.spotRing]) { m.position.set(Math.sin(rot) * d, 0.12, Math.cos(rot) * d); m.scale.setScalar(mv.radius); }
  }
  if (aimFx.k > 0.05 || kind !== 'self') P.rot = rot;
}

function enemyHitsMe(e) {
  net.send({ t: 'ue', e: e.id });
  floatText(P.x, 2.6, P.z, Math.round(e.t.dmg * (1 - defReduceFor(prog))), '#ff6a5a', 18);
  P.shake = Math.max(P.shake, 0.12); P.flash = 0.2; hurtFlash = 0.25;
  sfx.hurt();
}
function usePotion() {
  if (P.dead || P.arena || P.potCd > 0) return;
  const inv = prog.inv;
  if (!(inv.pot_s > 0) && !(inv.pot_l > 0)) return;
  P.potCd = POTION_CD;
  const want = P.hp / P.mhp < 0.4 && inv.pot_l > 0 ? 'pot_l' : inv.pot_s > 0 ? 'pot_s' : 'pot_l';
  net.send({ t: 'pot', id: want });
  spawnBurst(P.x, 1.4, P.z, 0xff7a8a, 12, 3);
  spawnRing(P.x, P.z, 1.6, 0xff7a8a, 0.4);
}
const arenaFrozen = () => P.arena && P.arena.state !== 'fight';

const effects = [];
const partGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const partPool = [];
let partIdx = 0;
function initParticles() { for (let i = 0; i < 220; i++) { const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); m.visible = false; scene.add(m); partPool.push({ m, life: 0 }); } }
function spawnBurst(x, y, z, color, cnt, speed) {
  for (let i = 0; i < cnt; i++) {
    const p = partPool[partIdx++ % partPool.length];
    p.m.visible = true; p.m.position.set(x, y, z); p.m.material.color.setHex(color); p.m.material.opacity = 1; p.m.scale.setScalar(fx(0.6, 1.3));
    p.vx = fx(-1, 1) * speed; p.vy = fx(0.5, 1.5) * speed; p.vz = fx(-1, 1) * speed; p.life = p.max = fx(0.3, 0.6);
  }
}
function updateParticles(dt) {
  for (const p of partPool) {
    if (p.life <= 0) continue; p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vy -= 18 * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.material.opacity = p.life / p.max; p.m.rotation.x += dt * 8;
  }
}
function spawnSlash(x, z, rot, range, color, combo) {
  const g = new THREE.RingGeometry(range * 0.4, range, 24, 1, -0.95, 1.9);
  const mm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(g, mm);
  const holder = new THREE.Group(); holder.position.set(x, 1.0 + (combo === 1 ? 0.3 : 0), z); holder.rotation.y = rot; holder.add(m);
  m.rotation.set(-Math.PI / 2, combo === 1 ? 0.35 : 0, -Math.PI / 2);
  scene.add(holder);
  effects.push({ obj: holder, t: 0, dur: 0.18, upd: (k) => { mm.opacity = 0.9 * (1 - k); holder.scale.setScalar(0.85 + k * 0.25); }, dispose: () => { g.dispose(); mm.dispose(); } });
}
function spawnFan(x, z, rot, range, arc, color, dur) {
  const g = new THREE.RingGeometry(range * 0.2, range, 28, 1, -arc / 2, arc);
  const mm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(g, mm);
  const holder = new THREE.Group(); holder.position.set(x, 0.6, z); holder.rotation.y = rot; holder.add(m);
  m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  scene.add(holder);
  effects.push({ obj: holder, t: 0, dur, upd: (k) => { mm.opacity = 0.8 * (1 - k); holder.scale.setScalar(0.7 + k * 0.35); }, dispose: () => { g.dispose(); mm.dispose(); } });
}
const beamGeo = new THREE.BoxGeometry(1, 1, 1); beamGeo.translate(0, 0, 0.5);
function spawnBeam(x, z, rot, range, w, color) {
  const mm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(beamGeo, mm);
  m.position.set(x, 1, z); m.rotation.y = rot; m.scale.set(w * 1.4, 0.6, range); scene.add(m);
  const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  core.scale.set(0.3, 0.3, 1); m.add(core);
  for (let i = 0; i < 6; i++) { const t = Math.random() * range; spawnBurst(x + Math.sin(rot) * t, 1, z + Math.cos(rot) * t, color, 2, 2); }
  effects.push({ obj: m, t: 0, dur: 0.3, upd: (k) => { mm.opacity = 0.85 * (1 - k); core.material.opacity = 0.9 * (1 - k); m.scale.x = w * 1.4 * (1 - k * 0.7); }, dispose: () => { mm.dispose(); core.material.dispose(); } });
}
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
function spawnRing(x, z, R, color, dur) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); scene.add(m);
  effects.push({ obj: m, t: 0, dur, upd: (k) => { m.scale.setScalar(0.3 * R + 0.7 * R * k); m.material.opacity = 0.9 * (1 - k); }, dispose: () => m.material.dispose() });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt; const k = Math.min(1, e.t / e.dur); e.upd(k);
    if (k >= 1) { scene.remove(e.obj); e.dispose && e.dispose(); effects.splice(i, 1); }
  }
}
const texts = [];
function floatText(x, y, z, text, color, size) { texts.push({ x, y, z, text: String(text), color, size, t: 0, ox: fx(-0.4, 0.4) }); if (texts.length > 40) texts.shift(); }
let hurtFlash = 0;

const pv = new THREE.Vector3();
function project(x, y, z) { pv.set(x, y, z).project(camera); if (pv.z > 1) return null; return [(pv.x + 1) / 2 * innerWidth, (1 - pv.y) / 2 * innerHeight]; }
const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
function roundRect(x, y, w, h, r) { if (w <= 0) return; octx.beginPath(); octx.roundRect(x, y, w, h, Math.min(r, w / 2)); octx.fill(); }
function bar(x, y, w, h, k, color) { octx.fillStyle = 'rgba(0,0,0,.55)'; roundRect(x - w / 2 - 1, y - 1, w + 2, h + 2, 3); octx.fillStyle = color; roundRect(x - w / 2, y, w * clamp(k, 0, 1), h, 2); }
function drawOverlay(dt) {
  const W = innerWidth, H = innerHeight;
  octx.clearRect(0, 0, W, H);
  octx.textAlign = 'center'; octx.textBaseline = 'middle';
  octx.strokeStyle = 'rgba(0,0,0,.75)'; octx.lineWidth = 3;
  const myLv = prog.level;
  for (const e of enemies) {
    if (e.dead || !e.m.root.visible) continue;
    if (Math.hypot(e.x - P.x, e.z - P.z) > 10 && e.showBar <= 0 && !e.t.boss) continue;
    const s = project(e.x, e.m.height + 0.3, e.z); if (!s) continue;
    const bw = e.t.boss ? 96 : 40;
    bar(s[0], s[1], bw, e.t.boss ? 7 : 4, e.hp / e.t.hp, e.aggro ? '#ff5d4f' : '#f3c84b');
    const diff = e.t.lv - myLv;
    octx.font = `800 9px ${FONT}`;
    octx.fillStyle = diff > 10 ? '#ff8a7a' : diff > 3 ? '#ffd27a' : 'rgba(255,255,255,.85)';
    const label = e.t.boss ? `${e.t.name} ${e.t.lv}` : String(e.t.lv);
    const lx = e.t.boss ? s[0] : s[0] - bw / 2 - 8, ly = e.t.boss ? s[1] - 8 : s[1] + 2;
    octx.strokeText(label, lx, ly); octx.fillText(label, lx, ly);
  }
  for (const r of remotes.values()) {
    const s = project(r.x, 2.45, r.z); if (!s) continue;
    octx.font = `700 10px ${FONT}`; octx.fillStyle = 'rgba(255,255,255,.9)';
    octx.strokeText(r.name, s[0], s[1] - 6); octx.fillText(r.name, s[0], s[1] - 6);
    if (r.hp < 100) bar(s[0], s[1] + 1, 36, 3, r.hp / 100, '#ff9a5c');
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]; t.t += dt; if (t.t > 0.9) { texts.splice(i, 1); continue; }
    const s = project(t.x + t.ox, t.y + t.t * 1.6, t.z); if (!s) continue;
    const pop = t.t < 0.1 ? 1 + (0.1 - t.t) * 5 : 1;
    octx.globalAlpha = 1 - Math.max(0, t.t - 0.55) / 0.35;
    octx.font = `800 ${Math.round(t.size * pop)}px ${FONT}`;
    octx.lineWidth = 4; octx.strokeStyle = 'rgba(0,0,0,.8)'; octx.strokeText(t.text, s[0], s[1]);
    octx.fillStyle = t.color; octx.fillText(t.text, s[0], s[1]);
  }
  octx.globalAlpha = 1;
  if (hurtFlash > 0) { hurtFlash -= dt; const g = octx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${hurtFlash * 1.2})`); octx.fillStyle = g; octx.fillRect(0, 0, W, H); }
}

const mm = $('minimap'), mctx = mm.getContext('2d');
const WORLD = HALF * 2;
const mmBg = document.createElement('canvas'); mmBg.width = mmBg.height = WORLD;
const MAP_COLOR = { lake: '#4aaee8', oasis: '#4aaee8', boglake: '#4a6a44', frozenlake: 'rgba(220,240,255,.9)', lavalake: '#ff6a2a', volcano: '#3a302c',
  pyramid: '#d9b77a', icecastle: '#dff4ff', sakura: 'rgba(255,183,213,.75)', farm: 'rgba(224,192,96,.7)', stones: '#9a9a92', bigtree: '#2e5a34', mushring: 'rgba(154,122,255,.7)', tower: '#b8564a', arch: '#c8643a' };
function buildMinimapBg() {
  const c = mmBg.getContext('2d'); const img = c.createImageData(WORLD, WORLD);
  for (let j = 0; j < WORLD; j++) for (let i = 0; i < WORLD; i++) {
    const x = i - HALF, z = j - HALF; const col = inWater(x, z) ? [0.3, 0.68, 0.9] : groundColor(x, z);
    const k = (j * WORLD + i) * 4; img.data[k] = col[0] * 255; img.data[k + 1] = col[1] * 255; img.data[k + 2] = col[2] * 255; img.data[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  c.fillStyle = 'rgba(40,60,30,.55)';
  for (const o of obstacles) if (o.r > 1.5 && o.r < 6) { c.beginPath(); c.arc(o.x + HALF, o.z + HALF, o.r * 0.8, 0, 6.29); c.fill(); }
  for (const L of LANDMARKS) {
    const col = MAP_COLOR[L.kind]; if (!col) continue;
    c.fillStyle = col; c.beginPath(); c.arc(L.x + HALF, L.z + HALF, L.block || L.r * 0.8, 0, 6.29); c.fill();
    if (L.kind === 'volcano') { c.fillStyle = '#ff6a2a'; c.beginPath(); c.arc(L.x + HALF, L.z + HALF, 6, 0, 6.29); c.fill(); }
  }
}
function dot(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill(); }
function arrow(ctx, x, y, rot, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-rot + Math.PI);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.8); ctx.lineTo(-s * 0.7, s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function drawMinimap() {
  const S = 200, view = 80, sc = S / view;
  mctx.save(); mctx.clearRect(0, 0, S, S);
  if (P.arena) {
    mctx.fillStyle = '#3d4636'; mctx.fillRect(0, 0, S, S);
    const c = P.arena.center; dot(mctx, (c.x - P.x) * sc + S / 2, (c.z - P.z) * sc + S / 2, ARENA.r * sc, '#b9ab92');
  } else mctx.drawImage(mmBg, (P.x + HALF) - view / 2, (P.z + HALF) - view / 2, view, view, 0, 0, S, S);
  const at = (x, z) => [(x - P.x) * sc + S / 2, (z - P.z) * sc + S / 2];
  for (const e of enemies) { if (e.dead) continue; const [x, y] = at(e.x, e.z); if (x < 0 || y < 0 || x > S || y > S) continue; dot(mctx, x, y, e.t.boss ? 8 : 3.5, e.t.boss ? '#c77bff' : e.aggro ? '#ff4b3e' : '#ffae4a'); }
  for (const n of world.npcs) { const [x, y] = at(n.x, n.z); dot(mctx, x, y, 5, '#' + n.look.color.toString(16).padStart(6, '0')); }
  for (const c of CHECKPOINTS) { const [x, y] = at(c.x, c.z); dot(mctx, x, y, 5, prog.checkpoints.includes(c.id) ? '#7ff0ff' : '#9aa0a8'); }
  for (const c of world.chests || []) { if (!chestReady(c)) continue; const [x, y] = at(c.x, c.z); if (x > 0 && y > 0 && x < S && y < S) { dot(mctx, x, y, 5, '#3a2a0a'); dot(mctx, x, y, 3.5, '#ffd36b'); } }
  for (const r of remotes.values()) { const [x, y] = at(r.x, r.z); dot(mctx, x, y, 4, '#7fb8ff'); }
  arrow(mctx, S / 2, S / 2, P.rot, 10);
  mctx.restore();
}
function drawBigMap(bm) {
  const bctx = bm.getContext('2d');
  const S = bm.width, sc = S / WORLD;
  bctx.clearRect(0, 0, S, S);
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(mmBg, 0, 0, S, S);
  const at = (x, z) => [(x + HALF) * sc, (z + HALF) * sc];
  bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
  for (const c of CAMPS) {
    const [x, y] = at(c.x, c.z); const t = ENEMIES[c.type];
    const diff = t.lv - prog.level;
    bctx.fillStyle = t.boss ? 'rgba(199,123,255,.35)' : diff > 10 ? 'rgba(255,75,62,.3)' : diff > 3 ? 'rgba(255,174,74,.3)' : 'rgba(255,255,255,.22)';
    bctx.beginPath(); bctx.arc(x, y, Math.max(S / 90, (c.r + 4) * sc), 0, 6.29); bctx.fill();
    bctx.font = `800 ${Math.round(S / 60)}px ${FONT}`; bctx.fillStyle = '#fff'; bctx.strokeStyle = 'rgba(0,0,0,.6)'; bctx.lineWidth = 3;
    bctx.strokeText(t.lv, x, y); bctx.fillText(t.lv, x, y);
  }
  bctx.font = `${Math.round(S / 48)}px "Material Symbols Rounded"`;
  for (const n of world.npcs) { const [x, y] = at(n.x, n.z); dot(bctx, x, y, S / 70, 'rgba(0,0,0,.55)'); bctx.fillStyle = '#' + n.look.color.toString(16).padStart(6, '0'); bctx.fillText(n.look.icon, x, y); }
  for (const c of CHECKPOINTS) { const [x, y] = at(c.x, c.z); const on = prog.checkpoints.includes(c.id); dot(bctx, x, y, S / 70, 'rgba(0,0,0,.55)'); bctx.fillStyle = c.id === prog.checkpoint ? '#7dff9a' : on ? '#7ff0ff' : '#9aa0a8'; bctx.fillText('flag', x, y); }
  for (const r of remotes.values()) { const [x, y] = at(r.x, r.z); dot(bctx, x, y, S / 110, '#7fb8ff'); }
  bctx.font = `700 ${Math.round(S / 70)}px ${FONT}`; bctx.lineWidth = 3;
  for (const L of LANDMARKS) { const [x, y] = at(L.x, L.z); bctx.strokeStyle = 'rgba(0,0,0,.6)'; bctx.fillStyle = '#fff6d8'; bctx.strokeText(L.name, x, y + (L.block || L.r * 0.8) * sc + S / 90); bctx.fillText(L.name, x, y + (L.block || L.r * 0.8) * sc + S / 90); }
  for (const c of world.chests || []) if (chestReady(c)) { const [x, y] = at(c.x, c.z); dot(bctx, x, y, S / 160, '#ffd36b'); }
  if (!P.arena) { const [x, y] = at(P.x, P.z); arrow(bctx, x, y, P.rot, S / 50); }
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
function updateHud() {
  const pots = (prog.inv.pot_s || 0) + (prog.inv.pot_l || 0);
  Object.assign(ui.hud, {
    hp: Math.ceil(P.hp), mhp: P.mhp, xp: prog.xp / xpNeed(prog.level), lv: prog.level, points: pointsLeft(prog),
    atkIcon: prog.style === 'power' && prog.power ? POWER_BY_ID[prog.power.id].icon : STYLE_UI[prog.style].icon,
    potions: pots, potHidden: !pots || !!P.arena,
  });
  ui.prog = structuredClone(prog);
  hudDirty = false;
  updateCooldowns();
}
/** The move buttons for the current style: two for fists or sword, two to four for a power. */
function skillSlots() {
  const style = styleOk(prog, prog.style) ? prog.style : 'melee', lv = masteryOf(prog, style).lv, need = unlockOf(style);
  const color = style === 'power' ? hex(POWER_BY_ID[prog.power.id].color) : '';
  return movesOf(prog, style).map((mv, i) => ({ icon: mv.icon, color, lock: lv < need[i] ? need[i] : 0, cd: P.mvCd[style][i], max: mv.cd, aim: aimKind(mv) }));
}
function updateCooldowns() {
  const slots = skillSlots();
  // Rounded to 1/50 so Vue re-renders the cooldown rings a few times a second, not every frame.
  const next = slots.map(s => ({ icon: s.icon, color: s.color, lock: s.lock, aim: s.aim, cd: s.cd > 0 ? Math.ceil(s.cd) : 0, k: s.cd > 0 ? Math.round((s.cd / s.max) * 50) / 50 : 0 }));
  if (JSON.stringify(next) !== JSON.stringify(ui.hud.skills)) ui.hud.skills = next;
  ui.hud.potCdK = P.potCd > 0 ? Math.round((P.potCd / POTION_CD) * 50) / 50 : 0;
  ui.hud.safe = !P.arena && isSafe(P.x, P.z);
}
const skyCol = new THREE.Color(), skyTmp = new THREE.Color();
const NIGHT_SKY = new THREE.Color(0x16233f), DUSK_SKY = new THREE.Color(0xf0a070), RAIN_SKY = new THREE.Color(0x6a7684);
const SUN_DAY = new THREE.Color(0xfff0d8), SUN_DUSK = new THREE.Color(0xffa060), MOON = new THREE.Color(0x9ab8ff);
/** The sky follows the region, the time of day and the rain; the sun dims at night and in rain. */
function updateSky() {
  const ds = dayState();
  const w = regionWeights(P.x, P.z);
  const wet = rainState() * (1 - w.snow - w.desert - w.volcano);
  if (!P.arena) {
    skyCol.setHex(REGION_SKY.core);
    for (const k of ['snow', 'swamp', 'desert', 'volcano']) if (w[k]) skyCol.lerp(skyTmp.setHex(REGION_SKY[k]), w[k]);
    skyCol.lerp(DUSK_SKY, ds.dusk * 0.3).lerp(NIGHT_SKY, (1 - ds.day) * 0.6).lerp(RAIN_SKY, wet * 0.45);
    scene.background.lerp(skyCol, 0.15); scene.fog.color.copy(scene.background);
  }
  sun.intensity = 2.6 * (0.4 + 0.6 * ds.day) * (1 - wet * 0.4);
  sun.color.copy(SUN_DAY).lerp(SUN_DUSK, ds.dusk * 0.6).lerp(MOON, 1 - ds.day);
  hemi.intensity = 1.5 * (0.62 + 0.38 * ds.day) * (1 - wet * 0.25);
  world.night = 1 - ds.day; world.wet = wet;
}
let curZone = '';
let wasSafe = null;
function checkZone() {
  const safe = !P.arena && isSafe(P.x, P.z);
  if (!P.arena && !P.dead && wasSafe !== null && safe !== wasSafe) {
    if (safe) bigText('AN TOÀN', 'Không ai đánh được bạn ở đây', 1300);
    else bigText('VÙNG PVP', 'Người chơi khác có thể tấn công bạn', 1600);
  }
  wasSafe = safe;
  const z = zoneAt(P.x, P.z);
  if (z !== curZone) { curZone = z; showZone(z); }
}
function swapStyle() {
  if (P.dash || P.leap || P.dead) return;
  const order = STYLE_ORDER.filter(s => styleOk(prog, s));
  prog.style = order[(order.indexOf(prog.style) + 1) % order.length]; P.combo = 0; P.comboT = 0;
  net.send({ t: 'style', s: prog.style });
  applyGear(); hudDirty = true;
}
const syncMe = () => Object.assign(ui.me, me);
function openShop(role) { ui.shop.role = role; ui.shop.tab = SHOPS[role].tabs[0]; openModal('shop'); }
async function openArena() {
  openModal('arena');
  try { const r = await api('/api/me'); Object.assign(me, r.user); syncMe(); } catch { }
}
let queued = false, queuedAt = 0;
const setQueued = (on) => { queued = on; queuedAt = performance.now(); ui.queue.on = on; ui.queue.time = '0:00'; };
let atkHeld = false;
function interact() {
  if (!nearNpc) return;
  if (nearNpc.role === 'arena') openArena();
  else if (nearNpc.role === 'purge') openModal('purge');
  else if (nearNpc.role === 'quest') { ui.quest.board = nearNpc.board; openModal('quest'); }
  else openShop(nearNpc.role);
}
const keys = {};
const typing = () => document.activeElement?.tagName === 'INPUT';
addEventListener('keydown', (e) => {
  if (typing()) return;
  keys[e.code] = true;
  if (e.code === 'KeyJ' || e.code === 'Space') atkHeld = true;
  if (e.code === 'KeyK' || e.code === 'Digit1') castMove(0, null);
  if (e.code === 'KeyL' || e.code === 'Digit2') castMove(1, null);
  if (e.code === 'KeyI' || e.code === 'Digit3') castMove(2, null);
  if (e.code === 'KeyO' || e.code === 'Digit4') castMove(3, null);
  if (e.code === 'KeyB') openModal('bag');
  if (e.code === 'KeyQ') swapStyle();
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyR') usePotion();
  if (e.code === 'KeyM') openModal('map');
  if (e.code === 'KeyC') openModal('stats');
  if (e.code === 'KeyV') dance();
  if (e.code === 'KeyT') openModal('top');
  if (e.code === 'Escape') closeModal();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyJ' || e.code === 'Space') atkHeld = false; });
['gesturestart', 'gesturechange', 'dblclick'].forEach(ev => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
addEventListener('contextmenu', (e) => e.preventDefault());

// Commands the Vue UI calls.
Object.assign(game, {
  attack: (down) => { atkHeld = down; if (down) attack(); },
  skill: (i = 0) => castMove(i, null),
  aim: (i, phase, dx, dy, k, cancel) => aimMove(i, phase, dx, dy, k, cancel),
  stat: (k, n = 1) => net.send({ t: 'stat', k, n }),
  statReset: () => net.send({ t: 'sreset' }),
  openCreator: () => openCreator(),
  toggleSound: () => { ui.sound = sound.toggle(); },
  dance: () => dance(),
  previewAvatar: (a) => previewAvatar(a),
  saveAvatar: (a) => saveAvatar(a),
  swap: () => swapStyle(),
  potion: () => usePotion(),
  interact: () => interact(),
  buy: (id, qty = 1) => net.send({ t: 'buy', id, qty }),
  sell: (id, qty = 1) => net.send({ t: 'sell', id, qty }),
  equip: (slot, id) => { prog.gear[slot] = id; net.send({ t: 'eq', slot, id }); applyGear(); hudDirty = true; },
  use: (id) => net.send({ t: 'use', id }),
  purge: () => net.send({ t: 'purge' }),
  quest: (kind, id) => net.send({ t: kind, id }),
  toggleQueue: () => net.send({ t: queued ? 'unqueue' : 'queue' }),
  rename: async (name) => { const r = await api('/api/me/name', { name }); Object.assign(me, r.user); syncMe(); },
  logout: () => logout(),
  drawBigMap: (canvas) => drawBigMap(canvas),
});

function onNet(m) {
  switch (m.t) {
    case 's': {
      const now = performance.now();
      const [hp, mhp, dead] = m.me;
      const wasHp = P.hp;
      P.hp = hp; P.mhp = mhp;
      if (dead && !P.dead) die();
      if (P.arena && m.m) P.arena.hp = m.m;
      if (Math.round(wasHp) !== hp) hudDirty = true;
      for (const e of m.ps) {
        let r = remotes.get(e[0]);
        if (!r) { r = new Remote(e[0], typeof e[7] === 'string' ? e[7] : ''); remotes.set(e[0], r); }
        r.apply(e, now);
      }
      for (const [id, r] of remotes) if (now - r.seen > 1500) { r.dispose(); remotes.delete(id); }
      if (m.prog) onProg(m.prog);
      break;
    }
    case 'pos': {
      P.x = m.x; P.z = m.z; P.kx = P.kz = 0; P.dash = null;
      if (P.arena && m.z < 250) leaveArena();
      if (P.dead) { P.dead = false; P.actT = 0; ui.dead = false; player.play(idleAnim(), { fade: 0 }); }
      camera.position.set(P.x, 0, P.z).add(CAM_OFF);
      break;
    }
    case 'loot': {
      const e = enemyById.get(m.e);
      if (e) floatText(e.x, e.m.height + 0.9, e.z, `+${m.g}`, '#ffd36b', 15);
      sfx.coin();
      if (e && m.gems) floatText(e.x, e.m.height + 1.6, e.z, `+${m.gems} ngọc`, '#7fe8ff', 16);
      if (e && m.xp) floatText(e.x, e.m.height + 1.3, e.z, `+${m.xp} KN`, '#b7ff7a', 14);
      for (const id of m.items || []) toast(`+ ${ITEMS[id].name}`);
      break;
    }
    case 'fx': {
      const style = m.s || 'power', moves = style === 'power' ? POWER_BY_ID[m.p]?.moves : movesOf(prog, style);
      const mv = moves?.[m.m];
      const who = remotes.get(m.id) || { x: m.x, z: m.z };
      if (mv && Math.hypot(who.x - P.x, who.z - P.z) < 26) sfx.cast(mv.k, mv.fx);
      if (mv) runMove(mv, style === 'power' ? POWER_BY_ID[m.p].color : style === 'sword' ? SWORD_GLOW : FIST_GLOW, who, m.r, m.d || 0, false);
      break;
    }
    case 'power': {
      const pw = POWER_BY_ID[m.id];
      bigText(pw.name, pw.desc, 2600);
      spawnRing(P.x, P.z, 3, pw.color, 0.7); spawnBurst(P.x, 1.2, P.z, pw.color, 30, 6);
      P.mvCd.power = [0, 0, 0, 0];
      break;
    }
    case 'purged': toast('Đã xóa sức mạnh'); spawnRing(P.x, P.z, 2.5, 0xb36bff, 0.6); break;
    case 'sold': toast(`+${m.g} vàng`); break;
    case 'qdone': {
      const q = QUEST_BY_ID[m.id];
      bigText('Hoàn thành', `+${q.gold.toLocaleString('vi-VN')} vàng${q.gems ? ` · +${q.gems} ngọc` : ''}`, 2200);
      spawnRing(P.x, P.z, 2.6, 0xffd36b, 0.6); spawnBurst(P.x, 1.4, P.z, 0xffd36b, 20, 5);
      break;
    }
    case 'dead': die(m.by); break;
    case 'kill': toast(`Hạ gục ${m.name}`); break;
    case 'pvp': {
      const toMe = m.to === me.id;
      const target = toMe ? null : remotes.get(m.to);
      const x = toMe ? P.x : target?.x, z = toMe ? P.z : target?.z;
      if (x == null) break;
      floatText(x, 2.6, z, m.dmg, toMe ? '#ff6a5a' : m.crit ? '#ffcf3a' : '#ffffff', m.crit ? 22 : 18);
      spawnBurst(x, 1.2, z, 0xff6a5a, 6, 3);
      if (toMe) { P.kx += m.kx; P.kz += m.kz; P.flash = 0.2; hurtFlash = 0.25; P.shake = Math.max(P.shake, 0.15); sfx.hurt(); } else sfx.hit(m.crit);
      if (!toMe && target) target.flashT = 0.15;
      break;
    }
    case 'bought': toast(`Đã mua ${ITEMS[m.id].name}`); break;
    case 'queue': setQueued(m.on); break;
    case 'match': enterArena(m); break;
    case 'mend': {
      me.rating = m.rating; me.wins = m.wins; me.losses = m.losses; syncMe();
      if (P.arena) P.arena.state = 'done';
      const label = m.result === 'win' ? 'Chiến thắng' : m.result === 'lose' ? 'Thất bại' : 'Hòa';
      bigText(label, `${m.delta >= 0 ? '+' : ''}${m.delta} điểm · +${m.reward} vàng`, 2800);
      break;
    }
    case 'kicked': openModal('kicked'); break;
    case 'chest': {
      const c = world.chests?.[m.id];
      prog.chests[m.id] = Date.now();
      if (c) { c.openT = 0; spawnBurst(c.x, 1, c.z, 0xffd36b, 30, 6); spawnPillar(c.x, c.z, 0xffd36b, 0.9); spawnRing(c.x, c.z, 3, 0xffd36b, 0.6); }
      bigText('Rương Báu', [`+${m.g.toLocaleString('vi-VN')} vàng`, `+${m.xp.toLocaleString('vi-VN')} KN`, m.gems ? `+${m.gems} ngọc` : '', m.item ? ITEMS[m.item].name : ''].filter(Boolean).join(' · '), 2400);
      sfx.chest();
      break;
    }
    case 'welcome': {
      Object.assign(me, m.me); syncMe(); onProg(m.prog);
      if (P.arena) leaveArena();
      setQueued(false);
      P.dead = false; P.dash = null; P.leap = null; P.pending.length = 0; ui.dead = false;
      onNet({ t: 'pos', x: m.x, z: m.z });
      for (const r of remotes.values()) r.dispose();
      remotes.clear();
      break;
    }
  }
}
function onProg(p) {
  const old = prog;
  prog = p;
  if (old.level && p.level > old.level) {
    bigText(`Cấp ${p.level}`, `+${(p.level - old.level) * 3} điểm chỉ số`, 1800);
    spawnRing(P.x, P.z, 2.6, 0xffe066, 0.6); spawnPillar(P.x, P.z, 0xffe066, 0.8); spawnBurst(P.x, 1.2, P.z, 0xffe066, 24, 6);
    sfx.level();
  }
  for (const k of ['melee', 'sword', 'power']) {
    const a = masteryOf(old, k), b = masteryOf(p, k);
    if (!a || !b || (k === 'power' && old.power?.id !== p.power?.id) || b.lv <= a.lv) continue;
    toast(`Thông thạo ${MASTERY_INFO[k][0]} ${b.lv}`);
    unlockOf(k).forEach((lv, i) => { const mv = movesOf(p, k)[i]; if (mv && b.lv >= lv && a.lv < lv) { bigText(mv.n, 'Đã mở chiêu mới', 1800); sfx.unlock(); } });
  }
  for (const [id, n] of Object.entries(p.quests || {})) {
    const q = QUEST_BY_ID[id];
    if (n >= q.count && (old.quests?.[id] ?? 0) < q.count) toast(`${ENEMIES[q.type].name} ${n}/${q.count}`);
  }
  if (p.checkpoint !== old.checkpoint && !old.checkpoints.includes(p.checkpoint)) toast(CHECKPOINTS.find(c => c.id === p.checkpoint).name);
  if (!styleOk(p, p.style)) p.style = 'melee';
  if (player && p.avatar && avatarCode(p.avatar) !== player.av && !ui.creator.show) buildPlayer();
  applyGear();
  if (P.actT <= 0 && !P.dead) player.play(idleAnim(), { fade: 0.2 });
  hudDirty = true;
}
function die(by) {
  if (P.dead) return;
  P.dead = true; P.deadT = 0; P.pending.length = 0; P.dash = null;
  if (P.leap) { P.leap = null; player.root.position.y = 0; }
  player.play('Death_A', { once: true, fade: 0.1 });
  sfx.die();
  if (!P.arena) setTimeout(() => { if (P.dead) ui.dead = true; }, 700);
  if (by) toast(by);
}
function enterArena(m) {
  setQueued(false); closeModal('arena');
  buildArena(m.slot);
  const now = performance.now();
  P.arena = { slot: m.slot, center: ARENA.center(m.slot), opp: m.opp, state: 'countdown', startAt: now + m.startIn, endAt: now + m.startIn + m.duration, hp: {} };
  Object.assign(ui.arena, { show: true, opp: m.opp.name, oppHp: 100 });
  hudDirty = true;
  scene.fog.far = 60;
}
function leaveArena() {
  P.arena = null;
  ui.arena.show = false;
  hudDirty = true;
  scene.fog.far = 80;
}
function updateArena() {
  const a = P.arena; if (!a) return;
  const now = performance.now();
  if (a.state === 'countdown') {
    const left = Math.ceil((a.startAt - now) / 1000);
    if (left !== a.lastCount) { a.lastCount = left; if (left > 0) bigText(String(left), '', 900); }
    if (now >= a.startAt) { a.state = 'fight'; bigText('Đấu!', '', 800); }
  }
  if (P.hp <= 0 && !P.dead) { P.dead = true; P.deadT = 0; P.pending.length = 0; player.play('Death_A', { once: true, fade: 0.1 }); }
  const opp = remotes.get(a.opp.id);
  ui.arena.oppHp = opp ? opp.hp : 100;
  const t = Math.max(0, Math.ceil((a.endAt - Math.max(now, a.startAt)) / 1000));
  ui.arena.time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const clock = new THREE.Clock();
let nearNpc = null, hudT = 0, mmT = 0, stT = 0;
function updatePlayer(dt, time) {
  const r = player.root;
  player.mixer.update(dt);
  if (P.dead) {
    P.deadT += dt;
    if (P.deadT > 3 && !P.arena && !P.reviveSent) { P.reviveSent = true; net.send({ t: 'revive' }); setTimeout(() => { P.reviveSent = false; }, 2000); }
    r.position.set(P.x, 0, P.z); return;
  }
  for (let i = P.pending.length - 1; i >= 0; i--) { const p = P.pending[i]; p.t -= dt; if (p.t <= 0) { P.pending.splice(i, 1); p.fn(); } }
  let ix = input.joyX, iz = input.joyY;
  if (!typing()) {
    if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyW || keys.ArrowUp) iz -= 1; if (keys.KeyS || keys.ArrowDown) iz += 1;
  }
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const frozen = arenaFrozen() || ui.creator.show;
  if (ui.creator.show) { P.rot = 0; ix = iz = 0; }
  const moving = il > 0.12 && !P.dash && !P.leap && !frozen;
  const acting = P.actT > 0;
  P.aim = il > 0.12 && !frozen ? Math.atan2(ix, iz) : null;
  const speed = speedFor(prog) * (acting ? 0.45 : 1);
  if (P.dash) updateDash(dt);
  else if (P.leap) updateLeap(dt);
  else if (moving) { moveEntity(P, ix * speed * dt, iz * speed * dt, P.r); if (!acting) P.rot = P.aim; }
  if (P.kx || P.kz) { const kd = Math.exp(-dt * 9); moveEntity(P, P.kx * dt, P.kz * dt, P.r); P.kx *= kd; P.kz *= kd; if (Math.abs(P.kx) + Math.abs(P.kz) < 0.05) P.kx = P.kz = 0; }
  for (const e of enemies) {
    if (e.dead || P.arena) continue; const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz), min = e.t.r + P.r;
    if (d < min && d > 0.001) moveEntity(P, dx / d * (min - d) * 0.6, dz / d * (min - d) * 0.6, P.r);
  }
  P.atkCd -= dt; P.comboT -= dt; P.actT -= dt; P.potCd -= dt;
  for (const cds of Object.values(P.mvCd)) for (let i = 0; i < cds.length; i++) cds[i] = Math.max(0, cds[i] - dt);
  P.shieldT -= dt; player.bubble.visible = P.shieldT > 0;
  if (P.shieldT > 0) { player.bubble.material.color.setHex(P.shieldColor || 0x9fe8ff); player.bubble.scale.setScalar(1 + Math.sin(time * 6) * 0.03); }
  updateAim();
  if (atkHeld) attack();
  if (moving || P.actT > 0.3) P.dance = false;
  if (P.actT <= 0) {
    if (moving) player.play('Running_A', { fade: 0.15, speed: clamp(il, 0.5, 1) * 1.1 });
    else player.play(P.dance ? 'Dance' : idleAnim(), { fade: 0.2 });
  }
  // Dust kicked up while running, in the color of the ground.
  P.dustT = (P.dustT || 0) - dt;
  if (moving && P.dustT <= 0 && !P.arena) {
    P.dustT = 0.16;
    const w = regionWeights(P.x, P.z), c = w.snow > 0.5 ? 0xf4f8ff : w.desert > 0.5 ? 0xe4c890 : w.volcano > 0.5 ? 0x5a4a44 : w.swamp > 0.5 ? 0x5a6a44 : 0xb8a07a;
    spawnBurst(P.x - Math.sin(P.rot) * 0.4, 0.1, P.z - Math.cos(P.rot) * 0.4, c, 1, 0.9);
  }
  r.position.set(P.x, 0, P.z);
  r.rotation.y = lerpAngle(r.rotation.y, P.rot, 1 - Math.exp(-dt * (acting ? 30 : 16)));
  P.flash -= dt; player.flash(P.flash > 0 ? P.flash * 4 : 0, 0xff3020);

  let nn = null;
  if (!P.arena) for (const n of world.npcs) if (Math.hypot(P.x - n.x, P.z - n.z) < NPC_RANGE) nn = n;
  if (nn !== nearNpc) {
    nearNpc = nn;
    ui.hud.actIcon = nn ? nn.look.icon : null;
    if (!nn) { closeModal('shop'); closeModal('arena'); closeModal('purge'); closeModal('quest'); }
  }
  if (!P.arena && time - P.cpSent > 1) for (const c of CHECKPOINTS) {
    if (Math.hypot(P.x - c.x, P.z - c.z) < 3.5 && (prog.checkpoint !== c.id)) { P.cpSent = time; net.send({ t: 'cp', id: c.id }); }
  }
}
const camGoal = new THREE.Vector3(), camOff = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpLook = new THREE.Vector3();
/* ---- Treasure chests --------------------------------------------------------------------------
 * Fixed spots on the map; walking up to one that is ready opens it (the server checks distance and
 * the per-player cooldown). A ready chest glows and bobs a sparkle; an opened one stays open.
 */
let ambient = null;
const chestReady = (c) => Date.now() - (prog.chests?.[c.id] || 0) >= CHEST_CD;
function buildChests() {
  const wood = mat(0x8a5a2a), band = mat(0xd8b048, { metalness: 0.7, roughness: 0.3 });
  const baseG = new THREE.BoxGeometry(1.3, 0.75, 0.85), lidG = new THREE.CylinderGeometry(0.43, 0.43, 1.3, 10, 1, false, 0, Math.PI);
  lidG.rotateZ(Math.PI / 2); lidG.translate(0, 0, 0.43);
  world.chests = CHESTS.map(c => {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = (c.id * 1.7) % 6.28; scene.add(g);
    mesh(baseG, wood, 0, 0.38, 0, g);
    for (const x of [-0.5, 0.5]) mesh(new THREE.BoxGeometry(0.1, 0.78, 0.9), band, x, 0.38, 0, g);
    mesh(new THREE.BoxGeometry(0.2, 0.24, 0.06), band, 0, 0.6, 0.44, g);
    const lid = new THREE.Group(); lid.position.set(0, 0.75, -0.43); g.add(lid);
    mesh(lidG, wood, 0, 0, 0, lid);
    const glowM = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 7, 12, 1, true), glowM); beam.position.y = 3.5; g.add(beam);
    addObs(c.x, c.z, 0.8);
    return { ...c, g, lid, beam, sent: 0, openT: 1 };
  });
}
function updateChests(dt, time) {
  if (!world.chests) return;
  for (const c of world.chests) {
    if (Math.abs(c.x - P.x) > 60 || Math.abs(c.z - P.z) > 60) continue;
    const ready = chestReady(c);
    c.lid.rotation.x = ready ? Math.sin(time * 2 + c.id) * 0.03 : Math.max(c.lid.rotation.x - dt * 6, -1.9);
    c.beam.visible = ready; c.beam.material.opacity = 0.25 + Math.sin(time * 3 + c.id) * 0.1;
    if (ready && Math.random() < dt * 3) spawnBurst(c.x + fx(-0.6, 0.6), 1.2, c.z + fx(-0.6, 0.6), 0xffe9a0, 1, 1.2);
    if (ready && !P.dead && !P.arena && Math.hypot(c.x - P.x, c.z - P.z) < 2.6 && time - c.sent > 2) { c.sent = time; net.send({ t: 'chest', id: c.id }); }
  }
}
/** Lava breathes, spirit lights and the castle spire float, rain splashes. */
function updateLandmarks(dt, time) {
  const L = world.landmarks; if (!L) return;
  const night = world.night || 0;
  for (const m of L.lava) m.emissiveIntensity = 1.1 + Math.sin(time * 1.7) * 0.25 + night * 0.4;
  for (const m of L.glow) m.emissiveIntensity = 0.5 + Math.sin(time * 2.3) * 0.2 + night * 0.6;
  for (const w of L.water) w.m.color.copy(w.base).offsetHSL(0, 0, Math.sin(time * 1.3) * 0.02 - night * 0.12);
  L.castle.forEach((o, i) => { o.userData.y ??= o.position.y; o.position.y = o.userData.y + Math.sin(time * 1.2 + i) * 0.3; o.rotation.y += dt * 0.3; });
}
function dance() {
  if (P.dead || P.dash || P.leap || P.actT > 0) return;
  P.dance = !P.dance;
  if (P.dance) { player.play('Dance', { fade: 0.2 }); spawnBurst(P.x, 2.6, P.z, 0xff8ac8, 6, 2); }
}
function splash(x, z, loud) {
  spawnRing(x, z, loud ? 1.2 : 0.35, 0xd8ecff, loud ? 0.5 : 0.3);
  if (loud) { spawnBurst(x, 0.2, z, 0x9ad8ff, 6, 2.5); if (Math.hypot(x - P.x, z - P.z) < 20) sfx.splash(); }
}

/* ---- Character creator ----------------------------------------------------------------------
 * The camera comes down to the player, who turns to face it; the Vue panel edits ui.creator.a and
 * every change rebuilds the body. Saving sends the looks to the server, which shows them to others.
 */
function openCreator() {
  ui.creator.a = { ...(prog.avatar || defaultAvatar('m')) };
  ui.creator.first = !prog.avatar;
  ui.creator.show = true;
  closeModal();
  P.creatorT = 0;
  buildPlayer(ui.creator.a);
}
function previewAvatar(a) {
  a ||= prog.avatar || defaultAvatar('m');
  if (!player || avatarCode(a) === player.av) return;
  buildPlayer(a);
  player.play('Spell_Exit', { once: true, dur: 0.6, fade: 0.1 });
  P.actT = 0.6;
  spawnBurst(P.x, 1.4, P.z, 0xfff0a0, 10, 2.5);
}
function saveAvatar(a) {
  net.send({ t: 'avatar', a });
  prog.avatar = { ...a };
  const first = ui.creator.first;
  ui.creator.show = false;
  buildPlayer(prog.avatar);
  player.play('Dance', { fade: 0.15 }); P.actT = 1.6;
  spawnRing(P.x, P.z, 2.4, 0xffe066, 0.6); spawnBurst(P.x, 1.4, P.z, 0xffe066, 24, 5);
  if (first) bigText(`Chào ${me.name}`, 'Ra khỏi làng là vào vùng PvP', 2600);
}
function updateCamera(dt) {
  if (ui.creator.show) {
    // Close-up from the front, the player a little left of centre so the panel fits on the right.
    const face = ui.creator.face;
    camGoal.set(P.x + (face ? 0.3 : 0.9), face ? 2.62 : 2.1, P.z + (face ? 1.9 : 5.2));
    camera.position.lerp(camGoal, 1 - Math.exp(-dt * 6));
    camLook.lerp(tmpLook.set(P.x + (face ? 0.3 : 0.9), face ? 2.42 : 1.45, P.z), 1 - Math.exp(-dt * 6));
    camera.lookAt(camLook);
    sun.position.set(P.x + 20, 34, P.z + 12); sun.target.position.set(P.x, 0, P.z);
    return;
  }
  camOff.copy(CAM_OFF).multiplyScalar(camDist);
  camGoal.set(P.x, 0, P.z).add(camOff);
  camera.position.lerp(camGoal, 1 - Math.exp(-dt * 10));
  if (P.shake > 0) { P.shake = Math.max(0, P.shake - dt); const s = P.shake * 0.8; camera.position.x += fx(-s, s); camera.position.z += fx(-s, s); }
  camera.lookAt(camLook.set(camera.position.x - camOff.x, 0, camera.position.z - camOff.z));
  sun.position.set(P.x + 20, 34, P.z + 12); sun.target.position.set(P.x, 0, P.z);
}
function frame(dt, time) {
  updatePlayer(dt, time);
  updateArena();
  for (const e of enemies) {
    const far = P.arena || Math.abs(e.x - P.x) > 46 || Math.abs(e.z - P.z) > 40;
    if (far && !e.aggro && !e.dead) { e.m.root.visible = false; e.wT = 0; e.cd -= dt; continue; }
    if (!e.dead) e.m.root.visible = true;
    e.update(dt, time);
  }
  for (let i = 0; i < enemies.length; i++) { const a = enemies[i]; if (a.dead) continue; for (let j = i + 1; j < enemies.length; j++) { const b = enemies[j]; if (b.dead || a.camp !== b.camp) continue; const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = a.t.r + b.t.r; if (d < min && d > 0.001) { const p = (min - d) / 2 / d; a.x += dx * p; a.z += dz * p; b.x -= dx * p; b.z -= dz * p; } } }
  for (const r of remotes.values()) r.update(dt);
  for (const n of world.npcs) { if (n.rig && Math.abs(n.x - P.x) < 40 && Math.abs(n.z - P.z) < 40) n.rig.mixer.update(dt); n.mk.position.y = 2.75 + Math.sin(time * 2.5 + n.x) * 0.15; n.mk.rotation.y = time * 1.5; }
  for (const c of world.checkpoints) {
    const on = prog.checkpoints.includes(c.id), cur = prog.checkpoint === c.id;
    c.crystal.material.color.setHex(cur ? 0x7dff9a : on ? 0x7ff0ff : 0x9aa0a8);
    c.crystal.material.emissive.setHex(cur ? 0x1f8a3a : on ? 0x1a6a80 : 0x000000);
    c.crystal.position.y = 2.1 + Math.sin(time * 2 + c.x) * 0.12; c.crystal.rotation.y = time;
  }
  updateTimers(dt); updateShots(dt); updateZones(dt, time); updateAuras(dt);
  if (world.shrineCore) {
    world.shrineCore.rotation.y = time * 0.8; world.shrineCore.position.y = 3 + Math.sin(time * 1.6) * 0.25;
    world.shrineGems.forEach((g, i) => { g.rotation.y = time * 1.5; g.position.y = 3.8 + Math.sin(time * 2 + i) * 0.15; });
  }
  updateParticles(dt); updateEffects(dt); updateCamera(dt);
  if (ambient) ambient.update(dt, time, P.x, P.z, 1 - (world.night || 0), rainState(), splash);
  updateLandmarks(dt, time);
  updateChests(dt, time);
  world.water.material.color.setHSL(0.56, 0.75, 0.6 + Math.sin(time * 1.4) * 0.02);
  for (const f of world.fires) { const k = 1 + Math.sin(time * 18 + f.f1.id) * 0.12; f.f1.scale.set(k, 1 + Math.sin(time * 13) * 0.15, k); f.f2.scale.setScalar(1 + Math.sin(time * 21) * 0.15); }
  renderer.render(scene, camera);
  drawOverlay(dt);
  hudT -= dt; if (hudT <= 0 || hudDirty) { if (hudDirty) updateHud(); updateCooldowns(); hudT = 0.1; }
  mmT -= dt; if (mmT <= 0) { drawMinimap(); checkZone(); updateSky(); if (++wakeTick % 5 === 0) wakeCamps(); mmT = 0.1; if (queued) { const s = Math.floor((performance.now() - queuedAt) / 1000); ui.queue.time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }
  stT -= dt;
  if (stT <= 0) { stT = 0.1; net.send({ t: 'st', x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, r: Math.round(P.rot * 100) / 100, a: Math.max(0, ANIMS.indexOf(player.clip)) }); }
}
function loop() {
  frame(Math.min(clock.getDelta(), 0.05), clock.elapsedTime);
  requestAnimationFrame(loop);
}

async function boot(login) {
  resize();
  const assets = loadAssets();
  let user;
  try { user = await (login || ensureLogin()); }
  catch { ui.loading.error = 'Không kết nối được máy chủ'; ui.loading.auth = true; return; }
  try { await assets; } catch { ui.loading.error = 'Không tải được mô hình'; ui.loading.auth = true; return; }
  Object.assign(me, user); syncMe();
  const welcome = await new Promise((resolve) => {
    net = connect((m) => { if (m.t === 'welcome') resolve(m); else if (started) onNet(m); }, (ok) => { ui.online = ok; });
  });
  Object.assign(me, welcome.me); syncMe();
  prog = welcome.prog; P.x = welcome.x; P.z = welcome.z; P.hp = welcome.hp; P.mhp = maxHpFor(prog);
  Enemy.foxScale = 2.7 / measureLength(A.fox.scene);
  initParticles();
  buildGround();
  buildVillage();
  buildCheckpoints();
  world.landmarks = buildLandmarks({ scene, addObs, inst, rand });
  buildNature();
  buildChests();
  ambient = createAmbient({ scene });
  ambient.addVents(world.props.vents);
  buildPlayer();
  spawnEnemies();
  buildMinimapBg();
  camera.position.set(P.x, 0, P.z).add(CAM_OFF);
  renderer.compile(scene, camera);
  updateHud();
  ui.booted = true;
  started = true;
  if (!prog.avatar) openCreator();
  if (new URLSearchParams(location.search).has('debug')) window.__game = { P, enemies, remotes, get prog() { return prog; }, net, castMove, aimMove, game, skyClock, zoom: (k) => { camDist = k; }, camOff: CAM_OFF, player: () => player, step: (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) frame(dt, clock.elapsedTime += dt); } };
  loop();
}
let started = false;
// Monsters are built when the player first comes within WAKE of their camp, then kept.
let wakeTick = 0;
const WAKE = 95, enemyById = new Map(), campAwake = new Set();
function wakeCamps() {
  CAMPS.forEach((c, ci) => {
    if (campAwake.has(ci) || Math.abs(c.x - P.x) > WAKE || Math.abs(c.z - P.z) > WAKE) return;
    campAwake.add(ci);
    for (const e of ENEMY_LIST) if (e.camp === ci) { const en = new Enemy(e.id, e.type, c); enemies.push(en); enemyById.set(e.id, en); }
  });
}
const spawnEnemies = wakeCamps;
export const start = boot;
