<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    label: string
    seg?: number
    gap?: number
    height?: number
  }>(),
  { seg: 6, gap: 2, height: 6 },
)

const emit = defineEmits<{
  input: [value: number]
  change: [value: number]
}>()

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const el = ref<HTMLElement>()
const width = ref(0)
const dragValue = ref<number | null>(null)
let observer: ResizeObserver | undefined

const pitch = computed(() => props.seg + props.gap)
const count = computed(() => Math.max(1, Math.floor((width.value + props.gap) / pitch.value)))
const shown = computed(() => clamp01(dragValue.value ?? props.value))
const filledPx = computed(() => {
  const n = Math.round(shown.value * count.value)
  return n === 0 ? 0 : n * pitch.value - props.gap
})
const usedPx = computed(() => count.value * pitch.value - props.gap)

function fraction(e: PointerEvent) {
  const rect = el.value!.getBoundingClientRect()
  return clamp01((e.clientX - rect.left) / rect.width)
}

function onDown(e: PointerEvent) {
  el.value!.setPointerCapture(e.pointerId)
  dragValue.value = fraction(e)
  emit('input', dragValue.value)
}

function onMove(e: PointerEvent) {
  if (dragValue.value === null) return
  dragValue.value = fraction(e)
  emit('input', dragValue.value)
}

function onUp(e: PointerEvent) {
  if (dragValue.value === null) return
  emit('change', fraction(e))
  dragValue.value = null
}

function onKey(e: KeyboardEvent) {
  const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0
  if (!delta) return
  e.preventDefault()
  e.stopPropagation()
  emit('change', clamp01(props.value + delta))
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width))
  if (el.value) observer.observe(el.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="el"
    class="seg"
    :class="{ dragging: dragValue !== null }"
    role="slider"
    tabindex="0"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(shown * 100)"
    :style="{
      '--seg': `${seg}px`,
      '--gap': `${gap}px`,
      '--h': `${height}px`,
      '--fill': `${filledPx}px`,
      '--used': `${usedPx}px`,
    }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @keydown="onKey"
  >
    <div class="seg-track" />
    <div class="seg-fill" />
  </div>
</template>

<style scoped>
.seg {
  position: relative;
  height: calc(var(--h) + 12px);
  cursor: pointer;
  touch-action: none;
  outline: none;
}

.seg-track,
.seg-fill {
  position: absolute;
  left: 0;
  top: 50%;
  height: var(--h);
  transform: translateY(-50%);
  background: repeating-linear-gradient(
    90deg,
    currentColor 0 var(--seg),
    transparent var(--seg) calc(var(--seg) + var(--gap))
  );
}

.seg-track {
  width: var(--used);
  color: rgba(255, 255, 255, 0.1);
}

.seg-fill {
  width: var(--fill);
  color: var(--accent);
}

.seg:hover .seg-track,
.seg:focus-visible .seg-track,
.seg.dragging .seg-track {
  color: rgba(255, 255, 255, 0.18);
}

.seg:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 2px;
}
</style>
