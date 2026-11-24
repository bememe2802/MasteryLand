import {
  HALF, inWater, isSafe, CAMPS, ENEMIES, ENEMY_LIST, NPCS, NPC_RANGE, CHECKPOINTS, ARENA, STYLES, FINISHER, CRIT,
  MAX_LV, MASTERY_MAX, STAT_KEYS, ITEMS, SELL_AT, GEAR_SLOTS, POTION_CD, ANIMS, POWERS, PURGE_COST,
  DROPS, bossGems, QUEST_BY_ID, QUEST_MAX, BOARD_OFF, xpNeed, masteryNeed, killXp, pointsLeft, resetCost, maxHpFor, defReduceFor, dmgFor, critFor,
  speedFor, masteryOf, styleOk, shrineStock, movesOf, unlockOf, aimKind, moveReach, moveHits, moveWindow, cleanAvatar, avatarCode, CHESTS, CHEST_CD,
} from '../shared/rules.js';

const VIEW = 60;
// Players appear just beside a checkpoint crystal, not inside its pillar.
const SPAWN_OFF = 2.4;
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
      x: cp.x, z: cp.z + SPAWN_OFF, r: 0, a: 0, lastPos: { x: cp.x, z: cp.z + SPAWN_OFF, t: now }, hp: maxHpFor(prog), dead: false, deadAt: 0, lastHurt: 0,
      swing: null, pcast: null, nextSwing: 0, nextMv: { melee: [0, 0], sword: [0, 0], power: [0, 0, 0, 0] }, potAt: 0, boostUntil: 0, boost: 0, shieldUntil: 0, shieldRed: 0,
      enemies: new Map(), known: new Set(), lastAttacker: null, match: null, queued: false, returnTo: null,
      msgs: 0, msgWin: now, strikes: 0, strikeWin: now, logged: new Map(), lookVer: 1, seenLook: new Map(),
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
  /** Character experience: levels give stat points (spent with 'stat'). */
  function gainXp(p, amt) {
    const g = p.prog;
    if (g.level >= MAX_LV) return;
    g.xp += amt;
    while (g.xp >= xpNeed(g.level) && g.level < MAX_LV) { g.xp -= xpNeed(g.level); g.level++; p.hp = maxHpFor(g); }
    markProg(p);
  }
  /** Mastery of a fighting style, from using it: opens its moves. */
  function gainMastery(p, key, amt) {
    const m = masteryOf(p.prog, key);
    if (!m || m.lv >= MASTERY_MAX) return;
    m.xp += amt;
    while (m.xp >= masteryNeed(m.lv) && m.lv < MASTERY_MAX) { m.xp -= masteryNeed(m.lv); m.lv++; }
    markProg(p);
  }
  const shielded = (p, dmg) => (Date.now() < p.shieldUntil ? dmg * (1 - p.shieldRed) : dmg);
  function hurt(p, dmg, attacker) {
    if (p.dead || dmg <= 0) return;
    dmg = shielded(p, dmg);
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
    if (k === 'p') return p.pcast && now - p.pcast.at < moveWindow(p.pcast.mv) * 1000 ? p.pcast : null;
    return p.swing && now - p.swing.at < 700 ? p.swing : null;
  }
  // Facing the client claimed when it pressed attack; falls back to the last reported facing.
  const aimOf = (p, m) => { const r = n(m.r); return Number.isNaN(r) ? p.r || 0 : r; };
  // Is t inside the swing cone from (ox, oz)? Extra slack covers ~150ms of movement on both sides.
  function inCone(ox, oz, rot, t, halfArc) {
    const dx = t.x - ox, dz = t.z - oz, d = Math.hypot(dx, dz);
    if (d < 1.5) return true;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * Math.sin(rot) + dz * Math.cos(rot)) / d)));
    return ang <= halfArc + 0.5 + Math.min(0.6, 1.2 / d);
  }
  /** Count one more hit of this attack on this target, if the attack allows another. */
  function takeHit(w, key) {
    const n = w.hits instanceof Map ? w.hits.get(key) || 0 : w.hits.has(key) ? 1 : 0;
    if (n >= (w.mv ? moveHits(w.mv) : 1)) return false;
    if (w.hits instanceof Map) w.hits.set(key, n + 1); else w.hits.add(key);
    return true;
  }
  /** Could this power cast have reached target t? Positions lag, so the checks are generous. */
  function powerReaches(w, t, p) {
    const mv = w.mv, slack = 2.5;
    const tx = w.x + Math.sin(w.r) * w.d, tz = w.z + Math.cos(w.r) * w.d;
    if (mv.k === 'nova' || mv.k === 'shield') return Math.hypot(t.x - w.x, t.z - w.z) <= (mv.radius || 0) + slack;
    if (mv.k === 'aura') return Math.hypot(t.x - p.x, t.z - p.z) <= mv.radius + slack;
    if (mv.k === 'zone' || mv.k === 'meteor') return Math.hypot(t.x - tx, t.z - tz) <= mv.radius + slack;
    if (mv.k === 'leap' || mv.k === 'blink') return Math.hypot(t.x - tx, t.z - tz) <= mv.radius + slack + 2;
    if (Math.hypot(t.x - w.x, t.z - w.z) > moveReach(mv) + slack) return false;
    if (mv.k === 'chain') return true;
    const half = mv.k === 'cone' ? mv.arc / 2 : mv.k === 'bolt' ? (mv.spread || 0) * ((mv.count || 1) - 1) / 2 + 0.2 : 0.25;
    return inCone(w.x, w.z, w.r, t, half);
  }
  function addItem(p, id, n) {
    if (!ITEMS[id]) return false;
    p.prog.inv[id] = Math.min(9999, (p.prog.inv[id] || 0) + n);
    return true;
  }
  function takeItem(p, id, n) {
    p.prog.inv[id] = (p.prog.inv[id] || 0) - n;
    if (p.prog.inv[id] <= 0) delete p.prog.inv[id];
  }
  function equip(p, slot, id) {
    p.prog.gear[slot] = id;
    p.hp = Math.min(p.hp, maxHpFor(p.prog));
    p.lookVer++;
  }
  /** Send to every player close enough to see p (power effects). */
  function relay(p, msg) {
    const data = JSON.stringify(msg);
    for (const o of online.values()) if (o !== p && o.ws.readyState === 1 && Math.abs(o.x - p.x) < VIEW && Math.abs(o.z - p.z) < VIEW) o.ws.send(data);
  }
  const nearBoard = (p, id) => { const c = CHECKPOINTS.find(x => x.id === id); return c && Math.hypot(p.x - c.x - BOARD_OFF.x, p.z - c.z - BOARD_OFF.z) < NPC_RANGE + 2.5; };
  const nearNpc = (p, role) => NPCS.some(c => c.role === role && Math.hypot(p.x - c.x, p.z - c.z) < NPC_RANGE + 2.5);

  const handlers = {
    st(p, m, now) {
      if (p.dead) return;
      const x = n(m.x), z = n(m.z), r = n(m.r);
      if (Number.isNaN(x) || Number.isNaN(z)) return;
      const dt = Math.min(1, Math.max(0.05, (now - p.lastPos.t) / 1000));
      const allowed = speedFor(p.prog) * 1.4 * dt + 2.5 + (now < p.boostUntil ? p.boost : 0);
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
      if (p.dead || now < p.nextSwing - 40 || !styleOk(p.prog, p.prog.style)) return;
      const st = STYLES[p.prog.style];
      p.nextSwing = now + st.cd * 850;
      p.swing = { at: now, style: p.prog.style, hits: new Set(), r: aimOf(p, m), x: p.x, z: p.z };
      gainMastery(p, p.prog.style, 1);
    },
    he(p, m, now) {
      const w = attackWindow(p, m.k, now);
      if (!w || !takeHit(w, m.e)) return;
      const c = enemyCheck(p, m.e, now);
      if (!c) return;
      // Credit the most this hit could have dealt (crit, and burn ticking after it); a kill needs the sum to cover the HP.
      const mult = m.k === 'p' ? w.mv.mult * (w.mv.fx === 'burn' ? 1.45 : 1) : FINISHER;
      c.rec.dmg += dmgFor(p.prog, w.style, mult) * 1.1 * CRIT.mult;
      gainMastery(p, w.style, m.k === 'p' ? (2 + c.t.lv * 0.3) / moveHits(w.mv) : 0.5 + c.t.lv * 0.15);
    },
    ke(p, m, now) {
      const c = enemyCheck(p, m.e, now);
      if (!c) return;
      if (c.rec.dmg < c.t.hp * 0.98) { violation(p, 'kill', { e: m.e, dmg: Math.round(c.rec.dmg), hp: c.t.hp }); return; }
      c.rec.dmg = 0; c.rec.deadUntil = now + c.t.respawn * 1000 - 800;
      const g = Math.round(rnd(c.t.gold[0], c.t.gold[1]));
      p.prog.gold += g;
      const items = [];
      for (const [id, chance] of DROPS[c.e.type] || []) {
        if (Math.random() >= chance) continue;
        const got = id === 'power' ? `pw_${POWERS[Math.floor(Math.random() * POWERS.length)].id}` : id;
        if (addItem(p, got, 1)) items.push(got);
      }
      const gems = c.t.boss ? bossGems(c.t) : 0;
      for (const [qid, n] of Object.entries(p.prog.quests)) {
        const q = QUEST_BY_ID[qid];
        if (q.type === c.e.type && n < q.count) p.prog.quests[qid] = n + 1;
      }
      p.prog.gems += gems;
      const xp = killXp(c.t, p.prog.level);
      gainXp(p, xp);
      gainMastery(p, p.prog.style, 2 + c.t.lv * 0.4);
      send(p, { t: 'loot', e: m.e, g, items, gems, xp });
    },
    ue(p, m, now) {
      if (isSafe(p.x, p.z)) return;
      const c = enemyCheck(p, m.e, now);
      if (!c || now - c.rec.lastAtk < c.t.atkCd * 700) return;
      c.rec.lastAtk = now;
      hurt(p, c.t.dmg * rnd(0.9, 1.1) * (1 - defReduceFor(p.prog)), null);
    },
    hp(p, m, now) {
      const t = online.get(m.id);
      const w = attackWindow(p, m.k, now);
      if (!t || t === p || !w || p.dead || t.dead) return;
      const st = STYLES[w.style];
      const sameMatch = p.match && p.match === t.match && p.match.state === 'fight';
      if (!sameMatch && (p.match || t.match || isSafe(p.x, p.z) || isSafe(t.x, t.z))) return;
      if (m.k === 'p') { if (!powerReaches(w, t, p)) return; }
      else if (dist(p, t) > st.range + 2.5 || !inCone(p.x, p.z, w.r, t, st.arc / 2)) return;
      if (!takeHit(w, `p${t.id}`)) return;
      const crit = Math.random() < critFor(p.prog);
      const mult = m.k === 'p' ? w.mv.mult : m.k === 'f' ? FINISHER : 1;
      const dmg = dmgFor(p.prog, w.style, mult) * rnd(0.9, 1.1) * (crit ? CRIT.mult : 1) * (1 - defReduceFor(t.prog));
      const kx = Math.max(-15, Math.min(15, n(m.kx) || 0)), kz = Math.max(-15, Math.min(15, n(m.kz) || 0));
      const fx = { t: 'pvp', from: p.id, to: t.id, dmg: Math.round(dmg), crit, kx, kz };
      if (sameMatch) {
        const mt = p.match;
        mt.hp[t.id] = Math.max(0, mt.hp[t.id] - shielded(t, dmg));
        send(p, fx); send(t, fx);
        if (mt.hp[t.id] <= 0) endMatch(mt, p, 'ko');
      } else {
        send(p, fx); send(t, fx);
        hurt(t, dmg, p);
      }
    },
    pot(p, m, now) {
      if (p.dead || p.match || now - p.potAt < POTION_CD * 1000) return;
      const inv = p.prog.inv;
      const id = m.id === 'pot_l' && inv.pot_l > 0 ? 'pot_l' : inv.pot_s > 0 ? 'pot_s' : inv.pot_l > 0 ? 'pot_l' : null;
      if (!id) return;
      p.potAt = now; takeItem(p, id, 1);
      p.hp = Math.min(maxHpFor(p.prog), p.hp + maxHpFor(p.prog) * ITEMS[id].heal);
      markProg(p);
    },
    // A move of the current style: m = move index, r = aim direction, d = distance for moves aimed at a spot.
    pw(p, m, now) {
      const style = p.prog.style, i = m.m, moves = movesOf(p.prog, style);
      if (p.dead || !styleOk(p.prog, style) || !Number.isInteger(i) || i < 0 || i >= moves.length) return;
      if (masteryOf(p.prog, style).lv < unlockOf(style)[i] || now < p.nextMv[style][i] - 150) return;
      if (p.match && p.match.state !== 'fight') return;
      const mv = moves[i];
      p.nextMv[style][i] = now + mv.cd * 1000;
      const d = aimKind(mv) === 'point' ? Math.max(0, Math.min(mv.range, n(m.d) || 0)) : 0;
      p.pcast = { at: now, style, mv, hits: new Map(), r: aimOf(p, m), d, x: p.x, z: p.z };
      if (mv.k === 'dash' || mv.k === 'leap' || mv.k === 'blink') { p.boostUntil = now + 1200; p.boost = (mv.k === 'dash' ? mv.range : d) + 2; }
      if (mv.k === 'shield') { p.shieldUntil = now + mv.dur * 1000; p.shieldRed = mv.red; }
      if (mv.heal && !p.match) p.hp = Math.min(maxHpFor(p.prog), p.hp + maxHpFor(p.prog) * mv.heal);
      gainMastery(p, style, 2);
      relay(p, { t: 'fx', id: p.id, s: style, p: p.prog.power?.id, m: i, r: p.pcast.r, d, x: p.x, z: p.z });
    },
    // Spend stat points: k = stat, n = how many.
    stat(p, m) {
      const want = Number.isInteger(m.n) ? Math.max(1, Math.min(100, m.n)) : 1;
      if (!STAT_KEYS.includes(m.k)) return;
      const add = Math.min(want, pointsLeft(p.prog), MAX_LV - p.prog.stats[m.k]);
      if (add <= 0) return;
      p.prog.stats[m.k] += add;
      if (m.k === 'defense') p.hp += add * 12;
      markProg(p);
    },
    // Take every point back, for gold, in a safe place.
    sreset(p) {
      const cost = resetCost(p.prog.level);
      if (p.dead || p.match || p.prog.gold < cost || !isSafe(p.x, p.z)) return;
      p.prog.gold -= cost;
      for (const k of STAT_KEYS) p.prog.stats[k] = 0;
      p.hp = Math.min(p.hp, maxHpFor(p.prog));
      markProg(p);
    },
    // A treasure chest: open when standing at it, once per CHEST_CD for each player.
    chest(p, m, now) {
      const c = Number.isInteger(m.id) && CHESTS[m.id];
      if (!c || p.dead || p.match || Math.hypot(p.x - c.x, p.z - c.z) > 4.5) return;
      if (now - (p.prog.chests[c.id] || 0) < CHEST_CD) return;
      p.prog.chests[c.id] = now;
      const gems = Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 3) : 0;
      const item = Math.random() < 0.4 ? (c.region === 'core' ? 'pot_s' : 'pot_l') : null;
      if (item) addItem(p, item, 1);
      p.prog.gold += c.gold; p.prog.gems += gems;
      gainXp(p, c.xp);
      markProg(p);
      send(p, { t: 'chest', id: c.id, g: c.gold, xp: c.xp, gems, item });
    },
    // Looks from the character creator.
    avatar(p, m) {
      const a = cleanAvatar(m.a);
      if (!a || p.match) return;
      p.prog.avatar = a; p.lookVer++;
      markProg(p);
    },
    buy(p, m) {
      const it = typeof m.id === 'string' && ITEMS[m.id];
      if (!it || !it.shop || p.dead) return;
      if (!nearNpc(p, it.shop)) { violation(p, 'shop-far'); return; }
      if (it.slot === 'power' && !shrineStock(Date.now()).ids.includes(it.power)) return;
      const stack = it.slot === 'potion' || it.slot === 'power';
      const qty = it.slot === 'potion' && Number.isInteger(m.qty) ? Math.max(1, Math.min(10, m.qty)) : 1;
      if (!stack && p.prog.inv[it.id]) return;
      const wallet = it.gems ? 'gems' : 'gold';
      const cost = (it.gems || it.price || 0) * qty;
      if (p.prog[wallet] < cost || (p.prog.inv[it.id] || 0) + qty > 99) return;
      p.prog[wallet] -= cost; addItem(p, it.id, qty);
      if (GEAR_SLOTS.includes(it.slot)) equip(p, it.slot, it.id);
      markProg(p);
      send(p, { t: 'bought', id: it.id, qty });
    },
    sell(p, m) {
      const it = typeof m.id === 'string' && ITEMS[m.id];
      if (!it || !it.sell || p.dead || !SELL_AT.some(r => nearNpc(p, r))) return;
      const qty = Number.isInteger(m.qty) ? Math.max(1, Math.min(99, m.qty)) : 1;
      const worn = p.prog.gear[it.slot] === it.id ? 1 : 0;
      if ((p.prog.inv[it.id] || 0) - worn < qty) return;
      takeItem(p, it.id, qty); p.prog.gold += it.sell * qty;
      markProg(p);
      send(p, { t: 'sold', id: it.id, qty, g: it.sell * qty });
    },
    eq(p, m) {
      if (p.match || !GEAR_SLOTS.includes(m.slot)) return;
      if (m.id === null) { if (m.slot !== 'sword' && m.slot !== 'shirt') equip(p, m.slot, null); }
      else if (ITEMS[m.id]?.slot === m.slot && p.prog.inv[m.id] > 0) equip(p, m.slot, m.id);
      markProg(p);
    },
    // Using a power item grants the power; only when the player has none.
    use(p, m) {
      const it = typeof m.id === 'string' && ITEMS[m.id];
      if (!it || it.slot !== 'power' || p.dead || p.match || p.prog.power || !(p.prog.inv[it.id] > 0)) return;
      takeItem(p, it.id, 1);
      p.prog.power = { id: it.power, lv: 1, xp: 0 };
      p.prog.style = 'power'; p.nextMv.power = [0, 0, 0, 0];
      markProg(p); p.lookVer++;
      send(p, { t: 'power', id: it.power });
    },
    purge(p) {
      if (!p.prog.power || p.dead || p.match || !nearNpc(p, 'purge') || p.prog.gold < PURGE_COST) return;
      p.prog.gold -= PURGE_COST; p.prog.power = null;
      if (p.prog.style === 'power') p.prog.style = 'melee';
      markProg(p); p.lookVer++;
      send(p, { t: 'purged' });
    },
    // Kill quests: accept, hand in and drop, only while standing at the quest's board.
    qaccept(p, m) {
      const q = QUEST_BY_ID[m.id];
      if (!q || p.dead || !nearBoard(p, q.board) || q.id in p.prog.quests || Object.keys(p.prog.quests).length >= QUEST_MAX) return;
      p.prog.quests[q.id] = 0; markProg(p);
    },
    qclaim(p, m) {
      const q = QUEST_BY_ID[m.id];
      if (!q || p.dead || !nearBoard(p, q.board) || !(p.prog.quests[q.id] >= q.count)) return;
      delete p.prog.quests[q.id];
      p.prog.gold += q.gold; p.prog.gems += q.gems;
      gainXp(p, q.xp);
      markProg(p);
      send(p, { t: 'qdone', id: q.id });
    },
    qdrop(p, m) { if (m.id in p.prog.quests) { delete p.prog.quests[m.id]; markProg(p); } },
    style(p, m) { if (['melee', 'sword', 'power'].includes(m.s) && styleOk(p.prog, m.s)) { p.prog.style = m.s; markProg(p); p.lookVer++; } },
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
      teleport(p, c.x, c.z + SPAWN_OFF);
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
        p.match = mt; p.returnTo = { x: p.x, z: p.z }; p.swing = p.pcast = null;
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
      p.prog.gold += reward; if (score === 1) p.prog.gems += 2;
      markProg(p);
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
      const ps = [], seen = new Set();
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const o of grid.get(`${cx + i},${cz + j}`) || []) {
          if (o === p || Math.abs(o.x - p.x) > VIEW || Math.abs(o.z - p.z) > VIEW) continue;
          const mh = o.match ? o.match.max[o.id] : maxHpFor(o.prog);
          const hp = o.match ? o.match.hp[o.id] : o.hp;
          // [id, x, z, r, anim, hp%, look | 0, name?]: look and name only when this viewer lacks them
          // (first time in view, or after leaving and coming back, when the client has dropped them).
          const e = [o.id, Math.round(o.x * 100) / 100, Math.round(o.z * 100) / 100, Math.round(o.r * 100) / 100, o.a, Math.round((hp / mh) * 100)];
          const fresh = !p.known.has(o.id);
          if (fresh || p.seenLook.get(o.id) !== o.lookVer) {
            const g = o.prog.gear;
            e.push([o.prog.style, g.sword, g.glove, g.shirt, g.hat, g.acc, o.prog.power?.id, avatarCode(o.prog.avatar)].map(v => v || '').join('|'));
            p.seenLook.set(o.id, o.lookVer);
          } else e.push(0);
          if (fresh) e.push(o.name);
          seen.add(o.id);
          ps.push(e);
        }
      }
      p.known = seen;
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
      for (const o of online.values()) { o.known.delete(id); o.seenLook.delete(id); }
    },
    shutdown() {
      clearInterval(loop); clearInterval(saver); clearInterval(heart);
      save([...online.values()]);
      for (const p of online.values()) p.ws.close(1001, 'restart');
    },
  };
}
