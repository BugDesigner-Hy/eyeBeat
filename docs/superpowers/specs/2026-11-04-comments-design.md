# 详情页评论区设计

日期：2026-11-04
状态：已确认，待写实现计划

## 背景与目标

详情页（`NowPlaying.vue`）目前有封面与信息、歌词、接下来播放和数据面板，没有评论。目标是对有评论的歌曲展示只读评论，可以无限下滑加载。

**非目标**：发表评论、点赞、展开楼中楼、登录相关的评论能力。

## 数据来源（已实测）

| | 网易云（`/ncm` 代理，免登录可用） | Audius（公开 API，免 Key） |
| --- | --- | --- |
| 热门 | `comment/new?type=0&id=&sortType=2&pageNo=1&pageSize=10` | `tracks/{id}/comments?sort_method=top&limit=10` |
| 最新 | `comment/new?type=0&id=&sortType=3&pageSize=20&pageNo=n&cursor=` | `tracks/{id}/comments?sort_method=newest&limit=20&offset=` |
| 分页 | 返回 `data.cursor`、`data.hasMore`；下一页带上 `cursor` 和 `pageNo+1` | offset 递增，返回条数少于 limit 视为结束 |
| 总数 | `data.totalCount` | 曲目对象的 `comment_count`（列表接口不返回总数） |
| 用户 | `user.nickname`、`user.avatarUrl` | `related.users` 里按 `user_id` 查 `name` / `profile_picture['150x150']` |
| 时间 | `time`（毫秒）、`timeStr`（已是相对时间） | `created_at`（ISO） |
| 点赞 | `likedCount` | `react_count` |
| IP 属地 | `ipLocation.location` | 无 |
| 回复 | `beReplied[0]`：被回复的 `user.nickname` 和 `content` | 楼中楼：`replies[]` + `reply_count` |
| 特有 | 表情码如 `[装可爱]`，按纯文本显示 | `track_timestamp_s`：评论在歌曲中的时间点 |

## 数据模型（`src/api/types.ts`）

```ts
export interface TrackComment {
  id: string
  user: { name: string; avatar?: string }
  content: string
  /** 毫秒时间戳 */
  time: number
  /** 音乐源已给出的相对时间文案，没有时前端按 time 计算 */
  timeLabel?: string
  likes: number
  location?: string
  /** 被回复的原评论（网易云） */
  replyTo?: { user: string; content: string }
  /** 楼中楼的前几条回复与总回复数（Audius） */
  replies?: TrackComment[]
  replyCount?: number
  /** 评论在歌曲中的时间点（秒，Audius） */
  at?: number
}

export interface CommentPage {
  /** 只在第一页返回 */
  hot?: TrackComment[]
  items: TrackComment[]
  /** 下一页游标，null 表示没有更多 */
  next: string | null
  /** 第一页返回，可能缺省 */
  total?: number
}
```

`MusicProvider` 增加可选方法 `getComments?(track: Track, cursor?: string): Promise<CommentPage>`。不传 `cursor` 时返回第一页（热门 + 第一页最新）。游标是不透明字符串，由各音乐源自行编码（网易云编码 `pageNo` 和 `cursor`，Audius 编码 offset）。

## 状态（新 store `src/stores/comments.ts`）

- 按 `provider:trackId` 缓存：`hot`、`items`、`next`、`total`、`loading`、`error`、`done`。
- 详情页打开且当前曲目变化时加载第一页；已有缓存则不重复请求。
- `loadMore()`：有 `next` 且不在加载中时请求下一页并追加，按 `id` 去重（热门和最新可能重复，最新里与热门重复的保留）。
- 请求返回时若曲目已切换，丢弃结果。
- `visible`（computed）：音乐源支持、第一页已返回、且热门加最新至少 1 条。加载中和出错时不显示（`error` 不提示，整块隐藏）。
- 缓存最多保留最近 20 首，超出丢弃最早的。

## 界面

### 组件 `src/components/DetailComments.vue`

- 标题行：`// COMMENTS` + 总数（像素字体），与详情页其他区块的标题样式一致。
- 分区：`HOT`（热门，没有则不显示该段）和 `LATEST`。
- 单条评论：
  - 左侧头像 28px：请求小图（网易云加 `?param=32y32`，Audius 用 150x150），`image-rendering: pixelated`，失败时显示像素方块占位（取昵称首字或纯色块）。
  - 第一行：昵称 · 相对时间 · IP 属地（Audius 显示 `@0:07` 时间点代替属地）；右侧点赞数（像素心形图标 + 数字，只读）。
  - 正文：保留换行，长单词 `overflow-wrap: anywhere`。
  - 网易云回复：正文下方的引用块，左侧强调色竖线，「回复 @昵称：内容」，最多两行省略。
  - Audius 楼中楼：主评论下方缩进最多 2 条回复（同样的单条样式，去掉头像或缩小），多出的显示「+N 条回复」，只读不展开。
- 底部：加载中显示 `LOADING…`；没有更多显示 `// END`；IntersectionObserver 观察底部哨兵（以评论列表自身为 root，提前 400px 触发）。
- 新加载的一页逐条淡入（沿用 `.np-in` 的节奏，只对新追加的条目）。
- 减弱动效时不做淡入。

### 桌面端布局（> 640px）

- 宽度 ≥ 1440px：`.np-content` 变三栏：`min(44vh, 40vw) | minmax(0, 1fr) | clamp(300px, 22vw, 380px)`。评论栏占右侧整列高度，自身滚动。没有评论时保持现在的两栏，不留空栏；评论出现时整列从右侧滑入淡入。
- 宽度 < 1440px：评论收成抽屉。`np-head` 右侧出现 `[CMT 69]` 按钮（总数未知时只显示 `[CMT]`），点击后评论栏从右侧滑出覆盖在内容上方（宽度同上，带左侧阴影和分隔线），再点按钮或按 Esc 收回。Esc 优先级：菜单 → 评论抽屉 → 详情页 → FX。切歌、关闭详情页时抽屉收回。

### 手机端（≤ 640px）

- 分页从 3 页变 4 页：`01 PLAY · 02 LRC · 03 INFO · 04 CMT`。`DetailPage` 类型改为 `0 | 1 | 2 | 3`，页码点下划线的偏移公式不变（每页 68px）。
- 没有评论时不渲染第 4 页，页码点也只显示 3 个；评论稍后到达时再追加，不跳页。
- 第 4 页自身纵向滚动（和信息页一样用 `.np-page-scroll`），哨兵以该页为 root。
- 当前停在第 4 页时切到一首没有评论的歌：回到第 3 页。

## 错误与边界

- 网易云代理不可达（502）或返回非 200：整块隐藏，不弹提示。
- 加载下一页失败：底部显示 `ERR · [RETRY]`，点击重试。
- 未登录对网易云评论没有影响（已实测免登录可用），请求带 `noCookie=true` 时也正常；沿用客户端现有的 cookie 逻辑，不额外处理。
- 评论内容只当纯文本渲染（不使用 `v-html`）。

## 验证

- 网易云和 Audius 各一首有评论的歌：热门、最新、无限加载到底、回复引用 / 楼中楼显示正确。
- 一首没有评论的歌：桌面不出现第三栏和按钮，手机不出现第 4 页。
- 1920 / 1440 / 1366 宽度：三栏与抽屉切换；抽屉 Esc 收回。
- 390×844：第 4 页滑动、无限加载、页码点。
- 切歌时旧请求结果不串到新歌。
- `pnpm exec vue-tsc --noEmit` 与 `pnpm build` 通过。
