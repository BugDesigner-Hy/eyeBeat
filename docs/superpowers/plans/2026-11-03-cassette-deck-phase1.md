# 磁带卡座场景（一期）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增可切换的「磁带卡座」场景：从磁带盒抽出磁带、拖进 Hi-Fi 卡座、按 PLAY 播放，带盘随进度转动，带尾自动停止。

**Architecture:** 2.5D 分层舞台（AI 写实背景 + SVG/CSS 部件），固定 1600×900 设计坐标等比缩放。卡座逻辑是纯函数状态机 `deckMachine.ts`，带盘几何是纯函数 `reels.ts`，二者用 Vitest 覆盖；`useDeck.ts` 是全应用单例，把状态机和 player store 粘合；`DeckScene.vue` 负责布局、拖拽和飞行动画，通过 `defineAsyncComponent` 单独打包。

**Tech Stack:** Vue 3.5（`<script setup>`、`useId`）、Pinia、TypeScript 5.9（strict、noUnusedLocals）、Vite 8、Vitest。

## Global Constraints

- 设计规格：`docs/superpowers/specs/2026-11-03-cassette-deck-scene-design.md`（一期范围见其「状态」一节）。
- 包管理只用 `pnpm`（本机 npm 损坏）；Node 24。
- 项目不是 git 仓库：本计划不含提交步骤。
- 舞台设计坐标 1600 × 900，`scale = min(innerWidth / 1600, innerHeight / 900)`。
- 每页 6 个磁带盒（两行 × 3）。
- 主题色用 `var(--accent)`，缓动用 `var(--ease-out)`；字体变量 `--font-pixel` / `--font-mono` / `--font-sans`。
- 所有阴影向右下投射（光源左上）。
- 尊重 `prefers-reduced-motion: reduce`：关闭位移类过渡。
- 一期不做：快进 / 倒带的实际走带、计数器、VU 表、音效、程序化纹理（REC / REW / FF 键按下即弹回）。
- 类型检查命令：`pnpm exec vue-tsc --noEmit`（期望无输出、退出码 0）。

## 文件结构

| 文件 | 职责 |
|---|---|
| `vitest.config.ts`（新建） | 独立的测试配置，不加载 Vite 插件（避免拉起网易云 API 子进程） |
| `src/scenes/deck/reels.ts`（新建） | 带盘半径（面积守恒）与转角增量 |
| `src/scenes/deck/reels.test.ts`（新建） | reels 单测 |
| `src/scenes/deck/deckMachine.ts`（新建） | 卡座状态机 |
| `src/scenes/deck/deckMachine.test.ts`（新建） | 状态机单测 |
| `src/stores/player.ts`（改） | `stopAtEnd` / `tapeEnds` / `failures` / `pause()` |
| `src/stores/ui.ts`（改） | `scene` / `setScene` |
| `src/App.vue`（改） | 按场景渲染、懒加载 DeckScene、B 键与 `--dock-h` |
| `src/components/AppHeader.vue`（改） | `[WALL] [DECK]` 切换按钮 |
| `src/commands.ts`（改） | 命令面板的场景命令 |
| `src/styles/main.css`（改） | 场景切换过渡 |
| `vite.config.ts`（改） | PWA 预缓存排除 `scene/**` |
| `public/scene/desk.png`（新建） | AI 生成的桌面背景 |
| `src/scenes/deck/Cassette.vue`（新建） | 磁带本体 SVG |
| `src/scenes/deck/CassetteCase.vue`（新建） | 磁带盒 |
| `src/scenes/deck/DeckKey.vue`（新建） | 单个琴键 |
| `src/scenes/deck/TapeDeck.vue`（新建） | 卡座面板 |
| `src/scenes/deck/useDeck.ts`（新建） | 状态机 ↔ player 粘合、带盘动画 |
| `src/scenes/deck/DeckScene.vue`（新建） | 舞台、磁带盒列表、拖拽与飞行动画 |

---

### Task 1: Vitest 与带盘计算 `reels.ts`

**Files:**
- Create: `vitest.config.ts`
- Create: `src/scenes/deck/reels.ts`
- Test: `src/scenes/deck/reels.test.ts`
- Modify: `package.json`（scripts 增加 `test`）

**Interfaces:**
- Produces:
  - `HUB_R = 11`、`FULL_R = 30`、`TAPE_SPEED = 24`（Cassette SVG 坐标单位）
  - `interface ReelRadii { supply: number; takeup: number }`
  - `reelRadii(progress: number, r0?: number, R?: number): ReelRadii`
  - `spinDelta(speed: number, dt: number, r: number): number`（度）

- [ ] **Step 1: 安装 Vitest 并加脚本**

Run: `pnpm add -D vitest`
Expected: devDependencies 出现 `vitest`。

在 `package.json` 的 `scripts` 中加入：

```json
"test": "vitest run"
```

- [ ] **Step 2: 新建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: 写失败的测试 `src/scenes/deck/reels.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { FULL_R, HUB_R, reelRadii, spinDelta } from './reels'

describe('reelRadii', () => {
  it('新带：供带盘满卷，收带盘只剩轮毂', () => {
    expect(reelRadii(0)).toEqual({ supply: FULL_R, takeup: HUB_R })
  })

  it('带尾：两盘互换', () => {
    expect(reelRadii(1)).toEqual({ supply: HUB_R, takeup: FULL_R })
  })

  it('半程：两盘一样大', () => {
    const r = reelRadii(0.5)
    expect(r.supply).toBeCloseTo(r.takeup, 10)
  })

  it('任意进度下两盘卷绕面积之和不变', () => {
    const total = FULL_R ** 2 + HUB_R ** 2
    for (const p of [0, 0.13, 0.5, 0.77, 1]) {
      const r = reelRadii(p)
      expect(r.supply ** 2 + r.takeup ** 2).toBeCloseTo(total, 8)
    }
  })

  it('越界与非法进度被夹到 [0, 1]', () => {
    expect(reelRadii(-1)).toEqual(reelRadii(0))
    expect(reelRadii(2)).toEqual(reelRadii(1))
    expect(reelRadii(Number.NaN)).toEqual(reelRadii(0))
  })
})

describe('spinDelta', () => {
  it('半径越小转得越快', () => {
    expect(spinDelta(24, 1 / 60, HUB_R)).toBeGreaterThan(spinDelta(24, 1 / 60, FULL_R))
  })

  it('走过一个周长正好转一整圈', () => {
    const r = 20
    expect(spinDelta(2 * Math.PI * r, 1, r)).toBeCloseTo(360, 8)
  })
})
```

- [ ] **Step 4: 运行，确认失败**

Run: `pnpm test`
Expected: FAIL，提示无法解析 `./reels`。

- [ ] **Step 5: 实现 `src/scenes/deck/reels.ts`**

```ts
/** 带盘几何：半径按卷绕面积守恒，转角按恒定线速度积分。单位均为 Cassette SVG 坐标 */

export const HUB_R = 11
export const FULL_R = 30
/** 走带线速度（单位 / 秒），取视觉上舒服的值 */
export const TAPE_SPEED = 24

export interface ReelRadii {
  supply: number
  takeup: number
}

export function reelRadii(progress: number, r0 = HUB_R, R = FULL_R): ReelRadii {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  const span = R * R - r0 * r0
  return {
    supply: Math.sqrt(r0 * r0 + span * (1 - p)),
    takeup: Math.sqrt(r0 * r0 + span * p),
  }
}

/** 线速度 speed 下，半径 r 的带盘在 dt 秒内转过的角度（度） */
export function spinDelta(speed: number, dt: number, r: number): number {
  return ((speed * dt) / r) * (180 / Math.PI)
}
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm test`
Expected: `reels.test.ts` 7 个用例全部 PASS。

---

### Task 2: 卡座状态机 `deckMachine.ts`

**Files:**
- Create: `src/scenes/deck/deckMachine.ts`
- Test: `src/scenes/deck/deckMachine.test.ts`

**Interfaces:**
- Produces:
  - `type DeckKeyId = 'rec' | 'rew' | 'play' | 'ff' | 'stop' | 'pause'`
  - `interface DeckState { door: 'open' | 'closed'; cassette: string | null; transport: 'stop' | 'play'; pause: boolean }`
  - `type DeckEvent = { type: 'press'; key: DeckKeyId } | { type: 'openDoor' } | { type: 'insert'; id: string } | { type: 'remove' } | { type: 'tapeEnd' } | { type: 'relabel'; id: string } | { type: 'sync'; playing: boolean }`
  - `type DeckEffect = { type: 'reject'; key: DeckKeyId }`
  - `interface DeckStep { state: DeckState; effects: DeckEffect[] }`
  - `INITIAL_DECK: DeckState`
  - `deckReduce(s: DeckState, e: DeckEvent): DeckStep`
  - `isRunning(s: DeckState): boolean`

规则（一期）：

