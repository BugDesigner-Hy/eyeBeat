<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { provider } from '../api'
import { useMobile } from '../composables/useMobile'
import { useWide } from '../composables/useWide'
import { useCommentsStore } from '../stores/comments'
import { useLyricsStore } from '../stores/lyrics'
import { MODE_LABEL, MODE_TITLE, usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { coverSources, markCoverFailed, usableCovers } from '../utils/cover'
import { fmtNum } from '../utils/num'
import { fmtTime } from '../utils/time'
import CoverFallback from './CoverFallback.vue'
import CoverImage from './CoverImage.vue'
import DetailComments from './DetailComments.vue'
import DetailInfo from './DetailInfo.vue'
import DetailLyrics from './DetailLyrics.vue'
import DetailTelemetry from './DetailTelemetry.vue'
import PixelIcon from './PixelIcon.vue'
import RobotEyes from './RobotEyes.vue'
import SegmentBar from './SegmentBar.vue'
import UpNext from './UpNext.vue'

const player = usePlayerStore()
const ui = useUiStore()
const mobile = useMobile()
const lyrics = useLyricsStore()
const comments = useCommentsStore()
const wide = useWide()
const drawerOpen = computed(() => !mobile.value && !wide.value && ui.commentsOpen && comments.present)
watch([() => player.current, wide, mobile], () => ui.toggleComments(false))

const PAGES = ['PLAY', 'LRC', 'INFO'] as const
/** 连续的页位置 0–2，驱动页码下划线跟手移动 */
const pos = ref(0)
const page = computed(() => Math.round(pos.value))
/** 进入过的页才播放信息块的组装动画 */
const seen = ref<number[]>([0])
let posRaf = 0
/** 关闭后立刻重开时，离场中的旧分页容器仍在 DOM 里，只认当前这一个 */
let activePager: HTMLElement | null = null
let activeRoot: Element | null = null

/** 打开状态下跨越断点（例如旋转手机）时分页容器会重建，要重新认领 */
watch(mobile, () =>
  nextTick(() => {
    if (!activeRoot) return
    cancelAnimationFrame(posRaf)
    posRaf = 0
    activePager = activeRoot.querySelector<HTMLElement>('.np-pager')
    pos.value = 0
    seen.value = [0]
  }),
)

function onPagerScroll(e: Event) {
  const el = e.currentTarget as HTMLElement
  if (el !== activePager || posRaf) return
  posRaf = requestAnimationFrame(() => {
    posRaf = 0
    if (!el.clientWidth) return
    pos.value = el.scrollLeft / el.clientWidth
    if (!seen.value.includes(page.value)) seen.value = [...seen.value, page.value]
  })
}

function goPage(i: number) {
  const el = activePager
  el?.scrollTo({ left: i * el.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' })
}

const progress = computed(() => (player.duration ? player.currentTime / player.duration : 0))
const currentLine = computed(() =>
  lyrics.lyrics?.synced ? (lyrics.lines[lyrics.activeLine]?.text ?? '') : '',
)

const DRAG_CLOSE = 120
const DRAG_SLOP = 6

const crossOrigin = provider.coverCors ? 'anonymous' : undefined

/**
 * 飞行替身和播放栏缩略图用同一组候选地址，每次起飞前重新筛掉缩略图已试过失败的，
 * 否则替身要先等一次加载失败才换成占位，起飞那一下是空的
 */
const ghostCandidates = ref<string[]>([])
const ghostIndex = ref(0)
const ghostSrc = computed(() => ghostCandidates.value[ghostIndex.value])

function resetGhost() {
  const t = player.current
  ghostCandidates.value = t ? usableCovers(coverSources(t.cover, 'small')) : []
  ghostIndex.value = 0
}
watch(() => player.current, resetGhost, { immediate: true })
watch(
  () => ui.detailOpen,
  (open) => {
    if (open) resetGhost()
  },
)

function onGhostError() {
  if (ghostSrc.value) markCoverFailed(ghostSrc.value)
  ghostIndex.value++
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const dragY = ref(0)
const dragging = ref(false)
let drag: { id: number; y: number } | null = null

function onDragStart(e: PointerEvent) {
  const t = e.target as HTMLElement
  if (e.button !== 0 || t.closest('button, a, input, [role="slider"], [data-no-drag]')) return
  // 手机端歌词页和信息页的纵向手势用于滚动
  if (mobile.value && !t.closest('.np-head, [data-page="play"]')) return
  const content = (e.currentTarget as HTMLElement).querySelector('.np-content')
  if (content && content.scrollTop > 0) return
  drag = { id: e.pointerId, y: e.clientY }
}

function onDragMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const dy = e.clientY - drag.y
  if (!dragging.value) {
    if (dy < -DRAG_SLOP) drag = null
    if (dy < DRAG_SLOP) return
    dragging.value = true
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
  }
  dragY.value = Math.max(0, dy)
}

function onDragEnd() {
  if (!drag) return
  const close = dragging.value && dragY.value > DRAG_CLOSE
  drag = null
  dragging.value = false
  if (close) ui.toggleDetail(false)
  else dragY.value = 0
}

const shellStyle = computed(() =>
  dragY.value ? { translate: `0 ${dragY.value}px`, opacity: String(1 - Math.min(dragY.value / 600, 0.5)) } : undefined,
)

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const EASE_IN = 'cubic-bezier(0.7, 0, 0.84, 0)'
const FLY_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const FLY_BACK = 'cubic-bezier(0.6, 0, 0.8, 0.2)'
/** 飞行途中依次提高马赛克分辨率：[边长, 开始时刻 ms] */
const MOSAIC_STEPS: [number, number][] = [
  [6, 0],
  [12, 180],
  [24, 340],
]
/** 大图迟迟不到时不再等，直接撤掉替身 */
const LAND_WAIT = 400

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const allDone = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished.catch(() => undefined)))

function parts(el: Element) {
  const q = <T extends Element>(s: string) => el.querySelector(s) as T
  return {
    shell: q<HTMLElement>('.np-shell'),
    content: q<HTMLElement>('.np-content'),
    cover: q<HTMLElement>('.np-cover'),
    scan: q<HTMLElement>('.np-scan'),
    ghost: q<HTMLElement>('.np-ghost'),
    mosaic: q<HTMLCanvasElement>('.np-mosaic'),
  }
}

/** 播放栏收起时缩略图不可见；手机端不在第 1 页时大封面不在视口内，都不做飞行 */
function thumbRect(): DOMRect | null {
  if (mobile.value ? page.value !== 0 : ui.barCollapsed) return null
  const r = document.querySelector('[data-np-thumb]')?.getBoundingClientRect()
  return r && r.width > 0 ? r : null
}

function placeGhost(ghost: HTMLElement, at: DOMRect) {
  Object.assign(ghost.style, {
    left: `${at.left}px`,
    top: `${at.top}px`,
    width: `${at.width}px`,
    height: `${at.height}px`,
    visibility: 'visible',
  })
}

const flipFrom = (from: DOMRect, to: DOMRect) =>
  `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`

/** 每次 enter/leave 自增；迟到的回调发现代数已变就不再碰 ui 和共享元素 */
let generation = 0

async function runMosaic(canvas: HTMLCanvasElement, src: string, gen: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = new Image()
  img.src = src
  try {
    await img.decode()
  } catch {
    return
  }
  if (gen !== generation) return
  canvas.style.opacity = '1'
  for (const [size, at] of MOSAIC_STEPS) {
    setTimeout(() => {
      if (gen !== generation) return
      canvas.width = size
      canvas.height = size
      ctx.drawImage(img, 0, 0, size, size)
    }, at)
  }
  canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 480, fill: 'forwards' })
}

