import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  HALF, VILLAGE_R, RIVER_HW, BRIDGES, SPEED, riverX, inWater, inVillage, clamp, angDiff, CAMPS, ENEMIES, PATHS, distSeg, pathDist,
  VILLAGE_BUILDINGS, NPCS, NPC_RANGE, SAFE_R, CHECKPOINTS, isSafe, ARENA, STYLES, FINISHER, CRIT, SKILL_UNLOCK, SWORDS, GLOVES, ARMORS,
  POTIONS, POTION_CD, SHOPS, CATALOG, xpNeed, maxHpFor, defReduceFor, dmgFor, defaultProgress, ANIMS, NAME_RE, cleanName,
} from '../../../shared/rules.js';
import { api, ensureLogin, logout, connect } from './net.js';
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
  for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < c.r + 10) return c.zone;
  if (x > riverX(z)) return z < -18 ? 'Nghĩa Địa Xương' : 'Vùng Đất Phía Đông';
  if (x < -42) return 'Rừng Cáo';
  return 'Đồng Cỏ Xanh';
}
const isRocky = (x, z) => x > riverX(z) + 6 && z < -18;
function vnoise(x, z) { return Math.sin(x * 0.31 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.29 + Math.sin(x * 0.13) * 2); }
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
  const nn = vnoise(x, z) * 0.03; r += nn; g += nn * 1.2; b += nn * 0.5;
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
scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x5d6b3a, 1.5));
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
  const files = ['world', 'anims', 'knight', 'rogue', 'barbarian', 'mage', 'skeleton_minion', 'skeleton_warrior', 'fox'];
  let done = 0;
  await Promise.all(files.map(f => loader.loadAsync(`assets/${f}.glb`).then(g => { A[f] = g; ui.loading.progress = ++done / files.length; })));
  A.scenes = Object.fromEntries(A.world.scenes.map(s => [s.name, s]));
}

const obstacles = [];
const world = { npcs: [], checkpoints: [], arenas: new Map() };
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3a = new THREE.Vector3(), v3s = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
function inst(name, items, { shadow = true } = {}) {
  const src = A.scenes[name];
  if (!src || !items.length) return;
  src.updateMatrixWorld(true);
  src.traverse(o => {
    if (!o.isMesh) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, items.length);
    items.forEach((it, i) => { q4.setFromAxisAngle(yAxis, it.ry || 0); m4.compose(v3a.set(it.x, it.y || 0, it.z), q4, v3s.setScalar(it.s)).multiply(o.matrixWorld); im.setMatrixAt(i, m4); });
    im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
    scene.add(im);
  });
}

function buildGround() {
  const seg = 140;
  const g = new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const k = groundColor(x, z);
    c.setRGB(k[0], k[1], k[2], THREE.SRGBColorSpace);
    cols.set([c.r, c.g, c.b], i * 3);
    if (inWater(x, z) || Math.abs(x - riverX(z)) < RIVER_HW - 0.3) pos.setY(i, -0.6);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

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
};
function buildVillage() {
  inst('building_well_blue', [{ x: 0, z: 0, s: 4, ry: 0.3 }]);
  obstacles.push({ x: 0, z: 0, r: 1.5 });
  const props = [];
  for (const b of VILLAGE_BUILDINGS) {
    inst(b.name, [{ x: b.x, z: b.z, s: 4.4, ry: Math.atan2(-b.x, -b.z) }]);
    obstacles.push({ x: b.x, z: b.z, r: 2.4 });
    const side = b.a + 0.32;
    props.push({ n: pick(['barrel', 'crate_A_big', 'sack', 'crate_B_small']), x: Math.cos(side) * 10, z: Math.sin(side) * 10, s: 5.5, ry: rr(0, 6) });
  }
  const byName = {};
  for (const p of props) (byName[p.n] ||= []).push(p);
  for (const [nm, list] of Object.entries(byName)) inst(nm, list);
  for (const p of props) obstacles.push({ x: p.x, z: p.z, r: 0.6 });
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
    obstacles.push({ x: n.x, z: n.z, r: 0.6 });
    world.npcs.push({ ...n, rig, mk, look });
  }
}

function buildCheckpoints() {
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
    obstacles.push({ x: c.x, z: c.z, r: 1.1 });
    world.checkpoints.push({ ...c, crystal });
  }
  inst('flag_blue', flags);
}

