<script setup lang="ts">
import { computed } from 'vue'
import { useLyricsStore } from '../stores/lyrics'
import { usePlayerStore } from '../stores/player'

const player = usePlayerStore()
const lyrics = useLyricsStore()

const line = computed(() => {
  const i = lyrics.activeLine
  return i >= 0 ? lyrics.lines[i] : null
})
const counter = computed(() => {
  const total = lyrics.lines.length
  const pad = String(total).length
  return `${String(lyrics.activeLine + 1).padStart(pad, '0')}/${total}`
})
</script>

<template>
  <div class="backdrop" :class="{ paused: !player.isPlaying }" aria-hidden="true">
    <Transition name="glitch" mode="out-in">
      <p v-if="line" :key="lyrics.activeLine" class="bd-line">{{ line.text }}</p>
    </Transition>
    <span v-if="line" class="bd-counter">LRC {{ counter }}</span>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 0 6vw;
  pointer-events: none;
  mix-blend-mode: screen;
  transition: opacity 400ms steps(4);
}

.backdrop.paused {
  opacity: 0.4;
}

.bd-line {
  margin: 0;
  max-width: 100%;
  font-family: var(--font-pixel), var(--font-sans);
  font-size: clamp(48px, 8.5vw, 160px);
  font-weight: 700;
  line-height: 1.05;
  text-align: center;
  text-transform: uppercase;
  color: var(--accent);
  opacity: 0.09;
  overflow-wrap: anywhere;
  -webkit-font-smoothing: none;
}

.bd-counter {
  position: absolute;
  right: 40px;
  bottom: calc(var(--dock-h) + 20px);
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--accent);
  opacity: 0.35;
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
