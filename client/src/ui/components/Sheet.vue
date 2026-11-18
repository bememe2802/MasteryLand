<script setup>
import { closeModal } from '../state.js';
</script>

<!-- A modal sheet: closes on its close button or a tap on the backdrop. -->
<template>
  <div class="modal" @pointerdown.self="closeModal()">
    <div class="sheet frame">
      <header>
        <slot name="header" />
        <button class="close" aria-label="Đóng" @click="closeModal()"><span class="ms">close</span></button>
      </header>
      <div class="sheet-body"><slot /></div>
    </div>
  </div>
</template>
