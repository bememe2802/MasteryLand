<script setup>
import { ui, game } from '../state.js';
import HoldButton from './HoldButton.vue';
</script>

<template>
  <div id="actions">
    <HoldButton v-if="ui.hud.actIcon" id="btnAct" class="sm hex frame gold" @down="game.interact()"><span class="ms">{{ ui.hud.actIcon }}</span></HoldButton>
    <HoldButton v-if="!ui.hud.potHidden" id="btnPot" class="sm hex frame" aria-label="Uống thuốc" :style="{ '--cd': ui.hud.potCdK }" @down="game.potion()">
      <span class="ms">water_drop</span><b>{{ ui.hud.potions > 1 ? ui.hud.potions : '' }}</b>
    </HoldButton>
    <HoldButton id="btnSwap" class="sm hex frame" aria-label="Đổi vũ khí" @down="game.swap()"><span class="ms">sync_alt</span></HoldButton>
    <!-- One skill for fists and sword, three for a special power; arranged around the attack button. -->
    <HoldButton v-for="(s, i) in ui.hud.skills" :key="i" class="md skill" :class="['s' + i, { locked: s.lock }]" :aria-label="'Kỹ năng ' + (i + 1)"
      :style="{ '--cd': s.k, '--sc': s.color || null }" @down="game.skill(i)">
      <span class="ms ic">{{ s.icon }}</span><b>{{ s.cd || '' }}</b><span class="ms lock">lock</span><small v-if="s.lock" class="need">{{ s.lock }}</small>
    </HoldButton>
    <HoldButton id="btnAtk" class="lg" aria-label="Đánh" @down="game.attack(true)" @up="game.attack(false)"><span class="ms">{{ ui.hud.atkIcon }}</span></HoldButton>
  </div>
</template>
