<script setup>
import { computed, ref } from 'vue';
import { ui, game, closeModal } from '../state.js';
import Sheet from './Sheet.vue';
import { POWER_BY_ID, PURGE_COST } from '../../../../shared/rules.js';
import { fmt, hex } from '../items.js';

// The village sage removes a power so another can be used. Asks twice: the power and its mastery are lost.
const pw = computed(() => ui.prog.power && { ...POWER_BY_ID[ui.prog.power.id], lv: ui.prog.power.lv });
const sure = ref(false);
function go() {
  if (!sure.value) { sure.value = true; return; }
  game.purge(); closeModal('purge');
}
</script>

<template>
  <Sheet>
    <template #header>
      <h2>Thầy Tẩy Ấn</h2>
      <span class="gold"><span class="ms">paid</span><b>{{ fmt(ui.prog.gold) }}</b></span>
    </template>
    <div v-if="pw" class="purge">
      <span class="ms big" :style="{ color: hex(pw.color) }">{{ pw.icon }}</span>
      <b>{{ pw.name }}</b>
      <small>Lv {{ pw.lv }} · mất toàn bộ thông thạo</small>
      <button class="cta" :class="{ danger: sure }" :disabled="ui.prog.gold < PURGE_COST" @click="go">
        <span class="ms">auto_fix_off</span>{{ sure ? 'Chắc chắn xóa?' : `Xóa · ${fmt(PURGE_COST)} vàng` }}
      </button>
    </div>
    <div v-else class="purge">
      <span class="ms big">auto_fix_off</span>
      <small>Chưa có sức mạnh nào để xóa</small>
    </div>
  </Sheet>
</template>
