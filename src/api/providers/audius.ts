import { getJson, qs, type QueryParams } from '../http'
import type { MusicProvider, Track, TrackDetail, TrackStat } from '../types'

const BASE = (import.meta.env.VITE_AUDIUS_API_BASE || 'https://api.audius.co/v1').replace(/\/$/, '')
const APP_NAME = 'hiMusic'

type ArtworkSize = '150x150' | '480x480' | '1000x1000'

interface AudiusTrack {
  id: string
  title: string
  duration: number
  genre?: string
  is_streamable?: boolean
  artwork?: (Partial<Record<ArtworkSize, string>> & { mirrors?: string[] }) | null
  user?: { name?: string; handle?: string }
}

interface AudiusTrackDetail extends AudiusTrack {
  release_date?: string | null
  mood?: string | null
  /** 逗号分隔 */
  tags?: string | null
  description?: string | null
  play_count?: number
  favorite_count?: number
  repost_count?: number
}

function dateOnly(s?: string | null): string | undefined {
  if (!s) return undefined
  const m = /^\d{4}-\d{2}-\d{2}/.exec(s)
  if (m) return m[0]
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}

function toTrack(t: AudiusTrack): Track | null {
  const medium = t.artwork?.['480x480']
  if (!medium || t.is_streamable === false) return null
  return {
    id: t.id,
    provider: 'audius',
    title: t.title,
    artist: t.user?.name || t.user?.handle || 'Unknown',
    album: t.genre,
    duration: t.duration,
    cover: {
      small: t.artwork?.['150x150'] ?? medium,
      medium,
      large: t.artwork?.['1000x1000'] ?? medium,
      mirrors: t.artwork?.mirrors,
    },
  }
}

async function listTracks(path: string, params: QueryParams): Promise<Track[]> {
  const { data } = await getJson<{ data?: AudiusTrack[] }>(
    `${BASE}${path}?${qs({ ...params, app_name: APP_NAME })}`,
  )
  return (data ?? []).map(toTrack).filter((t): t is Track => t !== null)
}

export const audiusProvider: MusicProvider = {
  id: 'audius',
  name: 'Audius',
  streamCors: true,
  coverCors: true,
  shelves: [
    { id: 'month', name: '本月热门', tag: 'TRENDING / MONTH' },
    { id: 'week', name: '本周热门', tag: 'TRENDING / WEEK' },
    { id: 'allTime', name: '历史热门', tag: 'TRENDING / ALL TIME' },
  ],

  getShelf(id, { limit = 40, offset = 0 } = {}) {
    return listTracks('/tracks/trending', { limit, offset, time: id })
  },

  search(keyword, { limit = 40, offset = 0 } = {}) {
    return listTracks('/tracks/search', { query: keyword, limit, offset })
  },

  async getStream(track) {
    return { url: `${BASE}/tracks/${encodeURIComponent(track.id)}/stream?${qs({ app_name: APP_NAME })}`, codec: 'MP3' }
  },

  async getDetail(track): Promise<TrackDetail> {
    const { data } = await getJson<{ data?: AudiusTrackDetail }>(
      `${BASE}/tracks/${encodeURIComponent(track.id)}?${qs({ app_name: APP_NAME })}`,
    )
    if (!data) throw new Error('曲目不存在')
    const stats: TrackStat[] = []
    for (const [label, value] of [
      ['PLAYS', data.play_count],
      ['LIKES', data.favorite_count],
      ['REPOSTS', data.repost_count],
    ] as const) {
      if (typeof value === 'number') stats.push({ label, value })
    }
    const tags = data.tags
      ?.split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    return {
      released: dateOnly(data.release_date),
      genre: data.genre || undefined,
      mood: data.mood || undefined,
      tags: tags?.length ? tags : undefined,
      description: data.description?.trim() || undefined,
      stats,
    }
  },
}
