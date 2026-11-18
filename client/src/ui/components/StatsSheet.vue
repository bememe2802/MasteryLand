<script setup>
import { computed, ref } from 'vue';
import { ui, game } from '../state.js';
import Sheet from './Sheet.vue';
import {
  xpNeed, defReduceFor, dmgFor, maxHpFor, critFor, speedFor, SPEED, STYLES, SKILL_UNLOCK, POWER_BY_ID, NAME_RE, cleanName,
} from '../../../../shared/rules.js';

const MASTERY = { melee: ['Võ Thuật', 'sports_mma'], sword: ['Kiếm Thuật', 'swords'], defense: ['Phòng Thủ', 'shield'] };

const prog = computed(() => ui.prog);
const rows = computed(() => {
  const out = Object.entries(MASTERY).map(([k, [name, icon]]) => {
    const m = prog.value.mastery[k], need = xpNeed(m.lv);
    const sub = k === 'defense'
      ? `Giảm ${(defReduceFor(prog.value) * 100).toFixed(1)}% sát thương`
      : `${STYLES[k].skill}${m.lv < SKILL_UNLOCK ? ` · Lv${SKILL_UNLOCK}` : ''}`;
    return { k, name, icon, lv: m.lv, xp: Math.floor(m.xp), need, pct: (m.xp / need) * 100, sub, on: k === prog.value.style };
  });
  const pw = prog.value.power;
  if (pw) {
    const def = POWER_BY_ID[pw.id], need = xpNeed(pw.lv);
    out.splice(2, 0, { k: 'power', name: def.name, icon: def.icon, lv: pw.lv, xp: Math.floor(pw.xp), need, pct: (pw.xp / need) * 100, sub: def.desc, on: prog.value.style === 'power' });
  }
  return out;
});
const facts = computed(() => {
  const p = prog.value, dmg = (k) => Math.round(dmgFor(p, k));
  return [
    ['Máu tối đa', maxHpFor(p)], ['Sát thương võ', dmg('melee')], ['Sát thương kiếm', dmg('sword')],
    ...(p.power ? [['Sát thương sức mạnh', dmg('power')]] : []),
    ['Chí mạng', `${Math.round(critFor(p) * 100)}%`], ['Tốc chạy', `${Math.round((speedFor(p) / SPEED) * 100)}%`],
    ['Đấu trường', ui.me.rating], ['Vàng', p.gold.toLocaleString('vi-VN')], ['Ngọc', p.gems.toLocaleString('vi-VN')],
  ];
});

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
      <button class="close" aria-label="Đổi tên" @click="startRename"><span class="ms">edit</span></button>
      <button class="close" aria-label="Đăng xuất" @click="game.logout()"><span class="ms">logout</span></button>
    </template>
    <form v-if="renaming" id="renameForm" @submit.prevent="submitRename">
      <input v-model="newName" maxlength="16" autocomplete="off" spellcheck="false" autofocus>
      <button type="submit"><span class="ms">check</span></button>
    </form>
    <p class="err">{{ err }}</p>
    <div v-for="r in rows" :key="r.k" class="stat" :class="{ on: r.on }">
      <div class="row"><span class="ms">{{ r.icon }}</span><span class="name">{{ r.name }}</span><span class="lv">Lv {{ r.lv }}</span></div>
      <div class="bar"><i :style="{ width: `${r.pct}%` }"></i></div>
      <div class="sub"><span>{{ r.xp }} / {{ r.need }}</span><span>{{ r.sub }}</span></div>
    </div>
    <div class="kv">
      <template v-for="[label, value] in facts" :key="label"><span>{{ label }}</span><span>{{ value }}</span></template>
    </div>
  </Sheet>
</template>
