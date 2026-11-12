import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { defaultProgress, MAX_LV, POTIONS, CHECKPOINTS, CATALOG } from '../shared/rules.js';

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
  const q = {
    userBySub: db.prepare('SELECT * FROM users WHERE sub = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByName: db.prepare('SELECT id FROM users WHERE name = ?'),
    insertUser: db.prepare('INSERT INTO users (sub, email, created_at, progress) VALUES (?, ?, ?, ?)'),
    setName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
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
function repairProgress(raw) {
  const d = defaultProgress();
  const p = raw && typeof raw === 'object' ? raw : {};
  for (const k of ['melee', 'sword', 'defense']) {
    const m = p.mastery?.[k] || {};
    d.mastery[k] = { lv: Math.floor(num(m.lv, 1, MAX_LV, 1)), xp: num(m.xp, 0, 1e9, 0) };
  }
  d.gold = Math.floor(num(p.gold, 0, 1e12, 0));
  d.style = p.style === 'sword' ? 'sword' : 'melee';
  for (const k of ['sword', 'glove', 'armor']) {
    const list = CATALOG[k];
    const owned = Array.isArray(p.owned?.[k]) ? p.owned[k].filter(i => Number.isInteger(i) && i >= 0 && i < list.length) : [];
    d.owned[k] = [...new Set([0, ...owned])].sort((a, b) => a - b);
    d.gear[k] = d.owned[k].includes(p.gear?.[k]) ? p.gear[k] : 0;
  }
  for (const pt of POTIONS) d.potions[pt.id] = Math.floor(num(p.potions?.[pt.id], 0, 999, 0));
  const ids = CHECKPOINTS.map(c => c.id);
  d.checkpoints = [...new Set(['village', ...(Array.isArray(p.checkpoints) ? p.checkpoints.filter(c => ids.includes(c)) : [])])];
  d.checkpoint = d.checkpoints.includes(p.checkpoint) ? p.checkpoint : 'village';
  return d;
}
