<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { registerCoverCanvasCamera } from '../composables/coverCanvasCamera'
import { useI18n } from '../i18n'
import { useAccountStore } from '../stores/account'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import type { Track } from '../api/types'
import { dirFromKey, pickNeighbor } from '../utils/spatialNav'
import {
  cubeToPixel,
  cubeToSpiralIndex,
  forEachCubeInRadius,
  getHexCubicAtIndex,
  mod,
  pixelToCube,
  toCubeKey,
  type CubeCoord,
} from '../utils/hexGrid'
import { tileCanvasDimForId, type TileSize } from '../utils/tileSize'
import CoverTile from './CoverTile.vue'

/**
 * 无限画布：六边形世界坐标无限延伸；曲目按螺旋序号对列表取模循环填充。
 * 空闲时沿预设/随机路径缓慢漂移；选中曲目随网格一起流动，不再钉死中央。
 */

const store = usePlayerStore()
const settings = useSettingsStore()
const ui = useUiStore()
const account = useAccountStore()
const { t } = useI18n()

/** 键盘选中的格子 key（与 hover focus 独立，避免鼠标一动就丢） */
const kbKey = ref<string | null>(null)

const CELL = 168
const SPACING_X = 210
const SPACING_Y = 186
const SIZE_Z: Record<TileSize, number> = { s: 0, w: 4, t: 4, m: 10, l: 18 }
const CLIP_RADIUS = 1080
const MAX_DIST = 980
const PEAK_SCALE = 1.12
const MIN_SCALE = 0.62
const MIN_OPACITY = 0.55
/** 超过此距离的缓存格回收，避免 Map 无限涨 */
const PRUNE_RADIUS = CLIP_RADIUS * 2.2
/** 指针视差与悬停放大让路 */
const PARALLAX = 16
const HOVER_BOOST = 1.26
const REPEL_RADIUS = 320
const REPEL_PUSH = 34
/** 指针 / 让路弹簧时间常数（越大越肉） */
const HOVER_SMOOTH_MS = 72
const REPEL_SMOOTH_MS = 110
/** 焦点滞回，避免两格边界来回跳 */
const FOCUS_STICK_PX = 32

const root = ref<HTMLElement>()

let dx = 0
let dy = 0
let vx = 0
let vy = 0
let vw = window.innerWidth
let vh = window.innerHeight

const visibleKeys = ref<string[]>([])

interface Slot {
  key: string
  cube: CubeCoord
  baseX: number
  baseY: number
  spiral: number
  track: Track
  size: TileSize
  bw: number
  bh: number
  el: HTMLElement | null
  /** 平滑后的让路位移 / 放大，避免焦点切换时硬跳 */
  sox: number
  soy: number
  sBoost: number
}

const slotMap = new Map<string, Slot>()
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

function trackAtSpiral(spiral: number): Track | null {
  const n = store.tracks.length
  if (!n) return null
  return store.tracks[mod(spiral, n)]
}

/** 按相机位置展开附近六边形，曲目取模循环 */
function syncVisible() {
  const n = store.tracks.length
  if (!n) {
    visibleKeys.value = []
    return
  }

  const worldX = -dx
  const worldY = -dy
  const center = pixelToCube(worldX, worldY, SPACING_X, SPACING_Y)
  const ring = Math.ceil(CLIP_RADIUS / Math.min(SPACING_X, SPACING_Y)) + 2
  const clip2 = (CLIP_RADIUS + CELL) ** 2
  const next: string[] = []
  const keep = new Set<string>()

  forEachCubeInRadius(center, ring, (cube) => {
    const { x: baseX, y: baseY } = cubeToPixel(cube, SPACING_X, SPACING_Y)
    const cx = baseX + dx
    const cy = baseY + dy
    if (cx * cx + cy * cy > clip2) return

    const key = toCubeKey(cube)
    next.push(key)
    keep.add(key)

    let s = slotMap.get(key)
    if (!s) {
      // 立方坐标决定螺旋序号，只在建格时算一次
      const spiral = cubeToSpiralIndex(cube)
      const track = trackAtSpiral(spiral)!
      const dim = tileCanvasDimForId(track.id)
      s = {
        key,
        cube,
        baseX,
        baseY,
        spiral,
        track,
        size: dim.size,
        bw: dim.w,
        bh: dim.h,
        el: null,
        sox: 0,
        soy: 0,
        sBoost: 1,
      }
      slotMap.set(key, s)
    } else {
      s.baseX = baseX
      s.baseY = baseY
      s.track = trackAtSpiral(s.spiral)!
      const dim = tileCanvasDimForId(s.track.id)
      s.size = dim.size
      s.bw = dim.w
      s.bh = dim.h
    }
  })

  // 回收远离视口的格，防止内存涨
  const prune2 = PRUNE_RADIUS * PRUNE_RADIUS
  for (const [key, s] of slotMap) {
    if (keep.has(key)) continue
    const cx = s.baseX + dx
    const cy = s.baseY + dy
    if (cx * cx + cy * cy > prune2) slotMap.delete(key)
  }

  next.sort()
  const prev = visibleKeys.value
  if (prev.length === next.length && prev.every((v, i) => v === next[i])) return
  visibleKeys.value = next
}

