<script setup>
import { ui, openModal } from '../state.js';
</script>

<template>
  <div id="topbar">
    <button class="icon-btn" aria-label="Chỉ số" @click="openModal('stats')"><span class="ms">person</span></button>
    <div class="bars">
      <div class="hp"><i :style="{ width: `${(ui.hud.hp / ui.hud.mhp) * 100}%` }"></i><span>{{ ui.hud.hp }} / {{ ui.hud.mhp }}</span></div>
      <div class="mx"><i :style="{ width: `${ui.hud.xp * 100}%` }"></i></div>
    </div>
    <span v-if="ui.hud.safe" class="chip" aria-label="Vùng an toàn"><span class="ms">shield_with_heart</span></span>
    <span v-if="!ui.online" class="chip warn" aria-label="Mất kết nối"><span class="ms">wifi_off</span></span>
  </div>
  <!-- Drawn by the engine ten times a second; Vue only owns the element and the click. -->
  <canvas id="minimap" width="200" height="200" @click="openModal('map')"></canvas>
</template>
