import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { provider } from '../api'
import type { Track, TrackComment } from '../api/types'
import { usePlayerStore } from './player'
import { useUiStore } from './ui'

const MAX_CACHED = 20

export interface CommentThread {
  hot: TrackComment[]
  items: TrackComment[]
  /** 下一页游标，null 表示没有更多 */
  next: string | null
  total?: number
  /** 第一页已返回 */
  ready: boolean
  loading: boolean
  /** 最近一次请求失败：第一页失败时整块隐藏，翻页失败时显示重试 */
  error: boolean
}

const keyOf = (t: Track) => `${t.provider}:${t.id}`

export const useCommentsStore = defineStore('comments', () => {
  const player = usePlayerStore()
  const ui = useUiStore()
  const supported = !!provider.getComments
  /** Map 的插入顺序即最近使用顺序，超出上限时从头淘汰 */
  const cache = reactive(new Map<string, CommentThread>())

  const thread = computed(() => (player.current ? cache.get(keyOf(player.current)) : undefined))
  const total = computed(() => thread.value?.total)
  const visible = computed(() => !!thread.value?.ready && thread.value.hot.length + thread.value.items.length > 0)
  /** 详情页开着、当前曲目的第一页还没回来（含尚未发出请求的那一瞬） */
  const pending = computed(() => {
    const t = thread.value
    return supported && ui.detailOpen && !!player.current && (!t || (t.loading && !t.ready))
  })
  /** 是否给评论区留位置；切歌后新曲目第一页加载期间沿用原值，避免栏位和分页闪一下 */
  const present = ref(false)

  const isCurrent = (key: string) => !!player.current && keyOf(player.current) === key

  async function loadFirst(track: Track) {
    if (!provider.getComments) return
    const key = keyOf(track)
    const hit = cache.get(key)
    cache.delete(key)
    if (hit && (hit.ready || hit.loading)) {
      cache.set(key, hit)
      return
    }
    cache.set(key, { hot: [], items: [], next: null, ready: false, loading: true, error: false })
    for (const k of cache.keys()) {
      if (cache.size <= MAX_CACHED) break
      cache.delete(k)
    }
    const t = cache.get(key)!
    try {
      const page = await provider.getComments(track)
      if (!isCurrent(key)) {
        if (cache.get(key) === t) cache.delete(key)
        return
      }
      t.hot = page.hot ?? []
      t.items = page.items
      t.next = page.next
      t.total = page.total
      t.ready = true
    } catch {
      if (isCurrent(key)) t.error = true
      else if (cache.get(key) === t) cache.delete(key)
    } finally {
      t.loading = false
    }
  }

  async function loadMore() {
    const track = player.current
    const t = thread.value
    if (!track || !t || !provider.getComments || !t.ready || t.loading || t.error || !t.next) return
    const key = keyOf(track)
    t.loading = true
    try {
      const page = await provider.getComments(track, t.next)
      if (!isCurrent(key)) return
      const seen = new Set(t.items.map((c) => c.id))
      t.items = [...t.items, ...page.items.filter((c) => !seen.has(c.id))]
      t.next = page.next
    } catch {
      if (isCurrent(key)) t.error = true
    } finally {
      t.loading = false
    }
  }

  function retry() {
    if (thread.value) thread.value.error = false
    return loadMore()
  }

  // 只在详情页开着时请求，切歌时跟着换
  watch(
    () => [ui.detailOpen, player.current] as const,
    ([open, track]) => {
      if (open && track) void loadFirst(track)
    },
    { immediate: true },
  )
  // 必须注册在上面的请求 watcher 之后：切到第一页失败过的歌时，先让新请求进入 loading，再判断 pending
  watch(
    [visible, pending, () => ui.detailOpen],
    ([v, p, open]) => {
      if (v && open) present.value = true
      else if (!p) present.value = false
    },
    { immediate: true },
  )

  return { thread, total, visible, present, loadMore, retry }
})
