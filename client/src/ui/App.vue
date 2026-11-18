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
import BagSheet from './components/BagSheet.vue';
import PurgeSheet from './components/PurgeSheet.vue';
import QuestSheet from './components/QuestSheet.vue';
import QuestTracker from './components/QuestTracker.vue';
import { autoFullscreenOnFirstTap } from './fullscreen.js';

autoFullscreenOnFirstTap();

const reload = () => location.reload();
</script>

<template>
  <TopBar />
  <QuestTracker />
  <Notices />
  <Joystick />
  <ActionButtons />
  <StatsSheet v-if="ui.modal === 'stats' && ui.prog" />
  <ShopSheet v-if="ui.modal === 'shop' && ui.prog" />
  <BagSheet v-if="ui.modal === 'bag' && ui.prog" />
  <PurgeSheet v-if="ui.modal === 'purge' && ui.prog" />
  <QuestSheet v-if="ui.modal === 'quest' && ui.prog" />
  <ArenaSheet v-if="ui.modal === 'arena'" />
  <MapSheet v-if="ui.modal === 'map'" />
  <div v-if="ui.modal === 'kicked'" class="modal">
    <div class="sheet frame center">
      <div class="sheet-body">
        <span class="ms big">devices</span>
        <p>Tài khoản đang chơi ở nơi khác</p>
        <button class="cta" @click="reload">Vào lại</button>
      </div>
    </div>
  </div>
  <LoginScreen v-if="!ui.booted" />
</template>
