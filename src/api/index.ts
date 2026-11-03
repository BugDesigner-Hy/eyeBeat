import { lrclibSource } from './lyrics/lrclib'
import { audiusProvider } from './providers/audius'
import { neteaseConfigured, neteaseProvider, neteaseSearchLyricsSource } from './providers/netease'
import type { LyricsSource, MusicProvider, ProviderId } from './types'

const PROVIDER_KEY = 'himusic.provider'

const providers: Partial<Record<ProviderId, MusicProvider>> = {
  audius: audiusProvider,
  ...(neteaseConfigured ? { netease: neteaseProvider } : {}),
}

export const availableProviders = Object.values(providers) as MusicProvider[]

function pick(id: string | null | undefined): MusicProvider | undefined {
  return id ? providers[id as ProviderId] : undefined
}

export const provider: MusicProvider =
  pick(localStorage.getItem(PROVIDER_KEY)) ?? pick(import.meta.env.VITE_MUSIC_PROVIDER) ?? audiusProvider

/** 播放器、歌词、主题都在模块加载时绑定音乐源，切换后整页重载最稳妥 */
export function switchProvider(id: ProviderId) {
  if (id === provider.id || !providers[id]) return
  localStorage.setItem(PROVIDER_KEY, id)
  location.reload()
}

/** 参与择优的歌词源：音乐源自带的精确来源 + 公共来源 */
export const lyricsSources: LyricsSource[] = [
  ...(provider.lyricsSource ? [provider.lyricsSource] : []),
  ...(provider.id !== 'netease' && neteaseConfigured ? [neteaseSearchLyricsSource] : []),
  lrclibSource,
]

export type * from './types'
