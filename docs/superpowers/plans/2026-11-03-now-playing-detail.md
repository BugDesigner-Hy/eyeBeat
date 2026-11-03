# 正在播放详情页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击播放栏左侧封面/歌名，从缩略图飞出一个全屏「正在播放」详情页，展示大封面、基础信息、扩展元数据、技术遥测、嵌入歌词和接下来播放。

**Architecture:** 数据层给 `MusicProvider` 增加可选的 `getDetail`，播放器 store 暴露播放地址信息、采样率与 `upcoming()`；新的 `detail` store 负责按曲目缓存扩展元数据。界面由常驻挂载的 `NowPlaying.vue` 承担外壳、布局、拖拽关闭和开合动画（`<Transition :css="false">` + Web Animations），四个子组件分别负责信息、遥测、歌词、队列。信息块的组装动画用全局 `.np-in` 类在挂载时以 CSS 动画完成。

**Tech Stack:** Vue 3.5（`<script setup>`）、Pinia、TypeScript 5.9（strict、noUnusedLocals/Parameters）、Vite 8、Web Animations API。

**Spec:** `docs/superpowers/specs/2026-11-03-now-playing-detail-design.md`

## Global Constraints

- 包管理只用 pnpm（npm 在本机不可用）。类型检查命令：`pnpm exec vue-tsc --noEmit`；构建：`pnpm build`。
- 项目没有测试框架；每个任务用类型检查 + 浏览器中 `Runtime.evaluate` 脚本验证（开发服务器 `http://localhost:5173`，已在运行；若未运行执行 `pnpm dev`）。
- 在浏览器中访问 Pinia：`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('<store id>')`。
- 修改 Pinia store 后 Vite 热更新可能把页面弄空，验证前先 `location.reload()` 并等待 3 秒。
- 缓动沿用全局变量：`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`、`--ease-in: cubic-bezier(0.7, 0, 0.84, 0)`；WAAPI 中直接写这两个字面值。
- 层级：详情页外壳 `z-index: 55`，扫描线 `56`，FX 面板 `57`，飞行封面替身 `58`。顶栏为 50，播放栏与胶囊为 40。
- 网易云登录凭证只保存在浏览器 localStorage，不要写进任何 env 或代码。
- 代码注释只写代码本身表达不了的约束，用中文，与现有风格一致。
- `prefers-reduced-motion: reduce` 时只做 200ms 淡入淡出。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `src/api/types.ts`（改） | `TrackStat`、`TrackDetail`、`StreamSource.codec/bitrate`、`MusicProvider.getDetail?` |
| `src/api/providers/netease/index.ts`（改） | 网易云 `getDetail`，`getStream` 补编码与码率 |
| `src/api/providers/audius.ts`（改） | Audius `getDetail`，`getStream` 补编码 |
| `src/audio/engine.ts`（改） | `sampleRate` getter |
| `src/stores/player.ts`（改） | `streamInfo`、`sampleRate`、`upcoming(n)` |
| `src/utils/palette.ts`（改） | `extractPalette` |
| `src/components/Spectrum.vue`（改） | 可选 `bars` / `rows` |
| `src/stores/ui.ts`（改） | `detailOpen`、`coverLifted`、`toggleDetail` |
| `src/stores/detail.ts`（新） | 扩展元数据加载与缓存 |
| `src/styles/main.css`（改） | `.np-label`、`.np-in`、`html.detail-open` |
| `src/components/DetailInfo.vue`（新） | 标题、歌手、专辑、标签、统计计数、简介 |
| `src/components/DetailTelemetry.vue`（新） | 编码、码率、采样率、频谱、色板 |
| `src/components/DetailLyrics.vue`（新） | 嵌入式滚动歌词 |
| `src/components/UpNext.vue`（新） | 接下来播放 |
| `src/components/NowPlaying.vue`（新） | 外壳、布局、拖拽关闭、开合动画 |
| `src/components/PlayerBar.vue`（改） | 入口点击、缩略图标记与隐藏 |
| `src/components/FxPanel.vue`（改） | `z-index: 57` |
| `src/App.vue`（改） | 挂载 `NowPlaying`、Esc 优先级、隐藏歌词面板、滚动锁、氛围模式排除 |

---

### Task 1: 数据层——扩展元数据与播放地址信息

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/providers/netease/index.ts`
- Modify: `src/api/providers/audius.ts`

**Interfaces:**
- Produces:
  - `interface TrackStat { label: string; value: number }`
  - `interface TrackDetail { released?: string; aliases?: string[]; genre?: string; mood?: string; tags?: string[]; description?: string; quality?: string[]; stats: TrackStat[] }`
  - `StreamSource.codec?: string`、`StreamSource.bitrate?: number`（kbps）
  - `MusicProvider.getDetail?(track: Track): Promise<TrackDetail>`

- [ ] **Step 1: 扩展类型**

在 `src/api/types.ts` 的 `LyricWord` 接口之前插入：

```ts
export interface TrackStat {
  /** 英文短标签，例如 PLAYS / LIKES / COMMENTS / HEAT */
  label: string
  value: number
}

/** 详情页用的扩展元数据，字段按音乐源能力选填 */
export interface TrackDetail {
  /** YYYY-MM-DD */
  released?: string
  aliases?: string[]
  genre?: string
  mood?: string
  tags?: string[]
  description?: string
  /** 音质等级，从低到高，例如 ['STD', 'HQ', 'SQ', 'HR'] */
  quality?: string[]
  stats: TrackStat[]
}
```

`StreamSource` 改为：

```ts
export interface StreamSource {
  url: string
  /** 只返回了试听片段（未登录 / 非会员） */
  preview?: boolean
  /** 试听片段在原曲中的起点（秒），用于对齐歌词 */
  offset?: number
  /** 大写编码名，例如 MP3 / FLAC */
  codec?: string
  /** kbps */
  bitrate?: number
}
```

`MusicProvider` 中 `getStream` 之后加：

```ts
  /** 详情页的扩展元数据；不支持的音乐源不实现 */
  getDetail?(track: Track): Promise<TrackDetail>