/** 指针位置（视差）；悬停焦点经平滑后驱动放大+让路 */
let hoverX = 0
let hoverY = 0
let smoothHoverX = 0
let smoothHoverY = 0
/** 让路圆心（屏幕坐标），在焦点格之间连续滑动 */
let focusSX = 0
let focusSY = 0
let focusKey: string | null = null
let focusAmt = 0
let targetFocusAmt = 0
let hoverDirty = false

function expApproach(dt: number, ms: number) {
  return 1 - Math.exp(-dt / Math.max(1, ms))
}

function pickHover(clientX: number, clientY: number) {
  let best: string | null = null
  let bestScore = 1
  for (const key of visibleKeys.value) {
    const s = slotMap.get(key)
    if (!s) continue
    const sx = vw / 2 + s.baseX + dx
    const sy = vh / 2 + s.baseY + dy
    const hit = Math.hypot(s.bw, s.bh) * 0.48
    const score = Math.hypot(clientX - sx, clientY - sy) / hit
    if (score < bestScore) {
      bestScore = score
      best = key
    }
  }
  if (!best || bestScore > 1) return null
  // 滞回：仍落在当前焦点附近时不换靶，消灭边界抖
  if (focusKey && focusKey !== best) {
    const cur = slotMap.get(focusKey)
    if (cur) {
      const hit = Math.hypot(cur.bw, cur.bh) * 0.48
      const cd = Math.hypot(clientX - (vw / 2 + cur.baseX + dx), clientY - (vh / 2 + cur.baseY + dy))
      if (cd / hit <= bestScore + FOCUS_STICK_PX / hit) return focusKey
    }
  }
  return best
}

/** 目标让路/放大（未平滑） */
function desiredMotion(s: Slot) {
  let tox = 0
  let toy = 0
  let tBoost = 1
  if (focusAmt > 0.001) {
    const fx = focusSX - vw / 2
    const fy = focusSY - vh / 2
    const cx = s.baseX + dx
    const cy = s.baseY + dy
    if (s.key === focusKey) {
      tBoost = 1 + (HOVER_BOOST - 1) * focusAmt
    } else {
      const ddx = cx - fx
      const ddy = cy - fy
      const d = Math.hypot(ddx, ddy) || 1
      if (d < REPEL_RADIUS) {
        const fall = (1 - d / REPEL_RADIUS) ** 1.05
        const room = Math.max(s.bw, s.bh) * 0.5 * (HOVER_BOOST - 1) * focusAmt
        const push = (REPEL_PUSH + room * 1.3) * fall * focusAmt
        tox = (ddx / d) * push
        toy = (ddy / d) * push
      }
    }
  }
  return { tox, toy, tBoost }
}

