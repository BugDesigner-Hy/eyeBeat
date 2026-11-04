<script setup lang="ts">
import { EQ_BANDS, EQ_PRESETS, EQ_RANGE, formatBand } from '../audio/eq'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import PixelIcon from './PixelIcon.vue'

const player = usePlayerStore()
const settings = useSettingsStore()
const ui = useUiStore()

/** 每格 2dB，±12dB 共 13 格 */
const STEP_DB = 2
const CELLS = (EQ_RANGE * 2) / STEP_DB + 1
const CROSSFADE_OPTIONS = [2, 4, 6, 8]

let dragging: number | null = null

function gainAt(e: PointerEvent, el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  const ratio = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  const db = ratio * EQ_RANGE * 2 - EQ_RANGE
  return Math.round(db / STEP_DB) * STEP_DB
}

function onDown(i: number, e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  dragging = i
  settings.setEqBand(i, gainAt(e, el))
}

function onMove(i: number, e: PointerEvent) {
  if (dragging !== i) return
  const g = gainAt(e, e.currentTarget as HTMLElement)
  if (g !== settings.eqGains[i]) settings.setEqBand(i, g)
}

function onUp() {
  dragging = null
}

/** 第 c 格（自下而上）是否点亮：从 0dB 中线向当前增益方向填充 */
function lit(gain: number, c: number): boolean {
  const db = c * STEP_DB - EQ_RANGE
  return gain >= 0 ? db >= 0 && db <= gain : db <= 0 && db >= gain
}

function cycleCrossfade() {
  if (!settings.crossfade) {
    settings.crossfade = true
    settings.crossfadeSec = CROSSFADE_OPTIONS[0]
    return
  }
  const i = CROSSFADE_OPTIONS.indexOf(settings.crossfadeSec)
  if (i === CROSSFADE_OPTIONS.length - 1) settings.crossfade = false
  else settings.crossfadeSec = CROSSFADE_OPTIONS[i + 1] ?? CROSSFADE_OPTIONS[0]
}
</script>

<template>
  <section class="fx" aria-label="音效">
    <i class="fx-scan" aria-hidden="true" />
    <header class="fx-head">
      <span class="fx-label">FX // EQUALIZER</span>
      <button type="button" class="icon-btn" aria-label="关闭音效面板" @click="ui.toggleFx(false)">
        <PixelIcon name="close" />
      </button>
    </header>

    <p v-if="!player.fxAvailable" class="fx-na">当前音源不支持跨域读取音频，均衡器与 8-bit 不可用</p>

    <div class="fx-presets" :class="{ disabled: !player.fxAvailable }">
      <button
        v-for="(p, id) in EQ_PRESETS"
        :key="id"
        type="button"
        class="txt-btn"
        :class="{ on: settings.eqPreset === id }"
        @click="settings.applyEqPreset(id)"
      >
        [{{ p.label }}]
      </button>
      <span v-if="settings.eqPreset === 'custom'" class="fx-custom">[自定义]</span>
    </div>

    <div class="fx-bands" :class="{ disabled: !player.fxAvailable }">
      <div v-for="(hz, i) in EQ_BANDS" :key="hz" class="band" :style="{ '--i': i }">
        <span class="band-db">{{ settings.eqGains[i] > 0 ? '+' : '' }}{{ settings.eqGains[i] }}</span>
        <div
          class="band-col"
          role="slider"
          tabindex="0"
          :aria-label="`${formatBand(hz)}Hz`"
          :aria-valuemin="-EQ_RANGE"
          :aria-valuemax="EQ_RANGE"
          :aria-valuenow="settings.eqGains[i]"
          @pointerdown="onDown(i, $event)"
          @pointermove="onMove(i, $event)"
          @pointerup="onUp"
          @pointercancel="onUp"
          @keydown.up.prevent="settings.setEqBand(i, Math.min(EQ_RANGE, settings.eqGains[i] + STEP_DB))"
          @keydown.down.prevent="settings.setEqBand(i, Math.max(-EQ_RANGE, settings.eqGains[i] - STEP_DB))"
        >
          <i
            v-for="c in CELLS"
            :key="c"
            class="cell"
            :class="{ on: lit(settings.eqGains[i], CELLS - c), zero: CELLS - c === (CELLS - 1) / 2 }"
          />
        </div>
        <span class="band-hz">{{ formatBand(hz) }}</span>
      </div>
    </div>

    <footer class="fx-foot">
      <button
        type="button"
        class="txt-btn"
        :class="{ on: settings.bitcrush }"
        :disabled="!player.fxAvailable"
        title="位深量化 + 降采样"
        @click="settings.bitcrush = !settings.bitcrush"
      >
        [8-BIT {{ settings.bitcrush ? 'ON' : 'OFF' }}]
      </button>
      <button
        type="button"
        class="txt-btn"
        :class="{ on: settings.crossfade }"
        title="切歌淡入淡出时长"
        @click="cycleCrossfade"
      >
        [XFADE {{ settings.crossfade ? `${settings.crossfadeSec}S` : 'OFF' }}]
      </button>
      <button
        type="button"
        class="txt-btn"
        :class="{ on: settings.reticleLocate }"
        title="切歌时准星定位到封面墙上的新歌"
        @click="settings.reticleLocate = !settings.reticleLocate"
      >
        [准星 {{ settings.reticleLocate ? 'ON' : 'OFF' }}]
      </button>
    </footer>
  </section>