```

- [ ] **Step 2: 网易云实现**

在 `src/api/providers/netease/index.ts`：

1. 第 2 行 import 改为：

```ts
import type { Lyrics, LyricsCandidate, LyricsSource, MusicProvider, PageOptions, Shelf, Track, TrackDetail, TrackStat } from '../../types'
```

2. `SongUrlRes` 改为：

```ts
interface SongUrlRes {
  data?: {
    url: string | null
    type?: string | null
    /** bps */
    br?: number
    freeTrialInfo?: { start?: number; end?: number } | null
  }[]
}
```

3. 在 `SongUrlRes` 之后加：

```ts
type QualityKey = 'l' | 'm' | 'h' | 'sq' | 'hr'

interface SongDetailRes {
  songs?: (NeteaseSong &
    Partial<Record<QualityKey, { br?: number } | null>> & {
      alia?: string[]
      tns?: string[]
      pop?: number
      /** 毫秒时间戳 */
      publishTime?: number
    })[]
}

const QUALITY: [QualityKey, string][] = [
  ['l', 'STD'],
  ['m', 'STD'],
  ['h', 'HQ'],
  ['sq', 'SQ'],
  ['hr', 'HR'],
]

/** 发行时间是北京时间零点，按本地日期格式化，避免 toISOString 退到前一天 */
function localDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
```

4. `getStream` 的 return 改为：

```ts
    return {
      url: https(item.url),
      preview: !!trial,
      offset: trial?.start ?? 0,
      codec: item.type ? item.type.toUpperCase() : undefined,
      bitrate: item.br ? Math.round(item.br / 1000) : undefined,
    }
```

5. 在 `neteaseProvider` 的 `getStream` 之后加：

```ts
  async getDetail(track): Promise<TrackDetail> {
    const [detail, comments] = await Promise.all([
      ncm<SongDetailRes>('/song/detail', { ids: track.id }),
      ncm<{ total?: number }>('/comment/music', { id: track.id, limit: 1 }).catch(() => null),
    ])
    const s = detail.songs?.[0]
    const stats: TrackStat[] = []
    if (typeof s?.pop === 'number') stats.push({ label: 'HEAT', value: s.pop })
    if (typeof comments?.total === 'number') stats.push({ label: 'COMMENTS', value: comments.total })
    const quality = [...new Set(QUALITY.filter(([k]) => s?.[k]).map(([, label]) => label))]
    const aliases = [...(s?.alia ?? []), ...(s?.tns ?? [])].filter(Boolean)
    return {
      released: s?.publishTime ? localDate(s.publishTime) : undefined,
      aliases: aliases.length ? aliases : undefined,
      quality: quality.length ? quality : undefined,
      stats,
    }
  },
```

- [ ] **Step 3: Audius 实现**

在 `src/api/providers/audius.ts`：

1. import 改为：

```ts
import type { MusicProvider, Track, TrackDetail, TrackStat } from '../types'
```

2. 在 `AudiusTrack` 接口之后加：

```ts
interface AudiusTrackDetail extends AudiusTrack {
  release_date?: string | null
  mood?: string | null
  /** 逗号分隔 */
  tags?: string | null
  description?: string | null
  play_count?: number
  favorite_count?: number
  repost_count?: number
}

function dateOnly(s?: string | null): string | undefined {
  if (!s) return undefined
  const m = /^\d{4}-\d{2}-\d{2}/.exec(s)
  if (m) return m[0]
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}
```

3. `getStream` 改为：

```ts
  async getStream(track) {
    return { url: `${BASE}/tracks/${encodeURIComponent(track.id)}/stream?${qs({ app_name: APP_NAME })}`, codec: 'MP3' }
  },
```

4. 其后加：

```ts
  async getDetail(track): Promise<TrackDetail> {
    const { data } = await getJson<{ data?: AudiusTrackDetail }>(
      `${BASE}/tracks/${encodeURIComponent(track.id)}?${qs({ app_name: APP_NAME })}`,
    )
    if (!data) throw new Error('曲目不存在')
    const stats: TrackStat[] = []
    for (const [label, value] of [
      ['PLAYS', data.play_count],
      ['LIKES', data.favorite_count],
      ['REPOSTS', data.repost_count],
    ] as const) {
      if (typeof value === 'number') stats.push({ label, value })
    }
    const tags = data.tags
      ?.split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    return {
      released: dateOnly(data.release_date),
      genre: data.genre || undefined,
      mood: data.mood || undefined,
      tags: tags?.length ? tags : undefined,
      description: data.description?.trim() || undefined,
      stats,
    }
  },
```

- [ ] **Step 4: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 退出码 0、无输出。

- [ ] **Step 5: 浏览器验证两个来源**

在 `http://localhost:5173` 执行（`Runtime.evaluate`，`awaitPromise: true`）：

```js
(async () => {
  const { neteaseProvider } = await import('/src/api/providers/netease/index.ts')
  const { audiusProvider } = await import('/src/api/providers/audius.ts')
  const ne = (await neteaseProvider.getShelf('hot', { limit: 1 }))[0]
  const au = (await audiusProvider.getShelf('week', { limit: 1 }))[0]
  return {
    ne: await neteaseProvider.getDetail(ne),
    neStream: await neteaseProvider.getStream(ne),
    au: await audiusProvider.getDetail(au),
  }
})()
```

Expected：`ne.stats` 含 `HEAT` 与 `COMMENTS`，`ne.released` 形如 `2024-05-01`；`neStream.codec` 为 `MP3` 或 `FLAC` 且 `bitrate` 为数字；`au.stats` 含 `PLAYS`/`LIKES`/`REPOSTS`。

- [ ] **Step 6: Commit**

```bash
git add src/api
git commit -m "feat(api): track detail metadata and stream codec info"
```

---

### Task 2: 播放器与工具——遥测数据、队列预览、色板、频谱尺寸

**Files:**
- Modify: `src/audio/engine.ts`
- Modify: `src/stores/player.ts`
- Modify: `src/utils/palette.ts`
- Modify: `src/components/Spectrum.vue`

