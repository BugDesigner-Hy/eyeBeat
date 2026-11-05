import { parseLrc } from '../../../utils/lrc'
import type {
  CommentPage,
  LyricsCandidate,
  LyricsSource,
  MusicProvider,
  PageOptions,
  Shelf,
  Track,
  TrackComment,
  TrackDetail,
  TrackStat,
} from '../../types'
import { qqAccount } from './account'
import { qq, qqPost } from './client'

export { qqConfigured } from './client'

/** 榜单 id 来自 /recommend/toplists，数字是 QQ 音乐自己的榜号 */
const CHART_IDS: Record<string, string> = {
  hot: '26',
  new: '27',
  guofeng: '65',
  douyin: '60',
}

const SHELVES: Shelf[] = [
  { id: 'hot', name: '热歌榜', tag: 'CHART / HOT' },
  { id: 'new', name: '新歌榜', tag: 'CHART / NEW' },
  { id: 'guofeng', name: '国风热歌榜', tag: 'CHART / GUOFENG' },
  { id: 'douyin', name: '抖音热歌榜', tag: 'CHART / DOUYIN' },
]

interface QqSinger {
  name?: string
  mid?: string
}

interface QqFile {
  size_hires?: number
  size_flac?: number
  size_320mp3?: number
  size_128mp3?: number
}

interface QqSong {
  id?: number | string
  mid?: string
  name?: string
  title?: string
  singer?: QqSinger[]
  album?: { mid?: string; name?: string }
  /** 秒 */
  interval?: number
  time_public?: string
  file?: QqFile
}

interface QqPlayEntry {
  url?: string
  preview?: boolean
  /** 试听片段在原曲中的起点（毫秒） */
  tryBegin?: number
  type?: string
  bitrate?: number
}

interface QqPlayRes {
  data?: { playUrl?: Record<string, QqPlayEntry> }
}

interface QqCommentsRes {
  data?: {
    comment?: {
      commentlist?: {
        commentid?: string
        content?: string
        rootcommentcontent?: string
        nick?: string
        avatarurl?: string
        praisenum?: number
        time?: number
        location?: string
      }[]
    }
  }
  nextCursor?: string | null
}

interface QqHotRes {
  comments?: {
    id?: string
    content?: string
    nick?: string
    avatar?: string
    praiseCount?: number
    /** 秒级时间戳 */
    time?: number
    location?: string
    replyCount?: number
  }[]
  total?: number
}

interface QqBatchRes {
  results?: { index?: number; code?: number; song?: QqSong }[]
}

