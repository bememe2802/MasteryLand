import {
  HALF, SPEED, inWater, isSafe, CAMPS, ENEMIES, ENEMY_LIST, NPCS, NPC_RANGE, CHECKPOINTS, ARENA, STYLES, FINISHER, CRIT,
  SKILL_UNLOCK, MAX_LV, CATALOG, SHOPS, POTIONS, POTION_CD, ANIMS, xpNeed, maxHpFor, defReduceFor, dmgFor,
} from '../public/shared.js';

const VIEW = 60;
const CELL = 60;
const TICK = 100;
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createGame({ store, maxPlayers = 500, log = console }) {
  const online = new Map();
  const queue = [];
  const slots = new Array(ARENA.slots).fill(null);

  const send = (p, m) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); };

  function attach(ws) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const authTimer = setTimeout(() => ws.close(4001, 'auth timeout'), 5000);
    ws.once('message', (data) => {
      clearTimeout(authTimer);
      let m; try { m = JSON.parse(data); } catch { return ws.close(4001, 'bad auth'); }
      const u = m?.t === 'auth' && store.userFromToken(m.token);
      if (!u) return ws.close(4001, 'unauthorized');
      if (!online.has(u.id) && online.size >= maxPlayers) return ws.close(4002, 'full');
      join(ws, u);
    });
  }

  function join(ws, u) {
    const old = online.get(u.id);
    if (old) { send(old, { t: 'kicked' }); old.ws.close(4000, 'replaced'); leave(old); }
    const prog = store.loadProgress(u);
    const cp = CHECKPOINTS.find(c => c.id === prog.checkpoint);
    const now = Date.now();
    const p = {
      ws, id: u.id, name: u.name, prog, progDirty: false, saveDirty: false,
      x: cp.x, z: cp.z, r: 0, a: 0, lastPos: { x: cp.x, z: cp.z, t: now }, hp: maxHpFor(prog), dead: false, deadAt: 0, lastHurt: 0,
      swing: null, skill: null, nextSwing: 0, nextSkill: { melee: 0, sword: 0 }, potAt: 0,
      enemies: new Map(), known: new Set(), lastAttacker: null, match: null, queued: false, returnTo: null,
      msgs: 0, msgWin: now, strikes: 0, strikeWin: now, logged: new Map(),
    };
    online.set(u.id, p);
    send(p, { t: 'welcome', me: { id: u.id, name: u.name, rating: u.rating, wins: u.wins, losses: u.losses }, prog, x: p.x, z: p.z, hp: p.hp });
    ws.on('message', (data) => onMessage(p, data));
    ws.on('close', () => { if (online.get(p.id) === p) leave(p); });
  }

  function leave(p) {
    if (p.queued) unqueue(p);
    if (p.match) endMatch(p.match, other(p.match, p), 'disconnect');
    save([p]);
    online.delete(p.id);
  }

  function save(list) {
    const rows = list.filter(p => p.saveDirty).map(p => { p.saveDirty = false; return [p.id, p.prog]; });
    if (rows.length) store.saveMany(rows);
  }

  function violation(p, kind, detail) {
    const now = Date.now();
    if (now - p.strikeWin > 60000) { p.strikeWin = now; p.strikes = 0; }
    p.strikes++;
    if (!p.logged.has(kind) || now - p.logged.get(kind) > 60000) { p.logged.set(kind, now); store.logCheat(p.id, kind, detail); }
    if (p.strikes > 80) { log.warn?.(`kick ${p.id} (${kind})`); p.ws.close(4003, 'cheat'); }
  }

  function onMessage(p, data) {
    const now = Date.now();
    if (now - p.msgWin > 1000) { p.msgWin = now; p.msgs = 0; }
    if (++p.msgs > 60) { if (p.msgs > 200) p.ws.close(4008, 'flood'); return; }
    if (data.length > 2048) return;
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const h = handlers[m.t];
    if (h) h(p, m, now);
  }

  const markProg = (p) => { p.progDirty = true; p.saveDirty = true; };
  function gainXp(p, key, amt) {
    const m = p.prog.mastery[key];
    if (m.lv >= MAX_LV) return;
    m.xp += amt;
    while (m.xp >= xpNeed(m.lv) && m.lv < MAX_LV) {
      m.xp -= xpNeed(m.lv); m.lv++;
      if (key === 'defense') p.hp = Math.min(maxHpFor(p.prog), p.hp + 14);
    }
    markProg(p);
  }
  function hurt(p, dmg, attacker) {
    if (p.dead || dmg <= 0) return;
    p.hp -= dmg; p.lastHurt = Date.now();
    if (attacker) p.lastAttacker = { id: attacker.id, at: p.lastHurt };
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.deadAt = Date.now();
      const k = p.lastAttacker && Date.now() - p.lastAttacker.at < 5000 && online.get(p.lastAttacker.id);
      send(p, { t: 'dead', by: k ? k.name : null });
      if (k) send(k, { t: 'kill', name: p.name });
    }
  }
  function teleport(p, x, z) {
    p.x = x; p.z = z; p.lastPos = { x, z, t: Date.now() }; p.tpAt = Date.now();
    send(p, { t: 'pos', x, z });
  }
  const enemyRec = (p, id) => { let r = p.enemies.get(id); if (!r) { r = { dmg: 0, deadUntil: 0, lastAtk: 0 }; p.enemies.set(id, r); } return r; };
  function enemyCheck(p, id, now) {
    const e = Number.isInteger(id) && ENEMY_LIST[id];
    if (!e || p.dead || p.match) return null;
    const camp = CAMPS[e.camp];
    if (Math.hypot(p.x - camp.x, p.z - camp.z) > camp.r + 34) { violation(p, 'enemy-far', { id }); return null; }
    const rec = enemyRec(p, id);
    if (rec.deadUntil > now) return null;
    return { e, t: ENEMIES[e.type], rec };
  }
  function attackWindow(p, k, now) {
    if (k === 's') return p.skill && now - p.skill.at < 900 ? p.skill : null;
    return p.swing && now - p.swing.at < 700 ? p.swing : null;
  }
  const nearNpc = (p, role) => NPCS.some(c => c.role === role && Math.hypot(p.x - c.x, p.z - c.z) < NPC_RANGE + 2.5);

  const handlers = {
    st(p, m, now) {
      if (p.dead) return;
      const x = n(m.x), z = n(m.z), r = n(m.r);
      if (Number.isNaN(x) || Number.isNaN(z)) return;
      const dt = Math.min(1, Math.max(0.05, (now - p.lastPos.t) / 1000));
      const dashing = p.skill && p.skill.style === 'sword' && now - p.skill.at < 800;
      const allowed = SPEED * 1.4 * dt + 2.5 + (dashing ? 9 : 0);
      const d = Math.hypot(x - p.lastPos.x, z - p.lastPos.z);
      let ok = d <= allowed;
      if (p.match) { const c = ARENA.center(p.match.slot); ok = ok && Math.hypot(x - c.x, z - c.z) <= ARENA.r + 1; }
      else ok = ok && Math.abs(x) <= HALF && Math.abs(z) <= HALF && !inWater(x, z);
      if (!ok && now - (p.tpAt || 0) < 1500) return;
      if (!ok) { violation(p, 'move', { d: +d.toFixed(1), allowed: +allowed.toFixed(1) }); teleport(p, p.lastPos.x, p.lastPos.z); return; }
      p.x = x; p.z = z; p.lastPos = { x, z, t: now };
      if (!Number.isNaN(r)) p.r = r;
      if (Number.isInteger(m.a) && m.a >= 0 && m.a < ANIMS.length) p.a = m.a;
    },
    sw(p, m, now) {
      if (p.dead || now < p.nextSwing - 40) return;
      const st = STYLES[p.prog.style];
      p.nextSwing = now + st.cd * 850;
      p.swing = { at: now, style: p.prog.style, hits: new Set() };
      gainXp(p, p.prog.style, 1);
    },
    sk(p, m, now) {
      const style = p.prog.style;
      if (p.dead || p.prog.mastery[style].lv < SKILL_UNLOCK || now < p.nextSkill[style] - 150) return;
      p.nextSkill[style] = now + STYLES[style].skillCd * 1000;
      p.skill = { at: now, style, hits: new Set() };
      gainXp(p, style, 3);
    },
    he(p, m, now) {
      const w = attackWindow(p, m.k, now);
      if (!w || w.hits.has(m.e)) return;
      const c = enemyCheck(p, m.e, now);
      if (!c) return;
      w.hits.add(m.e);
      const mult = m.k === 's' ? STYLES[w.style].skillMult : FINISHER;
      c.rec.dmg += dmgFor(p.prog, w.style, mult) * 1.1 * CRIT.mult;
      gainXp(p, w.style, m.k === 's' ? 2 + c.t.lv * 0.6 : c.t.lv * 0.35);
    },
    ke(p, m, now) {
      const c = enemyCheck(p, m.e, now);
      if (!c) return;
      if (c.rec.dmg < c.t.hp * 0.98) { violation(p, 'kill', { e: m.e, dmg: Math.round(c.rec.dmg), hp: c.t.hp }); return; }
      c.rec.dmg = 0; c.rec.deadUntil = now + c.t.respawn * 1000 - 800;
      const g = Math.round(rnd(c.t.gold[0], c.t.gold[1]));
      p.prog.gold += g;
      gainXp(p, p.prog.style, c.t.lv * 3 + 4);
      send(p, { t: 'loot', e: m.e, g });
    },
    ue(p, m, now) {
      if (isSafe(p.x, p.z)) return;
      const c = enemyCheck(p, m.e, now);
      if (!c || now - c.rec.lastAtk < c.t.atkCd * 700) return;
      c.rec.lastAtk = now;
      hurt(p, c.t.dmg * rnd(0.9, 1.1) * (1 - defReduceFor(p.prog)), null);
      gainXp(p, 'defense', 1 + c.t.lv * 0.4);
    },
    hp(p, m, now) {
      const t = online.get(m.id);
      const w = attackWindow(p, m.k, now);
      if (!t || t === p || !w || p.dead || t.dead || w.hits.has(`p${t.id}`)) return;
      const st = STYLES[w.style];
      const reach = (m.k === 's' ? st.skillRange : st.range) + 2.5;
      if (dist(p, t) > reach) return;
      const sameMatch = p.match && p.match === t.match && p.match.state === 'fight';
      if (!sameMatch && (p.match || t.match || isSafe(p.x, p.z) || isSafe(t.x, t.z))) return;
      w.hits.add(`p${t.id}`);
      const crit = Math.random() < CRIT.chance;
      const mult = m.k === 's' ? st.skillMult : m.k === 'f' ? FINISHER : 1;
      const dmg = dmgFor(p.prog, w.style, mult) * rnd(0.9, 1.1) * (crit ? CRIT.mult : 1) * (1 - defReduceFor(t.prog));
      const kx = Math.max(-15, Math.min(15, n(m.kx) || 0)), kz = Math.max(-15, Math.min(15, n(m.kz) || 0));
      const fx = { t: 'pvp', from: p.id, to: t.id, dmg: Math.round(dmg), crit, kx, kz };
      if (sameMatch) {
        const mt = p.match;
        mt.hp[t.id] = Math.max(0, mt.hp[t.id] - dmg);
        send(p, fx); send(t, fx);
        if (mt.hp[t.id] <= 0) endMatch(mt, p, 'ko');
      } else {
        send(p, fx); send(t, fx);
        hurt(t, dmg, p);
      }
    },
    pot(p, m, now) {
      if (p.dead || p.match || now - p.potAt < POTION_CD * 1000) return;
      const pt = POTIONS.find(x => x.id === m.id && p.prog.potions[x.id] > 0) || POTIONS.find(x => p.prog.potions[x.id] > 0);
      if (!pt) return;
      p.potAt = now; p.prog.potions[pt.id]--;
      p.hp = Math.min(maxHpFor(p.prog), p.hp + maxHpFor(p.prog) * pt.heal);
      markProg(p);
    },
    buy(p, m) {
      const list = CATALOG[m.cat], i = m.i;
      if (!list || !Number.isInteger(i) || !list[i] || p.dead) return;
      const role = Object.keys(SHOPS).find(r => SHOPS[r].includes(m.cat));
      if (!nearNpc(p, role)) { violation(p, 'shop-far'); return; }
      const it = list[i];
      if (m.cat === 'potion') {
        const qty = Number.isInteger(m.qty) ? Math.max(1, Math.min(10, m.qty)) : 1;
        if (p.prog.gold < it.price * qty || p.prog.potions[it.id] + qty > 99) return;
        p.prog.gold -= it.price * qty; p.prog.potions[it.id] += qty;
      } else {
        if (p.prog.owned[m.cat].includes(i) || p.prog.gold < it.price) return;
        p.prog.gold -= it.price; p.prog.owned[m.cat].push(i); p.prog.gear[m.cat] = i;
        if (m.cat === 'armor') p.hp = Math.min(p.hp, maxHpFor(p.prog));
      }
      markProg(p);
      send(p, { t: 'bought', cat: m.cat, i });
    },
    eq(p, m) {
      if (!['sword', 'glove', 'armor'].includes(m.cat) || !p.prog.owned[m.cat].includes(m.i) || p.match) return;
      p.prog.gear[m.cat] = m.i;
      p.hp = Math.min(p.hp, maxHpFor(p.prog));
      markProg(p);
    },
    style(p, m) { if (m.s === 'melee' || m.s === 'sword') { p.prog.style = m.s; markProg(p); } },
    cp(p, m) {
      const c = CHECKPOINTS.find(x => x.id === m.id);
      if (!c || p.dead || Math.hypot(p.x - c.x, p.z - c.z) > 5) return;
      if (!p.prog.checkpoints.includes(c.id)) p.prog.checkpoints.push(c.id);
      p.prog.checkpoint = c.id;
      markProg(p);
    },
    revive(p, m, now) {
      if (!p.dead || p.match || now - p.deadAt < 2800) return;
      const c = CHECKPOINTS.find(x => x.id === p.prog.checkpoint);
      p.dead = false; p.hp = maxHpFor(p.prog); p.enemies.forEach(r => { r.dmg = 0; });
      teleport(p, c.x, c.z);
    },
    queue(p) {
      if (p.match || p.queued || p.dead || !nearNpc(p, 'arena')) return;
      p.queued = true; p.queuedAt = Date.now(); queue.push(p);
      send(p, { t: 'queue', on: true });
      matchmake();
    },
    unqueue(p) { unqueue(p); },
  };

  function unqueue(p) { const i = queue.indexOf(p); if (i >= 0) queue.splice(i, 1); if (p.queued) { p.queued = false; send(p, { t: 'queue', on: false }); } }
  function matchmake() {
    while (queue.length >= 2) {
      const slot = slots.indexOf(null);
      if (slot < 0) return;
      const a = queue.shift(), b = queue.shift();
      a.queued = b.queued = false;
      const mt = { slot, a, b, state: 'countdown', hp: {}, max: {} };
      slots[slot] = mt;
      const ctr = ARENA.center(slot);
      for (const [p, o, side] of [[a, b, -1], [b, a, 1]]) {
        p.match = mt; p.returnTo = { x: p.x, z: p.z }; p.swing = p.skill = null;
        mt.max[p.id] = maxHpFor(p.prog); mt.hp[p.id] = mt.max[p.id];
        teleport(p, ctr.x + side * 7, ctr.z);
        send(p, { t: 'match', slot, opp: { id: o.id, name: o.name }, startIn: ARENA.countdown, duration: ARENA.duration });
      }
      mt.timers = [
        setTimeout(() => { if (mt.state === 'countdown') mt.state = 'fight'; }, ARENA.countdown),
        setTimeout(() => {
          if (mt.state !== 'fight') return;
          const ra = mt.hp[a.id] / mt.max[a.id], rb = mt.hp[b.id] / mt.max[b.id];
          endMatch(mt, Math.abs(ra - rb) < 0.001 ? null : ra > rb ? a : b, 'time');
        }, ARENA.countdown + ARENA.duration),
      ];
    }
  }
  const other = (mt, p) => (mt.a === p ? mt.b : mt.a);
  function endMatch(mt, winner, reason) {
    if (mt.state === 'done') return;
    mt.state = 'done';
    mt.timers?.forEach(clearTimeout);
    slots[mt.slot] = null;
    const ua = store.q.userById.get(mt.a.id), ub = store.q.userById.get(mt.b.id);
    const ea = 1 / (1 + 10 ** ((ub.rating - ua.rating) / 400));
    const sa = winner === mt.a ? 1 : winner === mt.b ? 0 : 0.5;
    const da = Math.round(32 * (sa - ea));
    for (const [p, u, delta, score] of [[mt.a, ua, da, sa], [mt.b, ub, -da, 1 - sa]]) {
      const rating = Math.max(0, u.rating + delta);
      const wins = u.wins + (score === 1 ? 1 : 0), losses = u.losses + (score === 0 ? 1 : 0);
      store.q.setArena.run(rating, wins, losses, u.id);
      const reward = score === 1 ? 150 : score === 0.5 ? 60 : 30;
      p.prog.gold += reward; markProg(p);
      send(p, { t: 'mend', result: score === 1 ? 'win' : score === 0 ? 'lose' : 'draw', reason, delta, rating, wins, losses, reward });
      setTimeout(() => {
        p.match = null;
        if (online.get(p.id) !== p) return;
        p.dead = false; p.hp = maxHpFor(p.prog);
        const back = p.returnTo || CHECKPOINTS[0];
        teleport(p, back.x, back.z);
      }, 3000);
    }
    matchmake();
  }

  let tick = 0;
  const loop = setInterval(() => {
    tick++;
    const now = Date.now();
    const grid = new Map();
    for (const p of online.values()) {
      if (!p.dead && !p.match) {
        const mh = maxHpFor(p.prog);
        const rate = isSafe(p.x, p.z) ? 0.2 : now - p.lastHurt > 5000 ? 0.03 : 0;
        if (rate && p.hp < mh) p.hp = Math.min(mh, p.hp + mh * rate * TICK / 1000);
        if (p.hp > mh) p.hp = mh;
      }
      const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
      (grid.get(key) || grid.set(key, []).get(key)).push(p);
    }
    for (const p of online.values()) {
      if (p.ws.readyState !== 1 || p.ws.bufferedAmount > 256 * 1024) continue;
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      const ps = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const o of grid.get(`${cx + i},${cz + j}`) || []) {
          if (o === p || Math.abs(o.x - p.x) > VIEW || Math.abs(o.z - p.z) > VIEW) continue;
          const mh = o.match ? o.match.max[o.id] : maxHpFor(o.prog);
          const hp = o.match ? o.match.hp[o.id] : o.hp;
          const e = [o.id, Math.round(o.x * 100) / 100, Math.round(o.z * 100) / 100, Math.round(o.r * 100) / 100, o.a, o.prog.style === 'sword' ? 1 : 0,
            o.prog.gear.sword, o.prog.gear.glove, o.prog.gear.armor, Math.round((hp / mh) * 100)];
          if (!p.known.has(o.id)) { e.push(o.name); p.known.add(o.id); }
          ps.push(e);
        }
      }
      const mh = p.match ? p.match.max[p.id] : maxHpFor(p.prog);
      const msg = { t: 's', me: [Math.round(p.match ? p.match.hp[p.id] : p.hp), mh, p.dead ? 1 : 0], ps };
      if (p.match) msg.m = p.match.hp;
      if (p.progDirty && tick % 2 === 0) { msg.prog = p.prog; p.progDirty = false; }
      p.ws.send(JSON.stringify(msg));
    }
  }, TICK);

  const saver = setInterval(() => save([...online.values()]), 15000);
  const heart = setInterval(() => {
    for (const p of online.values()) {
      if (!p.ws.isAlive) { p.ws.terminate(); continue; }
      p.ws.isAlive = false; p.ws.ping();
    }
  }, 20000);

  return {
    attach,
    get size() { return online.size; },
    rename(id, name) {
      const p = online.get(id);
      if (p) p.name = name;
      for (const o of online.values()) o.known.delete(id);
    },
    shutdown() {
      clearInterval(loop); clearInterval(saver); clearInterval(heart);
      save([...online.values()]);
      for (const p of online.values()) p.ws.close(1001, 'restart');
    },
  };
}
