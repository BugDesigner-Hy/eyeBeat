import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

const BAR_KEY = 'himusic.barCollapsed'
const IDLE_MS = 4000

/** 手机端详情页的分页：0 播放、1 歌词、2 信息 */
export type DetailPage = 0 | 1 | 2

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

export const useUiStore = defineStore('ui', () => {
  const lyricsVisible = ref(false)
  const paletteOpen = ref(false)
  const fxOpen = ref(false)
  const detailOpen = ref(false)
  /** 详情页的封面从缩略图“拎出”期间隐藏缩略图，飞回落位后才恢复 */
  const coverLifted = ref(false)
  const detailPage = ref<DetailPage>(0)
  const menuOpen = ref(false)
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
  function toggleDetail(v = !detailOpen.value, page: DetailPage = 0) {
    if (v) detailPage.value = page
    detailOpen.value = v
  }
  const toggleMenu = (v = !menuOpen.value) => (menuOpen.value = v)

  /** 一段时间没有任何输入：用于进入氛围模式 */
  const idle = ref(false)
  let idleTimer = 0
  function wake() {
    idle.value = false
    clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => (idle.value = true), IDLE_MS)
  }
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(type, wake, { passive: true, capture: true })
  }
  wake()

  const barCollapsed = ref(localStorage.getItem(BAR_KEY) === '1')
  function toggleBar(v = !barCollapsed.value) {
    barCollapsed.value = v
    localStorage.setItem(BAR_KEY, v ? '1' : '0')
  }

  return {
    lyricsVisible,
    paletteOpen,
    fxOpen,
    detailOpen,
    detailPage,
    menuOpen,
    coverLifted,
    barCollapsed,
    idle,
    installPrompt,
    install,
    toggleLyrics,
    togglePalette,
    toggleFx,
    toggleDetail,
    toggleMenu,
    toggleBar,
  }
})
