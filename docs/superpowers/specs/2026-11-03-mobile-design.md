# 手机端交互与显示设计

日期：2026-11-03
状态：已确认，待写实现计划

## 背景

桌面端布局已经比较完整，但在窄屏（以 390×844 为基准）下问题很多：

- **封面墙错乱**：视差位移 `--mx/--my` 和焦点衰减会被触摸指针触发，封面互相错位；三列网格里还混排着 `w/t/m/l` 尺寸的方块，挤在一起。
- **入口缺失**：顶部导航在 1000px 以下隐藏了整个 `.status`，所以手机上无法登录、切换音乐源、打开命令面板，也无法打开 FX。
- **详情页拥挤**：所有区块竖着堆成一长条（约 1470px），歌词框在可滚动的页面里单独滚动，两者手势冲突；当前句过长时会被横向截断。
- **氛围模式误触发**：闲置 4 秒就进入，而手机上看屏幕时经常不碰。
- **播放栏**：`[LRC]` 侧栏、收起按钮和音量控制在手机上都不合适。

## 目标与非目标

**目标**：在手机上提供像原生音乐 App 一样顺手的交互，同时保持像素风加科技感的视觉。桌面端的布局和行为不受影响。

**非目标**：
- 不做独立的路由或页面体系（不加「我的」「设置」等新页面）。
- 不做横屏专门布局（横屏宽度超过 640px 时按桌面布局处理即可）。
- 不改音频、数据源和 store 的业务逻辑。

## 判定方式

- 断点：`(max-width: 640px)`。样式用 CSS 媒体查询；行为差异用新的组合函数 `src/composables/useMobile.ts` 判断。
- `useMobile()` 返回一个 `Ref<boolean>`，内部用 `matchMedia('(max-width: 640px)')`，模块级单例，并监听 `change`（旋转屏幕或改变窗口大小时更新）。
- 触控反馈另用 `(hover: none)` 判定：在这种设备上去掉悬停效果，改为按下高亮（`:active`）。

## 1. 详情页：三页横向滑动

### 结构

```
.np-shell
├─ .np-head        [CLOSE]   01 PLAY · 02 LRC · 03 INFO（页码，带滑动下划线）
└─ .np-pager       横向 scroll-snap 容器（手机端才有分页行为）
   ├─ section.np-page[data-page=play]   大封面 / 歌名标签 / 进度 / 控制 / 歌词预览
   ├─ section.np-page[data-page=lrc]    全屏歌词（DetailLyrics）
   └─ section.np-page[data-page=info]   统计 + 描述 / 技术参数 / 接下来播放（纵向可滚）
```

- 桌面端继续使用现有的 `.np-content` 网格布局。手机端在 `NowPlaying.vue` 中用 `v-if="mobile"` 切换成分页结构；子组件（`DetailInfo`、`DetailLyrics`、`DetailTelemetry`、`UpNext`）原样复用。
- 分页用原生 `scroll-snap-type: x mandatory`，每页 `width: 100%`、`scroll-snap-align: start`、`scroll-snap-stop: always`，滚动条隐藏。
- 不自己写横向拖拽：惯性和回弹交给系统，也避免和下拉关闭冲突。

### 页码指示

- 文字为 `01 PLAY` / `02 LRC` / `03 INFO`，字体 `--font-pixel`，大小 8px，当前页使用强调色。
- 下划线位置 = `scrollLeft / clientWidth`，在滚动事件里用 rAF 节流更新 `--p`（0 到 2），所以拖动时下划线会连续移动。
- 点击页码调用 `pager.scrollTo({ left: i * width, behavior })`；开启减弱动效时直接跳转。
- 当前页记在组件内的 `page` 中（四舍五入），只用于 `aria-current` 和高亮。

### 第 1 页「播放」

