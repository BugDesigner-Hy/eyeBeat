<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ text: string }>()

type Phase = 'on' | 'dying' | 'igniting'

interface Glyph {
  c: string
  delay: string
  phase: Phase
}

const glyphs = ref<Glyph[]>([])
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
let run = 0
const timers: number[] = []

function clearTimers() {
  while (timers.length) window.clearTimeout(timers.pop())
}

function wait(ms: number, id: number) {
  return new Promise<void>((resolve) => {
    timers.push(
      window.setTimeout(() => {
        if (id === run) resolve()
      }, ms),
    )
  })
}

function asOn(text: string): Glyph[] {
  return [...text].map((c) => ({ c, delay: '0ms', phase: 'on' as const }))
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

watch(
  () => props.text,
  async (next, prev) => {
    clearTimers()
    const id = ++run

    if (reduceMotion || prev == null || prev === next) {
      glyphs.value = asOn(next)
      return
    }

    // 原标题：各字随机延迟后霓虹闪烁熄灭
    glyphs.value = [...prev].map((c) => ({
      c,
      delay: `${rand(0, 320).toFixed(0)}ms`,
      phase: 'dying' as const,
    }))
    await wait(520, id)
    if (id !== run) return

    // 目标标题：先全暗，再随机点亮（带闪烁）
    glyphs.value = [...next].map((c) => ({
      c,
      delay: `${rand(40, 480).toFixed(0)}ms`,
      phase: 'igniting' as const,
    }))
    await wait(720, id)
    if (id !== run) return

    glyphs.value = asOn(next)
  },
  { immediate: true },
)

onBeforeUnmount(clearTimers)
</script>

<template>
  <span class="neon">
    <span
      v-for="(g, i) in glyphs"
      :key="`${i}-${g.phase}-${g.c}`"
      class="neon-ch"
      :class="g.phase"
      :style="{ '--d': g.delay }"
      >{{ g.c === ' ' ? '\u00a0' : g.c }}</span
    >
  </span>
</template>

<style scoped>
.neon {
  display: inline;
}

.neon-ch {
  display: inline-block;
  color: var(--text);
  text-shadow:
    0 0 6px color-mix(in srgb, var(--accent) 45%, transparent),
    0 0 14px color-mix(in srgb, var(--accent) 22%, transparent);
  will-change: opacity, color, text-shadow;
}

.neon-ch.dying {
  animation: neon-die 360ms steps(5) var(--d) both;
}

.neon-ch.igniting {
  animation: neon-ignite 420ms steps(6) var(--d) both;
}

@keyframes neon-die {
  0% {
    opacity: 1;
    color: var(--text);
    text-shadow:
      0 0 6px color-mix(in srgb, var(--accent) 45%, transparent),
      0 0 14px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  12% {
    opacity: 1;
    color: #fff;
    text-shadow:
      0 0 4px #fff,
      0 0 12px var(--accent),
      0 0 28px var(--accent);
  }
  28% {
    opacity: 0.15;
    color: var(--accent);
    text-shadow: 0 0 2px var(--accent);
  }
  42% {
    opacity: 0.95;
    color: #fff;
    text-shadow:
      0 0 8px var(--accent),
      0 0 18px var(--accent);
  }
  58% {
    opacity: 0.08;
    color: color-mix(in srgb, var(--accent) 40%, transparent);
    text-shadow: none;
  }
  72% {
    opacity: 0.55;
    color: var(--accent);
    text-shadow: 0 0 6px var(--accent);
  }
  100% {
    opacity: 0;
    color: transparent;
    text-shadow: none;
  }
}

@keyframes neon-ignite {
  0% {
    opacity: 0;
    color: transparent;
    text-shadow: none;
  }
  14% {
    opacity: 1;
    color: #fff;
    text-shadow:
      0 0 4px #fff,
      0 0 16px var(--accent),
      0 0 32px var(--accent);
  }
  28% {
    opacity: 0.12;
    color: var(--accent);
    text-shadow: none;
  }
  42% {
    opacity: 1;
    color: #fff;
    text-shadow:
      0 0 6px var(--accent),
      0 0 20px var(--accent);
  }
  58% {
    opacity: 0.25;
    color: var(--accent);
    text-shadow: 0 0 4px var(--accent);
  }
  78% {
    opacity: 1;
    color: var(--text);
    text-shadow:
      0 0 8px color-mix(in srgb, var(--accent) 55%, transparent),
      0 0 18px color-mix(in srgb, var(--accent) 28%, transparent);
  }
  100% {
    opacity: 1;
    color: var(--text);
    text-shadow:
      0 0 6px color-mix(in srgb, var(--accent) 45%, transparent),
      0 0 14px color-mix(in srgb, var(--accent) 22%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .neon-ch {
    text-shadow: none;
    animation: none !important;
    opacity: 1 !important;
    color: var(--text) !important;
  }
}
</style>
