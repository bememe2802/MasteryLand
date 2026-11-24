<script setup>
import { ui, game, openModal } from '../state.js';
import { fs, toggleFullscreen } from '../fullscreen.js';
</script>

<template>
  <div id="topbar">
    <button class="portrait hex frame" aria-label="Chỉ số" @click="openModal('stats')"><span class="ms">person</span><i v-if="ui.hud.points" class="ptdot">+</i></button>
    <span class="lvl">{{ ui.hud.lv }}</span>
    <div class="bars">
      <div class="hp"><i :style="{ width: `${(ui.hud.hp / ui.hud.mhp) * 100}%` }"></i><span>{{ ui.hud.hp }} / {{ ui.hud.mhp }}</span></div>
      <div class="mx"><i :style="{ width: `${ui.hud.xp * 100}%` }"></i></div>
    </div>
    <span v-if="ui.hud.safe" class="chip frame" aria-label="Vùng an toàn"><span class="ms">shield_with_heart</span></span>
    <span v-if="!ui.online" class="chip frame warn" aria-label="Mất kết nối"><span class="ms">wifi_off</span></span>
  </div>
  <!-- Drawn by the engine ten times a second; Vue only owns the element and the click. -->
  <button class="bagbtn act sm hex frame" aria-label="Kho đồ" @click="openModal('bag')"><span class="ms">backpack</span></button>
  <button class="lbbtn act sm hex frame" aria-label="Bảng xếp hạng" @click="openModal('top')"><span class="ms">leaderboard</span></button>
  <button class="sndbtn act sm hex frame" :aria-label="ui.sound ? 'Tắt âm thanh' : 'Bật âm thanh'" @click="game.toggleSound()"><span class="ms">{{ ui.sound ? 'volume_up' : 'volume_off' }}</span></button>
  <button v-if="fs.show" class="fsbtn act sm hex frame" :aria-label="fs.on ? 'Thoát toàn màn hình' : 'Toàn màn hình'" @click="toggleFullscreen"><span class="ms">{{ fs.on ? 'fullscreen_exit' : 'fullscreen' }}</span></button>
  <div class="mm frame" @click="openModal('map')"><canvas id="minimap" width="200" height="200"></canvas></div>
</template>
