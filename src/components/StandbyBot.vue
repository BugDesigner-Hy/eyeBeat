<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PixelIcon from './PixelIcon.vue'
import RobotEyes, { type EyeCue } from './RobotEyes.vue'

const emit = defineEmits<{ power: []; poke: [] }>()

const mad = ref(false)
const pressing = ref(false)
const heat = ref(0)
const dizzy = ref(false)
const bootFill = ref(0)
const botAnim = ref<'hop' | 'tilt' | 'squash' | 'wiggle' | null>(null)
const petting = ref(false)
const petTag = ref('')
const petTagOn = ref(false)
const pokeTag = ref('')
const pokeTagOn = ref(false)

interface Floater {
  id: number
  x: number
  delay: number
  scale: number
  drift: number
  kind: 'heart' | 'star' | 'zzz' | 'bang'
}

const floaters = ref<Floater[]>([])
const pokeCue = ref<EyeCue | null>(null)
const eyePoke = ref(0)

const PET_TAGS = ['// purr~', '// soft', '// 蹭蹭', '// cozy', '// 呼…', '// warm']

/** 短按轮换的表情包 */
const POKE_REACTS: {
  cue: EyeCue
  tag: string
  fx: Floater['kind'] | 'none'
  anim: NonNullable<typeof botAnim.value>
}[] = [
  { cue: 'love', tag: '// love', fx: 'heart', anim: 'hop' },
  { cue: 'surprise', tag: '// !?', fx: 'bang', anim: 'squash' },
  { cue: 'shy', tag: '// shy', fx: 'none', anim: 'tilt' },
  { cue: 'sleepy', tag: '// zzz', fx: 'zzz', anim: 'squash' },
  { cue: 'fx', tag: '// wow', fx: 'star', anim: 'wiggle' },
]

const root = ref<HTMLElement>()
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

let madTimer = 0
let dizzyTimer = 0
let pokeCueTimer = 0
let botAnimTimer = 0
let petTagTimer = 0
let pokeTagTimer = 0
let floaterId = 0
let clicks = 0
let clickReset = 0
let held = false
let raf = 0
let bootRaf = 0
let bootDir = 0
let bootAt = 0
let bootFrom = 0
let lastAngle: number | null = null
let lastMoveAt = 0
let tagCursor = 0
let pokeCursor = 0

/** 约 3 圈温热，约 7 圈才眩晕；停转后慢慢散热 */
const HEAT_GAIN = 0.022
const HEAT_DECAY = 0.0024
const RING_MIN = 36
const RING_MAX = 320
const SPIN_MIN = 0.06
/** 长按充能至满的时间 */
const BOOT_MS = 1350
const BOOT_DRAIN_MS = 420
/** 低于此充能松手视为短按互动 */
const POKE_FILL = 0.16
const EFFORT_TAGS = ['// hnnng', '// 蓄力…', '// 用力！', '// 再一下']

const tempC = computed(() => Math.round(38 + heat.value * 48))
const eyeCue = computed<EyeCue | null>(() => {
  if (dizzy.value) return 'dizzy'
  if (pressing.value && bootFill.value > 0.05) return 'effort'
  if (pokeCue.value) return pokeCue.value
  if (petting.value) return 'pet'
  if (heat.value > 0.55) return 'fx'
  if (heat.value > 0.22) return 'mode'
  return null
})
const effortTag = computed(() => {
  if (bootFill.value < 0.08) return ''
  if (bootFill.value >= 0.995) return '// BOOT!'
  return EFFORT_TAGS[Math.min(EFFORT_TAGS.length - 1, Math.floor(bootFill.value * EFFORT_TAGS.length))]
})

function setBootDir(dir: 1 | -1) {
  bootDir = dir
  bootFrom = bootFill.value
  bootAt = performance.now()
  if (!bootRaf) bootRaf = requestAnimationFrame(tickBoot)
}

function tickBoot(now: number) {
  bootRaf = 0
  const dur = bootDir > 0 ? BOOT_MS : BOOT_DRAIN_MS
  const t = Math.min(1, (now - bootAt) / Math.max(1, dur))
  const eased = bootDir > 0 ? 1 - (1 - t) ** 2.4 : t * t
  bootFill.value = bootDir > 0 ? bootFrom + (1 - bootFrom) * eased : bootFrom * (1 - eased)

  if (bootDir > 0 && bootFill.value >= 0.995 && pressing.value && !held) {
    bootFill.value = 1
    held = true
    pressing.value = false
    emit('power')
    return
  }

  const cont = bootDir > 0 ? pressing.value && !held : !pressing.value && bootFill.value > 0.001
  if (t < 1 && cont) {
    bootRaf = requestAnimationFrame(tickBoot)
    return
  }
  if (bootDir < 0 && !pressing.value) bootFill.value = 0
}

