<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MODE_LABEL, MODE_TITLE, usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { coverSources } from '../utils/cover'
import { fmtTime } from '../utils/time'
import CoverImage from './CoverImage.vue'
import MiniDock from './MiniDock.vue'
import PixelIcon from './PixelIcon.vue'
import RobotEyes from './RobotEyes.vue'
import SegmentBar from './SegmentBar.vue'
import Spectrum from './Spectrum.vue'

const store = usePlayerStore()
const settings = useSettingsStore()
const ui = useUiStore()

/** 首次渲染不播放扫描线动画，只在用户切换后播放 */
const toggled = ref(false)
watch(
  () => ui.barCollapsed,
  () => (toggled.value = true),
)

const progress = computed(() => (store.duration ? store.currentTime / store.duration : 0))
</script>

<template>
  <div v-if="store.current" class="dock" :class="{ collapsed: ui.barCollapsed, toggled }">
    <footer class="bar" :inert="ui.barCollapsed">
      <button
        type="button"
        class="bar-tab stag"
        style="--d: 0"
        aria-label="收起播放栏"
        title="收起播放栏（B）"
        @click="ui.toggleBar(true)"
      >
        <PixelIcon name="chevron-down" />
      </button>
      <SegmentBar
        class="bar-progress stag"
        style="--d: 0"
        label="播放进度"
        :value="progress"
        :seg="5"
        :gap="2"
        :height="3"
        @change="(v) => store.seek(v * store.duration)"
      />

      <div class="bar-body">
        <button
          type="button"
          class="bar-track stag"
          style="--d: 2"
          title="歌曲详情"
          :aria-expanded="ui.detailOpen"
          @click="ui.toggleDetail()"
        >
          <span class="bar-thumb" :class="{ lifted: ui.coverLifted }" data-np-thumb>
            <CoverImage :sources="coverSources(store.current.cover, 'small')" />
          </span>
          <span class="bar-text">
            <span class="bar-title">{{ store.current.title }}</span>
            <span class="bar-artist">{{ store.current.artist }}</span>
          </span>
        </button>

        <div class="bar-controls stag" style="--d: 1">
          <span class="time">{{ fmtTime(store.currentTime) }}</span>
          <button type="button" class="txt-btn" :title="MODE_TITLE[store.mode]" @click="store.cycleMode()">
            [{{ MODE_LABEL[store.mode] }}]
          </button>
          <button type="button" class="icon-btn" aria-label="上一首" @click="store.prev()">
            <PixelIcon name="prev" />
          </button>
          <button
            type="button"
            class="play-btn px-cut"
            :class="{ busy: store.buffering, on: store.isPlaying }"
            :aria-label="store.isPlaying ? '暂停' : '播放'"
            @click="store.toggle()"
          >
            <RobotEyes :on="store.isPlaying" :analyser="store.analyser" />
          </button>
          <button type="button" class="icon-btn" aria-label="下一首" @click="store.next()">
            <PixelIcon name="next" />
          </button>
          <button
            type="button"
            class="txt-btn"
            :class="{ on: ui.lyricsVisible }"
            title="歌词"
            @click="ui.toggleLyrics()"
          >
            [LRC]
          </button>
          <span class="time dim">{{ fmtTime(store.duration) }}</span>
        </div>

        <div class="bar-side stag" style="--d: 0">
          <Spectrum :analyser="store.analyser" :playing="store.isPlaying" />
          <button
            type="button"
            class="txt-btn"
            :class="{ on: ui.fxOpen || settings.bitcrush || settings.eqPreset !== 'flat' }"
            title="音效"
            @click="ui.toggleFx()"
          >
            [FX]
          </button>
          <button
            type="button"
            class="icon-btn"
            :aria-label="store.muted ? '取消静音' : '静音'"
            @click="store.toggleMute()"
          >
            <PixelIcon :name="store.muted || store.volume === 0 ? 'mute' : 'volume'" />
          </button>
          <SegmentBar
            class="bar-volume"
            label="音量"
            :value="store.muted ? 0 : store.volume"
            :seg="4"
            :gap="2"
            :height="10"
            @input="store.setVolume"
            @change="store.setVolume"
          />
        </div>
      </div>
    </footer>
    <i class="dock-scan" aria-hidden="true" />
    <Transition name="capsule">
      <MiniDock v-if="ui.barCollapsed" />
    </Transition>
  </div>
</template>