function buildNature() {
  const items = {};
  const add = (nm, it, r) => { (items[nm] ||= []).push(it); if (r) obstacles.push({ x: it.x, z: it.z, r }); };
  const free = (x, z, pad) => {
    if (Math.hypot(x, z) < VILLAGE_R + 3) return false;
    if (pathDist(x, z) < 3.6) return false;
    if (Math.abs(x - riverX(z)) < RIVER_HW + 2.2) return false;
    for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < c.r * 0.9 + 2) return false;
    for (const c of CHECKPOINTS) if (Math.hypot(x - c.x, z - c.z) < SAFE_R + 1) return false;
    for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return false;
    return true;
  };
  let trees = 0;
  for (let t = 0; t < 12000 && trees < 420; t++) {
    const x = rr(-HALF + 2, HALF - 2), z = rr(-HALF + 2, HALF - 2);
    const forest = x < -40, east = x > riverX(z) + 6, rocky = isRocky(x, z);
    if (rand() > (forest ? 0.9 : rocky ? 0.12 : east ? 0.18 : 0.25)) continue;
    if (forest || rand() < 0.3) {
      const s = rr(3.2, 4.2);
      if (!free(x, z, 0.85 * s)) continue;
      add(pick(['trees_A_large', 'trees_A_medium', 'trees_B_large', 'trees_B_medium']), { x, z, s, ry: rr(0, 6) }, 0.8 * s);
    } else {
      const s = rr(3.6, 4.6);
      if (!free(x, z, 1.4)) continue;
      add(rocky ? 'tree_single_A' : pick(['tree_single_A', 'tree_single_B', 'tree_single_B']), { x, z, s, ry: rr(0, 6) }, 0.32 * s);
    }
    trees++;
  }
  let rocks = 0;
  for (let t = 0; t < 6000 && rocks < 160; t++) {
    const x = rr(-HALF + 2, HALF - 2), z = rr(-HALF + 2, HALF - 2);
    const rocky = isRocky(x, z);
    if (rand() > (rocky ? 0.8 : 0.05)) continue;
    const big = rocky && rand() < 0.25;
    const s = big ? rr(4.5, 6.5) : rr(6, rocky ? 12 : 9);
    if (!free(x, z, big ? 0.9 * s : 0.2 * s)) continue;
    if (big) add(pick(['mountain_A', 'mountain_B']), { x, z, s, ry: rr(0, 6) }, 0.8 * s);
    else add(pick(['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E']), { x, z, s, ry: rr(0, 6) }, 0.17 * s);
    rocks++;
  }
  for (let t = 0; t < 2500 && (items.hill_single_A?.length || 0) < 40; t++) {
    const x = rr(-HALF, HALF), z = rr(-HALF, HALF);
    if (isRocky(x, z) || !free(x, z, 1)) continue;
    add('hill_single_A', { x, z, s: rr(5, 8), ry: rr(0, 6), y: -0.05 });
  }
  for (let i = -HALF - 8; i <= HALF + 8; i += 11) for (const [x, z] of [[i, -HALF - 6], [i, HALF + 6], [-HALF - 6, i], [HALF + 6, i]])
    add(pick(['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees']), { x: x + rr(-2, 2), z: z + rr(-2, 2), s: rr(8, 11), ry: rr(0, 6) });
  for (const [nm, list] of Object.entries(items)) inst(nm, list);

  const tufts = [], flowers = [];
  for (let t = 0; t < 1800; t++) {
    const x = rr(-HALF, HALF), z = rr(-HALF, HALF);
    if (Math.abs(x - riverX(z)) < RIVER_HW + 1 || inVillage(x, z) || pathDist(x, z) < 2 || isRocky(x, z)) continue;
    (rand() < 0.2 ? flowers : tufts).push({ x, z, s: rr(0.7, 1.3), r: rr(0, 6) });
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

  const camp = (type, fn) => CAMPS.filter(c => c.type === type).forEach(fn);
  const tents = [], barrels = [], crates = [], racks = [], flags = [], lumber = [], fires = [];
  for (const t of ['rogue', 'barbarian']) camp(t, c => {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.5, x = c.x + Math.cos(a) * (c.r + 2), z = c.z + Math.sin(a) * (c.r + 2);
      tents.push({ x, z, s: 7, ry: Math.atan2(c.x - x, c.z - z) }); obstacles.push({ x, z, r: 1.9 });
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
    obstacles.push({ x: c.x, z: c.z, r: 0.9 });
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); scene.add(g);
    for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 5), mat(0x5a3a22), 0, 0.12, 0, g).rotation.set(Math.PI / 2, 0, i * 1.25);
    const f1 = mesh(new THREE.ConeGeometry(0.45, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0xffa23a }), 0, 0.6, 0, g);
    const f2 = mesh(new THREE.ConeGeometry(0.25, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xfff08a }), 0, 0.5, 0, g);
    f1.castShadow = f2.castShadow = false;
    return { f1, f2 };
  });
  const stones = [], ruins = [];
  camp('minion', c => ruins.push({ x: c.x - c.r - 3, z: c.z + 3, s: 5.5, ry: 0.6 }));
  camp('warrior', c => ruins.push({ x: c.x + c.r + 2, z: c.z - 4, s: 5.5, ry: 2.2 }));
  for (const r of ruins) obstacles.push({ x: r.x, z: r.z, r: 3 });
  inst('building_destroyed', ruins);
  for (const t of ['minion', 'warrior']) camp(t, c => {
    for (let i = 0; i < 10; i++) {
      const a = rr(0, 6.28), d = rr(c.r * 0.9, c.r + 6), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue;
      stones.push({ x, z, ry: rr(-0.3, 0.3) }); obstacles.push({ x, z, r: 0.5 });
    }
  });
  const sg = new THREE.BoxGeometry(0.8, 1.1, 0.25); sg.translate(0, 0.55, 0);
  const sm = new THREE.InstancedMesh(sg, mat(0x9a9aa2), stones.length); sm.castShadow = true;
  stones.forEach((s, i) => { dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.ry, rr(-0.12, 0.12)); dummy.scale.setScalar(1); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); });
  scene.add(sm);
  camp('boss', c => {
    for (let i = 0; i < 9; i++) {
      if (i === 6) continue;
      const a = (i / 9) * Math.PI * 2, x = c.x + Math.cos(a) * (c.r + 3), z = c.z + Math.sin(a) * (c.r + 3);
      mesh(new THREE.CylinderGeometry(0.7, 0.85, 5, 8), mat(0x7a7682), x, 2.5, z);
      mesh(new THREE.OctahedronGeometry(0.55), mat(0xb36bff, { emissive: 0x6a22cc, roughness: 0.3 }), x, 5.7, z);
      obstacles.push({ x, z, r: 1 });
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
  constructor(src, clips, scale, { hide = [], tint, emissive } = {}) {
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
    for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
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
};
const ONCE_ANIMS = new Set([...STYLE_UI.melee.anims, ...STYLE_UI.sword.anims, '2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop', 'Hit_A', 'Death_A']);
const ENEMY_LOOK = {
  rogue: { model: 'rogue', scale: 0.85, atk: '1H_Melee_Attack_Chop', idle: 'Idle' },
  barbarian: { model: 'barbarian', scale: 0.95, atk: '2H_Melee_Attack_Chop', idle: 'Idle', show: ['2H_Axe'] },
  minion: { model: 'skeleton_minion', scale: 0.85, atk: 'Unarmed_Melee_Attack_Punch_A', idle: 'Unarmed_Idle' },
  warrior: { model: 'skeleton_warrior', scale: 0.95, atk: '1H_Melee_Attack_Chop', idle: 'Idle' },
  boss: { model: 'skeleton_warrior', scale: 2.1, atk: '2H_Melee_Attack_Chop', idle: 'Idle', emissive: 0x2a0a40 },
};
const MASTERY_INFO = { melee: ['Võ Thuật', 'sports_mma'], sword: ['Kiếm Thuật', 'swords'], defense: ['Phòng Thủ', 'shield'] };

let prog = defaultProgress();
let me = { id: 0, name: '', rating: 1000, wins: 0, losses: 0 };
let net = { send() { } };
let hudDirty = true;

const P = { x: 0, z: 6, rot: Math.PI, hp: 100, mhp: 100, atkCd: 0, combo: 0, comboT: 0, actT: 0, skillCd: { melee: 0, sword: 0 }, potCd: 0, dash: null, dead: false, deadT: 0,
  shake: 0, r: 0.45, flash: 0, pending: [], kx: 0, kz: 0, arena: null, cpSent: 0 };
let player;

function applyLook(rig, style, sw, gl, ar) {
  const s = SWORDS[sw] || SWORDS[0], g = GLOVES[gl] || GLOVES[0], a = ARMORS[ar] || ARMORS[0];
  rig.sword.visible = style === 'sword';
  rig.sword.material.color.setHex(s.color); rig.sword.material.emissive.setHex(s.emissive || 0);
  rig.sword.material.userData.baseEmissive = rig.sword.material.emissive.clone();
  for (const x of rig.gloves) { x.visible = style === 'melee' && gl > 0; x.material = mat(g.color, { emissive: g.emissive || 0, roughness: 0.5, metalness: gl === 2 ? 0.6 : 0 }); }
  for (const nm of ['Knight_Body', 'Knight_Helmet', 'Knight_ArmLeft', 'Knight_ArmRight']) {
    const o = rig.nodes[nm]; if (!o) continue;
    o.material.color.copy(o.material.userData.baseColor).multiply(new THREE.Color(a.color));
  }
}
function makeKnight(cape) {
  const rig = new Rig(A.knight, A.anims.animations, 0.85, { hide: HUMAN_HIDE.knight });
  rig.sword = rig.nodes['1H_Sword'];
  const gg = new THREE.IcosahedronGeometry(0.2, 0);
  rig.gloves = ['handslot.l', 'handslot.r'].map(b => { const g = new THREE.Mesh(gg, mat(0xffffff)); g.castShadow = true; rig.attach(b, g); return g; });
  if (cape != null && rig.nodes.Knight_Cape) rig.nodes.Knight_Cape.material.color.setHSL(cape, 0.55, 0.45);
  return rig;
}
function buildPlayer() {
  player = makeKnight(null);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; player.root.add(ring);
  scene.add(player.root);
  applyGear();
  player.play(prog.style === 'sword' ? 'Idle' : 'Unarmed_Idle');
}
const applyGear = () => applyLook(player, prog.style, prog.gear.sword, prog.gear.glove, prog.gear.armor);

const remotes = new Map();
class Remote {
  constructor(id, name) {
    this.id = id; this.name = name || '';
    this.rig = makeKnight(((id * 0.61803) % 1));
    this.x = this.tx = 0; this.z = this.tz = 0; this.r = this.tr = 0; this.hp = 100; this.a = -1; this.look = ''; this.seen = 0; this.fresh = true;
    scene.add(this.rig.root);
  }
  apply(e, now) {
    const [, x, z, r, a, s, sw, gl, ar, hp, name] = e;
    if (name) this.name = name;
    this.tx = x; this.tz = z; this.tr = r; this.hp = hp; this.seen = now;
    if (this.fresh || Math.hypot(x - this.x, z - this.z) > 15) { this.x = x; this.z = z; this.r = r; this.fresh = false; }
    const look = `${s}${sw}${gl}${ar}`;
    if (look !== this.look) { this.look = look; applyLook(this.rig, s ? 'sword' : 'melee', sw, gl, ar); }
    if (a !== this.a) { this.a = a; const nm = ANIMS[a] || 'Idle'; this.rig.play(nm, { once: ONCE_ANIMS.has(nm), fade: 0.1, dur: ONCE_ANIMS.has(nm) && nm !== 'Death_A' ? 0.5 : undefined }); }
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * 12);
    this.x = lerp(this.x, this.tx, k); this.z = lerp(this.z, this.tz, k); this.r = lerpAngle(this.r, this.tr, k);
    this.rig.root.position.set(this.x, 0, this.z); this.rig.root.rotation.y = this.r;
    this.rig.mixer.update(dt);
    this.flashT = (this.flashT || 0) - dt; this.rig.flash(this.flashT > 0 ? this.flashT * 5 : 0);
  }
  dispose() { scene.remove(this.rig.root); }
}

function buildSlime() {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const hue = rr(0.27, 0.36);
  const jelly = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.65, 0.55), roughness: 0.25, transparent: true, opacity: 0.9, emissive: new THREE.Color().setHSL(hue, 0.7, 0.12) });
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
    if (type === 'slime') this.m = buildSlime();
    else if (type === 'fox') { this.rig = new Rig(A.fox, A.fox.animations, Enemy.foxScale); this.m = { root: this.rig.root, height: 1.4 }; }
    else {
      const L = this.look = ENEMY_LOOK[type];
      this.rig = new Rig(A[L.model], A.anims.animations, L.scale, { hide: HUMAN_HIDE[L.model] || [], emissive: L.emissive });
      for (const s of L.show || []) if (this.rig.nodes[s]) this.rig.nodes[s].visible = true;
      if (type === 'warrior') { this.rig.attach('handslot.r', A.knight.scene.getObjectByName('1H_Sword').clone()); this.rig.attach('handslot.l', A.knight.scene.getObjectByName('Round_Shield').clone()); }
      if (type === 'boss') this.rig.attach('handslot.r', A.barbarian.scene.getObjectByName('2H_Axe').clone());
      this.m = { root: this.rig.root, height: 2.45 * L.scale };
    }
    scene.add(this.m.root);
    const tel = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.3, depthWrite: false }));
    tel.rotation.x = -Math.PI / 2; tel.position.y = 0.06; tel.visible = false; scene.add(tel); this.tel = tel;
    this.reset();
  }
  flash(k, c) { if (this.rig) this.rig.flash(k, c); else this.m.flash(k, c); }
  idleAnim() { return this.type === 'fox' ? 'Survey' : this.look.idle; }
  reset() {
    this.x = this.hx; this.z = this.hz; this.hp = this.t.hp; this.dead = false; this.aggro = false; this.returning = false;
    this.cd = 0; this.windup = 0; this.kx = 0; this.kz = 0; this.rot = rand() * 6; this.wT = rand() * 3; this.wx = this.x; this.wz = this.z;
    this.hitT = 0; this.showBar = 0; this.deadT = 0; this.stagger = 0;
    const r = this.m.root; r.visible = true; r.scale.setScalar(1); r.rotation.set(0, this.rot, 0); r.position.y = 0;
    if (this.rig) this.rig.play(this.idleAnim(), { fade: 0 });
    this.flash(0);
  }
  damage(dmg, kx, kz, crit, skillHit) {
    if (this.dead) return;
    net.send({ t: 'he', e: this.id, k: skillHit ? 's' : undefined });
    this.hp -= dmg; this.aggro = true; this.returning = false; this.hitT = 0.12; this.showBar = 4;
    const heavy = this.t.boss ? 0.15 : 1;
    this.kx += kx * heavy; this.kz += kz * heavy;
    floatText(this.x, this.m.height + 0.3, this.z, Math.round(dmg), crit ? '#ffcf3a' : '#ffffff', crit ? 22 : 17);
    spawnBurst(this.x, this.m.height * 0.5, this.z, this.type === 'slime' ? 0x8dff7a : ['minion', 'warrior', 'boss'].includes(this.type) ? 0xe8e2d0 : 0xff6a5a, 5, 3);
    if (this.rig && this.windup <= 0 && !this.t.boss && this.type !== 'fox') { this.rig.play('Hit_A', { once: true, dur: 0.35, fade: 0.05 }); this.stagger = 0.3; }
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true; this.deadT = 0; this.respawn = this.t.respawn; this.tel.visible = false; this.windup = 0;
    net.send({ t: 'ke', e: this.id });
    spawnBurst(this.x, 0.8, this.z, 0xffffff, 12, 6);
    if (this.rig && this.type !== 'fox') this.rig.play('Death_A', { once: true, fade: 0.08 });
    this.flash(0);
  }
  update(dt, time) {
    const r = this.m.root;
    if (this.dead) {
      this.deadT += dt;
      if (this.rig && this.type !== 'fox') { this.rig.mixer.update(dt); if (this.deadT > 1.3) r.position.y = -(this.deadT - 1.3) * 1.5; if (this.deadT > 2.2) r.visible = false; }
      else if (this.type === 'fox') { r.rotation.z = Math.min(this.deadT * 6, Math.PI / 2); if (this.deadT > 1) r.position.y = -(this.deadT - 1) * 1.5; if (this.deadT > 1.8) r.visible = false; this.rig.mixer.update(dt * 0.3); }
      else { r.scale.setScalar(Math.max(0, 1 - this.deadT / 0.35)); if (this.deadT > 0.35) r.visible = false; }
      this.respawn -= dt; if (this.respawn <= 0) this.reset();
      return;
    }
    const dx = P.x - this.x, dz = P.z - this.z, d = Math.hypot(dx, dz);
    const homeD = Math.hypot(this.x - this.hx, this.z - this.hz);
    const safe = P.dead || P.arena || isSafe(P.x, P.z);
    if (!this.aggro && !this.t.passive && !safe && d < (this.t.boss ? 13 : 7.5)) this.aggro = true;
    if (this.aggro && (safe || homeD > (this.t.boss ? 22 : 26) || d > 22)) { this.aggro = false; this.returning = true; this.windup = 0; this.tel.visible = false; }
    let mvx = 0, mvz = 0, sp = this.t.speed;
    this.cd -= dt; this.stagger -= dt;
    if (this.windup > 0) {
      this.windup -= dt;
      const k = 1 - this.windup / this.t.windup;
      this.tel.scale.setScalar(this.t.range * 1.15 * (0.3 + 0.7 * k)); this.tel.material.opacity = 0.15 + 0.25 * k;
      if (this.type === 'fox' && k > 0.6) { mvx = dx / (d || 1); mvz = dz / (d || 1); sp = 9; }
      if (this.windup <= 0) {
        this.tel.visible = false; this.cd = this.t.atkCd;
        if (!P.dead && !safe && Math.hypot(P.x - this.tx, P.z - this.tz) < this.t.range * 1.15 + P.r) enemyHitsMe(this);
        if (this.t.boss || this.type === 'barbarian') { spawnRing(this.tx, this.tz, this.t.range * 1.15, 0xd9c3a0, 0.35); P.shake = Math.max(P.shake, this.t.boss ? 0.5 : 0.15); }
      }
    } else if (this.stagger > 0) {
      mvx = 0;
    } else if (this.aggro) {
      this.rot = Math.atan2(dx, dz);
      if (d > this.t.range * 0.85) { mvx = dx / d; mvz = dz / d; }
      else if (this.cd <= 0) {
        this.windup = this.t.windup; this.tel.visible = true;
        this.tx = this.x + (dx / d) * this.t.range * 0.45; this.tz = this.z + (dz / d) * this.t.range * 0.45;
        this.tel.position.set(this.tx, 0.06, this.tz);
        if (this.rig && this.type !== 'fox') this.rig.play(this.look.atk, { once: true, dur: this.t.windup / 0.55, fade: 0.08 });
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
      if (this.type === 'fox') this.rig.play(moving ? (sp > 3 ? 'Run' : 'Walk') : 'Survey', { fade: 0.2, speed: sp > 6 ? 1.6 : 1 });
      else if (this.windup <= 0 && this.stagger <= 0 && this.cd < this.t.atkCd - 0.35) this.rig.play(moving ? (sp > 2.5 ? 'Running_A' : 'Walking_A') : this.look.idle, { fade: 0.2 });
      this.rig.mixer.update(dt);
    } else {
      const b = Math.abs(Math.sin(time * 4 + this.hx));
      this.m.body.position.y = moving ? b * 0.35 : b * 0.06;
      this.m.body.scale.set(1 + (1 - b) * 0.12, 1 - (1 - b) * 0.14, 1 + (1 - b) * 0.12);
      if (this.windup > 0) { const k = 1 - this.windup / this.t.windup; this.m.body.scale.set(1 + k * 0.25, 1 - k * 0.3, 1 + k * 0.25); }
    }
    this.hitT -= dt;
    this.flash(this.hitT > 0 ? this.hitT * 6 : this.windup > 0 ? 0.25 + 0.25 * Math.sin(time * 30) : 0, this.windup > 0 && this.hitT <= 0 ? 0xff2a1a : 0xffffff);
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
  for (const o of obstacles) {
    const ox = e.x - o.x, oz = e.z - o.z, min = o.r + r;
    if (Math.abs(ox) > min || Math.abs(oz) > min) continue;
    const d = Math.hypot(ox, oz);
    if (d < min && d > 0.0001) { const nx = e.x + (ox / d) * (min - d), nz = e.z + (oz / d) * (min - d); if (!blocked(nx, nz)) { e.x = nx; e.z = nz; } }
  }
}

function rollDmg(style, mult) {
  const crit = Math.random() < CRIT.chance;
  return { dmg: dmgFor(prog, style, mult) * fx(0.9, 1.1) * (crit ? CRIT.mult : 1), crit };
}
function nearestTarget(range) {
  let best = null, bd = range;
  for (const e of enemies) { if (e.dead || !e.m.root.visible) continue; const d = Math.hypot(e.x - P.x, e.z - P.z) - e.t.r; if (d < bd) { bd = d; best = e; } }
  for (const r of remotes.values()) { if (!canHitRemote(r)) continue; const d = Math.hypot(r.x - P.x, r.z - P.z) - 0.4; if (d < bd) { bd = d; best = r; } }
  return best;
}
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
  if (P.dead || P.atkCd > 0 || P.dash || P.actT > 0.25 || arenaFrozen()) return;
  const style = prog.style, st = STYLES[style];
  const tgt = nearestTarget(st.range + 2.5);
  if (tgt) P.rot = Math.atan2(tgt.x - P.x, tgt.z - P.z);
  P.combo = P.comboT > 0 ? (P.combo + 1) % 3 : 0; P.comboT = 0.9;
  const finisher = P.combo === 2;
  P.atkCd = st.cd * (finisher ? 1.35 : 1);
  P.actT = P.atkCd * 1.15;
  player.play(STYLE_UI[style].anims[P.combo], { once: true, dur: P.atkCd * 1.6, fade: 0.06 });
  net.send({ t: 'sw' });
  P.pending.push({ t: st.cd * 0.35, fn: () => strike(style, finisher) });
}
function strike(style, finisher) {
  const st = STYLES[style];
  const fx0 = Math.sin(P.rot), fz0 = Math.cos(P.rot);
  const inArc = (dx, dz, d, r) => d - r <= st.range && (d <= 1 || Math.acos(clamp((dx * fx0 + dz * fz0) / d, -1, 1)) <= st.arc / 2 + 0.25);
  let hits = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
    if (!inArc(dx, dz, d, e.t.r)) continue;
    const { dmg, crit } = rollDmg(style, finisher ? FINISHER : 1);
    const kb = finisher ? 9 : 3;
    e.damage(dmg, (dx / d) * kb, (dz / d) * kb, crit, false);
    hits++;
  }
  hitRemotes((r, dx, dz, d) => inArc(dx, dz, d, 0.4), finisher ? 'f' : undefined, finisher ? 6 : 2);
  if (style === 'sword') spawnSlash(P.x, P.z, P.rot, st.range, finisher ? 0xffffff : SWORDS[prog.gear.sword].emissive ? SWORDS[prog.gear.sword].color : 0xdff0ff, P.combo);
  else spawnBurst(P.x + fx0 * 1.1, 1.2, P.z + fz0 * 1.1, hits ? (GLOVES[prog.gear.glove].emissive ? 0xff8a3a : 0xffd27a) : 0xffffff, hits ? 7 : 3, 3);
  if (hits) P.shake = Math.max(P.shake, finisher ? 0.18 : 0.07);
}
function skill() {
  const key = prog.style, st = STYLES[key];
  if (P.dead || P.dash || P.skillCd[key] > 0 || arenaFrozen()) return;
  if (prog.mastery[key].lv < SKILL_UNLOCK) return;
  P.skillCd[key] = st.skillCd;
  net.send({ t: 'sk' });
  if (key === 'melee') {
    P.actT = 0.6; P.atkCd = 0.6;
    player.play('2H_Melee_Attack_Chop', { once: true, dur: 0.6, fade: 0.05 });
    P.pending.push({ t: 0.3, fn: () => {
      const R = st.skillRange;
      spawnRing(P.x, P.z, R, 0xffb34d, 0.45); spawnBurst(P.x, 0.4, P.z, 0xd9b37a, 20, 7);
      for (const e of enemies) {
        if (e.dead) continue; const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
        if (d - e.t.r > R) continue;
        const { dmg, crit } = rollDmg('melee', st.skillMult);
        e.damage(dmg, (dx / d) * 14, (dz / d) * 14, crit, true);
      }
      hitRemotes((r, dx, dz, d) => d - 0.4 <= R, 's', 10);
      P.shake = 0.35;
    } });
  } else {
    const tgt = nearestTarget(9); if (tgt) P.rot = Math.atan2(tgt.x - P.x, tgt.z - P.z);
    P.dash = { t: 0, dur: 0.3, sx: P.x, sz: P.z, dist: 8, hit: new Set() };
    P.actT = 0.45;
    player.play('2H_Melee_Attack_Spin', { once: true, dur: 0.45, fade: 0.05 });
  }
}
function updateDash(dt) {
  const D = P.dash; D.t += dt;
  const fx0 = Math.sin(P.rot), fz0 = Math.cos(P.rot);
  moveEntity(P, fx0 * (D.dist / D.dur) * dt, fz0 * (D.dist / D.dur) * dt, P.r);
  spawnBurst(P.x, 1, P.z, 0xcfe8ff, 2, 1.5);
  for (const e of enemies) {
    if (e.dead || D.hit.has(e)) continue;
    if (distSeg(e.x, e.z, D.sx, D.sz, P.x, P.z) < 1.6 + e.t.r) { D.hit.add(e); const { dmg, crit } = rollDmg('sword', STYLES.sword.skillMult); e.damage(dmg, fx0 * 6, fz0 * 6, crit, true); }
  }
  for (const r of remotes.values()) {
    if (D.hit.has(r) || !canHitRemote(r)) continue;
    if (distSeg(r.x, r.z, D.sx, D.sz, P.x, P.z) < 2) { D.hit.add(r); net.send({ t: 'hp', id: r.id, k: 's', kx: fx0 * 6, kz: fz0 * 6 }); }
  }
  if (D.t >= D.dur) { spawnSlash(P.x, P.z, P.rot, 3.4, 0xffffff, 0); P.dash = null; if (D.hit.size) P.shake = 0.25; }
}
function enemyHitsMe(e) {
  net.send({ t: 'ue', e: e.id });
  floatText(P.x, 2.6, P.z, Math.round(e.t.dmg * (1 - defReduceFor(prog))), '#ff6a5a', 18);
  P.shake = Math.max(P.shake, 0.12); P.flash = 0.2; hurtFlash = 0.25;
}
function usePotion() {
  if (P.dead || P.arena || P.potCd > 0) return;
  if (!POTIONS.some(p => prog.potions[p.id] > 0)) return;
  P.potCd = POTION_CD;
  const want = P.hp / P.mhp < 0.4 && prog.potions.big > 0 ? 'big' : prog.potions.small > 0 ? 'small' : 'big';
  net.send({ t: 'pot', id: want });
  spawnBurst(P.x, 1.4, P.z, 0xff7a8a, 12, 3);
  spawnRing(P.x, P.z, 1.6, 0xff7a8a, 0.4);
}
const arenaFrozen = () => P.arena && P.arena.state !== 'fight';