| 事件 | 条件 | 结果 |
|---|---|---|
| `press play` | 有磁带且仓门关 | transport = play |
| `press play` | 否则 | 状态不变，effect `reject play` |
| `press pause` | 任意 | pause 取反 |
| `press stop` | transport = play | transport = stop（pause 保持） |
| `press stop` | transport = stop | 仓门开 ↔ 关 |
| `press rec / rew / ff` | 任意 | 状态不变，effect `reject` |
| `openDoor` | 仓门关 | door = open，transport = stop |
| `insert(id)` | 任意 | cassette = id，door = closed，transport = stop |
| `remove` | 仓门开 | cassette = null |
| `tapeEnd` | transport = play | transport = stop |
| `relabel(id)` | 有磁带 | cassette = id |
| `sync(true)` | 有磁带且仓门关 | transport = play，pause = false |
| `sync(false)` | 任意 | transport = stop |

- [ ] **Step 1: 写失败的测试 `src/scenes/deck/deckMachine.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  deckReduce,
  INITIAL_DECK,
  isRunning,
  type DeckEvent,
  type DeckKeyId,
  type DeckState,
} from './deckMachine'

const press = (key: DeckKeyId): DeckEvent => ({ type: 'press', key })
const run = (s: DeckState, ...events: DeckEvent[]) => events.reduce((acc, e) => deckReduce(acc, e).state, s)

const loaded: DeckState = { ...INITIAL_DECK, cassette: 't1' }
const playing: DeckState = { ...loaded, transport: 'play' }

describe('PLAY', () => {
  it('有磁带时锁定为播放', () => {
    const step = deckReduce(loaded, press('play'))
    expect(step.state.transport).toBe('play')
    expect(step.effects).toEqual([])
  })

  it('没有磁带时被顶回', () => {
    const step = deckReduce(INITIAL_DECK, press('play'))
    expect(step.state).toEqual(INITIAL_DECK)
    expect(step.effects).toEqual([{ type: 'reject', key: 'play' }])
  })

  it('仓门开着时被顶回', () => {
    const open: DeckState = { ...loaded, door: 'open' }
    const step = deckReduce(open, press('play'))
    expect(step.state).toEqual(open)
    expect(step.effects).toEqual([{ type: 'reject', key: 'play' }])
  })
})

describe('PAUSE', () => {
  it('取反暂停锁定，暂停时不算走带', () => {
    const paused = run(playing, press('pause'))
    expect(paused.pause).toBe(true)
    expect(isRunning(paused)).toBe(false)
    expect(run(paused, press('pause')).pause).toBe(false)
  })
})

describe('STOP / EJECT', () => {
  it('播放中按下：停止，暂停锁定保持不变', () => {
    const s = run({ ...playing, pause: true }, press('stop'))
    expect(s.transport).toBe('stop')
    expect(s.pause).toBe(true)
    expect(s.door).toBe('closed')
  })

  it('停止时按下：仓门开关切换', () => {
    const opened = run(loaded, press('stop'))
    expect(opened.door).toBe('open')
    expect(opened.cassette).toBe('t1')
    expect(run(opened, press('stop')).door).toBe('closed')
  })
})

describe('未接入的键', () => {
  it.each(['rec', 'rew', 'ff'] as const)('%s 被顶回且状态不变', (key) => {
    const step = deckReduce(playing, press(key))
    expect(step.state).toEqual(playing)
    expect(step.effects).toEqual([{ type: 'reject', key }])
  })
})

describe('仓门与磁带', () => {
  it('openDoor 会停止走带并打开仓门', () => {
    const s = run(playing, { type: 'openDoor' })
    expect(s).toEqual({ ...loaded, door: 'open' })
  })

  it('insert 装入磁带、关门、停止', () => {
    const s = run({ ...playing, door: 'open' }, { type: 'insert', id: 't2' })
    expect(s).toEqual({ ...INITIAL_DECK, cassette: 't2' })
  })

  it('remove 只在仓门开着时取出', () => {
    expect(run(loaded, { type: 'remove' }).cassette).toBe('t1')
    expect(run({ ...loaded, door: 'open' }, { type: 'remove' }).cassette).toBeNull()
  })
})

describe('与播放器同步', () => {
  it('带尾自动停止', () => {
    expect(run(playing, { type: 'tapeEnd' }).transport).toBe('stop')
    expect(run(loaded, { type: 'tapeEnd' })).toEqual(loaded)
  })

  it('relabel 只替换已有磁带的标签', () => {
    expect(run(playing, { type: 'relabel', id: 't9' })).toEqual({ ...playing, cassette: 't9' })
    expect(run(INITIAL_DECK, { type: 'relabel', id: 't9' })).toEqual(INITIAL_DECK)
  })

  it('sync(true) 让 PLAY 锁定并解除暂停', () => {
    expect(run({ ...loaded, pause: true }, { type: 'sync', playing: true })).toEqual(playing)
    expect(run(INITIAL_DECK, { type: 'sync', playing: true })).toEqual(INITIAL_DECK)
  })

  it('sync(false) 停止走带', () => {
    expect(run(playing, { type: 'sync', playing: false }).transport).toBe('stop')
  })
})

it('完整流程：装带 → 播放 → 暂停 → 停止 → 弹出', () => {
  const s = run(
    INITIAL_DECK,
    { type: 'insert', id: 't1' },
    press('play'),
    press('pause'),
    press('stop'),
    press('stop'),
  )
  expect(s).toEqual({ door: 'open', cassette: 't1', transport: 'stop', pause: true })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm test`
Expected: FAIL，提示无法解析 `./deckMachine`。

- [ ] **Step 3: 实现 `src/scenes/deck/deckMachine.ts`**

```ts
/** 卡座状态机：纯函数，不依赖 Vue / DOM */

export type DeckKeyId = 'rec' | 'rew' | 'play' | 'ff' | 'stop' | 'pause'

export interface DeckState {
  door: 'open' | 'closed'
  /** 仓内磁带的曲目 ID */
  cassette: string | null
  transport: 'stop' | 'play'
  pause: boolean
}

export type DeckEvent =
  | { type: 'press'; key: DeckKeyId }
  | { type: 'openDoor' }
  | { type: 'insert'; id: string }
  | { type: 'remove' }
  | { type: 'tapeEnd' }
  /** 在场景外切了歌：仓内磁带直接换标签 */
  | { type: 'relabel'; id: string }
  /** 播放器状态被外部改变后对齐琴键 */
  | { type: 'sync'; playing: boolean }

export type DeckEffect = { type: 'reject'; key: DeckKeyId }

export interface DeckStep {
  state: DeckState
  effects: DeckEffect[]
}

export const INITIAL_DECK: DeckState = { door: 'closed', cassette: null, transport: 'stop', pause: false }

const same = (state: DeckState): DeckStep => ({ state, effects: [] })
const reject = (state: DeckState, key: DeckKeyId): DeckStep => ({ state, effects: [{ type: 'reject', key }] })
const ready = (s: DeckState) => !!s.cassette && s.door === 'closed'

export const isRunning = (s: DeckState) => s.transport === 'play' && !s.pause

export function deckReduce(s: DeckState, e: DeckEvent): DeckStep {
  switch (e.type) {
    case 'press':
      return press(s, e.key)
    case 'openDoor':
      return s.door === 'open' ? same(s) : same({ ...s, door: 'open', transport: 'stop' })
    case 'insert':
      return same({ ...s, cassette: e.id, door: 'closed', transport: 'stop' })
    case 'remove':
      return s.door === 'open' ? same({ ...s, cassette: null }) : same(s)
    case 'tapeEnd':
      return s.transport === 'play' ? same({ ...s, transport: 'stop' }) : same(s)
    case 'relabel':
      return s.cassette ? same({ ...s, cassette: e.id }) : same(s)
    case 'sync':
      if (!e.playing) return same({ ...s, transport: 'stop' })
      return ready(s) ? same({ ...s, transport: 'play', pause: false }) : same(s)
  }
}

function press(s: DeckState, key: DeckKeyId): DeckStep {
  switch (key) {
    case 'play':
      return ready(s) ? same({ ...s, transport: 'play' }) : reject(s, key)
    case 'pause':
      return same({ ...s, pause: !s.pause })
    case 'stop':
      if (s.transport !== 'stop') return same({ ...s, transport: 'stop' })
      return same({ ...s, door: s.door === 'open' ? 'closed' : 'open' })
    default:
      // REC / REW / FF 尚未接入走带：按下即弹回
      return reject(s, key)
  }
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm test`
Expected: `deckMachine.test.ts` 与 `reels.test.ts` 全部 PASS。

- [ ] **Step 5: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 无输出，退出码 0。

---

### Task 3: player store 支持「停在带尾」

**Files:**
- Modify: `src/stores/player.ts`

**Interfaces:**
- Produces（均从 store 导出）：
  - `stopAtEnd: Ref<boolean>`：为 true 时播完不切下一首、不提前交叉淡化、单曲循环失效、失败不自动跳过
  - `tapeEnds: Ref<number>`：每次在 `stopAtEnd` 下播完自增
  - `failures: Ref<number>`：每次播放失败自增
  - `pause(): void`：幂等暂停（与 `toggle` 不同，重复调用不会恢复播放）

- [ ] **Step 1: 增加状态**

在 `const analyser = shallowRef<AnalyserNode | null>(null)` 之后加入：

```ts
  /** 卡座场景：播完停在带尾，不自动切歌 */
  const stopAtEnd = ref(false)
  const tapeEnds = ref(0)
  const failures = ref(0)
```

