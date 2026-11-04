import { nextTick, ref } from 'vue'

export type FoldPhase = 'open' | 'closing' | 'closed' | 'opening'

interface FoldOptions {
  /** 折叠轴：x 横向压扁，y 纵向压扁 */
  axis: 'x' | 'y'
  /**
   * 收向哪一侧（仅 axis=x 时有意义）：
   * end=右侧细轨（评论栏），start=左侧细轨（封面信息）
   */
  edge?: 'start' | 'end'
  root: () => HTMLElement | null | undefined
  /** 折叠框里乱码的标题 */
  label: () => string
  get: () => boolean
  set: (v: boolean) => void
  /** 在切换阶段之前调用（此时还能量到起点尺寸）：返回做尺寸过渡的元素和起止关键帧 */
  layout: (closing: boolean) => { el: HTMLElement; keyframes: Keyframe[] } | null
}

const TOTAL = 540
const LAYOUT_MS = 380
const INOUT = 'cubic-bezier(0.65, 0, 0.35, 1)'
const EASE_IN = 'cubic-bezier(0.7, 0, 0.84, 0)'
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
/** 压扁后留一两像素，和亮起的细线重合，看起来是框“变成”了线 */
const SLIVER = 0.004
const GLYPHS = '#%&*+-/<=>?@[]_|\\01ABCDEFXZ'
const GLITCH_OPACITY = [1, 0.35, 0.85, 0.15, 0.5, 0]
const GLITCH_SHIFT = [0, -3, 2, -1, 3, 0]
/** 段数 = 关键帧数 - 1，每一跳正好落在一个关键帧上 */
const GLITCH_STEPS = `steps(${GLITCH_OPACITY.length - 1}, end)`

/** onLeave 取消动画时要放过这些：离场中的 DOM 不再更新，撤掉 fill 会露出中间状态 */
export const FOLD_ANIM = 'hud-fold'

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const at = (ms: number) => ms / TOTAL
const settle = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished.catch(() => undefined)))
const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]

function glitch(out: boolean): Keyframe[] {
  const o = out ? GLITCH_OPACITY : [...GLITCH_OPACITY].reverse()
  return o.map((opacity, i) => ({ opacity, transform: `translateX(${GLITCH_SHIFT[i]}px)` }))
}

/** 逐字乱码：out 从左到右变乱码再消失，in 从左到右由乱码解出原字 */
function scrambleFrame(text: string, out: boolean, p: number) {
  const n = text.length
  let s = ''
  for (let i = 0; i < n; i++) {
    const ch = text[i]
    const k = i / n
    if (ch === ' ') s += ' '
    else if (out) s += p < k * 0.4 ? ch : p < 0.6 + k * 0.4 ? glyph() : ''
    else s += p >= 0.3 + k * 0.7 ? ch : p >= k * 0.5 ? glyph() : ''
  }
  return s
}

