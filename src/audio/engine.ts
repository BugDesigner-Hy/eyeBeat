import { createBitcrusher } from './bitcrusher'
import { EQ_BANDS } from './eq'

export type EngineEvent =
  | 'play'
  | 'pause'
  | 'waiting'
  | 'playing'
  | 'timeupdate'
  | 'durationchange'
  | 'ended'
  | 'error'
  /** 距离结尾不足淡入淡出时长，交由上层切到下一首 */
  | 'nearend'

const FORWARDED = ['play', 'pause', 'waiting', 'playing', 'timeupdate', 'durationchange', 'ended', 'error'] as const
const FADE_STEPS = 32
const FADE_TICK_MS = 30

interface Deck {
  el: HTMLAudioElement
  gain: GainNode | null
  fade: number
  /** 递增以作废尚未执行的淡化回调 */
  fadeToken: number
  timer: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** 等功率曲线，交叉淡化时总响度不塌陷 */
function equalPower(from: number, to: number, p: number) {
  const t = to > from ? Math.sin((p * Math.PI) / 2) : 1 - Math.cos((p * Math.PI) / 2)
  return from + (to - from) * t
}

/**
 * 双 deck 播放引擎。接入 Web Audio 后信号链为：
 * deck gain → 10 段 EQ → [bitcrusher] → master → analyser → destination
 * 未接入（音源无 CORS）时，淡化与音量直接作用于 audio.volume。
 */
export class AudioEngine {
  analyser: AnalyserNode | null = null

  private readonly decks: [Deck, Deck]
  private activeIndex = 0
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private eqNodes: BiquadFilterNode[] = []
  private crusher: AudioWorkletNode | null = null
  private listener: (type: EngineEvent) => void = () => {}

  private volume = 1
  private muted = false
  private loop = false
  private eqGains: number[] = EQ_BANDS.map(() => 0)
  private bitcrush = false
  private nearEndSec = 0
  private nearEndFired = false

  constructor(private readonly cors: boolean) {
    this.decks = [this.createDeck(), this.createDeck()]
  }

  get audio(): HTMLAudioElement {
    return this.decks[this.activeIndex].el
  }

  get hasGraph(): boolean {
    return this.ctx !== null
  }

  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null
  }

  on(listener: (type: EngineEvent) => void) {
    this.listener = listener
  }