/** 淡入不保留终态，否则会一直压住拖拽时的内联 opacity */
function fade(el: HTMLElement, from: number, to: number, fill: FillMode) {
  return el.animate([{ opacity: from }, { opacity: to }], { duration: 200, fill })
}

function onEnter(el: Element, done: () => void) {
  const gen = ++generation
  const p = parts(el)
  dragY.value = 0
  const start = mobile.value ? ui.detailPage : 0
  pos.value = start
  seen.value = [start]
  cancelAnimationFrame(posRaf)
  posRaf = 0
  activeRoot = el
  activePager = el.querySelector<HTMLElement>('.np-pager')
  if (activePager) activePager.scrollLeft = start * activePager.clientWidth
  ui.coverLifted = true
  if (reduceMotion) {
    void allDone([fade(p.shell, 0, 1, 'none')]).then(done)
    return
  }
  const h = p.shell.getBoundingClientRect().height
  const anims: Animation[] = [
    p.shell.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0)' }], { duration: 520, easing: EASE_OUT }),
    p.scan.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 1, offset: 0.85 },
        { opacity: 0, transform: `translateY(${-h}px)` },
      ],
      { duration: 520, easing: EASE_OUT },
    ),
  ]
  const to = p.cover.getBoundingClientRect()
  const from = thumbRect()
  if (from) {
    placeGhost(p.ghost, to)
    p.cover.style.opacity = '0'
    if (ghostSrc.value) void runMosaic(p.mosaic, ghostSrc.value, gen)
    const fly = p.ghost.animate([{ transform: flipFrom(from, to) }, { transform: 'none' }], {
      duration: 620,
      easing: FLY_OUT,
    })
    anims.push(fly)
    void fly.finished
      .then(async () => {
        if (gen !== generation) return
        const img = p.cover.querySelector('img')
        await Promise.race([img?.decode().catch(() => undefined), sleep(LAND_WAIT)])
        if (gen !== generation) return
        p.cover.style.opacity = ''
        await p.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).finished
        if (gen !== generation) return
        p.ghost.style.visibility = 'hidden'
      })
      .catch(() => undefined)
  } else {
    anims.push(
      p.cover.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], {
        duration: 420,
        easing: EASE_OUT,
      }),
    )
  }
  void allDone(anims).then(done)
}

