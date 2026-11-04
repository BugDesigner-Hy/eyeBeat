import { computed, ref, type Ref } from 'vue'

export type MobileDetailView = 'play' | 'lrc' | 'cmt'

const EDGE = 24
const SLOP = 8
const SETTLE_MS = 380

/**
 * 手机详情：上滑歌词 / 右滑评论 / 下滑关闭（关闭仍由外壳处理）。
 * lrcP、cmtP 互斥，都在 0..1。
 */
export function useMobileDetail(opts: {
  hasComments: Ref<boolean>
  /** 歌词列表滚动容器；在顶部下拉才回封面 */
  lyricsEl: () => HTMLElement | null | undefined
  reduceMotion: boolean
}) {
  const lrcP = ref(0)
  const cmtP = ref(0)
  const dragging = ref(false)

  const view = computed<MobileDetailView>(() => {
    if (cmtP.value >= 0.5) return 'cmt'
    if (lrcP.value >= 0.5) return 'lrc'
    return 'play'
  })

  /** 页码下划线：play=0，lrc=1，cmt=2，跟手插值 */
  const pos = computed(() => lrcP.value + cmtP.value * 2)

  let snapRaf = 0
  let gesture:
    | {
        id: number
        x0: number
        y0: number
        mode: 'undecided' | 'lrc' | 'cmt' | 'lrc-back' | 'cmt-back' | 'ignore'
        base: number
        lastX: number
        lastY: number
        lastT: number
        vx: number
        vy: number
      }
    | null = null

  function cancelAnim() {
    if (snapRaf) cancelAnimationFrame(snapRaf)
    snapRaf = 0
  }

  function snap(target: { lrc: number; cmt: number }, ms = SETTLE_MS) {
    cancelAnim()
    const fromL = lrcP.value
    const fromC = cmtP.value
    if (fromL === target.lrc && fromC === target.cmt) return
    if (opts.reduceMotion || ms <= 0) {
      lrcP.value = target.lrc
      cmtP.value = target.cmt
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      // 近似 EASE：末端减速
      const e = 1 - (1 - k) ** 3
      lrcP.value = fromL + (target.lrc - fromL) * e
      cmtP.value = fromC + (target.cmt - fromC) * e
      if (k < 1) snapRaf = requestAnimationFrame(tick)
      else {
        snapRaf = 0
        lrcP.value = target.lrc
        cmtP.value = target.cmt
      }
    }
    snapRaf = requestAnimationFrame(tick)
  }

  function go(v: MobileDetailView) {
    if (v === 'cmt' && !opts.hasComments.value) v = 'play'
    cancelAnim()
    if (v === 'play') snap({ lrc: 0, cmt: 0 })
    else if (v === 'lrc') snap({ lrc: 1, cmt: 0 })
    else snap({ lrc: 0, cmt: 1 })
  }

  /** 无评论时若停在评论，弹回封面 */
  function ensureComments() {
    if (!opts.hasComments.value && cmtP.value > 0) go('play')
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, [role="slider"], [data-no-drag]')) return
    cancelAnim()
    const now = performance.now()
    gesture = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      mode: 'undecided',
      base: 0,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: now,
      vx: 0,
      vy: 0,
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!gesture || e.pointerId !== gesture.id) return
    const now = performance.now()
    const dt = Math.max(1, now - gesture.lastT)
    gesture.vx = (e.clientX - gesture.lastX) / dt
    gesture.vy = (e.clientY - gesture.lastY) / dt
    gesture.lastX = e.clientX
    gesture.lastY = e.clientY
    gesture.lastT = now
    const dx = e.clientX - gesture.x0
    const dy = e.clientY - gesture.y0

    if (gesture.mode === 'undecided') {
      if (Math.hypot(dx, dy) < SLOP) return
      const absX = Math.abs(dx)
      const absY = Math.abs(dy)
      const atPlay = lrcP.value < 0.05 && cmtP.value < 0.05
      const atLrc = lrcP.value > 0.95
      const atCmt = cmtP.value > 0.95

      if (atPlay) {
        if (absY >= absX && dy < 0) {
          gesture.mode = 'lrc'
          gesture.base = lrcP.value
        } else if (absX > absY && dx > 0 && opts.hasComments.value && gesture.x0 > EDGE) {
          gesture.mode = 'cmt'
          gesture.base = cmtP.value
        } else {
          // 下滑关闭等交给外壳；右缘系统返回
          gesture.mode = 'ignore'
          return
        }
      } else if (atLrc) {
        const ly = opts.lyricsEl()
        const top = !ly || ly.scrollTop <= 0
        if (top && absY >= absX && dy > 0) {
          gesture.mode = 'lrc-back'
          gesture.base = lrcP.value
        } else {
          gesture.mode = 'ignore'
          return
        }
      } else if (atCmt) {
        if (absX > absY && dx < 0) {
          gesture.mode = 'cmt-back'
          gesture.base = cmtP.value
        } else {
          gesture.mode = 'ignore'
          return
        }
      } else {
        // 过渡中途：按主导轴继续
        if (lrcP.value > cmtP.value) {
          gesture.mode = dy > 0 ? 'lrc-back' : 'lrc'
          gesture.base = lrcP.value
        } else {
          gesture.mode = dx < 0 ? 'cmt-back' : 'cmt'
          gesture.base = cmtP.value
        }
      }
      dragging.value = true
      try {
        ;(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    if (gesture.mode === 'ignore') return
    const h = window.innerHeight || 1
    const w = window.innerWidth || 1
    if (gesture.mode === 'lrc') {
      cmtP.value = 0
      lrcP.value = Math.min(1, Math.max(0, gesture.base + -dy / (h * 0.55)))
    } else if (gesture.mode === 'lrc-back') {
      cmtP.value = 0
      lrcP.value = Math.min(1, Math.max(0, gesture.base - dy / (h * 0.55)))
    } else if (gesture.mode === 'cmt') {
      lrcP.value = 0
      cmtP.value = Math.min(1, Math.max(0, gesture.base + dx / (w * 0.55)))
    } else if (gesture.mode === 'cmt-back') {
      lrcP.value = 0
      cmtP.value = Math.min(1, Math.max(0, gesture.base + dx / (w * 0.55)))
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!gesture || e.pointerId !== gesture.id) return
    const mode = gesture.mode
    const { vx, vy } = gesture
    gesture = null
    dragging.value = false
    if (mode === 'undecided' || mode === 'ignore') return

    // px/ms：约 0.7 ≈ 快速甩
    if (mode === 'lrc' || mode === 'lrc-back') {
      const goLrc = lrcP.value > 0.45 || (mode === 'lrc' && -vy > 0.7) || (mode === 'lrc-back' && vy < -0.7)
      snap({ lrc: goLrc ? 1 : 0, cmt: 0 })
    } else {
      const goCmt = cmtP.value > 0.45 || (mode === 'cmt' && vx > 0.7) || (mode === 'cmt-back' && vx < -0.7)
      snap({ lrc: 0, cmt: goCmt ? 1 : 0 })
    }
  }

  function reset(to: MobileDetailView = 'play') {
    cancelAnim()
    if (to === 'lrc') {
      lrcP.value = 1
      cmtP.value = 0
    } else if (to === 'cmt' && opts.hasComments.value) {
      lrcP.value = 0
      cmtP.value = 1
    } else {
      lrcP.value = 0
      cmtP.value = 0
    }
  }

  return { lrcP, cmtP, pos, view, dragging, go, reset, ensureComments, onPointerDown, onPointerMove, onPointerUp }
}
