<script setup>
import { ref } from 'vue';
import { ui, game } from '../state.js';

/**
 * A move button you can drag to aim, like a MOBA: the drag from the button's centre is the
 * direction (and, for moves aimed at a spot, how far). A quick tap aims at the nearest target.
 * Letting go over the cancel button drops the move.
 */
const props = defineProps({ i: { type: Number, required: true }, s: { type: Object, required: true } });
const R = 70;
const pressed = ref(false), aiming = ref(false);
const knob = ref({ x: 0, y: 0 }), pad = ref({ x: 0, y: 0 });
let pid = null;

function overCancel(e) {
  const el = document.getElementById('aimCancel');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
}
function down(e) {
  e.preventDefault();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  pressed.value = true; pid = e.pointerId;
  const r = e.currentTarget.getBoundingClientRect();
  pad.value = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  knob.value = { x: 0, y: 0 };
  aiming.value = game.aim(props.i, 'start');
  if (aiming.value) Object.assign(ui.aim, { on: true, cancel: false, aim: props.s.aim });
}
function move(e) {
  if (!aiming.value || e.pointerId !== pid) return;
  let dx = e.clientX - pad.value.x, dy = e.clientY - pad.value.y;
  const len = Math.hypot(dx, dy);
  if (len > R) { dx *= R / len; dy *= R / len; }
  knob.value = { x: dx, y: dy };
  ui.aim.cancel = overCancel(e);
  game.aim(props.i, 'move', dx, dy, Math.min(1, len / R), ui.aim.cancel);
}
function up(e) {
  pressed.value = false;
  if (!aiming.value) return;
  const cancel = overCancel(e), { x, y } = knob.value;
  game.aim(props.i, cancel ? 'cancel' : 'end', x, y, Math.min(1, Math.hypot(x, y) / R), cancel);
  aiming.value = false;
  Object.assign(ui.aim, { on: false, cancel: false });
}
</script>

<template>
  <button class="act md skill" :class="['s' + i, { locked: s.lock, press: pressed }]" :aria-label="'Chiêu ' + (i + 1)"
    :style="{ '--cd': s.k, '--sc': s.color || null }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <span class="ms ic">{{ s.icon }}</span><b>{{ s.cd || '' }}</b><span class="ms lock">lock</span><small v-if="s.lock" class="need">{{ s.lock }}</small>
  </button>
  <!-- On <body>: the button cluster is scaled on small screens, which would shift a fixed element inside it. -->
  <Teleport to="body">
    <div v-if="aiming && s.aim !== 'self'" class="aimpad" :style="{ left: `${pad.x - R}px`, top: `${pad.y - R}px`, width: `${R * 2}px`, height: `${R * 2}px` }">
      <i :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }"></i>
    </div>
  </Teleport>
</template>
