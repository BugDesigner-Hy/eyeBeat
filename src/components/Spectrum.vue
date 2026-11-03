<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { accent } from '../theme'

const props = defineProps<{ analyser: AnalyserNode | null; playing: boolean }>()

const BARS = 16
const BAR_W = 4
const CELL_H = 3
const GAP = 1
const ROWS = 7
const WIDTH = BARS * (BAR_W + GAP) - GAP
const HEIGHT = ROWS * (CELL_H + GAP) - GAP

const canvas = ref<HTMLCanvasElement>()
const levels = new Float32Array(BARS)
let data: Uint8Array<ArrayBuffer> | null = null
let raf = 0

function readAnalyser(): boolean {
  const a = props.analyser
  if (!a) return false
  if (!data || data.length !== a.frequencyBinCount) data = new Uint8Array(a.frequencyBinCount)
  a.getByteFrequencyData(data)
  return true
}

function sample(t: number, i: number, real: boolean): number {
  if (real && data) {
    const usable = Math.floor(data.length * 0.72)
    const start = Math.floor(Math.pow(usable, i / BARS))
    const end = Math.max(start + 1, Math.floor(Math.pow(usable, (i + 1) / BARS)))
    let max = 0
    for (let k = start; k < end; k++) max = Math.max(max, data[k])
    return max / 255
  }
  const wave = Math.sin(t / 210 + i * 0.9) * Math.sin(t / 530 + i * 1.7)
  return 0.3 + 0.35 * Math.abs(wave) + Math.random() * 0.12
}

function frame(t: number) {
  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  let alive = false
  const real = props.playing && readAnalyser()
  for (let i = 0; i < BARS; i++) {
    const target = props.playing ? sample(t, i, real) : 0
    const k = target > levels[i] ? 0.5 : 0.12
    levels[i] += (target - levels[i]) * k
    if (levels[i] > 0.01) alive = true
  }

  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  for (let i = 0; i < BARS; i++) {
    const lit = Math.round(levels[i] * ROWS)
    const x = i * (BAR_W + GAP)
    for (let r = 0; r < ROWS; r++) {
      const y = HEIGHT - (r + 1) * (CELL_H + GAP) + GAP
      ctx.fillStyle = accent.value
      ctx.globalAlpha = r < lit ? (r === lit - 1 ? 1 : 0.45) : 0.08
      ctx.fillRect(x, y, BAR_W, CELL_H)
    }
  }
  ctx.globalAlpha = 1
  raf = props.playing || alive ? requestAnimationFrame(frame) : 0
}

function start() {
  if (!raf) raf = requestAnimationFrame(frame)
}

watch(() => props.playing, start)

onMounted(() => {
  const c = canvas.value!
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  c.width = WIDTH * dpr
  c.height = HEIGHT * dpr
  c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
  start()
})

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <canvas
    ref="canvas"
    class="spectrum"
    :style="{ width: `${WIDTH}px`, height: `${HEIGHT}px` }"
    aria-hidden="true"
  />
</template>

<style scoped>
.spectrum {
  display: block;
  image-rendering: pixelated;
}
</style>
