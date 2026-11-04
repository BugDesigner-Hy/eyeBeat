<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { provider } from '../api'
import { markCoverFailed, usableCovers } from '../utils/cover'
import CoverFallback from './CoverFallback.vue'

const props = defineProps<{
  /** 候选地址，加载失败时依次尝试 */
  sources: string[]
}>()

/** 带 CORS 的封面才能被 Service Worker 缓存（opaque 响应会占用巨大配额） */
const crossOrigin = provider.coverCors ? 'anonymous' : undefined

const loaded = ref(false)
const candidates = ref(usableCovers(props.sources))
const sourceIndex = ref(0)
const src = computed(() => candidates.value[sourceIndex.value])

function onError() {
  if (src.value) markCoverFailed(src.value)
  sourceIndex.value++
}

watch(
  () => props.sources.join('|'),
  () => {
    loaded.value = false
    candidates.value = usableCovers(props.sources)
    sourceIndex.value = 0
  },
)
</script>

<template>
  <div class="ci" :class="{ loaded }">
    <CoverFallback v-if="!src" />
    <img
      v-else
      :src="src"
      :crossorigin="crossOrigin"
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
      @load="loaded = true"
      @error="onError"
    />
  </div>
</template>

<style scoped>
.ci {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(circle, rgba(255, 255, 255, 0.07) 1px, transparent 1.5px) 0 0 / 8px 8px,
    var(--bg-2);
}

.ci img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  opacity: 0;
  transition: opacity 240ms ease;
}

.ci.loaded img {
  opacity: 1;
}
</style>
