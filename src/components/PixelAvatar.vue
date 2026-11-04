<script setup lang="ts">
import { computed } from 'vue'
import { hashSeed } from '../utils/hash'

const props = withDefaults(
  defineProps<{
    seed: string
    size?: number
  }>(),
  { size: 28 },
)

/** 16×16。. 空  b 底  a 强调  d 深  c 腮红  w 高光 */
const ROWS: string[][] = [
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbb..bbbb..bbb.',
    '.bb.aa.bb.aa.bb.',
    '.bb.aa.bb.aa.bb.',
    '.bbb..bbbb..bbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbbbaabbbbbb.',
    '.bbbbbb..bbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbbbbbbbbbbbbb.',
    '.bbb.aa..aa.bbb.',
    '.bbbb..bb..bbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbbbaabbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bb.aa.bb.aa.bb.',
    '.b.aaaa.aaaa.bb.',
    '.bb.aa.bb.aa.bb.',
    '.bbb..bbbb..bbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbbb..bbbbbb.',
    '.bbbbbbaabbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbbwwbbbbwwbbb.',
    '.bbwddwbbwddwbb.',
    '.bbwddwbbwddwbb.',
    '.bbbwwbbbbwwbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbaabbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbaa..bb..aabb.',
    '.bb.aawbbwaa.bb.',
    '.bb.dd.bb.dd.bb.',
    '.bbb..bbbb..bbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbb.aaaa.bbbb.',
    '.bbbbbbbbbbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbb.a.bb.a.bbb.',
    '.bb.aaa..aaa.bb.',
    '.bbb.a.bb.a.bbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbbbaabbbbbb.',
    '.bbbbbb..bbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbddddbbddddbb.',
    '.bd.aa.dd.aa.db.',
    '.bd.aa.dd.aa.db.',
    '.bbddddbbddddbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbbb..bbbbbb.',
    '.bbbbbbaabbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbbbbbbbbbbbbb.',
    '.bbb....bb...bb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbaabbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbbwwbbbbwwbbb.',
    '.bbwaawbbwaawbb.',
    '.bbwaawbbwaawbb.',
    '.bbbwwbbbbwwbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbwwbbbbbb.',
    '.bbbbbwaawbbbbb.',
    '.bbbbbbwwbbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '..a..........a..',
    '.aaa........aaa.',
    '..bbbbbbbbbbbb..',
    '.bbbbbbbbbbbbbb.',
    '.bbb.aa..aa.bbb.',
    '.bbb.aaaaaa.bbb.',
    '.bbb.aa..aa.bbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbb.aa.bbbbb.',
    '.bbbbbbbbbbbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....dddddddd....',
    '...dddddddddd...',
    '..ddbbbbbbbbdd..',
    '.ddbbbbbbbbbbdd.',
    '.dbb.aa.bb.aa.b.',
    '.dbb.aa.bb.aa.b.',
    '.dbbb..bbbb..bb.',
    '.dbbbbbbbbbbbbb.',
    '.dbbbbccbbccbbb.',
    '.dbbbbb.aa.bbbb.',
    '.dbbbbbbbbbbbbb.',
    '..dbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
  [
    '................',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bbbbbbbbbbbb..',
    '.bbbwwbbbbwwbbb.',
    '.bbwddwbbwddwbb.',
    '.bbbwwbbbbwwbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbbbbbbbbbbb.',
    '.bbbbccbbccbbbb.',
    '.bbbbbb.aabbbbb.',
    '.bbbbbbb.abbbbb.',
    '..bbbbbbbbbbbb..',
    '...bbbbbbbbbb...',
    '....bbbbbbbb....',
    '................',
  ],
]

const SIZE = 16

// 开发时保证每张脸都是 16×16
if (import.meta.env.DEV) {
  for (const rows of ROWS) {
    if (rows.length !== SIZE || rows.some((r) => r.length !== SIZE)) {
      console.error('[PixelAvatar] bad face rows', rows.map((r) => r.length))
    }
  }
}

const face = computed(() => ROWS[hashSeed(props.seed || '?') % ROWS.length].join(''))

const pixels = computed(() => {
  const out: { x: number; y: number; c: string }[] = []
  const map = face.value
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = map[y * SIZE + x] ?? '.'
      if (ch === '.') continue
      out.push({ x, y, c: ch })
    }
  }
  return out
})

function fill(c: string) {
  switch (c) {
    case 'a':
      return 'var(--accent)'
    case 'd':
      return 'color-mix(in srgb, var(--accent) 35%, #1a222c)'
    case 'c':
      return 'color-mix(in srgb, var(--accent) 55%, #c45a7a)'
    case 'w':
      return 'color-mix(in srgb, var(--accent) 25%, #e8fff2)'
    default:
      return 'color-mix(in srgb, var(--accent) 18%, #0e1116)'
  }
}
</script>

<template>
  <svg
    class="pa"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${SIZE} ${SIZE}`"
    aria-hidden="true"
  >
    <rect width="16" height="16" fill="color-mix(in srgb, var(--accent) 12%, #0e1116)" />
    <rect v-for="(p, i) in pixels" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="fill(p.c)" />
  </svg>
</template>

<style scoped>
.pa {
  display: block;
  flex: none;
  image-rendering: pixelated;
  shape-rendering: crispEdges;
}
</style>
