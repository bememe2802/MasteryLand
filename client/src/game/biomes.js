import * as THREE from 'three';
import { LANDMARKS } from '../../../shared/rules.js';

/**
 * Scenery that gives each region its own character: landmarks (lakes, a pyramid, a volcano, an ice
 * castle, a giant tree...) and region props (cacti, ice crystals, dead trees, glowing mushrooms,
 * obsidian spikes, bushes...). Everything is built from simple shapes and drawn instanced, in
 * chunks so off-screen parts are culled. The engine passes in what this needs (ctx).
 */

/* ---- Ground under landmarks: sand round lakes, ash round the volcano, snow round the castle ---- */
const GROUND = {
  lake: [0.86, 0.8, 0.58], oasis: [0.94, 0.84, 0.56], pyramid: [0.92, 0.8, 0.54], farm: [0.62, 0.56, 0.3],
  frozenlake: [0.78, 0.9, 0.98], icecastle: [0.95, 0.97, 1], volcano: [0.22, 0.18, 0.18], lavalake: [0.2, 0.16, 0.15],
  boglake: [0.22, 0.28, 0.18], sakura: [0.62, 0.74, 0.4], stones: [0.6, 0.62, 0.5], mushring: [0.26, 0.3, 0.32], bigtree: [0.28, 0.36, 0.22],
};
/** Blend a landmark's ground color into [r, g, b] (by distance; edges fade out). */
export function landmarkGround(x, z, rgb) {
  for (const l of LANDMARKS) {
    const c = GROUND[l.kind]; if (!c) continue;
    const d = Math.hypot(x - l.x, z - l.z), R = l.r + (l.kind === 'volcano' ? 14 : 4);
    if (d > R) continue;
    const t = Math.min(1, (R - d) / (l.r * 0.4 + 3)) * (l.kind === 'farm' ? 0.55 : 0.85);
    rgb[0] += (c[0] - rgb[0]) * t; rgb[1] += (c[1] - rgb[1]) * t; rgb[2] += (c[2] - rgb[2]) * t;
  }
  return rgb;
}

