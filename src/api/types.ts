export type ProviderId = 'audius' | 'netease'

export interface CoverSet {
  small: string
  medium: string
  large: string
  /** 备用源站（origin），主地址加载失败时按顺序替换 origin 重试 */
  mirrors?: string[]
}

export interface Track {
  id: string
  provider: ProviderId
  title: string
  artist: string
  album?: string
  /** 秒 */
  duration: number
  cover: CoverSet
}

export interface LyricWord {
  /** 秒 */
  time: number
  /** 秒 */
  duration: number
  text: string
}

export interface LyricLine {
  /** 秒；非同步歌词为 -1 */
  time: number
  /** 秒；未知时由下一行推算 */
  duration?: number
  text: string
  translation?: string
  /** 逐字时间轴（yrc / 增强型 LRC） */
  words?: LyricWord[]
}

export interface Lyrics {
  synced: boolean
  wordSynced?: boolean
  lines: LyricLine[]
}

export interface LyricsCandidate {
  /** 在所有来源中唯一 */
  id: string
  source: string
  title: string
  artist: string
  duration: number
  lyrics: Lyrics
  /** 由音乐源按曲目 ID 直接给出，而不是搜索得到 */
  exact?: boolean
  score?: number
}

export interface LyricsSource {
  readonly id: string
  /** 按曲目 ID 精确获取：先单独查询，拿到同步歌词就不再查其他来源 */
  readonly primary?: boolean
  search(track: Track): Promise<LyricsCandidate[]>
}

export interface PageOptions {
  limit?: number
  offset?: number
}

/** 首页可切换的曲目集合（榜单、推荐、收藏等） */
export interface Shelf {
  id: string
  name: string
  /** 英文短标签，用于像素字体标题 */
  tag: string
  requiresLogin?: boolean
}

export interface StreamSource {
  url: string
  /** 只返回了试听片段（未登录 / 非会员） */
  preview?: boolean
  /** 试听片段在原曲中的起点（秒），用于对齐歌词 */
  offset?: number
}

export interface AccountProfile {
  id: string
  nickname: string
  avatar: string
}

export interface QrLoginTicket {
  key: string
  /** 二维码图片（data URL） */
  image: string
}

export type QrLoginState =
  | { status: 'waiting' | 'scanned' | 'expired' }
  | { status: 'authorized'; profile: AccountProfile | null }

/** 支持扫码登录的音乐源 */
export interface AccountApi {
  profile(): Promise<AccountProfile | null>
  createQr(): Promise<QrLoginTicket>
  checkQr(key: string): Promise<QrLoginState>
  logout(): Promise<void>
}

/**
 * 音乐源适配器。新增音乐源只需实现此接口并在 api/index.ts 注册。
 */
export interface MusicProvider {
  readonly id: ProviderId
  readonly name: string
  /**
   * 音频流是否带 CORS 头。为 false 时不能接入 Web Audio
   * （否则 MediaElementSource 会输出静音），频谱退化为模拟动画，音效不可用。
   */
  readonly streamCors: boolean
  /** 封面是否带 CORS 头。为 false 时不做封面取色与离线缓存 */
  readonly coverCors: boolean
  /** 第一个为默认首页 */
  readonly shelves: Shelf[]
  getShelf(id: string, opts?: PageOptions): Promise<Track[]>
  search(keyword: string, opts?: PageOptions): Promise<Track[]>
  /** 返回 null 表示该曲目无可用音源（版权 / VIP 等） */
  getStream(track: Track): Promise<StreamSource | null>
  /** 按曲目 ID 精确获取歌词的来源，会和公共歌词源一起参与择优 */
  readonly lyricsSource?: LyricsSource
  readonly account?: AccountApi
}
