import { getJson, qs, type QueryParams } from '../http'
import type { MusicProvider, PageOptions, Track, TrackDetail, TrackStat } from '../types'

const BASE = 'https://api.jamendo.com/v3.0'
const CLIENT_ID = (import.meta.env.VITE_JAMENDO_CLIENT_ID as string | undefined)?.trim() ?? ''

export const jamendoConfigured = CLIENT_ID.length > 0

/** 列表阶段缓存音频地址，避免 getStream 再打一轮 */
const audioCache = new Map<string, string>()

interface JamendoTrack {
  id: string
  name: string
  duration: number
  artist_name?: string
  album_name?: string
  album_image?: string
  image?: string
  audio?: string
  releasedate?: string
  musicinfo?: {
    tags?: { genres?: string[]; vartags?: string[] }
  }
  stats?: { rate?: { listens?: number; downloads?: number } }
}

interface JamendoListRes {
  results?: JamendoTrack[]
}

function cover(url?: string) {
  const medium = url || ''
  if (!medium) return null
  // Jamendo 图床可用 width/height 参数缩放
  const small = medium.includes('?') ? `${medium}&width=150` : `${medium}?width=150`
  const large = medium.includes('?') ? `${medium}&width=600` : `${medium}?width=600`
  return { small, medium, large }
}

function toTrack(t: JamendoTrack): Track | null {
  const art = cover(t.album_image || t.image)
  if (!art || !t.audio) return null
  audioCache.set(t.id, t.audio)
  return {
    id: t.id,
    provider: 'jamendo',
    title: t.name,
    artist: t.artist_name || 'Unknown',
    album: t.album_name,
    duration: t.duration || 0,
    cover: art,
  }
}

async function listTracks(params: QueryParams): Promise<Track[]> {
  if (!jamendoConfigured) return []
  const data = await getJson<JamendoListRes>(
    `${BASE}/tracks/?${qs({
      client_id: CLIENT_ID,
      format: 'json',
      audioformat: 'mp32',
      include: 'musicinfo stats',
      ...params,
    })}`,
  )
  return (data.results ?? []).map(toTrack).filter((t): t is Track => t !== null)
}

function pageOpts({ limit = 40, offset = 0 }: PageOptions = {}) {
  return { limit, offset }
}

const SHELF_QUERY: Record<string, QueryParams> = {
  popular: { order: 'popularity_month', featured: 'true' },
  electronic: { fuzzytags: 'electronic', order: 'popularity_total' },
  rock: { fuzzytags: 'rock', order: 'popularity_total' },
  jazz: { fuzzytags: 'jazz', order: 'popularity_total' },
  soundtrack: { fuzzytags: 'soundtrack', order: 'popularity_total' },
}

export const jamendoProvider: MusicProvider = {
  id: 'jamendo',
  name: 'Jamendo',
  streamCors: true,
  coverCors: true,
  shelves: [
    { id: 'popular', name: '精选热门', tag: 'POPULAR' },
    { id: 'electronic', name: '电子', tag: 'ELECTRONIC' },
    { id: 'rock', name: '摇滚', tag: 'ROCK' },
    { id: 'jazz', name: '爵士', tag: 'JAZZ' },
    { id: 'soundtrack', name: '原声', tag: 'SOUNDTRACK' },
  ],

  getShelf(id, opts) {
    const q = SHELF_QUERY[id] ?? SHELF_QUERY.popular
    return listTracks({ ...q, ...pageOpts(opts) })
  },

  search(keyword, opts) {
    return listTracks({ namesearch: keyword, order: 'relevance', ...pageOpts(opts) })
  },

  async getStream(track) {
    let url = audioCache.get(track.id)
    if (!url) {
      await listTracks({ id: track.id, limit: 1 })
      url = audioCache.get(track.id)
    }
    if (!url) return null
    return { url, codec: 'MP3', bitrate: 192 }
  },

  async getDetail(track): Promise<TrackDetail> {
    const data = await getJson<JamendoListRes>(
      `${BASE}/tracks/?${qs({
        client_id: CLIENT_ID,
        format: 'json',
        id: track.id,
        include: 'musicinfo stats',
        audioformat: 'mp32',
        limit: 1,
      })}`,
    )
    const row = data.results?.[0]
    if (!row) throw new Error('曲目不存在')
    if (row.audio) audioCache.set(row.id, row.audio)

    const genres = row.musicinfo?.tags?.genres?.filter(Boolean) ?? []
    const vartags = row.musicinfo?.tags?.vartags?.filter(Boolean) ?? []
    const tags = [...genres, ...vartags]
    const stats: TrackStat[] = []
    const listens = row.stats?.rate?.listens
    const downloads = row.stats?.rate?.downloads
    if (typeof listens === 'number') stats.push({ label: 'PLAYS', value: listens })
    if (typeof downloads === 'number') stats.push({ label: 'DL', value: downloads })

    return {
      released: row.releasedate?.slice(0, 10),
      genre: genres[0],
      tags: tags.length ? tags : undefined,
      stats,
    }
  },
}
