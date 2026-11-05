<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PixelIcon from './PixelIcon.vue'
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const scrolled = ref(false)

let raf = 0

function threshold() {
  return Math.max(320, window.innerHeight * 0.6)
}

function measure() {
  raf = 0
  scrolled.value = window.scrollY > threshold()
}

function schedule() {
  if (raf) return
  raf = requestAnimationFrame(measure)
}

function goTop() {
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
}

const visible = computed(
  () =>
    scrolled.value &&
    !ui.detailOpen &&
    !ui.poweredOff &&
    !ui.paletteOpen,
)

onMounted(() => {
  measure()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
})
</script>

<template>
  <Transition name="stf">
    <button
      v-if="visible"
      type="button"
      class="stf"
      title="回到顶部"
      aria-label="回到顶部"
      @click="goTop"
    >
      <PixelIcon name="chevron-up" :scale="3" />
      <span class="stf-label">TOP</span>
    </button>
  </Transition>
</template>

<style scoped>
.stf {
  /* 避开播放栏右上角收起箭头（.bar-tab：right 24px · 宽 40px · 上探 30px） */
  position: fixed;
  right: max(76px, calc(env(safe-area-inset-right) + 60px));
  bottom: calc(var(--dock-h) + 16px);
  z-index: 55;
  display: grid;
  place-items: center;
  gap: 2px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, #0a0c0f 88%, var(--accent));
  color: var(--accent);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  font-family: var(--font-pixel-mix);
  image-rendering: pixelated;
  transition:
    border-color 120ms steps(2),
    background 120ms steps(2),
    color 120ms steps(2);
}

.stf:hover,
.stf:focus-visible {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
  outline: none;
}

.stf:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 3px;
}

.stf-label {
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1;
}

.stf-enter-active,
.stf-leave-active {
  transition: opacity 160ms steps(3), translate 160ms steps(3);
}

.stf-enter-from,
.stf-leave-to {
  opacity: 0;
  translate: 0 8px;
}

@media (prefers-reduced-motion: reduce) {
  .stf-enter-active,
  .stf-leave-active {
    transition: none;
  }
}

/* 手机没有播放栏收起箭头，置顶贴右 */
@media (max-width: 640px) {
  .stf {
    right: max(16px, env(safe-area-inset-right));
  }
}
</style>
