const SAMPLE = 32
const BINS = 36
const MIN_WEIGHT = 6
/** 输出统一的饱和度 / 亮度，保证在深色背景上的对比度和整体风格一致 */
const OUT_SAT = 0.88
const OUT_LIGHT = 0.7

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** 取封面中权重最高的色相；画面过于灰暗时返回 null */
function dominantAccent(img: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE)

  const bins = new Float32Array(BINS)
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (s < 0.22 || l < 0.12 || l > 0.9) continue
    bins[Math.floor(h / (360 / BINS)) % BINS] += s * (1 - Math.abs(l - 0.5) * 1.6)
  }

  let best = -1
  let bestScore = 0
  for (let i = 0; i < BINS; i++) {
    const score = bins[i] + 0.5 * (bins[(i + BINS - 1) % BINS] + bins[(i + 1) % BINS])
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }
  if (best < 0 || bestScore < MIN_WEIGHT) return null
  return hslToHex((best + 0.5) * (360 / BINS), OUT_SAT, OUT_LIGHT)
}

const cache = new Map<string, string | null>()

export async function extractAccent(key: string, urls: string[]): Promise<string | null> {
  if (cache.has(key)) return cache.get(key) ?? null
  for (const url of urls) {
    try {
      const color = dominantAccent(await loadImage(url))
      cache.set(key, color)
      return color
    } catch {
      // 换下一个镜像
    }
  }
  return null
}
