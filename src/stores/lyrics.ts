import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { lyricsSources } from '../api'
import { ACCEPT_SCORE, searchLyrics } from '../api/lyrics'
import type { LyricLine, LyricsCandidate, Track } from '../api/types'
import { idbClear } from '../utils/idb'
import { usePlayerStore } from './player'
import { useSettingsStore } from './settings'

const CHOICE_KEY = 'himusic.lyricChoice'
const OFFSET_KEY = 'himusic.lyricOffsets'
/** 让高亮略早于演唱，视觉上更跟手 */
const LEAD_SEC = 0.15
/** 手动选择「不显示歌词」 */
export const NO_LYRICS = 'none'

const trackKey = (t: Track) => `${t.provider}:${t.id}`

function readMap(key: string): Record<string, string | number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    return {}
  }
}

function writeMapEntry(key: string, k: string, v: string | number | null) {
  const map = readMap(key)
  if (v === null || v === 0) delete map[k]
  else map[k] = v
  localStorage.setItem(key, JSON.stringify(map))
}

const round1 = (v: number) => Math.round(v * 10) / 10

export const useLyricsStore = defineStore('lyrics', () => {
  const player = usePlayerStore()
  const settings = useSettingsStore()

  const candidates = shallowRef<LyricsCandidate[]>([])
  const chosenId = ref<string | null>(null)
  const loading = ref(false)
  const trackOffset = ref(0)
  let loadedFor = ''

  const selected = computed<LyricsCandidate | null>(() => {
    const list = candidates.value
    if (chosenId.value === NO_LYRICS) return null
    if (chosenId.value) return list.find((c) => c.id === chosenId.value) ?? null
    const best = list[0]
    return best && (best.score ?? 0) >= ACCEPT_SCORE ? best : null
  })

  const lyrics = computed(() => selected.value?.lyrics ?? null)
  const source = computed(() => selected.value?.source ?? null)
  const lines = computed<LyricLine[]>(() => lyrics.value?.lines ?? [])

  /** 已叠加全局与单曲偏移的歌词时间 */
  const time = computed(
    () => player.currentTime + player.streamOffset + settings.lyricOffset + trackOffset.value + LEAD_SEC,
  )

  const activeLine = computed(() => {
    if (!lyrics.value?.synced) return -1
    const list = lines.value
    const t = time.value
    let lo = 0
    let hi = list.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (list[mid].time <= t) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return ans
  })

  async function load(track: Track, refresh = false) {
    const key = trackKey(track)
    if (!refresh && loadedFor === key) return
    loadedFor = key
    candidates.value = []
    chosenId.value = (readMap(CHOICE_KEY)[key] as string | undefined) ?? null
    trackOffset.value = Number(readMap(OFFSET_KEY)[key] ?? 0)
    loading.value = true
    try {
      const res = await searchLyrics(track, lyricsSources, { refresh })
      if (loadedFor === key) candidates.value = res
    } catch {
      if (loadedFor === key) loadedFor = ''
    } finally {
      if (loadedFor === key || loadedFor === '') loading.value = false
    }
  }

  watch(
    () => player.current,
    (track) => track && load(track),
    { immediate: true },
  )

  function choose(id: string | null) {
    const track = player.current
    if (!track) return
    chosenId.value = id
    writeMapEntry(CHOICE_KEY, trackKey(track), id)
  }

  function adjustTrackOffset(delta: number) {
    setTrackOffset(trackOffset.value + delta)
  }

  function setTrackOffset(v: number) {
    const track = player.current
    if (!track) return
    trackOffset.value = round1(v)
    writeMapEntry(OFFSET_KEY, trackKey(track), trackOffset.value)
  }

  function adjustGlobalOffset(delta: number) {
    settings.lyricOffset = round1(settings.lyricOffset + delta)
  }

  function refresh() {
    if (player.current) return load(player.current, true)
  }

  async function clearCache() {
    await idbClear()
    loadedFor = ''
    if (player.current) await load(player.current, true)
  }

  return {
    candidates,
    chosenId,
    selected,
    lyrics,
    source,
    lines,
    loading,
    time,
    activeLine,
    trackOffset,
    choose,
    adjustTrackOffset,
    setTrackOffset,
    adjustGlobalOffset,
    refresh,
    clearCache,
  }
})
