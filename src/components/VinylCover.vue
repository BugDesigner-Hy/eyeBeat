<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import CoverImage from './CoverImage.vue'

const props = defineProps<{
  sources: string[]
  playing: boolean
  analyser: AnalyserNode | null
}>()

const settings = useSettingsStore()
const vinyl = computed(() => settings.coverVinyl)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const squareEl = ref<HTMLElement>()
const discEl = ref<HTMLElement>()
const spinEl = ref<HTMLElement>()
const shineEl = ref<HTMLElement>()
const scanEl = ref<HTMLElement>()

const switching = ref(false)
const showVinyl = ref(settings.coverVinyl)
const showSquare = ref(!settings.coverVinyl)

let angle = 0
let vel = 0
let spinning = false
let raf = 0
let data: Uint8Array<ArrayBuffer> | null = null
let ptrX = 0
let ptrY = 0
let ptrMoved = false

/** 约 6 RPM：vel × (1000/60) °/帧 @60fps，比实体黑胶更慢一截 */
const SPIN = 0.036
const FRICTION = 0.978
const STOP = 0.0015
const TAP = 10
const WIPE_MS = 680

function bass(): number {
  const a = props.analyser
  if (!a || !props.playing) return 0
  if (!data || data.length !== a.frequencyBinCount) data = new Uint8Array(a.frequencyBinCount)
  a.getByteFrequencyData(data)
  let sum = 0
  for (let k = 1; k < 7; k++) sum += data[k]
  return sum / (6 * 255)
}

function applySpin() {
  const el = spinEl.value
  if (el) el.style.transform = `rotate(${angle}deg)`
}

function tick() {
  raf = 0
  if (!showVinyl.value) return
  if (spinning) vel = SPIN
  else {
    vel *= FRICTION
    if (vel < STOP) vel = 0
  }
  if (vel > 0) {
    angle = (angle + vel * (1000 / 60)) % 360
    applySpin()
  }
  const shine = shineEl.value
  if (shine) {
    const b = bass()
    shine.style.opacity = String(0.18 + b * 0.55)
  }
  if (spinning || vel > 0 || (props.playing && props.analyser)) {
    raf = requestAnimationFrame(tick)
  }
}

function ensureTick() {
  if (!raf && showVinyl.value && !reduceMotion) raf = requestAnimationFrame(tick)
}

watch(
  () => [props.playing, showVinyl.value] as const,
  ([on, v]) => {
    if (reduceMotion || !v) {
      spinning = false
      vel = 0
      return
    }
    spinning = on
    if (on) vel = SPIN
    ensureTick()
  },
  { immediate: true },
)

watch(
  () => props.analyser,
  () => {
    if (showVinyl.value && props.playing) ensureTick()
  },
)

function matrixAngle(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return angle
  const m = new DOMMatrixReadOnly(t)
  return (Math.atan2(m.b, m.a) * 180) / Math.PI
}

function clearWipe(el: HTMLElement | undefined) {
  if (!el) return
  el.style.clipPath = ''
  el.style.zIndex = ''
  el.getAnimations().forEach((a) => a.cancel())
}

async function runSwitch(toVinyl: boolean) {
  if (switching.value) return
  switching.value = true
  settings.coverVinyl = toVinyl

  if (reduceMotion) {
    showVinyl.value = toVinyl
    showSquare.value = !toVinyl
    switching.value = false
    if (toVinyl) ensureTick()
    return
  }

  // 双层叠放：扫描线上方露出新封面，下方保留旧封面
  showSquare.value = true
  showVinyl.value = true
  await nextTick()

  const incoming = toVinyl ? discEl.value : squareEl.value
  const outgoing = toVinyl ? squareEl.value : discEl.value
  const scan = scanEl.value
  if (!incoming || !outgoing) {
    showVinyl.value = toVinyl
    showSquare.value = !toVinyl
    switching.value = false
    return
  }

  clearWipe(incoming)
  clearWipe(outgoing)

  incoming.style.zIndex = '2'
  outgoing.style.zIndex = '1'
  incoming.style.clipPath = 'inset(0 0 100% 0)'
  outgoing.style.clipPath = 'inset(0 0 0 0)'

  if (toVinyl) {
    if (spinEl.value) angle = matrixAngle(spinEl.value)
    applySpin()
    spinning = props.playing
    if (spinning) vel = SPIN
    ensureTick()
  } else {
    spinning = false
    vel = 0
  }

  const wipe = { duration: WIPE_MS, easing: 'linear', fill: 'forwards' as FillMode }
  const anims: Animation[] = [
    incoming.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], wipe),
    outgoing.animate([{ clipPath: 'inset(0% 0 0 0)' }, { clipPath: 'inset(100% 0 0 0)' }], wipe),
  ]

  if (scan) {
    scan.style.opacity = '1'
    anims.push(
      scan.animate(
        [
          { top: '0%', opacity: 1 },
          { top: '100%', opacity: 1, offset: 0.92 },
          { top: '100%', opacity: 0 },
        ],
        { duration: WIPE_MS, easing: 'linear', fill: 'forwards' },
      ),
    )
  }

  await Promise.all(anims.map((a) => a.finished.catch(() => undefined)))

  if (scan) {
    scan.style.opacity = ''
    scan.style.top = ''
    scan.getAnimations().forEach((a) => a.cancel())
  }
  clearWipe(incoming)
  clearWipe(outgoing)

  showVinyl.value = toVinyl
  showSquare.value = !toVinyl
  if (!toVinyl && spinEl.value) angle = matrixAngle(spinEl.value)

  switching.value = false
}