- [ ] **Step 2: 失败计数并在卡座模式下不自动跳过**

把 `fail()` 改为：

```ts
  function fail(reason: string) {
    if (failedToken === playToken) return
    failedToken = playToken
    buffering.value = false
    isPlaying.value = false
    failures.value++
    showNotice(`无法播放「${current.value?.title ?? ''}」：${reason}`)
    if (!stopAtEnd.value && ++failStreak <= MAX_AUTO_SKIP && queue.value.length > 1) {
      const token = playToken
      window.setTimeout(() => token === playToken && next(), 1200)
    }
  }
```

- [ ] **Step 3: 增加幂等 `pause()`**

在 `toggle()` 之后加入：

```ts
  function pause() {
    if (!engine.audio.paused) engine.pause()
  }
```

- [ ] **Step 4: 结尾处理与循环**

把 `watch(mode, (m) => engine.setLoop(m === 'one'), { immediate: true })` 替换为：

```ts
  watch(
    [mode, stopAtEnd],
    ([m, stop]) => engine.setLoop(m === 'one' && !stop),
    { immediate: true },
  )
```

把 `engine.on` 里的

```ts
      case 'nearend':
      case 'ended':
        step(1, true)
        break
```

替换为：

```ts
      case 'nearend':
        if (!stopAtEnd.value) step(1, true)
        break
      case 'ended':
        if (stopAtEnd.value) tapeEnds.value++
        else step(1, true)
        break
```

- [ ] **Step 5: 导出**

在 store 的 `return { ... }` 中 `analyser,` 之后加入 `stopAtEnd, tapeEnds, failures,`，在 `toggle,` 之后加入 `pause,`。

- [ ] **Step 6: 验证**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 无输出，退出码 0。

Run: `pnpm test`
Expected: 全部 PASS。

---

### Task 4: 场景切换与舞台骨架

**Files:**
- Modify: `src/stores/ui.ts`
- Modify: `src/App.vue`
- Modify: `src/components/AppHeader.vue`
- Modify: `src/commands.ts`
- Modify: `src/styles/main.css`
- Modify: `vite.config.ts`
- Create: `public/scene/desk.png`
- Create: `src/scenes/deck/DeckScene.vue`（骨架，Task 8 整体替换）

**Interfaces:**
- Produces: `type Scene = 'wall' | 'deck'`；ui store 导出 `scene: Ref<Scene>`、`setScene(s: Scene): void`（持久化 `himusic.scene`）。

- [ ] **Step 1: ui store**

在 `src/stores/ui.ts` 顶部 `const BAR_KEY = ...` 下方加入：

```ts
const SCENE_KEY = 'himusic.scene'

export type Scene = 'wall' | 'deck'
```

在 `toggleBar` 函数之后加入：

```ts
  const scene = ref<Scene>(localStorage.getItem(SCENE_KEY) === 'deck' ? 'deck' : 'wall')
  function setScene(s: Scene) {
    scene.value = s
    localStorage.setItem(SCENE_KEY, s)
  }
```

在 `return` 中加入 `scene,` 与 `setScene,`。

- [ ] **Step 2: 生成背景图**

先用 `GetDynamicTools({ namespace: 'cursor', toolName: 'GenerateImage' })` 查看参数，再调用 GenerateImage，提示词：

```text
Photorealistic interior photograph, straight-on front view from slightly above, of a warm walnut wooden desk standing against a muted dark teal plaster wall. Soft natural window light from the upper left, gentle long shadows falling toward the lower right. The desk top fills the lower two thirds of the frame. The whole desk surface is completely empty: clean wood grain only, no objects, no devices, no plants, no text, no people. Subtle dust in the light, fine wood texture, cinematic muted colors, 16:9, high detail.
```

把生成的图片保存为 `public/scene/desk.png`（新建 `public/scene` 目录）。用 Read 工具查看图片，确认桌面左右两侧都是空的；不合格则重新生成。

- [ ] **Step 3: PWA 不预缓存背景大图**

在 `vite.config.ts` 的 `workbox` 中 `globPatterns` 下一行加入：

```ts
          globIgnores: ['scene/**'],
```

（运行时缓存里已有 `request.destination === 'image'` 的 CacheFirst 规则，背景图首次加载后同样可离线使用。）

- [ ] **Step 4: DeckScene 骨架 `src/scenes/deck/DeckScene.vue`**

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const STAGE_W = 1600
const STAGE_H = 900

const scale = ref(1)
function fit() {
  scale.value = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
}

onMounted(() => {
  fit()
  window.addEventListener('resize', fit)
})
onBeforeUnmount(() => window.removeEventListener('resize', fit))
</script>

<template>
  <div class="deck-scene">
    <div class="stage" :style="{ transform: `translate(-50%, -50%) scale(${scale})` }">
      <p class="boot">DECK // BOOTING</p>
    </div>
  </div>
</template>

<style scoped>
.deck-scene {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #1a130d url('/scene/desk.png') center / cover no-repeat;
}

.stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1600px;
  height: 900px;
  transform-origin: center;
}

