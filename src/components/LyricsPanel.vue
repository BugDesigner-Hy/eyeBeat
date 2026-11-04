<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { LyricWord } from '../api/types'
import { NO_LYRICS, useLyricsStore } from '../stores/lyrics'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import PixelIcon from './PixelIcon.vue'

const player = usePlayerStore()
const lyrics = useLyricsStore()
const settings = useSettingsStore()
const ui = useUiStore()
const body = ref<HTMLElement>()
const sourceMenu = ref(false)

/** 逐字填充按 1/8 量化，形成像素扫描感 */
const WORD_STEPS = 8

const offset = reactive({ x: 0, y: 0 })
let drag: { x: number; y: number; ox: number; oy: number } | null = null

function onDragStart(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
}

function onDragMove(e: PointerEvent) {
  if (!drag) return
  offset.x = drag.ox + e.clientX - drag.x
  offset.y = drag.oy + e.clientY - drag.y
}

function onDragEnd() {
  drag = null
}

const USER_SCROLL_HOLD = 3000
let userScrollUntil = 0
const onUserScroll = () => (userScrollUntil = performance.now() + USER_SCROLL_HOLD)

function scrollToLine(i: number, smooth = true) {
  const box = body.value
  const el = box?.querySelector<HTMLElement>(`[data-i="${i}"]`)
  if (!box || !el) return
  box.scrollTo({
    top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

watch(
  () => lyrics.activeLine,
  (i) => {
    if (i < 0 || performance.now() < userScrollUntil) return
    nextTick(() => scrollToLine(i))
  },
)

watch(
  () => lyrics.lyrics,
  () =>
    nextTick(() =>
      lyrics.activeLine >= 0 ? scrollToLine(lyrics.activeLine, false) : body.value?.scrollTo({ top: 0 }),
    ),
)

function onLineClick(time: number) {
  if (time < 0) return
  userScrollUntil = 0
  player.seek(time - player.streamOffset - settings.lyricOffset - lyrics.trackOffset)
}

function wordProgress(w: LyricWord): number {
  const p = (lyrics.time - w.time) / Math.max(w.duration, 0.05)
  return Math.round(Math.min(1, Math.max(0, p)) * WORD_STEPS) / WORD_STEPS
}

function pick(id: string | null) {
  lyrics.choose(id)
  sourceMenu.value = false
}

const fmtOffset = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}s`
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

const sourceLabel = computed(() => {
  if (lyrics.chosenId === NO_LYRICS) return 'OFF'
  return lyrics.source?.toUpperCase() ?? '--'
})
</script>

<template>
  <aside
    v-if="player.current"
    class="lyrics"
    :class="{ 'is-pixel': settings.pixelLyrics }"
    :style="{ translate: `${offset.x}px ${offset.y}px` }"
    aria-label="歌词"
  >
    <i class="corners" aria-hidden="true" />
    <i class="holo-edges" aria-hidden="true" />
    <div class="ly-shell">
      <i class="holo-scan" aria-hidden="true" />
      <header
        class="ly-head"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <span class="ly-label">LYRICS<span class="caret">_</span></span>
        <button
          type="button"
          class="txt-btn ly-src"
          :class="{ on: sourceMenu }"
          title="切换歌词源"
          @click="sourceMenu = !sourceMenu"
        >
          [SRC::{{ sourceLabel }}]
        </button>
        <button type="button" class="icon-btn" aria-label="关闭歌词" @click="ui.toggleLyrics(false)">
          <PixelIcon name="close" />
        </button>
      </header>

      <div class="ly-track">
        <b>{{ player.current.title }}</b>
        <span>{{ player.current.artist }}</span>
      </div>

      <div v-if="sourceMenu" class="ly-menu">
        <p class="ly-menu-head">
          <span>// {{ lyrics.candidates.length }} CANDIDATES</span>
          <button type="button" class="txt-btn" @click="lyrics.refresh()">[RESCAN]</button>
        </p>
        <button
          v-for="c in lyrics.candidates"
          :key="c.id"
          type="button"
          class="ly-cand"
          :class="{ on: lyrics.selected?.id === c.id }"
          @click="pick(c.id)"
        >
          <span class="cand-score">{{ String(c.score ?? 0).padStart(3, '0') }}</span>
          <span class="cand-main">
            <b>{{ c.title }}</b>
            <small>{{ c.artist }} · {{ fmtDuration(c.duration) }}</small>
          </span>
          <span class="cand-tags">
            {{ c.source.toUpperCase() }}
            {{ c.lyrics.wordSynced ? 'WORD' : c.lyrics.synced ? 'SYNC' : 'TEXT' }}
          </span>
        </button>
        <button type="button" class="ly-cand" :class="{ on: lyrics.chosenId === null }" @click="pick(null)">
          <span class="cand-score">AUT</span>
          <span class="cand-main"><b>自动选择最佳匹配</b></span>
        </button>
        <button type="button" class="ly-cand" :class="{ on: lyrics.chosenId === NO_LYRICS }" @click="pick(NO_LYRICS)">
          <span class="cand-score">OFF</span>
          <span class="cand-main"><b>不显示歌词</b></span>
        </button>
      </div>

      <div ref="body" class="ly-body" @wheel.passive="onUserScroll" @touchmove.passive="onUserScroll">
        <p v-if="lyrics.loading" class="ly-state">SCANNING<i class="dots" /></p>
        <p v-else-if="!lyrics.lyrics" class="ly-state">
          NO LYRICS FOUND
          <small v-if="lyrics.candidates.length">有 {{ lyrics.candidates.length }} 个低匹配度结果，可点击 SRC 手动选择</small>
          <small v-else>暂无歌词</small>
        </p>
        <template v-else>
          <p v-if="!lyrics.lyrics.synced" class="ly-hint">// 非同步歌词</p>
          <p
            v-for="(line, i) in lyrics.lines"
            :key="i"
            :data-i="i"
            class="ly-line"
            :style="{ '--k': Math.min(12, Math.abs(i - Math.max(0, lyrics.activeLine))) }"
            :class="{
              active: i === lyrics.activeLine,
              past: i < lyrics.activeLine,
              static: !lyrics.lyrics.synced,
              words: i === lyrics.activeLine && !!line.words?.length,
            }"
            @click="onLineClick(line.time)"
          >
            <span v-if="i === lyrics.activeLine && line.words?.length">
              <span v-for="(w, j) in line.words" :key="j" class="w" :style="{ '--p': wordProgress(w) }">{{
                w.text
              }}</span>
            </span>
            <span v-else>{{ line.text }}</span>
            <small v-if="line.translation">{{ line.translation }}</small>
          </p>
        </template>
      </div>

      <footer v-if="lyrics.lyrics?.synced" class="ly-foot">
        <div class="ly-offset" title="正值让歌词提前">
          <span class="ly-offset-label">TRACK</span>
          <button type="button" class="txt-btn" @click="lyrics.adjustTrackOffset(-0.5)">«</button>
          <button type="button" class="txt-btn" @click="lyrics.adjustTrackOffset(-0.1)">‹</button>
          <button type="button" class="txt-btn ly-offset-value" @click="lyrics.setTrackOffset(0)">
            {{ fmtOffset(lyrics.trackOffset) }}
          </button>
          <button type="button" class="txt-btn" @click="lyrics.adjustTrackOffset(0.1)">›</button>
          <button type="button" class="txt-btn" @click="lyrics.adjustTrackOffset(0.5)">»</button>
        </div>
        <div class="ly-offset" title="全局偏移，用于补偿蓝牙耳机等输出延迟">
          <span class="ly-offset-label">GLOBAL</span>
          <button type="button" class="txt-btn" @click="lyrics.adjustGlobalOffset(-0.1)">‹</button>
          <button type="button" class="txt-btn ly-offset-value" @click="settings.lyricOffset = 0">
            {{ fmtOffset(settings.lyricOffset) }}
          </button>
          <button type="button" class="txt-btn" @click="lyrics.adjustGlobalOffset(0.1)">›</button>
        </div>
      </footer>
    </div>
  </aside>
</template>

<style scoped>
.lyrics {
  position: fixed;
  top: 96px;
  right: max(16px, min(28px, calc(100vw - 376px)));
  bottom: calc(var(--dock-h) + 28px);
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 32px));
  transform-origin: right bottom;
}

.ly-shell {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: rgba(10, 12, 15, 0.97);
  border: 1px solid var(--line-strong);
}

.corners {
  position: absolute;
  inset: -1px;
  z-index: 3;
  pointer-events: none;
  --c: var(--accent);
  --l: 10px;
  background:
    linear-gradient(var(--c) 0 0) top left / var(--l) 2px,
    linear-gradient(var(--c) 0 0) top left / 2px var(--l),
    linear-gradient(var(--c) 0 0) top right / var(--l) 2px,
    linear-gradient(var(--c) 0 0) top right / 2px var(--l),
    linear-gradient(var(--c) 0 0) bottom left / var(--l) 2px,
    linear-gradient(var(--c) 0 0) bottom left / 2px var(--l),
    linear-gradient(var(--c) 0 0) bottom right / var(--l) 2px,
    linear-gradient(var(--c) 0 0) bottom right / 2px var(--l);
  background-repeat: no-repeat;
}

/* ---------- 全息投影出入场 ----------
 * 展开：中心光点 → 横向光线 → 上下展开成面板（两道光边跟随裁切边缘）
 *       → 扫描线自上而下扫过 → 歌词从当前行向外逐行显影 → 一次轻微 RGB 色散
 * 收起：倒放，压成一条线后缩成光点消失
 */

.holo-edges,
.holo-scan {
  position: absolute;
  pointer-events: none;
  opacity: 0;
}

.holo-edges {
  inset: 0;
  z-index: 2;
}

.holo-edges::before,
.holo-edges::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  background: var(--accent);
  box-shadow:
    0 0 14px var(--accent),
    0 0 3px var(--accent);
}

.holo-scan {
  left: 0;
  right: 0;
  top: 0;
  z-index: 2;
  height: 72px;
  background: linear-gradient(transparent, color-mix(in srgb, var(--accent) 16%, transparent) 85%, var(--accent));
  mix-blend-mode: screen;
}

.holo-enter-active {
  animation:
    holo-pop 620ms var(--ease-out) both,
    holo-chroma 200ms linear 560ms;
}

.holo-enter-active .ly-shell {
  animation: holo-open 620ms var(--ease-out) both;
}

.holo-enter-active .holo-edges {
  animation: holo-fade 620ms linear both;
}

.holo-enter-active .holo-edges::before {
  animation: edge-up 620ms var(--ease-out) both;
}

.holo-enter-active .holo-edges::after {
  animation: edge-down 620ms var(--ease-out) both;
}

.holo-enter-active .holo-scan {
  animation: holo-sweep 640ms cubic-bezier(0.45, 0, 0.2, 1) 320ms both;
}

.holo-enter-active .corners {
  animation: corners-in 560ms var(--ease-out) 160ms both;
}

.holo-enter-active .ly-head > *,
.holo-enter-active .ly-track,
.holo-enter-active .ly-foot,
.holo-enter-active .ly-state {
  animation: holo-in 420ms var(--ease-out) 300ms both;
}

.holo-enter-active .ly-line {
  animation: holo-in 460ms var(--ease-out) both;
  animation-delay: calc(340ms + var(--k, 0) * 34ms);
}

.holo-leave-active {
  animation: holo-pop-out 360ms var(--ease-in) both;
}

.holo-leave-active .ly-shell {
  animation: holo-shut 360ms var(--ease-in) both;
}

.holo-leave-active .ly-shell > * {
  animation: holo-out 140ms var(--ease-in) both;
}

.holo-leave-active .holo-edges {
  animation: holo-fade-out 360ms linear both;
}

.holo-leave-active .holo-edges::before {
  animation: edge-up 360ms var(--ease-in) reverse both;
}

.holo-leave-active .holo-edges::after {
  animation: edge-down 360ms var(--ease-in) reverse both;
}

.holo-leave-active .corners {
  animation: corners-in 260ms var(--ease-in) reverse both;
}

@keyframes holo-pop {
  from {
    transform: translate(18px, 28px) scale(0.97);
  }
}

@keyframes holo-pop-out {
  to {
    transform: translate(10px, 16px) scale(0.98);
  }
}

@keyframes holo-open {
  0% {
    clip-path: inset(calc(50% - 1px) 50% calc(50% - 1px) 50%);
  }
  30% {
    clip-path: inset(calc(50% - 1px) 0 calc(50% - 1px) 0);
  }
  100% {
    clip-path: inset(0);
  }
}

@keyframes holo-shut {
  0% {
    clip-path: inset(0);
  }
  65% {
    clip-path: inset(calc(50% - 1px) 0 calc(50% - 1px) 0);
  }
  100% {
    clip-path: inset(calc(50% - 1px) 50% calc(50% - 1px) 50%);
  }
}

/* 光边与裁切边缘共用同一时间轴：前 30% 横向展开，之后上下分离 */
@keyframes edge-up {
  0% {
    top: 50%;
    transform: scaleX(0);
  }
  30% {
    top: 50%;
    transform: scaleX(1);
  }
  100% {
    top: 0;
    transform: scaleX(1);
  }
}

@keyframes edge-down {
  0% {
    top: 50%;
    transform: scaleX(0);
  }
  30% {
    top: 50%;
    transform: scaleX(1);
  }
  100% {
    top: 100%;
    transform: scaleX(1);
  }
}

@keyframes holo-fade {
  0%,
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes holo-fade-out {
  0% {
    opacity: 0;
  }
  15%,
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes holo-sweep {
  0% {
    opacity: 1;
    transform: translateY(-100%);
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(calc(100vh - 220px));
  }
}

@keyframes corners-in {
  from {
    inset: -22px;
    opacity: 0;
  }
}

@keyframes holo-in {
  from {
    opacity: 0;
    transform: translateY(8px);
    filter: blur(6px);
  }
}

@keyframes holo-out {
  to {
    opacity: 0;
    filter: blur(4px);
  }
}

@keyframes holo-chroma {
  0%,
  100% {
    filter: none;
  }
  25% {
    filter: drop-shadow(-3px 0 rgba(255, 40, 110, 0.55)) drop-shadow(3px 0 rgba(0, 230, 255, 0.55));
  }
  60% {
    filter: drop-shadow(2px 0 rgba(255, 40, 110, 0.4)) drop-shadow(-2px 0 rgba(0, 230, 255, 0.4));
  }
}

.ly-head {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--line);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.ly-head:active {
  cursor: grabbing;
}

.ly-label {
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.caret {
  animation: blink 1s steps(2) infinite;
}

.ly-src {
  margin-left: auto;
  font-size: 16px;
}

.ly-track {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px 10px;
}

.ly-track b {
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ly-track span {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

/* ---------- 换源菜单 ---------- */

.ly-menu {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  z-index: 2;
  max-height: 60%;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg);
  border-bottom: 1px solid var(--line-strong);
}

.ly-menu-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 0 6px;
  padding: 0 6px;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}

.ly-cand {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px;
  border: 0;
  background: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.ly-cand:hover {
  background: var(--bg-2);
}

.ly-cand.on {
  background: var(--accent);
  color: var(--bg);
}

.cand-score,
.cand-tags {
  flex: none;
  font-family: var(--font-mono);
  font-size: 15px;
}

.cand-score {
  width: 28px;
}

.cand-tags {
  opacity: 0.7;
}

.cand-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.cand-main b,
.cand-main small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cand-main b {
  font-size: 13px;
}

.cand-main small {
  font-size: 11px;
  opacity: 0.7;
}

/* ---------- 歌词 ---------- */

.ly-body {
  flex: 1;
  overflow-y: auto;
  padding: 40% 16px;
  scrollbar-width: none;
  mask-image: linear-gradient(transparent, #000 18%, #000 82%, transparent);
}

.ly-body::-webkit-scrollbar {
  display: none;
}

.ly-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 20px;
  color: var(--text-dim);
  text-align: center;
}

.ly-state small {
  font-family: var(--font-sans);
  font-size: 12px;
}

.ly-hint {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}

.ly-line {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 7px 0 7px 14px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-dim);
  cursor: pointer;
  transition:
    color 200ms,
    font-size 200ms;
}

.ly-line small {
  font-size: 12px;
  opacity: 0.7;
}

.ly-line.past {
  color: rgba(123, 135, 148, 0.55);
}

.ly-line.static {
  cursor: default;
  color: var(--text);
}

.ly-line:not(.static):hover {
  color: var(--text);
}

.ly-line.active {
  color: var(--accent);
  font-size: 18px;
  font-weight: 600;
}

.ly-line.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: calc(7px + 0.75em - 3px);
  width: 6px;
  height: 6px;
  background: var(--accent);
  animation: blink 1s steps(2) infinite;
}

.ly-line.words .w {
  background: linear-gradient(90deg, var(--accent) calc(var(--p) * 100%), rgba(216, 222, 230, 0.32) 0);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.ly-line.words small {
  color: var(--accent);
}

/* ---------- 偏移 ---------- */

.ly-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--line);
}

.ly-offset {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ly-offset .txt-btn {
  font-size: 18px;
  padding: 0 3px;
}

.ly-offset-label {
  margin-right: 4px;
  font-family: var(--font-pixel);
  font-size: 8px;
  color: var(--text-dim);
}

.ly-offset-value {
  min-width: 46px;
  color: var(--text);
}

/* ---------- 像素歌词 ---------- */

.lyrics.is-pixel .ly-line {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: 0.04em;
  image-rendering: pixelated;
}

.lyrics.is-pixel .ly-line small {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
}

.lyrics.is-pixel .ly-line.active {
  font-size: 24px;
  font-weight: 400;
  line-height: 28px;
}

.lyrics.is-pixel .ly-hint,
.lyrics.is-pixel .ly-state {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
}
</style>
