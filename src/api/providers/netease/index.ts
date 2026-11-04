import { parseLrc, parseYrc } from '../../../utils/lrc'
import type { Lyrics, LyricsCandidate, LyricsSource, MusicProvider, PageOptions, Shelf, Track, TrackComment, TrackDetail, TrackStat } from '../../types'
import { currentUid, neteaseAccount } from './account'
import { NeteaseError, ncm } from './client'

export { neteaseConfigured } from './client'

const SEARCH_LYRICS_TOP = 3

interface NeteaseSong {
  id: number
  name: string
  ar?: { name: string }[]
  al?: { name?: string; picUrl?: string }
  dt?: number
}

interface NeteaseLyricRes {
  lrc?: { lyric?: string }
  tlyric?: { lyric?: string }
  yrc?: { lyric?: string }
}

interface SongUrlRes {
  data?: {
    url: string | null
    type?: string | null
    /** bps */
    br?: number
    freeTrialInfo?: { start?: number; end?: number } | null
  }[]
}

type QualityKey = 'l' | 'm' | 'h' | 'sq' | 'hr'

interface SongDetailRes {
  songs?: (NeteaseSong &
    Partial<Record<QualityKey, { br?: number } | null>> & {
      alia?: string[]
      tns?: string[]
      pop?: number
      /** 毫秒时间戳 */
      publishTime?: number
    })[]
}

const QUALITY: [QualityKey, string][] = [
  ['l', 'STD'],
  ['m', 'STD'],
  ['h', 'HQ'],
  ['sq', 'SQ'],
  ['hr', 'HR'],
]