.boot {
  position: absolute;
  left: 90px;
  top: 160px;
  font-family: var(--font-pixel);
  color: var(--accent);
}
</style>
```

- [ ] **Step 5: App.vue 按场景渲染**

`<script setup>` 中：

把 `import { onBeforeUnmount, onMounted, watchEffect } from 'vue'` 改为：

```ts
import { defineAsyncComponent, onBeforeUnmount, onMounted, watchEffect } from 'vue'
```

在 `import { useAccentSync } from './theme'` 之后加入：

```ts
const DeckScene = defineAsyncComponent(() => import('./scenes/deck/DeckScene.vue'))
```

把 `--dock-h` 的 watchEffect 改为：

```ts
watchEffect(() => {
  const h = !store.current || ui.scene === 'deck' ? '0px' : ui.barCollapsed ? CAPSULE_DOCK : 'var(--bar-h)'
  document.documentElement.style.setProperty('--dock-h', h)
})
```

把 B 键分支改为：

```ts
  } else if (e.key.toLowerCase() === 'b' && store.current && ui.scene === 'wall') {
```

模板中把

```vue
  <main>
    <CoverWall />
  </main>

  <LyricsBackdrop v-if="settings.backdropLyrics && store.current && lyrics.lyrics?.synced" />

  <PlayerBar />
```

替换为：

```vue
  <Transition name="scene" mode="out-in">
    <main v-if="ui.scene === 'wall'" key="wall">
      <CoverWall />
    </main>
    <DeckScene v-else key="deck" />
  </Transition>

  <template v-if="ui.scene === 'wall'">
    <LyricsBackdrop v-if="settings.backdropLyrics && store.current && lyrics.lyrics?.synced" />
    <PlayerBar />
  </template>
```

- [ ] **Step 6: 场景过渡样式**

在 `src/styles/main.css` 末尾加入：

```css
.scene-enter-active,
.scene-leave-active {
  transition: opacity 280ms steps(6);
}

.scene-enter-from,
.scene-leave-to {
  opacity: 0;
}
```

- [ ] **Step 7: 顶栏切换按钮**

`src/components/AppHeader.vue` 模板 `.status` 内、`[CTRL+K]` 按钮之前加入：

```vue
      <span class="scene-switch">
        <button type="button" class="txt-btn" :class="{ on: ui.scene === 'wall' }" title="封面墙" @click="ui.setScene('wall')">[WALL]</button>
        <button type="button" class="txt-btn" :class="{ on: ui.scene === 'deck' }" title="磁带卡座" @click="ui.setScene('deck')">[DECK]</button>
      </span>
```

样式中加入：

```css
.scene-switch {
  display: flex;
  gap: 4px;
}
```

- [ ] **Step 8: 命令面板**

`src/commands.ts` 中 `id: 'focus'` 那条命令之后加入：

```ts
      { id: 'scene-wall', group: 'VISUAL', title: '场景：封面墙', keywords: 'scene wall cover', active: ui.scene === 'wall', run: () => ui.setScene('wall') },
      { id: 'scene-deck', group: 'VISUAL', title: '场景：磁带卡座', keywords: 'scene deck cassette tape 磁带', active: ui.scene === 'deck', run: () => ui.setScene('deck') },
```

- [ ] **Step 9: 验证**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 无输出，退出码 0。

浏览器打开 `http://localhost:5173`（开发服务器已在运行；没有则 `pnpm dev`）：
- 点 `[DECK]`：封面墙与底栏淡出，出现桌面背景和 `DECK // BOOTING`；
- 刷新后仍停在卡座场景；
- 点 `[WALL]` 回到封面墙，底栏恢复；
- 命令面板（Ctrl+K）搜「场景」能切换。

---

### Task 5: 磁带 `Cassette.vue` 与磁带盒 `CassetteCase.vue`

**Files:**
- Create: `src/scenes/deck/Cassette.vue`
- Create: `src/scenes/deck/CassetteCase.vue`

**Interfaces:**
- Consumes: `HUB_R`、`reelRadii`、`ReelRadii`（Task 1）；`CoverImage`（props `sources: string[]`）、`coverSources(cover, size)`。
- Produces:
  - `Cassette` props：`track: Track`、`radii?: ReelRadii`（默认 `reelRadii(0)`）、`supplyAngle?: number`、`takeupAngle?: number`。原生坐标 240 × 152，宽度随父元素。
  - `CassetteCase` props：`track: Track`、`open: boolean`、`empty: boolean`、`rot: number`；emits：`toggle`、`insert`、`grab(e: PointerEvent)`。尺寸 186 × 118，根元素 `position: absolute`，由父组件给 `left/top`。盒内磁带：左 13、上 8、宽 160；打开时上移 58。

- [ ] **Step 1: 新建 `src/scenes/deck/Cassette.vue`**

```vue
<script setup lang="ts">
import { computed, useId } from 'vue'
import type { Track } from '../../api/types'
import { HUB_R, reelRadii, type ReelRadii } from './reels'

const props = withDefaults(
  defineProps<{ track: Track; radii?: ReelRadii; supplyAngle?: number; takeupAngle?: number }>(),
  { radii: () => reelRadii(0), supplyAngle: 0, takeupAngle: 0 },
)

const uid = useId()
const HUBS = [
  { x: 72, y: 66 },
  { x: 168, y: 66 },
]
const TEETH = [0, 60, 120, 180, 240, 300]
const SCREWS = [
  [10, 10],
  [230, 10],
  [10, 142],
  [230, 142],
  [120, 140],
]

const hue = computed(() => [...props.track.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7))

/** 按显示宽度截断：CJK 记 2，其余记 1 */
function clip(s: string, units: number) {
  let w = 0
  for (let i = 0; i < s.length; i++) {
    w += s.charCodeAt(i) > 0x2e80 ? 2 : 1
    if (w > units) return `${s.slice(0, i)}…`
  }
  return s
}
</script>

<template>
  <svg class="cassette" viewBox="0 0 240 152" aria-hidden="true">
    <defs>
      <linearGradient :id="`${uid}-shell`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b2e34" />
        <stop offset="1" stop-color="#15171b" />
      </linearGradient>
      <mask :id="`${uid}-holes`">
        <rect width="240" height="152" fill="#fff" />
        <circle v-for="h in HUBS" :key="h.x" :cx="h.x" :cy="h.y" r="14" fill="#000" />
        <rect x="94" y="52" width="52" height="28" rx="3" fill="#000" />
      </mask>
    </defs>

    <rect x="1" y="1" width="238" height="150" rx="9" :fill="`url(#${uid}-shell)`" stroke="#3a3e45" />

    <circle :cx="HUBS[0].x" :cy="HUBS[0].y" :r="radii.supply" class="pack" />
    <circle :cx="HUBS[1].x" :cy="HUBS[1].y" :r="radii.takeup" class="pack" />

    <g
      v-for="(h, i) in HUBS"
      :key="`hub-${h.x}`"
      :transform="`translate(${h.x} ${h.y}) rotate(${i ? takeupAngle : supplyAngle})`"
    >
      <circle :r="HUB_R" class="hub" />
      <circle r="6.5" class="hub-hole" />
      <rect
        v-for="a in TEETH"
        :key="a"
        x="-1.2"
        y="-6.5"
        width="2.4"
        height="2.6"
        class="hub"
        :transform="`rotate(${a})`"
      />
    </g>

    <g :mask="`url(#${uid}-holes)`">
      <rect x="12" y="10" width="216" height="92" rx="4" class="label" />
      <rect x="12" y="10" width="216" height="22" rx="4" :fill="`hsl(${hue} 52% 44%)`" />
      <rect x="12" y="84" width="216" height="18" :fill="`hsl(${hue} 52% 44% / 0.3)`" />
    </g>
    <text x="22" y="25" class="title">{{ clip(track.title, 28) }}</text>
    <text x="216" y="26" class="side" text-anchor="end">A</text>
    <text x="22" y="97" class="artist">{{ clip(track.artist, 34) }}</text>
    <rect x="94" y="52" width="52" height="28" rx="3" class="window" />

    <path d="M52 152 L62 116 H178 L188 152 Z" class="bottom" />
    <rect v-for="x in [80, 112, 150]" :key="x" :x="x" y="132" width="10" height="10" class="port" />
    <line x1="64" y1="149" x2="176" y2="149" class="tape" />
    <circle v-for="[x, y] in SCREWS" :key="`${x}-${y}`" :cx="x" :cy="y" r="3" class="screw" />
  </svg>
</template>

<style scoped>
.cassette {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.pack {
  fill: #3b2a20;
}

.hub {
  fill: #e9e6df;
}

.hub-hole {
  fill: #0c0d10;
}

.label {
  fill: #ece6d6;
}

.title {
  font: 600 12px var(--font-sans);
  fill: #fff;
}

.side {
  font: 12px var(--font-pixel);
  fill: #fff;
}

.artist {
  font: 14px var(--font-mono);
  fill: #2b2d31;
}

.window {
  fill: rgba(140, 170, 190, 0.08);
  stroke: rgba(255, 255, 255, 0.25);
}

.bottom {
  fill: #1d2024;
  stroke: #33373d;
}

.port {
  fill: #07080a;
}

.tape {
  stroke: #3b2a20;
  stroke-width: 3;
}

.screw {
  fill: #8d9096;
  stroke: #4b4e54;
}
</style>
```

- [ ] **Step 2: 新建 `src/scenes/deck/CassetteCase.vue`**

```vue
<script setup lang="ts">
import type { Track } from '../../api/types'
import CoverImage from '../../components/CoverImage.vue'
import { coverSources } from '../../utils/cover'
import Cassette from './Cassette.vue'

const props = defineProps<{ track: Track; open: boolean; empty: boolean; rot: number }>()
const emit = defineEmits<{ toggle: []; insert: []; grab: [e: PointerEvent] }>()

function onGrab(e: PointerEvent) {
  if (props.open) emit('grab', e)
}

function onEnter() {
  if (!props.empty) emit('insert')
}
</script>

<template>
  <div class="case" :class="{ open, empty }" :style="{ '--rot': `${rot}deg` }">
    <div class="tray">
      <div v-if="!empty" class="tape" @pointerdown="onGrab">
        <Cassette :track="track" />
      </div>
    </div>
    <button
      type="button"
      class="lid"
      :aria-label="`${track.title} - ${track.artist}`"
      :aria-expanded="open"
      :title="empty ? '这盘磁带在卡座里' : open ? '把磁带拖进卡座（Enter 直接装入）' : '打开磁带盒'"
      @click="emit('toggle')"
      @keydown.enter.prevent="onEnter"
    >
      <span class="jcard">
        <CoverImage class="jcard-cover" :sources="coverSources(track.cover, 'medium')" />
        <span class="jcard-meta">
          <b>{{ track.title }}</b>
          <i>{{ track.artist }}</i>
        </span>
      </span>
      <span v-if="empty" class="empty-tag">[IN DECK]</span>
    </button>
  </div>
</template>

<style scoped>
.case {
  position: absolute;
  width: 186px;
  height: 118px;
  perspective: 700px;
  transform: rotate(var(--rot));
  filter: drop-shadow(4px 8px 7px rgba(0, 0, 0, 0.45));
  transition:
    transform 220ms var(--ease-out),
    filter 220ms var(--ease-out);
}

.case:hover:not(.open) {
  transform: rotate(var(--rot)) translateY(-6px);
  filter: drop-shadow(8px 16px 12px rgba(0, 0, 0, 0.4));
}

.tray {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04) 45%, rgba(0, 0, 0, 0.25));
}

.tape {
  position: absolute;
  left: 13px;
  top: 8px;
  width: 160px;
  pointer-events: none;
  transition: transform 360ms 120ms var(--ease-out);
}

.open .tape {
  transform: translateY(-58px);
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
}

.lid {
  position: absolute;
  inset: 0;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  transform-origin: bottom;
  backface-visibility: hidden;
  cursor: pointer;
  transition: transform 300ms var(--ease-out);
}

.lid::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, rgba(255, 255, 255, 0.22), transparent 38%);
  pointer-events: none;
}

.lid:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 3px;
}

.open .lid {
  transform: rotateX(-72deg);
}

.jcard {
  display: flex;
  gap: 8px;
  height: 100%;
  padding: 4px;
  overflow: hidden;
  background: #e9e3d3;
  color: #17181b;
  text-align: left;
}

.jcard-cover {
  flex: none;
  width: 98px;
  height: 98px;
  object-fit: cover;
}

.jcard-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-top: 2px;
}