  /** 需在用户手势中调用（AudioContext 自动播放策略） */
  ensureGraph(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return true
    }
    if (!this.cors) return false
    try {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.78

      const eq = EQ_BANDS.map((freq, i) => {
        const node = ctx.createBiquadFilter()
        node.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
        node.frequency.value = freq
        node.Q.value = 1.1
        node.gain.value = this.eqGains[i] ?? 0
        return node
      })
      eq.reduce((a, b) => (a.connect(b), b))

      for (const deck of this.decks) {
        deck.gain = ctx.createGain()
        deck.gain.gain.value = deck.fade
        ctx.createMediaElementSource(deck.el).connect(deck.gain)
        deck.gain.connect(eq[0])
        deck.el.volume = 1
        deck.el.muted = false
      }
      master.connect(analyser)
      analyser.connect(ctx.destination)

      this.ctx = ctx
      this.master = master
      this.eqNodes = eq
      this.analyser = analyser
      this.applyVolume()
      void this.route()
      return true
    } catch {
      return false
    }
  }

  async load(url: string, fadeSec: number): Promise<void> {
    const prev = this.decks[this.activeIndex]
    const crossfade = fadeSec > 0 && !prev.el.paused && !!prev.el.getAttribute('src')
    const next = crossfade ? this.decks[1 - this.activeIndex] : prev
    this.activeIndex = this.decks.indexOf(next)
    this.nearEndFired = false

    this.cancelFade(next)
    next.el.loop = this.loop
    next.el.src = url
    if (crossfade) {
      this.setFade(next, 0)
      this.fade(prev, 0, fadeSec, () => this.stop(prev))
    } else {
      this.setFade(next, 1)
    }
    await next.el.play()
    if (crossfade) this.fade(next, 1, fadeSec)
  }

  play() {
    return this.audio.play()
  }

  pause() {
    this.audio.pause()
  }

  seek(time: number) {
    this.audio.currentTime = time
  }

  setVolume(v: number) {
    this.volume = clamp01(v)
    this.applyVolume()
  }

  setMuted(m: boolean) {
    this.muted = m
    this.applyVolume()
  }

  setLoop(loop: boolean) {
    this.loop = loop
    this.audio.loop = loop
  }

  setCrossfade(sec: number) {
    this.nearEndSec = Math.max(0, sec)
  }

  setEq(gains: number[]) {
    this.eqGains = [...gains]
    const now = this.ctx?.currentTime ?? 0
    this.eqNodes.forEach((n, i) => n.gain.setTargetAtTime(gains[i] ?? 0, now, 0.05))
  }

  setBitcrush(on: boolean) {
    this.bitcrush = on
    void this.route()
  }

  /* ---------------- 内部 ---------------- */

  private createDeck(): Deck {
    const el = new Audio()
    el.preload = 'auto'
    if (this.cors) el.crossOrigin = 'anonymous'
    const deck: Deck = { el, gain: null, fade: 1, fadeToken: 0, timer: 0 }
    for (const type of FORWARDED) {
      el.addEventListener(type, () => {
        if (el !== this.audio) return
        this.listener(type)
        if (type === 'timeupdate') this.checkNearEnd()
      })
    }
    return deck
  }

  private checkNearEnd() {
    const el = this.audio
    if (!this.nearEndSec || this.loop || this.nearEndFired || el.paused) return
    const d = el.duration
    if (!Number.isFinite(d) || d < this.nearEndSec * 3) return
    if (d - el.currentTime <= this.nearEndSec) {
      this.nearEndFired = true
      this.listener('nearend')
    }
  }

  private async route() {
    const ctx = this.ctx
    const tail = this.eqNodes[this.eqNodes.length - 1]
    if (!ctx || !tail || !this.master) return
    if (this.bitcrush && !this.crusher) {
      try {
        this.crusher = await createBitcrusher(ctx)
      } catch {
        this.bitcrush = false
      }
    }
    tail.disconnect()
    this.crusher?.disconnect()
    if (this.bitcrush && this.crusher) {
      tail.connect(this.crusher)
      this.crusher.connect(this.master)
    } else {
      tail.connect(this.master)
    }
  }

  private applyVolume() {
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : this.volume
      return
    }
    for (const deck of this.decks) {
      deck.el.volume = clamp01(this.volume * deck.fade)
      deck.el.muted = this.muted
    }
  }

  private setFade(deck: Deck, v: number) {
    deck.fade = v
    if (deck.gain && this.ctx) {
      deck.gain.gain.cancelScheduledValues(this.ctx.currentTime)
      deck.gain.gain.value = v
    } else {
      deck.el.volume = clamp01(this.volume * v)
    }
  }

  private cancelFade(deck: Deck) {
    deck.fadeToken++
    clearInterval(deck.timer)
  }

  private fade(deck: Deck, to: number, sec: number, done?: () => void) {
    this.cancelFade(deck)
    const token = deck.fadeToken
    const from = deck.fade
    const finish = () => {
      if (token !== deck.fadeToken) return
      deck.fade = to
      done?.()
    }

    // 走音频时钟，后台标签页里也能平滑完成
    if (deck.gain && this.ctx) {
      const param = deck.gain.gain
      const t0 = this.ctx.currentTime
      const curve = Float32Array.from({ length: FADE_STEPS }, (_, i) => equalPower(from, to, i / (FADE_STEPS - 1)))
      param.cancelScheduledValues(t0)
      param.setValueCurveAtTime(curve, t0, sec)
      window.setTimeout(finish, sec * 1000 + 20)
      return
    }

    const start = performance.now()
    deck.timer = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / (sec * 1000))
      deck.fade = equalPower(from, to, p)
      deck.el.volume = clamp01(this.volume * deck.fade)
      if (p >= 1) {
        clearInterval(deck.timer)
        finish()
      }
    }, FADE_TICK_MS)
  }

  private stop(deck: Deck) {
    deck.el.pause()
    deck.el.removeAttribute('src')
    deck.el.load()
  }
}