function scramble(el: HTMLElement, text: string, out: boolean, ms: number, delay: number, alive: () => boolean) {
  const t0 = performance.now() + delay
  let last = -1
  el.textContent = out ? text : ''
  const tick = (now: number) => {
    if (!alive() || !el.isConnected) return
    const p = Math.min(1, Math.max(0, (now - t0) / ms))
    // 约 25fps 换一次字，每帧换太花
    const step = Math.floor(now / 40)
    if (now >= t0 && (step !== last || p >= 1)) {
      last = step
      el.textContent = scrambleFrame(text, out, p)
    }
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/**
 * HUD 折叠：内容乱码闪出 → 边框压成一条线 → 线滑进边缘变成细轨/细条；展开反向。
 * root 下约定：[data-fold-body] 面板内容、[data-fold-dock] 细轨/细条、.np-fold-box(.np-fold-tag)、.np-fold-line
 */
export function useFold(o: FoldOptions) {
  const phase = ref<FoldPhase>(o.get() ? 'closed' : 'open')
  let runId = 0
  let running: Animation[] = []

  function focusEnd(root: HTMLElement, closed: boolean) {
    // 动画期间用户把焦点移到了别处就不抢回来
    const active = document.activeElement
    if (!root.isConnected || (active && active !== document.body && !root.contains(active))) return
    const el = closed
      ? root.querySelector<HTMLElement>('[data-fold-dock]')
      : root.querySelector<HTMLElement>('[data-fold-body] [data-fold-toggle]')
    el?.focus({ preventScroll: true })
  }

  function run(root: HTMLElement, closing: boolean, lay: ReturnType<FoldOptions['layout']>, id: number) {
    const anims = build(root, closing, lay, id)
    for (const a of anims) a.id = FOLD_ANIM
    return anims
  }

  function build(root: HTMLElement, closing: boolean, lay: ReturnType<FoldOptions['layout']>, id: number) {
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)
    const body = q('[data-fold-body]')
    const dock = q('[data-fold-dock]')
    const box = q('.np-fold-box')
    const line = q('.np-fold-line')
    const tag = q('.np-fold-tag')
    const anims: Animation[] = []
    if (lay) {
      anims.push(
        lay.el.animate(lay.keyframes, {
          duration: LAYOUT_MS,
          delay: closing ? 160 : 0,
          easing: INOUT,
          fill: 'both',
        }),
      )
    }
    if (!body || !dock || !box || !line || !tag) return anims

    const x = o.axis === 'x'
    const start = o.edge === 'start'
    const br = body.getBoundingClientRect()
    const size = x ? br.width : br.height
    box.style[x ? 'width' : 'height'] = `${size}px`
    box.style.transformOrigin = x ? (start ? 'left center' : 'right center') : 'center bottom'
    if (x) {
      line.style.left = ''
      line.style.right = ''
      line.style[start ? 'left' : 'right'] = `${size / 2 - 1}px`
    } else {
      line.style.bottom = `${size / 2 - 1}px`
    }
    const lr = line.getBoundingClientRect()
    const dr = dock.getBoundingClientRect()
    const slide = x ? `translateX(${dr.left - lr.left}px)` : `translateY(${dr.top - lr.top}px)`
    const flat = x ? `scaleX(${SLIVER})` : `scaleY(${SLIVER})`
    const timeline: KeyframeAnimationOptions = { duration: TOTAL, fill: 'both' }
    const alive = () => id === runId

    if (closing) {
      anims.push(
        body.animate(glitch(true), { duration: 170, easing: GLITCH_STEPS, fill: 'both' }),
        box.animate(
          [
            { opacity: 0, transform: 'none' },
            { opacity: 1, transform: 'none', offset: at(60) },
            { opacity: 1, transform: 'none', offset: at(160), easing: EASE_IN },
            { opacity: 1, transform: flat, offset: at(300) },
            { opacity: 0, transform: flat, offset: at(340) },
            { opacity: 0, transform: flat },
          ],
          timeline,
        ),
        line.animate(
          [
            { opacity: 0, transform: 'none' },
            { opacity: 0, transform: 'none', offset: at(250) },
            { opacity: 1, transform: 'none', offset: at(300), easing: INOUT },
            { opacity: 1, transform: slide, offset: at(480) },
            { opacity: 0, transform: slide },
          ],
          timeline,
        ),
        dock.animate(
          [
            { opacity: 0 },
            { opacity: 0, offset: at(440) },
            { opacity: 0.6, offset: at(470) },
            { opacity: 0.2, offset: at(500) },
            { opacity: 1 },
          ],
          timeline,
        ),
      )
      scramble(tag, o.label(), true, 160, 0, alive)
    } else {
      anims.push(
        dock.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 0.7 }, { opacity: 0 }], {
          duration: 80,
          easing: 'steps(3, end)',
          fill: 'both',
        }),
        line.animate(
          [
            { opacity: 0, transform: slide },
            { opacity: 1, transform: slide, offset: at(60), easing: INOUT },
            { opacity: 1, transform: 'none', offset: at(240) },
            { opacity: 1, transform: 'none', offset: at(290) },
            { opacity: 0, transform: 'none', offset: at(330) },
            { opacity: 0, transform: 'none' },
          ],
          timeline,
        ),
        box.animate(
          [
            { opacity: 0, transform: flat },
            { opacity: 0, transform: flat, offset: at(230) },
            { opacity: 1, transform: flat, offset: at(240), easing: EASE_OUT },
            { opacity: 1, transform: 'none', offset: at(380) },
            { opacity: 1, transform: 'none', offset: at(440) },
            { opacity: 0, transform: 'none' },
          ],
          timeline,
        ),
        body.animate(glitch(false), { duration: 180, delay: 360, easing: GLITCH_STEPS, fill: 'both' }),
      )
      scramble(tag, o.label(), false, 150, 360, alive)
    }
    return anims
  }

  async function toggle() {
    if (phase.value === 'closing' || phase.value === 'opening') return
    const closing = phase.value === 'open'
    const id = ++runId
    o.set(closing)
    const root = o.root()
    // 切阶段后内容变 inert，焦点会被浏览器丢到 body，要先记下
    const refocus = !!root?.contains(document.activeElement)
    const end: FoldPhase = closing ? 'closed' : 'open'

    if (!root || reduceMotion) {
      phase.value = end
      await nextTick()
      if (!root) return
      root
        .querySelector(closing ? '[data-fold-dock]' : '[data-fold-body]')
        ?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 })
      if (refocus) focusEnd(root, closing)
      return
    }

    const lay = o.layout(closing)
    phase.value = closing ? 'closing' : 'opening'
    await nextTick()
    const anims = run(root, closing, lay, id)
    running = anims
    await settle(anims)
    running = []
    phase.value = end
    // 终态的 CSS 生效后再撤掉 fill，中间不留一帧空档。
    // 离场中的详情页（或已被替换的评论栏）不会再被 Vue 更新，停在中间阶段的类上，保留 fill 才不会弹回去
    await nextTick()
    if (!root.matches(closing ? '.closed' : ':not(.off)')) return
    anims.forEach((a) => a.cancel())
    const tag = root.querySelector('.np-fold-tag')
    if (tag) tag.textContent = ''
    if (refocus) focusEnd(root, closing)
  }

  /** 面板容器被换掉（例如评论栏消失）时立即结束本轮：px 关键帧不能再压在新布局上，新容器也要直接落到终态 */
  function stop() {
    running.forEach((a) => a.cancel())
  }

  return { phase, toggle, stop }
}