.jcard-meta b {
  display: -webkit-box;
  overflow: hidden;
  font: 600 13px/1.25 var(--font-sans);
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.jcard-meta i {
  overflow: hidden;
  font: 15px/1 var(--font-mono);
  font-style: normal;
  color: #555a61;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.empty .lid {
  opacity: 0.6;
}

.empty-tag {
  position: absolute;
  right: 8px;
  bottom: 6px;
  padding: 2px 4px;
  background: #0a0c0f;
  font: 10px var(--font-pixel);
  color: var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .case,
  .tape,
  .lid {
    transition: none;
  }
}
</style>
```

- [ ] **Step 3: 临时挂到骨架里目测**

在 Task 4 的 `DeckScene.vue` 骨架中临时加入（Task 8 会整体替换此文件）：

```ts
import { usePlayerStore } from '../../stores/player'
import CassetteCase from './CassetteCase.vue'

const player = usePlayerStore()
```

```vue
      <CassetteCase
        v-if="player.tracks[0]"
        :track="player.tracks[0]"
        :open="true"
        :empty="false"
        :rot="-2"
        style="left: 90px; top: 300px"
      />
```

- [ ] **Step 4: 验证**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 无输出，退出码 0。

浏览器切到 `[DECK]`，截图确认：磁带盒盒盖向下翻成窄条，磁带从盒中上移露出；磁带标签显示歌名 / 歌手，两个轮毂透过标签孔可见，中间小窗能看到棕色磁带卷边缘。

---

### Task 6: 琴键 `DeckKey.vue` 与卡座 `TapeDeck.vue`

**Files:**
- Create: `src/scenes/deck/DeckKey.vue`
- Create: `src/scenes/deck/TapeDeck.vue`

**Interfaces:**
- Consumes: `DeckKeyId`、`DeckState`、`isRunning`（Task 2）；`ReelRadii`（Task 1）；`Cassette`（Task 5）。
- Produces:
  - `DeckKey` props：`label: string`、`glyph: string`、`latched?: boolean`（undefined 表示非锁定键）、`reject?: number`（每次变化播放一次回弹）、`tone?: 'rec'`；emits `press`。
  - `TapeDeck` props：`state: DeckState`、`tape: Track | null`、`radii: ReelRadii`、`supplyAngle: number`、`takeupAngle: number`、`rejected: Record<DeckKeyId, number>`、`time: number`（秒）、`fault: number`（每次变化红灯闪 1.4s）；emits `press(key: DeckKeyId)`、`take`。根元素 `position: absolute`，尺寸由父组件给（760 × 440）。内部布局：带仓 well 位于 (40, 60)，300 × 200；仓内磁带位于 well 内 (30, 24)，宽 240。

- [ ] **Step 1: 新建 `src/scenes/deck/DeckKey.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'

// 显式默认 undefined：否则 Vue 会把缺省的布尔 prop 转成 false，非锁定键也会带上 aria-pressed
const props = withDefaults(
  defineProps<{ label: string; glyph: string; latched?: boolean; reject?: number; tone?: 'rec' }>(),
  { latched: undefined, reject: 0, tone: undefined },
)
const emit = defineEmits<{ press: [] }>()

const bouncing = ref(false)
watch(
  () => props.reject,
  () => {
    bouncing.value = false
    requestAnimationFrame(() => (bouncing.value = true))
  },
)
</script>

<template>
  <div class="slot">
    <span class="legend">{{ label }}</span>
    <span class="well">
      <button
        type="button"
        class="key"
        :class="{ latched, bouncing, rec: tone === 'rec' }"
        :aria-label="label"
        :aria-pressed="latched"
        @click="emit('press')"
        @animationend="bouncing = false"
      >
        <span class="glyph">{{ glyph }}</span>
      </button>
    </span>
  </div>
</template>

<style scoped>
.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.legend {
  font: 10px var(--font-pixel);
  letter-spacing: 0.06em;
  color: #34373c;
}

.well {
  display: block;
  padding: 3px 3px 0;
  border-radius: 3px;
  background: #0b0c0e;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
}

.key {
  display: grid;
  place-items: center;
  width: 44px;
  height: 38px;
  border: 0;
  border-radius: 2px 2px 4px 4px;
  background: linear-gradient(#dcdfe3, #aeb2b8 70%, #8f939a);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 6px 0 #5d6168,
    0 8px 6px rgba(0, 0, 0, 0.6);
  color: #2a2c30;
  cursor: pointer;
  transform: translateY(-6px);
  transition:
    transform 70ms ease-out,
    box-shadow 70ms ease-out;
}

.key:active,
.key.latched {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 1px 0 #5d6168,
    0 2px 3px rgba(0, 0, 0, 0.6);
}

.key.latched {
  background: linear-gradient(#c8cbd0, #9b9fa6 70%, #80848b);
}

.key.latched .glyph {
  color: var(--accent);
  text-shadow: 0 0 6px var(--accent);
}

.key.bouncing {
  animation: key-reject 280ms ease-out;
}

.key:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 2px;
}

.glyph {
  font: 13px var(--font-pixel);
}

.rec .glyph {
  color: #c8322a;
}

@keyframes key-reject {
  0% {
    transform: translateY(-1px);
  }
  45% {
    transform: translateY(-8px);
  }
  75% {
    transform: translateY(-4px);
  }
  100% {
    transform: translateY(-6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .key.bouncing {
    animation: none;
  }
}
</style>
```

- [ ] **Step 2: 新建 `src/scenes/deck/TapeDeck.vue`**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Track } from '../../api/types'
import Cassette from './Cassette.vue'
import DeckKey from './DeckKey.vue'
import { isRunning, type DeckKeyId, type DeckState } from './deckMachine'
import type { ReelRadii } from './reels'

const props = defineProps<{
  state: DeckState
  tape: Track | null
  radii: ReelRadii
  supplyAngle: number
  takeupAngle: number
  rejected: Record<DeckKeyId, number>
  time: number
  fault: number
}>()
const emit = defineEmits<{ press: [key: DeckKeyId]; take: [] }>()

const KEYS: { id: DeckKeyId; label: string; glyph: string; latching?: boolean; tone?: 'rec' }[] = [
  { id: 'rec', label: 'REC', glyph: '●', tone: 'rec' },
  { id: 'rew', label: 'REW', glyph: '◀◀' },
  { id: 'play', label: 'PLAY', glyph: '▶', latching: true },
  { id: 'ff', label: 'F.FWD', glyph: '▶▶' },
  { id: 'stop', label: 'STOP/EJ', glyph: '■' },
  { id: 'pause', label: 'PAUSE', glyph: '❚❚', latching: true },
]

function latched(id: DeckKeyId) {
  return id === 'play' ? props.state.transport === 'play' : props.state.pause
}

const running = computed(() => isRunning(props.state))

const status = computed(() => {
  const s = props.state
  if (s.door === 'open') return 'EJECT'
  if (!s.cassette) return 'NO TAPE'
  if (s.transport === 'play') return s.pause ? 'PAUSE' : 'PLAY'
  return s.pause ? 'STOP · PAUSE' : 'STOP'
})

const faulting = ref(false)
let faultTimer = 0
watch(
  () => props.fault,
  () => {
    faulting.value = true
    clearTimeout(faultTimer)
    faultTimer = window.setTimeout(() => (faulting.value = false), 1400)
  },
)

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <section class="deck" aria-label="磁带卡座">
    <header class="brand">
      <b>HI/MUSIC</b>
      <span>CD-900 STEREO CASSETTE DECK</span>
    </header>

    <div class="well">
      <button
        v-if="tape"
        type="button"
        class="bay-tape"
        :disabled="state.door !== 'open'"
        aria-label="取出磁带"
        @click="emit('take')"
      >
        <Cassette :track="tape" :radii="radii" :supply-angle="supplyAngle" :takeup-angle="takeupAngle" />
      </button>
      <div class="door" :class="{ open: state.door === 'open' }">
        <i class="door-window" />
        <span class="door-label">TYPE I · II · IV</span>
      </div>
    </div>

    <div class="keys">
      <DeckKey
        v-for="k in KEYS"
        :key="k.id"
        :label="k.label"
        :glyph="k.glyph"
        :tone="k.tone"
        :latched="k.latching ? latched(k.id) : undefined"
        :reject="rejected[k.id]"
        @press="emit('press', k.id)"
      />
    </div>

    <div class="display">
      <div class="lcd" :class="{ dim: !tape }">
        <span class="lcd-status">{{ status }}</span>
        <span class="lcd-time">{{ fmt(time) }}</span>
        <span class="lcd-title">{{ tape ? `${tape.title} — ${tape.artist}` : 'INSERT CASSETTE' }}</span>
      </div>
      <div class="leds">
        <span><i class="led on" />POWER</span>
        <span><i class="led" :class="{ on: running }" />RUN</span>
        <span><i class="led err" :class="{ on: faulting }" />ERR</span>
      </div>
    </div>

    <div class="grille" aria-hidden="true" />
  </section>
</template>

<style scoped>
.deck {
  position: absolute;
  border-radius: 6px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0 1px, rgba(0, 0, 0, 0.025) 1px 2px, transparent 2px 4px),
    linear-gradient(#d3d6da, #aeb2b8 55%, #92969d);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -2px 0 rgba(0, 0, 0, 0.25),
    0 0 0 1px #50545a,
    16px 26px 34px rgba(0, 0, 0, 0.55);
  color: #2a2d32;
}

.deck::after {
  content: '';
  position: absolute;
  left: 40px;
  right: 40px;
  bottom: -10px;
  height: 10px;
  background: linear-gradient(90deg, #111 0 60px, transparent 60px calc(100% - 60px), #111 calc(100% - 60px));
}

.brand {
  position: absolute;
  left: 40px;
  top: 22px;
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.brand b {
  font: 13px var(--font-pixel);
  letter-spacing: 0.08em;
}

.brand span {
  font: 15px var(--font-mono);
  letter-spacing: 0.12em;
  color: #4b4f56;
}

.well {
  position: absolute;
  left: 40px;
  top: 60px;
  width: 300px;
  height: 200px;
  border-radius: 4px;
  background: radial-gradient(120% 90% at 50% 0%, #1d2024, #0b0c0e);
  box-shadow:
    inset 0 8px 16px rgba(0, 0, 0, 0.85),
    0 1px 0 rgba(255, 255, 255, 0.7);
  perspective: 600px;
}

.bay-tape {
  position: absolute;
  left: 30px;
  top: 24px;
  width: 240px;
  padding: 0;
  border: 0;
  background: none;
  cursor: default;
}

.bay-tape:enabled {
  cursor: pointer;
}

.bay-tape:enabled:hover {
  filter: brightness(1.12);
}

.door {
  position: absolute;
  inset: 6px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 3px;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.04) 38%, rgba(0, 0, 0, 0.22));
  transform-origin: bottom;
  pointer-events: none;
  transition: transform 380ms var(--ease-out);
}

.door.open {
  transform: rotateX(-34deg);
}

.door-window {
  position: absolute;
  left: 36px;
  right: 36px;
  top: 30px;
  bottom: 58px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 2px;
}

.door-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10px;
  text-align: center;
  font: 10px var(--font-pixel);
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.45);
}

.keys {
  position: absolute;
  left: 40px;
  top: 300px;
  display: flex;
  gap: 6px;
}

.display {
  position: absolute;
  left: 380px;
  top: 60px;
  width: 340px;
}

.lcd {
  display: grid;
  gap: 4px;
  height: 150px;
  padding: 14px 16px;
  border-radius: 3px;
  background: #08110c;
  box-shadow:
    inset 0 3px 10px rgba(0, 0, 0, 0.9),
    0 1px 0 rgba(255, 255, 255, 0.7);
  color: var(--accent);
  text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 60%, transparent);
}

.lcd.dim {
  opacity: 0.55;
}

.lcd-status {
  font: 13px var(--font-pixel);
  letter-spacing: 0.12em;
}

.lcd-time {
  font: 64px/1 var(--font-mono);
}

.lcd-title {
  overflow: hidden;
  font: 14px var(--font-sans);
  white-space: nowrap;
  text-overflow: ellipsis;
  color: color-mix(in srgb, var(--accent) 80%, #fff);
}

.leds {
  display: flex;
  gap: 22px;
  margin-top: 18px;
  font: 10px var(--font-pixel);
  color: #3d4147;
}

.leds span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3a3d42;
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.6);
}

.led.on {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.led.err.on {
  background: #ff4a3d;
  box-shadow: 0 0 8px #ff4a3d;
  animation: blink 280ms steps(2) infinite;
}

.grille {
  position: absolute;
  left: 380px;
  top: 300px;
  width: 340px;
  height: 60px;
  border-radius: 3px;
  background: repeating-linear-gradient(90deg, #1a1c20 0 3px, transparent 3px 7px);
  opacity: 0.55;
}

@media (prefers-reduced-motion: reduce) {
  .door {
    transition: none;
  }
}
</style>
```

- [ ] **Step 3: 临时挂到骨架里目测**

在 `DeckScene.vue` 骨架中临时加入：

```ts
import { INITIAL_DECK } from './deckMachine'
import { reelRadii } from './reels'
import TapeDeck from './TapeDeck.vue'

const demoRejected = { rec: 0, rew: 0, play: 0, ff: 0, stop: 0, pause: 0 }
```

```vue
      <TapeDeck
        style="left: 760px; top: 300px; width: 760px; height: 440px"
        :state="{ ...INITIAL_DECK, cassette: player.tracks[0]?.id ?? null, transport: 'play' }"
        :tape="player.tracks[0] ?? null"
        :radii="reelRadii(0.3)"
        :supply-angle="0"
        :takeup-angle="0"
        :rejected="demoRejected"
        :time="83"
        :fault="0"
      />
```

- [ ] **Step 4: 验证**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 无输出，退出码 0。

浏览器截图确认：银色拉丝面板、左上品牌字、带仓里透过烟色仓门能看到磁带、6 个琴键（PLAY 处于按下锁定状态、符号发光）、右侧 LCD 显示 `PLAY` / `01:23` / 歌名、POWER 与 RUN 灯亮。点击 REC 键能看到回弹（DeckKey 的 `:active` 按下，松开回位）。

---

### Task 7: 粘合层 `useDeck.ts`

**Files:**
- Create: `src/scenes/deck/useDeck.ts`

**Interfaces:**
- Consumes: Task 1 的 `reelRadii` / `spinDelta` / `TAPE_SPEED`；Task 2 的 `deckReduce` / `INITIAL_DECK` / `isRunning` 与类型；Task 3 的 `player.stopAtEnd` / `tapeEnds` / `failures` / `pause()`，以及已有的 `player.current` / `isPlaying` / `currentTime` / `duration` / `play(track)` / `toggle()`。
- Produces: `useDeck()` 返回单例：
  - `state: Ref<DeckState>`、`tape: ShallowRef<Track | null>`
  - `rejected: Record<DeckKeyId, number>`（reactive）、`fault: Ref<number>`
  - `time: ComputedRef<number>`、`radii: ComputedRef<ReelRadii>`、`angles: { supply: number; takeup: number }`（reactive）
  - `press(key: DeckKeyId)`、`openDoor()`、`insert(track: Track)`、`remove(): Track | null`
  - `attach()`（场景挂载时调用）、`detach()`（卸载时调用）

- [ ] **Step 1: 新建 `src/scenes/deck/useDeck.ts`**

```ts
import { computed, effectScope, reactive, ref, shallowRef, watch } from 'vue'
import type { Track } from '../../api/types'
import { usePlayerStore } from '../../stores/player'
import { deckReduce, INITIAL_DECK, isRunning, type DeckEvent, type DeckKeyId, type DeckState } from './deckMachine'
import { reelRadii, spinDelta, TAPE_SPEED } from './reels'

function createDeck() {
  const player = usePlayerStore()

  const state = ref<DeckState>({ ...INITIAL_DECK })
  /** 仓内磁带；榜单刷新后仍要显示标签，所以单独保存而不是从列表反查 */
  const tape = shallowRef<Track | null>(null)
  /** 每个键被顶回的次数，DeckKey 监听变化播放回弹 */
  const rejected = reactive<Record<DeckKeyId, number>>({ rec: 0, rew: 0, play: 0, ff: 0, stop: 0, pause: 0 })
  const fault = ref(0)
  /** 只有卡座场景在屏幕上时才与播放器互相同步 */
  const active = ref(false)

  const isCurrent = computed(() => !!tape.value && player.current?.id === tape.value.id)
  const time = computed(() => (isCurrent.value ? player.currentTime : 0))
  const progress = computed(() => (isCurrent.value && player.duration ? player.currentTime / player.duration : 0))
  const radii = computed(() => reelRadii(progress.value))
  const angles = reactive({ supply: 0, takeup: 0 })

  function send(e: DeckEvent) {
    const step = deckReduce(state.value, e)
    state.value = step.state
    for (const fx of step.effects) rejected[fx.key]++
  }

  const press = (key: DeckKeyId) => send({ type: 'press', key })
  const openDoor = () => send({ type: 'openDoor' })

  function insert(track: Track) {
    player.pause()
    tape.value = track
    send({ type: 'insert', id: track.id })
  }

  function remove(): Track | null {
    const old = tape.value
    if (!old || state.value.door !== 'open') return null
    send({ type: 'remove' })
    tape.value = null
    return old
  }

  watch(
    () => active.value && isRunning(state.value),
    (run, was) => {
      const t = tape.value
      if (run && t) {
        if (!isCurrent.value) void player.play(t)
        else if (!player.isPlaying) player.toggle()
      } else if (!run && was && active.value) {
        player.pause()
      }
    },
  )

  watch(
    () => player.tapeEnds,
    () => active.value && send({ type: 'tapeEnd' }),
  )

  watch(
    () => player.failures,
    () => {
      if (!active.value || state.value.transport !== 'play') return
      send({ type: 'press', key: 'stop' })
      fault.value++
    },
  )

  watch(
    () => player.current,
    (cur) => {
      if (!active.value || !cur || !tape.value || cur.id === tape.value.id) return
      tape.value = cur
      send({ type: 'relabel', id: cur.id })
    },
  )

  watch(
    () => player.isPlaying,
    (on) => {
      if (active.value && on && isCurrent.value && !isRunning(state.value)) send({ type: 'sync', playing: true })
    },
  )

  let raf = 0
  let last = 0
  function spin(t: number) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0
    last = t
    angles.supply = (angles.supply - spinDelta(TAPE_SPEED, dt, radii.value.supply)) % 360
    angles.takeup = (angles.takeup - spinDelta(TAPE_SPEED, dt, radii.value.takeup)) % 360
    raf = requestAnimationFrame(spin)
  }

  watch(
    () => active.value && isRunning(state.value) && player.isPlaying && isCurrent.value,
    (on) => {
      cancelAnimationFrame(raf)
      last = 0
      raf = on ? requestAnimationFrame(spin) : 0
    },
  )

  function attach() {
    active.value = true
    player.stopAtEnd = true
    const cur = player.current
    if (tape.value && cur && cur.id !== tape.value.id) {
      tape.value = cur
      send({ type: 'relabel', id: cur.id })
    }
    send({ type: 'sync', playing: player.isPlaying && isCurrent.value })
  }

  function detach() {
    active.value = false
    player.stopAtEnd = false
  }

  return { state, tape, rejected, fault, time, radii, angles, press, openDoor, insert, remove, attach, detach }
}

let deck: ReturnType<typeof createDeck> | undefined

/** 卡座状态在场景切换之间保留，整个应用只创建一份 */
export function useDeck() {
  deck ??= effectScope(true).run(createDeck)!
  return deck
}
```

- [ ] **Step 2: 验证**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 无输出，退出码 0。

Run: `pnpm test`
Expected: 全部 PASS。

---

### Task 8: 场景编排 `DeckScene.vue`

**Files:**
- Modify (整体替换): `src/scenes/deck/DeckScene.vue`

**Interfaces:**
- Consumes: Task 5 的 `Cassette`、`CassetteCase`（尺寸 186 × 118；盒内磁带 13 / 8 / 160，打开上移 58）；Task 6 的 `TapeDeck`（well 在 (40, 60)，仓内磁带在 well 内 (30, 24)、宽 240）；Task 7 的 `useDeck()`；ui store 的 `paletteOpen` / `lyricsVisible` / `toggleLyrics`；account store 的 `loginOpen`；player store 的 `tracks` / `hasMore` / `loadList()` / `listLoading` / `listError` / `keyword` / `shelf` / `current`。

舞台坐标：

| 元素 | 位置 |
|---|---|
| 标题 | (90, 150) |
| 磁带盒 | 第 i 个：x = 90 + (i % 3) × 208，y = 250 + ⌊i / 3⌋ × 182 |
| 翻页 | (90, 640) |
| 卡座 | (760, 300)，760 × 440 |
| 带仓 well | (800, 360)，300 × 200 |
| 仓内磁带 | (830, 384)，宽 240 |
| 投放区 | well 四周外扩 40 |
| `[LRC]` | (1460, 262) |

- [ ] **Step 1: 用以下内容整体替换 `src/scenes/deck/DeckScene.vue`**

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef, watch } from 'vue'
import type { Track } from '../../api/types'
import { useAccountStore } from '../../stores/account'
import { usePlayerStore } from '../../stores/player'
import { useUiStore } from '../../stores/ui'
import Cassette from './Cassette.vue'
import CassetteCase from './CassetteCase.vue'
import TapeDeck from './TapeDeck.vue'
import { useDeck } from './useDeck'

const STAGE_W = 1600
const STAGE_H = 900
const PAGE = 6
const COLS = 3
const CASE_W = 186
const CASE_H = 118
const SHELF = { x: 90, y: 250, gapX: 22, gapY: 64 }
const DECK = { x: 760, y: 300, w: 760, h: 440 }
/** 与 TapeDeck 内部布局一致：well 在 (40, 60)，仓内磁带在 well 内 (30, 24) */
const WELL = { x: DECK.x + 40, y: DECK.y + 60, w: 300, h: 200 }
const DROP_PAD = 40
const DROP = { x: WELL.x - DROP_PAD, y: WELL.y - DROP_PAD, w: WELL.w + DROP_PAD * 2, h: WELL.h + DROP_PAD * 2 }
/** 与 CassetteCase 内部布局一致 */
const IN_CASE = { dx: 13, dy: 8, w: 160, lift: 58 }
const TAPE_W = 240
const HELD_W = 200
const FLIGHT_MS = 420
/** 盒盖翻开 + 磁带上滑的总时长 */
const OPEN_MS = 480

interface Pose {
  x: number
  y: number
  w: number
  rot: number
}

interface Flight extends Pose {
  key: number
  track: Track
  moving: boolean
}

const BAY: Pose = { x: WELL.x + 30, y: WELL.y + 24, w: TAPE_W, rot: 0 }
const OFFSTAGE: Pose = { x: SHELF.x + 300, y: STAGE_H + 40, w: 120, rot: -12 }

const player = usePlayerStore()
const ui = useUiStore()
const account = useAccountStore()
const deck = useDeck()
const { state, tape, radii, angles, rejected, fault, time } = deck

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const pad2 = (n: number) => String(n).padStart(2, '0')

/* ---------------- 舞台 ---------------- */

const stageEl = ref<HTMLElement>()
const scale = ref(1)

function fit() {
  scale.value = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
}

function toStage(e: PointerEvent) {
  const r = stageEl.value!.getBoundingClientRect()
  return { x: (e.clientX - r.left) / scale.value, y: (e.clientY - r.top) / scale.value }
}

/* ---------------- 磁带盒 ---------------- */

const page = ref(0)
const openId = ref<string | null>(null)
const pageCount = computed(() => Math.max(1, Math.ceil(player.tracks.length / PAGE)))
const visible = computed(() => player.tracks.slice(page.value * PAGE, (page.value + 1) * PAGE))

watch(
  () => player.tracks,
  (list) => {
    if (page.value * PAGE >= list.length) page.value = 0
  },
)

async function turn(dir: 1 | -1) {
  const next = page.value + dir
  if (next < 0) return
  if (next >= pageCount.value) {
    if (!player.hasMore) return
    await player.loadList()
    if (next >= pageCount.value) return
  }
  page.value = next
  openId.value = null
}

/** 由曲目 ID 得到 ±4° 的固定摆放角度 */
function caseRot(id: string) {
  let h = 0
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) | 0
  return ((Math.abs(h) % 81) - 40) / 10
}

function casePos(i: number) {
  return {
    x: SHELF.x + (i % COLS) * (CASE_W + SHELF.gapX),
    y: SHELF.y + Math.floor(i / COLS) * (CASE_H + SHELF.gapY),
  }
}

function tapeInCase(i: number, track: Track): Pose {
  const p = casePos(i)
  return { x: p.x + IN_CASE.dx, y: p.y + IN_CASE.dy - IN_CASE.lift, w: IN_CASE.w, rot: caseRot(track.id) }
}

function toggleCase(id: string) {
  openId.value = openId.value === id ? null : id
}

/* ---------------- 飞行中的磁带 ---------------- */

const flights = shallowRef<Flight[]>([])
let flightKey = 0
const airborne = computed(() => new Set(flights.value.map((f) => f.track.id)))
const isEmpty = (id: string) => state.value.cassette === id || airborne.value.has(id)

function launch(track: Track, from: Pose): Flight {
  const f = shallowReactive<Flight>({ key: ++flightKey, track, ...from, moving: false })
  flights.value = [...flights.value, f]
  return f
}

function fly(f: Flight, to: Pose, done: () => void) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      f.moving = true
      Object.assign(f, to)
      window.setTimeout(() => {
        flights.value = flights.value.filter((x) => x !== f)
        done()
      }, FLIGHT_MS + 40)
    }),
  )
}

