<script setup>
import { computed, watch } from 'vue';
import { ui, game } from '../state.js';
import { AVATAR } from '../../../../shared/rules.js';

// Every change rebuilds the character in the scene behind the panel.
const a = computed(() => ui.creator.a);
watch(() => JSON.stringify(ui.creator.a), () => { if (ui.creator.a) game.previewAvatar({ ...ui.creator.a }); });

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const hairs = computed(() => AVATAR.hair.map((h, i) => ({ ...h, i })).sort((x, y) => (x.fit === a.value.g ? 0 : 1) - (y.fit === a.value.g ? 0 : 1)));
function setGender(g) {
  if (a.value.g === g) return;
  a.value.g = g;
  if (AVATAR.hair[a.value.hair].fit !== g) a.value.hair = g === 'f' ? 3 : 0;
  if (g === 'f') a.value.beard = 0;
}
const rnd = (n) => Math.floor(Math.random() * n);
function shuffle() {
  const g = a.value.g;
  const own = AVATAR.hair.map((h, i) => [h, i]).filter(([h]) => h.fit === g);
  Object.assign(a.value, {
    hair: own[rnd(own.length)][1], hc: rnd(AVATAR.hairColor.length), eye: rnd(AVATAR.eyes.length), ec: rnd(AVATAR.eyeColor.length),
    skin: rnd(AVATAR.skin.length), sc: rnd(AVATAR.scarf.length), beard: g === 'm' && Math.random() < 0.25 ? 1 : 0,
  });
}
function done() { game.saveAvatar({ ...a.value }); }
function cancel() { ui.creator.show = false; game.previewAvatar(null); }
</script>

<template>
  <div id="creator" class="frame">
    <h2>{{ ui.creator.first ? 'Tạo nhân vật' : 'Ngoại hình' }}</h2>
    <div class="cr-body">
      <div class="cr-row gender">
        <button :class="{ on: a.g === 'm' }" @click="setGender('m')"><span class="ms">male</span>Nam</button>
        <button :class="{ on: a.g === 'f' }" @click="setGender('f')"><span class="ms">female</span>Nữ</button>
      </div>
      <h3>Kiểu tóc</h3>
      <div class="cr-row chips">
        <button v-for="h in hairs" :key="h.id" :class="{ on: a.hair === h.i }" @click="a.hair = h.i">{{ h.name }}</button>
        <button v-if="a.g === 'm'" :class="{ on: a.beard }" @click="a.beard = a.beard ? 0 : 1">Râu</button>
      </div>
      <h3>Màu tóc</h3>
      <div class="cr-row swatches">
        <button v-for="(c, i) in AVATAR.hairColor" :key="i" :class="{ on: a.hc === i }" :style="{ background: hex(c) }" :aria-label="'Màu tóc ' + (i + 1)" @click="a.hc = i"></button>
      </div>
      <h3>Đôi mắt</h3>
      <div class="cr-row chips">
        <button v-for="(e, i) in AVATAR.eyes" :key="e.id" :class="{ on: a.eye === i }" @click="a.eye = i">{{ e.name }}</button>
      </div>
      <div class="cr-row swatches">
        <button v-for="(c, i) in AVATAR.eyeColor" :key="i" :class="{ on: a.ec === i }" :style="{ background: hex(c) }" :aria-label="'Màu mắt ' + (i + 1)" @click="a.ec = i"></button>
      </div>
      <h3>Màu da</h3>
      <div class="cr-row swatches">
        <button v-for="(c, i) in AVATAR.skin" :key="i" :class="{ on: a.skin === i }" :style="{ background: hex(c) }" :aria-label="'Màu da ' + (i + 1)" @click="a.skin = i"></button>
      </div>
      <h3>Khăn quàng</h3>
      <div class="cr-row swatches">
        <button v-for="(c, i) in AVATAR.scarf" :key="i" :class="{ on: a.sc === i, none: c < 0 }" :style="c >= 0 ? { background: hex(c) } : null" :aria-label="c < 0 ? 'Không khăn' : 'Màu khăn ' + (i + 1)" @click="a.sc = i">
          <span v-if="c < 0" class="ms">block</span>
        </button>
      </div>
    </div>
    <div class="cr-foot">
      <button class="ghost" aria-label="Ngẫu nhiên" @click="shuffle"><span class="ms">casino</span></button>
      <button class="ghost" :aria-label="ui.creator.face ? 'Xem toàn thân' : 'Xem khuôn mặt'" @click="ui.creator.face = !ui.creator.face"><span class="ms">{{ ui.creator.face ? 'zoom_out' : 'zoom_in' }}</span></button>
      <button v-if="!ui.creator.first" class="ghost" @click="cancel">Hủy</button>
      <button class="cta" @click="done">{{ ui.creator.first ? 'Bắt đầu' : 'Lưu' }}</button>
    </div>
  </div>
</template>
