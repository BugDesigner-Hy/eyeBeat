import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

const BAR_KEY = 'himusic.barCollapsed'
const IDLE_MS = 30_000

/** 手机端详情页的分页：0 播放、1 歌词、2 信息、3 评论 */
export type DetailPage = 0 | 1 | 2

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

export const useUiStore = defineStore('ui', () => {
  const lyricsVisible = ref(false)
  const paletteOpen = ref(false)
  const fxOpen = ref(false)
  const detailOpen = ref(false)
  /** 详情页展开左侧封面时：底栏封面+歌名被“拎走”；收起左侧或关闭落位后恢复 */
  const coverLifted = ref(false)
  const detailPage = ref<DetailPage>(0)
  /** 桌面窄屏（< 1440px）详情页的评论抽屉 */
  const commentsOpen = ref(false)
  const menuOpen = ref(false)
  /** 全屏关机待机；不写 localStorage，刷新即开机 */
  const poweredOff = ref(false)
  /** 关机前是否在播放，开机后用于续播 */
  const resumeOnBoot = ref(false)
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
    else commentsOpen.value = false
    // 已打开时再带 page 调用（例如 L 键）也要更新页码，供手机手势层切换
    detailOpen.value = v
  }
  const toggleComments = (v = !commentsOpen.value) => (commentsOpen.value = v)
  const toggleMenu = (v = !menuOpen.value) => (menuOpen.value = v)

  function togglePower(v = !poweredOff.value) {
    if (v) {
      menuOpen.value = false
      paletteOpen.value = false
      fxOpen.value = false
      detailOpen.value = false
      commentsOpen.value = false
      lyricsVisible.value = false
    }
    poweredOff.value = v
  }

  /** 关机屏外的入口（顶栏 / P）请求开机，由 PowerOffScreen 播 CRT 后关 poweredOff */
  const bootNonce = ref(0)
  function requestBoot() {
    if (poweredOff.value) bootNonce.value++
  }
  function powerToggle() {
    if (poweredOff.value) requestBoot()
    else togglePower(true)
  }

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
    commentsOpen,
    menuOpen,
    poweredOff,
    resumeOnBoot,
    bootNonce,
    coverLifted,
    barCollapsed,
    idle,
    installPrompt,
    install,
    toggleLyrics,
    togglePalette,
    toggleFx,
    toggleDetail,
    toggleComments,
    toggleMenu,
    togglePower,
    requestBoot,
    powerToggle,
    toggleBar,
  }
})
