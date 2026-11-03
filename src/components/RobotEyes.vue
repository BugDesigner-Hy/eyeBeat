<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ on: boolean; analyser: AnalyserNode | null; scale?: number }>(),
  { scale: 3 },
)

const W = 6
const H = 7
const EYES = [0, 4]
/** 关机后眼睛压成的横线高度比例与下沉距离 */
const SHUT_SY = 0.14
const SHUT_DY = 1.2

const root = ref<SVGSVGElement>()
const eyes = ref<SVGGElement[]>([])
const glints = ref<SVGRectElement[]>([])

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

let raf = 0
let data: Uint8Array<ArrayBuffer> | null = null

const pointer = { x: 0, y: 0, at: -Infinity }
const look = { x: 0, y: 0, tx: 0, ty: 0 }
let nextSaccade = 0
let nextBlink = 0
let blinkAt = -Infinity
let doubleBlink = false
let changedAt = -Infinity
let enterAt = -Infinity
let bassSlow = 0
let pulse = 0
let hover = 0
let press = 0
let hovering = false
let pressing = false

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const easeIn = (p: number) => p * p * p
const back = (p: number) => 1 + 3.2 * Math.pow(p - 1, 3) + 2.2 * Math.pow(p - 1, 2)
const flicker = (t: number) => (Math.floor(t / 45) % 2 ? 0.25 : 1)

function bass(): number {
  const a = props.analyser
  if (!a) return 0
  if (!data || data.length !== a.frequencyBinCount) data = new Uint8Array(a.frequencyBinCount)
  a.getByteFrequencyData(data)
  let sum = 0
  for (let k = 1; k < 7; k++) sum += data[k]
  return sum / (6 * 255)
}

/** 0 = 全闭，1 = 全开 */
function lid(t: number): number {
  let p = (t - blinkAt) / 150
  if (doubleBlink && p > 1.3 && p < 2.3) p -= 1.3
  if (p < 0 || p > 1) return 1
  return 1 - Math.sin(Math.PI * p) * 0.92
}

function updateLook(t: number) {
  const svg = root.value!
  if (hovering || t - pointer.at < 2500) {
    const r = svg.getBoundingClientRect()
    const reach = hovering ? r.width * 0.7 : 260
    look.tx = clamp((pointer.x - (r.left + r.width / 2)) / reach, -1, 1)
    look.ty = clamp((pointer.y - (r.top + r.height / 2)) / reach, -1, 1)
    nextSaccade = t + rand(600, 1400)
  } else if (t > nextSaccade) {
    const centered = Math.random() < 0.35
    look.tx = centered ? 0 : rand(-1, 1)
    look.ty = centered ? 0 : rand(-0.8, 0.6)
    nextSaccade = t + rand(900, 2600)
  }
  const k = hovering ? 0.35 : 0.22
  look.x += (look.tx - look.x) * k
  look.y += (look.ty - look.y) * k
}

interface Pose {
  sx: number
  sy: number
  dx: number
  dy: number
  alpha: number
  glint: number
}

function awake(t: number): Pose {
  if (t > nextBlink) {
    blinkAt = t
    doubleBlink = Math.random() < 0.22
    nextBlink = t + rand(2200, 5200)
  }
  const b = bass()
  bassSlow += (b - bassSlow) * 0.05
  if (b - bassSlow > 0.09) pulse = Math.min(1, pulse + (b - bassSlow) * 4)
  pulse *= 0.86

  const k = clamp((t - enterAt) / 280, 0, 1)
  const surprise = k < 1 ? Math.sin(Math.PI * k) * 0.28 : 0
  const pose: Pose = {
    sx: 1 + pulse * 0.08 + surprise * 0.4,
    sy: lid(t) * (1 + pulse * 0.12 + hover * 0.1 + surprise) * (1 - press * 0.45),
    dx: look.x * lerp(0.7, 1, hover),
    dy: look.y * lerp(0.5, 0.9, hover) - hover * 0.15 + press * 0.6,
    alpha: 1,
    glint: clamp(0.55 + pulse * 0.45 + hover * 0.3 + surprise * 2, 0, 1),
  }

  const since = t - changedAt
  if (since < 200) {
    return { ...pose, sx: 1.15, sy: SHUT_SY, dx: 0, dy: SHUT_DY, alpha: flicker(since), glint: 0 }
  }
  if (since < 580) {
    const p = (since - 200) / 380
    return {
      ...pose,
      sx: lerp(1.15, pose.sx, p),
      sy: lerp(SHUT_SY, pose.sy, back(p)),
      dx: pose.dx * p,
      dy: lerp(SHUT_DY, pose.dy, p),
      glint: pose.glint * p,
    }
  }
  return pose
}