function spawnFloaters(kind: Floater['kind']) {
  const n = reduceMotion ? 1 : kind === 'bang' ? 2 : 3 + Math.floor(Math.random() * 2)
  for (let i = 0; i < n; i++) {
    const id = ++floaterId
    floaters.value.push({
      id,
      kind,
      x: (Math.random() - 0.5) * 64,
      delay: i * 70,
      scale: kind === 'zzz' ? 1 : 1.4 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 36,
    })
    window.setTimeout(() => {
      floaters.value = floaters.value.filter((h) => h.id !== id)
    }, 980 + i * 70)
  }
}

function reactPoke() {
  const react = POKE_REACTS[pokeCursor % POKE_REACTS.length]
  pokeCursor++
  if (react.fx !== 'none') spawnFloaters(react.fx)
  pokeCue.value = react.cue
  eyePoke.value++
  botAnim.value = react.anim
  pokeTag.value = react.tag
  pokeTagOn.value = true
  window.clearTimeout(pokeCueTimer)
  window.clearTimeout(botAnimTimer)
  window.clearTimeout(pokeTagTimer)
  pokeCueTimer = window.setTimeout(() => {
    pokeCue.value = null
  }, 780)
  botAnimTimer = window.setTimeout(() => {
    botAnim.value = null
  }, 480)
  pokeTagTimer = window.setTimeout(() => {
    pokeTagOn.value = false
  }, 1200)
}

function onPetEnter() {
  if (dizzy.value) return
  petting.value = true
  eyePoke.value++
  petTag.value = PET_TAGS[tagCursor % PET_TAGS.length]
  tagCursor++
  petTagOn.value = true
  window.clearTimeout(petTagTimer)
  // 标签停一会再淡出，表情持续到鼠标离开
  petTagTimer = window.setTimeout(() => {
    petTagOn.value = false
  }, 1600)
}

function onPetLeave() {
  petting.value = false
  // 标签若还在，让它自然收尾
}

function onDown(e: PointerEvent) {
  if (e.button !== 0 || dizzy.value) return
  held = false
  pressing.value = true
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  eyePoke.value++
  setBootDir(1)
}

