# 详情页封面 ↔ 黑胶唱片设计

日期：2026-11-04
状态：已确认（见 `.superpowers/vinyl-cover-decisions.md`）

## 目标

详情页封面点击可在「方形封面」与「像素风黑胶」之间切换；切换带全息扫描感；黑胶播放时旋转、唱臂落下，暂停时慢慢停转、唱臂抬起；纹路反光跟 `player.analyser` 律动。状态写入 `himusic.settings`，刷新保持。

范围：桌面详情左栏封面 + 手机详情 play 层封面。封面墙 / MiniDock / 播放栏缩略图不变。

## 外观

- **方形**：现状 `CoverImage` + `.np-corners`。
- **黑胶**：圆形唱片；像素感同心纹路（步进径向渐变 / `image-rendering`）；中心标签为同一封面图圆形裁切；右侧唱臂（播放落下、暂停抬起）。
- 减弱动效：不旋转、唱臂瞬切、模式切换无扫描直接换。

## 切换动效（扫描推扫揭示，约 680ms）

扫描线自上而下扫过：线**上方**露出新封面（方 ↔ 黑胶），线**下方**保留旧封面；`clip-path` 双层同步推进。无碎粒子 / 马赛克。

`prefers-reduced-motion: reduce`：跳过，直接改 `coverVinyl`。

## 旋转与律动

- 旋转：`transform: rotate()` 在独立 `.vinyl-spin` 盒子上（合成层）。播放用 CSS infinite；暂停时读当前矩阵角度，WAAPI 再转一小段后 ease-out 停下。
- 律动：低频能量只写到反光层自身的 `opacity` / `filter`（小节点），不写大容器 CSS 变量。
- 唱臂与旋转解耦，不跟盘转。

## 状态与接线

- `settings.coverVinyl: boolean`（默认 `false`），随现有 settings 持久化。
- 新组件 `VinylCover.vue`：接收 `sources`、`playing`、`analyser`；点击切换（移动距离超阈值则忽略，避免与手机层拖拽冲突）。
- `NowPlaying.vue` 两处 `.np-cover` 换成 `VinylCover`；黑胶态隐藏角标。
- 开合 ghost：`coverVinyl` 时 ghost 用 `border-radius: 50%`，落点仍是 `.np-cover` 的方框几何（圆内接）。

## 非目标

- 不改封面墙磁贴、不新增设置面板开关（只靠封面点击）。
- 不做真实物理唱臂循轨；不做 3D。
