const PROCESSOR = 'himusic-bitcrusher'

const source = `
class Bitcrusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 6, minValue: 1, maxValue: 16 },
      { name: 'reduction', defaultValue: 4, minValue: 1, maxValue: 32 },
    ]
  }
  constructor() {
    super()
    this.hold = []
    this.count = 0
  }
  process(inputs, outputs, params) {
    const input = inputs[0]
    const output = outputs[0]
    const step = Math.pow(0.5, params.bits[0] - 1)
    const reduction = Math.max(1, Math.round(params.reduction[0]))
    const frames = output[0] ? output[0].length : 0
    for (let ch = 0; ch < output.length; ch++) {
      const inp = input[ch]
      const out = output[ch]
      if (!inp) { out.fill(0); continue }
      let held = this.hold[ch] || 0
      for (let i = 0; i < frames; i++) {
        if ((this.count + i) % reduction === 0) held = step * Math.round(inp[i] / step)
        out[i] = held
      }
      this.hold[ch] = held
    }
    this.count += frames
    return true
  }
}
registerProcessor('${PROCESSOR}', Bitcrusher)
`

const loaded = new WeakMap<BaseAudioContext, Promise<void>>()

/** 8-bit 降质：位深量化 + 采样保持降采样 */
export async function createBitcrusher(ctx: AudioContext, bits = 6, reduction = 4): Promise<AudioWorkletNode> {
  let ready = loaded.get(ctx)
  if (!ready) {
    const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
    ready = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    loaded.set(ctx, ready)
  }
  await ready
  return new AudioWorkletNode(ctx, PROCESSOR, { parameterData: { bits, reduction } })
}