function frameOf(s: Slot) {
  const cx = s.baseX + dx
  const cy = s.baseY + dy
  const dist = Math.hypot(cx, cy)
  const progress = Math.min(dist / MAX_DIST, 1)
  const baseScale = PEAK_SCALE - (PEAK_SCALE - MIN_SCALE) * progress
  const scale = baseScale * s.sBoost
  const opacity = Math.max(MIN_OPACITY, 1 - 0.42 * progress)
  let z = Math.round(60 - 40 * progress) + SIZE_Z[s.size]
  if (store.current?.id === s.track.id) z = Math.max(z, 70)
  if (s.key === focusKey && focusAmt > 0.2) z = 90

  // 视差：用平滑指针，近中心更深
  const depth = 0.35 + (1 - progress) * 0.65
  const mx = vw > 0 ? (smoothHoverX / vw) * 2 - 1 : 0
  const my = vh > 0 ? (smoothHoverY / vh) * 2 - 1 : 0
  const ox = -mx * PARALLAX * depth + s.sox
  const oy = -my * PARALLAX * depth + s.soy

  const x = vw / 2 + cx - s.bw / 2 + ox
  const y = vh / 2 + cy - s.bh / 2 + oy
  return {
    transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`,
    opacity: opacity.toFixed(3),
    zIndex: String(z),
  }
}

function applyFrames(force = false) {
  for (const key of visibleKeys.value) {
    const s = slotMap.get(key)
    if (!s?.el) continue
    const f = frameOf(s)
    const el = s.el
    if (force || el.style.transform !== f.transform) el.style.transform = f.transform
    if (force || el.style.opacity !== f.opacity) el.style.opacity = f.opacity
    if (force || el.style.zIndex !== f.zIndex) el.style.zIndex = f.zIndex
  }
}

/** 每格弹簧逼近目标让路，换焦点时位移连续 */
function tickRepel(dt: number) {
  const a = expApproach(dt, REPEL_SMOOTH_MS)
  let busy = focusAmt > 0.001 || targetFocusAmt > 0
  for (const key of visibleKeys.value) {
    const s = slotMap.get(key)
    if (!s) continue
    const { tox, toy, tBoost } = desiredMotion(s)
    s.sox += (tox - s.sox) * a
    s.soy += (toy - s.soy) * a
    s.sBoost += (tBoost - s.sBoost) * a
    if (Math.abs(s.sox) > 0.02 || Math.abs(s.soy) > 0.02 || Math.abs(s.sBoost - 1) > 0.001) busy = true
    else {
      s.sox = tox
      s.soy = toy
      s.sBoost = tBoost
    }
  }
  return busy
}

function refresh(opts?: { light?: boolean }) {
  const light = !!opts?.light
  // light：只改 transform，绝不 sync（切歌跟镜途中 sync 是卡顿主因）
  if (!light) {
    syncVisible()
    maybeLoadMore()
  }
  applyFrames(true)
}

/** 仍尽量拉新歌充实曲库；没有更多时靠取模无限铺 */
let lastLoadAt = 0
function maybeLoadMore() {
  if (!store.hasMore || store.listLoading || !store.tracks.length) return
  const now = performance.now()
  if (now - lastLoadAt < 900) return
  // 离原点一段距离再拉，避免一进画布就狂请求
  if (Math.hypot(dx, dy) < 280) return
  lastLoadAt = now
  void store.loadList()
}

let raf = 0
let camAnim = 0
let camAnimDone: (() => void) | null = null
let dragging = false
let moved = false
let suppressClick = false
let lastPx = 0
let lastPy = 0
let lastT = 0
let pointerId = -1

/** 与 CoverReticle 页面滚动同曲线，准星飞行才能对齐 */
const CAM_MOVE_MS = 450
const IDLE_RESUME_MS = 2400
const PATH_MIN_MS = 14000
const PATH_SPAN_MS = 12000
const easeCam = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

/** 环境漂移：相对锚点的路径偏移，t=0 时为原点保证换轨不跳 */
let ambientAnchorX = 0
let ambientAnchorY = 0
let ambientT = 0
let pathKind = 0
let pathUntil = 0
let userQuietAt = -Infinity
let lastFrameT = 0

function pathOffset(kind: number, t: number) {
  const R = 300
  switch (kind % 5) {
    case 0: // 椭圆缓行
      return { x: Math.cos(t * 0.14) * R - R, y: Math.sin(t * 0.14) * R * 0.68 }
    case 1: // 8 字
      return { x: Math.sin(t * 0.11) * R, y: Math.sin(t * 0.22) * R * 0.42 }
    case 2: // 斜向溪流
      return {
        x: Math.sin(t * 0.09) * 90 + t * 11,
        y: Math.cos(t * 0.07) * R * 0.4 - R * 0.4 + t * 7,
      }
    case 3: // 横向河流
      return { x: t * 13 + Math.sin(t * 0.2) * 40, y: Math.sin(t * 0.12) * R * 0.55 }
    default: // Lissajous
      return {
        x: Math.sin(t * 0.1) * R,
        y: Math.sin(t * 0.16 + 1.1) * R * 0.72 - Math.sin(1.1) * R * 0.72,
      }
  }
}

function reanchorAmbient(nextKind?: number) {
  ambientAnchorX = dx
  ambientAnchorY = dy
  ambientT = 0
  if (nextKind !== undefined) pathKind = nextKind
  pathUntil = performance.now() + PATH_MIN_MS + Math.random() * PATH_SPAN_MS
}

function noteUserInput() {
  userQuietAt = performance.now()
  reanchorAmbient(pathKind)
}

function stopCamAnim() {
  if (camAnim) {
    cancelAnimationFrame(camAnim)
    camAnim = 0
  }
  const done = camAnimDone
  camAnimDone = null
  done?.()
}

function tickFocus(dt: number) {
  const a = expApproach(dt, HOVER_SMOOTH_MS)
  smoothHoverX += (hoverX - smoothHoverX) * a
  smoothHoverY += (hoverY - smoothHoverY) * a

  // 用平滑指针选靶，减少微抖换格
  if (targetFocusAmt > 0 || focusAmt > 0.01) {
    const key = pickHover(smoothHoverX, smoothHoverY)
    if (key) {
      focusKey = key
      const s = slotMap.get(key)
      if (s) {
        const tx = vw / 2 + s.baseX + dx
        const ty = vh / 2 + s.baseY + dy
        if (focusAmt < 0.02) {
          focusSX = tx
          focusSY = ty
        } else {
          focusSX += (tx - focusSX) * a
          focusSY += (ty - focusSY) * a
        }
      }
    }
  }

  focusAmt += (targetFocusAmt - focusAmt) * a
  if (targetFocusAmt === 0 && focusAmt < 0.01) {
    focusAmt = 0
    if (Math.abs(smoothHoverX - hoverX) < 0.5) focusKey = null
  }
  return (
    Math.abs(targetFocusAmt - focusAmt) > 0.001 ||
    focusAmt > 0.001 ||
    Math.abs(smoothHoverX - hoverX) > 0.3 ||
    Math.abs(smoothHoverY - hoverY) > 0.3
  )
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  if (camAnim) {
    lastFrameT = now
    return
  }

  const dt = Math.min(48, now - lastFrameT)
  lastFrameT = now

  const focusing = !reduceMotion && tickFocus(dt)
  const repelling = !reduceMotion && tickRepel(dt)
  let movedCam = false

  if (!dragging) {
    // 惯性滑行
    if (!reduceMotion && (Math.abs(vx) > 0.08 || Math.abs(vy) > 0.08)) {
      dx += vx
      dy += vy
      vx *= 0.92
      vy *= 0.92
      movedCam = true
    } else {
      vx = 0
      vy = 0

      if (!reduceMotion && now - userQuietAt >= IDLE_RESUME_MS) {
        if (now >= pathUntil) reanchorAmbient(Math.floor(Math.random() * 5))
        ambientT += dt / 1000
        const o = pathOffset(pathKind, ambientT)
        const ndx = ambientAnchorX + o.x
        const ndy = ambientAnchorY + o.y
        if (Math.abs(ndx - dx) > 0.04 || Math.abs(ndy - dy) > 0.04) {
          dx = ndx
          dy = ndy
          movedCam = true
        }
      }
    }
  }

  if (movedCam) {
    hoverDirty = false
    refresh({ light: true })
  } else if (focusing || repelling || hoverDirty) {
    hoverDirty = false
    applyFrames(true)
  }
}

function startLoop() {
  if (raf) return
  lastFrameT = performance.now()
  pathUntil = lastFrameT + PATH_MIN_MS
  raf = requestAnimationFrame(frame)
}

const DRAG_THRESHOLD = 6
const startPtr = { x: 0, y: 0 }

function updateHover(clientX: number, clientY: number, clear = false) {
  hoverX = clientX
  hoverY = clientY
  hoverDirty = true
  if (clear || reduceMotion) {
    targetFocusAmt = 0
    return
  }
  // 只标意图；真正换靶与让路圆心在 tickFocus 里平滑推进
  targetFocusAmt = pickHover(clientX, clientY) ? 1 : 0
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement | null)?.closest?.('.cc-hud')) return
  stopCamAnim()
  noteUserInput()
  dragging = true
  moved = false
  suppressClick = false
  vx = 0
  vy = 0
  pointerId = e.pointerId
  startPtr.x = lastPx = e.clientX
  startPtr.y = lastPy = e.clientY
  lastT = performance.now()
}

function onPointerMove(e: PointerEvent) {
  // 鼠标视差 / 悬停放大（拖移中不抢焦点）
  if (e.pointerType === 'mouse') {
    updateHover(e.clientX, e.clientY, dragging && moved)
  }

  if (!dragging || e.pointerId !== pointerId) return
  const now = performance.now()
  const ddx = e.clientX - lastPx
  const ddy = e.clientY - lastPy
  const total = Math.hypot(e.clientX - startPtr.x, e.clientY - startPtr.y)

  if (!moved && total > DRAG_THRESHOLD) {
    moved = true
    targetFocusAmt = 0
    window.dispatchEvent(new Event('himusic:canvas-pan'))
    try {
      root.value?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  if (!moved) return

  dx += ddx
  dy += ddy
  const dt = Math.max(8, now - lastT)
  vx = ddx * (16 / dt)
  vy = ddy * (16 / dt)
  lastPx = e.clientX
  lastPy = e.clientY
  lastT = now
  refresh()
}

function onPointerLeave() {
  targetFocusAmt = 0
  hoverX = vw / 2
  hoverY = vh / 2
  hoverDirty = true
}

function playAtPoint(x: number, y: number, target: EventTarget | null) {
  const hit =
    (target as HTMLElement | null)?.closest?.('[data-track-id]') ||
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.('[data-track-id]')
  const id = hit?.getAttribute('data-track-id')
  if (!id) return
  const track = store.tracks.find((t) => t.id === id)
  if (track) store.playFromList(track)
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  const wasDrag = moved
  dragging = false
  suppressClick = wasDrag
  try {
    root.value?.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  if (!wasDrag) {
    playAtPoint(e.clientX, e.clientY, e.target)
    suppressClick = true
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  stopCamAnim()
  noteUserInput()
  window.dispatchEvent(new Event('himusic:canvas-pan'))
  dx -= e.deltaX
  dy -= e.deltaY
  vx = 0
  vy = 0
  refresh()
}

function onSelect(_track: Track) {
  if (suppressClick) {
    suppressClick = false
    return
  }
}

function bindSlot(key: string, el: unknown) {
  const s = slotMap.get(key)
  if (!s) return
  s.el = (el as HTMLElement) || null
  if (s.el) {
    const f = frameOf(s)
    s.el.style.transform = f.transform
    s.el.style.opacity = f.opacity
    s.el.style.zIndex = f.zIndex
  }
}

function measure() {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  vw = r.width
  vh = r.height
  refresh()
}

/** 优先已在视口的循环副本；否则在 cur±n 三个候选里取最近，控制随机切歌跨度 */
function findNearestCubeForTrack(trackId: string): CubeCoord | null {
  const ti = store.tracks.findIndex((t) => t.id === trackId)
  if (ti < 0) return null
  const n = store.tracks.length
  const camX = -dx
  const camY = -dy

  let best: CubeCoord | null = null
  let bestD = Infinity
  for (const s of slotMap.values()) {
    if (s.track.id !== trackId) continue
    const d = (s.baseX - camX) ** 2 + (s.baseY - camY) ** 2
    if (d < bestD) {
      bestD = d
      best = s.cube
    }
  }
  if (best) return best

  const center = pixelToCube(camX, camY, SPACING_X, SPACING_Y)
  const cur = cubeToSpiralIndex(center)
  const base = ti + Math.round((cur - ti) / n) * n
  for (const idx of [base - n, base, base + n]) {
    if (idx < 0) continue
    const cube = getHexCubicAtIndex(idx)
    const { x, y } = cubeToPixel(cube, SPACING_X, SPACING_Y)
    const d = (x - camX) ** 2 + (y - camY) ** 2
    if (d < bestD) {
      bestD = d
      best = cube
    }
  }
  return best ?? getHexCubicAtIndex(Math.max(0, ti))
}

function animateCameraTo(toX: number, toY: number, duration: number): Promise<void> {
  stopCamAnim()
  userQuietAt = performance.now()
  vx = 0
  vy = 0

  if (reduceMotion || duration <= 0) {
    dx = toX
    dy = toY
    refresh()
    reanchorAmbient(pathKind)
    return Promise.resolve()
  }

  const fromX = dx
  const fromY = dy
  const start = performance.now()

  return new Promise((resolve) => {
    camAnimDone = resolve
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      const e = easeCam(k)
      dx = fromX + (toX - fromX) * e
      dy = fromY + (toY - fromY) * e
      refresh({ light: true })
      if (k < 1) {
        camAnim = requestAnimationFrame(step)
        return
      }
      camAnim = 0
      dx = toX
      dy = toY
      refresh()
      reanchorAmbient(pathKind)
      const done = camAnimDone
      camAnimDone = null
      done?.()
    }
    camAnim = requestAnimationFrame(step)
  })
}

/** 超过此距离不再长途缓动（随机切歌常见），瞬移落点更顺 */
const CAM_SNAP_DIST = 280

function ensureVisible(trackId: string) {
  const cube = findNearestCubeForTrack(trackId)
  if (!cube) return null
  const { x, y } = cubeToPixel(cube, SPACING_X, SPACING_Y)
  const toX = -x
  const toY = -y
  const shiftX = toX - dx
  const shiftY = toY - dy
  const dist = Math.hypot(shiftX, shiftY)

  if (dist < 20) {
    dx = toX
    dy = toY
    vx = 0
    vy = 0
    refresh({ light: true })
    reanchorAmbient(pathKind)
    return { done: Promise.resolve(true), shiftX: 0, shiftY: 0 }
  }

  // 远处：一帧落到目标，准星按落点量 DOM（shift=0）
  if (dist > CAM_SNAP_DIST || reduceMotion) {
    dx = toX
    dy = toY
    vx = 0
    vy = 0
    refresh()
    reanchorAmbient(pathKind)
    return { done: Promise.resolve(true), shiftX: 0, shiftY: 0 }
  }

  const dur = dist < 120 ? 220 : Math.min(340, 200 + dist * 0.25)
  return { done: animateCameraTo(toX, toY, dur).then(() => true), shiftX, shiftY }
}

function centerHome() {
  void animateCameraTo(0, 0, CAM_MOVE_MS)
}

const visibleSlots = computed(() => visibleKeys.value.map((k) => slotMap.get(k)!).filter(Boolean))

const dimOthers = computed(() => settings.wallFocus && store.isPlaying && !!store.current)

const hudLabel = computed(() => {
  if (store.listError) return null
  if (store.listLoading) return 'loading'
  if (!store.tracks.length) return 'empty'
  return 'ok'
})

watch(
  () => store.tracks.length,
  async () => {
    refresh()
    await nextTick()
    applyFrames(true)
  },
)

watch(
  () => store.listLoading,
  (loading) => {
    if (!loading) maybeLoadMore()
  },
)

/** 准星关闭时切歌（含随机）也要跟镜头；开启时交给 CoverReticle，避免双飞 */
watch(
  () => store.current?.id,
  (id) => {
    if (!id || settings.reticleLocate) return
    ensureVisible(id)
  },
)

function canvasKeysBlocked() {
  return ui.poweredOff || ui.paletteOpen || ui.detailOpen || ui.fxOpen || ui.menuOpen || account.loginOpen
}

function collectCanvasPoints() {
  return visibleKeys.value
    .map((key) => {
      const s = slotMap.get(key)
      if (!s) return null
      return { id: key, x: s.baseX + dx, y: s.baseY + dy }
    })
    .filter((p): p is { id: string; x: number; y: number } => !!p)
}

function selectCanvasKey(key: string | null) {
  kbKey.value = key
  if (!key) return
  const s = slotMap.get(key)
  if (!s) return
  // 复用悬停放大/让路，键盘选中也有同样反馈
  focusKey = key
  targetFocusAmt = 1
  focusAmt = Math.max(focusAmt, 0.65)
  focusSX = vw / 2 + s.baseX + dx
  focusSY = vh / 2 + s.baseY + dy
  hoverDirty = true
  noteUserInput()
  // 偏出中心太远时轻推镜头，方便连续方向键浏览
  if (Math.hypot(s.baseX + dx, s.baseY + dy) > 240) {
    void animateCameraTo(-s.baseX, -s.baseY, 260)
  }
}

function onCanvasKeydown(e: KeyboardEvent) {
  if (canvasKeysBlocked()) return
  const el = e.target as HTMLElement | null
  if (el?.closest?.('input, textarea, select, [contenteditable], [role="slider"]')) return

  const dir = dirFromKey(e.key)
  if (dir) {
    e.preventDefault()
    const points = collectCanvasPoints()
    if (!points.length) return
    let from = kbKey.value
    if (!from || !points.some((p) => p.id === from)) {
      const curId = store.current?.id
      from = curId ? (points.find((p) => slotMap.get(p.id)?.track.id === curId)?.id ?? null) : null
    }
    const next = pickNeighbor(points, from, dir)
    if (next) selectCanvasKey(next)
    return
  }

  if (e.key === 'Enter') {
    const s = kbKey.value ? slotMap.get(kbKey.value) : null
    if (!s) return
    e.preventDefault()
    store.playFromList(s.track)
  }
}

let ro: ResizeObserver | undefined

onMounted(() => {
  measure()
  hoverX = smoothHoverX = vw / 2
  hoverY = smoothHoverY = vh / 2
  focusSX = vw / 2
  focusSY = vh / 2
  dx = 0
  dy = 0
  reanchorAmbient(Math.floor(Math.random() * 5))
  refresh()
  registerCoverCanvasCamera({ ensureVisible })
  ro = new ResizeObserver(measure)
  if (root.value) ro.observe(root.value)
  root.value?.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onCanvasKeydown)
  startLoop()
  if (!store.tracks.length) void store.loadList(true)
})

onBeforeUnmount(() => {
  registerCoverCanvasCamera(null)
  stopCamAnim()
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  window.removeEventListener('keydown', onCanvasKeydown)
  ro?.disconnect()
  root.value?.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <div
    ref="root"
    class="cc"
    :class="{ grabbing: dragging, dim: dimOthers }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerLeave"
  >
    <i class="cc-vignette" aria-hidden="true" />
    <div class="cc-stage">
      <div
        v-for="s in visibleSlots"
        :key="s.key"
        :ref="(el) => bindSlot(s.key, el)"
        class="cc-card"
        :class="{ current: store.current?.id === s.track.id, kb: kbKey === s.key }"
        :style="{ width: `${s.bw}px`, height: `${s.bh}px` }"
      >
        <CoverTile
          :track="s.track"
          :index="s.spiral"
          :current="store.current?.id === s.track.id"
          :playing="store.isPlaying"
          uniform
          @select="onSelect(s.track)"
        />
      </div>
    </div>

    <div class="cc-hud" aria-live="polite">
      <span v-if="store.listError" class="err">ERR::{{ store.listError }}</span>
      <span v-else-if="hudLabel === 'loading'" class="loading">LOADING<i class="dots" /></span>
      <span v-else-if="hudLabel === 'empty'">NO SIGNAL</span>
      <span v-else class="dim">{{ t('canvas.loop', { n: store.tracks.length }) }}</span>
      <button v-if="store.listError" type="button" class="txt-btn" @click="store.loadList(!store.tracks.length)">
        [RETRY]
      </button>
      <button type="button" class="txt-btn" :title="t('canvas.home')" @click="centerHome">[⌂]</button>
    </div>
  </div>
</template>

<style scoped>
.cc {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
  background:
    radial-gradient(ellipse 85% 75% at 50% 45%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 75%),
    transparent;
}

.cc.grabbing {
  cursor: grabbing;
}

.cc-vignette {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: radial-gradient(
    ellipse 78% 72% at 50% 48%,
    transparent 52%,
    rgba(5, 6, 8, 0.16) 78%,
    rgba(5, 6, 8, 0.42) 100%
  );
}

.cc-stage {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.cc-card {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: center center;
  will-change: transform, opacity;
  border-radius: 4px;
  overflow: hidden;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.45),
    0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
  transition: box-shadow 180ms var(--ease-out, ease);
}

.cc-card.current {
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.5),
    0 0 0 2px var(--accent),
    0 0 24px color-mix(in srgb, var(--accent) 35%, transparent);
}

.cc-card.kb:not(.current) {
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.5),
    0 0 0 2px color-mix(in srgb, var(--accent) 85%, white),
    0 0 20px color-mix(in srgb, var(--accent) 30%, transparent);
  z-index: 88;
}

.cc-card :deep(.tile) {
  display: block;
  width: 100%;
  height: 100%;
}

.cc-card :deep(.tile-inner) {
  position: absolute;
  inset: 0;
  will-change: auto;
}

.cc-card :deep(.cap) {
  display: none;
}

.cc.dim .cc-card:not(.current) :deep(.shade) {
  opacity: 0.28;
}

.cc-hud {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  pointer-events: none;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-dim);
}

.cc-hud .txt-btn {
  pointer-events: auto;
}

.cc-hud .err {
  color: #ff7a7a;
}

.cc-hud .dim {
  opacity: 0.8;
}
</style>