function onUp(e: PointerEvent) {
  if (e.button !== 0) return
  const fill = bootFill.value
  pressing.value = false
  if (held) {
    // 已触发开机，水位留着等离场
    return
  }
  setBootDir(-1)
  if (dizzy.value) return
  if (fill < POKE_FILL) {
    emit('poke')
    reactPoke()
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
}

function triggerDizzy() {
  if (dizzy.value || reduceMotion) return
  dizzy.value = true
  heat.value = 1
  eyePoke.value++
  lastAngle = null
  clearTimeout(dizzyTimer)
  dizzyTimer = window.setTimeout(() => {
    dizzy.value = false
    heat.value = 0
    lastAngle = null
  }, 3000)
}

function onMove(e: PointerEvent) {
  if (dizzy.value || reduceMotion || !root.value) return
  const r = root.value.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const dx = e.clientX - cx
  const dy = e.clientY - cy
  const dist = Math.hypot(dx, dy)
  if (dist < RING_MIN || dist > RING_MAX) {
    lastAngle = null
    return
  }
  const angle = Math.atan2(dy, dx)
  const now = performance.now()
  if (lastAngle != null && now - lastMoveAt < 80) {
    let d = angle - lastAngle
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    const spin = Math.abs(d)
    // 过滤抖动，只认像样的弧线
    if (spin > SPIN_MIN) {
      heat.value = Math.min(1, heat.value + spin * HEAT_GAIN)
      if (heat.value >= 0.995) triggerDizzy()
    }
  }
  lastAngle = angle
  lastMoveAt = now
}

function tick() {
  raf = requestAnimationFrame(tick)
  if (dizzy.value) return
  const cooling = performance.now() - lastMoveAt > 180
  if (cooling && heat.value > 0) {
    heat.value = Math.max(0, heat.value - HEAT_DECAY * 16)
    if (heat.value < 0.02) heat.value = 0
  }
}

onMounted(() => {
  if (reduceMotion) return
  window.addEventListener('pointermove', onMove, { passive: true })
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  clearTimeout(clickReset)
  clearTimeout(madTimer)
  clearTimeout(dizzyTimer)
  clearTimeout(pokeCueTimer)
  clearTimeout(botAnimTimer)
  clearTimeout(petTagTimer)
  clearTimeout(pokeTagTimer)
  cancelAnimationFrame(raf)
  cancelAnimationFrame(bootRaf)
  window.removeEventListener('pointermove', onMove)
})
</script>

<template>
  <div
    ref="root"
    class="bot-wrap"
    :style="{ '--heat': heat.toFixed(3), '--charge': bootFill.toFixed(3) }"
  >
    <span v-if="heat > 0.08 || dizzy" class="temp" aria-hidden="true">
      {{ dizzy ? 'DIZZY' : `${tempC}°C` }}
    </span>
    <div class="bot-stage">
      <i
        v-for="f in floaters"
        :key="f.id"
        class="floater"
        :class="f.kind"
        :style="{
          '--x': `${f.x}px`,
          '--drift': `${f.drift}px`,
          '--delay': `${f.delay}ms`,
          '--sc': f.scale,
        }"
        aria-hidden="true"
      >
        <PixelIcon v-if="f.kind === 'heart'" name="heart" :scale="f.scale" />
        <span v-else class="floater-txt">{{ f.kind === 'star' ? '✦' : f.kind === 'zzz' ? 'z' : '!' }}</span>
      </i>
      <span v-if="petTag" class="pet-tag" :class="{ on: petTagOn }" aria-hidden="true">{{ petTag }}</span>
      <span v-if="pokeTag" class="poke-tag" :class="{ on: pokeTagOn }" aria-hidden="true">{{ pokeTag }}</span>
      <span v-if="effortTag" class="boot-tag" aria-hidden="true">{{ effortTag }}</span>
      <button
        type="button"
        class="bot px-cut"
        :class="[
          botAnim,
          { mad, pressing, dizzy, hot: heat > 0.15, petting, charging: bootFill > 0.05 },
        ]"
        :style="{
          background: dizzy
            ? '#ff6b4a'
            : heat > 0.08
              ? `color-mix(in srgb, #ff7a45 ${Math.round(heat * 100)}%, var(--accent))`
              : undefined,
        }"
        title="短按互动 · 长按充能开机 · 绕圈会升温"
        aria-label="待机机器人，短按互动，长按充能开机，绕圈升温"
        @pointerenter="onPetEnter"
        @pointerleave="onPetLeave"
        @pointerdown="onDown"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <RobotEyes :on="true" :analyser="null" :scale="8" :cue="eyeCue" :poke="eyePoke" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.bot-wrap {
  --charge: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

.bot-stage {
  position: relative;
  width: 96px;
  height: 96px;
}

.bot {
  position: relative;
  z-index: 1;
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
  transition: background 120ms linear, box-shadow 180ms var(--ease-out);
  box-shadow:
    0 0 calc(8px + var(--heat, 0) * 28px) color-mix(in srgb, #ff6b4a calc(var(--heat, 0) * 80%), transparent),
    0 0 calc(var(--charge) * 18px) color-mix(in srgb, #dfffe8 calc(var(--charge) * 40%), transparent);
}

.bot.charging:not(.mad):not(.dizzy):not(.hop):not(.tilt):not(.squash):not(.wiggle) {
  filter: brightness(calc(1 + var(--charge) * 0.22)) contrast(calc(1 + var(--charge) * 0.08));
  animation: bot-strain calc(90ms - var(--charge) * 40ms) steps(2) infinite;
}

.bot :deep(.robot-eyes) {
  position: relative;
  z-index: 2;
}

.boot-tag {
  position: absolute;
  top: -20px;
  left: 50%;
  z-index: 4;
  translate: -50% 0;
  font-family: var(--font-pixel-mix);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: #e8fff2;
  text-shadow: 0 0 6px var(--accent);
  pointer-events: none;
  white-space: nowrap;
  animation: boot-tag-jitter 90ms steps(2) infinite;
}

.bot.hop {
  animation: bot-hop 420ms cubic-bezier(0.34, 1.5, 0.64, 1);
}

.bot.tilt {
  animation: bot-tilt 480ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.bot.squash {
  animation: bot-squash 420ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.bot.wiggle {
  animation: bot-wiggle 90ms steps(2) 5;
}

.bot.petting:not(.dizzy):not(.mad):not(.hop):not(.tilt):not(.squash):not(.wiggle):not(.charging) {
  animation: bot-pet 1.2s ease-in-out infinite;
}

@keyframes bot-strain {
  0%,
  100% {
    translate: 0 0;
  }
  25% {
    translate: calc(var(--charge) * 2px) calc(var(--charge) * -1.5px);
  }
  50% {
    translate: calc(var(--charge) * -2px) calc(var(--charge) * 1.5px);
  }
  75% {
    translate: calc(var(--charge) * 1.5px) 0;
  }
}

@keyframes boot-tag-jitter {
  0%,
  100% {
    translate: -50% 0;
  }
  50% {
    translate: calc(-50% + 1px) -1px;
  }
}

.pet-tag,
.poke-tag {
  position: absolute;
  left: 50%;
  z-index: 3;
  translate: -50% 4px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, #0a0c0f 88%, var(--accent));
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.06em;
  line-height: 16px;
  color: var(--accent);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  filter: blur(2px);
  transition:
    opacity 220ms steps(3),
    translate 280ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 220ms steps(2);
}

.pet-tag {
  top: -22px;
}

.poke-tag {
  top: -22px;
  color: #ffc6ef;
  border-color: color-mix(in srgb, #ff6ad5 55%, transparent);
}

.pet-tag.on,
.poke-tag.on {
  opacity: 1;
  translate: -50% 0;
  filter: none;
}

.pet-tag::after,
.poke-tag::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 6px;
  height: 6px;
  border-right: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, #0a0c0f 88%, var(--accent));
  translate: -50% 0;
  rotate: 45deg;
}

.poke-tag::after {
  border-color: color-mix(in srgb, #ff6ad5 55%, transparent);
}

.floater {
  position: absolute;
  left: 50%;
  bottom: 58%;
  z-index: 2;
  pointer-events: none;
  translate: calc(-50% + var(--x)) 0;
  animation: floater-up 960ms steps(8) var(--delay) both;
}

.floater.heart {
  color: #ff6ad5;
  filter: drop-shadow(0 0 6px color-mix(in srgb, #ff6ad5 55%, transparent));
}

.floater.star {
  color: #ffe566;
  filter: drop-shadow(0 0 6px color-mix(in srgb, #ffe566 50%, transparent));
}

.floater.zzz {
  color: color-mix(in srgb, var(--accent) 80%, #fff);
}

.floater.bang {
  color: #ffb347;
  filter: drop-shadow(0 0 6px color-mix(in srgb, #ffb347 50%, transparent));
}

.floater-txt {
  display: block;
  font-family: var(--font-pixel-mix);
  font-size: 14px;
  line-height: 1;
  letter-spacing: 0.04em;
}

@keyframes floater-up {
  0% {
    opacity: 0;
    transform: translate(0, 8px) scale(0.4) rotate(-12deg);
  }
  12% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--drift), -72px) scale(var(--sc)) rotate(14deg);
  }
}

@keyframes bot-hop {
  0% {
    translate: 0 0;
  }
  35% {
    translate: 0 -10px;
  }
  100% {
    translate: 0 0;
  }
}

@keyframes bot-tilt {
  0% {
    rotate: 0deg;
  }
  40% {
    rotate: -12deg;
  }
  100% {
    rotate: 0deg;
  }
}

@keyframes bot-squash {
  0% {
    scale: 1 1;
  }
  35% {
    scale: 1.12 0.82;
  }
  60% {
    scale: 0.92 1.1;
  }
  100% {
    scale: 1 1;
  }
}

@keyframes bot-wiggle {
  from {
    translate: -3px 0;
  }
  to {
    translate: 3px 0;
  }
}

@keyframes bot-pet {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 2px;
  }
}

.bot:hover,
.bot:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 6px;
}

.bot:hover:not(.hot):not(.dizzy),
.bot:focus-visible:not(.hot):not(.dizzy) {
  background: #fff;
}

.bot.pressing {
  translate: 0 2px;
}

.bot.mad {
  animation: bot-shake 80ms steps(2) 8;
}

.bot.dizzy {
  animation: bot-dizzy 90ms steps(2) infinite;
  color: #1a0806;
}

.bot.hot:not(.dizzy) {
  animation: bot-shimmer 240ms steps(2) infinite;
}

.temp {
  order: -1;
  min-height: 16px;
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.08em;
  line-height: 16px;
  color: #ffc58a;
  text-shadow: 0 0 10px color-mix(in srgb, #ff6b4a 65%, transparent);
  pointer-events: none;
  white-space: nowrap;
}

.bot-wrap:has(.dizzy) .temp {
  color: #ffd0c4;
  animation: temp-blink 160ms steps(2) infinite;
}

@keyframes bot-shake {
  from {
    translate: -4px 0;
  }
  to {
    translate: 4px 0;
  }
}

@keyframes bot-dizzy {
  0% {
    translate: -5px 2px;
    rotate: -8deg;
  }
  50% {
    translate: 5px -2px;
    rotate: 8deg;
  }
  100% {
    translate: -5px 2px;
    rotate: -8deg;
  }
}

@keyframes bot-shimmer {
  from {
    filter: brightness(1);
  }
  to {
    filter: brightness(1.12);
  }
}

@keyframes temp-blink {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bot.mad,
  .bot.dizzy,
  .bot.hot,
  .bot.hop,
  .bot.tilt,
  .bot.squash,
  .bot.wiggle,
  .bot.petting,
  .bot.charging,
  .boot-tag,
  .floater,
  .bot-wrap:has(.dizzy) .temp {
    animation: none;
  }
  .pet-tag,
  .poke-tag {
    transition: none;
  }
  .floater {
    opacity: 1;
  }
}
</style>
