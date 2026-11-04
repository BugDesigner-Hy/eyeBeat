# 详情页面板折叠设计（评论栏 / 队列与参数）

日期：2026-11-04
状态：已确认（用户决策为最终），实现中

## 目标

桌面详情页（`NowPlaying.vue` 非手机分支）给两块面板加折叠，把空间让给歌词：

1. **评论栏**（仅 ≥1440px 且 `comments.present` 时的第三栏）：折叠成右侧边缘的竖向细轨（竖排 `CMT` + 评论数），点细轨展开。歌词栏横向变宽。
2. **下方区域**（`.np-lower`：UpNext + DetailTelemetry 一起）：折叠成底部一条横向细条（`// QUEUE · TELEMETRY`），点细条展开。歌词栏向下变高。所有桌面宽度共用一个状态。

<1440px 的 `[CMT n]` 抽屉保持不变；手机端（≤640px）不动。

## 状态

- 持久化：`settings` store 新增 `detailCmtCollapsed`、`detailLowerCollapsed` 两个布尔值，随 `himusic.settings` 整体写入 localStorage。
- 视觉阶段：`src/composables/useFold.ts` 每块面板一个 `phase`：`open | closing | closed | opening`。点击时立即写入设置，动画跑完才把 `phase` 落到终态；动画期间再次点击忽略（按钮本身在动画中也是 inert / 不可见）。

## 结构

```
.np-content.np-3              5 条轨道：左栏 | 间隔 | 歌词 | 间隔 | 评论
  .np-cmt-col  (grid-column 5，空的定位容器，右边缘固定)
    .np-cmt-clip [data-fold-body]   绝对定位、右对齐、固定宽 --cmt-w，内含 [-] 按钮 + DetailComments
    .np-rail     [data-fold-dock]   绝对定位在右侧留白里的竖向细轨（button）
    .np-fold-box > .np-fold-tag     折叠用的 HUD 边框（含标题乱码）
    .np-fold-line                   折叠成的那条线
.np-right
  DetailLyrics
  .np-lower-wrap
    .np-lower-clip [data-fold-body] 展开时在流内；其它阶段绝对定位贴底
      .np-lower (UpNext + DetailTelemetry) + [-] 按钮
    .np-strip [data-fold-dock]      绝对定位贴底的横向细条（button）
    .np-fold-box / .np-fold-line
```

- 栏间距从 `column-gap` 改为显式轨道（`--np-gap`），这样折叠后可把“间隔 + 评论”两条轨道都过渡到 0，歌词栏右缘回到两栏布局的位置，细轨放在右侧 padding 留白里。
- 评论内容固定宽度、右对齐，轨道变窄时不重排几百条评论；折叠后用 `visibility: hidden` 保留（滚动位置、已加载分页、入场动画都不重放）。
- 下方区域折叠后同样保留在 DOM（`visibility: hidden`），展开时不重放 `np-in` / 频谱条入场动画。
- 细轨、细条始终渲染（展开态 `visibility: hidden`），这样它们的 `np-in` 入场只在打开详情页时播放一次。

## 动画时间线（总长 540ms，全部 WAAPI）

只动 transform / opacity；布局只动一次：评论栏用 `grid-template-columns`（px 列表插值），下方区域用外层 `height`（px）。乱码只改一个标题 span 的 `textContent`（约 25fps），不碰评论节点。

### 折叠

| 时间 (ms) | 内容 |
| --- | --- |
| 0–170 | 面板内容 opacity 闪烁 + 横向抖动至 0（steps）；HUD 框淡入（0–60），框内标题乱码后消失（0–160） |
| 160–300 | 框沿折叠轴压扁成一条细缝（`scaleX/scaleY → 0.004`，ease-in） |
| 250–300 | 发光细线在框中心亮起；框在 300–340 淡出 |
| 300–480 | 细线平移到边缘（评论：细轨左缘；下方：细条上缘） |
| 160–540 | 布局过渡：评论轨道 → 0 / 外层高度 → 细条高度（ease-in-out） |
| 440–540 | 细轨 / 细条闪烁显现，细线淡出（480–540） |

### 展开（逆序）

| 时间 (ms) | 内容 |
| --- | --- |
| 0–80 | 细轨 / 细条闪烁消失 |
| 0–60 | 细线在边缘亮起 |
| 0–380 | 布局过渡：轨道 / 高度恢复（ease-in-out） |
| 60–240 | 细线平移回面板中心 |
| 240–380 | 框从细缝展开为完整边框（ease-out）；细线 290–330 淡出 |
| 360–540 | 内容闪烁显现；框内标题逐字解码（360–510）；框 440–540 淡出 |

### prefers-reduced-motion

直接切换终态，新出现的元素（内容或细轨/细条）做 160ms 淡入。

## 交互与无障碍

- `[-]` 按钮：`aria-expanded="true"`，`aria-label`/`title` 为“收起评论”/“收起队列与参数”。
- 细轨/细条是 `<button>`：`aria-expanded="false"`，“展开评论”/“展开队列与参数”。
- 焦点：从按钮触发时，动画结束后焦点移到对应的另一个按钮。
- 折叠中的内容 `inert`；细轨/细条仅在折叠终态可交互。

## 边界情况

- 动画中关闭详情页：`onLeave` 取消子树内所有 WAAPI 动画，折叠的 Promise 照常收尾，`phase` 落到终态。
- 动画中评论栏消失（缩窄到 <1440 或 `present` 变假）：立即取消栅格动画，否则 5 轨 px 列表会压在两栏布局上。
- 评论栏折叠时 store 仍会加载，细轨显示 `fmtNum(total)`，无总数显示 `--`。
- 折叠态打开详情页：直接是终态，细轨/细条参与 `np-in` 依次入场；封面飞行不受影响。
- `np-col` 入场过渡挂在 `.np-cmt-col` 外层，折叠动画只动其子元素和 `.np-content` 的栅格，两者不冲突。
- 栅格过渡只在折叠时以 WAAPI 运行，不给 `.np-content` 挂 CSS transition（否则改窗口大小也会触发过渡）。
- 900px 以下桌面为单列滚动布局，下方区域折叠同样适用。

## 浏览器验收清单（后续）

1920×1080：
- 评论栏展开/折叠：录 Performance，确认无长任务（>50ms），帧率稳定；折叠后歌词栏右缘与 <1440 两栏布局的右缘一致（距右边缘 72px），细轨贴右边缘内 12px、宽 28px、与内容行同高。
- 细轨显示竖排 `CMT` 与评论数；点击/Enter/Space 展开，焦点回到 `[-]`。
- 评论列表折叠前后滚动位置保持。
- 下方区域折叠：歌词框变高，细条高 26px；展开后 UpNext/Telemetry 不重放入场动画。
- 两块同时折叠后刷新页面、关开详情页：状态保持，入场动画正常，封面飞行正常。
- 动画中按 Esc 关闭详情页：无残留框线，重开后状态正确。
- 动画中把窗口拖到 <1440：无错位。

1366×768：
- 无评论第三栏，`[CMT n]` 抽屉照常。
- 下方区域折叠/展开正常，歌词框向下延伸。

其它：开启系统“减少动态效果”后直接切换；手机宽度（≤640）详情页无任何变化。