/** 发行时间是北京时间零点，按本地日期格式化，避免 toISOString 退到前一天 */
function localDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const https = (url: string) => url.replace(/^http:\/\//, 'https://')
const artists = (s: NeteaseSong) => s.ar?.map((a) => a.name).join(' / ') ?? ''

function toTrack(s: NeteaseSong): Track {
  const pic = https(s.al?.picUrl ?? '')
  return {
    id: String(s.id),
    provider: 'netease',
    title: s.name,
    artist: artists(s) || 'Unknown',
    album: s.al?.name,
    duration: (s.dt ?? 0) / 1000,
    cover: {
      small: `${pic}?param=200y200`,
      medium: `${pic}?param=500y500`,
      large: `${pic}?param=1000y1000`,
    },
  }
}

/* ---------------- 首页分区 ---------------- */

const CHARTS: Record<string, string> = {
  hot: '3778678',
  soaring: '19723756',
  new: '3779629',
}

const SHELVES: Shelf[] = [
  { id: 'hot', name: '热歌榜', tag: 'CHART / HOT' },
  { id: 'soaring', name: '飙升榜', tag: 'CHART / SOARING' },
  { id: 'new', name: '新歌榜', tag: 'CHART / NEW' },
  { id: 'daily', name: '每日推荐', tag: 'FOR YOU / DAILY', requiresLogin: true },
  { id: 'liked', name: '我喜欢的音乐', tag: 'LIBRARY / LIKED', requiresLogin: true },
]

async function playlistTracks(id: string, { limit = 40, offset = 0 }: PageOptions): Promise<Track[]> {
  const res = await ncm<{ songs?: NeteaseSong[] }>('/playlist/track/all', { id, limit, offset })
  return (res.songs ?? []).map(toTrack)
}

async function likedPlaylistId(): Promise<string> {
  const uid = await currentUid()
  if (!uid) throw new NeteaseError('需要登录网易云', 301)
  const res = await ncm<{ playlist?: { id: number }[] }>('/user/playlist', { uid, limit: 1 })
  const id = res.playlist?.[0]?.id
  if (!id) throw new NeteaseError('没有找到「我喜欢的音乐」')
  return String(id)
}

/* ---------------- 歌词 ---------------- */

async function fetchLyrics(id: string): Promise<Lyrics | null> {
  const res = await ncm<NeteaseLyricRes>('/lyric/new', { id }).catch(() => ncm<NeteaseLyricRes>('/lyric', { id }))
  const translated = res.tlyric?.lyric
  const yrc = res.yrc?.lyric ? parseYrc(res.yrc.lyric, translated) : []
  if (yrc.length) return { synced: true, wordSynced: true, lines: yrc }
  const lines = parseLrc(res.lrc?.lyric ?? '', translated)
  return lines.length ? { synced: true, lines } : null
}

async function songCandidate(song: NeteaseSong): Promise<LyricsCandidate | null> {
  const lyrics = await fetchLyrics(String(song.id))
  if (!lyrics) return null
  return {
    id: `netease:${song.id}`,
    source: 'netease',
    title: song.name,
    artist: artists(song),
    duration: (song.dt ?? 0) / 1000,
    lyrics,
  }
}

/** 网易云自己的曲目：按 ID 精确获取 */
const exactLyricsSource: LyricsSource = {
  id: 'netease',
  primary: true,
  async search(track) {
    const lyrics = await fetchLyrics(track.id)
    if (!lyrics) return []
    return [
      {
        id: `netease:${track.id}`,
        source: 'netease',
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        lyrics,
        exact: true,
      },
    ]
  },
}

/** 其他音乐源的曲目：按「歌名 歌手」搜索网易云，取前几条结果的歌词 */
export const neteaseSearchLyricsSource: LyricsSource = {
  id: 'netease',
  async search(track) {
    const res = await ncm<{ result?: { songs?: NeteaseSong[] } }>('/cloudsearch', {
      keywords: `${track.title} ${track.artist.replace(/^@/, '')}`,
      limit: SEARCH_LYRICS_TOP,
    })
    const songs = res.result?.songs?.slice(0, SEARCH_LYRICS_TOP) ?? []
    const found = await Promise.all(songs.map((s) => songCandidate(s).catch(() => null)))
    return found.filter((c): c is LyricsCandidate => c !== null)
  },
}

/* ---------------- 评论 ---------------- */

const HOT_COMMENTS = 10
const COMMENT_PAGE = 20

interface NeteaseComment {
  commentId: number
  content?: string | null
  /** 毫秒时间戳 */
  time: number
  timeStr?: string
  likedCount?: number
  ipLocation?: { location?: string } | null
  user?: { nickname?: string; avatarUrl?: string } | null
  beReplied?: { user?: { nickname?: string } | null; content?: string | null }[] | null
}

interface CommentRes {
  data?: {
    comments?: NeteaseComment[] | null
    totalCount?: number
    hasMore?: boolean
    cursor?: string | number | null
  }
}

function toComment(c: NeteaseComment): TrackComment {
  const r = c.beReplied?.[0]
  const avatar = c.user?.avatarUrl
  return {
    id: String(c.commentId),
    user: { name: c.user?.nickname || '匿名', avatar: avatar ? `${https(avatar)}?param=32y32` : undefined },
    content: c.content ?? '',
    time: c.time,
    timeLabel: c.timeStr || undefined,
    likes: c.likedCount ?? 0,
    location: c.ipLocation?.location || undefined,
    replyTo: r?.user?.nickname && r.content ? { user: r.user.nickname, content: r.content } : undefined,
  }
}

/** sortType：2 热门，3 最新 */
function commentList(id: string, sortType: 2 | 3, pageNo: number, pageSize: number, cursor?: string) {
  return ncm<CommentRes>('/comment/new', { type: 0, id, sortType, pageNo, pageSize, cursor })
}

/* ---------------- 音乐源 ---------------- */

export const neteaseProvider: MusicProvider = {
  id: 'netease',
  name: 'NetEase',
  // music.126.net 的音频与图片 CDN 均返回 Access-Control-Allow-Origin: *
  streamCors: true,
  coverCors: true,
  shelves: SHELVES,
  lyricsSource: exactLyricsSource,
  account: neteaseAccount,

  async getShelf(id, opts = {}) {
    if (id === 'daily') {
      if (opts.offset) return []
      const res = await ncm<{ data?: { dailySongs?: NeteaseSong[] } }>('/recommend/songs')
      return (res.data?.dailySongs ?? []).map(toTrack)
    }
    if (id === 'liked') return playlistTracks(await likedPlaylistId(), opts)
    return playlistTracks(CHARTS[id] ?? CHARTS.hot, opts)
  },

  async search(keyword, { limit = 40, offset = 0 } = {}) {
    const res = await ncm<{ result?: { songs?: NeteaseSong[] } }>('/cloudsearch', {
      keywords: keyword,
      limit,
      offset,
    })
    return (res.result?.songs ?? []).map(toTrack)
  },

  async getStream(track) {
    // 播放地址约 20 分钟过期，不能命中 API 缓存
    const res = await ncm<SongUrlRes>('/song/url/v1', { id: track.id, level: 'exhigh' }, { fresh: true })
    const item = res.data?.[0]
    if (!item?.url) return null
    const trial = item.freeTrialInfo
    return {
      url: https(item.url),
      preview: !!trial,
      offset: trial?.start ?? 0,
      codec: item.type ? item.type.toUpperCase() : undefined,
      bitrate: item.br ? Math.round(item.br / 1000) : undefined,
    }
  },

  async getDetail(track): Promise<TrackDetail> {
    const [detail, comments] = await Promise.all([
      ncm<SongDetailRes>('/song/detail', { ids: track.id }),
      ncm<{ total?: number }>('/comment/music', { id: track.id, limit: 1 }).catch(() => null),
    ])
    const s = detail.songs?.[0]
    const stats: TrackStat[] = []
    if (typeof s?.pop === 'number') stats.push({ label: 'HEAT', value: s.pop })
    if (typeof comments?.total === 'number') stats.push({ label: 'COMMENTS', value: comments.total })
    const quality = [...new Set(QUALITY.filter(([k]) => s?.[k]).map(([, label]) => label))]
    const aliases = [...(s?.alia ?? []), ...(s?.tns ?? [])].filter(Boolean)
    return {
      released: s?.publishTime ? localDate(s.publishTime) : undefined,
      aliases: aliases.length ? aliases : undefined,
      quality: quality.length ? quality : undefined,
      stats,
    }
  },

  // 游标编码为 `pageNo:cursor`
  async getComments(track, cursor) {
    const [no = '1', cur] = cursor?.split(':') ?? []
    const pageNo = Number(no)
    const [hot, latest] = await Promise.all([
      cursor ? null : commentList(track.id, 2, 1, HOT_COMMENTS).catch(() => null),
      commentList(track.id, 3, pageNo, COMMENT_PAGE, cur),
    ])
    const d = latest.data
    const items = (d?.comments ?? []).map(toComment)
    return {
      hot: hot ? (hot.data?.comments ?? []).map(toComment) : undefined,
      items,
      next: d?.hasMore && items.length && d.cursor != null ? `${pageNo + 1}:${d.cursor}` : null,
      total: cursor ? undefined : d?.totalCount,
    }
  },
}
