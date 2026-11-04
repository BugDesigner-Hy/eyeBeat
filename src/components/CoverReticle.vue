<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMobile } from '../composables/useMobile'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'

/** 详情页 / 氛围歌词开着时为 true：期间的切歌先记下，关闭后再瞄准 */
const props = defineProps<{ suspended: boolean }>()

const player = usePlayerStore()
const settings = useSettingsStore()
const ui = useUiStore()
const mobile = useMobile()

const wrap = ref<HTMLElement>()
const tl = ref<HTMLElement>()
const tr = ref<HTMLElement>()
const bl = ref<HTMLElement>()
const br = ref<HTMLElement>()
const cross = ref<HTMLElement>()
const label = ref<HTMLElement>()

/** 时间轴（ms）：飞行 → 过冲后左右晃 → 锁定 → 停留 → 淡出 */
const MOVE = 450
const SWAY_L = 560
const SWAY_R = 650
const LOCK = 750
const HOLD = 350
const FADE = 200
const TOTAL = LOCK + HOLD + FADE
const EDGE = 900
const STATIC = 800
/** 这段时间内手动滚动过就不再替用户滚动 */
const USER_SCROLL_MS = 3000
/** 关闭详情页后等封面飞回底栏再瞄准 */
const RESUME_DELAY = 450
/** 与 easeInOutCubic 等价，页面滚动和准星飞行同曲线才能同时落位 */
const EASE_MOVE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const EASE_SWAY = 'cubic-bezier(0.37, 0, 0.63, 1)'
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'])

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const dims = computed(() =>
  mobile.value ? { c: 9, lock: 3, loose: 10, sway: [4, 8] } : { c: 14, lock: 4, loose: 16, sway: [6, 12] },
)

interface Box {
  x: number
  y: number
  w: number
  h: number
}

type Frame = Keyframe & {
  offset: number
  transform: string
  easing: string
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const easeMove = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const boxOf = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height })
const inflate = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, w: b.w + p * 2, h: b.h + p * 2 })
const shift = (b: Box, dx: number, dy: number): Box => ({ ...b, x: b.x + dx, y: b.y + dy })
const xf = (x: number, y: number) => `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`

/** 角标不能互相重叠 */
function minBox(b: Box, c: number): Box {
  const m = c * 2 + 6
  const w = Math.max(b.w, m)
  const h = Math.max(b.h, m)
  return { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h }
}

function cornerXf(b: Box, i: number, c: number) {
  return xf(i % 2 ? b.x + b.w - c : b.x, i < 2 ? b.y : b.y + b.h - c)
}

const crossXf = (b: Box, c: number) => xf(b.x + (b.w - c) / 2, b.y + (b.h - c) / 2)

interface Region {
  top: number
  bottom: number
  right: number
}

/** 顶栏下沿到底栏上沿之间、桌面歌词面板左侧才算“看得见” */
function region(): Region {
  const top = document.querySelector('header.top')?.getBoundingClientRect().bottom ?? 0
  const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) || 0
  const panel = document.querySelector('aside.lyrics')?.getBoundingClientRect()
  return {
    top: Math.max(0, top),
    bottom: window.innerHeight - dock,
    right: panel && panel.width > 0 ? panel.left : window.innerWidth,
  }
}

const hRatio = (r: DOMRect, reg: Region) =>
  r.width ? Math.max(0, Math.min(r.right, reg.right) - Math.max(r.left, 0)) / r.width : 0

function visibleRatio(r: DOMRect, reg: Region) {
  const h = Math.max(0, Math.min(r.bottom, reg.bottom) - Math.max(r.top, reg.top))
  return r.height ? (hRatio(r, reg) * h) / r.height : 0
}

function findTile(id: string) {
  return document.querySelector<HTMLElement>(`.wall .tile[data-track-id="${CSS.escape(id)}"]`)
}

/* ---------------- 动画状态 ---------------- */

let run = 0
let active = false
let anims: Animation[] = []
/** 飞行中的位移动画，移动结束时按重新量到的目标改写后半段 */
let moving: { el: HTMLElement; anim: Animation; frames: (t: Box) => Frame[] }[] = []
let timers: number[] = []
let lockedTile: HTMLElement | null = null
let pending = false
let resumeTimer = 0

let scrollRaf = 0
let scrollTarget = 0
let scrollEndAt = -Infinity
let inputAt = -Infinity
let userScrollAt = -Infinity
let pointerHeld = false

