<script setup>
import { computed, ref } from 'vue';
import { ui, game } from '../state.js';
import Sheet from './Sheet.vue';
import ItemTile from './ItemTile.vue';
import { ITEMS, ITEM_LIST, SLOTS, GEAR_SLOTS, RARITY, POWER_BY_ID, POWER_UNLOCK, masteryNeed } from '../../../../shared/rules.js';
import { fmt, statLine, sourceOf, powerMoves, rarityColor } from '../items.js';

// Three tabs: what is worn (and the power), everything carried, and the full item list.
const TABS = [['gear', 'checkroom', 'Trang bị'], ['bag', 'backpack', 'Túi đồ'], ['list', 'menu_book', 'Danh sách']];
const tab = ref('gear');
const pick = ref(null); // selected item id
const slotPick = ref(null); // gear slot being changed
const prog = computed(() => ui.prog);

const power = computed(() => {
  const pw = prog.value.power;
  if (!pw) return null;
  const def = POWER_BY_ID[pw.id];
  return { ...def, lv: pw.lv, pct: (pw.xp / masteryNeed(pw.lv)) * 100, moves: def.moves.map((m, i) => ({ ...m, need: POWER_UNLOCK[i], open: pw.lv >= POWER_UNLOCK[i] })) };
});
const ORDER = ['power', 'sword', 'glove', 'shirt', 'hat', 'acc', 'potion', 'material'];
const carried = computed(() => Object.entries(prog.value.inv)
  .map(([id, n]) => ({ id, n, it: ITEMS[id] }))
  .filter(x => x.it)
  .sort((a, b) => ORDER.indexOf(a.it.slot) - ORDER.indexOf(b.it.slot) || (a.it.price || a.it.gems * 1000 || 0) - (b.it.price || b.it.gems * 1000 || 0)));
const forSlot = computed(() => carried.value.filter(x => x.it.slot === slotPick.value));
const filter = ref('sword');
const catalog = computed(() => ITEM_LIST.filter(it => it.slot === filter.value));

const sel = computed(() => (pick.value ? ITEMS[pick.value] : null));
const owned = (id) => (prog.value.inv[id] || 0) > 0;
const worn = (id) => GEAR_SLOTS.some(s => prog.value.gear[s] === id);
function select(id) { pick.value = pick.value === id ? null : id; }
function openSlot(s) { slotPick.value = slotPick.value === s ? null : s; pick.value = null; }
function equip(it) { game.equip(it.slot, it.id); slotPick.value = null; }
function unequip(slot) { game.equip(slot, null); slotPick.value = null; }
</script>

