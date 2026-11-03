import { getJson, qs, type QueryParams } from '../http'
import type { MusicProvider, Track } from '../types'

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
    return { url: `${BASE}/tracks/${encodeURIComponent(track.id)}/stream?${qs({ app_name: APP_NAME })}` }
  },
}
