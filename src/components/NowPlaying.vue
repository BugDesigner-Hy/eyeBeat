<script setup lang="ts">
import { computed, ref } from 'vue'
import { provider } from '../api'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { coverSources } from '../utils/cover'
import CoverImage from './CoverImage.vue'
import DetailInfo from './DetailInfo.vue'
import DetailLyrics from './DetailLyrics.vue'
import DetailTelemetry from './DetailTelemetry.vue'
import UpNext from './UpNext.vue'

const player = usePlayerStore()
const ui = useUiStore()

const DRAG_CLOSE = 120
const DRAG_SLOP = 6

const crossOrigin = provider.coverCors ? 'anonymous' : undefined

const dragY = ref(0)
const dragging = ref(false)
let drag: { id: number; y: number } | null = null

function onDragStart(e: PointerEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [data-no-drag]')) return
  const content = (e.currentTarget as HTMLElement).querySelector('.np-content')
  if (content && content.scrollTop > 0) return
  drag = { id: e.pointerId, y: e.clientY }
}

function onDragMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const dy = e.clientY - drag.y
  if (!dragging.value) {
    if (dy < -DRAG_SLOP) drag = null
    if (dy < DRAG_SLOP) return
    dragging.value = true
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
  }
  dragY.value = Math.max(0, dy)
}

function onDragEnd() {
  if (!drag) return
  const close = dragging.value && dragY.value > DRAG_CLOSE
  drag = null
  dragging.value = false
  if (close) ui.toggleDetail(false)
  else dragY.value = 0
}

const shellStyle = computed(() =>
  dragY.value ? { translate: `0 ${dragY.value}px`, opacity: String(1 - Math.min(dragY.value / 600, 0.5)) } : undefined,
)
</script>

<template>
  <div v-if="ui.detailOpen && player.current" class="np">
    <section
      class="np-shell"
      :class="{ dragging }"
      :style="shellStyle"
      role="dialog"
      aria-modal="true"
      aria-label="正在播放"
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
      @pointercancel="onDragEnd"
    >
      <div class="np-bg" aria-hidden="true">
        <CoverImage :sources="coverSources(player.current.cover, 'medium')" />
      </div>
      <i class="np-grid" aria-hidden="true" />
      <div class="np-content">
        <header class="np-head np-in" style="--i: 0">
          <button type="button" class="txt-btn" title="关闭（Esc）" @click="ui.toggleDetail(false)">[CLOSE]</button>
          <span class="np-tag">// NOW PLAYING · {{ player.providerName.toUpperCase() }}</span>
        </header>
        <div class="np-left">
          <div class="np-cover">
            <CoverImage :sources="coverSources(player.current.cover, 'large')" />
            <i class="np-corners" aria-hidden="true" />
          </div>
          <DetailInfo :track="player.current" />
        </div>
        <div class="np-right">
          <DetailLyrics />
          <div class="np-lower">
            <UpNext />
            <DetailTelemetry :track="player.current" />
          </div>
        </div>
      </div>
    </section>
    <i class="np-scan" aria-hidden="true" />
    <div class="np-ghost" aria-hidden="true">
      <img :src="coverSources(player.current.cover, 'small')[0]" :crossorigin="crossOrigin" alt="" draggable="false" />
      <canvas class="np-mosaic" width="6" height="6" />
    </div>
  </div>
</template>

<style scoped>
.np-shell {
  position: fixed;
  inset: 0 0 var(--dock-h);
  z-index: 55;
  overflow: hidden;
  background: rgba(8, 10, 13, 0.94);
  transition:
    translate 240ms var(--ease-out),
    opacity 240ms var(--ease-out);
}

.np-shell.dragging {
  transition: none;
}

.np-bg {
  position: absolute;
  inset: -80px;
  opacity: 0.28;
  filter: blur(60px) saturate(1.4);
  pointer-events: none;
}

.np-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px) 0 0 / 100% 32px,
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px) 0 0 / 32px 100%;
  mask-image: radial-gradient(ellipse at 30% 40%, #000 30%, transparent 80%);
}

.np-content {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  display: grid;
  grid-template-columns: min(44vh, 40vw) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  column-gap: clamp(32px, 5vw, 80px);
  row-gap: 24px;
  padding: 28px clamp(24px, 5vw, 72px) 32px;
}

.np-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.np-tag {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

.np-left {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 0;
  overflow: hidden auto;
  scrollbar-width: none;
}

.np-cover {
  position: relative;
  flex: none;
  width: 100%;
  aspect-ratio: 1;
  margin: 8px 0 0;
}

.np-corners {
  position: absolute;
  inset: -8px;
  pointer-events: none;
  --c: var(--accent);
  background:
    linear-gradient(var(--c) 0 0) 0 0 / 14px 2px,
    linear-gradient(var(--c) 0 0) 0 0 / 2px 14px,
    linear-gradient(var(--c) 0 0) 100% 0 / 14px 2px,
    linear-gradient(var(--c) 0 0) 100% 0 / 2px 14px,
    linear-gradient(var(--c) 0 0) 0 100% / 14px 2px,
    linear-gradient(var(--c) 0 0) 0 100% / 2px 14px,
    linear-gradient(var(--c) 0 0) 100% 100% / 14px 2px,
    linear-gradient(var(--c) 0 0) 100% 100% / 2px 14px;
  background-repeat: no-repeat;
}

.np-right {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 24px;
  min-height: 0;
}

.np-lower {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 32px;
}

.np-scan {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--dock-h);
  z-index: 56;
  height: 2px;
  opacity: 0;
  pointer-events: none;
  background: var(--accent);
  box-shadow:
    0 0 12px var(--accent),
    0 0 2px var(--accent);
}

.np-ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 58;
  width: 44px;
  height: 44px;
  visibility: hidden;
  pointer-events: none;
  transform-origin: 0 0;
}

.np-ghost img,
.np-mosaic {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.np-mosaic {
  opacity: 0;
  image-rendering: pixelated;
}

@media (max-width: 900px) {
  .np-content {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 20px 16px 28px;
  }
  .np-left {
    overflow: visible;
  }
  .np-cover {
    align-self: center;
    width: min(72vw, 360px);
  }
  .np-right {
    display: flex;
    flex-direction: column;
  }
  .np-right .dl {
    height: 320px;
  }
  .np-lower {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
