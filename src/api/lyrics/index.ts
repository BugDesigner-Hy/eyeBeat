import { idbGet, idbSet } from '../../utils/idb'
import type { LyricsCandidate, LyricsSource, Track } from '../types'
import { scoreCandidate } from './match'

const CACHE_VERSION = 2
const TTL_FOUND = 14 * 86400_000
const TTL_EMPTY = 86400_000

interface CacheEntry {
  v: number
  at: number
  candidates: LyricsCandidate[]
}

const cacheKey = (track: Track) => `lyrics:${track.provider}:${track.id}`

function rank(track: Track, candidates: LyricsCandidate[]): LyricsCandidate[] {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(track, c) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

/**
 * 先查精确来源，没有同步歌词再并发查询其余来源；按匹配度从高到低排序。
 * 原始结果缓存在 IndexedDB，评分每次重算。
 */
export async function searchLyrics(
  track: Track,
  sources: LyricsSource[],
  { refresh = false } = {},
): Promise<LyricsCandidate[]> {
  const key = cacheKey(track)
  if (!refresh) {
    const cached = await idbGet<CacheEntry>(key)
    const ttl = cached?.candidates.length ? TTL_FOUND : TTL_EMPTY
    if (cached && cached.v === CACHE_VERSION && Date.now() - cached.at < ttl) return rank(track, cached.candidates)
  }

  const query = (list: LyricsSource[]) => Promise.allSettled(list.map((s) => s.search(track)))
  const primary = sources.filter((s) => s.primary)
  let settled = await query(primary)
  const hasSynced = settled.some((r) => r.status === 'fulfilled' && r.value.some((c) => c.lyrics.synced))
  if (!hasSynced) settled = [...settled, ...(await query(sources.filter((s) => !s.primary)))]
  const candidates = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  // 有来源失败时结果不完整，不缓存，下次重新查
  if (settled.every((r) => r.status === 'fulfilled')) void idbSet(key, { v: CACHE_VERSION, at: Date.now(), candidates } satisfies CacheEntry)
  return rank(track, candidates)
}

export { ACCEPT_SCORE } from './match'
