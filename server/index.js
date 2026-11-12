import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import { OAuth2Client } from 'google-auth-library';
import { openDb } from './db.js';
import { createGame } from './game.js';
import { NAME_RE, cleanName } from '../public/shared.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { }
const PORT = Number(process.env.PORT) || 5173;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DEV_LOGIN = process.env.DEV_LOGIN === '1';
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 500;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const WS_PER_IP = Number(process.env.WS_PER_IP) || 8;
const API_PER_MIN = Number(process.env.API_PER_MIN) || 120;
const AUTH_PER_MIN = Number(process.env.AUTH_PER_MIN) || 20;

const store = openDb(ROOT);
const game = createGame({ store, maxPlayers: MAX_PLAYERS });
const google = new OAuth2Client(CLIENT_ID);

function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = req.ip, now = Date.now();
    const v = hits.get(k);
    if (!v || now - v.t > windowMs) { hits.set(k, { t: now, n: 1 }); return next(); }
    if (++v.n > max) return res.status(429).json({ error: 'Thao tác quá nhanh, thử lại sau' });
    next();
  };
}

const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const inlineHashes = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' ${inlineHashes} https://cdn.jsdelivr.net https://accounts.google.com/gsi/client`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "connect-src 'self' blob: data: ws: wss: https://cdn.jsdelivr.net https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', 1);
app.use(compression());
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use('/api', express.json({ limit: '8kb' }), limiter(API_PER_MIN, 60000));

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');
const auth = (req, res, next) => {
  const u = store.userFromToken(bearer(req));
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  req.user = u; next();
};
const publicUser = (u) => ({ id: u.id, name: u.name, rating: u.rating, wins: u.wins, losses: u.losses });

app.get('/api/config', (req, res) => res.json({ googleClientId: CLIENT_ID, devLogin: DEV_LOGIN }));
app.get('/api/health', (req, res) => res.json({ ok: true, online: game.size, max: MAX_PLAYERS }));
const authLimit = limiter(AUTH_PER_MIN, 60000);
app.post('/api/auth/google', authLimit, async (req, res) => {
  if (!CLIENT_ID) return res.status(503).json({ error: 'Máy chủ chưa cấu hình Google Client ID' });
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length > 4096) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
  try {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || p.email_verified === false) throw new Error('unverified');
    const u = store.findOrCreateUser(`google:${p.sub}`, p.email);
    if (u.banned) return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
    res.json({ token: store.createSession(u.id), user: publicUser(u) });
  } catch {
    res.status(401).json({ error: 'Đăng nhập Google không hợp lệ' });
  }
});
if (DEV_LOGIN) {
  app.post('/api/auth/dev', authLimit, (req, res) => {
    const tag = String(req.body?.tag || 'dev').replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'dev';
    const u = store.findOrCreateUser(`dev:${tag}`, null);
    res.json({ token: store.createSession(u.id), user: publicUser(u) });
  });
}
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/me/name', limiter(10, 60000), auth, (req, res) => {
  const name = cleanName(req.body?.name);
  if (!NAME_RE.test(name)) return res.status(400).json({ error: 'Tên 2–16 ký tự, chỉ gồm chữ, số, khoảng trắng' });
  const taken = store.q.userByName.get(name);
  if (taken && taken.id !== req.user.id) return res.status(409).json({ error: 'Tên đã có người dùng' });
  store.q.setName.run(name, req.user.id);
  game.rename(req.user.id, name);
  res.json({ user: publicUser(store.q.userById.get(req.user.id)) });
});
app.post('/api/logout', (req, res) => { store.dropSession(bearer(req)); res.json({ ok: true }); });

app.use('/assets', express.static(path.join(ROOT, 'public', 'assets'), { maxAge: '7d' }));
app.use(express.static(path.join(ROOT, 'public'), { setHeaders: (r) => r.setHeader('Cache-Control', 'no-cache') }));

const server = http.createServer(app);
server.headersTimeout = 15000;
server.requestTimeout = 30000;
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const wsPerIp = new Map();

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  const sameOrigin = origin === `http://${host}` || origin === `https://${host}`;
  if (url.pathname !== '/ws' || !(sameOrigin || ORIGINS.includes(origin))) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  const ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
  if ((wsPerIp.get(ip) || 0) >= WS_PER_IP) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wsPerIp.set(ip, (wsPerIp.get(ip) || 0) + 1);
    ws.on('close', () => { const c = (wsPerIp.get(ip) || 1) - 1; if (c <= 0) wsPerIp.delete(ip); else wsPerIp.set(ip, c); });
    game.attach(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Mastery Land: http://localhost:${PORT}`);
  if (!CLIENT_ID) console.log('GOOGLE_CLIENT_ID chưa đặt — đăng nhập Google đang tắt.');
  if (DEV_LOGIN) console.log('DEV_LOGIN=1 — đăng nhập thử đang bật, KHÔNG dùng khi chạy thật.');
});

function shutdown() {
  console.log('Đang lưu dữ liệu và tắt máy chủ…');
  game.shutdown();
  server.close(() => { store.db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
