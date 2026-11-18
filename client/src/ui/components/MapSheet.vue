<script setup>
import { onMounted, ref } from 'vue';
import { game, closeModal } from '../state.js';

// Drawn once when opened: the world map does not need to follow the player while it is up.
const canvas = ref(null);
onMounted(() => game.drawBigMap(canvas.value));
</script>

<template>
  <div id="mapModal" class="modal" @click="closeModal()">
    <div class="bigmap frame"><canvas id="bigmap" ref="canvas" width="720" height="720"></canvas></div>
  </div>
</template>
