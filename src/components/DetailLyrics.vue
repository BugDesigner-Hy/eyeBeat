<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMobile } from '../composables/useMobile'
import { useWide } from '../composables/useWide'
import { useCommentsStore } from '../stores/comments'
import { useLyricsStore } from '../stores/lyrics'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'

const lyrics = useLyricsStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const comments = useCommentsStore()
const mobile = useMobile()
const wide = useWide()
const box = ref<HTMLElement>()
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
let alignTimer = 0

/** 底部面板收起，且侧栏评论未占位时，歌词区更宽敞，字号可放大 */
const roomy = computed(
  () =>
    !mobile.value &&
    settings.detailLowerCollapsed &&
    (!wide.value || !comments.present || settings.detailCmtCollapsed),
)

/** 左侧封面也收起：歌词几乎全宽，再抬一档字号 */
const expansive = computed(() => roomy.value && settings.detailCoverCollapsed)

/** 左侧收起后歌词居中，避免大片空白偏在一侧 */
const centered = computed(() => !mobile.value && settings.detailCoverCollapsed)

function center(smooth: boolean) {
  const b = box.value
  const el = b?.querySelector<HTMLElement>(`[data-i="${lyrics.activeLine}"]`)
  if (!b || !el) return
  b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.offsetHeight / 2, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' })
}

/**
 * text-align / margin:auto 无法插值；写成像素 margin-left，才能和左栏折叠一起缓动滑到中间。
 */
function layoutAlign(animate: boolean) {
  const b = box.value
  if (!b) return
  const pw = b.clientWidth
  const ms = animate && !reduceMotion ? '520ms' : '0ms'
  for (const el of b.querySelectorAll<HTMLElement>('.dl-line, .dl-state')) {
    el.style.transition = [
      `margin-left ${ms} cubic-bezier(0.16, 1, 0.3, 1)`,
      'font-size 520ms cubic-bezier(0.16, 1, 0.3, 1)',
      'padding 520ms cubic-bezier(0.16, 1, 0.3, 1)',
      'line-height 520ms cubic-bezier(0.16, 1, 0.3, 1)',
      'max-width 520ms cubic-bezier(0.16, 1, 0.3, 1)',
      'transform-origin 520ms cubic-bezier(0.16, 1, 0.3, 1)',
    ].join(',')
    // offsetWidth 不含 margin，可直接量；目标写成 px 才能插值（margin:auto 不行）
    const w = el.offsetWidth
    el.style.marginLeft = centered.value ? `${Math.max(0, (pw - w) / 2)}px` : '0px'
  }
}

function relayout(animate: boolean) {
  layoutAlign(animate)
  center(false)
  window.clearTimeout(alignTimer)
  // 字号缓动结束后按最终宽度再校正一次居中
  if (animate && !reduceMotion) {
    alignTimer = window.setTimeout(() => layoutAlign(false), 540)
  }
}

watch(
  () => lyrics.activeLine,
  () => nextTick(() => center(true)),
)
watch(
  () => lyrics.lyrics,
  () => nextTick(() => relayout(false)),
)
watch([roomy, expansive, centered, () => settings.pixelLyrics], () => nextTick(() => relayout(true)))
// 桌面详情页面板折叠/展开、窗口缩放时歌词框尺寸会变，当前句要跟着留在中间；
// 手机端地址栏伸缩也会改尺寸，跟着跳会打断手动翻看
const ro = new ResizeObserver(() => {
  if (!mobile.value) relayout(false)
})
onMounted(() => {
  relayout(false)
  if (box.value) ro.observe(box.value)
})
onBeforeUnmount(() => {
  ro.disconnect()
  window.clearTimeout(alignTimer)
})

function seekTo(time: number) {
  if (time < 0) return
  player.seek(time - player.streamOffset - settings.lyricOffset - lyrics.trackOffset)
}
</script>

<template>
  <!-- 手机 play↔歌词跟手需要从歌词区起势；桌面保留 data-no-drag 以免拖歌词误关详情 -->
  <section
    class="dl np-in"
    :class="{
      'is-pixel': settings.pixelLyrics,
      'is-roomy': roomy,
      'is-expansive': expansive,
      'is-centered': centered,
    }"
    style="--i: 2"
    :data-no-drag="mobile ? undefined : true"
  >
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
          <span class="dl-line-body">
            {{ line.text }}
            <small v-if="line.translation">{{ line.translation }}</small>
          </span>
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
  transition: padding 520ms cubic-bezier(0.16, 1, 0.3, 1);
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
  display: block;
  width: fit-content;
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
  transform-origin: left center;
  animation: np-in 360ms var(--ease-out) backwards;
  animation-delay: calc(420ms + var(--k) * 40ms);
}

.dl-line-body {
  display: inline-block;
  max-width: 100%;
  transform-origin: inherit;
  transition: transform 240ms var(--ease-out);
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
}

.dl-line.active .dl-line-body {
  transform: scale(1.06);
}

.dl-line small {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 400;
  transition: font-size 520ms cubic-bezier(0.16, 1, 0.3, 1);
}

.dl-state {
  display: block;
  width: fit-content;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--text-dim);
}

@media (prefers-reduced-motion: reduce) {
  .dl-line {
    animation: none;
  }
  .dl-head,
  .dl-line small {
    transition: none;
  }
}

.dl.is-pixel .dl-line {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: 0.04em;
  image-rendering: pixelated;
  max-width: calc(100% / 1.04);
}

.dl.is-pixel .dl-line.active .dl-line-body {
  transform: scale(1.04);
}

.dl.is-pixel .dl-line small {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
}

.dl.is-pixel .dl-state {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
}

/* 侧栏 + 底部都收起：普通 / 像素字号各抬一档 */
.dl.is-roomy .dl-line {
  font-size: 24px;
  padding: 10px 0;
  max-width: calc(100% / 1.08);
}

.dl.is-roomy .dl-line.active .dl-line-body {
  transform: scale(1.08);
}

.dl.is-roomy .dl-line small {
  font-size: 15px;
}

.dl.is-roomy.is-pixel .dl-line {
  font-size: 24px;
  line-height: 28px;
  max-width: calc(100% / 1.06);
}

.dl.is-roomy.is-pixel .dl-line.active .dl-line-body {
  transform: scale(1.06);
}

.dl.is-roomy.is-pixel .dl-line small {
  font-size: 12px;
  line-height: 16px;
}

.dl.is-roomy.is-pixel .dl-state {
  font-size: 24px;
  line-height: 28px;
}

/* 封面也收起：接近全幅歌词 */
.dl.is-expansive .dl-line {
  font-size: 32px;
  padding: 12px 0;
  max-width: calc(100% / 1.1);
}

.dl.is-expansive .dl-line.active .dl-line-body {
  transform: scale(1.1);
}

.dl.is-expansive .dl-line small {
  font-size: 18px;
}

.dl.is-expansive.is-pixel .dl-line {
  font-size: 36px;
  line-height: 40px;
  max-width: calc(100% / 1.08);
}

.dl.is-expansive.is-pixel .dl-line.active .dl-line-body {
  transform: scale(1.08);
}

.dl.is-expansive.is-pixel .dl-line small {
  font-size: 24px;
  line-height: 28px;
}

.dl.is-expansive.is-pixel .dl-state {
  font-size: 36px;
  line-height: 40px;
}

.dl.is-centered .dl-head {
  justify-content: center;
}

.dl.is-centered .dl-line,
.dl.is-centered .dl-state {
  text-align: center;
  transform-origin: center;
}

.dl.is-centered .dl-line small {
  text-align: center;
}
</style>
