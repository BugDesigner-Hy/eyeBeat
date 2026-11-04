<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
/** 开机按钮悬停充能 0→1，合圆后才可点击 */
const charge = ref(0)
const hovering = ref(false)

const RING_R = 27
const RING_C = 2 * Math.PI * RING_R
const CHARGE_MS = 1400
const DRAIN_MS = 520
const TICKS = 16

const armed = computed(() => reduceMotion || charge.value >= 0.995)
const tickOn = computed(() => Math.round(charge.value * TICKS))
/** 断点间隙随充能收拢，合圆时变成实线 */
const ringDash = computed(() => {
  const p = charge.value
  const dash = 2.2 + p * (RING_C - 2.2)
  const gap = Math.max(0, (1 - p) * 7.5)
  return `${dash.toFixed(2)} ${gap.toFixed(2)}`
})

let bootTimer = 0
let chargeRaf = 0
let chargeDir = 0
let chargeAt = 0
let chargeFrom = 0

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
  bootLine.value = 'EYEBEAT · BOOT OK'
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

function onPowerClick() {
  if (!armed.value) return
  powerOn()
}

function setChargeTarget(dir: 1 | -1) {
  chargeDir = dir
  chargeFrom = charge.value
  chargeAt = performance.now()
  if (!chargeRaf) chargeRaf = requestAnimationFrame(tickCharge)
}

function tickCharge(now: number) {
  chargeRaf = 0
  const dur = chargeDir > 0 ? CHARGE_MS : DRAIN_MS
  const t = Math.min(1, (now - chargeAt) / dur)
  const eased = chargeDir > 0 ? 1 - (1 - t) ** 3 : t * t
  charge.value = chargeDir > 0 ? chargeFrom + (1 - chargeFrom) * eased : chargeFrom * (1 - eased)
  if (t < 1 && (chargeDir > 0 ? hovering.value : !hovering.value)) {
    chargeRaf = requestAnimationFrame(tickCharge)
    return
  }
  if (chargeDir > 0 && hovering.value) charge.value = 1
  if (chargeDir < 0 && !hovering.value) charge.value = 0
}

function onPowerEnter() {
  hovering.value = true
  if (reduceMotion) {
    charge.value = 1
    return
  }
  setChargeTarget(1)
}

function onPowerLeave() {
  hovering.value = false
  if (reduceMotion) {
    charge.value = 0
    return
  }
  setChargeTarget(-1)
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
    charge.value = 0
    hovering.value = false
    cancelAnimationFrame(chargeRaf)
    chargeRaf = 0
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

onBeforeUnmount(() => {
  clearTimeout(bootTimer)
  cancelAnimationFrame(chargeRaf)
})
</script>

<template>
  <div class="po" :class="phase" role="dialog" aria-modal="true" aria-label="关机待机">
    <div class="po-body" :class="{ show: phase === 'idle' }">
      <SevenSegmentClock :mode="clockMode" :flash="flash" />
      <StandbyBot @power="powerOn" @poke="onPoke" />
      <button
        type="button"
        class="po-power"
        :class="{ armed, charging: hovering && !armed }"
        :style="{ '--p': charge.toFixed(3) }"
        :title="armed ? '开机（P）' : '悬停充能合圆后点击开机'"
        :aria-label="armed ? '开机' : '悬停充能合圆后可开机'"
        :aria-disabled="!armed"
        @pointerenter="onPowerEnter"
        @pointerleave="onPowerLeave"
        @click="onPowerClick"
      >
        <svg class="po-ring" viewBox="0 0 64 64" aria-hidden="true">
          <!-- 断点底环：间隙随充能收拢至合圆 -->
          <circle
            class="po-ring-seam"
            cx="32"
            cy="32"
            :r="RING_R"
            fill="none"
            :stroke-dasharray="ringDash"
            stroke-linecap="butt"
            transform="rotate(-90 32 32)"
          />
          <!-- 刻度点逐步点亮 -->
          <g class="po-ticks">
            <circle
              v-for="i in TICKS"
              :key="i"
              class="po-tick"
              :class="{ on: i <= tickOn }"
              :cx="32 + RING_R * Math.cos((-90 + (i - 0.5) * (360 / TICKS)) * (Math.PI / 180))"
              :cy="32 + RING_R * Math.sin((-90 + (i - 0.5) * (360 / TICKS)) * (Math.PI / 180))"
              r="1.4"
            />
          </g>
        </svg>
        <span class="po-power-face">
          <svg viewBox="0 0 16 16" width="28" height="28" aria-hidden="true">
            <path
              fill="currentColor"
              d="M7 1h2v7H7zM4.2 3.1l1.4 1.4A4.9 4.9 0 0 0 3 9a5 5 0 0 0 10 0 4.9 4.9 0 0 0-2.6-4.5l1.4-1.4A6.9 6.9 0 0 1 15 9a7 7 0 1 1-14 0 6.9 6.9 0 0 1 3.2-5.9z"
            />
          </svg>
        </span>
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
  --p: 0;
  position: relative;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin-top: 8px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: color-mix(in srgb, var(--accent) calc(55% + var(--p) * 45%), #5a6570);
  cursor: default;
  opacity: 0.32;
  filter: brightness(0.72) saturate(0.7);
  transition:
    opacity 280ms var(--ease-out, ease),
    filter 280ms var(--ease-out, ease);
}

.po-power:hover,
.po-power:focus-visible,
.po-power.charging,
.po-power.armed {
  opacity: 1;
  filter: none;
}

.po-power.armed {
  cursor: pointer;
  animation: po-breathe 2.4s ease-in-out infinite;
}

.po-power:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 6px;
}

.po-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.po-ring-seam {
  stroke: color-mix(in srgb, var(--accent) calc(35% + var(--p) * 65%), transparent);
  stroke-width: 2;
  transition: stroke 80ms linear;
  filter: drop-shadow(0 0 calc(2px + var(--p) * 8px) color-mix(in srgb, var(--accent) calc(var(--p) * 55%), transparent));
}

.po-tick {
  fill: color-mix(in srgb, var(--accent) 22%, transparent);
  transition: fill 120ms steps(2);
}

.po-tick.on {
  fill: var(--accent);
  filter: drop-shadow(0 0 3px var(--accent));
}

.po-power-face {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent) calc(30% + var(--p) * 50%), transparent);
  background: color-mix(in srgb, var(--accent) calc(var(--p) * 88%), #0e1116);
  color: color-mix(in srgb, var(--bg) calc(var(--p) * 100%), var(--accent));
  box-shadow: 0 0 calc(var(--p) * 18px) color-mix(in srgb, var(--accent) calc(var(--p) * 45%), transparent);
  transition: none;
}

.po-power.armed .po-power-face {
  color: var(--bg);
  background: var(--accent);
  border-color: var(--accent);
}

.po-power.armed:hover .po-power-face,
.po-power.armed:focus-visible .po-power-face {
  background: #fff;
  border-color: #fff;
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 50%, transparent);
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
  .po-power.armed {
    animation: none;
  }
  .po-boot {
    animation: none;
  }
}
</style>
