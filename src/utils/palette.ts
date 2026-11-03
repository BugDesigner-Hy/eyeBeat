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

function samplePixels(img: HTMLImageElement): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
  return ctx.getImageData(0, 0, SAMPLE, SAMPLE).data
}

/** 取封面中权重最高的色相；画面过于灰暗时返回 null */
function dominantAccent(img: HTMLImageElement): string | null {
  const data = samplePixels(img)
  if (!data) return null

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

const PALETTE_ITER = 6
const paletteCache = new Map<string, string[] | null>()

type Rgb = [number, number, number]

const luma = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** 简单 k-means：按亮度均匀取初始中心，按簇大小降序输出原始颜色 */
function kmeansPalette(img: HTMLImageElement, k: number): string[] | null {
  const data = samplePixels(img)
  if (!data) return null
  const px: Rgb[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) px.push([data[i], data[i + 1], data[i + 2]])
  }
  if (px.length < k) return null
  const sorted = [...px].sort((a, b) => luma(a) - luma(b))
  let centers: Rgb[] = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) * sorted.length) / k)]] as Rgb)
  let counts: number[] = []
  for (let it = 0; it < PALETTE_ITER; it++) {
    const sums: Rgb[] = centers.map(() => [0, 0, 0])
    counts = centers.map(() => 0)
    for (const p of px) {
      let best = 0
      let bestD = Infinity
      centers.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
        if (d < bestD) {
          bestD = d
          best = j
        }
      })
      sums[best][0] += p[0]
      sums[best][1] += p[1]
      sums[best][2] += p[2]
      counts[best]++
    }
    centers = centers.map((c, j) => (counts[j] ? (sums[j].map((v) => v / counts[j]) as Rgb) : c))
  }
  return centers
    .map((c, j) => ({ c, n: counts[j] }))
    .sort((a, b) => b.n - a.n)
    .map(({ c }) => toHex(c))
}

export async function extractPalette(key: string, urls: string[], count = 5): Promise<string[] | null> {
  if (paletteCache.has(key)) return paletteCache.get(key) ?? null
  for (const url of urls) {
    try {
      const colors = kmeansPalette(await loadImage(url), count)
      paletteCache.set(key, colors)
      return colors
    } catch {
      // 换下一个镜像
    }
  }
  return null
}