function onLeave(el: Element, done: () => void) {
  const gen = ++generation
  const p = parts(el)
  if (activeRoot === el) activeRoot = null
  // 打开飞行中途关闭：从替身当前位置起飞，取消动画前先量
  const ghostAt = getComputedStyle(p.ghost).visibility === 'visible' ? p.ghost.getBoundingClientRect() : null
  // 打开的 WAAPI 动画会与关闭动画抢同一属性；CSS 入场动画保留，否则未显现的块会闪现
  el.getAnimations({ subtree: true }).forEach((a) => {
    if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel()
  })
  p.mosaic.style.opacity = ''
  p.ghost.style.visibility = 'hidden'
  const finish = () => {
    if (gen === generation) ui.coverLifted = false
    done()
  }
  if (reduceMotion) {
    void allDone([fade(p.shell, 1, 0, 'forwards')]).then(finish)
    return
  }
  const to = thumbRect()
  const at = ghostAt ?? p.cover.getBoundingClientRect()
  const anims: Animation[] = [
    p.content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: EASE_IN, fill: 'forwards' }),
    p.shell.animate([{ clipPath: 'inset(0)' }, { clipPath: 'inset(100% 0 0 0)' }], {
      duration: 340,
      delay: 80,
      easing: EASE_IN,
      fill: 'forwards',
    }),
  ]
  if (to) {
    placeGhost(p.ghost, at)
    p.cover.style.opacity = '0'
    anims.push(
      p.ghost.animate([{ transform: 'none' }, { transform: flipFrom(to, at) }], {
        duration: 340,
        delay: 80,
        easing: FLY_BACK,
        fill: 'forwards',
      }),
    )
  } else {
    anims.push(
      p.cover.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.6)' }], {
        duration: 300,
        easing: EASE_IN,
        fill: 'forwards',
      }),
    )
  }
  void allDone(anims).then(finish)
}
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <div v-if="ui.detailOpen && player.current" class="np">
      <section
        class="np-shell"
        :class="{ dragging }"
        :style="shellStyle"
        role="dialog"
        aria-modal="true"
        aria-label="正在播放"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <div class="np-bg" aria-hidden="true">
          <CoverImage :sources="coverSources(player.current.cover, 'medium')" :fallback="false" />
        </div>
        <i class="np-grid" aria-hidden="true" />
        <div class="np-content" :class="{ 'np-m': mobile, 'np-3': wide && comments.present }">
          <header class="np-head np-in" style="--i: 0">
            <button type="button" class="txt-btn" title="关闭（Esc）" @click="ui.toggleDetail(false)">[CLOSE]</button>
            <nav v-if="mobile" class="np-dots" :style="{ '--p': pos }" aria-label="详情分页">
              <button
                v-for="(label, i) in PAGES"
                :key="label"
                type="button"
                class="np-dot"
                :class="{ on: page === i }"
                :aria-current="page === i ? 'page' : undefined"
                @click="goPage(i)"
              >
                {{ String(i + 1).padStart(2, '0') }} {{ label }}
              </button>
              <i class="np-dots-bar" aria-hidden="true" />
            </nav>
            <span v-else class="np-tag">// NOW PLAYING · {{ player.providerName.toUpperCase() }}</span>
            <button
              v-if="!mobile && !wide && comments.present"
              type="button"
              class="txt-btn np-cmt-btn"
              :class="{ on: ui.commentsOpen }"
              :aria-expanded="ui.commentsOpen"
              title="评论（Esc 收回）"
              @click="ui.toggleComments()"
            >
              [CMT{{ comments.total != null ? ` ${fmtNum(comments.total)}` : '' }}]
            </button>
          </header>

          <div v-if="mobile" class="np-pager" @scroll.passive="onPagerScroll">
            <section class="np-page" :class="{ seen: seen.includes(0) }" data-page="play">
              <div class="np-cover">
                <CoverImage :sources="coverSources(player.current.cover, 'large')" />
                <i class="np-corners" aria-hidden="true" />
              </div>
              <DetailInfo :track="player.current" part="head" />
              <div class="np-seek np-in" style="--i: 4">
                <span>{{ fmtTime(player.currentTime) }}</span>
                <SegmentBar
                  label="播放进度"
                  :value="progress"
                  :seg="4"
                  :gap="2"
                  :height="6"
                  @change="(v) => player.seek(v * player.duration)"
                />
                <span>{{ fmtTime(player.duration) }}</span>
              </div>
              <div class="np-ctrl np-in" style="--i: 5">
                <button type="button" class="txt-btn" :title="MODE_TITLE[player.mode]" @click="player.cycleMode()">
                  [{{ MODE_LABEL[player.mode] }}]
                </button>
                <button type="button" class="np-icon" aria-label="上一首" @click="player.prev()">
                  <PixelIcon name="prev" />
                </button>
                <button
                  type="button"
                  class="np-play px-cut"
                  :class="{ on: player.isPlaying }"
                  :aria-label="player.isPlaying ? '暂停' : '播放'"
                  @click="player.toggle()"
                >
                  <RobotEyes :on="player.isPlaying" :analyser="player.analyser" :scale="4" />
                </button>
                <button type="button" class="np-icon" aria-label="下一首" @click="player.next()">
                  <PixelIcon name="next" />
                </button>
                <button type="button" class="txt-btn" title="歌词" @click="goPage(1)">[LRC]</button>
              </div>
              <button v-if="currentLine" type="button" class="np-peek np-in" style="--i: 6" @click="goPage(1)">
                {{ currentLine }}
              </button>
            </section>
            <section class="np-page" :class="{ seen: seen.includes(1) }" data-page="lrc">
              <DetailLyrics />
            </section>
            <section class="np-page np-page-scroll" :class="{ seen: seen.includes(2) }" data-page="info">
              <DetailInfo :track="player.current" part="meta" />
              <DetailTelemetry :track="player.current" :bars="16" :rows="7" />
              <UpNext />
            </section>
          </div>

          <template v-else>
            <div class="np-left">
              <div class="np-cover">
                <CoverImage :sources="coverSources(player.current.cover, 'large')" />
                <i class="np-corners" aria-hidden="true" />
              </div>
              <DetailInfo :track="player.current" />
            </div>
            <div class="np-right">
              <DetailLyrics />
              <div class="np-lower">
                <UpNext />
                <DetailTelemetry :track="player.current" />
              </div>
            </div>
            <!-- 只做入场：离场时栅格已变回两栏，留着会被挤到下一行 -->
            <Transition name="np-col">
              <DetailComments v-if="wide && comments.present" class="np-cmt" />
            </Transition>
          </template>
        </div>
        <Transition name="np-fade">
          <div v-if="drawerOpen" class="np-scrim" data-no-drag aria-hidden="true" @click="ui.toggleComments(false)" />
        </Transition>
        <Transition name="np-drawer">
          <aside v-if="drawerOpen" class="np-drawer" aria-label="评论" data-no-drag>
            <DetailComments class="np-drawer-body" />
          </aside>
        </Transition>
      </section>
      <i class="np-scan" aria-hidden="true" />
      <div class="np-ghost" aria-hidden="true">
        <img
          v-if="ghostSrc"
          :src="ghostSrc"
          :crossorigin="crossOrigin"
          alt=""
          draggable="false"
          @error="onGhostError"
        />
        <CoverFallback v-else class="np-ghost-fb" />
        <canvas class="np-mosaic" width="6" height="6" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.np-shell {
  position: fixed;
  inset: 0 0 var(--dock-h);
  z-index: 55;
  overflow: hidden;
  background: rgba(8, 10, 13, 0.94);
  transition:
    translate 240ms var(--ease-out),
    opacity 240ms var(--ease-out);
}

