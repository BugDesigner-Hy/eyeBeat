<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { coverSources } from '../utils/cover'
import CoverImage from './CoverImage.vue'
import PixelIcon from './PixelIcon.vue'
import RobotEyes from './RobotEyes.vue'

const store = usePlayerStore()
const ui = useUiStore()

const progress = computed(() => (store.duration ? Math.min(1, store.currentTime / store.duration) : 0))
</script>

<template>
  <div v-if="store.current" class="capsule" role="region" aria-label="迷你播放器">
    <i class="cap-frame" aria-hidden="true" />
    <button type="button" class="cap-cover" :title="`${store.current.title} - 歌词`" @click="ui.toggleLyrics()">
      <span class="cap-thumb" data-dock-thumb>
        <CoverImage :sources="coverSources(store.current.cover, 'small')" />
      </span>
      <svg class="cap-ring" viewBox="0 0 44 44" aria-hidden="true">
        <rect class="track" x="1" y="1" width="42" height="42" pathLength="100" />
        <rect class="fill" x="1" y="1" width="42" height="42" pathLength="100" :stroke-dasharray="`${progress * 100} 100`" />
      </svg>
    </button>

    <button
      type="button"
      class="icon-btn cap-play"
      :class="{ busy: store.buffering }"
      :aria-label="store.isPlaying ? '暂停' : '播放'"
      @click="store.toggle()"
    >
      <RobotEyes :on="store.isPlaying" :analyser="store.analyser" :scale="2" />
    </button>

    <span class="cap-eq" :class="{ paused: !store.isPlaying }" aria-hidden="true"><i /><i /><i /><i /></span>

    <button type="button" class="icon-btn cap-expand" aria-label="展开播放栏" title="展开播放栏（B）" @click="ui.toggleBar(false)">
      <PixelIcon name="chevron-up" />
    </button>
  </div>
</template>

<style scoped>
.capsule {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 6px 0 4px;
  background: rgba(10, 12, 15, 0.92);
  border: 1px solid var(--line-strong);
  backdrop-filter: blur(8px);
  transform-origin: right bottom;
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(0, 0, 0, 0.4);
}

/* 四角括号 */
.cap-frame {
  position: absolute;
  inset: -4px;
  pointer-events: none;
  --c: var(--accent);
  --l: 8px;
  background:
    linear-gradient(var(--c) 0 0) top left / var(--l) 1px,
    linear-gradient(var(--c) 0 0) top left / 1px var(--l),
    linear-gradient(var(--c) 0 0) top right / var(--l) 1px,
    linear-gradient(var(--c) 0 0) top right / 1px var(--l),
    linear-gradient(var(--c) 0 0) bottom left / var(--l) 1px,
    linear-gradient(var(--c) 0 0) bottom left / 1px var(--l),
    linear-gradient(var(--c) 0 0) bottom right / var(--l) 1px,
    linear-gradient(var(--c) 0 0) bottom right / 1px var(--l);
  background-repeat: no-repeat;
}

.cap-cover {
  position: relative;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.cap-thumb {
  position: absolute;
  inset: 4px;
  overflow: hidden;
}

.cap-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke-width: 2;
  shape-rendering: crispEdges;
}

.cap-ring .track {
  stroke: var(--line-strong);
}

.cap-ring .fill {
  stroke: var(--accent);
  filter: drop-shadow(0 0 3px var(--accent));
}

.cap-play {
  color: var(--text);
}

.cap-play.busy {
  animation: blink 700ms steps(2) infinite;
}

.cap-eq {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 16px;
}

.cap-eq i {
  width: 3px;
  height: 100%;
  background: var(--accent);
  animation: cap-eq 560ms var(--ease-out) infinite alternate;
}

.cap-eq i:nth-child(2) {
  animation-delay: -180ms;
}
.cap-eq i:nth-child(3) {
  animation-delay: -360ms;
}
.cap-eq i:nth-child(4) {
  animation-delay: -90ms;
}

.cap-eq.paused i {
  animation-play-state: paused;
  opacity: 0.5;
}

@keyframes cap-eq {
  from {
    height: 20%;
  }
  to {
    height: 100%;
  }
}

.cap-expand {
  color: var(--accent);
}

/* ---------- 出入场：等播放栏收合后再「吸附」到角落 ---------- */

.capsule-enter-active {
  transition:
    opacity 420ms var(--ease-out) 380ms,
    transform 560ms var(--ease-out) 380ms,
    filter 420ms var(--ease-out) 380ms;
}

.capsule-enter-active .cap-frame {
  transition: inset 520ms var(--ease-out) 520ms, opacity 300ms var(--ease-out) 520ms;
}

.capsule-enter-from .cap-frame {
  inset: -18px;
  opacity: 0;
}

.capsule-leave-active {
  transition:
    opacity 200ms var(--ease-in),
    transform 240ms var(--ease-in),
    filter 200ms var(--ease-in);
}

.capsule-enter-from,
.capsule-leave-to {
  opacity: 0;
  transform: translateY(18px) scale(0.72);
  filter: blur(10px);
}
</style>
