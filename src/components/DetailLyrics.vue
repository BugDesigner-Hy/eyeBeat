<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMobile } from '../composables/useMobile'
import { useLyricsStore } from '../stores/lyrics'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'

const lyrics = useLyricsStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const mobile = useMobile()
const box = ref<HTMLElement>()
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function center(smooth: boolean) {
  const b = box.value
  const el = b?.querySelector<HTMLElement>(`[data-i="${lyrics.activeLine}"]`)
  if (!b || !el) return
  b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.offsetHeight / 2, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' })
}

watch(
  () => lyrics.activeLine,
  () => nextTick(() => center(true)),
)
watch(
  () => lyrics.lyrics,
  () => nextTick(() => center(false)),
)
// 桌面详情页面板折叠/展开、窗口缩放时歌词框尺寸会变，当前句要跟着留在中间；
// 手机端地址栏伸缩也会改尺寸，跟着跳会打断手动翻看
const ro = new ResizeObserver(() => {
  if (!mobile.value) center(false)
})
onMounted(() => {
  center(false)
  if (box.value) ro.observe(box.value)
})
onBeforeUnmount(() => ro.disconnect())

function seekTo(time: number) {
  if (time < 0) return
  player.seek(time - player.streamOffset - settings.lyricOffset - lyrics.trackOffset)
}
</script>

<template>
  <!-- 手机 play↔歌词跟手需要从歌词区起势；桌面保留 data-no-drag 以免拖歌词误关详情 -->
  <section class="dl np-in" style="--i: 2" :data-no-drag="mobile ? undefined : true">
    <div class="dl-head">
      <p class="np-label">// LYRICS</p>
      <slot name="head" />
    </div>
    <div ref="box" class="dl-box">
      <p v-if="lyrics.loading" class="dl-state">SCANNING<i class="dots" /></p>
      <p v-else-if="!lyrics.lines.length" class="dl-state">NO LYRICS</p>
      <template v-else>
        <p
          v-for="(line, i) in lyrics.lines"
          :key="i"
          :data-i="i"
          class="dl-line"
          :class="{ active: i === lyrics.activeLine, past: i < lyrics.activeLine, static: !lyrics.lyrics?.synced }"
          :style="{ '--k': Math.min(8, Math.abs(i - Math.max(0, lyrics.activeLine))) }"
          @click="seekTo(line.time)"
        >
          {{ line.text }}
          <small v-if="line.translation">{{ line.translation }}</small>
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.dl {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  min-width: 0;
}

.dl-head .np-label {
  margin-bottom: 12px;
}

.dl-head :deep(.txt-btn) {
  flex: none;
  margin-bottom: 12px;
}

.dl-box {
  position: relative;
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  scrollbar-width: none;
  mask-image: linear-gradient(transparent, #000 22%, #000 78%, transparent);
}

.dl-box::before,
.dl-box::after {
  content: '';
  display: block;
  height: 45%;
}

.dl-box::-webkit-scrollbar {
  display: none;
}

.dl-line {
  margin: 0;
  padding: 7px 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  /* 当前句放大 1.06 后仍留在框内 */
  max-width: calc(100% / 1.06);
  overflow-wrap: anywhere;
  color: var(--text-dim);
  opacity: calc(1 - var(--k) * 0.1);
  cursor: pointer;
  transition:
    color 240ms var(--ease-out),
    transform 240ms var(--ease-out);
  transform-origin: left center;
  animation: np-in 360ms var(--ease-out) backwards;
  animation-delay: calc(420ms + var(--k) * 40ms);
}

.dl-line:hover {
  color: var(--text);
}

.dl-line.static {
  cursor: default;
}

.dl-line.active {
  color: var(--accent);
  opacity: 1;
  transform: scale(1.06);
}

.dl-line small {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 400;
}

.dl-state {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--text-dim);
}

@media (prefers-reduced-motion: reduce) {
  .dl-line {
    animation: none;
  }
}
</style>
