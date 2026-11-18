<script setup>
import { computed } from 'vue';
import { ui } from '../state.js';
import { QUEST_BY_ID, ENEMIES } from '../../../../shared/rules.js';

// Accepted quests under the HP bar: a short name and the count, gold when ready to hand in.
const rows = computed(() => Object.entries(ui.prog?.quests || {}).map(([id, n]) => {
  const q = QUEST_BY_ID[id];
  return { id, name: ENEMIES[q.type].name, n: Math.min(n, q.count), count: q.count, done: n >= q.count };
}));
</script>

<template>
  <div v-if="rows.length" id="tracker">
    <div v-for="r in rows" :key="r.id" :class="{ done: r.done }">
      <span class="ms">{{ r.done ? 'task_alt' : 'swords' }}</span><span class="nm">{{ r.name }}</span><b>{{ r.n }}/{{ r.count }}</b>
    </div>
  </div>
</template>
