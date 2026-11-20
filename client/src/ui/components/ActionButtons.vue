<script setup>
import { ui, game } from '../state.js';
import HoldButton from './HoldButton.vue';
import SkillButton from './SkillButton.vue';
</script>

<template>
  <div id="actions">
    <HoldButton v-if="ui.hud.actIcon" id="btnAct" class="sm hex frame gold" @down="game.interact()"><span class="ms">{{ ui.hud.actIcon }}</span></HoldButton>
    <HoldButton v-if="!ui.hud.potHidden" id="btnPot" class="sm hex frame" aria-label="Uống thuốc" :style="{ '--cd': ui.hud.potCdK }" @down="game.potion()">
      <span class="ms">water_drop</span><b>{{ ui.hud.potions > 1 ? ui.hud.potions : '' }}</b>
    </HoldButton>
    <HoldButton id="btnSwap" class="sm hex frame" aria-label="Đổi vũ khí" @down="game.swap()"><span class="ms">sync_alt</span></HoldButton>
    <!-- Two to four moves, arranged in an arc around the attack button; drag one to aim it. -->
    <SkillButton v-for="(s, i) in ui.hud.skills" :key="i" :i="i" :s="s" />
    <HoldButton id="btnAtk" class="lg" aria-label="Đánh" @down="game.attack(true)" @up="game.attack(false)"><span class="ms">{{ ui.hud.atkIcon }}</span></HoldButton>
    <div v-if="ui.aim.on" id="aimCancel" :class="{ hot: ui.aim.cancel }"><span class="ms">close</span></div>
  </div>
</template>