<template>
  <Sheet>
    <template #header>
      <h2>Kho Đồ</h2>
      <span class="gold"><span class="ms">paid</span><b>{{ fmt(prog.gold) }}</b></span>
      <span class="gold gem"><span class="ms">diamond</span><b>{{ fmt(prog.gems) }}</b></span>
    </template>
    <nav class="tabs">
      <button v-for="[k, icon, label] in TABS" :key="k" :class="{ on: tab === k }" @click="tab = k; pick = null; slotPick = null">
        <span class="ms">{{ icon }}</span>{{ label }}
      </button>
    </nav>

    <!-- Worn gear and the special power -->
    <template v-if="tab === 'gear'">
      <div class="gear-grid">
        <button v-for="s in GEAR_SLOTS" :key="s" class="gear-slot" :class="{ on: slotPick === s }" @click="openSlot(s)">
          <ItemTile :id="prog.gear[s]" :empty="SLOTS[s].icon" />
          <small>{{ prog.gear[s] ? ITEMS[prog.gear[s]].name : SLOTS[s].name }}</small>
        </button>
      </div>
      <div v-if="slotPick" class="pick-list">
        <div v-for="x in forSlot" :key="x.id" class="item" @click="equip(x.it)">
          <ItemTile :id="x.id" :on="prog.gear[slotPick] === x.id" />
          <div class="info"><b :style="{ color: rarityColor(x.it) }">{{ x.it.name }}</b><span>{{ statLine(x.it) }}</span></div>
          <span v-if="prog.gear[slotPick] === x.id" class="ms tick">check_circle</span>
        </div>
        <button v-if="slotPick !== 'sword' && slotPick !== 'shirt' && prog.gear[slotPick]" class="cta off" @click="unequip(slotPick)"><span class="ms">remove_circle</span>Tháo ra</button>
        <p v-if="!forSlot.length" class="empty">Chưa có {{ SLOTS[slotPick].name.toLowerCase() }} nào</p>
      </div>
      <div class="power-card" :class="{ none: !power }" :style="power ? { '--pc': '#' + power.color.toString(16).padStart(6, '0') } : {}">
        <template v-if="power">
          <div class="row"><span class="ms">{{ power.icon }}</span><b>{{ power.name }}</b><span class="lv">Lv {{ power.lv }}</span></div>
          <div class="bar"><i :style="{ width: power.pct + '%' }"></i></div>
          <div class="moves">
            <div v-for="m in power.moves" :key="m.n" :class="{ off: !m.open }">
              <span class="ms">{{ m.open ? m.icon : 'lock' }}</span><small>{{ m.open ? m.n : 'Lv ' + m.need }}</small>
            </div>
          </div>
        </template>
        <template v-else><span class="ms">auto_awesome</span><small>Chưa có sức mạnh đặc biệt · Mua Ấn ở Đền Ấn Cổ</small></template>
      </div>
    </template>

    <!-- Everything carried -->
    <template v-else-if="tab === 'bag'">
      <div class="bag-grid">
        <button v-for="x in carried" :key="x.id" class="cell" @click="select(x.id)">
          <ItemTile :id="x.id" :count="x.n" :on="pick === x.id || worn(x.id)" />
        </button>
      </div>
      <p v-if="!carried.length" class="empty">Túi trống</p>
    </template>

    <!-- Every item in the game, by kind -->
    <template v-else>
      <div class="chips">
        <button v-for="(v, k) in SLOTS" :key="k" :class="{ on: filter === k }" @click="filter = k; pick = null"><span class="ms">{{ v.icon }}</span></button>
      </div>
      <div v-for="it in catalog" :key="it.id" class="item" :class="{ dim: !owned(it.id) }" @click="select(it.id)">
        <ItemTile :id="it.id" :on="pick === it.id" />
        <div class="info"><b :style="{ color: rarityColor(it) }">{{ it.name }}</b><span>{{ RARITY[it.rarity].name }} · {{ statLine(it) }}</span></div>
        <span v-if="owned(it.id)" class="ms tick">inventory_2</span>
      </div>
    </template>

    <!-- Detail of the selected item -->
    <div v-if="sel" class="detail frame">
      <div class="row"><b :style="{ color: rarityColor(sel) }">{{ sel.name }}</b><small>{{ RARITY[sel.rarity].name }} · {{ SLOTS[sel.slot].name }}</small></div>
      <p>{{ statLine(sel) }}</p>
      <ul v-if="sel.slot === 'power'" class="mv">
        <li v-for="m in powerMoves(sel)" :key="m.n"><span class="ms">{{ m.icon }}</span>{{ m.n }} <small>Lv {{ m.lv }}</small></li>
      </ul>
      <p class="src"><span class="ms">place</span>{{ sourceOf(sel).join(' · ') || 'Không bán' }}</p>
      <div class="acts" v-if="owned(sel.id)">
        <button v-if="GEAR_SLOTS.includes(sel.slot) && !worn(sel.id)" class="cta" @click="equip(sel)">Trang bị</button>
        <button v-if="sel.slot === 'power'" class="cta" :class="{ off: prog.power }" :disabled="!!prog.power" @click="game.use(sel.id); pick = null">
          {{ prog.power ? 'Đã có sức mạnh' : 'Dùng' }}
        </button>
        <button v-if="sel.slot === 'potion'" class="cta" @click="game.potion()">Uống</button>
      </div>
    </div>
  </Sheet>
</template>
