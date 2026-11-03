import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { provider } from '../api'
import { errorMessage } from '../api/http'
import type { Track, TrackDetail } from '../api/types'
import { usePlayerStore } from './player'
import { useUiStore } from './ui'

export const useDetailStore = defineStore('detail', () => {
  const player = usePlayerStore()
  const ui = useUiStore()
  const detail = shallowRef<TrackDetail | null>(null)
  const loading = ref(false)
  const error = ref('')
  const cache = new Map<string, TrackDetail>()
  let token = 0

  async function load(track: Track) {
    const t = ++token
    const key = `${track.provider}:${track.id}`
    error.value = ''
    const hit = cache.get(key)
    detail.value = hit ?? null
    if (hit || !provider.getDetail) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const d = await provider.getDetail(track)
      cache.set(key, d)
      if (t === token) detail.value = d
    } catch (e) {
      if (t === token) error.value = errorMessage(e)
    } finally {
      if (t === token) loading.value = false
    }
  }

  // 只在详情页开着时请求，切歌时跟着换
  watch(
    () => [ui.detailOpen, player.current] as const,
    ([open, track]) => {
      if (open && track) void load(track)
    },
    { immediate: true },
  )

  return { detail, loading, error }
})
