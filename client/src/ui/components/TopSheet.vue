<script setup>
import { ref, onMounted } from 'vue';
import { ui } from '../state.js';
import { api } from '../../game/net.js';
import Sheet from './Sheet.vue';

// Two boards: character level and arena rating. Online players get a green dot.
const tab = ref('level');
const data = ref(null), err = ref('');
onMounted(async () => { try { data.value = await api('/api/top'); } catch (e) { err.value = e.message; } });
const medal = (i) => ['🥇', '🥈', '🥉'][i] || i + 1;
</script>

<template>
  <Sheet>
    <template #header><h2>Bảng Xếp Hạng</h2></template>
    <div class="tabs">
      <button :class="{ on: tab === 'level' }" @click="tab = 'level'"><span class="ms">military_tech</span>Cấp độ</button>
      <button :class="{ on: tab === 'arena' }" @click="tab = 'arena'"><span class="ms">stadium</span>Đấu trường</button>
    </div>
    <p v-if="err" class="err">{{ err }}</p>
    <p v-else-if="!data" class="muted">Đang tải…</p>
    <ol v-else class="ranks">
      <li v-for="(r, i) in data[tab]" :key="r.name" :class="{ me: r.name === ui.me.name, top: i < 3 }">
        <span class="rk">{{ medal(i) }}</span>
        <span class="nm"><i v-if="r.on" class="on" aria-label="Đang chơi"></i>{{ r.name }}</span>
        <b>{{ tab === 'level' ? `Cấp ${r.level}` : r.rating }}</b>
        <small v-if="tab === 'arena'">{{ r.wins }} thắng</small>
      </li>
    </ol>
  </Sheet>
</template>
