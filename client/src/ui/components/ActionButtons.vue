<script setup>
import { ui, game } from '../state.js';
import HoldButton from './HoldButton.vue';
</script>

<template>
  <div id="actions">
    <HoldButton v-if="ui.hud.actIcon" id="btnAct" class="sm gold" @down="game.interact()"><span class="ms">{{ ui.hud.actIcon }}</span></HoldButton>
    <HoldButton v-if="!ui.hud.potHidden" id="btnPot" class="sm" aria-label="Uống thuốc" :style="{ '--cd': ui.hud.potCdK }" @down="game.potion()">
      <span class="ms">water_drop</span><b>{{ ui.hud.potions > 1 ? ui.hud.potions : '' }}</b>
    </HoldButton>
    <HoldButton id="btnSwap" class="sm" aria-label="Đổi vũ khí" @down="game.swap()"><span class="ms">sync_alt</span></HoldButton>
    <HoldButton id="btnSkill" class="md" :class="{ locked: ui.hud.skillLocked }" aria-label="Kỹ năng" :style="{ '--cd': ui.hud.skillCdK }" @down="game.skill()">
      <span id="skillIcon" class="ms">{{ ui.hud.skillIcon }}</span><b>{{ ui.hud.skillCd || '' }}</b><span class="ms lock">lock</span>
    </HoldButton>
    <HoldButton id="btnAtk" class="lg" aria-label="Đánh" @down="game.attack(true)" @up="game.attack(false)"><span class="ms">{{ ui.hud.atkIcon }}</span></HoldButton>
  </div>
</template>
