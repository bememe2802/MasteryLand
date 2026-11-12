<script setup>
import { ref } from 'vue';

// Fires on press, not on click, so an attack lands the moment a thumb touches the button.
const emit = defineEmits(['down', 'up']);
const pressed = ref(false);
function onDown(e) {
  e.preventDefault();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  pressed.value = true;
  emit('down');
}
function onUp() { pressed.value = false; emit('up'); }
</script>

<template>
  <button class="act" :class="{ press: pressed }" @pointerdown="onDown" @pointerup="onUp" @pointercancel="onUp"><slot /></button>
</template>
