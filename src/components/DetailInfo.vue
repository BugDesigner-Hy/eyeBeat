<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Track } from '../api/types'
import { useDetailStore } from '../stores/detail'
import { fmtNum } from '../utils/num'

/** brief：手机第 1 页用，只要歌名和统计，不显示描述和加载状态 */
const props = withDefaults(defineProps<{ track: Track; part?: 'all' | 'brief' }>(), { part: 'all' })
const emit = defineEmits<{ 'open-comments': [] }>()
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

/** 只保留别处没有的元数据芯片；音源/时长/日期与顶栏、进度条重复，不展示 */
const metaChips = computed(() => {
  const d = info.value
  if (!d) return [] as string[]
  const chips: string[] = []
  if (d.genre && d.genre !== props.track.album) chips.push(d.genre)
  if (d.mood) chips.push(d.mood)
  for (const t of d.tags?.slice(0, 6) ?? []) chips.push(`#${t}`)
  return chips
})
</script>

<template>
  <div class="di" :class="{ 'di-brief': part === 'brief' }">
    <p class="np-label np-in" style="--i: 1">// TRACK</p>
    <div class="di-head" data-np-info>
      <h2 class="di-title np-in" style="--i: 1">
        <span :key="track.id" class="di-type" :style="{ '--n': typeSteps }">{{ track.title }}</span>
      </h2>
      <p class="di-artist np-in" style="--i: 2">
        {{ track.artist }}
        <template v-if="track.album">
          <span class="sep">·</span><span class="dim">{{ track.album }}</span>
        </template>
      </p>
    </div>
    <p v-if="info?.aliases?.length" class="di-alias np-in" style="--i: 3">{{ info.aliases.join(' / ') }}</p>
    <ul v-if="metaChips.length" class="di-tags np-in" style="--i: 3">
      <li v-for="c in metaChips" :key="c">{{ c }}</li>
    </ul>
    <dl v-if="info?.stats.length" class="di-stats">
      <div
        v-for="(s, i) in info.stats"
        :key="s.label"
        class="np-in"
        :class="{ link: s.label === 'COMMENTS' }"
        :style="{ '--i': 4 + i }"
        :role="s.label === 'COMMENTS' ? 'button' : undefined"
        :tabindex="s.label === 'COMMENTS' ? 0 : undefined"
        :title="s.label === 'COMMENTS' ? '展开 / 收起评论' : undefined"
        @click="s.label === 'COMMENTS' && emit('open-comments')"
        @keydown.enter.prevent="s.label === 'COMMENTS' && emit('open-comments')"
        @keydown.space.prevent="s.label === 'COMMENTS' && emit('open-comments')"
      >
        <dt>{{ s.label }}</dt>
        <dd>{{ fmtNum(shown[i] ?? 0) }}</dd>
      </div>
    </dl>
    <template v-else-if="part === 'all'">
      <p v-if="store.loading" class="di-state">FETCHING META<i class="dots" /></p>
      <p v-else-if="store.error" class="di-state err">META::OFFLINE</p>
    </template>
    <p v-if="part === 'all' && info?.description" class="di-desc np-in" style="--i: 7">{{ info.description }}</p>
  </div>
</template>

<style scoped>
.di {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.di-head {
  min-width: 0;
}

.di-title {
  margin: 0 0 4px;
  font-family: var(--font-pixel-mix);
  font-size: clamp(24px, 3vw, 36px);
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
  image-rendering: pixelated;
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
  margin: 0 0 6px;
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 16px;
  color: var(--text);
  image-rendering: pixelated;
}

.sep {
  margin: 0 8px;
  color: var(--text-dim);
}

.dim {
  color: var(--text-dim);
}

.di-alias {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-dim);
}

.di-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 18px;
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

.di-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  margin: 0 0 16px;
}

.di-stats > div.link {
  cursor: pointer;
  border-radius: 2px;
  outline: none;
}

.di-stats > div.link:hover dd,
.di-stats > div.link:focus-visible dd {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.di-stats > div.link:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 4px;
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

.di-brief .di-tags {
  margin-bottom: 12px;
}

.di-brief .di-stats {
  gap: 8px 24px;
  margin-bottom: 12px;
}

.di-brief .di-stats dd {
  font-size: 22px;
}

@media (prefers-reduced-motion: reduce) {
  .di-type {
    animation: none;
  }
}
</style>
