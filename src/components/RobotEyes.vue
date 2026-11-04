<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** 播放栏控件触发的眼神反应 */
export type EyeCue =
  | 'prev'
  | 'next'
  | 'mode'
  | 'lyrics'
  | 'fx'
  | 'mute'
  | 'unmute'
  | 'volume'
  | 'seek'
  | 'detail'
  | 'collapse'
  | 'dizzy'
  | 'love'
  | 'pet'
  | 'surprise'
  | 'shy'
  | 'sleepy'
  | 'effort'

const props = withDefaults(
  defineProps<{
    on: boolean
    analyser: AnalyserNode | null
    scale?: number
    /** 悬停中的控件（持续注视） */
    cue?: EyeCue | null
    /** 递增以触发一次短促爆发（点击） */
    poke?: number
  }>(),
  { scale: 3, cue: null, poke: 0 },
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

let burstUntil = 0
let burstCue: EyeCue | null = null

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

function activeCue(t: number): EyeCue | null {
  if (t < burstUntil && burstCue) return burstCue
  return props.cue ?? null
}

function bursting(t: number) {
  return t < burstUntil
}

function updateLook(t: number) {
  const svg = root.value!
  const cue = activeCue(t)
  const burst = bursting(t)

  if (cue === 'prev') {
    look.tx = burst ? -1.15 : -0.95
    look.ty = burst ? -0.15 : 0.05
    nextSaccade = t + 400
  } else if (cue === 'next') {
    look.tx = burst ? 1.15 : 0.95
    look.ty = burst ? -0.15 : 0.05
    nextSaccade = t + 400
  } else if (cue === 'lyrics') {
    look.tx = Math.sin(t / 420) * 0.15
    look.ty = burst ? -1.1 : -0.85
    nextSaccade = t + 500
  } else if (cue === 'seek') {
    // 进度条在播放栏上方，抬头看
    look.tx = Math.sin(t / 280) * (burst ? 0.55 : 0.22)
    look.ty = burst ? -1.1 : -0.92
    nextSaccade = t + 300
  } else if (cue === 'detail') {
    look.tx = burst ? -0.9 : -0.65
    look.ty = burst ? -0.35 : -0.15
    nextSaccade = t + 500
  } else if (cue === 'volume' || cue === 'mute' || cue === 'unmute') {
    look.tx = burst ? 1.05 : 0.85
    look.ty = cue === 'mute' ? 0.35 : burst ? -0.25 : 0.1
    nextSaccade = t + 400
  } else if (cue === 'fx') {
    if (t > nextSaccade) {
      look.tx = rand(-1.1, 1.1)
      look.ty = rand(-1, 1)
      nextSaccade = t + rand(50, 110)
    }
  } else if (cue === 'mode') {
    look.tx = Math.sin(t / 70) * (burst ? 1.1 : 0.85)
    look.ty = Math.cos(t / 95) * (burst ? 0.7 : 0.45)
    nextSaccade = t + 200
  } else if (cue === 'collapse') {
    look.tx = 0
    look.ty = burst ? 1.1 : 0.95
    nextSaccade = t + 600
  } else if (cue === 'dizzy') {
    look.tx = Math.sin(t / 55) * 1.2
    look.ty = Math.cos(t / 40) * 1.05
    nextSaccade = t + 40
  } else if (cue === 'love') {
    look.tx = Math.sin(t / 380) * 0.2
    look.ty = burst ? -0.55 : -0.35
    nextSaccade = t + 400
  } else if (cue === 'pet') {
    // 被抚摸：目光懒懒的，不怎么追鼠标
    look.tx = Math.sin(t / 900) * 0.18
    look.ty = 0.22 + Math.sin(t / 700) * 0.08
    nextSaccade = t + 800
  } else if (cue === 'surprise') {
    look.tx = burst ? rand(-0.2, 0.2) : 0
    look.ty = burst ? -0.75 : -0.45
    nextSaccade = t + 300
  } else if (cue === 'shy') {
    look.tx = burst ? 0.85 : 0.65
    look.ty = burst ? 0.55 : 0.4
    nextSaccade = t + 500
  } else if (cue === 'sleepy') {
    look.tx = Math.sin(t / 1100) * 0.12
    look.ty = 0.35
    nextSaccade = t + 900
  } else if (cue === 'effort') {
    // 使劲充能：眯眼发抖、目光钉住前方
    look.tx = Math.sin(t / 32) * 0.22
    look.ty = 0.2 + Math.sin(t / 27) * 0.18
    nextSaccade = t + 60
  } else if (hovering || t - pointer.at < 2500) {
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

  const k = cue || hovering ? 0.42 : 0.22
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

function spice(pose: Pose, t: number): Pose {
  const cue = activeCue(t)
  if (!cue) return pose
  const burst = bursting(t)
  const p = burst ? clamp(1 - (burstUntil - t) / 640, 0, 1) : 0
  const pop = burst ? Math.sin(Math.PI * Math.min(1, (640 - (burstUntil - t)) / 220)) : 0

  switch (cue) {
    case 'prev':
    case 'next':
      return {
        ...pose,
        sx: pose.sx * (1.06 + pop * 0.22),
        sy: pose.sy * (1.08 + pop * 0.18),
        dx: pose.dx + (cue === 'prev' ? -0.25 : 0.25) * (0.5 + pop),
        glint: clamp(pose.glint + 0.35 + pop * 0.5, 0, 1),
      }
    case 'mode':
      return {
        ...pose,
        sx: pose.sx * (1.08 + Math.sin(t / 50) * 0.1 + pop * 0.15),
        sy: pose.sy * (0.88 + Math.abs(Math.sin(t / 50)) * 0.28),
        glint: 1,
        alpha: burst ? 0.75 + flicker(t) * 0.25 : pose.alpha,
      }
    case 'lyrics':
      return {
        ...pose,
        sx: pose.sx * 1.1,
        sy: pose.sy * (0.62 + pop * 0.2),
        dy: pose.dy - 0.35,
        glint: clamp(pose.glint + 0.2, 0, 1),
      }
    case 'fx':
      return {
        ...pose,
        sx: pose.sx * (1.12 + Math.sin(t / 38) * 0.12),
        sy: pose.sy * (1.1 + Math.sin(t / 33) * 0.18),
        alpha: 0.8 + flicker(t) * 0.2,
        glint: 1,
      }
    case 'mute':
      return {
        ...pose,
        sx: 1.2,
        sy: Math.min(pose.sy, 0.28 + pop * 0.1),
        dy: pose.dy + 0.55,
        alpha: lerp(pose.alpha, 0.55, 0.7),
        glint: 0.15,
      }
    case 'unmute':
      return {
        ...pose,
        sx: pose.sx * (1.15 + pop * 0.35),
        sy: Math.max(pose.sy, 1.15 + pop * 0.35),
        dy: pose.dy - 0.25 * pop,
        glint: 1,
      }
    case 'volume':
      return {
        ...pose,
        sx: pose.sx * (1.05 + pop * 0.12),
        sy: pose.sy * (0.9 + pop * 0.25),
        glint: clamp(pose.glint + 0.3, 0, 1),
      }
    case 'seek':
      return {
        ...pose,
        sx: pose.sx * 1.06,
        sy: pose.sy * 0.82,
        dy: pose.dy - 0.35,
        glint: clamp(pose.glint + 0.2, 0, 1),
      }
    case 'detail':
      return {
        ...pose,
        sx: pose.sx * (1.1 + pop * 0.2),
        sy: pose.sy * (1.18 + pop * 0.25),
        glint: 1,
      }
    case 'collapse':
      return {
        ...pose,
        sx: 1.12,
        sy: Math.min(pose.sy, SHUT_SY + 0.18 + (1 - p) * 0.1),
        dy: lerp(pose.dy, SHUT_DY, 0.75),
        alpha: lerp(pose.alpha, 0.65, 0.5),
        glint: 0.2,
      }
    case 'dizzy':
      return {
        ...pose,
        sx: pose.sx * (1.15 + Math.sin(t / 48) * 0.18),
        sy: pose.sy * (0.75 + Math.abs(Math.sin(t / 36)) * 0.45),
        alpha: 0.7 + flicker(t) * 0.3,
        glint: 1,
      }
    case 'love':
      return {
        ...pose,
        sx: pose.sx * (1.12 + pop * 0.2),
        sy: pose.sy * (1.15 + pop * 0.22),
        dy: pose.dy - 0.2,
        glint: 1,
      }
    case 'pet':
      return {
        ...pose,
        sx: 1.18,
        // 眯成舒服的细缝
        sy: Math.min(pose.sy, 0.42 + Math.sin(t / 520) * 0.06),
        dy: pose.dy + 0.35,
        alpha: 0.92,
        glint: 0.35 + Math.sin(t / 480) * 0.15,
      }
    case 'surprise':
      return {
        ...pose,
        sx: pose.sx * (1.2 + pop * 0.35),
        sy: Math.max(pose.sy, 1.35 + pop * 0.4),
        dy: pose.dy - 0.35 * pop,
        glint: 1,
      }
    case 'shy':
      return {
        ...pose,
        sx: 1.05,
        sy: Math.min(pose.sy, 0.55 + pop * 0.1),
        dx: pose.dx + 0.15,
        dy: pose.dy + 0.45,
        alpha: 0.85,
        glint: 0.45,
      }
    case 'sleepy':
      return {
        ...pose,
        sx: 1.2,
        sy: Math.min(pose.sy, 0.28 + Math.sin(t / 600) * 0.05 + pop * 0.08),
        dy: pose.dy + 0.5,
        alpha: 0.75,
        glint: 0.2,
      }
    case 'effort':
      return {
        ...pose,
        // 眯成使劲缝，左右抖一点
        sx: pose.sx * (1.22 + Math.sin(t / 28) * 0.1),
        sy: Math.min(pose.sy, 0.38 + Math.abs(Math.sin(t / 22)) * 0.22),
        dx: pose.dx + Math.sin(t / 30) * 0.12,
        dy: pose.dy + 0.28,
        alpha: 0.8 + flicker(t) * 0.2,
        glint: 0.55 + flicker(t) * 0.45,
      }
    default:
      return pose
  }
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
    return spice(
      {
        ...pose,
        sx: lerp(1.15, pose.sx, p),
        sy: lerp(SHUT_SY, pose.sy, back(p)),
        dx: pose.dx * p,
        dy: lerp(SHUT_DY, pose.dy, p),
        glint: pose.glint * p,
      },
      t,
    )
  }
  return spice(pose, t)
}

function asleep(t: number): Pose {
  const breath = 0.5 + 0.5 * Math.sin(t / 650)
  const cue = activeCue(t)
  const stirred = !!cue || hovering
  const rest: Pose = {
    sx: 1.15,
    sy: SHUT_SY + (stirred ? 0.32 : hover * 0.26) - press * 0.06,
    dx: look.x * 0.7 * (stirred ? 1 : hover),
    dy: SHUT_DY - (stirred ? 0.65 : hover * 0.5),
    alpha: lerp(0.5 + breath * 0.4, 1, stirred ? 1 : hover),
    glint: stirred ? 0.85 : hover * 0.8,
  }

  const since = t - changedAt
  if (since < 140) {
    return spice({ sx: 1.1, sy: 1.25, dx: look.x * 0.3, dy: -0.2, alpha: 1, glint: 1 }, t)
  }
  if (since < 480) {
    const p = easeIn((since - 140) / 340)
    return spice(
      {
        sx: lerp(1.1, 1.15, p),
        sy: lerp(1.25, SHUT_SY, p),
        dx: look.x * 0.3 * (1 - p),
        dy: lerp(-0.2, SHUT_DY, p),
        alpha: 1,
        glint: 1 - p,
      },
      t,
    )
  }
  if (since < 760) return spice({ ...rest, alpha: flicker(since) * rest.alpha, glint: 0 }, t)
  return spice(rest, t)
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
  hover += ((hovering || !!props.cue || bursting(t) ? 1 : 0) - hover) * 0.2
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

watch(
  () => props.poke,
  (n, prev) => {
    if (reduced || !n || n === prev) return
    const cue = props.cue
    if (!cue) return
    const t = performance.now()
    burstCue = cue
    burstUntil = t + (cue === 'fx' || cue === 'mode' ? 820 : 640)
    blinkAt = t
    doubleBlink = cue === 'mode' || cue === 'fx'
    nextBlink = burstUntil + rand(400, 900)
    if (cue === 'unmute' && !props.on) {
      // 休眠时被叫醒：走开机闪一下
      changedAt = t
    }
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
  host = root.value?.closest('[data-eyes-host], button, a') ?? null
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
