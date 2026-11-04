# 黑胶封面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 详情页封面可点切换像素风黑胶，带全息切换、旋转/唱臂、analyser 反光，并记住偏好。

**Architecture:** `settings.coverVinyl` 持久化；`VinylCover.vue` 封装方封面/黑胶双态与切换动画；`NowPlaying` 两处封面替换并对 ghost 在黑胶态加圆角。

**Tech Stack:** Vue 3.5、Pinia settings、WAAPI / CSS transform、AnalyserNode

## Global Constraints
- pnpm；源码只用 Write/StrReplace
- 减弱动效：无旋转、瞬切
- 旋转在独立 HTML 盒子 transform 上；律动只改小反光节点
- 手机点击勿与层拖拽冲突（移动阈值）

---

### Task 1: settings + VinylCover

**Files:**
- Modify: `src/stores/settings.ts`
- Create: `src/components/VinylCover.vue`
- Create: 本计划与 `docs/superpowers/specs/2026-11-04-vinyl-cover-design.md`

- [ ] **Step 1:** `coverVinyl` 默认 false，并入 settings
- [ ] **Step 2:** 实现 `VinylCover`：双态 UI、点击切换、全息扫描、旋转/唱臂、analyser 反光、reduced-motion
- [ ] **Step 3:** `pnpm exec vue-tsc --noEmit`

### Task 2: NowPlaying 接线

**Files:**
- Modify: `src/components/NowPlaying.vue`

- [ ] **Step 1:** 桌面/手机 `.np-cover` 使用 `VinylCover`；黑胶态角标隐藏
- [ ] **Step 2:** ghost 在 `coverVinyl` 时 `border-radius: 50%`
- [ ] **Step 3:** `vue-tsc` + `pnpm build`

### Task 3: 浏览器验收

- [ ] **Step 1:** 桌面点封面切黑胶/切回；播放旋转、暂停缓停、唱臂；刷新保持
- [ ] **Step 2:** 390px play 层同样验证；上滑歌词时封面缩小仍合理
