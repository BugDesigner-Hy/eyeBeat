# 正在播放详情页 设计

## 目标

点击播放栏左侧的封面或歌名，从缩略图位置“飞出”一个全屏的「正在播放」详情页，展示大封面、基础信息、扩展元数据、技术遥测、嵌入歌词和接下来播放。动画要连贯、有科技感。

## 入口与交互

- 播放栏 `.bar-track`（缩略图 + 歌名）点击：切换 `ui.detailOpen`。原来的“打开歌词”只保留在 `[LRC]` 按钮和 L 键。
- 详情页打开期间：
  - Esc 优先关闭详情页（其次才是 FX 面板）。
  - 右侧浮动歌词面板隐藏（`ui.lyricsVisible` 保持原值，关闭详情页后恢复显示）。
  - 页面滚动被锁定（`document.documentElement` 加 `overflow: hidden`）。
  - 播放栏上的缩略图设为 `visibility: hidden`，营造“封面被拎出”的效果。
- 关闭方式：左上角 `[CLOSE]`、Esc、再次点击播放栏缩略图、在背景或封面上向下拖超过 120px（拖动时整页跟手下沉、透明度递减，松手不足 120px 则弹回）。
- 当前曲目变为 `null` 时自动关闭。

## 数据

### 扩展元数据 `TrackDetail`

在 `src/api/types.ts` 新增：

```ts
export interface TrackStat {
  /** 英文短标签，例如 PLAYS / LIKES / COMMENTS / HEAT */
  label: string
  value: number
}

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

`MusicProvider` 新增可选方法 `getDetail?(track: Track): Promise<TrackDetail>`。

- 网易云：`/song/detail?ids=<id>` 取 `publishTime`、`alia`、`pop`（HEAT，0–100）、`l/m/h/sq/hr` 字段推出音质等级；`/comment/music?id=<id>&limit=1` 取 `total`（COMMENTS）。两个请求并行，评论数失败不影响其余字段。
- Audius：`/v1/tracks/{id}` 取 `release_date`、`genre`、`mood`、`tags`（逗号分隔字符串）、`description`、`play_count`（PLAYS）、`favorite_count`（LIKES）、`repost_count`（REPOSTS）。

### 详情 store `src/stores/detail.ts`

- 状态：`detail: TrackDetail | null`、`loading`、`error`。
- 内存缓存 `Map<string, TrackDetail>`，键为 `${provider}:${id}`。
- 仅在 `ui.detailOpen && player.current` 时请求；切歌时若详情页开着则请求新曲目。用 token 丢弃过期响应。
- provider 没有 `getDetail` 时 `detail` 为 `null`、不报错。

### 技术遥测

- `StreamSource` 新增可选 `codec?: string`、`bitrate?: number`（kbps）。
  - 网易云 `/song/url/v1` 返回的 `type`（如 `mp3`/`flac`）与 `br`（bps）→ `codec` 大写、`bitrate = round(br / 1000)`。
  - Audius 只填 `codec: 'MP3'`，码率显示 `--`。
- 播放器 store 暴露 `stream = shallowRef<StreamSource | null>`（当前曲目的播放地址信息）。
- 采样率：引擎的 `AudioContext.sampleRate`（未建图时显示 `--`）。
- 频谱：`Spectrum.vue` 增加可选 `bars` / `rows` 属性（列数、格数，默认 16 / 7 保持现有尺寸）。
- 色板：`src/utils/palette.ts` 新增 `extractPalette(key, urls, count = 5): Promise<string[] | null>`，复用现有的图片加载与 HSL 转换，按 32×32 取样后对像素颜色做简单的 k-means 聚类（k = count，迭代 6 次），按簇大小降序输出原始颜色（不做饱和度归一），结果放进与 `extractAccent` 并列的内存缓存。`provider.coverCors === false` 时不取色，显示 `CORS::LOCKED`。

### 歌词与队列

- 嵌入歌词复用 `useLyricsStore()` 的 `lines` / `activeLine` / `lyrics`，只读展示（可点行跳转），不包含换源和偏移调节。
- 「接下来播放」：播放器 store 新增 `upcoming(n)` 计算：`list` / `one` 模式取队列中当前曲目之后的 n 首（循环到开头）；`shuffle` 模式返回空数组，UI 显示 `RAND::UNPREDICTABLE`。点击条目调用 `player.play(track)`。

## 组件

- `NowPlaying.vue`：外壳、布局、拖拽关闭、开合动画编排（Vue `<Transition :css="false">` 的 `onEnter` / `onLeave` JS 钩子 + Web Animations）。
- `DetailInfo.vue`：标题、歌手、专辑、别名、标签、发行日期、音质等级、统计数字（计数滚动）、简介。
- `DetailTelemetry.vue`：编码、码率、采样率、频谱、色板。
- `DetailLyrics.vue`：嵌入式滚动歌词（约 7 行可见）。
- `UpNext.vue`：接下来播放列表（最多 5 首）。

## 布局

- 桌面：`position: fixed; inset: 0 0 var(--dock-h) 0; z-index: 55`（高于顶栏 50；详情页止于播放栏上沿，不会盖住播放栏和胶囊）。飞行中的封面替身 `z-index: 58`，扫描线 `56`。FX 面板提到 `57`，详情页打开时仍能在其上打开。
  - 背景：大封面放大模糊（`blur(60px) saturate(1.4)`、不透明度 0.28）+ 网格线 + 扫描线，强调色沿用全局 `--accent`。
  - 两栏网格：左栏宽 `min(44vh, 40vw)` 的大封面（四角像素括号框）+ `DetailInfo`；右栏上方 `DetailLyrics`，下方两列 `UpNext` 与 `DetailTelemetry`。
  - 左上角 `[CLOSE]` 与 `// NOW PLAYING` 标签。
