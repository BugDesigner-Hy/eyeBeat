<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  /** time = HH:MM，date = MM-DD */
  mode: 'time' | 'date'
  /** 外部触发闪烁（点机器人时） */
  flash?: number
}>()

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

function pad() {
  now.value = new Date()
  // 每秒刷新：冒号闪烁 + 整分跳变
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
    <template v-for="(ch, i) in cells" :key="`${i}-${ch}`">
      <span v-if="ch === ':'" class="ssc-colon" :class="{ on: now.getSeconds() % 2 === 0 }">
        <i /><i />
      </span>
      <svg v-else class="ssc-digit" viewBox="0 0 12 20" width="28" height="46">
        <g
          v-for="seg in 'abcdefg'"
          :key="seg"
          class="ssc-seg"
          :class="[seg, { on: DIGITS[ch]?.includes(seg) }]"
        >
          <polygon v-if="seg === 'a'" points="2.5,1.5 3.5,0.5 8.5,0.5 9.5,1.5 8.5,2.5 3.5,2.5" />
          <polygon v-if="seg === 'b'" points="9.5,2.5 10.5,3.5 10.5,8 9.5,9 8.5,8 8.5,3.5" />
          <polygon v-if="seg === 'c'" points="9.5,11 10.5,12 10.5,16.5 9.5,17.5 8.5,16.5 8.5,12" />
          <polygon v-if="seg === 'd'" points="2.5,18.5 3.5,17.5 8.5,17.5 9.5,18.5 8.5,19.5 3.5,19.5" />
          <polygon v-if="seg === 'e'" points="2.5,11 3.5,12 3.5,16.5 2.5,17.5 1.5,16.5 1.5,12" />
          <polygon v-if="seg === 'f'" points="2.5,2.5 3.5,3.5 3.5,8 2.5,9 1.5,8 1.5,3.5" />
          <polygon v-if="seg === 'g'" points="2.5,10 3.5,9 8.5,9 9.5,10 8.5,11 3.5,11" />
        </g>
      </svg>
    </template>
  </div>
</template>

<style scoped>
.ssc {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: opacity 80ms steps(2);
}

.ssc.dim {
  opacity: 0.35;
}

.ssc-digit {
  display: block;
  overflow: visible;
}

.ssc-seg {
  fill: color-mix(in srgb, var(--accent) 14%, #12161c);
  transition: fill 120ms steps(2);
}

.ssc-seg.on {
  fill: var(--accent);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 70%, transparent));
}

.ssc-colon {
  display: grid;
  gap: 10px;
  padding: 0 2px;
}

.ssc-colon i {
  width: 5px;
  height: 5px;
  background: color-mix(in srgb, var(--accent) 14%, #12161c);
}

.ssc-colon.on i {
  background: var(--accent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 70%, transparent);
}
</style>
