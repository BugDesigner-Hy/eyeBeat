<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    label: string
    seg?: number
    gap?: number
    height?: number
    /**
     * true：非拖拽时始终缓动（音量）
     * seek：仅大跳变缓动（进度条 / 点歌词），跟播不拖泥带水
     */
    smooth?: boolean | 'seek'
  }>(),
  { seg: 6, gap: 2, height: 6, smooth: false },
)

const emit = defineEmits<{
  input: [value: number]
  change: [value: number]
}>()

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const DRAG_SLOP = 4
/** 超过这个比例视为 seek（跟播步进远小于此） */
const SEEK_JUMP = 0.008

const el = ref<HTMLElement>()
const width = ref(0)
const dragValue = ref<number | null>(null)
const jumping = ref(false)
let observer: ResizeObserver | undefined
let ptr: { id: number; x: number } | null = null
let lastVal = props.value
let jumpTimer = 0

const smoothOn = computed(() => !!props.smooth)
const smoothAlways = computed(() => props.smooth === true)
const smoothSeek = computed(() => props.smooth === 'seek')

const pitch = computed(() => props.seg + props.gap)
const count = computed(() => Math.max(1, Math.floor((width.value + props.gap) / pitch.value)))
const usedPx = computed(() => count.value * pitch.value - props.gap)
const shown = computed(() => clamp01(dragValue.value ?? props.value))
const filledPx = computed(() => {
  // 缓动模式用连续宽度，跳变才能丝滑；否则按段取整
  if (smoothOn.value) return shown.value * Math.max(0, usedPx.value)
  const n = Math.round(shown.value * count.value)
  return n === 0 ? 0 : n * pitch.value - props.gap
})

watch(
  () => props.value,
  (v) => {
    const prev = lastVal
    lastVal = v
    if (!smoothSeek.value || dragValue.value !== null) return
    if (Math.abs(v - prev) < SEEK_JUMP) return
    jumping.value = true
    window.clearTimeout(jumpTimer)
    jumpTimer = window.setTimeout(() => {
      jumping.value = false
    }, 420)
  },
)

function fraction(e: PointerEvent) {
  const rect = el.value!.getBoundingClientRect()
  return clamp01((e.clientX - rect.left) / rect.width)
}

function onDown(e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  el.value!.setPointerCapture(e.pointerId)
  ptr = { id: e.pointerId, x: e.clientX }
  if (smoothOn.value) {
    // 先当点击：不进 dragging，保留 width transition；真拖了再跟手
    return
  }
  dragValue.value = fraction(e)
  emit('input', dragValue.value)
}

function onMove(e: PointerEvent) {
  if (!ptr || e.pointerId !== ptr.id) return
  if (smoothOn.value && dragValue.value === null) {
    if (Math.abs(e.clientX - ptr.x) < DRAG_SLOP) return
    dragValue.value = fraction(e)
    emit('input', dragValue.value)
    return
  }
  if (dragValue.value === null) return
  dragValue.value = fraction(e)
  emit('input', dragValue.value)
}

function onUp(e: PointerEvent) {
  if (!ptr || e.pointerId !== ptr.id) return
  const v = fraction(e)
  const wasDrag = dragValue.value !== null
  ptr = null
  dragValue.value = null
  if (wasDrag) {
    emit('change', v)
    return
  }
  // 点击：直接改 value，由 CSS transition 播过去
  emit('input', v)
  emit('change', v)
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

onBeforeUnmount(() => {
  observer?.disconnect()
  window.clearTimeout(jumpTimer)
})
</script>

<template>
  <div
    ref="el"
    class="seg"
    :class="{
      dragging: dragValue !== null,
      'smooth-always': smoothAlways,
      'smooth-seek': smoothSeek,
      jumping,
    }"
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
  transition: height 160ms var(--ease-out, ease);
}

.seg:hover,
.seg:focus-visible,
.seg.dragging {
  height: calc(var(--h) + 18px);
}

.seg-track,
.seg-fill {
  position: absolute;
  left: 0;
  top: 50%;
  height: var(--h);
  transform: translateY(-50%) scaleY(1);
  transform-origin: center;
  background: repeating-linear-gradient(
    90deg,
    currentColor 0 var(--seg),
    transparent var(--seg) calc(var(--seg) + var(--gap))
  );
  transition:
    transform 160ms var(--ease-out, ease),
    color 120ms steps(2);
}

.seg:hover .seg-track,
.seg:hover .seg-fill,
.seg:focus-visible .seg-track,
.seg:focus-visible .seg-fill,
.seg.dragging .seg-track,
.seg.dragging .seg-fill {
  transform: translateY(-50%) scaleY(1.7);
}

.seg-track {
  width: var(--used);
  color: rgba(255, 255, 255, 0.1);
}

.seg-fill {
  width: var(--fill);
  color: var(--accent);
}

.seg.smooth-always:not(.dragging) .seg-fill,
.seg.smooth-seek.jumping:not(.dragging) .seg-fill {
  transition: width 380ms cubic-bezier(0.16, 1, 0.3, 1);
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

@media (prefers-reduced-motion: reduce) {
  .seg,
  .seg-track,
  .seg-fill {
    transition: none;
  }
  .seg.smooth-always:not(.dragging) .seg-fill,
  .seg.smooth-seek.jumping:not(.dragging) .seg-fill {
    transition: none;
  }
}
</style>
