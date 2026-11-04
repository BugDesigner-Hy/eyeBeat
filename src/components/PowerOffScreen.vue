<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import SevenSegmentClock from './SevenSegmentClock.vue'
import StandbyBot from './StandbyBot.vue'

const ui = useUiStore()
const player = usePlayerStore()

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const phase = ref<'enter' | 'idle' | 'leave'>('enter')
const clockMode = ref<'time' | 'date'>('time')
const flash = ref(0)
const crt = ref<HTMLElement>()
const bootLine = ref('')

let bootTimer = 0

async function playShutCrt() {
  const el = crt.value
  if (!el || reduceMotion) {
    phase.value = 'idle'
    return
  }
  el.style.opacity = '1'
  el.style.background = '#e8fff2'
  el.style.transform = 'scaleY(1) scaleX(1)'
  await el
    .animate(
      [
        { opacity: 1, background: '#e8fff2', transform: 'scaleY(1) scaleX(1)' },
        { opacity: 1, background: '#9dffc8', transform: 'scaleY(0.012) scaleX(1)', offset: 0.45 },
        { opacity: 1, background: '#7cffb2', transform: 'scaleY(0.012) scaleX(0.04)', offset: 0.72 },
        { opacity: 0, background: '#7cffb2', transform: 'scaleY(0.012) scaleX(0.04)' },
      ],
      { duration: 700, easing: 'cubic-bezier(0.7, 0, 0.84, 0)', fill: 'forwards' },
    )
    .finished.catch(() => undefined)
  el.style.opacity = ''
  el.style.transform = ''
  el.style.background = ''
  phase.value = 'idle'
}

async function playBootCrt() {
  phase.value = 'leave'
  bootLine.value = 'HI/MUSIC · BOOT OK'
  const el = crt.value
  if (!el || reduceMotion) {
    finishBoot()
    return
  }
  el.style.opacity = '1'
  el.style.background = 'var(--accent)'
  el.style.transform = 'scaleY(0.012) scaleX(0.04)'
  await el
    .animate(
      [
        { opacity: 1, transform: 'scaleY(0.012) scaleX(0.04)' },
        { opacity: 1, transform: 'scaleY(0.012) scaleX(1)', offset: 0.35 },
        { opacity: 1, transform: 'scaleY(1) scaleX(1)', offset: 0.75 },
        { opacity: 0, transform: 'scaleY(1) scaleX(1)' },
      ],
      { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    )
    .finished.catch(() => undefined)
  finishBoot()
}

function finishBoot() {
  bootLine.value = ''
  const resume = ui.resumeOnBoot
  ui.resumeOnBoot = false
  ui.togglePower(false)
  if (resume && player.current && !player.isPlaying) player.toggle()
}

function powerOn() {
  if (phase.value !== 'idle') return
  void playBootCrt()
}

function onPoke() {
  clockMode.value = clockMode.value === 'time' ? 'date' : 'time'
  flash.value++
}

watch(
  () => ui.poweredOff,
  async (off) => {
    if (!off) return
    phase.value = 'enter'
    clockMode.value = 'time'
    await nextTick()
    void playShutCrt()
  },
  { immediate: true },
)

watch(
  () => ui.bootNonce,
  () => {
    if (ui.poweredOff) powerOn()
  },
)

onBeforeUnmount(() => clearTimeout(bootTimer))
</script>

<template>
  <div class="po" :class="phase" role="dialog" aria-modal="true" aria-label="关机待机">
    <div class="po-body" :class="{ show: phase === 'idle' }">
      <SevenSegmentClock :mode="clockMode" :flash="flash" />
      <StandbyBot @power="powerOn" @poke="onPoke" />
      <button type="button" class="po-power" title="开机（P）" aria-label="开机" @click="powerOn">
        <svg viewBox="0 0 16 16" width="28" height="28" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 1h2v7H7zM4.2 3.1l1.4 1.4A4.9 4.9 0 0 0 3 9a5 5 0 0 0 10 0 4.9 4.9 0 0 0-2.6-4.5l1.4-1.4A6.9 6.9 0 0 1 15 9a7 7 0 1 1-14 0 6.9 6.9 0 0 1 3.2-5.9z"
          />
        </svg>
      </button>
      <p v-if="bootLine" class="po-boot">{{ bootLine }}</p>
    </div>
    <i ref="crt" class="po-crt" aria-hidden="true" />
  </div>
</template>

<style scoped>
.po {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: #050607;
  color: var(--accent);
}

.po-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(28px, 6vh, 48px);
  padding: max(24px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom));
  opacity: 0;
  transition: opacity 280ms steps(4);
}

.po-body.show {
  opacity: 1;
}

.po-power {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-top: 8px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: 50%;
  background: #0e1116;
  color: var(--accent);
  cursor: pointer;
  animation: po-breathe 2.4s ease-in-out infinite;
}

.po-power:hover,
.po-power:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 4px;
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 35%, transparent);
}

.po-boot {
  position: absolute;
  bottom: max(28px, env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.16em;
  text-align: center;
  color: var(--accent);
  animation: po-scroll 600ms linear both;
}

.po-crt {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  translate: -50% -50%;
  transform-origin: 50% 50%;
  pointer-events: none;
  opacity: 0;
  background: #e8fff2;
  z-index: 3;
}

@keyframes po-breathe {
  0%,
  100% {
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 20%, transparent);
    opacity: 0.75;
  }
  50% {
    box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent);
    opacity: 1;
  }
}

@keyframes po-scroll {
  from {
    letter-spacing: 0.4em;
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  to {
    letter-spacing: 0.08em;
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .po-body {
    transition: none;
    opacity: 1;
  }
  .po-power {
    animation: none;
  }
  .po-boot {
    animation: none;
  }
}
</style>