**Interfaces:**
- Consumes: `StreamSource`（Task 1）
- Produces:
  - `engine.sampleRate: number | null`
  - player store：`streamInfo: ShallowRef<StreamSource | null>`、`sampleRate: ComputedRef<number | null>`、`upcoming(n: number): Track[]`
  - `extractPalette(key: string, urls: string[], count?: number): Promise<string[] | null>`
  - `Spectrum` 新属性 `bars?: number`（默认 16）、`rows?: number`（默认 7）

- [ ] **Step 1: 引擎采样率**

在 `src/audio/engine.ts` 的 `get hasGraph()` 之后加：

```ts
  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null
  }
```

- [ ] **Step 2: 播放器 store**

在 `src/stores/player.ts`：

1. import 改为 `import type { StreamSource, Track } from '../api/types'`。
2. 在 `const analyser = shallowRef<AnalyserNode | null>(null)` 之后加：

```ts
  /** 当前曲目的播放地址信息（编码、码率等） */
  const streamInfo = shallowRef<StreamSource | null>(null)
  /** 建图后才有；依赖 analyser 以便建图时刷新 */
  const sampleRate = computed(() => (analyser.value ? engine.sampleRate : null))
```

3. `play()` 中 `streamOffset.value = 0` 之后加一行 `streamInfo.value = null`；`loaded = true` 之后加一行 `streamInfo.value = stream`。
4. 在 `const next = () => step(1)` 之前加：

```ts
  /** 详情页的「接下来播放」；随机模式下无法预知，返回空 */
  function upcoming(n: number): Track[] {
    const list = queue.value
    if (mode.value === 'shuffle' || list.length < 2) return []
    const idx = list.findIndex((t) => t.id === current.value?.id)
    const out: Track[] = []
    for (let k = 1; k <= Math.min(n, list.length - 1); k++) out.push(list[(idx + k + list.length) % list.length])
    return out
  }
```

5. return 对象中 `analyser,` 之后加 `streamInfo,`、`sampleRate,`；`next,` 之前加 `upcoming,`。

- [ ] **Step 3: 色板提取**

把 `src/utils/palette.ts` 中 `dominantAccent` 函数开头的取样代码抽成函数，并新增 k-means 色板。`dominantAccent` 之前加：

```ts
function samplePixels(img: HTMLImageElement): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
  return ctx.getImageData(0, 0, SAMPLE, SAMPLE).data
}
```

`dominantAccent` 的前 7 行（从 `const canvas` 到 `const { data } = ...`）替换为：

```ts
  const data = samplePixels(img)
  if (!data) return null
```

文件末尾加：

```ts
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
```

- [ ] **Step 4: 频谱尺寸参数**

`src/components/Spectrum.vue` 的 `<script setup>` 开头到 `const levels` 一行替换为：

```ts
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { accent } from '../theme'

const props = withDefaults(
  defineProps<{ analyser: AnalyserNode | null; playing: boolean; bars?: number; rows?: number }>(),
  { bars: 16, rows: 7 },
)

const BARS = props.bars
const BAR_W = 4
const CELL_H = 3
const GAP = 1
const ROWS = props.rows
const WIDTH = BARS * (BAR_W + GAP) - GAP
const HEIGHT = ROWS * (CELL_H + GAP) - GAP

const canvas = ref<HTMLCanvasElement>()
const levels = new Float32Array(BARS)
```

（尺寸在挂载时确定，之后不随属性变化。）

- [ ] **Step 5: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 6: 浏览器验证**

先 `location.reload()`，等 3 秒，再执行：

```js
(async () => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const p = pinia._s.get('player')
  p.playFromList(p.tracks[0])
  await new Promise((r) => setTimeout(r, 3000))
  const { extractPalette } = await import('/src/utils/palette.ts')
  return {
    stream: p.streamInfo,
    sampleRate: p.sampleRate,
    upcoming: p.upcoming(5).map((t) => t.title),
    palette: await extractPalette('plan-check', [p.current.cover.small]),
    bar: document.querySelector('.bar-side .spectrum')?.style.width,
  }
})()
```

Expected：`stream.codec` 有值；`sampleRate` 为 44100 或 48000；`upcoming` 为 5 个与封面墙第 2–6 首相同的标题；`palette` 为 5 个 `#rrggbb`；`bar` 为 `79px`（默认尺寸未变）。

- [ ] **Step 7: Commit**

```bash
git add src/audio src/stores/player.ts src/utils/palette.ts src/components/Spectrum.vue
git commit -m "feat: stream info, upcoming queue, palette extraction, sized spectrum"
```

---

### Task 3: 状态与入口——ui 开关、详情 store、全局样式、播放栏与 App 接线

**Files:**
- Modify: `src/stores/ui.ts`
- Create: `src/stores/detail.ts`
- Modify: `src/styles/main.css`
- Modify: `src/components/PlayerBar.vue`
- Modify: `src/components/FxPanel.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `provider.getDetail`（Task 1）
- Produces:
  - ui store：`detailOpen: Ref<boolean>`、`coverLifted: Ref<boolean>`、`toggleDetail(v?: boolean)`
  - detail store（id `detail`）：`detail: ShallowRef<TrackDetail | null>`、`loading: Ref<boolean>`、`error: Ref<string>`
  - 全局类：`.np-label`、`.np-in`（配合 `--i` 依次出现）
  - 播放栏缩略图带属性 `data-np-thumb`

- [ ] **Step 1: ui store**

在 `src/stores/ui.ts` 中 `const fxOpen = ref(false)` 之后加：

```ts
  const detailOpen = ref(false)
  /** 详情页的封面从缩略图“拎出”期间隐藏缩略图，飞回落位后才恢复 */
  const coverLifted = ref(false)
```

在 `const toggleFx = ...` 之后加：

```ts
  const toggleDetail = (v = !detailOpen.value) => (detailOpen.value = v)
```

return 中加入 `detailOpen,`、`coverLifted,`、`toggleDetail,`。

- [ ] **Step 2: 详情 store**

Create `src/stores/detail.ts`：

```ts
import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { provider } from '../api'
import { errorMessage } from '../api/http'
import type { Track, TrackDetail } from '../api/types'
import { usePlayerStore } from './player'
import { useUiStore } from './ui'

