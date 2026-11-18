<script setup>
import { computed } from 'vue';
import { ui, game } from '../state.js';
import Sheet from './Sheet.vue';
import { QUESTS, QUEST_MAX, ENEMIES, CHECKPOINTS } from '../../../../shared/rules.js';
import { fmt } from '../items.js';

// The board at a checkpoint: its quests, each available, in progress, or ready to hand in.
const board = computed(() => CHECKPOINTS.find(c => c.id === ui.quest.board));
const active = computed(() => Object.keys(ui.prog.quests).length);
const list = computed(() => QUESTS.filter(q => q.board === ui.quest.board).map(q => {
  const n = ui.prog.quests[q.id];
  const t = ENEMIES[q.type];
  return { ...q, name: t.name, lv: t.lv, boss: !!t.boss, n, taken: n !== undefined, done: n >= q.count };
}));
</script>

<template>
  <Sheet>
    <template #header>
      <h2>{{ board?.name }}</h2>
      <span class="gold"><span class="ms">assignment</span><b>{{ active }}/{{ QUEST_MAX }}</b></span>
    </template>
    <div v-for="q in list" :key="q.id" class="quest frame" :class="{ done: q.done, boss: q.boss }">
      <div class="qhead">
        <span class="ms">{{ q.boss ? 'skull' : 'swords' }}</span>
        <b>Tiêu diệt {{ q.count }} {{ q.name }}</b>
        <small>Lv {{ q.lv }}</small>
      </div>
      <div v-if="q.taken" class="qbar"><i :style="{ width: Math.min(100, (q.n / q.count) * 100) + '%' }"></i><span>{{ q.n }} / {{ q.count }}</span></div>
      <div class="qfoot">
        <span class="rw"><span class="ms">paid</span>{{ fmt(q.gold) }}</span>
        <span v-if="q.gems" class="rw gem"><span class="ms">diamond</span>{{ q.gems }}</span>
        <span class="rw xp"><span class="ms">trending_up</span>{{ fmt(q.xp) }}</span>
        <button v-if="q.done" class="qbtn" @click="game.quest('qclaim', q.id)">Nhận thưởng</button>
        <button v-else-if="q.taken" class="qbtn off" @click="game.quest('qdrop', q.id)">Hủy</button>
        <button v-else class="qbtn" :disabled="active >= QUEST_MAX" @click="game.quest('qaccept', q.id)">Nhận</button>
      </div>
    </div>
    <p v-if="!list.length" class="empty">Không có nhiệm vụ ở đây</p>
  </Sheet>
</template>
