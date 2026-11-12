<script setup>
import { ref, watch, nextTick } from 'vue';
import { ui } from '../state.js';
import { loginHooks } from '../../game/net.js';

const gbtn = ref(null);
watch(() => ui.loading.auth, async (on) => {
  if (!on) return;
  await nextTick();
  if (gbtn.value) loginHooks.renderGoogle(gbtn.value);
}, { immediate: true });
</script>

<template>
  <div id="loading">
    <div>
      <h1>Mastery Land</h1>
      <div class="lbar"><i :style="{ width: `${ui.loading.progress * 100}%` }"></i></div>
      <div v-show="ui.loading.auth" id="auth">
        <div id="gbtn" ref="gbtn"></div>
        <button v-if="ui.loading.devLogin" class="ghost" @click="loginHooks.dev()">Đăng nhập thử</button>
        <p class="err">{{ ui.loading.error }}</p>
      </div>
    </div>
  </div>
</template>