export const useDetailStore = defineStore('detail', () => {
  const player = usePlayerStore()
  const ui = useUiStore()
  const detail = shallowRef<TrackDetail | null>(null)
  const loading = ref(false)
  const error = ref('')
  const cache = new Map<string, TrackDetail>()
  let token = 0

  async function load(track: Track) {
    const t = ++token
    const key = `${track.provider}:${track.id}`
    error.value = ''
    const hit = cache.get(key)
    detail.value = hit ?? null
    if (hit || !provider.getDetail) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const d = await provider.getDetail(track)
      cache.set(key, d)
      if (t === token) detail.value = d
    } catch (e) {
      if (t === token) error.value = errorMessage(e)
    } finally {
      if (t === token) loading.value = false
    }
  }

  // 只在详情页开着时请求，切歌时跟着换
  watch(
    () => [ui.detailOpen, player.current] as const,
    ([open, track]) => {
      if (open && track) void load(track)
    },
    { immediate: true },
  )

  return { detail, loading, error }
})
```

- [ ] **Step 3: 全局样式**

在 `src/styles/main.css` 的氛围模式注释之前加：

```css
/* ---------- 正在播放详情页 ---------- */
html.detail-open {
  overflow: hidden;
}

.np-label {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1;
  color: var(--accent);
  opacity: 0.8;
}

/* 信息块组装：挂载即播放，按 --i 依次出现；数据晚到的块插入时同样会播放 */
.np-in {
  animation: np-in 420ms var(--ease-out) both;
  animation-delay: calc(260ms + var(--i, 0) * 50ms);
}

@keyframes np-in {
  from {
    opacity: 0;
    transform: translateY(10px);
    filter: blur(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .np-in {
    animation: none;
  }
}
```

- [ ] **Step 4: 播放栏入口**

在 `src/components/PlayerBar.vue`：`.bar-track` 按钮改为：

```vue
        <button
          type="button"
          class="bar-track stag"
          style="--d: 2"
          title="歌曲详情"
          :aria-expanded="ui.detailOpen"
          @click="ui.toggleDetail()"
        >
          <span class="bar-thumb" :class="{ lifted: ui.coverLifted }" data-np-thumb>
```

样式中 `.bar-thumb { ... }` 之后加：

```css
.bar-thumb.lifted {
  visibility: hidden;
}
```

- [ ] **Step 5: FX 面板层级**

`src/components/FxPanel.vue` 中 `z-index: 45;` 改为 `z-index: 57;`。

- [ ] **Step 6: App 接线**

在 `src/App.vue`：

1. import 中加入 `watch`：`import { computed, onBeforeUnmount, onMounted, watch, watchEffect } from 'vue'`，并加 `import NowPlaying from './components/NowPlaying.vue'`。
2. `ambient` 计算属性条件中 `!ui.fxOpen &&` 之前加 `!ui.detailOpen &&`。
3. `watchEffect(() => document.documentElement.classList.toggle('ambient', ambient.value))` 之后加：

```ts
watchEffect(() => document.documentElement.classList.toggle('detail-open', ui.detailOpen))
watch(
  () => store.current,
  (t) => !t && ui.toggleDetail(false),
)
```

4. `onKeydown` 中 Escape 分支改为：

```ts
  } else if (e.key === 'Escape') {
    if (ui.detailOpen) ui.toggleDetail(false)
    else ui.toggleFx(false)
  }
```

5. 模板中 `<LyricsPanel v-if="ui.lyricsVisible && store.current" />` 改为 `<LyricsPanel v-if="ui.lyricsVisible && store.current && !ui.detailOpen" />`，并在 `<PlayerBar />` 之后加 `<NowPlaying />`。

6. 为了让本任务独立可验证，先创建占位 `src/components/NowPlaying.vue`（Task 5 会整体替换）：

```vue
<script setup lang="ts">
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
</script>

<template>
  <div v-if="ui.detailOpen" class="np-placeholder">NOW PLAYING</div>
</template>
```

- [ ] **Step 7: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 8: 浏览器验证**

`location.reload()` 等 3 秒后执行：

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
  const p = pinia._s.get('player')
  const ui = pinia._s.get('ui')
  p.playFromList(p.tracks[0])
  await sleep(1500)
  document.querySelector('.bar-track').click()
  await sleep(2500)
  const d = pinia._s.get('detail')
  const open = { ui: ui.detailOpen, html: document.documentElement.classList.contains('detail-open'), detail: d.detail, err: d.error }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await sleep(50)
  return { open, closedByEsc: !ui.detailOpen }
})()
```

Expected：`open.ui` 和 `open.html` 为 true，`open.detail.stats` 非空，`closedByEsc` 为 true。

- [ ] **Step 9: Commit**

```bash
git add src/stores src/styles/main.css src/components/PlayerBar.vue src/components/FxPanel.vue src/App.vue src/components/NowPlaying.vue
git commit -m "feat: detail store and now playing entry wiring"
```

---

### Task 4: 详情页子组件

**Files:**
- Create: `src/components/DetailInfo.vue`
- Create: `src/components/DetailTelemetry.vue`
- Create: `src/components/DetailLyrics.vue`
- Create: `src/components/UpNext.vue`

**Interfaces:**
- Consumes: detail store（Task 3）、`player.streamInfo` / `sampleRate` / `upcoming`（Task 2）、`extractPalette`（Task 2）、`Spectrum` 的 `bars` / `rows`（Task 2）、`.np-label` / `.np-in`（Task 3）
- Produces:
  - `<DetailInfo :track="Track" />`，标题元素 `.di-title`
  - `<DetailTelemetry :track="Track" />`
  - `<DetailLyrics />`（根元素带 `data-no-drag`）
  - `<UpNext />`

- [ ] **Step 1: DetailInfo**

Create `src/components/DetailInfo.vue`：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Track } from '../api/types'
import { useDetailStore } from '../stores/detail'

const props = defineProps<{ track: Track }>()
const store = useDetailStore()
const info = computed(() => store.detail)

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const COUNT_MS = 600
const COUNT_DELAY = 420
const TYPE_MAX = 40

const shown = ref<number[]>([])
let raf = 0

