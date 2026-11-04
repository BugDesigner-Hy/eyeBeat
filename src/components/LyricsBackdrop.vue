<script setup lang="ts">
import { computed } from 'vue'
import type { LyricWord } from '../api/types'
import { useLyricsStore } from '../stores/lyrics'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'

const player = usePlayerStore()
const lyrics = useLyricsStore()
const settings = useSettingsStore()

/** 逐字填充按 1/8 量化，和歌词面板保持一致的像素扫描感 */
const WORD_STEPS = 8

const at = (i: number) => (i >= 0 ? (lyrics.lines[i] ?? null) : null)
const line = computed(() => at(lyrics.activeLine))
const prevLine = computed(() => at(lyrics.activeLine - 1))
const nextLine = computed(() => at(lyrics.activeLine + 1))

const counter = computed(() => {
  const total = lyrics.lines.length
  const pad = String(total).length
  return `${String(lyrics.activeLine + 1).padStart(pad, '0')}/${total}`
})

function wordProgress(w: LyricWord): number {
  const p = (lyrics.time - w.time) / Math.max(w.duration, 0.05)
  return Math.round(Math.min(1, Math.max(0, p)) * WORD_STEPS) / WORD_STEPS
}
</script>

<template>
  <div class="backdrop" :class="{ 'is-pixel': settings.pixelLyrics }" aria-hidden="true">
    <span class="bd-tag">// AMBIENT · {{ player.current?.title }}</span>
    <Transition name="glitch" mode="out-in">
      <div v-if="line" :key="lyrics.activeLine" class="bd-stack">
        <p class="bd-side">{{ prevLine?.text }}</p>
        <p class="bd-line">
          <template v-if="line.words?.length">
            <span v-for="(w, j) in line.words" :key="j" class="w" :style="{ '--p': wordProgress(w) }">{{
              w.text
            }}</span>
          </template>
          <template v-else>{{ line.text }}</template>
        </p>
        <p v-if="line.translation" class="bd-trans">{{ line.translation }}</p>
        <p class="bd-side">{{ nextLine?.text }}</p>
      </div>
    </Transition>
    <span v-if="line" class="bd-counter">LRC {{ counter }}</span>
  </div>
</template>

<style scoped>
.backdrop {
  /* 退场用两头缓：ease-in 开头太慢，鼠标动了之后像没反应 */
  --ease-exit: cubic-bezier(0.33, 0, 0.67, 1);
  position: fixed;
  inset: 0 0 var(--dock-h);
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 0 8vw;
  pointer-events: none;
}

.bd-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  max-width: min(1200px, 100%);
  text-align: center;
}

.bd-line {
  margin: 0;
  font-family: var(--font-sans);
  font-size: clamp(32px, 5.6vw, 96px);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0.02em;
  color: var(--accent);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 45%, transparent));
  /* 横向扫描线纹理，代替像素字体带来的“屏幕感”，同时不影响中文字形 */
  mask-image: repeating-linear-gradient(0deg, #000 0 3px, rgba(0, 0, 0, 0.6) 3px 4px);
}

.bd-line .w {
  background: linear-gradient(
    90deg,
    var(--accent) calc(var(--p) * 100%),
    color-mix(in srgb, var(--accent) 28%, transparent) 0
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.bd-trans {
  margin: -6px 0 0;
  font-size: clamp(16px, 1.6vw, 24px);
  color: color-mix(in srgb, var(--accent) 70%, var(--text));
}

.bd-side {
  min-height: 1.3em;
  margin: 0;
  font-size: clamp(16px, 1.8vw, 28px);
  font-weight: 600;
  color: var(--text-dim);
  opacity: 0.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.bd-tag,
.bd-counter {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--accent);
  opacity: 0.5;
}

.bd-tag {
  left: 40px;
  bottom: 20px;
  max-width: calc(100% - 240px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bd-counter {
  right: 40px;
  bottom: 20px;
}

.backdrop.is-pixel .bd-line {
  font-family: var(--font-pixel-mix);
  font-size: clamp(36px, 6vw, 72px);
  font-weight: 400;
  letter-spacing: 0.06em;
  image-rendering: pixelated;
  /* 像素字本身已有块面感，关掉扫描线遮罩以免糊边 */
  mask-image: none;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--accent) 35%, transparent));
}

.backdrop.is-pixel .bd-trans,
.backdrop.is-pixel .bd-side {
  font-family: var(--font-pixel-mix);
  font-size: clamp(12px, 1.8vw, 24px);
  font-weight: 400;
  letter-spacing: 0.04em;
}

.backdrop.is-pixel .bd-tag,
.backdrop.is-pixel .bd-counter {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
}

/*
 * 进入：一道扫描光自下而上显影。
 * 退出：外圈先散（标签、上下句、翻译），当前句最后消失；总长要和 App.vue 里 Transition 的 leave 时长一致
 */
.ambient-enter-active {
  animation: ambient-in 900ms var(--ease-out) both;
}

.ambient-leave-active :is(.bd-tag, .bd-counter) {
  animation: ambient-out 300ms var(--ease-exit) both;
}

.ambient-leave-active .bd-side {
  animation: ambient-out 320ms 80ms var(--ease-exit) both;
}

.ambient-leave-active .bd-trans {
  animation: ambient-out 340ms 160ms var(--ease-exit) both;
}

.ambient-leave-active .bd-line {
  animation: ambient-out-line 460ms 220ms var(--ease-exit) both;
}

@keyframes ambient-in {
  from {
    opacity: 0;
    clip-path: inset(100% 0 0 0);
    transform: scale(0.97);
  }
  60% {
    opacity: 1;
  }
  to {
    clip-path: inset(0);
    transform: none;
  }
}

@keyframes ambient-out {
  to {
    opacity: 0;
    transform: translateY(-10px);
    filter: blur(6px);
  }
}

/* 保留原有的辉光再叠模糊，滤镜列表前缀一致才能平滑插值 */
@keyframes ambient-out-line {
  to {
    opacity: 0;
    transform: translateY(-14px) scale(1.02);
    filter: drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 45%, transparent)) blur(8px);
  }
}

.glitch-enter-active {
  animation: glitch-in 280ms steps(5);
}

.glitch-leave-active {
  animation: glitch-in 160ms steps(3) reverse;
}

@keyframes glitch-in {
  0% {
    clip-path: inset(0 100% 0 0);
    transform: translateX(-12px);
  }
  40% {
    clip-path: inset(30% 20% 40% 0);
    transform: translateX(8px);
  }
  70% {
    clip-path: inset(0 0 60% 0);
    transform: translateX(-4px);
  }
  100% {
    clip-path: inset(0);
    transform: none;
  }
}
</style>