const corners = () => [tl.value!, tr.value!, bl.value!, br.value!]

function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}

function play(el: HTMLElement, frames: Keyframe[], duration: number) {
  const a = el.animate(frames, { duration, fill: 'both' })
  anims.push(a)
  return a
}

function cancelAll() {
  run++
  active = false
  for (const a of anims) a.cancel()
  anims = []
  moving = []
  for (const t of timers) clearTimeout(t)
  timers = []
  stopScroll()
  unlockTile()
}

/** 用户一滚动，fixed 的准星就脱靶了，快速淡出 */
function dismiss() {
  if (!active || !wrap.value) return
  active = false
  stopScroll()
  for (const t of timers) clearTimeout(t)
  timers = []
  const r = run
  const a = wrap.value.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' })
  anims.push(a)
  a.onfinish = () => r === run && cancelAll()
}

/** 动效进行中再次切歌时，从四个角当前的位置改道 */
function currentBox(): Box | null {
  if (!active || !tl.value || !br.value) return null
  const a = tl.value.getBoundingClientRect()
  const b = br.value.getBoundingClientRect()
  return { x: a.left, y: a.top, w: b.right - a.left, h: b.bottom - a.top }
}

function lockTile(tile: HTMLElement) {
  unlockTile()
  void tile.offsetWidth
  tile.setAttribute('data-lock', '')
  lockedTile = tile
}

function unlockTile() {
  lockedTile?.removeAttribute('data-lock')
  lockedTile = null
}

/* ---------------- 页面滚动 ---------------- */

/** 自己逐帧滚：原生 smooth 的时长和曲线不可控，没法和准星同时落位 */
function scrollTo(y: number) {
  const from = window.scrollY
  const start = performance.now()
  const step = (now: number) => {
    const k = clamp((now - start) / MOVE, 0, 1)
    scrollTarget = from + (y - from) * easeMove(k)
    window.scrollTo({ top: scrollTarget, behavior: 'instant' })
    if (k < 1) scrollRaf = requestAnimationFrame(step)
    else {
      scrollRaf = 0
      scrollEndAt = performance.now()
    }
  }
  scrollRaf = requestAnimationFrame(step)
}

function stopScroll() {
  if (!scrollRaf) return
  cancelAnimationFrame(scrollRaf)
  scrollRaf = 0
  scrollEndAt = performance.now()
}

function onScroll() {
  const now = performance.now()
  if (scrollRaf) {
    if (Math.abs(window.scrollY - scrollTarget) > 2) userScrolled(now)
    return
  }
  if (now - scrollEndAt < 120) return
  // 没有输入的滚动（列表重载导致页面变短等）不算手动滚动
  if (now - inputAt < 600 || now - userScrollAt < 300 || pointerHeld) userScrolled(now)
}

function userScrolled(now: number) {
  userScrollAt = now
  dismiss()
}

const onInput = () => (inputAt = performance.now())

function onKeydown(e: KeyboardEvent) {
  if (!SCROLL_KEYS.has(e.key)) return
  const t = e.target as HTMLElement | null
  if (t?.closest?.('input, textarea, select, [contenteditable], [role="slider"]')) return
  onInput()
}

/** 拖滚动条、中键自动滚动：按住期间的滚动都算手动 */
function onPointerDown(e: PointerEvent) {
  const html = document.documentElement
  pointerHeld = e.button === 1 || e.target === html || e.clientX >= html.clientWidth
  if (pointerHeld) onInput()
}

const onPointerUp = () => (pointerHeld = false)

/** 只看宽度：手机地址栏随滚动收起也会触发 resize，高度变化不影响封面排布 */
let lastWidth = window.innerWidth
function onResize() {
  if (window.innerWidth === lastWidth) return
  lastWidth = window.innerWidth
  dismiss()
}

/* ---------------- 瞄准 ---------------- */

function sourceBox(prevId: string | null | undefined, reg: Region): Box {
  const prev = prevId ? findTile(prevId)?.querySelector('.tile-inner') : null
  if (prev) {
    const r = prev.getBoundingClientRect()
    if (visibleRatio(r, reg) >= 0.3) return boxOf(r)
  }
  const sel = ui.barCollapsed && !mobile.value ? '[data-dock-thumb]' : '[data-np-thumb]'
  const r = document.querySelector(sel)?.getBoundingClientRect()
  const vh = window.innerHeight
  // 底栏刚出现时还在入场动画里，可能在视口下方
  if (r && r.width > 0) return { x: r.left, y: Math.min(r.top, vh - r.height - 4), w: r.width, h: r.height }
  return { x: window.innerWidth / 2 - 22, y: vh - 56, w: 44, h: 44 }
}

