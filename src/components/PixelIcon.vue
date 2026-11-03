<script setup lang="ts">
import { computed } from 'vue'

const ICONS = {
  play: ['#......', '###....', '#####..', '#######', '#####..', '###....', '#......'],
  pause: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##'],
  next: ['#....#', '##...#', '###..#', '####.#', '###..#', '##...#', '#....#'],
  prev: ['#....#', '#...##', '#..###', '#.####', '#..###', '#...##', '#....#'],
  volume: ['...#....', '..##..#.', '####...#', '####...#', '####...#', '..##..#.', '...#....'],
  mute: ['...#....', '..##....', '####.#.#', '####..#.', '####.#.#', '..##....', '...#....'],
  close: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  'chevron-down': ['#.....#', '##...##', '.##.##.', '..###..', '...#...'],
  'chevron-up': ['...#...', '..###..', '.##.##.', '##...##', '#.....#'],
} as const

export type IconName = keyof typeof ICONS

const props = withDefaults(defineProps<{ name: IconName; scale?: number }>(), { scale: 2 })

const grid = computed(() => ICONS[props.name])
const width = computed(() => grid.value[0].length)
const height = computed(() => grid.value.length)
const cells = computed(() =>
  grid.value.flatMap((row, y) =>
    [...row].flatMap((c, x) => (c === '#' ? [{ x, y }] : [])),
  ),
)
</script>

<template>
  <svg
    class="pixel-icon"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width * scale"
    :height="height * scale"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <rect v-for="c in cells" :key="`${c.x}-${c.y}`" :x="c.x" :y="c.y" width="1" height="1" />
  </svg>
</template>

<style scoped>
.pixel-icon {
  display: block;
  fill: currentColor;
}
</style>