watch(
  () => info.value?.stats,
  (stats) => {
    cancelAnimationFrame(raf)
    const targets = stats?.map((s) => s.value) ?? []
    if (reduceMotion || !targets.length) {
      shown.value = targets
      return
    }
    const start = performance.now() + COUNT_DELAY
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / COUNT_MS))
      const e = 1 - (1 - k) ** 3
      shown.value = targets.map((v) => Math.round(v * e))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  },
  { immediate: true },
)

onBeforeUnmount(() => cancelAnimationFrame(raf))

const typeSteps = computed(() => Math.max(1, Math.min(props.track.title.length, TYPE_MAX)))

function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString('en-US')
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="di">
    <p class="np-label np-in" style="--i: 1">// TRACK</p>
    <h2 class="di-title np-in" style="--i: 1">
      <span :key="track.id" class="di-type" :style="{ '--n': typeSteps }">{{ track.title }}</span>
    </h2>
    <p class="di-artist np-in" style="--i: 2">
      {{ track.artist }}
      <template v-if="track.album">
        <span class="sep">·</span><span class="dim">{{ track.album }}</span>
      </template>
    </p>
    <p v-if="info?.aliases?.length" class="di-alias np-in" style="--i: 3">{{ info.aliases.join(' / ') }}</p>
    <ul class="di-tags np-in" style="--i: 3">
      <li>{{ track.provider.toUpperCase() }}</li>
      <li>{{ fmtDuration(track.duration) }}</li>
      <li v-if="info?.released">{{ info.released }}</li>
      <li v-if="info?.genre && info.genre !== track.album">{{ info.genre }}</li>
      <li v-if="info?.mood">{{ info.mood }}</li>
      <li v-for="q in info?.quality ?? []" :key="q" class="q">{{ q }}</li>
      <li v-for="t in info?.tags?.slice(0, 6) ?? []" :key="t">#{{ t }}</li>
    </ul>
    <dl v-if="info?.stats.length" class="di-stats">
      <div v-for="(s, i) in info.stats" :key="s.label" class="np-in" :style="{ '--i': 4 + i }">
        <dt>{{ s.label }}</dt>
        <dd>{{ fmtNum(shown[i] ?? 0) }}</dd>
      </div>
    </dl>
    <p v-else-if="store.loading" class="di-state">FETCHING META<i class="dots" /></p>
    <p v-else-if="store.error" class="di-state err">META::OFFLINE</p>
    <p v-if="info?.description" class="di-desc np-in" style="--i: 7">{{ info.description }}</p>
  </div>
</template>

<style scoped>
.di {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.di-title {
  margin: 0 0 10px;
  font-size: clamp(22px, 2.6vw, 34px);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

/* 逐字打出：按字数分步展开，末尾带光标 */
.di-type {
  display: inline;
  animation: di-type calc(var(--n) * 28ms) steps(var(--n)) 300ms both;
}

.di-type::after {
  content: '_';
  margin-left: 2px;
  color: var(--accent);
  animation: blink 900ms steps(2) infinite;
}

@keyframes di-type {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0);
  }
}

.di-artist {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--text);
}

.sep {
  margin: 0 8px;
  color: var(--text-dim);
}

.dim {
  color: var(--text-dim);
}

.di-alias {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-dim);
}

.di-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 18px;
  padding: 0;
  list-style: none;
}

.di-tags li {
  padding: 2px 8px;
  border: 1px solid var(--line-strong);
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1.2;
  color: var(--text-dim);
}

.di-tags li.q {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  color: var(--accent);
}

.di-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  margin: 0 0 16px;
}

.di-stats dt {
  font-family: var(--font-pixel);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-dim);
}

.di-stats dd {
  margin: 4px 0 0;
  font-family: var(--font-mono);
  font-size: 32px;
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.di-state {
  margin: 0 0 16px;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

.di-state.err {
  color: #ff7a7a;
}

.di-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .di-type {
    animation: none;
  }
}
</style>
```

（光标闪烁复用 `src/styles/main.css` 中已有的全局 `@keyframes blink`。）

- [ ] **Step 2: DetailTelemetry**

Create `src/components/DetailTelemetry.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { provider } from '../api'
import type { Track } from '../api/types'
import { usePlayerStore } from '../stores/player'
import { coverSources } from '../utils/cover'
import { extractPalette } from '../utils/palette'
import Spectrum from './Spectrum.vue'

const props = defineProps<{ track: Track }>()
const player = usePlayerStore()

const MAX_KBPS = 1000
const MAX_RATE = 96000

const palette = ref<string[] | null>(null)
const paletteState = ref<'loading' | 'ok' | 'locked'>('loading')

watch(
  () => props.track,
  async (t) => {
    palette.value = null
    if (!provider.coverCors) {
      paletteState.value = 'locked'
      return
    }
    paletteState.value = 'loading'
    const colors = await extractPalette(`${t.provider}:${t.id}`, coverSources(t.cover, 'small'))
    if (props.track !== t) return
    palette.value = colors
    paletteState.value = colors ? 'ok' : 'locked'
  },
  { immediate: true },
)

const rows = computed(() => {
  const s = player.streamInfo
  const rate = player.sampleRate
  return [
    { k: 'CODEC', v: s?.codec ?? '--', level: 0 },
    { k: 'BITRATE', v: s?.bitrate ? `${s.bitrate} KBPS` : '--', level: s?.bitrate ? Math.min(1, s.bitrate / MAX_KBPS) : 0 },
    { k: 'SAMPLE', v: rate ? `${(rate / 1000).toFixed(1)} KHZ` : '--', level: rate ? Math.min(1, rate / MAX_RATE) : 0 },
    { k: 'STREAM', v: s ? (s.preview ? 'PREVIEW' : 'FULL') : '--', level: 0 },
  ]
})
</script>

<template>
  <section class="tm">
    <p class="np-label np-in" style="--i: 6">// TELEMETRY</p>
    <dl class="tm-rows">
      <div v-for="(r, i) in rows" :key="r.k" class="tm-row np-in" :style="{ '--i': 6 + i, '--v': r.level }">
        <dt>{{ r.k }}</dt>
        <dd>{{ r.v }}</dd>
        <i v-if="r.level" class="tm-bar" aria-hidden="true" />
      </div>
    </dl>
    <div class="tm-spec np-in" style="--i: 10">
      <Spectrum :analyser="player.analyser" :playing="player.isPlaying" :bars="24" :rows="10" />
    </div>
    <div class="tm-palette np-in" style="--i: 11">
      <template v-if="palette">
        <span v-for="(c, i) in palette" :key="`${c}-${i}`" class="sw" :style="{ background: c, '--j': i }" :title="c" />
      </template>
      <span v-else class="tm-state">{{ paletteState === 'locked' ? 'CORS::LOCKED' : 'SAMPLING…' }}</span>
    </div>
  </section>
</template>

<style scoped>
.tm {
  min-width: 0;
}

.tm-rows {
  display: grid;
  gap: 8px;
  margin: 0 0 14px;
}

.tm-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: baseline;
  row-gap: 4px;
  font-family: var(--font-mono);
  font-size: 17px;
  line-height: 1;
}

