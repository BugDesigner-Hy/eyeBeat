# 关机屏设计

日期：2026-11-04  
状态：已确认（见 `.superpowers/power-off-decisions.md`，入口 1B、时钟 2C）

## 目标

全屏 CRT 风格待机屏：关机暂停播放，开机从暂停处续播；七段时钟 + 待机机器人互动。

## 入口

- 桌面：顶栏最右像素电源键
- 手机：顶栏菜单按钮旁电源键（不依赖抽屉）
- 快捷键 `P`（输入框内忽略）
- 命令面板 SYSTEM：「关机 / 开机」

## 状态

`ui.poweredOff`。关机时收起 menu / palette / fx / detail / comments；`html.powered-off` 可选用于禁氛围。刷新不恢复关机态。

播放：关机前若正在播 → `toggle()` 暂停并记 `resumeOnBoot`；开机后若标记为真再 `toggle()`。

## 画面

竖屏堆叠：上时钟、中机器人、下呼吸电源键。宽屏同样居中，留白更大。

- **时钟**：默认 `HH:MM`；点机器人切 `MM-DD`；七段 SVG，灭笔画残影，强调色辉光；切换/点击时闪一下
- **机器人**：像素小屏头 + 天线灯；`RobotEyes`（on、无 analyser）；短按表情约 1.2s；连点至 10 烦躁摇晃；长按 ~600ms 开机
- **电源键**：关机屏底部微光呼吸；点击开机

## CRT

- 关机 ~700ms：亮屏 → 压横线 → 缩亮点 → 黑场 → 待机内容与时钟逐段点亮
- 开机 ~600ms：亮点展开 + `HI/MUSIC · BOOT OK` 滚过 → 卸遮罩
- `prefers-reduced-motion`：瞬切

## 组件

`PowerOffScreen.vue`、`SevenSegmentClock.vue`、`StandbyBot.vue`；接线 `ui` / `App` / `AppHeader` / `commands`。