function onPtrDown(e: PointerEvent) {
  if (e.button !== 0) return
  ptrX = e.clientX
  ptrY = e.clientY
  ptrMoved = false
}

function onPtrMove(e: PointerEvent) {
  if (Math.hypot(e.clientX - ptrX, e.clientY - ptrY) > TAP) ptrMoved = true
}

function onPtrUp(e: PointerEvent) {
  if (e.button !== 0 || ptrMoved || switching.value) return
  void runSwitch(!vinyl.value)
}

onMounted(() => {
  if (showVinyl.value && !reduceMotion) ensureTick()
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div
    class="vc"
    :class="{ vinyl: showVinyl, switching }"
    role="button"
    tabindex="0"
    :aria-pressed="vinyl"
    :aria-label="vinyl ? '切换为方形封面' : '切换为黑胶唱片'"
    title="点击切换封面样式"
    @pointerdown="onPtrDown"
    @pointermove="onPtrMove"
    @pointerup="onPtrUp"
    @keydown.enter.prevent="runSwitch(!vinyl)"
    @keydown.space.prevent="runSwitch(!vinyl)"
  >
    <div v-show="showSquare" ref="squareEl" class="vc-square">
      <CoverImage :sources="sources" />
    </div>

    <div v-show="showVinyl" ref="discEl" class="vc-disc" aria-hidden="true">
      <i class="vc-platter" />
      <div ref="spinEl" class="vc-spin">
        <i class="vc-grooves" />
        <div class="vc-label">
          <CoverImage :sources="sources" />
        </div>
        <i ref="shineEl" class="vc-shine" />
        <i class="vc-hub" />
      </div>
      <i class="vc-arm" :class="{ down: playing }" />
    </div>

    <i ref="scanEl" class="vc-scan" aria-hidden="true" />
  </div>
</template>

<style scoped>
.vc {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
  outline: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}

.vc:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 4px;
}

.vc-square,
.vc-disc {
  position: absolute;
  inset: 0;
}

.vc-disc {
  display: grid;
  place-items: center;
}

/* 转盘垫：比背景亮一档，露出外圈，把唱片从黑底里托出来 */
.vc-platter {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 42%, #2a3340 0%, #1a222c 58%, #12161c 100%);
  box-shadow:
    inset 0 0 0 1px #3a4656,
    inset 0 0 0 3px #151a21,
    0 0 0 1px color-mix(in srgb, var(--accent) 40%, #2a3440),
    0 0 18px color-mix(in srgb, var(--accent) 12%, transparent);
}

.vc-platter::after {
  content: '';
  position: absolute;
  inset: 4%;
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--accent) 28%, transparent);
  opacity: 0.7;
}

.vc-spin {
  position: relative;
  z-index: 1;
  width: 88%;
  height: 88%;
  border-radius: 50%;
  overflow: hidden;
  background: #14181f;
  box-shadow:
    inset 0 0 0 1px #3a4656,
    inset 0 0 0 3px #0e1116,
    0 0 0 2px #1c2430,
    0 2px 10px rgba(0, 0, 0, 0.55);
  will-change: transform;
}

.vc-grooves {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  image-rendering: pixelated;
  background:
    repeating-radial-gradient(
      circle at 50% 50%,
      #1c2430 0 1px,
      #0e1116 1px 2px,
      #2a3440 2px 3px,
      #12161c 3px 5px
    );
  opacity: 1;
}

.vc-label {
  position: absolute;
  inset: 28%;
  border-radius: 50%;
  overflow: hidden;
  box-shadow:
    0 0 0 2px #3a4656,
    0 0 0 3px #0e1116,
    inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.vc-label :deep(.ci) {
  border-radius: 50%;
}

.vc-shine {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0.22;
  background: conic-gradient(
    from 210deg at 50% 50%,
    transparent 0deg,
    color-mix(in srgb, var(--accent) 35%, transparent) 28deg,
    transparent 56deg,
    transparent 180deg,
    rgba(255, 255, 255, 0.12) 200deg,
    transparent 230deg
  );
  mix-blend-mode: screen;
}

.vc-hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6%;
  height: 6%;
  translate: -50% -50%;
  border-radius: 50%;
  background: #050607;
  box-shadow:
    0 0 0 1px #2a3440,
    inset 0 0 0 1px var(--accent);
  pointer-events: none;
}

.vc-arm {
  position: absolute;
  top: 4%;
  right: 10%;
  width: 8%;
  height: 52%;
  transform-origin: 50% 8%;
  transform: rotate(-28deg);
  transition: transform 420ms var(--ease-out);
  pointer-events: none;
  z-index: 2;
}

.vc-arm::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  width: 3px;
  height: 78%;
  translate: -50% 0;
  background: linear-gradient(180deg, #9aa7b5, #5a6674);
  box-shadow: 0 0 0 1px #1a222c;
}

.vc-arm::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 8%;
  width: 10px;
  height: 14px;
  translate: -70% 0;
  background: #7a8794;
  clip-path: polygon(20% 0, 100% 10%, 70% 100%, 0 85%);
  box-shadow: 0 0 0 1px #1a222c;
}

.vc-arm.down {
  transform: rotate(8deg);
}

.vc-scan {
  position: absolute;
  left: -2%;
  right: -2%;
  height: 3px;
  top: 0;
  translate: 0 -50%;
  opacity: 0;
  pointer-events: none;
  z-index: 5;
  background: var(--accent);
  box-shadow:
    0 0 10px var(--accent),
    0 0 2px #fff,
    0 0 28px color-mix(in srgb, var(--accent) 70%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .vc-arm {
    transition: none;
  }

  .vc-arm.down {
    transform: rotate(8deg);
  }
}
</style>
