/**
 * Sound effects, synthesized with WebAudio: no files to download. Each sound is a few oscillators
 * and filtered noise with short envelopes. Browsers keep audio off until the first tap, so the
 * context starts (or resumes) on the first pointer or key press.
 */
const KEY = 'arenix.sound';
let ctx = null, master = null, noiseBuf = null;
let on = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })();
const last = new Map();

function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = on ? 0.55 : 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, init, { passive: true });

export const sound = {
  get on() { return on; },
  toggle() { on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { } if (master) master.gain.value = on ? 0.55 : 0; return on; },
};

/* ---- Building blocks ---------------------------------------------------------------------- */
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(type, f0, f1, dur, vol, delay = 0, dest = master) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, type, f0, f1 = f0, q = 1, delay = 0) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = 1; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
/** Plays a sound unless the same one played less than `gap` seconds ago (keeps big fights from roaring). */
function play(name, gap, fn) {
  if (!on || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now - (last.get(name) || -1) < gap) return;
  last.set(name, now); fn();
}
const vary = (f) => f * (0.92 + Math.random() * 0.16);

export const sfx = {
  swing: () => play('swing', 0.06, () => noise(0.12, 0.25, 'bandpass', vary(1800), 600, 1.2)),
  slash: () => play('slash', 0.06, () => { noise(0.16, 0.35, 'bandpass', vary(3200), 900, 2); tone('triangle', vary(1400), 700, 0.08, 0.05); }),
  hit: (crit) => play('hit', 0.04, () => {
    noise(0.08, 0.5, 'lowpass', 2400, 300); tone('sine', vary(crit ? 220 : 150), 60, 0.14, 0.5);
    if (crit) { tone('square', 1200, 1800, 0.08, 0.08, 0.02); noise(0.12, 0.25, 'highpass', 4000, 4000); }
  }),
  hurt: () => play('hurt', 0.12, () => { tone('sawtooth', 160, 70, 0.18, 0.18); noise(0.1, 0.3, 'lowpass', 900, 200); }),
  coin: () => play('coin', 0.05, () => { tone('square', 1320, 1320, 0.07, 0.07); tone('square', 1760, 1760, 0.16, 0.07, 0.07); }),
  level: () => play('level', 0.5, () => [523, 659, 784, 1047, 1319].forEach((f, i) => { tone('triangle', f, f, 0.35, 0.16, i * 0.08); tone('sine', f * 2, f * 2, 0.2, 0.05, i * 0.08); })),
  chest: () => play('chest', 0.5, () => { noise(0.25, 0.2, 'lowpass', 600, 200); [784, 988, 1175, 1568, 1976].forEach((f, i) => tone('sine', f, f, 0.4, 0.13, 0.15 + i * 0.06)); }),
  unlock: () => play('unlock', 0.5, () => [392, 523, 784].forEach((f, i) => tone('triangle', f, f, 0.5, 0.15, i * 0.12))),
  ui: () => play('ui', 0.04, () => tone('sine', 880, 1100, 0.05, 0.06)),
  die: () => play('die', 1, () => { tone('sawtooth', 300, 50, 0.9, 0.18); noise(0.6, 0.2, 'lowpass', 800, 100); }),
  splash: () => play('splash', 0.25, () => noise(0.25, 0.12, 'bandpass', 1200, 400, 0.8)),
  /** One sound per move kind: zaps for projectiles, booms for slams, crackle for lightning. */
  cast(k, fx) {
    play('cast', 0.05, () => {
      switch (k) {
        case 'bolt': tone('sawtooth', vary(900), 220, 0.22, 0.12); noise(0.18, 0.15, 'bandpass', 2500, 800, 2); break;
        case 'chain': for (let i = 0; i < 5; i++) noise(0.05, 0.35, 'highpass', 3000 + i * 400, 3000, 1, i * 0.035); tone('square', 120, 80, 0.3, 0.08); break;
        case 'cone': noise(0.4, 0.35, 'bandpass', fx === 'burn' ? 900 : 1600, 400, 0.7); break;
        case 'line': tone('sawtooth', 220, 880, 0.3, 0.12); noise(0.3, 0.2, 'bandpass', 3000, 1500, 3); break;
        case 'dash': noise(0.3, 0.35, 'bandpass', 600, 3000, 1.2); break;
        case 'leap': tone('sine', 200, 600, 0.3, 0.12); break;
        case 'blink': tone('sine', 1600, 200, 0.25, 0.12); tone('sine', 400, 2400, 0.25, 0.08, 0.15); break;
        case 'nova': case 'land': tone('sine', 120, 35, 0.5, 0.6); noise(0.4, 0.4, 'lowpass', 1500, 120); break;
        case 'aura': tone('triangle', 330, 330, 0.6, 0.1); tone('triangle', 495, 495, 0.6, 0.08); break;
        case 'shield': [660, 880, 1320].forEach((f, i) => tone('sine', f, f, 0.6, 0.1, i * 0.05)); break;
        case 'zone': noise(0.6, 0.2, 'bandpass', 500, 1500, 1); tone('sine', 180, 260, 0.6, 0.1); break;
        case 'meteor': noise(0.8, 0.25, 'bandpass', 3000, 300, 1); break;
        case 'boom': tone('sine', 90, 30, 0.8, 0.7); noise(0.7, 0.5, 'lowpass', 2000, 80); break;
        default: tone('sine', 500, 300, 0.2, 0.1);
      }
    });
  },
};
