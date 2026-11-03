# 磁带卡座场景（DECK）设计

日期：2026-11-03
状态：已确认，分两期实现

- 一期：场景切换、磁带盒列表与翻页、抽带 / 拖拽装带 / 弹出换带、卡座外观与 PLAY / PAUSE / STOP·EJECT（REC / REW / FF 先做成按下即弹回）、带盘转动与卷径、带尾自动停止、Vitest。计划见 `docs/superpowers/plans/2026-11-03-cassette-deck-phase1.md`。
- 二期：快进 / 倒带、机械计数器、VU 表、合成音效、程序化纹理。
- 一期调整：每页 6 盒（两行 × 3），8 盒在 x 80–700 的区域里过窄，J 卡文字放不下。

## 目标

在现有「封面墙」之外新增第二个可切换场景：桌面上摆着若干磁带盒，用户选中一盒、抽出磁带、拖进一台卧式 Hi-Fi 卡座，按下 PLAY 开始播放。画面要求写实，卡座按键要像真机一样有行程和机械联动。

## 范围

做：

- 2.5D 分层场景（写实背景图 + SVG/CSS 精绘部件 + 程序化纹理）
- 磁带盒列表、点击抽带、拖拽装带、弹出
- 卡座琴键 REC / REW / PLAY / FF / STOP·EJECT / PAUSE 及联动
- 带盘转动与磁带卷半径随进度变化、机械计数器、双 VU 表
- 合成机械音效
- 场景切换、按需加载

不做（本期）：A/B 面翻面、录音、自动换带、磁带音色模拟、移动端专门适配（仅等比缩放）。

## 技术路线

2.5D 分层，不引入 3D 引擎。

- 背景：AI 生成的写实图 `public/scene/desk.jpg`。靠墙的木质桌面，正面略俯视，柔和窗光来自左上。画面左侧留给磁带盒，右侧留给卡座，这两块区域不画任何物体。
- 前景部件：Vue 组件内联 SVG + CSS。透视只用于盒盖翻开、仓门开合等局部 `rotateX`。
- 质感：`textures.ts` 用 canvas 生成拉丝金属、塑料噪点纹理（data URL，启动时生成一次并缓存），作为 CSS `background-image` 叠加。
- 光照一致性：所有阴影统一向右下投射（光源左上），抬起状态阴影更大、更虚。

## 舞台

- 设计坐标 1600 × 900。`scale = min(视口宽 / 1600, 视口高 / 900)`，舞台居中。背景图 `object-fit: cover` 铺满整个视口，舞台外的区域也有画面。
- 拖拽时用 `scale` 把指针坐标换算成舞台坐标。
- 区域划分（设计坐标）：磁带盒区约 x 80–700；卡座约 x 760–1520、y 330–760。

## 组件

| 文件 | 职责 |
|---|---|
| `src/scenes/deck/DeckScene.vue` | 舞台缩放、布局、翻页、拖拽调度、装带 / 弹出动画编排 |
| `src/scenes/deck/CassetteCase.vue` | 磁带盒：透明外壳、J 卡（封面 + 歌名 + 歌手）、盒盖开合、悬停抬起 |
| `src/scenes/deck/Cassette.vue` | 磁带本体：外壳、标签（歌名 / 歌手）、窗口内的两个带盘与磁带卷（props：两侧半径、两侧转角） |
| `src/scenes/deck/TapeDeck.vue` | 卡座：面板、带仓与仓门、计数器、VU 表、琴键排、电源 / 状态 LED |
| `src/scenes/deck/DeckKey.vue` | 单个琴键：按下行程、锁定、回弹、禁用 |
| `src/scenes/deck/VuMeter.vue` | 指针式 VU 表 + PEAK 灯 |
| `src/scenes/deck/deckMachine.ts` | 卡座状态机，纯函数（不依赖 Vue / DOM） |
| `src/scenes/deck/reels.ts` | 带盘半径、转角、计数器的纯计算 |
| `src/scenes/deck/useDeck.ts` | 把状态机、带盘动画循环和 player store 粘合起来的组合式函数 |
| `src/scenes/deck/sfx.ts` | Web Audio 合成机械音效 |
| `src/scenes/deck/textures.ts` | 程序化纹理 |

`DeckScene` 通过 `defineAsyncComponent` 懒加载，单独打包。

## 磁带盒列表

- 数据：`player.tracks`（即封面墙当前的榜单或搜索结果），每页 8 盒。用左右箭头翻页，翻到最后一页时调用 `player.loadList()` 加载更多。
- 盒子按两行扇形错落摆放，每个盒子的旋转角度由曲目 ID 哈希得到（±4°），刷新后保持一致。
- 已装入卡座的那盒显示为「空盒」（盒内没有磁带）。

## 交互

1. 悬停磁带盒：抬起 6px，阴影变大。
2. 点击：其他已打开的盒子先合上；当前盒子的盒盖绕顶边翻开（`rotateX`，约 300ms），磁带上滑露出一半，鼠标变成 `grab`。
3. 拖拽（Pointer Events，带 pointer capture）：磁带跟随指针，按水平速度倾斜（最大 ±8°），阴影变大。
4. 进入卡座带仓的投放区：若仓门是关的，自动弹开；投放区高亮。
5. 松手：
   - 在投放区内：磁带吸附到带仓位置并缩小嵌入，仓门合上，播放「咔哒」声。若仓里原本有磁带，旧磁带先弹出、飞回它自己的盒子。
   - 在投放区外：磁带飞回盒子，盒盖合上。