- 窄屏（≤ 900px）：单列，可在详情页内部纵向滚动；封面宽 `min(72vw, 360px)`。

## 动画

所有时长、缓动沿用 `--ease-out` / `--ease-in`。

### 打开（总长约 900ms）

1. 0–520ms：外壳 `clip-path: inset(100% 0 0 0) → inset(0)`，前沿一道 2px 发光扫描线随之从底部上移到顶部（与 `.dock-scan` 同一视觉语言）。
2. 0–620ms：封面 FLIP。读取播放栏缩略图 `getBoundingClientRect()` 与大封面的最终位置，对大封面执行 `translate + scale` 从缩略图到原位，曲线 `cubic-bezier(0.2, 0.8, 0.2, 1)`。飞行期间先显示小图并叠加像素马赛克（`image-rendering: pixelated` 的小尺寸画布逐级放大），落位后交叉淡入大图。
3. 260ms 起：信息块按 `--i` 依次以 50ms 间隔组装（`opacity`、`translateY(10px)`、`blur(3px)` → 0）。
   - 标题逐字打出（`steps()` 宽度动画 + 光标）。
   - 统计数字在 600ms 内由 0 滚动到目标值（rAF，`easeOutCubic`）。
   - 遥测条逐个填满，色板色块依次点亮。
   - 嵌入歌词逐行显影。

### 关闭（总长约 420ms）

1. 0–140ms：内容淡出。
2. 80–420ms：封面反向 FLIP 飞回缩略图；外壳 `clip-path` 自上而下收合。
3. 播放栏已收起（缩略图不可见）时，封面原地缩小到 0.6 并淡出。

### 减少动态效果

`prefers-reduced-motion: reduce` 时只做 200ms 淡入淡出，不做 FLIP、打字、计数滚动和马赛克。

## 错误处理

- 扩展元数据请求失败：扩展区显示 `META::OFFLINE`，基础信息、遥测、歌词、队列照常。
- 遥测字段缺失显示 `--`。
- 色板取色失败或封面无 CORS 显示 `CORS::LOCKED`。
- 缩略图元素不存在或尺寸为 0：跳过 FLIP，封面从 `scale(0.6)` 淡入。

## 验证

项目当前没有测试框架，按以下方式验证：

- `pnpm exec vue-tsc --noEmit` 与 `pnpm build`。
- 浏览器中暂停 `document.getAnimations()` 于若干时间点，读取封面位置与外壳 `clip-path`，确认开合轨迹。
- 网易云与 Audius 各打开一次，确认扩展元数据、遥测、歌词、接下来播放的内容。
- 验证四种关闭方式、Esc 优先级、拖拽回弹、歌词面板在关闭后恢复。

## 不做

- 详情页内的评论列表、歌手页、专辑页跳转。
- 在胶囊（收起的播放栏）上提供入口。