function placeLabel(text: string, b: Box) {
  const el = label.value!
  el.textContent = text
  const lw = el.offsetWidth
  const lh = el.offsetHeight
  const vw = window.innerWidth
  let x = b.x + b.w + 6
  let y = b.y
  if (x + lw > vw - 4) x = b.x - lw - 6
  if (x < 4) {
    x = clamp(b.x, 4, vw - lw - 4)
    y = b.y - lh - 6
  }
  return xf(x, clamp(y, 4, window.innerHeight - lh - 4))
}

function aim(prevId?: string | null) {
  clearTimeout(resumeTimer)
  pending = false
  const id = player.current?.id
  if (!settings.reticleLocate || !id) return cancelAll()
  if (props.suspended || document.hidden) {
    cancelAll()
    pending = true
    return
  }
  const from = currentBox()
  cancelAll()
  const tile = findTile(id)
  const inner = tile?.querySelector<HTMLElement>('.tile-inner')
  const reg = region()
  const r = inner?.getBoundingClientRect()
  // 被歌词面板挡住的列纵向滚动也露不出来，同样按“不在视野内”处理
  if (!tile || !inner || !r || hRatio(r, reg) < 0.5) return edgeFlash(reg)

  let dy = 0
  if (visibleRatio(r, reg) < 0.5) {
    if (performance.now() - userScrollAt < USER_SCROLL_MS) return
    const max = document.documentElement.scrollHeight - window.innerHeight
    const y = clamp(window.scrollY + r.top + r.height / 2 - (reg.top + reg.bottom) / 2, 0, max)
    dy = y - window.scrollY
  }

  if (reduceQuery.matches) {
    if (dy) {
      window.scrollTo({ top: window.scrollY + dy, behavior: 'instant' })
      scrollEndAt = performance.now()
    }
    return staticLock(tile, inner)
  }

  if (Math.abs(dy) >= 1) scrollTo(window.scrollY + dy)
  fly(from ?? sourceBox(prevId, reg), { x: r.left, y: r.top - dy, w: r.width, h: r.height }, !!from, tile, inner)
}

function fly(src: Box, target: Box, fromVisible: boolean, tile: HTMLElement, inner: HTMLElement) {
  const { c, lock, loose, sway } = dims.value
  const S = minBox(src, c)
  const dx = target.x + target.w / 2 - (S.x + S.w / 2)
  const dy = target.y + target.h / 2 - (S.y + S.h / 2)
  const dist = Math.hypot(dx, dy)
  const k = Math.min(28, dist * 0.06) / (dist || 1)
  const sw = clamp(target.w * 0.06, sway[0], sway[1])

  const poses = (t: Box): [number, Box, string][] => {
    const T = minBox(t, c)
    return [
      [0, S, EASE_MOVE],
      [MOVE, shift(inflate(T, loose), dx * k, dy * k), EASE_SWAY],
      [SWAY_L, shift(inflate(T, mix(loose, lock, 0.45)), -sw, 0), EASE_SWAY],
      [SWAY_R, shift(inflate(T, mix(loose, lock, 0.75)), sw / 2, 0), 'steps(3, end)'],
      [LOCK, inflate(T, lock), 'linear'],
      [TOTAL, inflate(T, lock), 'linear'],
    ]
  }
  const framesOf =
    (map: (b: Box) => string) =>
    (t: Box): Frame[] =>
      poses(t).map(([ms, b, easing]) => ({ offset: ms / TOTAL, transform: map(b), easing }))

  active = true
  const appear = fromVisible ? 1 : 0
  const fadeIn = 60 / TOTAL
  corners().forEach((el, i) => {
    const frames = framesOf((b) => cornerXf(b, i, c))
    moving.push({ el, anim: play(el, frames(target), TOTAL), frames })
    play(
      el,
      [
        { opacity: appear },
        { offset: fadeIn, opacity: 1 },
        { offset: (LOCK + HOLD) / TOTAL, opacity: 1, easing: 'steps(4, end)' },
        { opacity: 0 },
      ],
      TOTAL,
    )
  })

  const crossFrames = framesOf((b) => crossXf(b, c))
  moving.push({ el: cross.value!, anim: play(cross.value!, crossFrames(target), TOTAL), frames: crossFrames })
  play(
    cross.value!,
    [
      { opacity: appear },
      { offset: fadeIn, opacity: 1 },
      { offset: SWAY_R / TOTAL, opacity: 1, easing: 'steps(3, end)' },
      { offset: LOCK / TOTAL, opacity: 0 },
      { opacity: 0 },
    ],
    TOTAL,
  )

  const labelFrames = (t: Box): Frame[] => {
    const at = placeLabel('LOCK', inflate(minBox(t, c), lock))
    return [
      { offset: 0, transform: at, easing: 'linear' },
      { offset: 1, transform: at, easing: 'linear' },
    ]
  }
  moving.push({ el: label.value!, anim: play(label.value!, labelFrames(target), TOTAL), frames: labelFrames })
  play(
    label.value!,
    [
      { opacity: 0, easing: 'step-end' },
      { offset: LOCK / TOTAL, opacity: 1, easing: 'step-end' },
      { offset: (LOCK + 70) / TOTAL, opacity: 0.2, easing: 'step-end' },
      { offset: (LOCK + 140) / TOTAL, opacity: 1 },
      { offset: (LOCK + HOLD) / TOTAL, opacity: 1, easing: 'steps(4, end)' },
      { opacity: 0 },
    ],
    TOTAL,
  )

  // 动画要到下一帧才真正开始，计时从 ready 起算才和锁定帧对齐
  const r = run
  void moving[0].anim.ready.then(() => {
    if (r !== run || !active) return
    // 视差缩放随滚动变化，滚动结束后的真实位置要重新量；期间换了分区 / 搜索结果，封面已不在页面上
    later(() => (inner.isConnected ? retarget(boxOf(inner.getBoundingClientRect()), target) : dismiss()), MOVE + 40)
    later(() => (tile.isConnected ? lockTile(tile) : dismiss()), LOCK)
    later(cancelAll, TOTAL)
  }, () => {})
}

