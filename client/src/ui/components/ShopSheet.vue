<script setup>
import { computed, ref, onUnmounted } from 'vue';
import { ui, game } from '../state.js';
import Sheet from './Sheet.vue';
import ItemTile from './ItemTile.vue';
import { ITEMS, ITEM_LIST, SHOPS, SLOTS, SELL_AT, GEAR_SLOTS, shrineStock } from '../../../../shared/rules.js';
import { fmt, statLine, powerMoves, rarityColor } from '../items.js';

// Buy tabs from the shop's list, plus a sell tab at the village shops. The shrine shows its
// rotating stock and when it changes.
const shop = computed(() => SHOPS[ui.shop.role]);
const canSell = computed(() => SELL_AT.includes(ui.shop.role));
const now = ref(Date.now());
const tick = setInterval(() => { now.value = Date.now(); }, 1000);
onUnmounted(() => clearInterval(tick));
const stock = computed(() => shrineStock(now.value));
const refresh = computed(() => {
  const s = Math.max(0, Math.floor((stock.value.endsAt - now.value) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});
const open = ref(null);

const items = computed(() => {
  const p = ui.prog, tab = ui.shop.tab;
  if (tab === 'sell') {
    return Object.entries(p.inv).map(([id, n]) => ({ it: ITEMS[id], n })).filter(x => x.it?.sell > 0).map(({ it, n }) => {
      const spare = n - (GEAR_SLOTS.some(s => p.gear[s] === it.id) ? 1 : 0);
      return { it, n, label: `+${fmt(it.sell)}`, disabled: spare < 1, act: () => game.sell(it.id, 1), sell: true };
    });
  }
  const list = tab === 'power'
    ? stock.value.ids.map(id => ITEMS[`pw_${id}`])
    : ITEM_LIST.filter(it => it.shop === ui.shop.role && it.slot === tab);
  return list.map((it) => {
    const has = p.inv[it.id] || 0;
    const wallet = it.gems ? p.gems : p.gold;
    const cost = it.gems || it.price || 0;
    const price = it.gems ? `${cost}` : fmt(cost);
    if (it.slot === 'potion' || it.slot === 'power') return { it, n: has, label: price, gem: !!it.gems, disabled: wallet < cost, act: () => game.buy(it.id, 1) };
    if (p.gear[it.slot] === it.id) return { it, n: 0, label: 'Đang dùng', disabled: true };
    if (has) return { it, n: 0, label: 'Trang bị', act: () => game.equip(it.slot, it.id) };
    return { it, n: 0, label: price, gem: !!it.gems, disabled: wallet < cost, act: () => game.buy(it.id, 1) };
  });
});
const tabs = computed(() => [...shop.value.tabs, ...(canSell.value ? ['sell'] : [])]);
const tabInfo = (t) => (t === 'sell' ? ['sell', 'Bán'] : [SLOTS[t].icon, SLOTS[t].name]);
</script>

<template>
  <Sheet>
    <template #header>
      <h2>{{ shop.name }}</h2>
      <span class="gold"><span class="ms">paid</span><b>{{ fmt(ui.prog.gold) }}</b></span>
      <span class="gold gem"><span class="ms">diamond</span><b>{{ fmt(ui.prog.gems) }}</b></span>
    </template>
    <nav v-if="tabs.length > 1" class="tabs">
      <button v-for="t in tabs" :key="t" :class="{ on: t === ui.shop.tab }" @click="ui.shop.tab = t; open = null">
        <span class="ms">{{ tabInfo(t)[0] }}</span>{{ tabInfo(t)[1] }}
      </button>
    </nav>
    <p v-if="ui.shop.role === 'shrine'" class="stock"><span class="ms">schedule</span>Đổi hàng sau {{ refresh }}</p>
    <div v-for="x in items" :key="x.it.id" class="item" :class="{ tall: open === x.it.id }" @click="x.it.slot === 'power' && (open = open === x.it.id ? null : x.it.id)">
      <ItemTile :id="x.it.id" :count="x.n" />
      <div class="info">
        <b :style="{ color: rarityColor(x.it) }">{{ x.it.name }}</b><span>{{ statLine(x.it) }}</span>
        <ul v-if="open === x.it.id" class="mv">
          <li v-for="m in powerMoves(x.it)" :key="m.n"><span class="ms">{{ m.icon }}</span>{{ m.n }} <small>Lv {{ m.lv }}</small></li>
        </ul>
      </div>
      <button :disabled="x.disabled" :class="{ sellbtn: x.sell }" @click.stop="x.act?.()">
        <span v-if="x.gem" class="ms">diamond</span>{{ x.label }}
      </button>
    </div>
    <p v-if="!items.length" class="empty">Không có gì để bán</p>
  </Sheet>
</template>
