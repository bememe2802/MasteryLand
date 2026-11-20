import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { defaultProgress, MAX_LV, MASTERY_MAX, STAT_KEYS, POINTS_PER_LV, cleanAvatar, CHECKPOINTS, ITEMS, GEAR_SLOTS, POWER_BY_ID, QUEST_BY_ID, QUEST_MAX } from '../shared/rules.js';

export function openDb(root) {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const db = new Database(path.join(root, 'data', 'game.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sub TEXT UNIQUE NOT NULL,
      email TEXT,
      name TEXT UNIQUE COLLATE NOCASE,
      progress TEXT,
      rating INTEGER NOT NULL DEFAULT 1000,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      banned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS cheat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      detail TEXT,
      at INTEGER NOT NULL
    );
  `);
  // named = the player picked their own name (new accounts start with "Dũng sĩ <id>").
  // Accounts from before this column count as named, so nobody already playing is asked again.
  if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'named'").get()) {
    db.exec('ALTER TABLE users ADD COLUMN named INTEGER NOT NULL DEFAULT 0; UPDATE users SET named = 1;');
  }
  const q = {
    userBySub: db.prepare('SELECT * FROM users WHERE sub = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByName: db.prepare('SELECT id FROM users WHERE name = ?'),
    insertUser: db.prepare('INSERT INTO users (sub, email, created_at, progress) VALUES (?, ?, ?, ?)'),
    setName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
    setChosenName: db.prepare('UPDATE users SET name = ?, named = 1 WHERE id = ?'),
    setEmail: db.prepare('UPDATE users SET email = ? WHERE id = ?'),
    setProgress: db.prepare('UPDATE users SET progress = ? WHERE id = ?'),
    setArena: db.prepare('UPDATE users SET rating = ?, wins = ?, losses = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?'),
    dropSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    logCheat: db.prepare('INSERT INTO cheat_log (user_id, kind, detail, at) VALUES (?, ?, ?, ?)'),
  };
  q.purgeSessions.run(Date.now());

  const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const api = {
    db, q,
    createSession(userId, days = 30) {
      const token = crypto.randomBytes(32).toString('base64url');
      q.insertSession.run(hash(token), userId, Date.now() + days * 864e5);
      return token;
    },
    userFromToken(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const s = q.session.get(hash(token), Date.now());
      const u = s && q.userById.get(s.user_id);
      return u && !u.banned ? u : null;
    },
    dropSession(token) { if (token) q.dropSession.run(hash(token)); },
    findOrCreateUser(sub, email) {
      const u = q.userBySub.get(sub);
      if (u) { if (email && u.email !== email) q.setEmail.run(email, u.id); return q.userById.get(u.id); }
      return db.transaction(() => {
        const { lastInsertRowid: id } = q.insertUser.run(sub, email || null, Date.now(), JSON.stringify(defaultProgress()));
        let name = `Dũng sĩ ${id}`;
        for (let i = 2; q.userByName.get(name); i++) name = `Dũng sĩ ${id}-${i}`;
        q.setName.run(name, id);
        return q.userById.get(id);
      })();
    },
    loadProgress(u) { return repairProgress(safeJson(u.progress)); },
    saveMany: db.transaction((rows) => { for (const [id, p] of rows) q.setProgress.run(JSON.stringify(p), id); }),
    logCheat(userId, kind, detail) { q.logCheat.run(userId, kind, detail ? JSON.stringify(detail).slice(0, 500) : null, Date.now()); },
  };
  return api;
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
// Saves from before the item system kept gear as list indices; these map them to item ids.
const OLD_GEAR = {
  sword: ['sw_wood', 'sw_iron', 'sw_blue', 'sw_dragon'],
  glove: [null, 'gl_leather', 'gl_iron', 'gl_fire'],
  armor: ['sh_tee', 'sh_leather', 'sh_chain', 'sh_gold'],
};
function repairProgress(raw) {
  const d = defaultProgress();
  const p = raw && typeof raw === 'object' ? raw : {};
  for (const k of ['melee', 'sword']) {
    const m = p.mastery?.[k] || {};
    d.mastery[k] = { lv: Math.floor(num(m.lv, 1, MASTERY_MAX, 1)), xp: num(m.xp, 0, 1e9, 0) };
  }
  if (Number.isFinite(p.level)) {
    d.level = Math.floor(num(p.level, 1, MAX_LV, 1)); d.xp = num(p.xp, 0, 1e12, 0);
    let budget = POINTS_PER_LV * (d.level - 1);
    for (const k of STAT_KEYS) { d.stats[k] = Math.min(budget, Math.floor(num(p.stats?.[k], 0, MAX_LV, 0))); budget -= d.stats[k]; }
  } else {
    // Save from before levels: the old per-style mastery becomes a character level, points unspent.
    const best = Math.max(1, ...['melee', 'sword', 'defense'].map(k => num(p.mastery?.[k]?.lv, 1, 300, 1)), num(p.power?.lv, 1, 300, 1));
    d.level = Math.max(1, Math.min(MAX_LV, Math.floor(best * 0.6)));
  }
  d.avatar = cleanAvatar(p.avatar);
  d.gold = Math.floor(num(p.gold, 0, 1e12, 0));
  d.gems = Math.floor(num(p.gems, 0, 1e9, 0));
  if (p.inv && typeof p.inv === 'object') {
    for (const [id, c] of Object.entries(p.inv)) if (ITEMS[id]) { const n = Math.floor(num(c, 0, 9999, 0)); if (n > 0) d.inv[id] = n; }
  } else {
    // Old save: owned lists, gear indices and a potion count.
    for (const [k, ids] of Object.entries(OLD_GEAR)) {
      for (const i of Array.isArray(p.owned?.[k]) ? p.owned[k] : []) if (ids[i]) d.inv[ids[i]] = 1;
      const slot = k === 'armor' ? 'shirt' : k;
      if (Number.isInteger(p.gear?.[k]) && ids[p.gear[k]] !== undefined) d.gear[slot] = ids[p.gear[k]];
    }
    if (p.potions) { d.inv.pot_s = Math.floor(num(p.potions.small, 0, 999, 0)); d.inv.pot_l = Math.floor(num(p.potions.big, 0, 999, 0)); }
  }
  d.inv.sw_wood ||= 1; d.inv.sh_tee ||= 1;
  for (const s of GEAR_SLOTS) {
    const id = p.inv ? p.gear?.[s] : d.gear[s];
    d.gear[s] = typeof id === 'string' && ITEMS[id]?.slot === s && d.inv[id] > 0 ? id : s === 'sword' ? 'sw_wood' : s === 'shirt' ? 'sh_tee' : null;
  }
  for (const [id, c] of Object.entries(d.inv)) if (!c) delete d.inv[id];
  const pw = p.power;
  d.power = pw && POWER_BY_ID[pw.id] ? { id: pw.id, lv: Math.floor(num(pw.lv, 1, MASTERY_MAX, 1)), xp: num(pw.xp, 0, 1e9, 0) } : null;
  d.style = p.style === 'sword' ? 'sword' : p.style === 'power' && d.power ? 'power' : 'melee';
  for (const [id, n] of Object.entries(p.quests || {})) {
    if (QUEST_BY_ID[id] && Object.keys(d.quests).length < QUEST_MAX) d.quests[id] = Math.floor(num(n, 0, QUEST_BY_ID[id].count, 0));
  }
  const ids = CHECKPOINTS.map(c => c.id);
  d.checkpoints = [...new Set(['village', ...(Array.isArray(p.checkpoints) ? p.checkpoints.filter(c => ids.includes(c)) : [])])];
  d.checkpoint = d.checkpoints.includes(p.checkpoint) ? p.checkpoint : 'village';
  return d;
}