.np-shell.dragging {
  transition: none;
}

.np-bg {
  position: absolute;
  inset: -80px;
  opacity: 0.28;
  filter: blur(60px) saturate(1.4);
  pointer-events: none;
}

.np-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px) 0 0 / 100% 32px,
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px) 0 0 / 32px 100%;
  mask-image: radial-gradient(ellipse at 30% 40%, #000 30%, transparent 80%);
}

.np-content {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  display: grid;
  grid-template-columns: min(44vh, 40vw) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  column-gap: clamp(32px, 5vw, 80px);
  row-gap: 24px;
  padding: 28px clamp(24px, 5vw, 72px) 32px;
}

.np-head {
  /* 压在评论抽屉之上，抽屉打开时 [CMT] 按钮仍可点 */
  position: relative;
  z-index: 3;
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.np-cmt-btn {
  margin-left: auto;
}

.np-tag {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

.np-left {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 0;
  overflow: hidden auto;
  scrollbar-width: none;
}

.np-cover {
  position: relative;
  flex: none;
  width: 100%;
  aspect-ratio: 1;
  margin: 8px 0 0;
}

.np-corners {
  position: absolute;
  inset: -8px;
  pointer-events: none;
  --c: var(--accent);
  background:
    linear-gradient(var(--c) 0 0) 0 0 / 14px 2px,
    linear-gradient(var(--c) 0 0) 0 0 / 2px 14px,
    linear-gradient(var(--c) 0 0) 100% 0 / 14px 2px,
    linear-gradient(var(--c) 0 0) 100% 0 / 2px 14px,
    linear-gradient(var(--c) 0 0) 0 100% / 14px 2px,
    linear-gradient(var(--c) 0 0) 0 100% / 2px 14px,
    linear-gradient(var(--c) 0 0) 100% 100% / 14px 2px,
    linear-gradient(var(--c) 0 0) 100% 100% / 2px 14px;
  background-repeat: no-repeat;
}

.np-right {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 24px;
  min-height: 0;
}

.np-lower {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 32px;
}

.np-content.np-3 {
  grid-template-columns: min(44vh, 40vw) minmax(0, 1fr) clamp(300px, 22vw, 380px);
}

.np-cmt {
  min-height: 0;
}

.np-col-enter-active {
  transition:
    opacity 360ms var(--ease-out),
    transform 480ms var(--ease-out);
}

.np-col-enter-from {
  opacity: 0;
  transform: translateX(48px);
}

.np-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: rgba(4, 6, 8, 0.45);
}

.np-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  width: clamp(300px, 22vw, 380px);
  padding: 72px 24px 24px;
  background: rgba(8, 10, 13, 0.97);
  border-left: 1px solid var(--line-strong);
  box-shadow: -24px 0 48px rgba(0, 0, 0, 0.5);
}