- 封面宽 `min(82vw, 46vh)`，居中，保留四角瞄准框。打开时的封面替身飞行动画（FLIP）照常落到这里。
- 下方是 `DetailInfo` 的精简模式（新增 prop `part="head"`）：只显示歌名、歌手和标签行，不显示统计和描述（这两项放到第 3 页）。
- 进度条：复用 `SegmentBar`（高 6px，分段 4），两端显示 `mm:ss`。拖动时调用 `seek`。
- 控制行：`[LOOP/ONE/RAND]`、上一首、播放键（大号 `RobotEyes`，scale 4）、下一首、`[LRC]`（跳到第 2 页）。每个按钮的点击区域至少 44px。
- 歌词预览：单行显示当前句（同步歌词的当前行，没有同步歌词就不显示），字体 `--font-sans`、14px、`--text-dim`。点击跳到第 2 页。

### 第 2 页「歌词」

- 复用 `DetailLyrics`，高度占满整页。当前句继续居中滚动（已有逻辑）。
- 长句加上 `overflow-wrap: anywhere`，行宽限制为 `calc(100% / 1.06)`，这样当前句放大 1.06 倍后仍在框内，不会横向截断（桌面端也一样生效）。
- 点击某一行跳到该时间点（已有行为，保持不变）。

### 第 3 页「信息」

- 纵向滚动（`overflow-y: auto`，`overscroll-behavior: contain`）。
- 从上到下依次是：统计数字和描述（`DetailInfo` 的 `part="meta"` 模式）、`DetailTelemetry`（频谱改为 16×7，避免过宽）、`UpNext`。

### 手势与关闭

- 下拉关闭只在 `.np-head` 和第 1 页上生效。第 2、3 页上的纵向手势用于滚动内容。实现方式：`onDragStart` 判断 `e.target.closest('.np-page[data-page=play], .np-head')`。
- 分页容器设置 `touch-action: pan-x`；第 1 页设置 `touch-action: pan-x`，纵向拖动交给关闭手势；第 2、3 页内部的滚动区设置 `touch-action: pan-y`。
- 打开时的初始页：普通打开进第 1 页；从 `[LRC]` 打开进第 2 页。`ui` store 新增 `detailPage: 0 | 1 | 2`，`toggleDetail(v, page?)` 时设置它，`NowPlaying` 进入后无动画地定位到对应页。
- 安全区：外框四周使用 `env(safe-area-inset-*)`，`index.html` 的 viewport 需包含 `viewport-fit=cover`。

### 动效

- 打开和关闭沿用现有的编排（裁剪展开、扫描线、封面替身飞行）。
- 翻页时，进入视口的页内 `.np-in` 元素重新错峰显现（滚动结束后给新页加 `.seen` 类，只播放一次）。
- 开启减弱动效时，以上动效都关闭。

## 2. 首页：两列网格

- 手机端：`--cols: 2`、`--gap: 10px`、左右内边距 12px；所有方块统一为 1×1（忽略 `is-w/t/m/l` 的跨格）。
- 封面下方加文字区（只在手机端显示）：歌名占一行，13px 字重 600，超长显示省略号；歌手 `--font-mono`、14px、`--text-dim`。原来悬停才出现的 `.meta` 浮层在手机端隐藏。
- 网格行高改为 `auto`，方块内封面保持 `aspect-ratio: 1`。
- 关闭视差位移和焦点衰减：`CoverWall` 在 `mobile` 为真时不监听 `pointermove/scroll`，并清掉 `--mx/--my/--s/--o`。
- 正在播放的方块保留角标框和 `.badge` 频谱跳动。
- 顶部分区标签：`.shelves` 改为单行可横向滚动（`overflow-x: auto`、`scroll-snap-type: x proximity`、隐藏滚动条、两端渐隐遮罩），当前项带下划线。点击后的 `SYNC...` 提示和回到顶部的行为不变。
- `wall` 的上内边距按手机端顶部导航高度调整。

## 3. 顶部导航与菜单抽屉

### 顶部导航（手机端）

- 高 56px，布局为 Logo（缩小）/ 搜索框（自适应宽度）/ `[≡]` 菜单按钮（44×44）。
- `.status` 继续隐藏；所有入口都移到菜单抽屉里。

### 菜单抽屉 `MobileSheet.vue`（新）

