<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  /** time = HH:MM，date = MM-DD */
  mode: 'time' | 'date'
  /** 外部触发闪烁（点机器人时） */
  flash?: number
}>()

/** 七段：a顶 b上右 c下右 d底 e下左 f上左 g中 */
const DIGITS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
}

/** 像素块七段，整数坐标、直角边 */
const SEGS: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 2, y: 1, w: 7, h: 2 },
  b: { x: 8, y: 2, w: 2, h: 7 },
  c: { x: 8, y: 12, w: 2, h: 7 },
  d: { x: 2, y: 18, w: 7, h: 2 },
  e: { x: 1, y: 12, w: 2, h: 7 },
  f: { x: 1, y: 2, w: 2, h: 7 },
  g: { x: 2, y: 10, w: 7, h: 2 },
}

const now = ref(new Date())
const lit = ref(true)
let tick = 0
let flashTimer = 0

const text = computed(() => {
  const d = now.value
  if (props.mode === 'date') {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${mm}-${dd}`
  }
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mi}`
})

const cells = computed(() => text.value.split('').map((ch) => (ch === ':' ? ':' : ch)))
const colonOn = computed(() => now.value.getSeconds() % 2 === 0)
const label = computed(() => (props.mode === 'date' ? '// DATE' : '// TIME'))

function pad() {
  now.value = new Date()
  tick = window.setTimeout(pad, 1000 - (Date.now() % 1000))
}

watch(
  () => props.flash,
  (n) => {
    if (n == null) return
    lit.value = false
    clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => (lit.value = true), 90)
  },
)

onMounted(() => pad())
onBeforeUnmount(() => {
  clearTimeout(tick)
  clearTimeout(flashTimer)
})
</script>

<template>
  <div class="ssc" :class="{ dim: !lit }" aria-hidden="true">
    <span class="ssc-label">{{ label }}</span>
    <div class="ssc-face">
      <template v-for="(ch, i) in cells" :key="`${i}-${ch}`">
        <span v-if="ch === ':'" class="ssc-colon" :class="{ on: colonOn }">
          <i /><i />
        </span>
        <svg
          v-else
          class="ssc-digit"
          viewBox="0 0 11 21"
          width="36"
          height="68"
          shape-rendering="crispEdges"
        >
          <rect
            v-for="(box, seg) in SEGS"
            :key="seg"
            class="ssc-seg"
            :class="{ on: DIGITS[ch]?.includes(seg) }"
            :x="box.x"
            :y="box.y"
            :width="box.w"
            :height="box.h"
          />
        </svg>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ssc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  image-rendering: pixelated;
  transition: opacity 80ms steps(2);
}

.ssc.dim {
  opacity: 0.35;
}

.ssc-label {
  font-family: var(--font-pixel-mix);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--accent) 55%, #6a7580);
  image-rendering: pixelated;
}

.ssc-face {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.ssc-digit {
  display: block;
  overflow: visible;
  image-rendering: pixelated;
}

.ssc-seg {
  fill: color-mix(in srgb, var(--accent) 12%, #12161c);
  transition: fill 80ms steps(1);
}

.ssc-seg.on {
  fill: var(--accent);
}

.ssc-colon {
  display: grid;
  gap: 12px;
  padding: 0 4px;
  align-content: center;
  height: 68px;
}

.ssc-colon i {
  width: 6px;
  height: 6px;
  background: color-mix(in srgb, var(--accent) 12%, #12161c);
  image-rendering: pixelated;
}

.ssc-colon.on i {
  background: var(--accent);
  box-shadow: 2px 0 0 color-mix(in srgb, var(--accent) 35%, transparent);
}
</style>
