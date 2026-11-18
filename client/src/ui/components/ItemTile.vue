<script setup>
import { computed } from 'vue';
import { ITEMS } from '../../../../shared/rules.js';
import { hex, itemIcon, rarityColor } from '../items.js';

// A square item icon: rarity-colored frame, item color behind the slot icon, count in the corner.
const props = defineProps({ id: String, count: Number, on: Boolean, empty: String });
const it = computed(() => (props.id ? ITEMS[props.id] : null));
</script>

<template>
  <div class="tile frame" :class="{ on }" :style="it ? { '--edge': rarityColor(it), '--tint': hex(it.color) } : {}">
    <span class="ms">{{ it ? itemIcon(it) : empty }}</span>
    <b v-if="count > 1">{{ count }}</b>
  </div>
</template>
