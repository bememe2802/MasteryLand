<script setup>
import { computed } from 'vue';
import { ui, game } from '../state.js';
import Sheet from './Sheet.vue';
import { CATALOG, SHOPS } from '../../../../shared/rules.js';

const TITLES = { weapon: 'Lò Rèn', armor: 'Tiệm Giáp', potion: 'Tiệm Thuốc' };
const TABS = { sword: ['swords', 'Kiếm'], glove: ['sports_mma', 'Găng'], armor: ['shield', 'Giáp'], potion: ['water_drop', 'Thuốc'] };
const price = (n) => n.toLocaleString('vi-VN');

const tabs = computed(() => SHOPS[ui.shop.role]);
const items = computed(() => {
  const p = ui.prog, tab = ui.shop.tab;
  return CATALOG[tab].map((it, i) => {
    const color = `#${it.color.toString(16).padStart(6, '0')}`;
    if (tab === 'potion') {
      return { i, color, name: `${it.name} · ${p.potions[it.id]}`, desc: it.desc, label: price(it.price), disabled: p.gold < it.price, act: () => game.buy('potion', i) };
    }
    const owned = p.owned[tab].includes(i), equipped = p.gear[tab] === i;
    if (equipped) return { i, color, name: it.name, desc: it.desc, label: 'Đang dùng', disabled: true };
    if (owned) return { i, color, name: it.name, desc: it.desc, label: 'Trang bị', act: () => game.equip(tab, i) };
    return { i, color, name: it.name, desc: it.desc, label: price(it.price), disabled: p.gold < it.price, act: () => game.buy(tab, i) };
  });
});
</script>

<template>
  <Sheet>
    <template #header>
      <h2>{{ TITLES[ui.shop.role] }}</h2>
      <span class="gold"><span class="ms">paid</span><b>{{ price(ui.prog.gold) }}</b></span>
    </template>
    <nav v-if="tabs.length > 1" class="tabs">
      <button v-for="t in tabs" :key="t" :class="{ on: t === ui.shop.tab }" @click="ui.shop.tab = t">
        <span class="ms">{{ TABS[t][0] }}</span>{{ TABS[t][1] }}
      </button>
    </nav>
    <div v-for="it in items" :key="it.i" class="item">
      <div class="sw" :style="{ background: it.color }"></div>
      <div class="info"><b>{{ it.name }}</b><span>{{ it.desc }}</span></div>
      <button :disabled="it.disabled" @click="it.act?.()">{{ it.label }}</button>
    </div>
  </Sheet>
</template>