.tm-row dt {
  color: var(--text-dim);
}

.tm-row dd {
  margin: 0;
  color: var(--text);
}

.tm-bar {
  grid-column: 1 / -1;
  height: 2px;
  background:
    linear-gradient(var(--accent) 0 0) 0 0 / calc(var(--v) * 100%) 100% no-repeat,
    var(--line);
  animation: tm-fill 600ms var(--ease-out) both;
  animation-delay: calc(420ms + var(--i) * 50ms);
}

@keyframes tm-fill {
  from {
    background-size:
      0 100%,
      auto;
  }
}

.tm-spec {
  margin-bottom: 14px;
}

.tm-palette {
  display: flex;
  gap: 4px;
  min-height: 18px;
}

.sw {
  width: 28px;
  height: 18px;
  outline: 1px solid rgba(255, 255, 255, 0.12);
  animation: sw-on 320ms steps(4) both;
  animation-delay: calc(760ms + var(--j) * 70ms);
}

@keyframes sw-on {
  from {
    opacity: 0;
    transform: scaleY(0.2);
  }
}

.tm-state {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}

@media (prefers-reduced-motion: reduce) {
  .tm-bar,
  .sw {
    animation: none;
  }
}
</style>
```

- [ ] **Step 3: DetailLyrics**

Create `src/components/DetailLyrics.vue`：

```vue
<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useLyricsStore } from '../stores/lyrics'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'

const lyrics = useLyricsStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const box = ref<HTMLElement>()

function center(smooth: boolean) {
  const b = box.value
  const el = b?.querySelector<HTMLElement>(`[data-i="${lyrics.activeLine}"]`)
  if (!b || !el) return
  b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.offsetHeight / 2, behavior: smooth ? 'smooth' : 'auto' })
}

watch(
  () => lyrics.activeLine,
  () => nextTick(() => center(true)),
)
watch(
  () => lyrics.lyrics,
  () => nextTick(() => center(false)),
)
onMounted(() => center(false))

function seekTo(time: number) {
  if (time < 0) return
  player.seek(time - player.streamOffset - settings.lyricOffset - lyrics.trackOffset)
}
</script>

<template>
  <section class="dl np-in" style="--i: 2" data-no-drag>
    <p class="np-label">// LYRICS</p>
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
          {{ line.text }}
          <small v-if="line.translation">{{ line.translation }}</small>
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

.dl-box {
  position: relative;
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 40% 0;
  mask-image: linear-gradient(transparent, #000 22%, #000 78%, transparent);
}

.dl-box::-webkit-scrollbar {
  display: none;
}

.dl-line {
  margin: 0;
  padding: 7px 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-dim);
  opacity: calc(1 - var(--k) * 0.1);
  cursor: pointer;
  transition:
    color 240ms var(--ease-out),
    transform 240ms var(--ease-out);
  transform-origin: left center;
  animation: np-in 360ms var(--ease-out) both;
  animation-delay: calc(420ms + var(--k) * 40ms);
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
  transform: scale(1.06);
}

.dl-line small {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  font-weight: 400;
}

.dl-state {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--text-dim);
}

@media (prefers-reduced-motion: reduce) {
  .dl-line {
    animation: none;
  }
}
</style>
```

- [ ] **Step 4: UpNext**

Create `src/components/UpNext.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'
import { coverSources } from '../utils/cover'
import CoverImage from './CoverImage.vue'

const UP_NEXT = 5

const player = usePlayerStore()
const list = computed(() => player.upcoming(UP_NEXT))
</script>

<template>
  <section class="un">
    <p class="np-label np-in" style="--i: 6">// UP NEXT</p>
    <p v-if="player.mode === 'shuffle'" class="un-state np-in" style="--i: 7">RAND::UNPREDICTABLE</p>
    <p v-else-if="!list.length" class="un-state np-in" style="--i: 7">QUEUE::EMPTY</p>
    <ol v-else class="un-list">
      <li v-for="(t, i) in list" :key="t.id" class="np-in" :style="{ '--i': 7 + i }">
        <button type="button" class="un-item" @click="player.play(t)">
          <span class="un-idx">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="un-thumb"><CoverImage :sources="coverSources(t.cover, 'small')" /></span>
          <span class="un-text">
            <b>{{ t.title }}</b>
            <small>{{ t.artist }}</small>
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.un {
  min-width: 0;
}

.un-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.un-item {
  display: grid;
  grid-template-columns: 22px 32px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 4px 6px 4px 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 160ms var(--ease-out);
}

.un-item:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.un-item:hover b {
  color: var(--accent);
}

