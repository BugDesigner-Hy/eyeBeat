import { getJson, qs, type QueryParams } from '../http'
import { parseLrc, plainLines } from '../../utils/lrc'
import type { LyricsCandidate, LyricsSource, Track } from '../types'
import { ACCEPT_SCORE, cleanTitle, scoreCandidate, titleReadings } from './match'

const BASE = 'https://lrclib.net/api'
const MAX_CANDIDATES = 12

interface LrclibItem {
  id: number
  trackName: string
  artistName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

function toCandidate(item: LrclibItem): LyricsCandidate | null {
  const lines = item.syncedLyrics ? parseLrc(item.syncedLyrics) : plainLines(item.plainLyrics ?? '')
  if (!lines.length) return null
  return {
    id: `lrclib:${item.id}`,
    source: 'lrclib',
    title: item.trackName,
    artist: item.artistName,
    duration: item.duration,
    lyrics: {
      synced: !!item.syncedLyrics,
      wordSynced: lines.some((l) => l.words?.length),
      lines,
    },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** LRCLIB 会限流（429/503），退避重试一次 */
async function query(params: QueryParams): Promise<LrclibItem[]> {
  const url = `${BASE}/search?${qs(params)}`
  try {
    return await getJson<LrclibItem[]>(url)
  } catch {
    await sleep(1200)
    return getJson<LrclibItem[]>(url)
  }
}

export const lrclibSource: LyricsSource = {
  id: 'lrclib',

  /** 逐个尝试各种标题解读，命中可信结果即停，避免触发限流 */
  async search(track: Track) {
    const attempts: QueryParams[] = [
      ...titleReadings(track).map((r) => ({ track_name: r.title, artist_name: r.artist })),
      { q: cleanTitle(track.title) },
    ]
    const seen = new Set<number>()
    const found: LyricsCandidate[] = []
    let failures = 0

    for (const params of attempts) {
      let items: LrclibItem[]
      try {
        items = await query(params)
      } catch {
        failures++
        continue
      }
      for (const item of items) {
        if (item.instrumental || seen.has(item.id) || found.length >= MAX_CANDIDATES) continue
        seen.add(item.id)
        const c = toCandidate(item)
        if (c) found.push(c)
      }
      if (found.some((c) => scoreCandidate(track, c) >= ACCEPT_SCORE)) break
    }

    if (!found.length && failures) throw new Error('lrclib unavailable')
    return found
  },
}
