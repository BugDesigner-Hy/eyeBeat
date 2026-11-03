<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { coverSources } from '../utils/cover'
import CoverImage from './CoverImage.vue'
import PixelIcon from './PixelIcon.vue'
import RobotEyes from './RobotEyes.vue'

const store = usePlayerStore()
const ui = useUiStore()

/** 横滑超过 SKIP 切歌；上滑超过 OPEN 打开详情；DAMP 是文字跟手的阻尼 */
const SKIP = 72
const OPEN = 40
const DAMP = 0.6
const SLOP = 8

const progress = computed(() => (store.duration ? store.currentTime / store.duration : 0))
const dx = ref(0)
const dragging = ref(false)
const enterFrom = ref<'left' | 'right' | null>(null)
let g: { id: number; x: number; y: number; axis: 'x' | 'y' | null } | null = null
/** 手势结束后浏览器仍会补发一次 click，需要吞掉 */
let swallowClick = false

function onDown(e: PointerEvent) {
  // 触屏滑动后浏览器通常不补发 click，标记不能留到下一次点击
  swallowClick = false
  if ((e.target as HTMLElement).closest('.mb-btn')) return
  g = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null }
}

function onMove(e: PointerEvent) {
  if (!g || g.id !== e.pointerId) return
  const mx = e.clientX - g.x
  const my = e.clientY - g.y
  if (!g.axis) {
    if (Math.hypot(mx, my) < SLOP) return
    g.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
    swallowClick = true
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
  }
  if (g.axis === 'x') {
    dragging.value = true
    dx.value = mx * DAMP
  } else if (my < -OPEN) {
    g = null
    ui.toggleDetail(true)
  }
}

function onUp(e: PointerEvent) {
  if (!g || g.id !== e.pointerId) return
  const raw = e.clientX - g.x
  const axis = g.axis
  g = null
  dragging.value = false
  dx.value = 0
  if (axis !== 'x' || Math.abs(raw) < SKIP) return
  enterFrom.value = raw < 0 ? 'right' : 'left'
  void (raw < 0 ? store.next() : store.prev())
}

function onCancel() {
  g = null
  dragging.value = false
  dx.value = 0
}

function onTrackClick() {
  if (swallowClick) {
    swallowClick = false
    return
  }
  ui.toggleDetail(true)
}

const textStyle = computed(() =>
  dx.value ? { translate: `${dx.value}px 0`, opacity: String(1 - Math.min(Math.abs(dx.value) / 160, 0.7)) } : undefined,
)
</script>

<template>
  <footer
    v-if="store.current"
    class="mb"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
  >
    <i class="mb-progress" :style="{ transform: `scaleX(${progress})` }" aria-hidden="true" />
    <button type="button" class="mb-track" title="歌曲详情" :aria-expanded="ui.detailOpen" @click="onTrackClick">
      <span class="mb-thumb" :class="{ lifted: ui.coverLifted }" data-np-thumb>
        <CoverImage :sources="coverSources(store.current.cover, 'small')" />
      </span>
      <span
        :key="store.current.id"
        class="mb-text"
        :class="[enterFrom && `in-${enterFrom}`, { dragging }]"
        :style="textStyle"
        @animationend="enterFrom = null"
      >
        <span class="mb-title">{{ store.current.title }}</span>
        <span class="mb-artist">{{ store.current.artist }}</span>
      </span>
    </button>
    <button
      type="button"
      class="mb-btn mb-play px-cut"
      :class="{ on: store.isPlaying, busy: store.buffering }"
      :aria-label="store.isPlaying ? '暂停' : '播放'"
      @click="store.toggle()"
    >
      <RobotEyes :on="store.isPlaying" :analyser="store.analyser" :scale="2.5" />
    </button>
    <button type="button" class="mb-btn" aria-label="下一首" @click="store.next()">
      <PixelIcon name="next" />
    </button>
  </footer>
</template>

<style scoped>
.mb {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 64px;
  padding: 0 8px env(safe-area-inset-bottom) 12px;
  background: rgba(10, 12, 15, 0.96);
  border-top: 1px solid var(--line);
  touch-action: none;
  user-select: none;
  animation: mb-rise 420ms var(--ease-out) backwards;
}

@keyframes mb-rise {
  from {
    transform: translateY(100%);
  }
}

.mb-progress {
  position: absolute;
  left: 0;
  right: 0;
  top: -1px;
  height: 2px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  transform-origin: 0 50%;
  pointer-events: none;
}

.mb-track {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.mb-thumb {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  overflow: hidden;
}

.mb-thumb.lifted {
  visibility: hidden;
}

.mb-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  transition:
    translate 240ms var(--ease-out),
    opacity 240ms var(--ease-out);
}

.mb-text.dragging {
  transition: none;
}

.mb-text.in-right {
  animation: mb-in-right 280ms var(--ease-out);
}

.mb-text.in-left {
  animation: mb-in-left 280ms var(--ease-out);
}

@keyframes mb-in-right {
  from {
    opacity: 0;
    transform: translateX(32px);
  }
}

@keyframes mb-in-left {
  from {
    opacity: 0;
    transform: translateX(-32px);
  }
}

.mb-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mb-artist {
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mb-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  cursor: pointer;
}

.mb-play {
  background: var(--accent);
  color: var(--bg);
}

.mb-btn:active {
  filter: brightness(1.3);
}
</style>