6. 键盘 / 无障碍：磁带盒是 `button`；聚焦后按 Enter 直接装带（播放同一套动画）。

## 卡座状态机（`deckMachine.ts`）

状态：

- `door`: `'closed' | 'open'`
- `cassette`: `trackId | null`
- `transport`: `'stop' | 'play' | 'ff' | 'rew'`
- `pause`: `boolean`

琴键事件及规则：

| 事件 | 条件 | 结果 |
|---|---|---|
| `insert(id)` | 任意 | 若 transport ≠ stop 先停止；cassette = id；door = closed |
| `play` | 有磁带且仓门关闭 | transport = play（锁定）；FF / REW 弹起 |
| `play` | 无磁带或仓门开着 | 键按下后立即弹回（`rejected`） |
| `pause` | 任意 | pause 取反（锁定 / 弹起） |
| `ffDown` / `rewDown` | 有磁带且仓门关闭 | transport = ff / rew；PLAY 弹起 |
| `ffUp` / `rewUp` | 当前是对应状态 | transport = stop |
| `stop` | transport ≠ stop | transport = stop；所有锁定键弹起（pause 保持不变，与真机一致） |
| `stop` | transport = stop | 弹出：door = open（cassette 保留，可被拖走或换带） |
| `rec` | 任意 | 拒绝并弹回（没有写保护片） |
| `tapeEnd` | transport = play 或 ff | transport = stop（自动停止） |
| `tapeStart` | transport = rew | transport = stop |

状态机返回新状态和一个副作用列表（例如 `{ type: 'sfx', name: 'latch' }`、`{ type: 'player', action: 'play' }`），由 `useDeck` 执行副作用。

## 与播放器的对接（`useDeck.ts`）

- `transport = play` 且 pause = false：若 `player.current` 就是仓内曲目且已加载，则恢复播放；否则调用 `player.play(track)`。
- `pause = true` 或 `transport = stop`：暂停 player。
- 停止不回到开头，进度保持在原处（磁带本来就这样）。
- FF / REW：按住期间每帧 seek ±(dt × 12)，带盘以 20 倍速转动，并循环播放「沙沙」走带声。
- 装入新磁带：player 暂停，进度从 0 开始。
- 自动停止：player store 新增 `stopAtEnd` 开关（进入卡座场景时为 true），开启后结尾不自动下一首、不触发交叉淡化的提前切换，播放结束时发出 `tapeEnd`。
- 外部切歌：在卡座场景里通过命令面板或键盘切歌时，仓内磁带标签直接换成新曲目（不做动画），PLAY 状态与 player 保持一致。
- 播放失败：PLAY 弹起，状态 LED 闪红，错误提示沿用全局 toast。

## 带盘与计数器（`reels.ts`）

- 轮毂半径 r0，满卷半径 R，进度 p ∈ [0, 1]，按面积守恒计算：
  - 供带盘 `rs = sqrt(r0² + (R² − r0²)(1 − p))`
  - 收带盘 `rt = sqrt(r0² + (R² − r0²) p)`
- 走带线速度 v 恒定（取视觉上舒服的值）。每帧转角增量为 `Δθ = v·dt / r`，两盘各自用自己的半径计算，所以小盘转得更快。快进 / 倒带时 v × 20，方向随走带方向变化。
- 计数器：值为收带盘累计圈数的整数部分 mod 1000，以 3 位滚轮数字显示（数字滚动带缓动）。复位按钮把它清零。

## VU 表

- 读取 `player.analyser` 的时域数据计算 RMS，转换成 dB 后映射到 −20 ~ +3 VU 刻度。
- 指针用二阶阻尼弹簧模拟（约 300ms 积分时间，带轻微过冲）。
- 左右两表共用同一个单声道信号，右表加一点相位噪声，让两根指针不完全同步。
- 电平超过 +1 VU 时 PEAK 灯亮 120ms。
- 没有 analyser 时（音频流无 CORS）退化为跟随播放状态的模拟摆动。

## 音效（`sfx.ts`）

用独立的 AudioContext 合成，不经过音乐的 EQ / bitcrush 链路：

- `latch`：按键锁定，低频短促咔嗒（带通噪声 + 快速包络）
- `release`：按键弹起，较轻
- `reject`：按下又被顶回，两声连续
- `door`：仓门开合，带弹簧感的两段
- `insert`：磁带入仓
- `wind`：快进 / 倒带时循环的走带声（滤波噪声，音高随速度变化）
- `end`：带尾自动停止的「咔」

音量跟随全局音量的 0.5 倍；静音时音效也静音。

## 场景切换

- `ui` store 新增 `scene: 'wall' | 'deck'`，持久化到 localStorage。
- 切换入口：顶栏 `[WALL] / [DECK]` 按钮，以及命令面板「场景：封面墙」「场景：磁带卡座」。
- 切换时淡入淡出（步进式过渡）；音乐不中断。
- 卡座场景下：隐藏底部播放栏和墙后歌词；歌词面板可通过 `L` 键或卡座右上角的 `[LRC]` 打开；Space 等同于按 PLAY / PAUSE。

## 测试

- 引入 Vitest。
- `deckMachine.ts`：覆盖上表每一条规则，以及联动组合（播放中按 FF、暂停时按 STOP、仓门开着时按 PLAY、带尾停止等）。
- `reels.ts`：p = 0 / 0.5 / 1 时的半径；面积守恒（rs² + rt² 为常数）；小盘角速度更快。
- 手动浏览器验证：抽带、拖入、换带、按键联动、快进倒带、带尾停止、场景切换、歌词面板。
