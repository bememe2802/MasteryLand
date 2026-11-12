<script setup>
import { ref } from 'vue';
import { input } from '../state.js';

// Knob and base move by direct style writes: a joystick changes on every pointer event and has
// nothing for Vue to render, so it stays out of the reactive state.
const R = 52;
const base = ref(null), knob = ref(null);
let id = null, cx = 0, cy = 0, home = null;

function down(e) {
  if (id !== null) return;
  id = e.pointerId;
  try { e.currentTarget.setPointerCapture(id); } catch { /* pointer already gone */ }
  const b = base.value, r = b.getBoundingClientRect();
  if (!home) home = { l: b.style.left, b: b.style.bottom };
  b.style.left = `${e.clientX - r.width / 2}px`; b.style.bottom = `${innerHeight - e.clientY - r.height / 2}px`;
  cx = e.clientX; cy = e.clientY; move(e);
}
function move(e) {
  if (e.pointerId !== id) return;
  let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
  if (d > R) { dx = dx / d * R; dy = dy / d * R; }
  knob.value.style.transform = `translate(${dx}px, ${dy}px)`;
  input.joyX = dx / R; input.joyY = dy / R;
}
function up(e) {
  if (e.pointerId !== id) return;
  id = null; input.joyX = input.joyY = 0; knob.value.style.transform = '';
  if (home) { base.value.style.left = home.l; base.value.style.bottom = home.b; }
}
</script>

<template>
  <div id="joyzone" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div id="joybase" ref="base"><div id="joyknob" ref="knob"></div></div>
  </div>
</template>
