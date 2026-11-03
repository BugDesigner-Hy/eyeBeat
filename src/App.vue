<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch, watchEffect } from 'vue'
import AccountDialog from './components/AccountDialog.vue'
import AppHeader from './components/AppHeader.vue'
import CommandPalette from './components/CommandPalette.vue'
import CoverWall from './components/CoverWall.vue'
import FxPanel from './components/FxPanel.vue'
import LyricsBackdrop from './components/LyricsBackdrop.vue'
import LyricsPanel from './components/LyricsPanel.vue'
import MobileSheet from './components/MobileSheet.vue'
import NowPlaying from './components/NowPlaying.vue'
import PlayerBar from './components/PlayerBar.vue'
import { useMobile } from './composables/useMobile'
import { useAccountStore } from './stores/account'
import { useLyricsStore } from './stores/lyrics'
import { usePlayerStore } from './stores/player'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'
import { useAccentSync } from './theme'

const store = usePlayerStore()
const account = useAccountStore()
const lyrics = useLyricsStore()
const settings = useSettingsStore()
const ui = useUiStore()
const mobile = useMobile()

useAccentSync()

/** 收起后的胶囊高度 52px + 底边距 20px */
const CAPSULE_DOCK = '72px'
/** 手机端迷你播放条 64px + 底部安全区 */
const MOBILE_DOCK = 'calc(64px + env(safe-area-inset-bottom))'
watchEffect(() => {
  const h = !store.current
    ? '0px'
    : mobile.value
      ? MOBILE_DOCK
      : ui.barCollapsed
        ? CAPSULE_DOCK
        : 'var(--bar-h)'
  document.documentElement.style.setProperty('--dock-h', h)
})

/** 闲置时封面墙退后、歌词成为主角；有任何面板开着时不打扰 */
const ambient = computed(
  () =>
    !mobile.value &&
    settings.backdropLyrics &&
    store.isPlaying &&
    ui.idle &&
    !!lyrics.lyrics?.synced &&
    !ui.lyricsVisible &&
    !ui.detailOpen &&
    !ui.fxOpen &&
    !ui.paletteOpen &&
    !ui.menuOpen &&
    !account.loginOpen,
)
watchEffect(() => document.documentElement.classList.toggle('ambient', ambient.value))
watchEffect(() => document.documentElement.classList.toggle('detail-open', ui.detailOpen))
watch(
  () => store.current,
  (t) => !t && ui.toggleDetail(false),
)
watch(mobile, (m) => !m && ui.toggleMenu(false))

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.togglePalette()
    return
  }
  if (ui.paletteOpen || account.loginOpen) return
  const target = e.target as HTMLElement
  if (target.closest('input, textarea, [role="slider"]') || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === '/') {
    e.preventDefault()
    ui.togglePalette(true)
  } else if (e.code === 'Space') {
    e.preventDefault()
    store.toggle()
  } else if (e.key === 'ArrowRight') {
    store.seek(store.currentTime + 5)
  } else if (e.key === 'ArrowLeft') {
    store.seek(store.currentTime - 5)
  } else if (e.key.toLowerCase() === 'l' && store.current) {
    if (mobile.value) ui.toggleDetail(true, 1)
    else ui.toggleLyrics()
  } else if (e.key.toLowerCase() === 'b' && store.current) {
    ui.toggleBar()
  } else if (e.key === 'Escape') {
    if (ui.menuOpen) ui.toggleMenu(false)
    else if (ui.detailOpen) ui.toggleDetail(false)
    else ui.toggleFx(false)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <AppHeader />
  <main>
    <CoverWall />
  </main>

  <Transition name="ambient" :duration="{ enter: 900, leave: 260 }">
    <LyricsBackdrop v-if="ambient" />
  </Transition>

  <PlayerBar />
  <NowPlaying />

  <!-- 子元素的逐行显影比根元素的动画结束得晚，需显式给出时长 -->
  <Transition name="holo" :duration="{ enter: 1000, leave: 380 }">
    <LyricsPanel v-if="ui.lyricsVisible && store.current && !ui.detailOpen && !mobile" />
  </Transition>

  <!-- 频段自检扫描比根元素的展开结束得晚，需显式给出时长 -->
  <Transition name="fx" :duration="{ enter: 1150, leave: 340 }">
    <FxPanel v-if="ui.fxOpen" />
  </Transition>

  <Transition name="toast">
    <div v-if="store.notice" class="toast" role="status">{{ store.notice }}</div>
  </Transition>

  <Transition name="toast">
    <CommandPalette v-if="ui.paletteOpen" />
  </Transition>

  <!-- 条目逐行显影比遮罩淡入结束得晚，需显式给出时长 -->
  <Transition name="sheet" :duration="{ enter: 600, leave: 220 }">
    <MobileSheet v-if="ui.menuOpen && mobile" />
  </Transition>

  <Transition name="toast">
    <AccountDialog v-if="account.loginOpen" />
  </Transition>

  <div class="scanlines" aria-hidden="true" />
</template>
