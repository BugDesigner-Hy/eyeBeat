<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Track } from '../api/types'
import { useDetailStore } from '../stores/detail'

const props = defineProps<{ track: Track }>()
const store = useDetailStore()
const info = computed(() => store.detail)

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const COUNT_MS = 600
const COUNT_DELAY = 420
const TYPE_MAX = 40

const shown = ref<number[]>([])
let raf = 0

watch(
  () => info.value?.stats,
  (stats) => {
    cancelAnimationFrame(raf)
    const targets = stats?.map((s) => s.value) ?? []
    if (reduceMotion || !targets.length) {
      shown.value = targets
      return
    }
    const start = performance.now() + COUNT_DELAY
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / COUNT_MS))
      const e = 1 - (1 - k) ** 3
      shown.value = targets.map((v) => Math.round(v * e))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  },
  { immediate: true },
)

onBeforeUnmount(() => cancelAnimationFrame(raf))

const typeSteps = computed(() => Math.max(1, Math.min(props.track.title.length, TYPE_MAX)))

function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString('en-US')
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="di">
    <p class="np-label np-in" style="--i: 1">// TRACK</p>
    <h2 class="di-title np-in" style="--i: 1">
      <span :key="track.id" class="di-type" :style="{ '--n': typeSteps }">{{ track.title }}</span>
    </h2>
    <p class="di-artist np-in" style="--i: 2">
      {{ track.artist }}
      <template v-if="track.album">
        <span class="sep">·</span><span class="dim">{{ track.album }}</span>
      </template>
    </p>
    <p v-if="info?.aliases?.length" class="di-alias np-in" style="--i: 3">{{ info.aliases.join(' / ') }}</p>
    <ul class="di-tags np-in" style="--i: 3">
      <li>{{ track.provider.toUpperCase() }}</li>
      <li>{{ fmtDuration(track.duration) }}</li>
      <li v-if="info?.released">{{ info.released }}</li>
      <li v-if="info?.genre && info.genre !== track.album">{{ info.genre }}</li>
      <li v-if="info?.mood">{{ info.mood }}</li>
      <li v-for="q in info?.quality ?? []" :key="q" class="q">{{ q }}</li>
      <li v-for="t in info?.tags?.slice(0, 6) ?? []" :key="t">#{{ t }}</li>
    </ul>
    <dl v-if="info?.stats.length" class="di-stats">
      <div v-for="(s, i) in info.stats" :key="s.label" class="np-in" :style="{ '--i': 4 + i }">
        <dt>{{ s.label }}</dt>
        <dd>{{ fmtNum(shown[i] ?? 0) }}</dd>
      </div>
    </dl>
    <p v-else-if="store.loading" class="di-state">FETCHING META<i class="dots" /></p>
    <p v-else-if="store.error" class="di-state err">META::OFFLINE</p>
    <p v-if="info?.description" class="di-desc np-in" style="--i: 7">{{ info.description }}</p>
  </div>
</template>

<style scoped>
.di {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.di-title {
  margin: 0 0 10px;
  font-size: clamp(22px, 2.6vw, 34px);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

/* 逐字打出：按字数分步展开，末尾带光标 */
.di-type {
  display: inline;
  animation: di-type calc(var(--n) * 28ms) steps(var(--n)) 300ms both;
}

.di-type::after {
  content: '_';
  margin-left: 2px;
  color: var(--accent);
  animation: blink 900ms steps(2) infinite;
}

@keyframes di-type {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0);
  }
}

.di-artist {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--text);
}

.sep {
  margin: 0 8px;
  color: var(--text-dim);
}

.dim {
  color: var(--text-dim);
}

.di-alias {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-dim);
}

.di-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 18px;
  padding: 0;
  list-style: none;
}

.di-tags li {
  padding: 2px 8px;
  border: 1px solid var(--line-strong);
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1.2;
  color: var(--text-dim);
}

.di-tags li.q {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  color: var(--accent);
}

.di-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  margin: 0 0 16px;
}

.di-stats dt {
  font-family: var(--font-pixel);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-dim);
}

.di-stats dd {
  margin: 4px 0 0;
  font-family: var(--font-mono);
  font-size: 32px;
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.di-state {
  margin: 0 0 16px;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

.di-state.err {
  color: #ff7a7a;
}

.di-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .di-type {
    animation: none;
  }
}
</style>
