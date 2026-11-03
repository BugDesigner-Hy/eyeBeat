<script setup lang="ts">
import { onBeforeUnmount, onMounted, watchEffect } from 'vue'
import AccountDialog from './components/AccountDialog.vue'
import AppHeader from './components/AppHeader.vue'
import CommandPalette from './components/CommandPalette.vue'
import CoverWall from './components/CoverWall.vue'
import FxPanel from './components/FxPanel.vue'
import LyricsBackdrop from './components/LyricsBackdrop.vue'
import LyricsPanel from './components/LyricsPanel.vue'
import PlayerBar from './components/PlayerBar.vue'
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

useAccentSync()

/** 收起后的胶囊高度 52px + 底边距 20px */
const CAPSULE_DOCK = '72px'
watchEffect(() => {
  const h = !store.current ? '0px' : ui.barCollapsed ? CAPSULE_DOCK : 'var(--bar-h)'
  document.documentElement.style.setProperty('--dock-h', h)
})

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
    ui.toggleLyrics()
  } else if (e.key.toLowerCase() === 'b' && store.current) {
    ui.toggleBar()
  } else if (e.key === 'Escape') {
    ui.toggleFx(false)
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

  <LyricsBackdrop v-if="settings.backdropLyrics && store.current && lyrics.lyrics?.synced" />

  <PlayerBar />

  <!-- 子元素的逐行显影比根元素的动画结束得晚，需显式给出时长 -->
  <Transition name="holo" :duration="{ enter: 1000, leave: 380 }">
    <LyricsPanel v-if="ui.lyricsVisible && store.current" />
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

  <Transition name="toast">
    <AccountDialog v-if="account.loginOpen" />
  </Transition>

  <div class="scanlines" aria-hidden="true" />
</template>