/** 磁带飞回自己的盒子：盒子不在当前页时飞出舞台 */
function sendHome(track: Track) {
  const f = launch(track, BAY)
  const i = visible.value.findIndex((t) => t.id === track.id)
  if (i < 0) return fly(f, OFFSTAGE, () => {})
  openId.value = track.id
  fly(f, tapeInCase(i, track), () => {
    if (openId.value === track.id) openId.value = null
  })
}

function load(f: Flight) {
  deck.openDoor()
  const old = deck.remove()
  if (old) sendHome(old)
  fly(f, BAY, () => {
    deck.insert(f.track)
    if (openId.value === f.track.id) openId.value = null
  })
}

function quickLoad(track: Track, i: number) {
  if (isEmpty(track.id) || held.value) return
  openId.value = track.id
  window.setTimeout(() => load(launch(track, tapeInCase(i, track))), OPEN_MS)
}

function takeOut() {
  const old = deck.remove()
  if (old) sendHome(old)
}

/* ---------------- 拖拽 ---------------- */

interface Drag {
  flight: Flight
  index: number
  /** 抓取点在磁带原生坐标（宽 240）中的位置 */
  gx: number
  gy: number
  vx: number
  lastX: number
  lastT: number
}

let drag: Drag | null = null
const held = shallowRef<Flight | null>(null)
const overDrop = ref(false)

