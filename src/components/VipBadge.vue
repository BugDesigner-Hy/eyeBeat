<script setup lang="ts">
/** 7×6 像素皇冠：三个尖、实心冠身、底部一道冠带 */
const CROWN: [number, number, number][] = [
  [0, 0, 1],
  [3, 0, 1],
  [6, 0, 1],
  [0, 1, 1],
  [2, 1, 3],
  [6, 1, 1],
  [0, 2, 7],
  [0, 3, 7],
  [0, 5, 7],
]
</script>

<template>
  <span class="vip" role="img" aria-label="网易云会员" title="网易云会员">
    <svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">
      <rect v-for="[x, y, w] in CROWN" :key="`${x}-${y}`" :x="x" :y="y" :width="w" height="1" />
    </svg>
  </span>
</template>

<style scoped>
.vip {
  --vip: #ffc94a;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 16px;
  border: 1px solid color-mix(in srgb, var(--vip) 70%, transparent);
  background: color-mix(in srgb, var(--vip) 14%, transparent);
  vertical-align: middle;
}

.vip svg {
  width: 14px;
  height: 12px;
  fill: var(--vip);
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--vip) 60%, transparent));
}
</style>