- 从底部滑出，最大高度 80vh，顶部有拖动把手和一条扫描线；背景遮罩 `rgba(0,0,0,.55)`，点遮罩即关闭。
- z-index 为 92，高于命令面板（90）、低于登录弹窗（95）。这样从抽屉里点登录，弹出的登录框在抽屉之上。
- 内容（每行一个终端风格的条目，按顺序逐行显现）：
  1. `ACCOUNT`：头像和昵称，或 `[LOGIN]`。点击调用 `account.openLogin(true)`。
  2. `SOURCE`：显示 `SRC::NETEASE`，点击切换到下一个音乐源（沿用 `AppHeader` 的 `switchProvider` 逻辑，抽成可复用函数）。
  3. `FX`：点击后关闭抽屉并 `ui.toggleFx(true)`。FX 面板在手机端改成从底部弹出的样式（见下）。
  4. `COMMANDS`：打开命令面板。
  5. 底部信息行：`000 TRK · ● PLAYING / IDLE`。
- 关闭方式：下拉把手超过 80px、点遮罩、按 Esc、或执行任意一项操作后自动关闭。
- `ui` store 新增 `menuOpen` 和 `toggleMenu`。Esc 的优先级：菜单 > 详情页 > FX。

### FX 面板（手机端）

- 手机端改为贴底全宽，宽 100%、最大高度 70vh、可纵向滚动，四周的装饰角保留。内容不变。

## 4. 底部迷你播放条

- 手机端不使用桌面端的完整播放栏和收起胶囊（`MiniDock`）：忽略 `barCollapsed`，`--dock-h` 固定为 `calc(64px + env(safe-area-inset-bottom))`。
- 新组件 `MobileBar.vue`，由 `PlayerBar` 在 `mobile` 为真时渲染以替代原来的内容：
  - 顶边是 2px 强调色进度线（不可拖动，只显示）。
  - 布局：封面 44px（带 `data-np-thumb`，用于详情页飞行动画）/ 歌名和歌手两行 / 播放键（`RobotEyes`，scale 2.5）/ 下一首。
  - 点击封面或文字区打开详情页（第 1 页）。
  - 向上滑超过 40px 也打开详情页。
  - 左右滑动切歌：文字区跟着手指移动（阻尼 0.6），松手时超过 72px 就 `next()`/`prev()`，并让新歌名从对侧滑入；否则回弹。用 `touch-action: pan-y` 避免和页面滚动冲突。
- 安全区：底部内边距 `env(safe-area-inset-bottom)`。

## 5. 其他行为

- **氛围模式**：`App.vue` 的 `ambient` 计算属性加上 `!mobile`。手机上不会因闲置进入氛围模式。
- **`[LRC]`**：手机上调用 `ui.toggleDetail(true, 1)`，打开详情页并直接定位到歌词页；不渲染 `LyricsPanel`。
- **触控反馈**：`(hover: none)` 下，悬停才显示的效果（封面 `.frame`、`.meta`）不靠悬停出现；按钮按下时给 120ms 的强调色背景闪一下。
- **点击区域**：手机端所有交互元素至少 44×44（`txt-btn` 通过增加内边距实现）。
- **键盘快捷键**：不变（外接键盘仍可用）。

## z-index 补充

| 层 | z-index |
| --- | --- |
| 详情页外框 | 55 |
| FX 面板 | 57 |
| 命令面板 | 90 |
| 菜单抽屉 | 92 |
| 登录弹窗 | 95 |

## 验证

- `pnpm exec vue-tsc --noEmit` 和 `pnpm build` 通过。
- 在 390×844（`mobile: true`、`hasTouch`）下检查：
  - 首页两列网格无错位；分区标签可以横向滑动。
  - 菜单抽屉的每一项都能用（登录弹窗、切换音乐源、FX、命令面板）。
  - 迷你播放条：点击和上滑能打开详情页；左右滑能切歌，未过阈值会回弹。
  - 详情页：三页滑动和页码下划线跟随正常；`[LRC]` 能直达歌词页；第 2、3 页纵向滚动时不会触发关闭；在第 1 页下拉能关闭；长句会换行。
  - 闲置时不会进入氛围模式。
- 在 1440 宽度下回归：桌面端布局和交互不变。
