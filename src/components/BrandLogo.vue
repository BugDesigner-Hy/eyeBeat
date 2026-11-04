<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'
import RobotEyes from './RobotEyes.vue'

const emit = defineEmits<{ clear: [] }>()

const player = usePlayerStore()
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

/** 播放中把频谱喂给眼睛，做轻微律动；减弱动效则不传 */
const analyser = computed(() =>
  !reduceMotion && player.isPlaying ? player.analyser : null,
)
</script>

<template>
  <a
    class="brand"
    href="/"
    data-eyes-host
    title="EyeBeat"
    aria-label="EyeBeat"
    @click.prevent="emit('clear')"
  >
    <RobotEyes :on="true" :analyser="analyser" :scale="2.5" />
    <span class="brand-text">EYE<span>/</span>BEAT</span>
  </a>
</template>

<style scoped>
.brand {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.brand:hover .brand-text,
.brand:focus-visible .brand-text {
  color: var(--accent);
}

.brand:focus-visible {
  outline: 1px dashed var(--accent);
  outline-offset: 4px;
}

.brand :deep(.robot-eyes) {
  color: var(--accent);
  flex-shrink: 0;
}

.brand-text {
  font-family: var(--font-pixel);
  font-size: 16px;
  letter-spacing: 0.06em;
  line-height: 1;
  transition: color 120ms steps(2);
}

.brand-text span {
  color: var(--accent);
}

@media (max-width: 640px) {
  .brand {
    gap: 6px;
  }
  .brand-text {
    font-size: 12px;
  }
}
</style>
