import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { provider } from '../api'
import { errorMessage } from '../api/http'
import type { StreamSource, Track } from '../api/types'
import { AudioEngine } from '../audio/engine'
import { useAccountStore } from './account'
import { useSettingsStore } from './settings'

export type PlayMode = 'list' | 'one' | 'shuffle'

const PAGE_SIZE = 40
const MAX_AUTO_SKIP = 3
const MANUAL_FADE_SEC = 0.5
const VOLUME_KEY = 'himusic.volume'

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function mediaErrorText(err: MediaError | null): string {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return '网络错误'
    case MediaError.MEDIA_ERR_DECODE:
      return '解码失败'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return '音源不可用'
    default:
      return '播放失败'
  }
}

export const usePlayerStore = defineStore('player', () => {
  const settings = useSettingsStore()
  const providerName = provider.name
  const fxAvailable = provider.streamCors
  const engine = new AudioEngine(provider.streamCors)

  /* ---------------- 列表 ---------------- */

  const account = useAccountStore()
  const shelfKey = `himusic.shelf.${provider.id}`
  const shelves = computed(() => provider.shelves.filter((s) => !s.requiresLogin || account.loggedIn))
  const shelfId = ref(localStorage.getItem(shelfKey) ?? provider.shelves[0].id)
  const shelf = computed(() => shelves.value.find((s) => s.id === shelfId.value) ?? shelves.value[0])

  const tracks = ref<Track[]>([])
  const keyword = ref('')
  const listLoading = ref(false)
  const listError = ref('')
  /** 正在换分区/搜索，屏幕上还是旧列表 */
  const listStale = ref(false)
  const hasMore = ref(true)
  let nextOffset = 0
  let listToken = 0

  async function loadList(reset = false) {
    if (!reset && (listLoading.value || !hasMore.value)) return
    const token = ++listToken
    if (reset) {
      nextOffset = 0
      hasMore.value = true
      listStale.value = tracks.value.length > 0
    }
    listLoading.value = true
    listError.value = ''
    const kw = keyword.value
    const opts = { limit: PAGE_SIZE, offset: nextOffset }
    try {
      const page = kw ? await provider.search(kw, opts) : await provider.getShelf(shelf.value.id, opts)
      if (token !== listToken) return
      nextOffset += PAGE_SIZE
      const base = reset ? [] : tracks.value
      const seen = new Set(base.map((t) => t.id))
      const fresh = page.filter((t) => !seen.has(t.id) && !!seen.add(t.id))
      const queueFollowsList = !reset && queue.value === tracks.value
      tracks.value = [...base, ...fresh]
      if (queueFollowsList) queue.value = tracks.value
      hasMore.value = fresh.length > 0
    } catch (e) {
      if (token !== listToken) return
      listError.value = errorMessage(e)
      // 换分区失败时别把上一个分区的封面留在原地，否则看起来像点了没反应
      if (reset) tracks.value = []
    } finally {
      if (token === listToken) {
        listLoading.value = false
        listStale.value = false
      }
    }
  }

  function search(kw: string) {
    keyword.value = kw.trim()
    return loadList(true)
  }

  function openShelf(id: string) {
    const prev = shelf.value.id
    shelfId.value = id
    localStorage.setItem(shelfKey, id)
    keyword.value = ''
    // 分区真的变了由下面的 watch 负责加载
    if (shelf.value.id === prev) return loadList(true)
  }

  // 登录状态晚于首屏确定：上次停在需登录的分区时，登录确认后再加载一次；退出后退回默认分区
  watch(
    () => shelf.value.id,
    (id, prev) => {
      if (prev !== undefined && !keyword.value && id !== prev) void loadList(true)
    },
  )

  /* ---------------- 播放 ---------------- */

  const queue = shallowRef<Track[]>([])
  const current = shallowRef<Track | null>(null)
  const isPlaying = ref(false)
  const buffering = ref(false)
  const currentTime = ref(0)
  /** 音频在原曲中的起点（试听片段可能从中间开始） */
  const streamOffset = ref(0)
  const duration = ref(0)
  const volume = ref(clamp01(Number(localStorage.getItem(VOLUME_KEY) ?? 0.8)))
  const muted = ref(false)
  const mode = ref<PlayMode>('list')
  const notice = ref('')
  const analyser = shallowRef<AnalyserNode | null>(null)
  /** 当前曲目的播放地址信息（编码、码率等） */
  const streamInfo = shallowRef<StreamSource | null>(null)
  /** 建图后才有；依赖 analyser 以便建图时刷新 */
  const sampleRate = computed(() => (analyser.value ? engine.sampleRate : null))

  engine.setVolume(volume.value)

  let playToken = 0
  let failedToken = -1
  let failStreak = 0
  let loaded = false

  function ensureGraph() {
    if (engine.ensureGraph()) analyser.value = engine.analyser
  }

  async function play(track: Track, { auto = false } = {}) {
    ensureGraph()
    const token = ++playToken
    current.value = track
    currentTime.value = 0
    streamOffset.value = 0
    streamInfo.value = null
    duration.value = track.duration
    buffering.value = true
    setMediaMetadata(track)
    const fade = settings.crossfade ? (auto ? settings.crossfadeSec : MANUAL_FADE_SEC) : 0
    try {
      const stream = await provider.getStream(track)
      if (token !== playToken) return
      if (!stream) throw new Error(account.supported && !account.loggedIn ? '暂无可用音源，登录后再试' : '暂无可用音源')
      loaded = true
      streamInfo.value = stream
      streamOffset.value = stream.offset ?? 0
      if (stream.preview) {
        showNotice(account.loggedIn ? '仅能播放试听片段（需要会员）' : '仅能播放试听片段，登录后可播放完整版')
      }
      await engine.load(stream.url, fade)
    } catch (e) {
      if (token === playToken && !isAbort(e)) fail(errorMessage(e))
    }
  }

  function playFromList(track: Track) {
    queue.value = tracks.value
    if (current.value?.id === track.id && failedToken !== playToken) return toggle()
    play(track)
  }

  function fail(reason: string) {
    if (failedToken === playToken) return
    failedToken = playToken
    buffering.value = false
    isPlaying.value = false
    showNotice(`无法播放「${current.value?.title ?? ''}」：${reason}`)
    if (++failStreak <= MAX_AUTO_SKIP && queue.value.length > 1) {
      const token = playToken
      window.setTimeout(() => token === playToken && next(), 1200)
    }
  }

  function step(dir: 1 | -1, auto = false) {
    const list = queue.value
    if (!list.length) return
    if (mode.value === 'shuffle' && list.length > 1) {
      let pick: Track
      do pick = list[Math.floor(Math.random() * list.length)]
      while (pick.id === current.value?.id)
      return play(pick, { auto })
    }
    const idx = list.findIndex((t) => t.id === current.value?.id)
    if (idx < 0) return play(list[0], { auto })
    play(list[(idx + dir + list.length) % list.length], { auto })
  }

  /** 详情页的「接下来播放」；随机模式下无法预知，返回空 */
  function upcoming(n: number): Track[] {
    const list = queue.value
    if (mode.value === 'shuffle' || list.length < 2) return []
    const idx = list.findIndex((t) => t.id === current.value?.id)
    const out: Track[] = []
    const max = idx === -1 ? list.length : list.length - 1
    for (let k = 1; k <= Math.min(n, max); k++) out.push(list[(idx + k + list.length) % list.length])
    return out
  }

  const next = () => step(1)

  function prev() {
    if (engine.audio.currentTime > 3) seek(0)
    else step(-1)
  }

  function toggle() {
    const track = current.value
    if (!track) return
    if (!loaded || failedToken === playToken) return play(track)
    if (engine.audio.paused) {
      ensureGraph()
      engine.play().catch((e) => !isAbort(e) && fail(errorMessage(e)))
    } else {
      engine.pause()
    }
  }

  function seek(time: number) {
    if (!Number.isFinite(time) || !loaded) return
    engine.seek(Math.max(0, Math.min(time, duration.value || time)))
    currentTime.value = engine.audio.currentTime
  }

  function setVolume(v: number) {
    volume.value = clamp01(v)
    muted.value = false
    engine.setVolume(volume.value)
    engine.setMuted(false)
    localStorage.setItem(VOLUME_KEY, String(volume.value))
  }

  function toggleMute() {
    muted.value = !muted.value
    engine.setMuted(muted.value)
  }

  function setMode(m: PlayMode) {
    mode.value = m
  }

  function cycleMode() {
    const order: PlayMode[] = ['list', 'one', 'shuffle']
    mode.value = order[(order.indexOf(mode.value) + 1) % order.length]
  }

  watch(mode, (m) => engine.setLoop(m === 'one'), { immediate: true })
  watch(() => settings.eqGains, (g) => engine.setEq(g), { immediate: true })
  watch(() => settings.bitcrush, (on) => engine.setBitcrush(on), { immediate: true })
  watch(
    () => (settings.crossfade ? settings.crossfadeSec : 0),
    (sec) => engine.setCrossfade(sec),
    { immediate: true },
  )

  let raf = 0
  function tick() {
    currentTime.value = engine.audio.currentTime
    raf = engine.audio.paused ? 0 : requestAnimationFrame(tick)
  }

  engine.on((type) => {
    const el = engine.audio
    switch (type) {
      case 'play':
        isPlaying.value = true
        if (!raf) raf = requestAnimationFrame(tick)
        break
      case 'pause':
        isPlaying.value = false
        break
      case 'waiting':
        buffering.value = true
        break
      case 'playing':
        buffering.value = false
        failStreak = 0
        break
      case 'timeupdate':
        if (!raf) currentTime.value = el.currentTime
        break
      case 'durationchange':
        if (Number.isFinite(el.duration) && el.duration > 0) duration.value = el.duration
        break
      case 'nearend':
      case 'ended':
        step(1, true)
        break
      case 'error':
        if (el.getAttribute('src')) fail(mediaErrorText(el.error))
        break
    }
  })

  /* ---------------- 杂项 ---------------- */

  let noticeTimer = 0
  function showNotice(msg: string) {
    notice.value = msg
    clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => (notice.value = ''), 3200)
  }

  function setMediaMetadata(track: Track) {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork: [{ src: track.cover.large }],
    })
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', toggle)
    navigator.mediaSession.setActionHandler('pause', toggle)
    navigator.mediaSession.setActionHandler('nexttrack', next)
    navigator.mediaSession.setActionHandler('previoustrack', prev)
  }

  return {
    providerName,
    fxAvailable,
    shelves,
    shelf,
    openShelf,
    tracks,
    keyword,
    listLoading,
    listError,
    listStale,
    hasMore,
    loadList,
    search,
    queue,
    current,
    isPlaying,
    buffering,
    currentTime,
    streamOffset,
    duration,
    volume,
    muted,
    mode,
    notice,
    analyser,
    streamInfo,
    sampleRate,
    play,
    playFromList,
    toggle,
    upcoming,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    setMode,
    cycleMode,
    showNotice,
  }
})
