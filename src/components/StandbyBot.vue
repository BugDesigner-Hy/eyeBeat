<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import RobotEyes from './RobotEyes.vue'

const emit = defineEmits<{ power: []; poke: [] }>()

const mad = ref(false)
const pressing = ref(false)

let holdTimer = 0
let madTimer = 0
let clicks = 0
let clickReset = 0
let held = false

function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  held = false
  pressing.value = true
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  clearTimeout(holdTimer)
  holdTimer = window.setTimeout(() => {
    held = true
    pressing.value = false
    emit('power')
  }, 600)
}

function onUp(e: PointerEvent) {
  if (e.button !== 0) return
  clearTimeout(holdTimer)
  pressing.value = false
  if (held) return

  emit('poke')
  clicks++
  clearTimeout(clickReset)
  clickReset = window.setTimeout(() => (clicks = 0), 900)

  if (clicks >= 10) {
    clicks = 0
    mad.value = true
    clearTimeout(madTimer)
    madTimer = window.setTimeout(() => (mad.value = false), 1400)
  }
}

onBeforeUnmount(() => {
  clearTimeout(holdTimer)
  clearTimeout(clickReset)
  clearTimeout(madTimer)
})
</script>

<template>
  <button
    type="button"
    class="bot px-cut"
    :class="{ mad, pressing }"
    title="短按互动 · 长按开机"
    aria-label="待机机器人，短按互动，长按开机"
    @pointerdown="onDown"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <RobotEyes :on="true" :analyser="null" :scale="8" />
  </button>
</template>

<style scoped>
.bot {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  background: var(--accent);
  color: var(--bg);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bot:hover,
.bot:focus-visible {
  background: #fff;
  outline: 1px dashed var(--accent);
  outline-offset: 6px;
}

.bot.pressing {
  translate: 0 2px;
}

.bot.mad {
  animation: bot-shake 80ms steps(2) 8;
}

@keyframes bot-shake {
  from {
    translate: -4px 0;
  }
  to {
    translate: 4px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bot.mad {
    animation: none;
  }
}
</style>