function asleep(t: number): Pose {
  const breath = 0.5 + 0.5 * Math.sin(t / 650)
  const rest: Pose = {
    sx: 1.15,
    sy: SHUT_SY + hover * 0.26 - press * 0.06,
    dx: look.x * 0.6 * hover,
    dy: SHUT_DY - hover * 0.5,
    alpha: lerp(0.5 + breath * 0.4, 1, hover),
    glint: hover * 0.8,
  }

  const since = t - changedAt
  if (since < 140) {
    return { sx: 1.1, sy: 1.25, dx: look.x * 0.3, dy: -0.2, alpha: 1, glint: 1 }
  }
  if (since < 480) {
    const p = easeIn((since - 140) / 340)
    return {
      sx: lerp(1.1, 1.15, p),
      sy: lerp(1.25, SHUT_SY, p),
      dx: look.x * 0.3 * (1 - p),
      dy: lerp(-0.2, SHUT_DY, p),
      alpha: 1,
      glint: 1 - p,
    }
  }
  if (since < 760) return { ...rest, alpha: flicker(since) * rest.alpha, glint: 0 }
  return rest
}

function apply(p: Pose) {
  EYES.forEach((ex, i) => {
    const cx = ex + 1
    const cy = H / 2
    const g = eyes.value[i]
    g?.setAttribute(
      'transform',
      `translate(${p.dx} ${p.dy}) translate(${cx} ${cy}) scale(${p.sx} ${p.sy}) translate(${-cx} ${-cy})`,
    )
    g?.setAttribute('opacity', String(p.alpha))
    const gl = glints.value[i]
    if (gl) {
      gl.setAttribute('x', String(ex + 0.6 + look.x * 0.55))
      gl.setAttribute('y', String(1.3 + look.y * 0.9))
      gl.setAttribute('opacity', String(p.glint))
    }
  })
}

function frame(t: number) {
  if (!root.value) return
  updateLook(t)
  hover += ((hovering ? 1 : 0) - hover) * 0.2
  press += ((pressing ? 1 : 0) - press) * 0.3
  apply(props.on ? awake(t) : asleep(t))
  raf = requestAnimationFrame(frame)
}

function applyStatic() {
  apply(
    props.on
      ? { sx: 1, sy: 1, dx: 0, dy: 0, alpha: 1, glint: 0.6 }
      : { sx: 1.15, sy: SHUT_SY, dx: 0, dy: SHUT_DY, alpha: 0.8, glint: 0 },
  )
}

watch(
  () => props.on,
  (on) => {
    const t = performance.now()
    changedAt = t
    pressing = false
    if (on) nextBlink = t + rand(1500, 3000)
    if (reduced) applyStatic()
  },
)

function onPointer(e: PointerEvent) {
  pointer.x = e.clientX
  pointer.y = e.clientY
  pointer.at = performance.now()
}

function onHost(e: Event) {
  switch (e.type) {
    case 'pointerenter':
      hovering = true
      enterAt = performance.now()
      break
    case 'pointerleave':
      hovering = false
      pressing = false
      break
    case 'pointerdown':
      pressing = true
      break
    case 'pointerup':
      pressing = false
      break
  }
}

const HOST_EVENTS = ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup'] as const
let host: Element | null = null

onMounted(() => {
  if (reduced) return applyStatic()
  const t = performance.now()
  if (props.on) changedAt = t
  nextBlink = t + rand(1500, 3000)
  nextSaccade = t + 800
  window.addEventListener('pointermove', onPointer, { passive: true })
  host = root.value?.closest('button') ?? null
  HOST_EVENTS.forEach((n) => host?.addEventListener(n, onHost))
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('pointermove', onPointer)
  HOST_EVENTS.forEach((n) => host?.removeEventListener(n, onHost))
})
</script>

<template>
  <svg
    ref="root"
    class="robot-eyes"
    :viewBox="`-1 -1 ${W + 2} ${H + 2}`"
    :width="(W + 2) * scale"
    :height="(H + 2) * scale"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <g v-for="x in EYES" :key="x" ref="eyes">
      <rect :x="x" y="0" width="2" :height="H" class="eye" />
      <rect ref="glints" :x="x + 0.6" y="1.3" width="0.8" height="0.8" class="glint" />
    </g>
  </svg>
</template>

<style scoped>
.robot-eyes {
  display: block;
  overflow: visible;
}

.eye {
  fill: currentColor;
}

.glint {
  fill: var(--accent);
}
</style>