/* ---- Instancing helper -------------------------------------------------------------------- */
const CHUNK = 64;
const d0 = new THREE.Object3D();
/** Draw geo with material at every item ({x, y, z, s | sx/sy/sz, ry, rx, rz, color}), chunked. */
function instance(scene, geo, material, items, { shadow = true, receive = true } = {}) {
  if (!items.length) return [];
  const chunks = new Map();
  for (const it of items) { const k = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`; (chunks.get(k) || chunks.set(k, []).get(k)).push(it); }
  const out = [];
  for (const list of chunks.values()) {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => {
      d0.position.set(it.x, it.y || 0, it.z);
      d0.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      d0.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
      d0.updateMatrix(); im.setMatrixAt(i, d0.matrix);
      if (it.color != null) im.setColorAt(i, new THREE.Color(it.color));
    });
    im.castShadow = shadow; im.receiveShadow = receive; im.computeBoundingSphere();
    scene.add(im); out.push(im);
  }
  return out;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const glow = (color, k = 0.8, o = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.35, ...o });
/** Merge simple parts into one geometry (positions, normals only), so a prop is one instanced mesh. */
function merge(parts) {
  const geos = parts.map(([g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx]) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    c.deleteAttribute('uv');
    c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    return c;
  });
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
/** A flat irregular blob (lakes, pools), radius 1 with a wobbly edge. */
function blobGeo(seed, wob = 0.12, seg = 40) {
  const s = new THREE.Shape();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, r = 1 + Math.sin(a * 3 + seed) * wob + Math.sin(a * 5 + seed * 2) * wob * 0.5;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2);
  return g;
}

/* ---- Shapes ----------------------------------------------------------------------------- */
const G = {};
function shapes() {
  if (G.cactus) return G;
  const cyl = (r1, r2, h, s = 8) => new THREE.CylinderGeometry(r1, r2, h, s);
  G.cactus = merge([[cyl(0.32, 0.36, 3.2), 0, 1.6], [new THREE.SphereGeometry(0.32, 8, 6), 0, 3.2],
    [cyl(0.2, 0.22, 1), 0.62, 1.5, 0, 0, 0, Math.PI / 2], [cyl(0.2, 0.2, 1.1), 1.02, 2.0], [new THREE.SphereGeometry(0.2, 6, 4), 1.02, 2.55],
    [cyl(0.18, 0.2, 0.8), -0.52, 2.1, 0, 0, 0, Math.PI / 2], [cyl(0.18, 0.18, 0.8), -0.86, 2.45], [new THREE.SphereGeometry(0.18, 6, 4), -0.86, 2.85]]);
  G.barrelCactus = merge([[new THREE.SphereGeometry(0.55, 10, 8), 0, 0.45, 0, 0, 0, 0, 1, 0.85, 1], [new THREE.ConeGeometry(0.15, 0.3, 5), 0, 0.98]]);
  G.bush = merge([[new THREE.IcosahedronGeometry(0.8, 1), 0, 0.55], [new THREE.IcosahedronGeometry(0.6, 1), 0.6, 0.4, 0.2], [new THREE.IcosahedronGeometry(0.55, 1), -0.5, 0.38, -0.25]]);
  G.dryBush = merge(Array.from({ length: 7 }, (_, i) => [cyl(0.03, 0.05, 1.1, 4), 0, 0.45, 0, Math.cos(i * 0.9) * 0.7, i * 0.9, Math.sin(i * 0.9) * 0.7]));
  G.ribs = merge(Array.from({ length: 5 }, (_, i) => [new THREE.TorusGeometry(0.9 - i * 0.08, 0.07, 5, 10, Math.PI), i * 0.45 - 0.9, 0, 0, 0, Math.PI / 2, 0]));
  G.skull = merge([[new THREE.SphereGeometry(0.45, 10, 8), 0, 0.4], [new THREE.BoxGeometry(0.5, 0.25, 0.4), 0, 0.15, 0.25]]);
  G.pillar = merge([[cyl(0.55, 0.65, 4.2, 8), 0, 2.1], [new THREE.BoxGeometry(1.5, 0.35, 1.5), 0, 4.35], [new THREE.BoxGeometry(1.5, 0.3, 1.5), 0, 0.15]]);
  G.dune = (() => { const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.22, 0.6); return g; })();
  G.crystal = merge([[new THREE.ConeGeometry(0.35, 2.4, 5), 0, 1.1], [new THREE.ConeGeometry(0.25, 1.6, 5), 0.4, 0.7, 0.1, 0, 0, -0.35], [new THREE.ConeGeometry(0.22, 1.3, 5), -0.35, 0.6, -0.15, 0.2, 0, 0.4]]);
  G.snowman = merge([[new THREE.SphereGeometry(0.75, 12, 10), 0, 0.7], [new THREE.SphereGeometry(0.55, 12, 10), 0, 1.75], [new THREE.SphereGeometry(0.4, 12, 10), 0, 2.55]]);
  G.carrot = (() => { const g = new THREE.ConeGeometry(0.08, 0.4, 6); g.rotateX(Math.PI / 2); g.translate(0, 2.58, 0.55); return g; })();
  G.igloo = merge([[new THREE.SphereGeometry(1.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)], [cyl(0.7, 0.7, 1.3, 10), 0, 0.5, 1.8, Math.PI / 2, 0, 0, 1, 1, 0.75]]);
  G.snowPile = (() => { const g = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.35, 0.8); return g; })();
  G.deadTree = merge([[cyl(0.18, 0.38, 4.2, 6), 0, 2.1, 0, 0.05, 0, 0.08], [cyl(0.07, 0.13, 2, 5), 0.6, 3.3, 0, 0, 0, -0.9], [cyl(0.06, 0.11, 1.7, 5), -0.55, 3.6, 0.2, 0.3, 0, 0.8],
    [cyl(0.05, 0.09, 1.4, 5), 0.1, 4.1, -0.5, -0.7, 0, 0], [cyl(0.04, 0.07, 1, 5), 1.2, 3.9, 0, 0, 0, -0.3]]);
  G.stump = merge([[cyl(0.45, 0.55, 0.6, 8), 0, 0.3], [cyl(0.1, 0.16, 0.6, 5), 0.5, 0.15, 0, 0, 0, -1.2]]);
  G.log = (() => { const g = cyl(0.3, 0.3, 2.6, 8); g.rotateZ(Math.PI / 2); g.translate(0, 0.3, 0); return g; })();
  G.mushStem = cyl(0.14, 0.2, 1.1, 8); G.mushStem.translate(0, 0.55, 0);
  G.mushCap = new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); G.mushCap.scale(1, 0.7, 1); G.mushCap.translate(0, 1.05, 0);
  G.reed = merge(Array.from({ length: 5 }, (_, i) => [cyl(0.025, 0.035, 1.6 + (i % 2) * 0.4, 4), Math.cos(i * 1.3) * 0.2, 0.8, Math.sin(i * 1.3) * 0.2, Math.cos(i) * 0.15, 0, Math.sin(i) * 0.15]));
  G.reedTop = merge(Array.from({ length: 5 }, (_, i) => [cyl(0.06, 0.06, 0.32, 6), Math.cos(i * 1.3) * 0.2 + Math.sin(i) * 0.22, 1.55 + (i % 2) * 0.4, Math.sin(i * 1.3) * 0.2 - Math.cos(i) * 0.22]));
  G.spike = merge([[new THREE.ConeGeometry(0.5, 3, 5), 0, 1.5], [new THREE.ConeGeometry(0.3, 1.8, 5), 0.55, 0.85, 0.2, 0, 0, -0.3], [new THREE.ConeGeometry(0.28, 1.5, 5), -0.5, 0.7, -0.2, 0.2, 0, 0.35]]);
  G.charred = merge([[cyl(0.16, 0.34, 3, 6), 0, 1.5, 0, 0, 0, 0.1], [cyl(0.06, 0.1, 1.2, 5), 0.4, 2.4, 0, 0, 0, -1]]);
  G.vent = merge([[cyl(0.5, 1.1, 0.7, 8), 0, 0.35], [cyl(0.35, 0.5, 0.2, 8), 0, 0.75]]);
  G.sakura = merge([[cyl(0.22, 0.34, 2.6, 7), 0, 1.3, 0, 0, 0, 0.08], [cyl(0.1, 0.15, 1.4, 5), 0.5, 2.6, 0, 0, 0, -0.7], [cyl(0.1, 0.15, 1.3, 5), -0.45, 2.7, 0.1, 0.2, 0, 0.7]]);
  G.sakuraLeaves = merge([[new THREE.IcosahedronGeometry(1.5, 1), 0, 3.6], [new THREE.IcosahedronGeometry(1.15, 1), 1.2, 3.2, 0.3], [new THREE.IcosahedronGeometry(1.1, 1), -1.1, 3.3, -0.2], [new THREE.IcosahedronGeometry(1, 1), 0.2, 3.1, 1.1]]);
  G.palm = merge(Array.from({ length: 6 }, (_, i) => [cyl(0.2 - i * 0.015, 0.24 - i * 0.015, 1.05, 6), i * i * 0.025, 0.5 + i, 0, 0, 0, -i * 0.06]));
  G.frond = (() => { const g = new THREE.PlaneGeometry(0.7, 2.6, 1, 3); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.3; p.setZ(i, -y * y * 0.12); } g.translate(0, 1.3, 0); g.rotateX(-1.1); return g; })();
  G.wheat = merge(Array.from({ length: 6 }, (_, i) => [cyl(0.02, 0.03, 1.1, 3), (i % 3) * 0.18 - 0.18, 0.55, Math.floor(i / 3) * 0.18 - 0.09, (i - 3) * 0.04, 0, (i % 2) * 0.08]));
  G.hay = (() => { const g = cyl(0.7, 0.7, 1.1, 12); g.rotateZ(Math.PI / 2); g.translate(0, 0.7, 0); return g; })();
  G.fence = merge([[new THREE.BoxGeometry(0.14, 1, 0.14), -1.4, 0.5], [new THREE.BoxGeometry(0.14, 1, 0.14), 1.4, 0.5], [new THREE.BoxGeometry(3, 0.12, 0.08), 0, 0.75], [new THREE.BoxGeometry(3, 0.12, 0.08), 0, 0.4]]);
  G.standing = new THREE.BoxGeometry(1.4, 4.4, 0.9); G.standing.translate(0, 2.2, 0);
  G.lintel = new THREE.BoxGeometry(3.6, 0.8, 1); G.lintel.translate(0, 4.8, 0);
  G.lily = (() => { const g = new THREE.CircleGeometry(0.5, 10, 0.3, Math.PI * 2 - 0.6); g.rotateX(-Math.PI / 2); return g; })();
  G.flowerBud = new THREE.IcosahedronGeometry(0.16, 0);
  return G;
}

/* ---- Landmarks -------------------------------------------------------------------------- */
/** Builds every landmark and returns the moving parts for update(). */
export function buildLandmarks(ctx) {
  const { scene, addObs, inst } = ctx;
  const S = shapes();
  const anim = { lava: [], water: [], blades: [], smoke: [], glow: [], castle: [] };
  const add = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const ring = (n, R, fn) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; fn(Math.cos(a) * R, Math.sin(a) * R, a, i); } };
  const lilies = [], plants = [], reeds = [], reedTops = [], rocks = [];

  for (const L of LANDMARKS) {
    const { x, z, r } = L;
    if (L.block) addObs(x, z, L.block);
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    switch (L.kind) {
      case 'lake': case 'oasis': case 'boglake': case 'frozenlake': {
        const R = L.kind === 'frozenlake' ? r : L.block + 0.6;
        const bog = L.kind === 'boglake', ice = L.kind === 'frozenlake';
        const water = new THREE.Mesh(blobGeo(x * 0.1), new THREE.MeshStandardMaterial({ color: ice ? 0xbfe6ff : bog ? 0x3e5a3a : 0x3aa8e0, roughness: ice ? 0.05 : 0.12, metalness: ice ? 0.3 : 0.1, transparent: true, opacity: ice ? 0.92 : 0.86 }));
        water.scale.set(R, 1, R); water.position.y = 0.04; water.receiveShadow = true; g.add(water);
        const rim = new THREE.Mesh(blobGeo(x * 0.1), std(ice ? 0xe8f4ff : bog ? 0x3a4a2a : 0xd8c48a)); rim.scale.set(R + 1.2, 1, R + 1.2); rim.position.y = 0.02; rim.receiveShadow = true; g.add(rim);
        if (!ice) anim.water.push({ m: water.material, base: water.material.color.clone() });
        if (ice) {
          // Cracks in the ice and a few frozen-in crystals.
          for (let i = 0; i < 9; i++) { const c = add(new THREE.BoxGeometry(rr(ctx, 3, 8), 0.02, 0.08), std(0xffffff, { transparent: true, opacity: 0.7 }), rr(ctx, -R * 0.5, R * 0.5), 0.06, rr(ctx, -R * 0.5, R * 0.5), g); c.rotation.y = rr(ctx, 0, 3); c.castShadow = false; }
          ring(7, R + 2.5, (cx, cz, a, i) => { const k = add(S.crystal, glow(0xaee8ff, 0.35, { transparent: true, opacity: 0.85 }), cx, 0, cz, g); k.scale.setScalar(1.2 + (i % 3) * 0.5); k.rotation.y = a; addObs(x + cx, z + cz, 0.8); });
        } else {
          for (let i = 0; i < R * 1.6; i++) { const a = rr(ctx, 0, 6.28), d = rr(ctx, 0.2, R * 0.85); lilies.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, y: 0.07, s: rr(ctx, 0.8, 1.5), ry: rr(ctx, 0, 6), color: bog ? 0x5a7a3a : 0x4f9a3a }); }
          for (let i = 0; i < R * 2.2; i++) { const a = rr(ctx, 0, 6.28), d = R + rr(ctx, -0.3, 0.8); reeds.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, s: rr(ctx, 0.8, 1.3), ry: rr(ctx, 0, 6) }); }
          if (L.kind === 'lake') for (let i = 0; i < R * 0.8; i++) { const a = rr(ctx, 0, 6.28), d = rr(ctx, 0.3, R * 0.8); plants.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, y: -0.1, s: rr(ctx, 6, 9), ry: rr(ctx, 0, 6) }); }
        }
        if (L.kind === 'oasis') {
          // Palms around the water.
          ring(8, R + 3, (cx, cz, a, i) => {
            const p = new THREE.Group(); p.position.set(cx + rr(ctx, -1, 1), 0, cz + rr(ctx, -1, 1)); p.rotation.y = rr(ctx, 0, 6); g.add(p);
            p.add(Object.assign(new THREE.Mesh(S.palm, std(0x9a6e42)), { castShadow: true }));
            const top = new THREE.Group(); top.position.set(0.62, 6.3, 0); p.add(top);
            for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(S.frond, std(0x4ea040, { side: THREE.DoubleSide })); f.rotation.y = (k / 7) * Math.PI * 2; f.castShadow = true; top.add(f); }
            addObs(x + p.position.x, z + p.position.z, 0.5);
          });
        }
        if (bog) {
          // Dead trees standing in the water, and a sunk skull rock.
          ring(6, R * 0.55, (cx, cz, a) => { const t = add(S.deadTree, std(0x3a3228), cx, -0.3, cz, g); t.rotation.y = a * 2; t.scale.setScalar(1.3); });
          anim.smoke.push({ x, z, r: R, color: 0x9ac08a, rate: 0.5, rise: 0.8, size: 2.4 });
        }
        break;
      }
      case 'lavalake': {
        const R = L.block + 0.5;
        const lava = new THREE.Mesh(blobGeo(z * 0.1, 0.16), new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff3a00, emissiveIntensity: 1.2, roughness: 0.6 }));
        lava.scale.set(R, 1, R); lava.position.y = 0.05; g.add(lava);
        const crust = new THREE.Mesh(blobGeo(z * 0.1, 0.16), std(0x2a201c)); crust.scale.set(R + 1.8, 1, R + 1.8); crust.position.y = 0.03; crust.receiveShadow = true; g.add(crust);
        // Floating crust plates.
        for (let i = 0; i < R; i++) { const a = rr(ctx, 0, 6.28), d = rr(ctx, 0, R * 0.7); const p = add(new THREE.CylinderGeometry(rr(ctx, 0.6, 1.4), 0.9, 0.18, 6), std(0x3a2a24), Math.cos(a) * d, 0.08, Math.sin(a) * d, g); p.castShadow = false; }
        ring(10, R + 2.2, (cx, cz, a, i) => { if (i % 2) rocks.push({ x: x + cx, z: z + cz, s: rr(ctx, 0.9, 1.6), ry: a }); });
        anim.lava.push(lava.material);
        anim.smoke.push({ x, z, r: R * 0.8, color: 0x5a4a48, rate: 1.4, rise: 2.2, size: 3, ember: true });
        break;
      }
      case 'volcano': {
        // A tall broken cone with a glowing crater and a lava stream down one side.
        const rock = std(0x5a4a42, { flatShading: true });
        const cone = add(new THREE.CylinderGeometry(8, L.block + 2, 12, 12, 4, true), rock, 0, 6, 0, g);
        const p = cone.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(i * 12.9898) * 0.08; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
        cone.geometry.computeVertexNormals();
        const crater = add(new THREE.CylinderGeometry(7.3, 7.3, 0.5, 14), glow(0xff5a1a, 1.4), 0, 11.4, 0, g); crater.castShadow = false;
        anim.lava.push(crater.material);
        // Lava streams down every side.
        const flowM = glow(0xff4a12, 1.1); anim.lava.push(flowM);
        ring(5, 0, (cx, cz, a) => { const f = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 21), flowM); f.position.set(Math.cos(a) * 16.4, 5.8, Math.sin(a) * 16.4); f.rotation.set(0, Math.PI / 2 - a, 0); f.rotateX(0.6); g.add(f); });
        ring(14, L.block + 4, (cx, cz) => rocks.push({ x: x + cx + rr(ctx, -2, 2), z: z + cz + rr(ctx, -2, 2), s: rr(ctx, 1.4, 2.4), ry: rr(ctx, 0, 6) }));
        anim.smoke.push({ x, z, y: 12, r: 4, color: 0x4a4040, rate: 3, rise: 5, size: 6, ember: true });
        break;
      }
      case 'pyramid': {
        const stone = std(0xd9b77a, { flatShading: true });
        const steps = 7;
        for (let i = 0; i < steps; i++) { const w = (L.block + 2) * 2 * (1 - i / steps); add(new THREE.BoxGeometry(w, 1.7, w), stone, 0, 0.85 + i * 1.7, 0, g); }
        add(new THREE.ConeGeometry(2.4, 2.4, 4), glow(0xffd36b, 0.6, { metalness: 0.6 }), 0, steps * 1.7 + 1.2, 0, g).rotation.y = Math.PI / 4;
        // Entrance, obelisks and a sphinx-like guardian block.
        add(new THREE.BoxGeometry(4, 3.2, 1), std(0x2a2018), 0, 1.6, L.block + 2.1, g);
        for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(0.4, 0.8, 6, 4), std(0xc9a76a, { flatShading: true }), sx * 9, 3, L.block + 8, g).rotation.y = Math.PI / 4; add(new THREE.ConeGeometry(0.5, 1, 4), glow(0xffd36b, 0.5), sx * 9, 6.5, L.block + 8, g).rotation.y = Math.PI / 4; addObs(x + sx * 9, z + L.block + 8, 1); }
        anim.glow.push(g.children[steps].material);
        break;
      }
      case 'icecastle': {
        const ice = glow(0xa8e4ff, 0.25, { transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.2 });
        const wall = std(0xdceffc);
        add(new THREE.CylinderGeometry(L.block, L.block + 0.5, 4, 10, 1, true), wall, 0, 2, 0, g).material.side = THREE.DoubleSide;
        ring(10, L.block, (cx, cz, a) => add(new THREE.BoxGeometry(1.6, 1.2, 1.6), wall, cx, 4.5, cz, g).rotation.y = -a);
        ring(5, L.block, (cx, cz) => {
          add(new THREE.CylinderGeometry(2, 2.3, 7, 10), wall, cx, 3.5, cz, g);
          add(new THREE.ConeGeometry(2.5, 4, 10), ice, cx, 9, cz, g);
          addObs(x + cx, z + cz, 2.4);
        });
        add(new THREE.CylinderGeometry(4, 5, 9, 10), wall, 0, 4.5, 0, g);
        const spire = add(new THREE.ConeGeometry(4.6, 6, 10), ice, 0, 12, 0, g);
        anim.castle.push(spire);
        ring(12, L.r + 1, (cx, cz, a, i) => { const k = add(S.crystal, ice, cx, 0, cz, g); k.scale.setScalar(1 + (i % 4) * 0.4); k.rotation.y = a; });
        break;
      }
      case 'farm': {
        inst('building_windmill_yellow', [{ x: x - 6, z: z - 6, s: 4.6, ry: 0.6 }]); addObs(x - 6, z - 6, 2.6);
        inst('building_home_B_red', [{ x: x + 8, z: z - 9, s: 4.2, ry: -0.6 }]); addObs(x + 8, z - 9, 2.4);
        inst('wheelbarrow', [{ x: x + 3, z: z - 4, s: 5, ry: 1 }]); inst('sack', [{ x: x - 2, z: z - 2, s: 5 }, { x: x - 1, z: z - 2.6, s: 5, ry: 1 }]);
        // Wheat rows, hay bales and a fence around the field.
        const wheat = [], hay = [], fences = [];
        for (let i = -6; i <= 6; i++) for (let j = 0; j < 11; j++) { const wx = x + i * 0.9 + rr(ctx, -0.1, 0.1), wz = z + 3 + j * 0.9; if (Math.hypot(wx - x, wz - z - 7) > 8) continue; wheat.push({ x: wx, z: wz, s: rr(ctx, 0.9, 1.2), ry: rr(ctx, 0, 6) }); }
        ring(5, 11, (cx, cz, a, i) => { if (i < 3) { hay.push({ x: x + cx, z: z + cz - 8, s: 1, ry: a }); addObs(x + cx, z + cz - 8, 0.8); } });
        ring(16, 10.5, (cx, cz, a, i) => { if (i !== 12) fences.push({ x: x + cx, z: z + 7 + cz, s: 1, ry: -a + Math.PI / 2 }); });
        instance(scene, S.wheat, std(0xe0c060), wheat, { shadow: false });
        instance(scene, S.hay, std(0xd8b85a), hay);
        instance(scene, S.fence, std(0x9a6a3e), fences);
        anim.windmill = { x: x - 6, z: z - 6 };
        break;
      }
      case 'stones': {
        const stone = std(0x9a9a92, { flatShading: true });
        ring(8, 7, (cx, cz, a, i) => {
          const s = add(G.standing, stone, cx, 0, cz, g); s.rotation.y = -a + Math.PI / 2; s.rotation.z = (i % 3 === 2) ? 0.12 : 0; addObs(x + cx, z + cz, 1);
          if (i % 2 === 0) { const l = add(G.lintel, stone, cx, 0, cz, g); l.rotation.y = -a; l.position.set(Math.cos(a + 0.39) * 7, 0, Math.sin(a + 0.39) * 7); l.rotation.y = -(a + 0.39) + Math.PI / 2; l.scale.x = 0.85; }
        });
        const altar = add(new THREE.BoxGeometry(3, 0.9, 1.8), stone, 0, 0.45, 0, g); addObs(x, z, 1.5);
        const rune = add(new THREE.OctahedronGeometry(0.5), glow(0x7affd8, 1), 0, 2, 0, g); anim.glow.push(rune.material); anim.castle.push(rune);
        void altar;
        break;
      }
      case 'tower': {
        inst('building_tower_A_red', [{ x, z, s: 4.4, ry: 0.4 }]);
        inst('building_destroyed', [{ x: x + 5, z: z + 3, s: 5, ry: 1.4 }]); addObs(x + 5, z + 3, 2.6);
        inst('flag_red', [{ x: x - 3, z: z + 3, s: 7 }]);
        break;
      }
      case 'arch': {
        const red = std(0xc8643a, { flatShading: true });
        for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(1.6, 2.2, 6, 7), red, sx * 5, 3, 0, g); addObs(x + sx * 5, z, 2.2); }
        const top = add(new THREE.TorusGeometry(5, 1.4, 7, 12, Math.PI), red, 0, 5.5, 0, g);
        void top;
        ring(9, L.r, (cx, cz) => rocks.push({ x: x + cx, z: z + cz, s: rr(ctx, 1, 2), ry: rr(ctx, 0, 6), color: 0xc87a4a }));
        break;
      }
      case 'sakura': {
        const trees = [], leaves = [];
        for (let i = 0; i < 46; i++) {
          const a = rr(ctx, 0, 6.28), d = Math.sqrt(ctx.rand()) * (r - 2), tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d;
          if (trees.some(t => Math.hypot(t.x - tx, t.z - tz) < 6)) continue;
          const s = rr(ctx, 1, 1.4);
          trees.push({ x: tx, z: tz, s, ry: rr(ctx, 0, 6) });
          leaves.push({ x: tx, z: tz, s, ry: rr(ctx, 0, 6), color: [0xffb7d5, 0xff9cc6, 0xffd0e4, 0xffa8cc][i % 4] });
          addObs(tx, tz, 0.45 * s);
        }
        instance(scene, S.sakura, std(0x6a4436), trees);
        instance(scene, S.sakuraLeaves, std(0xffffff, { roughness: 0.7 }), leaves);
        // A pink carpet of fallen petals.
        const carpet = new THREE.Mesh(blobGeo(3, 0.18), std(0xffc8dc, { transparent: true, opacity: 0.55 })); carpet.scale.set(r * 0.95, 1, r * 0.95); carpet.position.y = 0.025; carpet.receiveShadow = true; g.add(carpet);
        break;
      }
      case 'bigtree': {
        const bark = std(0x4a3a2a, { flatShading: true });
        add(new THREE.CylinderGeometry(2.2, 4.2, 10, 10), bark, 0, 5, 0, g);
        ring(6, 3.6, (cx, cz, a) => { const rt = add(new THREE.CylinderGeometry(0.5, 1.4, 6, 6), bark, cx * 1.2, 1, cz * 1.2, g); rt.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); });
        ring(5, 5, (cx, cz, a) => { const b = add(new THREE.CylinderGeometry(0.5, 1, 6, 6), bark, cx * 0.8, 10, cz * 0.8, g); b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); });
        const crown = std(0x2e5a34, { flatShading: true });
        for (const [cx, cy, cz, s] of [[0, 13, 0, 6.5], [7, 12, 2, 4.5], [-7, 12.5, -2, 5], [1, 11.5, 7, 4.2], [-2, 12, -7, 4.4]]) add(new THREE.IcosahedronGeometry(s, 1), crown, cx, cy, cz, g);
        // Glowing spirit lights hanging around it.
        for (let i = 0; i < 14; i++) { const o = add(new THREE.SphereGeometry(0.22, 8, 6), glow(0x9affc8, 1.5), rr(ctx, -10, 10), rr(ctx, 2, 8), rr(ctx, -10, 10), g); o.castShadow = false; anim.castle.push(o); }
        break;
      }
      case 'mushring': {
        const caps = [], stems = [];
        ring(14, 7, (cx, cz, a, i) => { const s = rr(ctx, 1.6, 2.6); stems.push({ x: x + cx, z: z + cz, s }); caps.push({ x: x + cx, z: z + cz, s, color: i % 2 ? 0x7ad8ff : 0xc88aff }); addObs(x + cx, z + cz, 0.35 * s); });
        const big = { x, z, s: 5 };
        stems.push(big); caps.push({ ...big, color: 0x9affd8 }); addObs(x, z, 1.2);
        instance(scene, G.mushStem, std(0xe8e0d0), stems);
        const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        instance(scene, G.mushCap, capMat, caps);
        break;
      }
    }
  }
  inst('waterlily_A', plants, { shadow: false });
  instance(scene, G.lily, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), lilies, { shadow: false });
  instance(scene, G.reed, std(0x6a8a3a), reeds, { shadow: false });
  instance(scene, G.reedTop, std(0x6a4a2a), reeds.map(r => ({ ...r })), { shadow: false });
  if (rocks.length) instance(scene, new THREE.DodecahedronGeometry(1, 0), std(0xffffff, { flatShading: true }), rocks.map(r => ({ ...r, y: 0.4, color: r.color ?? 0x3a302c })));
  for (const r of rocks) addObs(r.x, r.z, r.s * 0.8);
  return anim;
}
const rr = (ctx, a, b) => a + ctx.rand() * (b - a);

/* ---- Region props --------------------------------------------------------------------------- */
export function buildRegionProps(ctx) {
  const { scene, addObs, free, regionAt, isForest } = ctx;
  const S = shapes();
  const lists = {};
  const put = (k, it, r) => { (lists[k] ||= []).push(it); if (r) addObs(it.x, it.z, r); };
  // Sample spots in a region until `n` props are placed.
  const scatter = (region, n, pad, fn, test) => {
    let placed = 0;
    for (let t = 0; t < n * 60 && placed < n; t++) {
      const x = rr(ctx, -375, 375), z = rr(ctx, -375, 375);
      if (regionAt(x, z) !== region || (test && !test(x, z)) || !free(x, z, pad)) continue;
      fn(x, z); placed++;
    }
  };
  // Desert: tall and round cacti, dry bushes, dunes, bleached bones, broken sandstone pillars.
  scatter('desert', 230, 0.8, (x, z) => { const s = rr(ctx, 0.8, 1.4); put('cactus', { x, z, s, ry: rr(ctx, 0, 6) }, 0.4 * s); });
  scatter('desert', 120, 0.7, (x, z) => put('barrelCactus', { x, z, s: rr(ctx, 0.7, 1.2) }, 0.5));
  scatter('desert', 200, 0.3, (x, z) => put('dryBush', { x, z, s: rr(ctx, 0.8, 1.4), ry: rr(ctx, 0, 6) }));
  scatter('desert', 110, 3, (x, z) => put('dune', { x, z, sx: rr(ctx, 6, 12), sy: rr(ctx, 4, 8), sz: rr(ctx, 6, 10), ry: rr(ctx, 0, 3) }));
  scatter('desert', 26, 1.4, (x, z) => { put('ribs', { x, z, s: rr(ctx, 1, 1.6), ry: rr(ctx, 0, 6) }, 1); put('skull', { x: x + 1.6, z: z + 0.8, s: rr(ctx, 0.8, 1.2), ry: rr(ctx, 0, 6) }); });
  scatter('desert', 34, 1.2, (x, z) => put('pillar', { x, z, s: 1, sy: rr(ctx, 0.4, 1.1), ry: rr(ctx, 0, 6), rz: rr(ctx, -0.12, 0.12) }, 0.8));
  // Snow: ice crystal clusters, snowmen, igloos, drifts.
  scatter('snow', 160, 0.9, (x, z) => { const s = rr(ctx, 0.8, 1.8); put('crystal', { x, z, s, ry: rr(ctx, 0, 6), color: pickOf(ctx, [0x9ee6ff, 0xc8f0ff, 0x8ad0ff, 0xd8c8ff]) }, 0.35 * s); });
  scatter('snow', 26, 1, (x, z) => { const ry = rr(ctx, 0, 6); put('snowman', { x, z, s: 1, ry }, 0.8); put('carrot', { x, z, s: 1, ry }); });
  scatter('snow', 10, 2.6, (x, z) => put('igloo', { x, z, s: 1, ry: rr(ctx, 0, 6) }, 2));
  scatter('snow', 140, 1.5, (x, z) => put('snowPile', { x, z, sx: rr(ctx, 2, 4), sy: rr(ctx, 1.5, 3), sz: rr(ctx, 2, 4), ry: rr(ctx, 0, 3) }));
  // Swamp: dead trees, glowing mushrooms, reeds, stumps, fallen logs.
  scatter('swamp', 200, 1, (x, z) => { const s = rr(ctx, 0.9, 1.5); put('deadTree', { x, z, s, ry: rr(ctx, 0, 6) }, 0.35 * s); });
  scatter('swamp', 170, 0.6, (x, z) => { const s = rr(ctx, 0.6, 1.5); put('mushStem', { x, z, s }, 0.2 * s); put('mushCap', { x, z, s, color: pickOf(ctx, [0x7ad8ff, 0xc88aff, 0x9affc8, 0xff8ad8]) }); });
  scatter('swamp', 320, 0.3, (x, z) => put('reeds', { x, z, s: rr(ctx, 0.8, 1.3), ry: rr(ctx, 0, 6) }));
  scatter('swamp', 90, 0.7, (x, z) => put('stump', { x, z, s: rr(ctx, 0.8, 1.4), ry: rr(ctx, 0, 6) }, 0.5));
  scatter('swamp', 60, 1.6, (x, z) => put('log', { x, z, s: rr(ctx, 0.8, 1.3), ry: rr(ctx, 0, 6) }, 1));
  // Volcano: obsidian spikes, charred trunks, steaming vents.
  scatter('volcano', 190, 1, (x, z) => { const s = rr(ctx, 0.8, 1.8); put('spike', { x, z, s, ry: rr(ctx, 0, 6) }, 0.45 * s); });
  scatter('volcano', 140, 0.7, (x, z) => put('charred', { x, z, s: rr(ctx, 0.8, 1.4), ry: rr(ctx, 0, 6) }, 0.35));
  scatter('volcano', 30, 1.4, (x, z) => put('vent', { x, z, s: rr(ctx, 0.9, 1.4) }, 1));
  // Green land: bushes, flowers in clumps, mushrooms and stumps in the western forest, logs.
  scatter('core', 520, 0.8, (x, z) => put('bush', { x, z, s: rr(ctx, 0.7, 1.3), ry: rr(ctx, 0, 6), color: pickOf(ctx, [0x5a9a3a, 0x4a8a34, 0x6aaa44, 0x3f7a30]) }, 0.6));
  scatter('core', 140, 0.5, (x, z) => { const s = rr(ctx, 0.35, 0.7); put('mushStem', { x, z, s }); put('redCap', { x, z, s, color: 0xe8382a }); }, (x) => x < -40);
  scatter('core', 80, 0.7, (x, z) => put('stump', { x, z, s: rr(ctx, 0.8, 1.2), ry: rr(ctx, 0, 6) }, 0.5), (x) => x < -40);
  scatter('core', 50, 1.6, (x, z) => put('log', { x, z, s: rr(ctx, 0.8, 1.2), ry: rr(ctx, 0, 6) }, 1), (x, z) => isForest(x, z));
  scatter('core', 90, 0.4, (x, z) => { for (let i = 0; i < 9; i++) put('bud', { x: x + rr(ctx, -1.5, 1.5), y: 0.25, z: z + rr(ctx, -1.5, 1.5), s: rr(ctx, 0.8, 1.3), color: pickOf(ctx, [0xff5a8a, 0xffe14d, 0xb59cff, 0xffffff, 0xff8a4d]) }); });

  const M = {
    cactus: std(0x4f9a4a), barrelCactus: std(0x5aa84f), dryBush: std(0x8a6a44), dune: std(0xe4c890, { roughness: 1 }), ribs: std(0xf0e8d6), skull: std(0xf0e8d6),
    pillar: std(0xd8b880, { flatShading: true }), crystal: glow(0x9ad8ff, 0.12, { transparent: true, opacity: 0.88, roughness: 0.1 }), snowman: std(0xf6fbff), carrot: std(0xff8a2a),
    igloo: std(0xeef6ff), snowPile: std(0xf2f8ff, { roughness: 1 }), deadTree: std(0x3e352c), mushStem: std(0xe8e0d0), mushCap: new THREE.MeshBasicMaterial({ color: 0xffffff }), redCap: std(0xffffff, { roughness: 0.5 }), reeds: std(0x6a8a3a),
    stump: std(0x6a4a30), log: std(0x5a3e28), spike: std(0x1c1820, { roughness: 0.25, metalness: 0.4, flatShading: true }), charred: std(0x1e1a18), vent: std(0x3a2e2a, { flatShading: true }),
    bush: std(0xffffff, { roughness: 0.9 }), bud: std(0xffffff, { roughness: 0.6 }),
  };
  const geo = { ...S, reeds: S.reed, bud: S.flowerBud, redCap: S.mushCap };
  for (const [k, list] of Object.entries(lists)) instance(scene, geo[k], M[k], list, { shadow: !['dune', 'snowPile', 'bud', 'reeds', 'dryBush'].includes(k) });
  // Vents puff steam; the engine animates these.
  return { vents: (lists.vent || []).map(v => ({ x: v.x, z: v.z })), mushMat: M.mushCap };
}
const pickOf = (ctx, a) => a[Math.floor(ctx.rand() * a.length)];
