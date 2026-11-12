<script setup>
import { ui } from './state.js';
import LoginScreen from './components/LoginScreen.vue';
import TopBar from './components/TopBar.vue';
import Notices from './components/Notices.vue';
import Joystick from './components/Joystick.vue';
import ActionButtons from './components/ActionButtons.vue';
import StatsSheet from './components/StatsSheet.vue';
import ShopSheet from './components/ShopSheet.vue';
import ArenaSheet from './components/ArenaSheet.vue';
import MapSheet from './components/MapSheet.vue';

const reload = () => location.reload();
</script>

<template>
  <TopBar />
  <Notices />
  <Joystick />
  <ActionButtons />
  <StatsSheet v-if="ui.modal === 'stats' && ui.prog" />
  <ShopSheet v-if="ui.modal === 'shop' && ui.prog" />
  <ArenaSheet v-if="ui.modal === 'arena'" />
  <MapSheet v-if="ui.modal === 'map'" />
  <div v-if="ui.modal === 'kicked'" class="modal">
    <div class="sheet center">
      <span class="ms big">devices</span>
      <p>Tài khoản đang chơi ở nơi khác</p>
      <button class="cta" @click="reload">Vào lại</button>
    </div>
  </div>
  <LoginScreen v-if="!ui.booted" />
</template>
