const DEV_TAG = new URLSearchParams(location.search).get('dev');
const TOKEN_KEY = DEV_TAG ? `ml-token:${DEV_TAG}` : 'ml-token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { } };
const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { } };

export async function api(path, body) {
  const t = getToken();
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Lỗi máy chủ'), { status: r.status });
  return j;
}

import { ui } from '../ui/state.js';

const waitFor = (fn, ms = 8000) => new Promise((res, rej) => {
  const t0 = Date.now();
  (function tick() { const v = fn(); if (v) res(v); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else setTimeout(tick, 80); })();
});

/** What the login screen calls: draw Google's button into an element, or use the dev login. */
export const loginHooks = { renderGoogle: (el) => {}, dev: () => {}, submitName: async (name) => {} };

/**
 * Guest play: each device keeps one random 20-character tag, so every player gets an account of
 * their own that nobody else can guess. Clearing the browser's data starts a new account.
 */
function guestTag() {
  const KEY = 'arenix.guest';
  try {
    let t = localStorage.getItem(KEY);
    if (!/^[a-z0-9]{20}$/.test(t || '')) {
      const b = crypto.getRandomValues(new Uint8Array(20));
      t = Array.from(b, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch { return 'g' + Math.random().toString(36).slice(2, 21); }
}

/**
 * New players pick a name once, right after their first sign-in, then go straight into the game.
 * The field starts filled (their Google first name when it fits), so one tap is enough.
 */
function askName(user, suggest) {
  if (!user.needsName) return user;
  ui.loading.naming = true;
  ui.loading.name = suggest || '';
  ui.loading.error = '';
  return new Promise((resolve) => {
    loginHooks.submitName = async (name) => {
      try {
        const r = await api('/api/me/name', { name });
        ui.loading.naming = false; ui.loading.error = '';
        resolve(r.user);
      } catch (e) { ui.loading.error = e.message; }
    };
  });
}

export async function ensureLogin() {
  if (getToken()) {
    try { const u = (await api('/api/me')).user; return askName(u, ''); } catch (e) { if (e.status === 401) clearToken(); else throw e; }
  }
  const cfg = await api('/api/config');
  return new Promise((resolve) => {
    const done = (j) => { setToken(j.token); ui.loading.auth = false; resolve(askName(j.user, j.suggest)); };
    const fail = (e) => { ui.loading.error = e.message; };
    loginHooks.renderGoogle = (el) => {
      if (!cfg.googleClientId) { if (!cfg.devLogin) fail(new Error('Máy chủ chưa cấu hình Google Client ID')); return; }
      waitFor(() => window.google?.accounts?.id).then((gid) => {
        gid.initialize({
          client_id: cfg.googleClientId,
          callback: ({ credential }) => api('/api/auth/google', { credential }).then(done, fail),
          ux_mode: 'popup',
          // Returning players who signed in before are let in by One Tap without a click.
          auto_select: true,
          itp_support: true,
          context: 'use',
        });
        try { gid.prompt(); } catch { }
        gid.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'vi', width: 260 });
      }, () => fail(new Error('Không tải được Google Sign-In')));
    };
    loginHooks.dev = () => api('/api/auth/dev', { tag: new URLSearchParams(location.search).get('dev') || guestTag() }).then(done, fail);
    ui.loading.devLogin = !!cfg.devLogin;
    ui.loading.google = !!cfg.googleClientId;
    ui.loading.auth = true;
  });
}

export async function logout() {
  try { await api('/api/logout', {}); } catch { }
  clearToken();
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { }
  location.reload();
}

export function connect(onMessage, onStatus) {
  let ws, closed = false, delay = 500;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { delay = 500; ws.send(JSON.stringify({ t: 'auth', token: getToken() })); onStatus(true); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.t === 'kicked') closed = true; onMessage(m); };
    ws.onclose = (e) => {
      onStatus(false);
      if (closed || e.code === 4000 || e.code === 4003) return;
      if (e.code === 4001) { clearToken(); location.reload(); return; }
      setTimeout(open, delay); delay = Math.min(delay * 2, 8000);
    };
  };
  open();
  return { send: (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, close: () => { closed = true; ws.close(); } };
}