const https = (url: string) => url.replace(/^http:\/\//, 'https://')
const artistNames = (s: QqSong) => (s.singer ?? []).map((a) => a.name).filter(Boolean).join(' / ') || 'Unknown'

/** 专辑封面走 photo_new 规则，T002 是专辑、尺寸写在文件名里 */
function coverUrl(albumMid: string, size: 300 | 500 | 800): string {
  return `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albumMid}.jpg`
}

/** 数字 id 只有评论 / 收藏数接口需要，列表里顺手记下来，省一次 /song/batch */
const numericIds = new Map<string, string>()

function toTrack(s: QqSong): Track {
  const mid = s.mid ?? String(s.id ?? '')
  const albumMid = s.album?.mid ?? ''
  if (s.id !== undefined && s.id !== '') numericIds.set(mid, String(s.id))
  return {
    id: mid,
    provider: 'qq',
    title: s.title || s.name || 'Unknown',
    artist: artistNames(s),
    album: s.album?.name,
    duration: s.interval ?? 0,
    cover: {
      small: albumMid ? coverUrl(albumMid, 300) : '',
      medium: albumMid ? coverUrl(albumMid, 500) : '',
      large: albumMid ? coverUrl(albumMid, 800) : '',
    },
  }
}

async function numericIdOf(track: Track): Promise<string | null> {
  const known = numericIds.get(track.id)
  if (known) return known
  const res = await qqPost<QqBatchRes>('/song/batch', { songs: [{ mid: track.id }] }).catch(() => null)
  const id = res?.results?.[0]?.song?.id
  if (id === undefined || id === '') return null
  numericIds.set(track.id, String(id))
  return String(id)
}

/* ---------------- 歌词 ---------------- */

interface QqLyricRes {
  response?: { lyric?: string; trans?: string }
}

async function fetchLyrics(mid: string) {
  const res = await qq<QqLyricRes>('/getLyric', { songmid: mid, trans: 1 })
  const lines = parseLrc(res.response?.lyric ?? '', res.response?.trans ?? '')
  return lines.length ? lines : null
}

/** QQ 自己的曲目：按 songmid 精确取 */
const exactLyricsSource: LyricsSource = {
  id: 'qq',
  primary: true,
  async search(track) {
    const lines = await fetchLyrics(track.id).catch(() => null)
    if (!lines) return []
    return [
      {
        id: `qq:${track.id}`,
        source: 'qq',
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        lyrics: { synced: true, lines },
        exact: true,
      } satisfies LyricsCandidate,
    ]
  },
}

/* ---------------- 评论 ---------------- */

const HOT_COMMENTS = 10
const COMMENT_PAGE = 20

/** 上游时间是秒，TrackComment 要毫秒 */
const toMs = (t?: number) => (t ? t * 1000 : Date.now())

function fromHot(c: NonNullable<QqHotRes['comments']>[number]): TrackComment {
  return {
    id: String(c.id ?? `${c.nick}-${c.time}`),
    user: { name: c.nick || '匿名', avatar: c.avatar ? https(c.avatar) : undefined },
    content: c.content ?? '',
    time: toMs(c.time),
    likes: c.praiseCount ?? 0,
    location: c.location || undefined,
    replyCount: c.replyCount || undefined,
  }
}

type QqListItem = NonNullable<NonNullable<QqCommentsRes['data']>['comment']>['commentlist']

function fromList(c: NonNullable<QqListItem>[number]): TrackComment {
  return {
    id: String(c.commentid ?? `${c.nick}-${c.time}`),
    user: { name: c.nick || '匿名', avatar: c.avatarurl ? https(c.avatarurl) : undefined },
    content: c.rootcommentcontent || c.content || '',
    time: toMs(c.time),
    likes: c.praisenum ?? 0,
    location: c.location || undefined,
  }
}

/* ---------------- 音乐源 ---------------- */

export const qqProvider: MusicProvider = {
  id: 'qq',
  name: 'QQ音乐',
  // isure / ws.stream.qqmusic.qq.com 的音频 CDN 返回 Access-Control-Allow-Origin: *，可以接 Web Audio
  streamCors: true,
  // y.gtimg.cn 的封面 CDN 不带 CORS 头：能显示，但 canvas 读不到像素，主色取色会退回固定配色
  coverCors: false,
  shelves: SHELVES,
  lyricsSource: exactLyricsSource,
  account: qqAccount,

  async getShelf(id, { limit = 40, offset = 0 }: PageOptions = {}) {
    const res = await qq<{ songs?: QqSong[] }>('/recommend/toplist', {
      id: CHART_IDS[id] ?? CHART_IDS.hot,
      limit,
      offset,
    })
    return (res.songs ?? []).map(toTrack)
  },

  async search(keyword, { limit = 40, offset = 0 }: PageOptions = {}) {
    // 上游单页最多 20 条，按需要的条数拆成多页并发拉取
    const per = 20
    const first = Math.floor(offset / per) + 1
    const pages = Math.max(1, Math.ceil(limit / per))
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) => first + i).map((page) =>
        qq<{ items?: QqSong[] }>('/search', { keyword, type: 'song', page, limit: per }, { accept: [422] }).catch(
          () => null,
        ),
      ),
    )
    return results
      .flatMap((r) => r?.items ?? [])
      .slice(0, limit)
      .map(toTrack)
  },

  async getStream(track) {
    const res = await qq<QqPlayRes>(`/getMusicPlay/${encodeURIComponent(track.id)}`, { quality: 'best' })
    const entry = Object.values(res.data?.playUrl ?? {})[0]
    if (!entry?.url) return null
    return {
      url: https(entry.url),
      preview: !!entry.preview,
      offset: entry.tryBegin ? entry.tryBegin / 1000 : undefined,
      codec: entry.type ? entry.type.toUpperCase() : undefined,
      bitrate: entry.bitrate,
    }
  },

  async getDetail(track): Promise<TrackDetail> {
    const numeric = await numericIdOf(track)
    const [batch, fav, comments] = await Promise.all([
      qqPost<QqBatchRes>('/song/batch', { songs: [{ mid: track.id }] }).catch(() => null),
      numeric
        ? qq<{ items?: { count?: number | null }[] }>('/song/fav-count', { ids: numeric }).catch(() => null)
        : null,
      numeric
        ? qq<{ count?: number }>('/comment/count', { id: numeric }).catch(() => null)
        : null,
    ])

    const song = batch?.results?.[0]?.song
    const stats: TrackStat[] = []
    const likes = fav?.items?.[0]?.count
    if (typeof likes === 'number' && likes > 0) stats.push({ label: 'LIKES', value: likes })
    if (typeof comments?.count === 'number' && comments.count > 0) stats.push({ label: 'COMMENTS', value: comments.count })

    const file = song?.file ?? {}
    const quality: string[] = []
    if ((file.size_128mp3 ?? 0) > 0) quality.push('STD')
    if ((file.size_320mp3 ?? 0) > 0) quality.push('HQ')
    if ((file.size_flac ?? 0) > 0) quality.push('SQ')
    if ((file.size_hires ?? 0) > 0) quality.push('HR')

    return {
      released: song?.time_public || undefined,
      quality: quality.length ? quality : undefined,
      stats,
    }
  },

  // 游标编码为 `page|nextCursor`
  async getComments(track, cursor): Promise<CommentPage> {
    const numeric = await numericIdOf(track)
    if (!numeric) throw new Error('没有找到这首歌的 QQ 音乐 id')

    const [pageStr = '0', cur] = cursor ? cursor.split('|') : ['0']
    const [hot, list] = await Promise.all([
      cursor ? null : qq<QqHotRes>('/comment/hot', { id: numeric, limit: HOT_COMMENTS }).catch(() => null),
      qq<QqCommentsRes>('/comment/list', { id: numeric, page: Number(pageStr), limit: COMMENT_PAGE, cursor: cur }).catch(
        () => null,
      ),
    ])

    const items = (list?.data?.comment?.commentlist ?? []).map(fromList)
    return {
      hot: hot?.comments?.map(fromHot),
      items,
      next: list?.nextCursor ? `${Number(pageStr) + 1}|${list.nextCursor}` : null,
      total: cursor ? undefined : hot?.total,
    }
  },
}