/** 从当前时刻的实际位置接到新目标，不跳变 */
function retarget(next: Box, prev: Box) {
  const diff = Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y) + Math.abs(next.w - prev.w) + Math.abs(next.h - prev.h)
  if (diff < 2) return
  for (const m of moving) {
    const k = Number(m.anim.currentTime ?? 0) / TOTAL
    const now = getComputedStyle(m.el).transform
    const rest = m.frames(next).filter((f) => f.offset > k)
    ;(m.anim.effect as KeyframeEffect).setKeyframes([
      { offset: 0, transform: now },
      { offset: k, transform: now, easing: EASE_SWAY },
      ...rest,
    ])
  }
}

/** 新歌不在当前封面墙：在可视区右缘闪两下，提示目标不在视野内 */
function edgeFlash(reg: Region) {
  const { c } = dims.value
  const s = mobile.value ? 40 : 56
  const B: Box = { x: reg.right - s - (mobile.value ? 8 : 14), y: (reg.top + reg.bottom) / 2 - s / 2, w: s, h: s }
  const still = reduceQuery.matches
  active = true

  const blink: Keyframe[] = still
    ? [{ opacity: 1, easing: 'step-end' }, { opacity: 0 }]
    : [
        { opacity: 1, easing: 'step-end' },
        { offset: 0.1, opacity: 0, easing: 'step-end' },
        { offset: 0.2, opacity: 1, easing: 'step-end' },
        { offset: 0.3, opacity: 0, easing: 'step-end' },
        { offset: 0.4, opacity: 1 },
        { offset: 0.8, opacity: 1, easing: 'steps(4, end)' },
        { opacity: 0 },
      ]
  const from = still ? B : inflate(B, 10)
  corners().forEach((el, i) => {
    play(
      el,
      [
        { transform: cornerXf(from, i, c), easing: 'steps(3, end)' },
        { offset: 0.3, transform: cornerXf(B, i, c) },
        { transform: cornerXf(B, i, c) },
      ],
      EDGE,
    )
    play(el, blink, EDGE)
  })
  const at = crossXf(B, c)
  play(cross.value!, [{ transform: at }, { transform: at }], EDGE)
  play(cross.value!, blink, EDGE)
  const lat = placeLabel('NO TARGET', B)
  play(label.value!, [{ transform: lat }, { transform: lat }], EDGE)
  play(label.value!, blink, EDGE)
  later(cancelAll, EDGE)
}

