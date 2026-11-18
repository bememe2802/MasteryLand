<script setup>
import { ui, game } from '../state.js';
</script>

<template>
  <div id="zone" :class="{ show: ui.zone.show }">{{ ui.zone.text }}</div>
  <div id="toasts"><div v-for="t in ui.toasts" :key="t.id" class="toast">{{ t.text }}</div></div>
  <div v-if="ui.queue.on" id="queueChip" class="pill frame">
    <span class="ms spin">progress_activity</span><b>{{ ui.queue.time }}</b>
    <button aria-label="Hủy" @click="game.toggleQueue()"><span class="ms">close</span></button>
  </div>
  <div v-if="ui.arena.show" id="arenaHud">
    <div class="opp"><b>{{ ui.arena.opp }}</b><div class="hp"><i :style="{ width: `${ui.arena.oppHp}%` }"></i></div></div>
    <div id="arenaTime">{{ ui.arena.time }}</div>
  </div>
  <div id="bigText" :class="{ show: ui.big.show }">{{ ui.big.main }}<small v-if="ui.big.sub">{{ ui.big.sub }}</small></div>
  <div v-if="ui.dead" id="death"><div><h1>Gục ngã</h1></div></div>
</template>