const inDrop = (p: { x: number; y: number }) =>
  p.x >= DROP.x && p.x <= DROP.x + DROP.w && p.y >= DROP.y && p.y <= DROP.y + DROP.h

function onGrab(track: Track, i: number, e: PointerEvent) {
  if (drag || e.button !== 0) return
  e.preventDefault()
  const from = tapeInCase(i, track)
  const f = launch(track, from)
  const p = toStage(e)
  const s = from.w / TAPE_W
  drag = { flight: f, index: i, gx: (p.x - from.x) / s, gy: (p.y - from.y) / s, vx: 0, lastX: p.x, lastT: e.timeStamp }
  held.value = f
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}

function onMove(e: PointerEvent) {
  if (!drag) return
  const p = toStage(e)
  const s = HELD_W / TAPE_W
  const dt = Math.max(1, e.timeStamp - drag.lastT)
  drag.vx = drag.vx * 0.7 + ((p.x - drag.lastX) / dt) * 0.3
  drag.lastX = p.x
  drag.lastT = e.timeStamp
  Object.assign(drag.flight, {
    x: p.x - drag.gx * s,
    y: p.y - drag.gy * s,
    w: HELD_W,
    rot: clamp(drag.vx * 6, -8, 8),
  })
  overDrop.value = inDrop(p)
  if (overDrop.value) deck.openDoor()
}

