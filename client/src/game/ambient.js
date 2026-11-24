import * as THREE from 'three';
import { LANDMARKS, riverX, regionWeights } from '../../../shared/rules.js';

/**
 * Life in the world around the player: weather by region (snow, embers and ash, fireflies, blowing
 * sand, petals, rain), smoke from vents and lava, butterflies, birds, jumping fish, and the day and
 * night cycle. Weather and time of day come from the clock, so every player sees the same sky.
 */
const DAY_LEN = 18 * 60;        // seconds for a full day
const RAIN_LEN = 7 * 60;        // weather changes on this beat
const BOX = { x: 34, y: 16, z: 30 };

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Shifts the clock for weather and daylight (debug only). */
export const clock = { offset: 0 };
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/** Time of day: 0..1 how much daylight, and the dusk amount (warm light near sunrise/sunset). */
export function dayState(now = Date.now() + clock.offset) {
  const t = (now / 1000 / DAY_LEN) % 1;
  const sun = Math.sin(t * Math.PI * 2);
  const day = Math.min(1, Math.max(0, 0.5 + sun * 0.9));
  return { t, day, dusk: Math.max(0, 1 - Math.abs(sun) * 3) };
}
/** Rain: on for some weather beats, the same for everyone. 0..1 with soft edges. */
export function rainState(now = Date.now() + clock.offset) {
  const k = now / 1000 / RAIN_LEN, i = Math.floor(k), f = k - i;
  const on = (n) => (hash(n) < 0.3 ? 1 : 0);
  const a = on(i), edge = Math.min(1, f * 6, (1 - f) * 6);
  return a * edge;
}

