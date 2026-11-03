import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

const BAR_KEY = 'himusic.barCollapsed'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

export const useUiStore = defineStore('ui', () => {
  const lyricsVisible = ref(false)
  const paletteOpen = ref(false)
  const fxOpen = ref(false)
  const installPrompt = shallowRef<InstallPromptEvent | null>(null)

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt.value = e as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => (installPrompt.value = null))

  async function install() {
    const evt = installPrompt.value
    if (!evt) return
    installPrompt.value = null
    await evt.prompt()
  }

  const toggleLyrics = (v = !lyricsVisible.value) => (lyricsVisible.value = v)
  const togglePalette = (v = !paletteOpen.value) => (paletteOpen.value = v)
  const toggleFx = (v = !fxOpen.value) => (fxOpen.value = v)

  const barCollapsed = ref(localStorage.getItem(BAR_KEY) === '1')
  function toggleBar(v = !barCollapsed.value) {
    barCollapsed.value = v
    localStorage.setItem(BAR_KEY, v ? '1' : '0')
  }

  return {
    lyricsVisible,
    paletteOpen,
    fxOpen,
    barCollapsed,
    installPrompt,
    install,
    toggleLyrics,
    togglePalette,
    toggleFx,
    toggleBar,
  }
})