function endDrag(): Drag | null {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  const d = drag
  drag = null
  held.value = null
  overDrop.value = false
  return d
}

function returnToCase(d: Drag) {
  const id = d.flight.track.id
  fly(d.flight, tapeInCase(d.index, d.flight.track), () => {
    if (openId.value === id) openId.value = null
  })
}

function onUp(e: PointerEvent) {
  const d = endDrag()
  if (!d) return
  if (inDrop(toStage(e))) load(d.flight)
  else returnToCase(d)
}

function onCancel() {
  const d = endDrag()
  if (d) returnToCase(d)
}

/* ---------------- 键盘 ---------------- */

function onKeydown(e: KeyboardEvent) {
  if (e.code !== 'Space' || ui.paletteOpen || account.loginOpen) return
  if ((e.target as HTMLElement).closest('input, textarea')) return
  e.preventDefault()
  e.stopImmediatePropagation()
  deck.press(state.value.transport === 'stop' ? 'play' : 'pause')
}

onMounted(() => {
  fit()
  window.addEventListener('resize', fit)
  window.addEventListener('keydown', onKeydown, { capture: true })
  deck.attach()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fit)
  window.removeEventListener('keydown', onKeydown, { capture: true })
  endDrag()
  deck.detach()
})
</script>

<template>
  <div class="deck-scene">
    <div ref="stageEl" class="stage" :style="{ transform: `translate(-50%, -50%) scale(${scale})` }">
      <div class="shelf-head">
        <span class="tag">// TAPES / {{ player.keyword ? 'SEARCH' : player.shelf.tag }}</span>
        <span class="name">{{ player.keyword || player.shelf.name }}</span>
      </div>

      <CassetteCase
        v-for="(t, i) in visible"
        :key="t.id"
        :track="t"
        :open="openId === t.id"
        :empty="isEmpty(t.id)"
        :rot="caseRot(t.id)"
        :style="{ left: `${casePos(i).x}px`, top: `${casePos(i).y}px`, zIndex: openId === t.id ? 5 : 1 }"
        @toggle="toggleCase(t.id)"
        @insert="quickLoad(t, i)"
        @grab="onGrab(t, i, $event)"
      />
      <p v-if="!visible.length" class="shelf-empty">
        {{ player.listLoading ? 'LOADING…' : player.listError || 'NO TAPES' }}
      </p>

      <nav class="pager" aria-label="翻页">
        <button type="button" class="txt-btn" :disabled="page === 0" @click="turn(-1)">[◀]</button>
        <span>{{ pad2(page + 1) }} / {{ pad2(pageCount) }}</span>
        <button
          type="button"
          class="txt-btn"
          :disabled="page + 1 >= pageCount && !player.hasMore"
          @click="turn(1)"
        >
          [▶]
        </button>
      </nav>

      <TapeDeck
        :style="{ left: `${DECK.x}px`, top: `${DECK.y}px`, width: `${DECK.w}px`, height: `${DECK.h}px` }"
        :state="state"
        :tape="tape"
        :radii="radii"
        :supply-angle="angles.supply"
        :takeup-angle="angles.takeup"
        :rejected="rejected"
        :time="time"
        :fault="fault"
        @press="deck.press"
        @take="takeOut"
      />

      <button
        type="button"
        class="txt-btn lrc-btn"
        :class="{ on: ui.lyricsVisible }"
        :disabled="!player.current"
        title="歌词（L）"
        @click="ui.toggleLyrics()"
      >
        [LRC]
      </button>

      <div
        v-if="held"
        class="drop-zone"
        :class="{ over: overDrop }"
        :style="{ left: `${DROP.x}px`, top: `${DROP.y}px`, width: `${DROP.w}px`, height: `${DROP.h}px` }"
      />

      <div
        v-for="f in flights"
        :key="f.key"
        class="flight"
        :class="{ held: f === held, moving: f.moving }"
        :style="{ transform: `translate(${f.x}px, ${f.y}px) rotate(${f.rot}deg) scale(${f.w / TAPE_W})` }"
      >
        <Cassette :track="f.track" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.deck-scene {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #1a130d url('/scene/desk.png') center / cover no-repeat;
}

.deck-scene::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.55));
  pointer-events: none;
}

.stage {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  width: 1600px;
  height: 900px;
  transform-origin: center;
}

.shelf-head {
  position: absolute;
  left: 90px;
  top: 150px;
  display: flex;
  align-items: baseline;
  gap: 16px;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
}

.shelf-head .tag {
  font: 11px var(--font-pixel);
  color: var(--accent);
}

.shelf-head .name {
  font: 600 28px var(--font-sans);
  color: var(--text);
}

.shelf-empty {
  position: absolute;
  left: 90px;
  top: 300px;
  font: 20px var(--font-mono);
  color: var(--text);
}

.pager {
  position: absolute;
  left: 90px;
  top: 640px;
  display: flex;
  align-items: center;
  gap: 12px;
  font: 20px var(--font-mono);
  color: var(--text);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
}

.pager .txt-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.lrc-btn {
  position: absolute;
  left: 1460px;
  top: 262px;
}

.drop-zone {
  position: absolute;
  z-index: 15;
  border: 1px dashed color-mix(in srgb, var(--accent) 60%, transparent);
  pointer-events: none;
}

.drop-zone.over {
  border-style: solid;
  box-shadow:
    0 0 0 1px var(--accent),
    inset 0 0 28px color-mix(in srgb, var(--accent) 40%, transparent);
}

.flight {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 20;
  width: 240px;
  transform-origin: 0 0;
  pointer-events: none;
  filter: drop-shadow(6px 10px 8px rgba(0, 0, 0, 0.5));
}

.flight.held {
  transition: transform 80ms linear;
  filter: drop-shadow(14px 22px 16px rgba(0, 0, 0, 0.45));
}

.flight.moving {
  transition: transform 420ms var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .flight.held,
  .flight.moving {
    transition: none;
  }
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec vue-tsc --noEmit`
Expected: 无输出，退出码 0。

- [ ] **Step 3: 浏览器验证（逐项截图）**

1. `[DECK]` 场景：左侧两行 × 3 个磁带盒，带 ±4° 错落；标题显示当前榜单名；翻页显示 `01 / NN`。
2. 悬停磁带盒：抬起，阴影变大。
3. 点击：盒盖向下翻开，磁带上滑露出一半；点另一个盒子时前一个合上。
4. 拖动磁带：跟随指针、按水平速度倾斜；靠近卡座时仓门自动弹开，投放区由虚线变实线高亮。
5. 在投放区外松手：磁带飞回盒子，盒子合上。
6. 在投放区内松手：磁带吸附进带仓，仓门合上，磁带盒显示 `[IN DECK]`。
7. 按 PLAY：键锁定、RUN 灯亮、开始播放、两个带盘转动（小盘更快），LCD 时间走动。
8. 按 PAUSE：音乐暂停、带盘停；再按恢复。Space 键在停止时等同 PLAY，播放时等同 PAUSE。
9. 按 STOP/EJ：停止；再按一次仓门弹开；点仓内磁带，磁带飞回自己的盒子。
10. 仓里有磁带时拖入另一盘：旧磁带飞回盒子，新磁带装入。
11. 聚焦磁带盒按 Enter：自动打开并装入。
12. 没有磁带时按 PLAY、以及按 REC / REW / F.FWD：键被顶回（回弹动画）。
13. 拖动进度到接近结尾（控制台 `player.seek(player.duration - 3)`）：播完自动停止，PLAY 弹起，不切下一首。
14. 切回 `[WALL]`：音乐不中断，底栏正常；从封面墙切歌后再回 `[DECK]`，仓内磁带标签变成新歌，PLAY 状态与播放一致。
15. 按 `L` 或点 `[LRC]`：歌词面板正常打开。

用 Web Animations / 轮询读取计算样式确认中间状态（截图工具可能只抓到结束帧）。

---

### Task 9: 收尾验证

**Files:** 无新增

- [ ] **Step 1: 单测**

Run: `pnpm test`
Expected: `reels.test.ts`、`deckMachine.test.ts` 全部 PASS。

- [ ] **Step 2: 生产构建**

Run: `pnpm build`
Expected: 退出码 0；`dist/assets` 中出现单独的 DeckScene chunk；PWA precache 条目里不含 `scene/desk.png`。

- [ ] **Step 3: 窄屏检查**

把浏览器窗口缩到约 390px 宽，确认舞台等比缩小、居中、无横向滚动条，拖拽落点仍准确（`toStage` 已按 `scale` 换算）。

- [ ] **Step 4: 更新规格状态**

在 `docs/superpowers/specs/2026-11-03-cassette-deck-scene-design.md` 的「状态」一节把一期标为「已完成」。