<style scoped>
.dock {
  --wipe: 460ms;
  --wipe-delay: 140ms;
  --wipe-ease: cubic-bezier(0.65, 0, 0.35, 1);
}

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  height: var(--bar-h);
  background: rgba(10, 12, 15, 0.94);
  border-top: 1px solid var(--line);
  /* 负的 top 让上方的进度条和收起凸舌不被裁掉 */
  clip-path: inset(-32px 0 0 0);
  transition:
    clip-path var(--wipe) var(--wipe-ease),
    visibility 0s;
  animation: bar-in 520ms var(--ease-out) backwards;
}

@keyframes bar-in {
  from {
    transform: translateY(100%);
  }
}

/* 收起：控件先从右到左依次下沉淡出，再由一道扫描线自上而下收合 */
.dock.collapsed .bar {
  clip-path: inset(100% 0 0 0);
  visibility: hidden;
  transition:
    clip-path var(--wipe) var(--wipe-ease) var(--wipe-delay),
    visibility 0s linear calc(var(--wipe) + var(--wipe-delay));
}

.stag {
  transition:
    opacity 320ms var(--ease-out),
    transform 420ms var(--ease-out),
    filter 320ms var(--ease-out);
  transition-delay: calc(220ms + var(--d) * 60ms);
}

.dock.collapsed .stag {
  opacity: 0;
  transform: translateY(14px);
  filter: blur(4px);
  transition-timing-function: var(--ease-in);
  transition-duration: 220ms;
  transition-delay: calc(var(--d) * 45ms);
}

.dock-scan {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--bar-h) - 1px);
  z-index: 41;
  height: 2px;
  pointer-events: none;
  opacity: 0;
  background:
    linear-gradient(90deg, transparent, #fff 50%, transparent) -30% 0 / 30% 100% no-repeat,
    var(--accent);
  box-shadow:
    0 0 12px var(--accent),
    0 0 2px var(--accent);
}

.dock.toggled.collapsed .dock-scan {
  animation:
    scan-down var(--wipe) var(--wipe-ease) var(--wipe-delay) both,
    scan-glint var(--wipe) linear var(--wipe-delay) both;
}

.dock.toggled:not(.collapsed) .dock-scan {
  animation:
    scan-up var(--wipe) var(--wipe-ease) both,
    scan-glint var(--wipe) linear both;
}

@keyframes scan-down {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(var(--bar-h));
  }
}

@keyframes scan-up {
  0% {
    opacity: 1;
    transform: translateY(var(--bar-h));
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(0);
  }
}

@keyframes scan-glint {
  to {
    background-position:
      130% 0,
      0 0;
  }
}

.bar-tab {
  position: absolute;
  right: 24px;
  top: -30px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-bottom: 0;
  background: rgba(10, 12, 15, 0.94);
  color: var(--text-dim);
  cursor: pointer;
  clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 100%, 0 100%);
}

.bar-tab:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, rgba(10, 12, 15, 0.94));
}

.bar-tab :deep(svg) {
  transition: transform 260ms var(--ease-out);
}

.bar-tab:hover :deep(svg) {
  transform: translateY(2px);
}

.bar-progress {
  position: absolute;
  left: 0;
  right: 0;
  top: -8px;
}

.bar-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  height: 100%;
  padding: 0 24px;
}

.bar-track {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.bar-thumb {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  outline: 1px solid var(--line-strong);
  outline-offset: 2px;
}

.bar-thumb.lifted {
  visibility: hidden;
}

.bar-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.bar-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-artist {
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-track:hover .bar-title {
  color: var(--accent);
}

.bar-controls {
  display: flex;
  align-items: center;
  gap: 14px;
}

.time {
  font-family: var(--font-mono);
  font-size: 18px;
  min-width: 44px;
  text-align: center;
  color: var(--text);
}

.time.dim {
  color: var(--text-dim);
}

.play-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  background: var(--accent);
  color: var(--bg);
  cursor: pointer;
}

.play-btn:hover {
  background: #fff;
}

.play-btn.busy {
  animation: blink 700ms steps(2) infinite;
}

.play-btn.on {
  position: relative;
  overflow: hidden;
}

.play-btn.on::after {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: var(--bg);
  opacity: 0.16;
  animation: visor 2.6s linear infinite;
  pointer-events: none;
}

@keyframes visor {
  from {
    transform: translateY(-2px);
  }
  to {
    transform: translateY(44px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .play-btn.on::after {
    animation: none;
    opacity: 0;
  }
}

.bar-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
}

.bar-volume {
  width: 96px;
}

@media (max-width: 900px) {
  .bar-body {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 0 12px;
  }
  .bar-side,
  .time,
  .bar-controls .txt-btn:first-of-type {
    display: none;
  }
}
</style>
