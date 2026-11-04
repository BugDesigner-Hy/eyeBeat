<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMobile } from '../composables/useMobile'
import { useI18n } from '../i18n'
import { MODE_LABEL, MODE_TITLE_KEY, usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { coverSources } from '../utils/cover'
import { fmtTime } from '../utils/time'
import CoverImage from './CoverImage.vue'
import MiniDock from './MiniDock.vue'
import MobileBar from './MobileBar.vue'
import PixelIcon from './PixelIcon.vue'
import RobotEyes, { type EyeCue } from './RobotEyes.vue'
import SegmentBar from './SegmentBar.vue'
import Spectrum from './Spectrum.vue'

const store = usePlayerStore()
const settings = useSettingsStore()
const ui = useUiStore()
const { t } = useI18n()
const mobile = useMobile()
/** 手机端只有迷你播放条，没有收起胶囊 */
const collapsed = computed(() => ui.barCollapsed && !mobile.value)

/** 首次渲染不播放扫描线动画，只在用户切换后播放 */
const toggled = ref(false)
watch(collapsed, () => (toggled.value = true))

const progress = computed(() => (store.duration ? store.currentTime / store.duration : 0))

/** 由详情页飞行态驱动：拎走时隐藏，飞回底栏落位后再显示 */
const hideMeta = computed(() => ui.coverLifted)

const eyeCue = ref<EyeCue | null>(null)
const eyePoke = ref(0)

function setCue(c: EyeCue) {
  eyeCue.value = c
}
function clearCue(c: EyeCue) {
  if (eyeCue.value === c) eyeCue.value = null
}
function poke(c: EyeCue) {
  eyeCue.value = c
  eyePoke.value++
}
</script>

<template>
  <div v-if="store.current" class="dock" :class="{ collapsed, toggled }">
    <MobileBar v-if="mobile" />
    <footer v-else class="bar" :inert="collapsed">
      <button
        type="button"
        class="bar-tab stag"
        style="--d: 0"
        :aria-label="t('player.collapse')"
        :title="`${t('player.collapse')} (B)`"
        @pointerenter="setCue('collapse')"
        @pointerleave="clearCue('collapse')"
        @click="poke('collapse'); ui.toggleBar(true)"
      >
        <PixelIcon name="chevron-down" />
      </button>
      <SegmentBar
        class="bar-progress stag"
        style="--d: 0"
        :label="t('player.progress')"
        :value="progress"
        :seg="5"
        :gap="2"
        :height="3"
        smooth="seek"
        @pointerenter="setCue('seek')"
        @pointerleave="clearCue('seek')"
        @pointerdown="poke('seek')"
        @change="(v) => store.seek(v * store.duration)"
      />

      <div class="bar-body">
        <button
          type="button"
          class="bar-track stag"
          style="--d: 2"
          :title="t('player.detail')"
          :aria-expanded="ui.detailOpen"
          @pointerenter="setCue('detail')"
          @pointerleave="clearCue('detail')"
          @click="poke('detail'); ui.toggleDetail()"
        >
          <span class="bar-thumb" :class="{ lifted: hideMeta }" data-np-thumb>
            <CoverImage :sources="coverSources(store.current.cover, 'small')" />
          </span>
          <span class="bar-text" :class="{ lifted: hideMeta }" data-np-bar-text>
            <span class="bar-title">{{ store.current.title }}</span>
            <span class="bar-artist">{{ store.current.artist }}</span>
          </span>
        </button>

        <div class="bar-controls stag" style="--d: 1">
          <span class="time">{{ fmtTime(store.currentTime) }}</span>
          <button
            type="button"
            class="txt-btn"
            :title="t(MODE_TITLE_KEY[store.mode])"
            @pointerenter="setCue('mode')"
            @pointerleave="clearCue('mode')"
            @click="poke('mode'); store.cycleMode()"
          >
            [{{ MODE_LABEL[store.mode] }}]
          </button>
          <button
            type="button"
            class="icon-btn"
            :aria-label="t('player.prev')"
            @pointerenter="setCue('prev')"
            @pointerleave="clearCue('prev')"
            @click="poke('prev'); store.prev()"
          >
            <PixelIcon name="prev" />
          </button>
          <button
            type="button"
            class="play-btn px-cut"
            :class="{ busy: store.buffering, on: store.isPlaying }"
            :aria-label="store.isPlaying ? t('player.pause') : t('player.play')"
            @click="store.toggle()"
          >
            <RobotEyes :on="store.isPlaying" :analyser="store.analyser" :cue="eyeCue" :poke="eyePoke" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :aria-label="t('player.next')"
            @pointerenter="setCue('next')"
            @pointerleave="clearCue('next')"
            @click="poke('next'); store.next()"
          >
            <PixelIcon name="next" />
          </button>
          <button
            type="button"
            class="txt-btn"
            :class="{ on: ui.lyricsVisible }"
            :title="t('player.lyrics')"
            @pointerenter="setCue('lyrics')"
            @pointerleave="clearCue('lyrics')"
            @click="poke('lyrics'); ui.toggleLyrics()"
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
            :title="t('player.fx')"
            @pointerenter="setCue('fx')"
            @pointerleave="clearCue('fx')"
            @click="poke('fx'); ui.toggleFx()"
          >
            [FX]
          </button>
          <button
            type="button"
            class="icon-btn vol-btn"
            :class="{ muted: store.muted || store.volume === 0 }"
            :aria-label="store.muted ? t('player.unmute') : t('player.mute')"
            @pointerenter="setCue(store.muted || store.volume === 0 ? 'unmute' : 'mute')"
            @pointerleave="clearCue('mute'); clearCue('unmute')"
            @click="poke(store.muted || store.volume === 0 ? 'unmute' : 'mute'); store.toggleMute()"
          >
            <Transition name="vol-icon" mode="out-in">
              <PixelIcon
                :key="store.muted || store.volume === 0 ? 'mute' : 'volume'"
                :name="store.muted || store.volume === 0 ? 'mute' : 'volume'"
              />
            </Transition>
          </button>
          <SegmentBar
            class="bar-volume"
            :label="t('player.volume')"
            :value="store.muted ? 0 : store.volume"
            :seg="4"
            :gap="2"
            :height="10"
            smooth
            @pointerenter="setCue('volume')"
            @pointerleave="clearCue('volume')"
            @pointerdown="poke('volume')"
            @input="store.setVolume"
            @change="store.setVolume"
          />
        </div>
      </div>
    </footer>
    <i v-if="!mobile" class="dock-scan" aria-hidden="true" />
    <Transition name="capsule">
      <MiniDock v-if="collapsed" />
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

.bar-text.lifted {
  visibility: hidden;
}

.bar-title {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  image-rendering: pixelated;
}

.bar-artist {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 16px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  image-rendering: pixelated;
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

.vol-btn {
  transition:
    color 220ms var(--ease-out),
    transform 220ms var(--ease-out);
}

.vol-btn.muted {
  color: var(--text-dim);
}

.vol-btn:active {
  transform: scale(0.88);
}

.vol-icon-enter-active,
.vol-icon-leave-active {
  transition:
    opacity 160ms var(--ease-out),
    transform 220ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.vol-icon-leave-to {
  opacity: 0;
  transform: scale(0.55) rotate(-28deg);
}

.vol-icon-enter-from {
  opacity: 0;
  transform: scale(0.55) rotate(28deg);
}

@media (prefers-reduced-motion: reduce) {
  .vol-btn,
  .vol-icon-enter-active,
  .vol-icon-leave-active {
    transition: none;
  }
  .vol-icon-leave-to,
  .vol-icon-enter-from {
    transform: none;
  }
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