.np-drawer-body {
  flex: 1;
}

.np-drawer-enter-active,
.np-drawer-leave-active {
  transition: transform 320ms var(--ease-out);
}

.np-drawer-enter-from,
.np-drawer-leave-to {
  transform: translateX(100%);
}

.np-fade-enter-active,
.np-fade-leave-active {
  transition: opacity 240ms var(--ease-out);
}

.np-fade-enter-from,
.np-fade-leave-to {
  opacity: 0;
}

.np-scan {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--dock-h);
  z-index: 56;
  height: 2px;
  opacity: 0;
  pointer-events: none;
  background: var(--accent);
  box-shadow:
    0 0 12px var(--accent),
    0 0 2px var(--accent);
}

.np-ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 58;
  width: 44px;
  height: 44px;
  visibility: hidden;
  pointer-events: none;
  transform-origin: 0 0;
}

.np-ghost img,
.np-mosaic {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.np-mosaic {
  opacity: 0;
  image-rendering: pixelated;
}

.np-ghost-fb {
  background:
    radial-gradient(circle, rgba(255, 255, 255, 0.07) 1px, transparent 1.5px) 0 0 / 8px 8px,
    var(--bg-2);
}

@media (max-width: 900px) {
  .np-content {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 20px 16px 28px;
  }
  .np-content > * {
    flex: none;
  }
  .np-left {
    overflow: visible;
  }
  .np-cover {
    align-self: center;
    width: min(72vw, 360px);
  }
  .np-right {
    display: flex;
    flex-direction: column;
  }
  .np-right .dl {
    height: 320px;
  }
  .np-lower {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ---------- 手机端：三页横滑 ---------- */
.np-content.np-m {
  display: flex;
  flex-direction: column;
  padding: calc(8px + env(safe-area-inset-top)) 0 0;
  overflow: hidden;
}

.np-m .np-head {
  touch-action: pan-x;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px 4px 16px;
}

.np-dots {
  position: relative;
  display: flex;
  gap: 4px;
}

.np-dot {
  width: 64px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  cursor: pointer;
}

.np-dot.on {
  color: var(--accent);
}

.np-dots-bar {
  position: absolute;
  left: 0;
  bottom: 8px;
  width: 64px;
  height: 2px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  transform: translateX(calc(var(--p, 0) * 68px));
  pointer-events: none;
}

.np-m > .np-pager {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.np-pager::-webkit-scrollbar {
  display: none;
}

.np-page {
  flex: none;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  min-height: 0;
  padding: 8px 20px 20px;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

/* 没翻到的页先停在组装动画的起点，翻到时再播放 */
.np-page:not(.seen) :deep(.np-in) {
  animation-play-state: paused;
}

[data-page='play'] {
  justify-content: safe center;
  gap: 14px;
  /* 纵向拖动交给下拉关闭，横向交给翻页 */
  touch-action: pan-x;
}

[data-page='play'] .np-cover {
  align-self: center;
  /* 播放页不能纵向滚动：给标题、进度、控制和歌词预览留出约 440px */
  width: clamp(160px, calc(100dvh - 440px), min(82vw, 46dvh));
  margin: 4px 0 6px;
}

.np-seek {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}

.np-ctrl {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.np-ctrl .txt-btn {
  min-width: 44px;
  min-height: 44px;
}

.np-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  cursor: pointer;
}

.np-play {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 0;
  background: var(--accent);
  color: var(--bg);
  cursor: pointer;
}

.np-peek {
  padding: 6px 0;
  border: 0;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-dim);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

[data-page='lrc'] > .dl {
  flex: 1;
}

.np-page-scroll {
  gap: 28px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.np-page-scroll::-webkit-scrollbar {
  display: none;
}
</style>
