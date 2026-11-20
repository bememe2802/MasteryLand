<script setup>
import { computed, ref } from 'vue';
import { ui, game } from '../state.js';
import Sheet from './Sheet.vue';
import {
  xpNeed, masteryNeed, defReduceFor, dmgFor, maxHpFor, critFor, speedFor, SPEED, MAX_LV, STAT_KEYS, STAT_INFO, POWER_BY_ID, NAME_RE, cleanName,
  pointsLeft, resetCost, movesOf, unlockOf,
} from '../../../../shared/rules.js';

const prog = computed(() => ui.prog);
const left = computed(() => pointsLeft(prog.value));
const need = computed(() => xpNeed(prog.value.level));
// What one more point does, shown under each stat.
const stats = computed(() => STAT_KEYS.map(k => {
  const v = prog.value.stats[k];
  const effect = !v ? STAT_INFO[k].desc : k === 'defense' ? `+${v * 12} máu · -${(v * 0.1).toFixed(1)}% sát thương nhận` : `+${v * 5}% sát thương`;
  return { k, ...STAT_INFO[k], v, effect, full: v >= MAX_LV };
}));
const mastery = computed(() => {
  const p = prog.value, out = [];
  for (const k of ['melee', 'sword', 'power']) {
    const m = k === 'power' ? p.power : p.mastery[k];
    if (!m) continue;
    const moves = movesOf(p, k), lv = unlockOf(k);
    const next = moves.findIndex((_, i) => m.lv < lv[i]);
    out.push({
      k, name: k === 'power' ? POWER_BY_ID[p.power.id].name : STAT_INFO[k].name, icon: k === 'power' ? POWER_BY_ID[p.power.id].icon : STAT_INFO[k].icon,
      lv: m.lv, pct: (m.xp / masteryNeed(m.lv)) * 100, sub: next < 0 ? `Đã mở ${moves.length} chiêu` : `${moves[next].n} · thông thạo ${lv[next]}`, on: k === p.style,
    });
  }
  return out;
});
const facts = computed(() => {
  const p = prog.value, dmg = (k) => Math.round(dmgFor(p, k));
  return [
    ['Máu tối đa', maxHpFor(p)], ['Giảm sát thương', `${(defReduceFor(p) * 100).toFixed(1)}%`], ['Sát thương võ', dmg('melee')], ['Sát thương kiếm', dmg('sword')],
    ...(p.power ? [['Sát thương ấn', dmg('power')]] : []),
    ['Chí mạng', `${Math.round(critFor(p) * 100)}%`], ['Tốc chạy', `${Math.round((speedFor(p) / SPEED) * 100)}%`],
    ['Đấu trường', ui.me.rating], ['Vàng', p.gold.toLocaleString('vi-VN')], ['Ngọc', p.gems.toLocaleString('vi-VN')],
  ];
});
const cost = computed(() => resetCost(prog.value.level));
const spent = computed(() => STAT_KEYS.some(k => prog.value.stats[k] > 0));
const confirmReset = ref(false);
function reset() { if (!confirmReset.value) { confirmReset.value = true; return; } game.statReset(); confirmReset.value = false; }

const renaming = ref(false), newName = ref(''), err = ref('');
function startRename() { renaming.value = !renaming.value; newName.value = ui.me.name; err.value = ''; }
async function submitRename() {
  const name = cleanName(newName.value);
  if (!NAME_RE.test(name)) { err.value = 'Tên 2–16 ký tự, chỉ gồm chữ, số, khoảng trắng'; return; }
  try { await game.rename(name); renaming.value = false; err.value = ''; } catch (e) { err.value = e.message; }
}
</script>

<template>
  <Sheet>
    <template #header>
      <h2>{{ ui.me.name }}</h2>
      <button class="close" aria-label="Ngoại hình" @click="game.openCreator()"><span class="ms">face_retouching_natural</span></button>
      <button class="close" aria-label="Đổi tên" @click="startRename"><span class="ms">edit</span></button>
      <button class="close" aria-label="Đăng xuất" @click="game.logout()"><span class="ms">logout</span></button>
    </template>
    <form v-if="renaming" id="renameForm" @submit.prevent="submitRename">
      <input v-model="newName" maxlength="16" autocomplete="off" spellcheck="false" autofocus>
      <button type="submit"><span class="ms">check</span></button>
    </form>
    <p class="err">{{ err }}</p>
    <div class="stat level">
      <div class="row"><span class="ms">military_tech</span><span class="name">Cấp {{ prog.level }}</span><span class="lv">{{ Math.floor(prog.xp).toLocaleString('vi-VN') }} / {{ need.toLocaleString('vi-VN') }}</span></div>
      <div class="bar"><i :style="{ width: `${(prog.xp / need) * 100}%` }"></i></div>
    </div>
    <div class="pts"><span>Điểm còn lại</span><b :class="{ has: left > 0 }">{{ left }}</b></div>
    <div v-for="s in stats" :key="s.k" class="pstat">
      <span class="ms">{{ s.icon }}</span>
      <div class="pinfo"><span class="name">{{ s.name }} <b>{{ s.v }}</b></span><small>{{ s.effect }}</small></div>
      <button :disabled="!left || s.full" aria-label="Thêm 1 điểm" @click="game.stat(s.k, 1)">+1</button>
      <button :disabled="!left || s.full" aria-label="Thêm 10 điểm" @click="game.stat(s.k, 10)">+10</button>
    </div>
    <button v-if="spent" class="ghost reset" :disabled="ui.prog.gold < cost || !ui.hud.safe" @click="reset">
      {{ confirmReset ? 'Chắc chắn?' : `Tẩy điểm · ${cost.toLocaleString('vi-VN')} vàng` }}
    </button>
    <h3 class="subhead">Thông thạo</h3>
    <div v-for="r in mastery" :key="r.k" class="stat" :class="{ on: r.on }">
      <div class="row"><span class="ms">{{ r.icon }}</span><span class="name">{{ r.name }}</span><span class="lv">{{ r.lv }}</span></div>
      <div class="bar"><i :style="{ width: `${r.pct}%` }"></i></div>
      <div class="sub"><span></span><span>{{ r.sub }}</span></div>
    </div>
    <div class="kv">
      <template v-for="[label, value] in facts" :key="label"><span>{{ label }}</span><span>{{ value }}</span></template>
    </div>
  </Sheet>
</template>
