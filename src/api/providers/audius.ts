import { getJson, qs, type QueryParams } from '../http'
import type { MusicProvider, Track, TrackComment, TrackDetail, TrackStat } from '../types'

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
  comment_count?: number
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

const HOT_COMMENTS = 10
const COMMENT_PAGE = 20

interface AudiusComment {
  id: string
  user_id: string
  message: string
  react_count?: number
  /** ISO 时间 */
  created_at: string
  track_timestamp_s?: number | null
  reply_count?: number
  replies?: AudiusComment[] | null
  is_tombstone?: boolean
}

interface AudiusUser {
  id: string
  name?: string
  handle?: string
  profile_picture?: Partial<Record<ArtworkSize, string>> | null
}

interface CommentsRes {
  data?: AudiusComment[]
  related?: { users?: AudiusUser[]; tracks?: { user?: AudiusUser | null }[] }
}

function commentList(id: string, sort: 'top' | 'newest', limit: number, offset: number) {
  return getJson<CommentsRes>(
    `${BASE}/tracks/${encodeURIComponent(id)}/comments?${qs({ limit, offset, sort_method: sort, app_name: APP_NAME })}`,
  )
}

/** 评论列表接口不返回总数，取曲目对象上的 comment_count */
function commentCount(id: string): Promise<number | undefined> {
  return getJson<{ data?: AudiusTrackDetail }>(`${BASE}/tracks/${encodeURIComponent(id)}?${qs({ app_name: APP_NAME })}`)
    .then((r) => r.data?.comment_count)
    .catch(() => undefined)
}

function toComments(res: CommentsRes): TrackComment[] {
  // related.users 不含曲目作者本人，作者只出现在 related.tracks[].user
  const owners = (res.related?.tracks ?? []).flatMap((t) => (t.user ? [t.user] : []))
  const users = new Map([...owners, ...(res.related?.users ?? [])].map((u) => [u.id, u]))
  const map = (c: AudiusComment): TrackComment => {
    const u = users.get(c.user_id)
    const replies = c.replies?.filter((r) => !r.is_tombstone).map(map)
    return {
      id: c.id,
      user: { name: u?.name || u?.handle || 'Unknown', avatar: u?.profile_picture?.['150x150'] },
      content: c.message,
      time: Date.parse(c.created_at) || 0,
      likes: c.react_count ?? 0,
      replies: replies?.length ? replies : undefined,
      replyCount: c.reply_count || undefined,
      at: c.track_timestamp_s ?? undefined,
    }
  }
  return (res.data ?? []).filter((c) => !c.is_tombstone).map(map)
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

  // 游标即 offset
  async getComments(track, cursor) {
    const offset = Number(cursor ?? 0)
    const [hot, latest, total] = await Promise.all([
      cursor ? null : commentList(track.id, 'top', HOT_COMMENTS, 0).catch(() => null),
      commentList(track.id, 'newest', COMMENT_PAGE, offset),
      cursor ? undefined : commentCount(track.id),
    ])
    return {
      hot: hot ? toComments(hot) : undefined,
      items: toComments(latest),
      // 按原始条数判断是否到底，被跳过的已删除评论也占名额
      next: (latest.data?.length ?? 0) < COMMENT_PAGE ? null : String(offset + COMMENT_PAGE),
      total,
    }
  },
}