.un-idx {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

.un-thumb {
  position: relative;
  width: 32px;
  height: 32px;
}

.un-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.un-text b,
.un-text small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.un-text b {
  font-size: 13px;
  font-weight: 600;
}

.un-text small {
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1;
  color: var(--text-dim);
}

.un-state {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}
</style>
```

- [ ] **Step 5: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 退出码 0（组件尚未被引用，但会被 `src/**/*.vue` 包含进检查）。

- [ ] **Step 6: Commit**

```bash
git add src/components/DetailInfo.vue src/components/DetailTelemetry.vue src/components/DetailLyrics.vue src/components/UpNext.vue
git commit -m "feat: now playing detail sections"
```

---

### Task 5: NowPlaying 外壳、布局与拖拽关闭（暂无开合动画）

**Files:**
- Modify (replace placeholder): `src/components/NowPlaying.vue`

**Interfaces:**
- Consumes: Task 3 的 ui store、Task 4 的四个子组件
- Produces: DOM 结构（Task 6 依赖这些类名）：根 `.np` > `.np-shell`（含 `.np-bg`、`.np-grid`、`.np-content` > `.np-head` / `.np-left` > `.np-cover` / `.np-right`）、`.np-scan`、`.np-ghost` > `img` + `canvas.np-mosaic`

- [ ] **Step 1: 写组件**

整体替换 `src/components/NowPlaying.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { provider } from '../api'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { coverSources } from '../utils/cover'
import CoverImage from './CoverImage.vue'
import DetailInfo from './DetailInfo.vue'
import DetailLyrics from './DetailLyrics.vue'
import DetailTelemetry from './DetailTelemetry.vue'
import UpNext from './UpNext.vue'

const player = usePlayerStore()
const ui = useUiStore()

const DRAG_CLOSE = 120
const DRAG_SLOP = 6

const crossOrigin = provider.coverCors ? 'anonymous' : undefined

const dragY = ref(0)
const dragging = ref(false)
let drag: { id: number; y: number } | null = null

function onDragStart(e: PointerEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [data-no-drag]')) return
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
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
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
</script>

<template>
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
        <CoverImage :sources="coverSources(player.current.cover, 'medium')" />
      </div>
      <i class="np-grid" aria-hidden="true" />
      <div class="np-content">
        <header class="np-head np-in" style="--i: 0">
          <button type="button" class="txt-btn" title="关闭（Esc）" @click="ui.toggleDetail(false)">[CLOSE]</button>
          <span class="np-tag">// NOW PLAYING · {{ player.providerName.toUpperCase() }}</span>
        </header>
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
      </div>
    </section>
    <i class="np-scan" aria-hidden="true" />
    <div class="np-ghost" aria-hidden="true">
      <img :src="coverSources(player.current.cover, 'small')[0]" :crossorigin="crossOrigin" alt="" draggable="false" />
      <canvas class="np-mosaic" width="6" height="6" />
    </div>
  </div>
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
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  gap: 16px;
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

@media (max-width: 900px) {
  .np-content {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 20px 16px 28px;
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
</style>
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 3: 浏览器验证布局与关闭**

`location.reload()` 等 3 秒后：播放第一首，点击 `.bar-track`，等 2 秒，用 `browser_take_screenshot` 截图检查：左侧大封面带四角括号，下方标题/歌手/标签/统计；右侧上方歌词、下方接下来播放与遥测；顶栏被遮住、播放栏可见。

然后执行：

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const ui = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui')
  const r = {}
  document.querySelector('.np-head .txt-btn').click(); await sleep(50); r.closeBtn = !ui.detailOpen
  ui.toggleDetail(true); await sleep(100)
  document.querySelector('.bar-track').click(); await sleep(50); r.thumbToggle = !ui.detailOpen
  ui.toggleDetail(true); await sleep(100)
  const shell = document.querySelector('.np-shell')
  const at = (y) => ({ pointerId: 1, button: 0, clientX: 600, clientY: y, bubbles: true })
  shell.dispatchEvent(new PointerEvent('pointerdown', at(200)))
  shell.dispatchEvent(new PointerEvent('pointermove', at(260)))
  r.dragTranslate = shell.style.translate
  shell.dispatchEvent(new PointerEvent('pointerup', at(260))); await sleep(50)
  r.snapBack = ui.detailOpen && !shell.style.translate
  shell.dispatchEvent(new PointerEvent('pointerdown', at(200)))
  shell.dispatchEvent(new PointerEvent('pointermove', at(400)))
  shell.dispatchEvent(new PointerEvent('pointerup', at(400))); await sleep(50)
  r.dragClose = !ui.detailOpen
  return r
})()
```

Expected：`closeBtn`、`thumbToggle`、`snapBack`、`dragClose` 均为 true，`dragTranslate` 为 `0px 60px`。（`setPointerCapture` 对合成事件可能抛错；若抛 `NotFoundError`，把 Step 1 中的 `setPointerCapture` 调用包进 `try { ... } catch {}` 后重试——真实指针不受影响。）

- [ ] **Step 4: Commit**

```bash
git add src/components/NowPlaying.vue
git commit -m "feat: now playing layout and drag to close"
```

---

### Task 6: 开合动画——扫描显影、封面飞行、马赛克、减少动态

**Files:**
- Modify: `src/components/NowPlaying.vue`

**Interfaces:**
- Consumes: Task 5 的 DOM 类名、`ui.coverLifted`、播放栏 `[data-np-thumb]`、`ui.barCollapsed`

- [ ] **Step 1: 包 Transition**

模板中把根 `<div v-if="ui.detailOpen && player.current" class="np">…</div>` 用下面的 Transition 包住（内部不变）：

```vue
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <div v-if="ui.detailOpen && player.current" class="np">
      …
    </div>
  </Transition>
```

- [ ] **Step 2: 动画编排代码**

在 `<script setup>` 中 `const shellStyle = …` 之后加：

```ts
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

/** 播放栏收起时缩略图不可见，不做飞行 */
function thumbRect(): DOMRect | null {
  if (ui.barCollapsed) return null
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

async function runMosaic(canvas: HTMLCanvasElement, src: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = new Image()
  img.src = src
  try {
    await img.decode()
  } catch {
    return
  }
  canvas.style.opacity = '1'
  for (const [size, at] of MOSAIC_STEPS) {
    setTimeout(() => {
      canvas.width = size
      canvas.height = size
      ctx.drawImage(img, 0, 0, size, size)
    }, at)
  }
  canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 480, fill: 'forwards' })
}

function fade(el: HTMLElement, from: number, to: number) {
  return el.animate([{ opacity: from }, { opacity: to }], { duration: 200, fill: 'forwards' })
}

function onEnter(el: Element, done: () => void) {
  const p = parts(el)
  dragY.value = 0
  ui.coverLifted = true
  if (reduceMotion) {
    void allDone([fade(p.shell, 0, 1)]).then(done)
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
    void runMosaic(p.mosaic, coverSources(player.current!.cover, 'small')[0])
    const fly = p.ghost.animate([{ transform: flipFrom(from, to) }, { transform: 'none' }], {
      duration: 620,
      easing: FLY_OUT,
    })
    anims.push(fly)
    void fly.finished
      .then(async () => {
        const img = p.cover.querySelector('img')
        await Promise.race([img?.decode().catch(() => undefined), sleep(LAND_WAIT)])
        p.cover.style.opacity = ''
        await p.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).finished
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
  const p = parts(el)
  const finish = () => {
    ui.coverLifted = false
    done()
  }
  if (reduceMotion) {
    void allDone([fade(p.shell, 1, 0)]).then(finish)
    return
  }
  const to = thumbRect()
  const at = p.cover.getBoundingClientRect()
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
```

说明：`.np-cover` 在 `.np-content` 内，关闭时内容淡出会带走真封面，此时替身已在原位接管，所以视觉上封面不会消失。

- [ ] **Step 3: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 4: 浏览器验证打开轨迹**

`location.reload()` 等 3 秒，播放第一首，然后执行（在若干时刻暂停所有动画读取状态）：

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const thumb = document.querySelector('[data-np-thumb]').getBoundingClientRect()
  document.querySelector('.bar-track').click()
  await sleep(0)
  await new Promise(requestAnimationFrame)
  const anims = document.getAnimations()
  anims.forEach((a) => a.pause())
  const sample = (t) => {
    anims.forEach((a) => (a.currentTime = t))
    const g = document.querySelector('.np-ghost').getBoundingClientRect()
    return {
      t,
      ghost: [Math.round(g.left), Math.round(g.top), Math.round(g.width)],
      clip: getComputedStyle(document.querySelector('.np-shell')).clipPath,
      lifted: document.querySelector('[data-np-thumb]').classList.contains('lifted'),
    }
  }
  const out = [0, 260, 520, 620].map(sample)
  anims.forEach((a) => a.play())
  const cover = document.querySelector('.np-cover').getBoundingClientRect()
  return { thumb: [Math.round(thumb.left), Math.round(thumb.top), Math.round(thumb.width)], cover: [Math.round(cover.left), Math.round(cover.top), Math.round(cover.width)], out }
})()
```

Expected：`out[0].ghost` ≈ `thumb`（±1px），`out[3].ghost` ≈ `cover`；`out[0].clip` 为 `inset(100% 0px 0px)`，`out[2].clip` 为 `inset(0px)`；`lifted` 全为 true。等 1.5 秒后截图：信息块已组装完成、替身已隐藏。

- [ ] **Step 5: 浏览器验证关闭轨迹**

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const cover = document.querySelector('.np-cover').getBoundingClientRect()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await new Promise(requestAnimationFrame)
  const anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.np'))
  anims.forEach((a) => a.pause())
  const at = (t) => {
    anims.forEach((a) => (a.currentTime = t))
    const g = document.querySelector('.np-ghost').getBoundingClientRect()
    return [Math.round(g.left), Math.round(g.top), Math.round(g.width)]
  }
  const r = { cover: [Math.round(cover.left), Math.round(cover.top), Math.round(cover.width)], start: at(80), end: at(420) }
  anims.forEach((a) => a.play())
  await sleep(600)
  r.removed = !document.querySelector('.np')
  r.thumbBack = !document.querySelector('[data-np-thumb]').classList.contains('lifted')
  const t = document.querySelector('[data-np-thumb]').getBoundingClientRect()
  r.thumb = [Math.round(t.left), Math.round(t.top), Math.round(t.width)]
  return r
})()
```

Expected：`start` ≈ `cover`，`end` ≈ `thumb`；`removed`、`thumbBack` 为 true。

- [ ] **Step 6: 播放栏收起时的降级**

执行 `ui.toggleBar(true)`（经 Pinia），等 1 秒后 `ui.toggleDetail(true)`，等 1 秒截图：详情页正常显示、封面在原位；再 `ui.toggleDetail(false)`，等 600ms，确认 `.np` 已移除、`ui.coverLifted === false`。最后 `ui.toggleBar(false)` 恢复。

- [ ] **Step 7: Commit**

```bash
git add src/components/NowPlaying.vue
git commit -m "feat: now playing open/close choreography"
```

---

### Task 7: 整体验证

**Files:** 无新增（只在发现问题时修复对应文件）

- [ ] **Step 1: 构建**

Run: `pnpm exec vue-tsc --noEmit; pnpm build`
Expected: 两条命令退出码均为 0。

- [ ] **Step 2: 两个来源的数据**

当前来源为网易云时打开详情页截图，确认 HEAT / COMMENTS 计数、音质标签、发行日期、编码与码率（例如 `MP3` / `320 KBPS`）、采样率、5 色色板、嵌入歌词高亮当前行、接下来播放 5 首。

然后在浏览器执行 `localStorage.setItem('himusic.provider', 'audius'); location.reload()`，等 3 秒，播放并打开详情页截图，确认 PLAYS / LIKES / REPOSTS、流派、标签、`MP3`、码率 `--`。最后 `localStorage.setItem('himusic.provider', 'netease'); location.reload()` 恢复。

- [ ] **Step 3: 交互回归**

逐项确认：
- 详情页打开时右侧歌词面板不显示；关闭后若之前开着则恢复。
- 详情页打开时 4 秒不动鼠标不会进入氛围模式。
- 详情页打开时点 `[FX]`，FX 面板显示在详情页之上；Esc 先关详情页。
- 随机模式下接下来播放显示 `RAND::UNPREDICTABLE`。
- 点击接下来播放的条目会切歌，详情页内容随之更新（标题重新打字、统计重新计数）。
- 窄屏（`Emulation.setDeviceMetricsOverride` 宽 390、高 844）下单列可滚动；验证后 `Emulation.clearDeviceMetricsOverride`。

- [ ] **Step 4: Commit（仅在 Step 1–3 有修复时）**

```bash
git add -A
git commit -m "fix: now playing polish"
```