/** 减弱动效：直接在目标处显示锁定框，不飞不晃 */
function staticLock(tile: HTMLElement, inner: HTMLElement) {
  const { c, lock } = dims.value
  const show: Keyframe[] = [{ opacity: 1, easing: 'step-end' }, { opacity: 0 }]
  const els = [...corners(), label.value!]
  const place = (target: Box) => {
    const L = inflate(minBox(target, c), lock)
    const at = [0, 1, 2, 3].map((i) => cornerXf(L, i, c)).concat(placeLabel('LOCK', L))
    return at.map((t) => [{ transform: t }, { transform: t }])
  }
  const target = boxOf(inner.getBoundingClientRect())
  active = true
  const moves = place(target).map((frames, i) => play(els[i], frames, STATIC))
  for (const el of els) play(el, show, STATIC)
  lockTile(tile)
  // 跳滚后视差要过一帧才按新位置重写封面的缩放，届时再对齐一次
  later(() => {
    if (!inner.isConnected) return dismiss()
    const next = boxOf(inner.getBoundingClientRect())
    if (Math.abs(next.x - target.x) + Math.abs(next.y - target.y) + Math.abs(next.w - target.w) < 2) return
    place(next).forEach((frames, i) => (moves[i].effect as KeyframeEffect).setKeyframes(frames))
  }, 80)
  later(cancelAll, STATIC)
}

/* ---------------- 触发 ---------------- */

watch(
  () => player.current?.id,
  (id, prev) => (id ? aim(prev) : cancelAll()),
  { flush: 'post' },
)

watch(
  () => props.suspended,
  (s) => {
    clearTimeout(resumeTimer)
    if (s) {
      if (active) pending = true
      cancelAll()
    } else if (pending) {
      resumeTimer = window.setTimeout(() => aim(null), RESUME_DELAY)
    }
  },
)

watch(
  () => settings.reticleLocate,
  (on) => {
    if (on) return
    pending = false
    cancelAll()
  },
)

function onVisibility() {
  clearTimeout(resumeTimer)
  if (document.hidden) {
    if (active) pending = true
    cancelAll()
  } else if (pending && !props.suspended) {
    resumeTimer = window.setTimeout(() => aim(null), 300)
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('wheel', onInput, { passive: true })
  window.addEventListener('touchmove', onInput, { passive: true })
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true, capture: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true, capture: true })
  window.addEventListener('resize', onResize, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  cancelAll()
  clearTimeout(resumeTimer)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('wheel', onInput)
  window.removeEventListener('touchmove', onInput)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointerdown', onPointerDown, { capture: true })
  window.removeEventListener('pointerup', onPointerUp, { capture: true })
  window.removeEventListener('pointercancel', onPointerUp, { capture: true })
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div ref="wrap" class="reticle" :style="{ '--c': `${dims.c}px` }" aria-hidden="true">
    <i ref="tl" class="corner tl" />
    <i ref="tr" class="corner tr" />
    <i ref="bl" class="corner bl" />
    <i ref="br" class="corner br" />
    <i ref="cross" class="cross" />
    <span ref="label" class="label" />
  </div>
</template>

<style scoped>
/* 0×0 的定位原点：子元素全部用 transform 摆到视口坐标上 */
.reticle {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 45;
  width: 0;
  height: 0;
  pointer-events: none;
}

.corner,
.cross,
.label {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  will-change: transform, opacity;
}

.corner {
  width: var(--c);
  height: var(--c);
  border: 0 solid var(--accent);
  filter: drop-shadow(0 0 3px var(--accent));
}

.tl {
  border-width: 2px 0 0 2px;
}
.tr {
  border-width: 2px 2px 0 0;
}
.bl {
  border-width: 0 0 2px 2px;
}
.br {
  border-width: 0 2px 2px 0;
}

/* 中心留空的十字 */
.cross {
  width: var(--c);
  height: var(--c);
  background:
    linear-gradient(var(--accent) 0 0) left center / 36% 2px,
    linear-gradient(var(--accent) 0 0) right center / 36% 2px,
    linear-gradient(var(--accent) 0 0) center top / 2px 36%,
    linear-gradient(var(--accent) 0 0) center bottom / 2px 36%;
  background-repeat: no-repeat;
}

.label {
  padding: 3px 4px 2px;
  font-family: var(--font-pixel);
  font-size: 8px;
  line-height: 1;
  letter-spacing: 0.1em;
  white-space: nowrap;
  color: var(--bg);
  background: var(--accent);
}
</style>