export function createAmbient({ scene }) {
  const dot = softDot();
  const fields = [];
  /** A cloud of points kept in a box around the player; move(p, i, dt) moves point i. */
  function field(n, color, size, opts, move, init) {
    const pos = new Float32Array(n * 3), data = new Float32Array(n * 4);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size, map: dot, transparent: true, depthWrite: false, opacity: 0, sizeAttenuation: true, ...opts });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
    const f = { pts, pos, data, n, move, w: 0, max: opts?.opacity ?? 0.9, init };
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * BOX.x * 2; pos[i * 3 + 1] = Math.random() * BOX.y; pos[i * 3 + 2] = (Math.random() - 0.5) * BOX.z * 2; for (let k = 0; k < 4; k++) data[i * 4 + k] = Math.random(); init?.(pos, data, i); }
    fields.push(f);
    return f;
  }
  const wrap = (v, c, h) => c + ((((v - c + h) % (h * 2)) + h * 2) % (h * 2)) - h;
  let cx = 0, cz = 0, time = 0, wind = 0;
  const snow = field(500, 0xffffff, 0.32, { opacity: 0.95 }, (p, d, i, dt) => {
    p[i * 3 + 1] -= (1.2 + d[i * 4] * 1.6) * dt; p[i * 3] += (Math.sin(time * 0.8 + d[i * 4 + 1] * 9) * 0.6 + wind * 0.4) * dt;
    if (p[i * 3 + 1] < 0) p[i * 3 + 1] += BOX.y;
  });
  const embers = field(220, 0xff7a2a, 0.28, { opacity: 1, blending: THREE.AdditiveBlending }, (p, d, i, dt) => {
    p[i * 3 + 1] += (0.8 + d[i * 4] * 1.8) * dt; p[i * 3] += Math.sin(time * 2 + d[i * 4 + 1] * 9) * 0.5 * dt;
    if (p[i * 3 + 1] > BOX.y) p[i * 3 + 1] -= BOX.y;
  });
  const ash = field(260, 0x7a7070, 0.22, { opacity: 0.7 }, (p, d, i, dt) => {
    p[i * 3 + 1] -= (0.35 + d[i * 4] * 0.5) * dt; p[i * 3] += (0.5 + Math.sin(time + d[i * 4 + 1] * 7) * 0.4) * dt;
    if (p[i * 3 + 1] < 0) p[i * 3 + 1] += BOX.y;
  });
  const flies = field(130, 0xd8ff6a, 0.38, { opacity: 1, blending: THREE.AdditiveBlending }, (p, d, i, dt) => {
    const a = time * (0.4 + d[i * 4] * 0.6) + d[i * 4 + 1] * 30;
    p[i * 3] += Math.cos(a) * 0.8 * dt; p[i * 3 + 2] += Math.sin(a * 1.3) * 0.8 * dt; p[i * 3 + 1] = 0.6 + d[i * 4 + 2] * 2.6 + Math.sin(a * 2) * 0.3;
  });
  const sand = field(320, 0xe8cfa0, 0.2, { opacity: 0.75 }, (p, d, i, dt) => {
    p[i * 3] += (9 + d[i * 4] * 7) * dt; p[i * 3 + 1] = 0.2 + d[i * 4 + 2] * 2.4 + Math.sin(time * 3 + d[i * 4 + 1] * 9) * 0.2;
  });
  const petals = field(240, 0xffb0d0, 0.3, { opacity: 0.95 }, (p, d, i, dt) => {
    p[i * 3 + 1] -= (0.5 + d[i * 4] * 0.6) * dt; p[i * 3] += (0.9 + Math.sin(time * 1.5 + d[i * 4 + 1] * 9) * 0.8) * dt; p[i * 3 + 2] += Math.cos(time + d[i * 4 + 2] * 9) * 0.4 * dt;
    if (p[i * 3 + 1] < 0) p[i * 3 + 1] += 9;
  }, (p, d, i) => { p[i * 3 + 1] = Math.random() * 9; });
  const pollen = field(90, 0xfff6c8, 0.18, { opacity: 0.8 }, (p, d, i, dt) => {
    p[i * 3] += (0.4 + Math.sin(time * 0.7 + d[i * 4] * 9) * 0.3) * dt; p[i * 3 + 1] = 0.6 + d[i * 4 + 2] * 3 + Math.sin(time + d[i * 4 + 1] * 9) * 0.4;
  });
  // Rain: short streaks, drawn as line segments.
  const RN = 420, rpos = new Float32Array(RN * 6), rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8d4f0, transparent: true, opacity: 0 }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const rdat = Array.from({ length: RN }, () => [(Math.random() - 0.5) * BOX.x * 2, Math.random() * BOX.y, (Math.random() - 0.5) * BOX.z * 2, 14 + Math.random() * 8]);

  /* Smoke puffs from vents, lava and the volcano. */
  const PUFFS = 90, puffs = [];
  const puffMat = (c) => new THREE.SpriteMaterial({ map: dot, color: c, transparent: true, depthWrite: false, opacity: 0 });
  for (let i = 0; i < PUFFS; i++) { const s = new THREE.Sprite(puffMat(0x666666)); s.visible = false; scene.add(s); puffs.push({ s, life: 0 }); }
  let puffI = 0;
  const emitters = LANDMARKS.filter(l => ['lavalake', 'volcano', 'boglake'].includes(l.kind)).map(l => ({
    x: l.x, z: l.z, y: l.kind === 'volcano' ? 22 : 0.3, r: l.kind === 'volcano' ? 4 : l.block * 0.7, color: l.kind === 'boglake' ? 0x9ab88a : l.kind === 'volcano' ? 0x4a4242 : 0x6a5a56,
    rate: l.kind === 'volcano' ? 4 : 1.6, rise: l.kind === 'volcano' ? 5 : 2, size: l.kind === 'volcano' ? 7 : 3, acc: 0,
  }));
  function puff(e) {
    const p = puffs[puffI++ % PUFFS], a = Math.random() * 6.28, d = Math.random() * e.r;
    p.s.visible = true; p.s.material.color.setHex(e.color);
    p.x = e.x + Math.cos(a) * d; p.z = e.z + Math.sin(a) * d; p.y = e.y; p.v = e.rise * (0.7 + Math.random() * 0.6); p.size = e.size; p.life = p.max = 2.6 + Math.random() * 1.6;
  }
  const addVents = (vents) => { for (const v of vents) emitters.push({ x: v.x, z: v.z, y: 0.8, r: 0.3, color: 0xd8d0c8, rate: 1.2, rise: 2.4, size: 1.6, acc: 0 }); };

  /* Butterflies: two wings flapping, wandering near the player over grass by day. */
  const wingG = new THREE.PlaneGeometry(0.34, 0.26); wingG.translate(0.17, 0, 0); wingG.rotateX(-Math.PI / 2);
  const flutters = Array.from({ length: 12 }, (_, i) => {
    const m = new THREE.MeshBasicMaterial({ color: [0xffd34a, 0xff8ac8, 0x8ad0ff, 0xffffff, 0xff9a4a][i % 5], side: THREE.DoubleSide, transparent: true });
    const g = new THREE.Group(), l = new THREE.Mesh(wingG, m), r = new THREE.Mesh(wingG, m); r.scale.x = -1; g.add(l, r); g.visible = false; scene.add(g);
    return { g, l, r, x: 0, z: 0, h: 1, a: Math.random() * 6, ph: Math.random() * 6, set: false };
  });
  /* Birds: a small V crossing the sky now and then. */
  const birdG = new THREE.BufferGeometry(); birdG.setAttribute('position', new THREE.Float32BufferAttribute([-0.6, 0, -0.2, 0, 0, 0.2, 0, 0, -0.1, 0, 0, 0.2, 0.6, 0, -0.2, 0, 0, -0.1], 3));
  const birdM = new THREE.MeshBasicMaterial({ color: 0x2a2a34, side: THREE.DoubleSide });
  const flock = Array.from({ length: 6 }, () => { const b = new THREE.Mesh(birdG, birdM); b.visible = false; scene.add(b); return b; });
  let flockT = 8, flockOn = null;
  /* A fish that jumps out of the river near the player. */
  const fish = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff9a4a, roughness: 0.4 }));
  fish.visible = false; scene.add(fish);
  let fishT = 5, fishJ = null;

  const near = (kind, px, pz, pad) => LANDMARKS.some(l => l.kind === kind && Math.hypot(px - l.x, pz - l.z) < l.r + pad);
  return {
    addVents,
    /** Called every frame with the player's position; `day` and `rain` from dayState / rainState. */
    update(dt, t, px, pz, day, rainK, onSplash) {
      time = t; cx = px; cz = pz; wind = Math.sin(t * 0.1) * 2;
      const w = regionWeights(px, pz), core = 1 - (w.snow + w.swamp + w.desert + w.volcano);
      const sakura = near('sakura', px, pz, 14) ? 1 : 0;
      const target = {
        snow: w.snow, embers: w.volcano, ash: w.volcano * 0.8, flies: Math.max(w.swamp, core * (1 - day) * 0.8), sand: w.desert * 0.85,
        petals: sakura, pollen: core * day * 0.8,
      };
      const byField = { snow, embers, ash, flies, sand, petals, pollen };
      for (const [k, f] of Object.entries(byField)) {
        f.w += ((target[k] || 0) - f.w) * Math.min(1, dt * 1.5);
        f.pts.visible = f.w > 0.02;
        if (!f.pts.visible) continue;
        let blink = 1;
        if (f === flies) blink = 0.7 + Math.sin(t * 3) * 0.3;
        f.pts.material.opacity = f.w * f.max * blink;
        const p = f.pos, d = f.data;
        for (let i = 0; i < f.n; i++) {
          f.move(p, d, i, dt);
          p[i * 3] = wrap(p[i * 3], px, BOX.x); p[i * 3 + 2] = wrap(p[i * 3 + 2], pz, BOX.z);
        }
        f.pts.geometry.attributes.position.needsUpdate = true;
      }
      // Rain in the green land and the swamp.
      const rk = rainK * Math.max(core, w.swamp);
      rain.visible = rk > 0.02; rain.material.opacity = rk * 0.55;
      if (rain.visible) {
        for (let i = 0; i < RN; i++) {
          const r = rdat[i]; r[1] -= r[3] * dt; r[0] += wind * 0.6 * dt;
          if (r[1] < 0) { r[1] += BOX.y; if (Math.random() < 0.08 && onSplash) onSplash(px + r[0], pz + r[2]); }
          const x = wrap(px + r[0], px, BOX.x), z = wrap(pz + r[2], pz, BOX.z);
          rpos.set([x, r[1], z, x + wind * 0.05, r[1] + 0.9, z], i * 6);
        }
        rg.attributes.position.needsUpdate = true;
      }
      // Smoke.
      for (const e of emitters) {
        if (Math.abs(e.x - px) > 70 || Math.abs(e.z - pz) > 70) continue;
        e.acc += dt * e.rate; while (e.acc > 1) { e.acc -= 1; puff(e); }
      }
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
        const k = 1 - p.life / p.max;
        p.y += p.v * dt; p.x += wind * 0.3 * dt;
        p.s.position.set(p.x, p.y, p.z); p.s.scale.setScalar(p.size * (0.5 + k));
        p.s.material.opacity = Math.min(1, k * 5) * (1 - k) * 0.5;
      }
      // Butterflies by day on the green land.
      const showB = core * day > 0.4 && rk < 0.3;
      for (const b of flutters) {
        b.g.visible = showB;
        if (!showB) { b.set = false; continue; }
        if (!b.set || Math.hypot(b.x - px, b.z - pz) > 26) { b.set = true; b.x = px + (Math.random() - 0.5) * 40; b.z = pz + (Math.random() - 0.5) * 34; }
        b.a += (Math.random() - 0.5) * dt * 3; b.x += Math.sin(b.a) * 1.4 * dt; b.z += Math.cos(b.a) * 1.4 * dt; b.h = 1 + Math.sin(t * 1.7 + b.ph) * 0.5;
        const f = Math.sin(t * 22 + b.ph) * 1.1;
        b.l.rotation.z = f; b.r.rotation.z = -f;
        b.g.position.set(b.x, b.h, b.z); b.g.rotation.y = b.a;
      }
      // Birds.
      flockT -= dt;
      if (!flockOn && flockT <= 0 && day > 0.5 && w.volcano < 0.5) {
        const a = Math.random() * 6.28;
        flockOn = { x: px - Math.sin(a) * 40, z: pz - Math.cos(a) * 34, vx: Math.sin(a) * 9, vz: Math.cos(a) * 9, t: 0, a };
      }
      if (flockOn) {
        const F = flockOn; F.t += dt; F.x += F.vx * dt; F.z += F.vz * dt;
        flock.forEach((b, i) => {
          const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2), back = Math.ceil(i / 2) * 1.4;
          b.visible = true;
          b.position.set(F.x + Math.cos(F.a) * side * 1.5 - Math.sin(F.a) * back, 9 + Math.sin(t * 2 + i) * 0.3, F.z - Math.sin(F.a) * side * 1.5 - Math.cos(F.a) * back);
          b.rotation.set(0, F.a, 0); b.scale.set(1, 1 + Math.sin(t * 10 + i) * 0.6, 1);
        });
        if (F.t > 9) { flockOn = null; flockT = 12 + Math.random() * 20; flock.forEach(b => { b.visible = false; }); }
      }
      // Fish.
      fishT -= dt;
      if (!fishJ && fishT <= 0) {
        fishT = 3 + Math.random() * 6;
        const fz = pz + (Math.random() - 0.5) * 30, fx = riverX(fz);
        if (Math.abs(fx - px) < 30) fishJ = { x: fx + (Math.random() - 0.5) * 3, z: fz, t: 0, dir: Math.random() < 0.5 ? 1 : -1 };
      }
      if (fishJ) {
        const J = fishJ; J.t += dt; const k = J.t / 0.9;
        fish.visible = true; fish.position.set(J.x, -0.2 + Math.sin(k * Math.PI) * 1.8, J.z + (k - 0.5) * 2.4 * J.dir); fish.rotation.x = (k - 0.5) * 2.4 * -J.dir;
        if (k >= 1) { fish.visible = false; fishJ = null; onSplash?.(J.x, J.z + 1.2 * J.dir, true); }
      }
    },
  };
}
