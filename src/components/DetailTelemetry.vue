<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { provider } from '../api'
import type { Track } from '../api/types'
import { usePlayerStore } from '../stores/player'
import { coverSources } from '../utils/cover'
import { extractPalette } from '../utils/palette'
import Spectrum from './Spectrum.vue'

const props = defineProps<{ track: Track }>()
const player = usePlayerStore()

const MAX_KBPS = 1000
const MAX_RATE = 96000

const palette = ref<string[] | null>(null)
const paletteState = ref<'loading' | 'ok' | 'locked'>('loading')

watch(
  () => props.track,
  async (t) => {
    palette.value = null
    if (!provider.coverCors) {
      paletteState.value = 'locked'
      return
    }
    paletteState.value = 'loading'
    const colors = await extractPalette(`${t.provider}:${t.id}`, coverSources(t.cover, 'small'))
    if (props.track !== t) return
    palette.value = colors
    paletteState.value = colors ? 'ok' : 'locked'
  },
  { immediate: true },
)

const rows = computed(() => {
  const s = player.streamInfo
  const rate = player.sampleRate
  return [
    { k: 'CODEC', v: s?.codec ?? '--', level: 0 },
    { k: 'BITRATE', v: s?.bitrate ? `${s.bitrate} KBPS` : '--', level: s?.bitrate ? Math.min(1, s.bitrate / MAX_KBPS) : 0 },
    { k: 'SAMPLE', v: rate ? `${(rate / 1000).toFixed(1)} KHZ` : '--', level: rate ? Math.min(1, rate / MAX_RATE) : 0 },
    { k: 'STREAM', v: s ? (s.preview ? 'PREVIEW' : 'FULL') : '--', level: 0 },
  ]
})
</script>

<template>
  <section class="tm">
    <p class="np-label np-in" style="--i: 6">// TELEMETRY</p>
    <dl class="tm-rows">
      <div v-for="(r, i) in rows" :key="r.k" class="tm-row np-in" :style="{ '--i': 6 + i, '--v': r.level }">
        <dt>{{ r.k }}</dt>
        <dd>{{ r.v }}</dd>
        <i v-if="r.level" class="tm-bar" aria-hidden="true" />
      </div>
    </dl>
    <div class="tm-spec np-in" style="--i: 10">
      <Spectrum :analyser="player.analyser" :playing="player.isPlaying" :bars="24" :rows="10" />
    </div>
    <div class="tm-palette np-in" style="--i: 11">
      <template v-if="palette">
        <span v-for="(c, i) in palette" :key="`${c}-${i}`" class="sw" :style="{ background: c, '--j': i }" :title="c" />
      </template>
      <span v-else class="tm-state">{{ paletteState === 'locked' ? 'CORS::LOCKED' : 'SAMPLING…' }}</span>
    </div>
  </section>
</template>

<style scoped>
.tm {
  min-width: 0;
}

.tm-rows {
  display: grid;
  gap: 8px;
  margin: 0 0 14px;
}

.tm-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: baseline;
  row-gap: 4px;
  font-family: var(--font-mono);
  font-size: 17px;
  line-height: 1;
}

.tm-row dt {
  color: var(--text-dim);
}

.tm-row dd {
  margin: 0;
  color: var(--text);
}

.tm-bar {
  grid-column: 1 / -1;
  height: 2px;
  background:
    linear-gradient(var(--accent) 0 0) 0 0 / calc(var(--v) * 100%) 100% no-repeat,
    var(--line);
  animation: tm-fill 600ms var(--ease-out) both;
  animation-delay: calc(420ms + var(--i) * 50ms);
}

@keyframes tm-fill {
  from {
    background-size:
      0 100%,
      auto;
  }
}

.tm-spec {
  margin-bottom: 14px;
}

.tm-palette {
  display: flex;
  gap: 4px;
  min-height: 18px;
}

.sw {
  width: 28px;
  height: 18px;
  outline: 1px solid rgba(255, 255, 255, 0.12);
  animation: sw-on 320ms steps(4) both;
  animation-delay: calc(760ms + var(--j) * 70ms);
}

@keyframes sw-on {
  from {
    opacity: 0;
    transform: scaleY(0.2);
  }
}

.tm-state {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}

@media (prefers-reduced-motion: reduce) {
  .tm-bar,
  .sw {
    animation: none;
  }
}
</style>
