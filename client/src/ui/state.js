import { reactive } from 'vue';

/**
 * The one place the game loop and the Vue UI meet.
 *
 * `ui` is the only reactive object. The game writes small, already-formatted values into it (at most
 * ten times a second, and Vue skips writes that do not change anything); its own state, positions,
 * meshes and the world, never becomes reactive, so the 60 fps loop pays nothing for Vue.
 *
 * `input` is a plain object the UI writes and the game reads every frame (joystick, held buttons).
 * `game` holds the game's commands; the engine fills it in when it starts.
 */
export const ui = reactive({
  booted: false,
  loading: { progress: 0, auth: false, error: '', devLogin: false, google: false, naming: false, name: '' },
  online: true,
  hud: {
    hp: 1, mhp: 1, xp: 0, lv: 1,
    atkIcon: 'sports_mma',
    /** One entry per skill button: { icon, color, lock (level needed, 0 if open), cd (seconds), k (cooldown 0..1) }. */
    skills: [],
    potions: 0, potCdK: 0, potHidden: true, safe: false, actIcon: null,
  },
  me: { id: 0, name: '', rating: 1000, wins: 0, losses: 0 },
  /** A copy of the player's progress for the stats and shop sheets, refreshed when it changes. */
  prog: null,
  modal: null, // 'stats' | 'bag' | 'shop' | 'purge' | 'quest' | 'arena' | 'map' | 'kicked'
  shop: { role: 'weapon', tab: 'sword' },
  quest: { board: 'village' },
  queue: { on: false, time: '0:00' },
  arena: { show: false, opp: '', oppHp: 100, time: '1:30' },
  dead: false,
  zone: { text: '', show: false },
  big: { main: '', sub: '', show: false },
  toasts: [],
});

export const input = { joyX: 0, joyY: 0, atkHeld: false };

export const game = {
  attack() {}, skill(i) {}, swap() {}, potion() {}, interact() {},
  buy(id, qty) {}, sell(id, qty) {}, equip(slot, id) {}, use(id) {}, purge() {}, quest(kind, id) {},
  toggleQueue() {}, rename: async (name) => {}, logout() {},
  drawBigMap(canvas) {},
};

let toastId = 0;
export function toast(text) {
  const id = ++toastId;
  ui.toasts.push({ id, text });
  setTimeout(() => { const i = ui.toasts.findIndex((t) => t.id === id); if (i >= 0) ui.toasts.splice(i, 1); }, 1900);
}

let bigTimer;
export function bigText(main, sub = '', ms = 1200) {
  Object.assign(ui.big, { main, sub, show: true });
  clearTimeout(bigTimer);
  bigTimer = setTimeout(() => { ui.big.show = false; }, ms);
}

let zoneTimer;
export function showZone(text) {
  Object.assign(ui.zone, { text, show: true });
  clearTimeout(zoneTimer);
  zoneTimer = setTimeout(() => { ui.zone.show = false; }, 2000);
}

export const openModal = (name) => { ui.modal = name; };
export const closeModal = (name) => { if (!name || ui.modal === name) ui.modal = null; };
