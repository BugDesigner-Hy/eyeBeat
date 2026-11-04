import { computed } from 'vue'
import { availableProviders, provider, switchProvider } from './api'
import { EQ_PRESETS } from './audio/eq'
import { useAccountStore } from './stores/account'
import { NO_LYRICS, useLyricsStore } from './stores/lyrics'
import { usePlayerStore, type PlayMode } from './stores/player'
import { ACCENT_PRESETS, useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'

export interface Command {
  id: string
  group: string
  title: string
  keywords?: string
  hint?: string
  active?: boolean
  /** 执行后保持面板打开，便于连续调整 */
  keep?: boolean
  run: () => void
}

const MODES: { mode: PlayMode; title: string }[] = [
  { mode: 'list', title: '播放模式：列表循环' },
  { mode: 'one', title: '播放模式：单曲循环' },
  { mode: 'shuffle', title: '播放模式：随机播放' },
]

export function useCommands() {
  const player = usePlayerStore()
  const lyrics = useLyricsStore()
  const settings = useSettingsStore()
  const ui = useUiStore()
  const account = useAccountStore()

  return computed<Command[]>(() => {
    const list: Command[] = [
      { id: 'toggle', group: 'PLAYBACK', title: '播放 / 暂停', keywords: 'play pause', hint: 'SPACE', run: player.toggle },
      { id: 'next', group: 'PLAYBACK', title: '下一首', keywords: 'next skip', run: player.next },
      { id: 'prev', group: 'PLAYBACK', title: '上一首', keywords: 'prev previous', run: player.prev },
      ...MODES.map(({ mode, title }) => ({
        id: `mode-${mode}`,
        group: 'PLAYBACK',
        title,
        keywords: `mode loop repeat shuffle ${mode}`,
        active: player.mode === mode,
        run: () => player.setMode(mode),
      })),

      { id: 'bar', group: 'PLAYBACK', title: ui.barCollapsed ? '展开播放栏' : '收起播放栏', keywords: 'bar dock collapse expand mini', hint: 'B', run: () => ui.toggleBar() },
      { id: 'lyrics', group: 'LYRICS', title: '歌词面板', keywords: 'lyrics lrc', hint: 'L', active: ui.lyricsVisible, run: () => ui.toggleLyrics() },
      {
        id: 'backdrop',
        group: 'LYRICS',
        title: '闲置氛围歌词',
        keywords: 'backdrop lyrics wall ambient idle 氛围 墙后',
        active: settings.backdropLyrics,
        run: () => (settings.backdropLyrics = !settings.backdropLyrics),
      },
      { id: 'offset-track+', group: 'LYRICS', title: `当前歌曲歌词提前 0.1s（${lyrics.trackOffset}s）`, keywords: 'offset track', keep: true, run: () => lyrics.adjustTrackOffset(0.1) },
      { id: 'offset-track-', group: 'LYRICS', title: `当前歌曲歌词延后 0.1s（${lyrics.trackOffset}s）`, keywords: 'offset track', keep: true, run: () => lyrics.adjustTrackOffset(-0.1) },
      { id: 'offset-global+', group: 'LYRICS', title: `全局歌词提前 0.1s（${settings.lyricOffset}s）`, keywords: 'offset global bluetooth 蓝牙', keep: true, run: () => lyrics.adjustGlobalOffset(0.1) },
      { id: 'offset-global-', group: 'LYRICS', title: `全局歌词延后 0.1s（${settings.lyricOffset}s）`, keywords: 'offset global bluetooth 蓝牙', keep: true, run: () => lyrics.adjustGlobalOffset(-0.1) },
      {
        id: 'offset-reset',
        group: 'LYRICS',
        title: '重置歌词偏移',
        keywords: 'offset reset',
        run: () => {
          lyrics.setTrackOffset(0)
          settings.lyricOffset = 0
        },
      },
      ...lyrics.candidates.map((c) => ({
        id: `lrc-${c.id}`,
        group: 'LYRICS',
        title: `歌词源：${c.title} - ${c.artist}`,
        keywords: `source ${c.source}`,
        hint: `${c.source.toUpperCase()} ${c.score ?? 0}`,
        active: lyrics.selected?.id === c.id,
        run: () => lyrics.choose(c.id),
      })),
      { id: 'lrc-off', group: 'LYRICS', title: '歌词源：不显示', keywords: 'source none off', active: lyrics.chosenId === NO_LYRICS, run: () => lyrics.choose(NO_LYRICS) },
      { id: 'lrc-rescan', group: 'LYRICS', title: '重新搜索歌词', keywords: 'rescan refresh', run: () => void lyrics.refresh() },

      {
        id: 'accent-cover',
        group: 'VISUAL',
        title: '主题色：跟随封面',
        keywords: 'accent color theme cover',
        active: settings.accentMode === 'cover',
        run: () => (settings.accentMode = 'cover'),
      },
      ...ACCENT_PRESETS.map((p) => ({
        id: `accent-${p.id}`,
        group: 'VISUAL',
        title: `主题色：${p.label}`,
        keywords: `accent color theme ${p.id}`,
        hint: p.color.toUpperCase(),
        active: settings.accentMode === 'fixed' && settings.fixedAccent === p.color,
        run: () => {
          settings.accentMode = 'fixed'
          settings.fixedAccent = p.color
        },
      })),
      {
        id: 'focus',
        group: 'VISUAL',
        title: '封面墙聚焦与纵深',
        keywords: 'focus wall depth dim',
        active: settings.wallFocus,
        run: () => (settings.wallFocus = !settings.wallFocus),
      },
      {
        id: 'reticle',
        group: 'VISUAL',
        title: '切歌准星定位',
        keywords: 'reticle locate lock aim target 准星 瞄准',
        active: settings.reticleLocate,
        run: () => (settings.reticleLocate = !settings.reticleLocate),
      },

      { id: 'fx', group: 'AUDIO', title: '音效面板', keywords: 'fx eq equalizer', active: ui.fxOpen, run: () => ui.toggleFx() },
      ...Object.entries(EQ_PRESETS).map(([id, p]) => ({
        id: `eq-${id}`,
        group: 'AUDIO',
        title: `均衡器：${p.label}`,
        keywords: `eq equalizer preset ${id}`,
        active: settings.eqPreset === id,
        run: () => settings.applyEqPreset(id),
      })),
      {
        id: 'bitcrush',
        group: 'AUDIO',
        title: '8-bit 降质',
        keywords: 'bitcrush 8bit lofi chiptune',
        active: settings.bitcrush,
        run: () => (settings.bitcrush = !settings.bitcrush),
      },
      {
        id: 'crossfade',
        group: 'AUDIO',
        title: `切歌淡入淡出（${settings.crossfadeSec}s）`,
        keywords: 'crossfade fade',
        active: settings.crossfade,
        run: () => (settings.crossfade = !settings.crossfade),
      },

      ...player.shelves.map((s) => ({
        id: `shelf-${s.id}`,
        group: 'LIBRARY',
        title: s.name,
        keywords: `home shelf chart ${s.id} ${s.tag}`.toLowerCase(),
        active: !player.keyword && player.shelf.id === s.id,
        run: () => void player.openShelf(s.id),
      })),
      ...availableProviders.map((p) => ({
        id: `provider-${p.id}`,
        group: 'LIBRARY',
        title: `音乐源：${p.name}`,
        keywords: `source provider ${p.id}`,
        active: p.id === provider.id,
        run: () => switchProvider(p.id),
      })),

      { id: 'clear-lyrics', group: 'SYSTEM', title: '清除歌词缓存', keywords: 'cache clear', run: () => void lyrics.clearCache() },
    ]

    if (account.supported) {
      list.push(
        account.loggedIn
          ? { id: 'account', group: 'SYSTEM', title: `网易云账号：${account.profile?.nickname}`, keywords: 'account login logout netease', run: () => account.openLogin(true) }
          : { id: 'login', group: 'SYSTEM', title: '扫码登录网易云', keywords: 'account login netease qr', run: () => account.openLogin(true) },
      )
    }

    if (ui.installPrompt) {
      list.push({ id: 'install', group: 'SYSTEM', title: '安装为应用（PWA）', keywords: 'install pwa app', run: () => void ui.install() })
    }
    if (!player.fxAvailable) {
      return list.filter((c) => !c.id.startsWith('eq-') && c.id !== 'bitcrush')
    }
    return list
  })
}
