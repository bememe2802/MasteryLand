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

const $ = (id) => document.getElementById(id);
const waitFor = (fn, ms = 8000) => new Promise((res, rej) => {
  const t0 = Date.now();
  (function tick() { const v = fn(); if (v) res(v); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else setTimeout(tick, 80); })();
});

export async function ensureLogin() {
  if (getToken()) {
    try { return (await api('/api/me')).user; } catch (e) { if (e.status === 401) clearToken(); else throw e; }
  }
  const cfg = await api('/api/config');
  const box = $('auth'), err = $('authErr');
  box.classList.remove('hidden');
  return new Promise((resolve) => {
    const done = (j) => { setToken(j.token); box.classList.add('hidden'); resolve(j.user); };
    const fail = (e) => { err.textContent = e.message; };
    if (cfg.googleClientId) {
      waitFor(() => window.google?.accounts?.id).then((gid) => {
        gid.initialize({
          client_id: cfg.googleClientId,
          callback: ({ credential }) => api('/api/auth/google', { credential }).then(done, fail),
          ux_mode: 'popup',
        });
        gid.renderButton($('gbtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'vi', width: 260 });
      }, () => fail(new Error('Không tải được Google Sign-In')));
    } else {
      fail(new Error('Máy chủ chưa cấu hình Google Client ID'));
    }
    if (cfg.devLogin) {
      const b = $('devLogin'); b.classList.remove('hidden');
      b.onclick = () => api('/api/auth/dev', { tag: new URLSearchParams(location.search).get('dev') || 'dev' }).then(done, fail);
    }
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