</template>

<style scoped>
.fx {
  position: fixed;
  right: 24px;
  bottom: calc(var(--dock-h) + 16px);
  z-index: 57;
  width: min(420px, calc(100vw - 32px));
  padding: 0 16px 12px;
  background: rgba(10, 12, 15, 0.97);
  border: 1px solid var(--line-strong);
  border-top: 2px solid var(--accent);
}

.fx-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
}

.fx-label {
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.fx-na {
  margin: 0 0 8px;
  font-size: 12px;
  color: #ffb347;
}

.fx-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-bottom: 14px;
}

.fx-custom {
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--accent);
}

.disabled {
  opacity: 0.35;
  pointer-events: none;
}

.fx-bands {
  display: flex;
  justify-content: space-between;
}

.band {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.band-db,
.band-hz {
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1;
  color: var(--text-dim);
}

.band-db {
  min-width: 2.2em;
  text-align: center;
  color: var(--text);
}

.band-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 6px;
  cursor: ns-resize;
  touch-action: none;
  outline: none;
}

.band-col:focus-visible {
  outline: 1px dashed var(--accent);
}

.cell {
  width: 14px;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.cell.zero {
  background: rgba(255, 255, 255, 0.22);
}

.cell.on {
  background: var(--accent);
}

.fx-foot {
  display: flex;
  gap: 12px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.txt-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ---------------- 开关动效：顶线亮起 → 向下展开 → 频段自检 ---------------- */

.fx-scan {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--accent);
  box-shadow: 0 0 12px 1px var(--accent);
  opacity: 0;
  pointer-events: none;
}

.band-col {
  position: relative;
}

.band-col::after {
  content: '';
  position: absolute;
  inset: 2px 6px;
  background: linear-gradient(to top, var(--accent), color-mix(in srgb, var(--accent) 20%, transparent));
  transform: scaleY(0);
  transform-origin: bottom;
  opacity: 0;
  pointer-events: none;
}

.fx-enter-active {
  animation:
    fx-unfold 560ms var(--ease-out) both,
    fx-glow 520ms ease-out 560ms;
}

.fx-enter-active .fx-scan {
  animation: fx-scan-down 560ms var(--ease-out) both;
}

.fx-enter-active .fx-head,
.fx-enter-active .fx-na,
.fx-enter-active .fx-presets,
.fx-enter-active .fx-foot {
  animation: fx-in 380ms var(--ease-out) 260ms both;
}

.fx-enter-active .fx-presets {
  animation-delay: 320ms;
}

.fx-enter-active .fx-foot {
  animation-delay: 620ms;
}

.fx-enter-active .band {
  animation: fx-in 360ms var(--ease-out) calc(300ms + var(--i) * 36ms) both;
}

.fx-enter-active .band-col::after {
  animation: band-test 440ms cubic-bezier(0.3, 0, 0.2, 1) calc(360ms + var(--i) * 36ms) both;
}

.fx-leave-active {
  animation: fx-fold 340ms var(--ease-in) both;
}

.fx-leave-active > :not(.fx-scan) {
  animation: fx-out 140ms var(--ease-in) both;
}

.fx-leave-active .fx-scan {
  animation: fx-scan-up 340ms var(--ease-in) both;
}

/* 先只露出顶边 2px，从右向左亮起，再向下展开 */
@keyframes fx-unfold {
  0% {
    clip-path: inset(0 0 calc(100% - 2px) 100%);
  }
  32% {
    clip-path: inset(0 0 calc(100% - 2px) 0);
  }
  100% {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes fx-fold {
  0% {
    clip-path: inset(0 0 0 0);
  }
  68% {
    clip-path: inset(0 0 calc(100% - 2px) 0);
  }
  100% {
    clip-path: inset(0 0 calc(100% - 2px) 100%);
  }
}

@keyframes fx-scan-down {
  0%,
  32% {
    top: 0;
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    top: calc(100% - 2px);
    opacity: 0;
  }
}

@keyframes fx-scan-up {
  0% {
    top: calc(100% - 2px);
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  68%,
  100% {
    top: 0;
    opacity: 1;
  }
}

@keyframes fx-glow {
  0% {
    box-shadow: 0 -2px 22px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  100% {
    box-shadow: 0 0 0 transparent;
  }
}

@keyframes fx-in {
  from {
    opacity: 0;
    transform: translateY(6px);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}

@keyframes fx-out {
  to {
    opacity: 0;
    filter: blur(3px);
  }
}

/* 频段自检：冲到顶再落回，露出真实增益 */
@keyframes band-test {
  0% {
    transform: scaleY(0);
    opacity: 0.9;
  }
  45% {
    transform: scaleY(1);
    opacity: 0.9;
  }
  100% {
    transform: scaleY(0);
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .fx {
    left: 0;
    right: 0;
    bottom: var(--dock-h);
    width: auto;
    max-height: 70vh;
    overflow-y: auto;
    box-sizing: border-box;
    padding-bottom: 16px;
  }
}
</style>
