# 手机详情页手势 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机详情页去掉左右翻页，改为上滑延展歌词、右滑拉出评论、下滑关闭，顶部标签可点。

**Architecture:** 新增 `useMobileDetail.ts` 管理 `view`/`lrcP`/`cmtP` 与指针手势；`NowPlaying.vue` 手机分支改为单层叠布局（play 层 + lrc 层 + cmt 层），用 transform/opacity 跟手。桌面布局不动。

**Tech Stack:** Vue 3.5、Pointer Events、Web Animations / CSS transition、Pinia `ui.detailPage`

## Global Constraints
- pnpm；编辑只用 Write/StrReplace（勿用 PowerShell 改源码）
- 640px 媒体块放在 `<style>` 末尾
- 动画只用 transform/opacity（及必要的 height）；减弱动效直接切
- 左缘 24px 内右滑不抢系统返回

---

### Task 1: composable + 规格接线

**Files:**
- Create: `src/composables/useMobileDetail.ts`
- Modify: `src/stores/ui.ts`（如需导出辅助，尽量不改）
- Create: 本计划与 `docs/superpowers/specs/2026-11-04-mobile-gestures-design.md`（已写则跳过）

- [ ] **Step 1:** 实现 `useMobileDetail`：`lrcP`/`cmtP`/`view`/`pos`、`go('play'|'lrc'|'cmt')`、`onPointer*`（含边缘、歌词顶部下拉回退、速度阈值）、`hasComments` 守卫、`reduceMotion` 捷径
- [ ] **Step 2:** `pnpm exec vue-tsc --noEmit`
- [ ] **Step 3:** Commit `feat(mobile): gesture state machine for detail layers`

### Task 2: NowPlaying 手机布局替换

**Files:**
- Modify: `src/components/NowPlaying.vue`
- Modify: `src/App.vue`（L 键）

- [ ] **Step 1:** 删除 `.np-pager` 横滑；改为 play / lrc / cmt 叠层；封面随 `lrcP` 缩到顶栏；评论层跟 `cmtP`；收起按钮
- [ ] **Step 2:** 顶部 dots 的 `--p` 绑 `pos`；`goPage` → `go`；关闭拖拽仅 play 且未展开层时；`comments.present` 消失时从 cmt 回 play
- [ ] **Step 3:** App.vue：`l` 在 `detailOpen && mobile` 时切到歌词
- [ ] **Step 4:** `vue-tsc`；Commit `feat(mobile): swipe up for lyrics, swipe right for comments`

### Task 3: 浏览器验收

- [ ] **Step 1:** 390×844：上滑/右滑/标签/回退/无评论/L 键/关闭；截图 play、lrc、cmt
- [ ] **Step 2:** `pnpm build`；Commit 修问题（若有）
