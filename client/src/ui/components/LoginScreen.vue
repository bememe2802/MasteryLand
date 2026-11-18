<script setup>
import { ref, watch, nextTick } from 'vue';
import { ui } from '../state.js';
import { loginHooks } from '../../game/net.js';

const gbtn = ref(null);
const nameInput = ref(null);
const busy = ref(false);
watch(() => ui.loading.auth, async (on) => {
  if (!on) return;
  await nextTick();
  if (gbtn.value) loginHooks.renderGoogle(gbtn.value);
}, { immediate: true });
watch(() => ui.loading.naming, async (on) => {
  if (!on) return;
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
});
async function play() {
  if (busy.value) return;
  busy.value = true;
  try { await loginHooks.submitName(ui.loading.name); } finally { busy.value = false; }
}
</script>

<template>
  <div id="loading">
    <div>
      <h1 class="logo"><img src="/brand/arenix-wordmark.svg" alt="Arenix"></h1>
      <div class="logo-rule"></div>
      <div v-show="!ui.loading.auth && !ui.loading.naming" class="lbar"><i :style="{ width: `${ui.loading.progress * 100}%` }"></i></div>
      <!-- One button signs in, or signs up the first time: the server makes the account if it is new. -->
      <div v-show="ui.loading.auth" id="auth">
        <div v-show="ui.loading.google" id="gbtn" ref="gbtn"></div>
        <button v-if="ui.loading.devLogin" :class="ui.loading.google ? 'linkbtn' : 'cta'" @click="loginHooks.dev()">
          {{ ui.loading.google ? 'Chơi thử không cần tài khoản' : 'Chơi ngay' }}
        </button>
        <p class="err">{{ ui.loading.error }}</p>
      </div>
      <form v-if="ui.loading.naming" id="nameForm" @submit.prevent="play">
        <label for="pname">Tên nhân vật</label>
        <input id="pname" ref="nameInput" v-model="ui.loading.name" maxlength="16" autocomplete="nickname" enterkeyhint="go" placeholder="2–16 ký tự">
        <button class="cta" :disabled="busy || ui.loading.name.trim().length < 2">Vào game</button>
        <p class="err">{{ ui.loading.error }}</p>
      </form>
    </div>
    <nav class="legal"><a href="/terms.html" target="_blank">Điều khoản</a> · <a href="/privacy.html" target="_blank">Quyền riêng tư</a></nav>
  </div>
</template>
