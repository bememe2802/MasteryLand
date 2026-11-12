<script setup>
import { ui, game } from '../state.js';
import Sheet from './Sheet.vue';
</script>

<template>
  <Sheet>
    <template #header><h2>Đấu Trường</h2></template>
    <div class="arena-card">
      <div><span class="ms">military_tech</span><b>{{ ui.me.rating }}</b><small>Điểm</small></div>
      <div><span class="ms">emoji_events</span><b>{{ ui.me.wins }}</b><small>Thắng</small></div>
      <div><span class="ms">heart_broken</span><b>{{ ui.me.losses }}</b><small>Thua</small></div>
    </div>
    <button class="cta" :class="{ off: ui.queue.on }" @click="game.toggleQueue()">
      <template v-if="ui.queue.on"><span class="ms">close</span>Hủy tìm trận</template>
      <template v-else><span class="ms">swords</span>Tìm trận 1 vs 1</template>
    </button>
  </Sheet>
</template>
