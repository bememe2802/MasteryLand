import { reactive } from 'vue';
import { toast } from './state.js';

// Full screen on phones. Android browsers take the Fullscreen API (on a tap, never on load) and
// then lock the screen sideways. iPhone Safari has no Fullscreen API for pages: there the game goes
// full screen only when started from the home screen (manifest + apple-mobile-web-app-capable).

const doc = document;
const el = doc.documentElement;
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
const api = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const touch = matchMedia('(pointer: coarse)').matches;

const current = () => doc.fullscreenElement || doc.webkitFullscreenElement;

export const fs = reactive({
  /** Show the button: a phone or tablet not already running full screen from the home screen. */
  show: touch && !standalone && (api || ios),
  on: false,
});

function sync() { fs.on = !!current(); }
doc.addEventListener('fullscreenchange', sync);
doc.addEventListener('webkitfullscreenchange', sync);

async function enter() {
  if (!api) return false;
  try {
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
  } catch { return false; }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not every browser locks */ }
  return true;
}

function leave() {
  try { (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc); } catch { }
}

export function toggleFullscreen() {
  if (!api) {
    if (ios) toast('Bấm Chia sẻ ⎋ → Thêm vào MH chính để chơi toàn màn hình');
    return;
  }
  if (current()) leave(); else enter();
}

/**
 * The first tap on the game itself (after the login screen) goes full screen once. Leaving full
 * screen afterwards is the player's choice: it is not forced back.
 */
export function autoFullscreenOnFirstTap() {
  if (!touch || standalone || !api) return;
  const once = () => {
    removeEventListener('pointerup', once, true);
    if (!current()) enter();
  };
  addEventListener('pointerup', once, true);
}