const effects = [];
const partGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const partPool = [];
let partIdx = 0;
function initParticles() { for (let i = 0; i < 100; i++) { const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); m.visible = false; scene.add(m); partPool.push({ m, life: 0 }); } }
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
  const myLv = Math.max(prog.mastery.melee.lv, prog.mastery.sword.lv);
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
const mmBg = document.createElement('canvas'); mmBg.width = mmBg.height = 240;
function buildMinimapBg() {
  const c = mmBg.getContext('2d'); const img = c.createImageData(240, 240);
  for (let j = 0; j < 240; j++) for (let i = 0; i < 240; i++) {
    const x = i - 120, z = j - 120; const col = inWater(x, z) ? [0.3, 0.68, 0.9] : groundColor(x, z);
    const k = (j * 240 + i) * 4; img.data[k] = col[0] * 255; img.data[k + 1] = col[1] * 255; img.data[k + 2] = col[2] * 255; img.data[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  c.fillStyle = 'rgba(40,60,30,.55)';
  for (const o of obstacles) if (o.r > 1.5) { c.beginPath(); c.arc(o.x + 120, o.z + 120, o.r * 0.8, 0, 6.29); c.fill(); }
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
  mctx.beginPath(); mctx.arc(S / 2, S / 2, S / 2, 0, 6.29); mctx.clip();
  if (P.arena) {
    mctx.fillStyle = '#3d4636'; mctx.fillRect(0, 0, S, S);
    const c = P.arena.center; dot(mctx, (c.x - P.x) * sc + S / 2, (c.z - P.z) * sc + S / 2, ARENA.r * sc, '#b9ab92');
  } else mctx.drawImage(mmBg, (P.x + 120) - view / 2, (P.z + 120) - view / 2, view, view, 0, 0, S, S);
  const at = (x, z) => [(x - P.x) * sc + S / 2, (z - P.z) * sc + S / 2];
  for (const e of enemies) { if (e.dead) continue; const [x, y] = at(e.x, e.z); if (x < 0 || y < 0 || x > S || y > S) continue; dot(mctx, x, y, e.t.boss ? 8 : 3.5, e.t.boss ? '#c77bff' : e.aggro ? '#ff4b3e' : '#ffae4a'); }
  for (const n of world.npcs) { const [x, y] = at(n.x, n.z); dot(mctx, x, y, 5, '#' + n.look.color.toString(16).padStart(6, '0')); }
  for (const c of CHECKPOINTS) { const [x, y] = at(c.x, c.z); dot(mctx, x, y, 5, prog.checkpoints.includes(c.id) ? '#7ff0ff' : '#9aa0a8'); }
  for (const r of remotes.values()) { const [x, y] = at(r.x, r.z); dot(mctx, x, y, 4, '#7fb8ff'); }
  arrow(mctx, S / 2, S / 2, P.rot, 10);
  mctx.restore();
}
function drawBigMap(bm) {
  const bctx = bm.getContext('2d');
  const S = bm.width, sc = S / 240;
  bctx.clearRect(0, 0, S, S);
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(mmBg, 0, 0, S, S);
  const at = (x, z) => [(x + 120) * sc, (z + 120) * sc];
  bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
  for (const c of CAMPS) {
    const [x, y] = at(c.x, c.z); const t = ENEMIES[c.type];
    const diff = t.lv - Math.max(prog.mastery.melee.lv, prog.mastery.sword.lv);
    bctx.fillStyle = t.boss ? 'rgba(199,123,255,.35)' : diff > 10 ? 'rgba(255,75,62,.3)' : diff > 3 ? 'rgba(255,174,74,.3)' : 'rgba(255,255,255,.22)';
    bctx.beginPath(); bctx.arc(x, y, (c.r + 4) * sc, 0, 6.29); bctx.fill();
    bctx.font = `800 ${Math.round(S / 45)}px ${FONT}`; bctx.fillStyle = '#fff'; bctx.strokeStyle = 'rgba(0,0,0,.6)'; bctx.lineWidth = 3;
    bctx.strokeText(t.lv, x, y); bctx.fillText(t.lv, x, y);
  }
  bctx.font = `${Math.round(S / 34)}px "Material Symbols Rounded"`;
  for (const n of world.npcs) { const [x, y] = at(n.x, n.z); dot(bctx, x, y, S / 70, 'rgba(0,0,0,.55)'); bctx.fillStyle = '#' + n.look.color.toString(16).padStart(6, '0'); bctx.fillText(n.look.icon, x, y); }
  for (const c of CHECKPOINTS) { const [x, y] = at(c.x, c.z); const on = prog.checkpoints.includes(c.id); dot(bctx, x, y, S / 70, 'rgba(0,0,0,.55)'); bctx.fillStyle = c.id === prog.checkpoint ? '#7dff9a' : on ? '#7ff0ff' : '#9aa0a8'; bctx.fillText('flag', x, y); }
  for (const r of remotes.values()) { const [x, y] = at(r.x, r.z); dot(bctx, x, y, S / 110, '#7fb8ff'); }
  if (!P.arena) { const [x, y] = at(P.x, P.z); arrow(bctx, x, y, P.rot, S / 50); }
}

function updateHud() {
  const m = prog.mastery[prog.style];
  const pots = POTIONS.reduce((s, p) => s + prog.potions[p.id], 0);
  Object.assign(ui.hud, {
    hp: Math.ceil(P.hp), mhp: P.mhp, xp: m.xp / xpNeed(m.lv),
    atkIcon: STYLE_UI[prog.style].icon, skillIcon: STYLE_UI[prog.style].skillIcon, skillLocked: m.lv < SKILL_UNLOCK,
    potions: pots, potHidden: !pots || !!P.arena,
  });
  ui.prog = structuredClone(prog);
  hudDirty = false;
}
function updateCooldowns() {
  const cd = P.skillCd[prog.style];
  ui.hud.skillCd = cd > 0 ? Math.ceil(cd) : 0;
  // Rounded to 1/50 so Vue re-renders the cooldown ring a few times a second, not every frame.
  ui.hud.skillCdK = cd > 0 ? Math.round((cd / STYLES[prog.style].skillCd) * 50) / 50 : 0;
  ui.hud.potCdK = P.potCd > 0 ? Math.round((P.potCd / POTION_CD) * 50) / 50 : 0;
  ui.hud.safe = !P.arena && isSafe(P.x, P.z);
}
let curZone = '';
function checkZone() {
  const z = zoneAt(P.x, P.z);
  if (z !== curZone) { curZone = z; showZone(z); }
}
function swapStyle() {
  if (P.dash || P.dead) return;
  prog.style = prog.style === 'melee' ? 'sword' : 'melee'; P.combo = 0; P.comboT = 0;
  net.send({ t: 'style', s: prog.style });
  applyGear(); hudDirty = true;
}
const syncMe = () => Object.assign(ui.me, me);
function openShop(role) { ui.shop.role = role; ui.shop.tab = SHOPS[role][0]; openModal('shop'); }
async function openArena() {
  openModal('arena');
  try { const r = await api('/api/me'); Object.assign(me, r.user); syncMe(); } catch { }
}
let queued = false, queuedAt = 0;
const setQueued = (on) => { queued = on; queuedAt = performance.now(); ui.queue.on = on; ui.queue.time = '0:00'; };
let atkHeld = false;
function interact() {
  if (!nearNpc) return;
  if (nearNpc.role === 'arena') openArena(); else openShop(nearNpc.role);
}
const keys = {};
const typing = () => document.activeElement?.tagName === 'INPUT';
addEventListener('keydown', (e) => {
  if (typing()) return;
  keys[e.code] = true;
  if (e.code === 'KeyJ' || e.code === 'Space') atkHeld = true;
  if (e.code === 'KeyK') skill();
  if (e.code === 'KeyQ') swapStyle();
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyR') usePotion();
  if (e.code === 'KeyM') openModal('map');
  if (e.code === 'KeyC') openModal('stats');
  if (e.code === 'Escape') closeModal();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyJ' || e.code === 'Space') atkHeld = false; });
['gesturestart', 'gesturechange', 'dblclick'].forEach(ev => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
addEventListener('contextmenu', (e) => e.preventDefault());

// Commands the Vue UI calls.
Object.assign(game, {
  attack: (down) => { atkHeld = down; if (down) attack(); },
  skill: () => skill(),
  swap: () => swapStyle(),
  potion: () => usePotion(),
  interact: () => interact(),
  buy: (cat, i) => net.send({ t: 'buy', cat, i }),
  equip: (cat, i) => { prog.gear[cat] = i; net.send({ t: 'eq', cat, i }); applyGear(); hudDirty = true; },
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
        if (!r) { r = new Remote(e[0], typeof e[10] === 'string' ? e[10] : ''); remotes.set(e[0], r); }
        r.apply(e, now);
      }
      for (const [id, r] of remotes) if (now - r.seen > 1500) { r.dispose(); remotes.delete(id); }
      if (m.prog) onProg(m.prog);
      break;
    }
    case 'pos': {
      P.x = m.x; P.z = m.z; P.kx = P.kz = 0; P.dash = null;
      if (P.arena && m.z < 250) leaveArena();
      if (P.dead) { P.dead = false; P.actT = 0; ui.dead = false; player.play(prog.style === 'sword' ? 'Idle' : 'Unarmed_Idle', { fade: 0 }); }
      camera.position.set(P.x, 0, P.z).add(CAM_OFF);
      break;
    }
    case 'loot': { const e = enemies[m.e]; if (e) floatText(e.x, e.m.height + 0.9, e.z, `+${m.g}`, '#ffd36b', 15); break; }
    case 'dead': die(m.by); break;
    case 'kill': toast(`Hạ gục ${m.name}`); break;
    case 'pvp': {
      const toMe = m.to === me.id;
      const target = toMe ? null : remotes.get(m.to);
      const x = toMe ? P.x : target?.x, z = toMe ? P.z : target?.z;
      if (x == null) break;
      floatText(x, 2.6, z, m.dmg, toMe ? '#ff6a5a' : m.crit ? '#ffcf3a' : '#ffffff', m.crit ? 22 : 18);
      spawnBurst(x, 1.2, z, 0xff6a5a, 6, 3);
      if (toMe) { P.kx += m.kx; P.kz += m.kz; P.flash = 0.2; hurtFlash = 0.25; P.shake = Math.max(P.shake, 0.15); }
      else if (target) target.flashT = 0.15;
      break;
    }
    case 'bought': { const it = CATALOG[m.cat][m.i]; toast(`Đã mua ${it.name}`); if (m.cat !== 'potion') applyGear(); break; }
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
    case 'welcome': {
      Object.assign(me, m.me); syncMe(); onProg(m.prog);
      if (P.arena) leaveArena();
      setQueued(false);
      P.dead = false; P.dash = null; P.pending.length = 0; ui.dead = false;
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
  for (const k of ['melee', 'sword', 'defense']) {
    if (p.mastery[k].lv > old.mastery[k].lv) {
      toast(`${MASTERY_INFO[k][0]} Lv ${p.mastery[k].lv}`);
      spawnRing(P.x, P.z, 2.2, 0xffe066, 0.5); spawnBurst(P.x, 1.2, P.z, 0xffe066, 14, 5);
      if (k !== 'defense' && p.mastery[k].lv >= SKILL_UNLOCK && old.mastery[k].lv < SKILL_UNLOCK) toast(STYLES[k].skill);
    }
  }
  if (p.checkpoint !== old.checkpoint && !old.checkpoints.includes(p.checkpoint)) toast(CHECKPOINTS.find(c => c.id === p.checkpoint).name);
  if (p.style !== old.style || JSON.stringify(p.gear) !== JSON.stringify(old.gear)) applyGear();
  hudDirty = true;
}
function die(by) {
  if (P.dead) return;
  P.dead = true; P.deadT = 0; P.pending.length = 0; P.dash = null;
  player.play('Death_A', { once: true, fade: 0.1 });
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
  const frozen = arenaFrozen();
  const moving = il > 0.12 && !P.dash && !frozen;
  const acting = P.actT > 0;
  if (P.dash) updateDash(dt);
  else if (moving) { moveEntity(P, ix * SPEED * (acting ? 0.45 : 1) * dt, iz * SPEED * (acting ? 0.45 : 1) * dt, P.r); if (!acting) P.rot = Math.atan2(ix, iz); }
  if (P.kx || P.kz) { const kd = Math.exp(-dt * 9); moveEntity(P, P.kx * dt, P.kz * dt, P.r); P.kx *= kd; P.kz *= kd; if (Math.abs(P.kx) + Math.abs(P.kz) < 0.05) P.kx = P.kz = 0; }
  for (const e of enemies) {
    if (e.dead || P.arena) continue; const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz), min = e.t.r + P.r;
    if (d < min && d > 0.001) moveEntity(P, dx / d * (min - d) * 0.6, dz / d * (min - d) * 0.6, P.r);
  }
  P.atkCd -= dt; P.comboT -= dt; P.actT -= dt; P.potCd -= dt;
  P.skillCd.melee = Math.max(0, P.skillCd.melee - dt); P.skillCd.sword = Math.max(0, P.skillCd.sword - dt);
  if (atkHeld) attack();
  if (P.actT <= 0) {
    if (moving) player.play('Running_A', { fade: 0.15, speed: clamp(il, 0.5, 1) * 1.1 });
    else player.play(prog.style === 'sword' ? 'Idle' : 'Unarmed_Idle', { fade: 0.2 });
  }
  r.position.set(P.x, 0, P.z);
  r.rotation.y = lerpAngle(r.rotation.y, P.rot, 1 - Math.exp(-dt * (acting ? 30 : 16)));
  P.flash -= dt; player.flash(P.flash > 0 ? P.flash * 4 : 0, 0xff3020);

  let nn = null;
  if (!P.arena) for (const n of world.npcs) if (Math.hypot(P.x - n.x, P.z - n.z) < NPC_RANGE) nn = n;
  if (nn !== nearNpc) {
    nearNpc = nn;
    ui.hud.actIcon = nn ? nn.look.icon : null;
    if (!nn) { closeModal('shop'); closeModal('arena'); }
  }
  if (!P.arena && time - P.cpSent > 1) for (const c of CHECKPOINTS) {
    if (Math.hypot(P.x - c.x, P.z - c.z) < 3.5 && (prog.checkpoint !== c.id)) { P.cpSent = time; net.send({ t: 'cp', id: c.id }); }
  }
}
const camGoal = new THREE.Vector3(), camOff = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt) {
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
  for (const n of world.npcs) { if (Math.abs(n.x - P.x) < 40 && Math.abs(n.z - P.z) < 40) n.rig.mixer.update(dt); n.mk.position.y = 2.75 + Math.sin(time * 2.5 + n.x) * 0.15; n.mk.rotation.y = time * 1.5; }
  for (const c of world.checkpoints) {
    const on = prog.checkpoints.includes(c.id), cur = prog.checkpoint === c.id;
    c.crystal.material.color.setHex(cur ? 0x7dff9a : on ? 0x7ff0ff : 0x9aa0a8);
    c.crystal.material.emissive.setHex(cur ? 0x1f8a3a : on ? 0x1a6a80 : 0x000000);
    c.crystal.position.y = 2.1 + Math.sin(time * 2 + c.x) * 0.12; c.crystal.rotation.y = time;
  }
  updateParticles(dt); updateEffects(dt); updateCamera(dt);
  world.water.material.color.setHSL(0.56, 0.75, 0.6 + Math.sin(time * 1.4) * 0.02);
  for (const f of world.fires) { const k = 1 + Math.sin(time * 18 + f.f1.id) * 0.12; f.f1.scale.set(k, 1 + Math.sin(time * 13) * 0.15, k); f.f2.scale.setScalar(1 + Math.sin(time * 21) * 0.15); }
  renderer.render(scene, camera);
  drawOverlay(dt);
  hudT -= dt; if (hudT <= 0 || hudDirty) { if (hudDirty) updateHud(); updateCooldowns(); hudT = 0.1; }
  mmT -= dt; if (mmT <= 0) { drawMinimap(); checkZone(); mmT = 0.1; if (queued) { const s = Math.floor((performance.now() - queuedAt) / 1000); ui.queue.time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }
  stT -= dt;
  if (stT <= 0) { stT = 0.1; net.send({ t: 'st', x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, r: Math.round(P.rot * 100) / 100, a: Math.max(0, ANIMS.indexOf(player.clip)) }); }
}
function loop() {
  frame(Math.min(clock.getDelta(), 0.05), clock.elapsedTime);
  requestAnimationFrame(loop);
}

async function boot() {
  resize();
  const assets = loadAssets();
  let user;
  try { user = await ensureLogin(); }
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
  buildNature();
  buildPlayer();
  spawnEnemies();
  buildMinimapBg();
  camera.position.set(P.x, 0, P.z).add(CAM_OFF);
  renderer.compile(scene, camera);
  updateHud();
  ui.booted = true;
  started = true;
  if (new URLSearchParams(location.search).has('debug')) window.__game = { P, enemies, remotes, get prog() { return prog; }, net, step: (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) frame(dt, clock.elapsedTime += dt); } };
  loop();
}
let started = false;
function spawnEnemies() { let id = 0; for (const c of CAMPS) for (let i = 0; i < c.n; i++) enemies.push(new Enemy(id++, c.type, c)); }
export const start = boot;
