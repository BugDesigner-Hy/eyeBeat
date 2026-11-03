<script setup lang="ts">
import { computed, ref } from 'vue'
import { availableProviders, provider, switchProvider } from '../api'
import { useAccountStore } from '../stores/account'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
const account = useAccountStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const nextProvider = availableProviders.find((p) => p.id !== provider.id)

const DRAG_CLOSE = 80
const dragY = ref(0)
let drag: { id: number; y: number } | null = null

function onGrab(e: PointerEvent) {
  drag = { id: e.pointerId, y: e.clientY }
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {}
}

function onGrabMove(e: PointerEvent) {
  if (drag?.id === e.pointerId) dragY.value = Math.max(0, e.clientY - drag.y)
}

function onGrabEnd(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  drag = null
  // 关闭时保留拖出的位移，否则回弹过渡会和收起动画反向拉扯
  if (dragY.value > DRAG_CLOSE) ui.toggleMenu(false)
  else dragY.value = 0
}

const sheetStyle = computed(() => (dragY.value ? { translate: `0 ${dragY.value}px`, transition: 'none' } : undefined))
const fxActive = computed(() => settings.bitcrush || settings.eqPreset !== 'flat')

function run(fn: () => void) {
  ui.toggleMenu(false)
  fn()
}
</script>

<template>
  <div class="ms" @click.self="ui.toggleMenu(false)">
    <section class="ms-sheet" role="dialog" aria-modal="true" aria-label="菜单" :style="sheetStyle">
      <i class="ms-scan" aria-hidden="true" />
      <div
        class="ms-grab"
        aria-hidden="true"
        @pointerdown="onGrab"
        @pointermove="onGrabMove"
        @pointerup="onGrabEnd"
        @pointercancel="onGrabEnd"
      >
        <i />
      </div>
      <p class="ms-label">// SYSTEM MENU</p>
      <ul class="ms-list">
        <li v-if="account.supported" style="--i: 0">
          <button type="button" class="ms-row" @click="run(() => account.openLogin(true))">
            <span class="ms-key">ACCOUNT</span>
            <span class="ms-val">
              <img v-if="account.profile" :src="`${account.profile.avatar}?param=40y40`" alt="" />
              {{ account.profile ? account.profile.nickname : '[LOGIN]' }}
            </span>
          </button>
        </li>
        <li style="--i: 1">
          <button
            type="button"
            class="ms-row"
            :disabled="!nextProvider"
            @click="nextProvider && run(() => switchProvider(nextProvider!.id))"
          >
            <span class="ms-key">SOURCE</span>
            <span class="ms-val">
              SRC::{{ player.providerName.toUpperCase() }}
              <span v-if="nextProvider" class="ms-dim">→ {{ nextProvider.name.toUpperCase() }}</span>
            </span>
          </button>
        </li>
        <li style="--i: 2">
          <button type="button" class="ms-row" @click="run(() => ui.toggleFx(true))">
            <span class="ms-key">FX</span>
            <span class="ms-val" :class="{ on: fxActive }">{{ fxActive ? 'ACTIVE' : 'FLAT' }}</span>
          </button>
        </li>
        <li style="--i: 3">
          <button type="button" class="ms-row" @click="run(() => ui.togglePalette(true))">
            <span class="ms-key">COMMANDS</span>
            <span class="ms-val ms-dim">[CTRL+K]</span>
          </button>
        </li>
      </ul>
      <p class="ms-foot">
        {{ String(player.tracks.length).padStart(3, '0') }} TRK ·
        <i class="dot" :class="{ live: player.isPlaying }" />
        {{ player.isPlaying ? 'PLAYING' : 'IDLE' }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.ms {
  position: fixed;
  inset: 0;
  z-index: 92;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.55);
}

.ms-sheet {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
  background: rgba(10, 12, 15, 0.97);
  border-top: 1px solid var(--line-strong);
  transition: translate 240ms var(--ease-out);
}

.ms-scan {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
  opacity: 0.35;
}

.ms-grab {
  display: grid;
  place-items: center;
  height: 28px;
  touch-action: none;
  cursor: grab;
}

.ms-grab i {
  width: 36px;
  height: 4px;
  background: var(--line-strong);
}

.ms-label {
  margin: 0 0 6px;
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.ms-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ms-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 4px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: none;
  color: var(--text);
  font-family: var(--font-mono), var(--font-sans);
  font-size: 18px;
  text-align: left;
  cursor: pointer;
}

.ms-row:active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.ms-row:disabled {
  opacity: 0.5;
  cursor: default;
}

.ms-key {
  flex: none;
  color: var(--text-dim);
}

.ms-val {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ms-val.on {
  color: var(--accent);
}

.ms-val img {
  flex: none;
  width: 20px;
  height: 20px;
}

.ms-dim {
  color: var(--text-dim);
}

.ms-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}

.dot {
  width: 6px;
  height: 6px;
  background: var(--text-dim);
}

.dot.live {
  background: var(--accent);
  animation: blink 1s steps(2) infinite;
}

/* 抽屉升起 → 扫描线横向扫开 → 条目逐行显影 */
.sheet-enter-active {
  animation: ms-fade 200ms var(--ease-out) both;
}
.sheet-enter-active .ms-sheet {
  animation: ms-up 360ms var(--ease-out) both;
}
.sheet-enter-active .ms-scan {
  animation: ms-scan 520ms var(--ease-out) both;
}
.sheet-enter-active .ms-list li {
  animation: ms-row 320ms var(--ease-out) calc(160ms + var(--i) * 60ms) both;
}
.sheet-leave-active {
  animation: ms-fade 220ms var(--ease-in) reverse both;
}
.sheet-leave-active .ms-sheet {
  animation: ms-up 220ms var(--ease-in) reverse both;
}

@keyframes ms-fade {
  from {
    opacity: 0;
  }
}
@keyframes ms-up {
  from {
    transform: translateY(100%);
  }
}
@keyframes ms-scan {
  from {
    opacity: 1;
    transform: scaleX(0);
  }
  60% {
    opacity: 1;
    transform: scaleX(1);
  }
}
@keyframes ms-row {
  from {
    opacity: 0;
    transform: translateX(-12px);
    clip-path: inset(0 100% 0 0);
  }
}
</style>
