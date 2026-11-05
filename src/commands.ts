import { computed } from 'vue'
import { availableProviders, provider, switchProvider } from './api'
import { EQ_PRESETS } from './audio/eq'
import { useI18n } from './i18n'
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
  /** keep palette open after run for continuous tweaks */
  keep?: boolean
  run: () => void
}

const MODES: PlayMode[] = ['list', 'one', 'shuffle']

export function useCommands() {
  const player = usePlayerStore()
  const lyrics = useLyricsStore()
  const settings = useSettingsStore()
  const ui = useUiStore()
  const account = useAccountStore()
  const { t, cycleLocale, locale } = useI18n()

  return computed<Command[]>(() => {
    void settings.locale
    const list: Command[] = [
      { id: 'toggle', group: 'PLAYBACK', title: t('cmd.playPause'), keywords: 'play pause', hint: 'SPACE', run: player.toggle },
      { id: 'next', group: 'PLAYBACK', title: t('cmd.next'), keywords: 'next skip', run: player.next },
      { id: 'prev', group: 'PLAYBACK', title: t('cmd.prev'), keywords: 'prev previous', run: player.prev },
      ...MODES.map((mode) => ({
        id: `mode-${mode}`,
        group: 'PLAYBACK',
        title: t(`cmd.mode.${mode}`),
        keywords: `mode loop repeat shuffle ${mode}`,
        active: player.mode === mode,
        run: () => player.setMode(mode),
      })),

      {
        id: 'bar',
        group: 'PLAYBACK',
        title: ui.barCollapsed ? t('cmd.bar.expand') : t('cmd.bar.collapse'),
        keywords: 'bar dock collapse expand mini',
        hint: 'B',
        run: () => ui.toggleBar(),
      },
      { id: 'lyrics', group: 'LYRICS', title: t('cmd.lyrics'), keywords: 'lyrics lrc', hint: 'L', active: ui.lyricsVisible, run: () => ui.toggleLyrics() },
      {
        id: 'backdrop',
        group: 'LYRICS',
        title: t('cmd.backdrop'),
        keywords: 'backdrop lyrics wall ambient idle',
        active: settings.backdropLyrics,
        run: () => (settings.backdropLyrics = !settings.backdropLyrics),
      },
      {
        id: 'pixel-lyrics',
        group: 'LYRICS',
        title: t('cmd.pixelLyrics'),
        keywords: 'pixel lyrics font ark silkscreen 像素 歌词',
        active: settings.pixelLyrics,
        run: () => (settings.pixelLyrics = !settings.pixelLyrics),
      },
      {
        id: 'offset-track+',
        group: 'LYRICS',
        title: t('cmd.offsetTrack+', { v: lyrics.trackOffset }),
        keywords: 'offset track',
        keep: true,
        run: () => lyrics.adjustTrackOffset(0.1),
      },
      {
        id: 'offset-track-',
        group: 'LYRICS',
        title: t('cmd.offsetTrack-', { v: lyrics.trackOffset }),
        keywords: 'offset track',
        keep: true,
        run: () => lyrics.adjustTrackOffset(-0.1),
      },
      {
        id: 'offset-global+',
        group: 'LYRICS',
        title: t('cmd.offsetGlobal+', { v: settings.lyricOffset }),
        keywords: 'offset global bluetooth',
        keep: true,
        run: () => lyrics.adjustGlobalOffset(0.1),
      },
      {
        id: 'offset-global-',
        group: 'LYRICS',
        title: t('cmd.offsetGlobal-', { v: settings.lyricOffset }),
        keywords: 'offset global bluetooth',
        keep: true,
        run: () => lyrics.adjustGlobalOffset(-0.1),
      },
      {
        id: 'offset-reset',
        group: 'LYRICS',
        title: t('cmd.offsetReset'),
        keywords: 'offset reset',
        run: () => {
          lyrics.setTrackOffset(0)
          settings.lyricOffset = 0
        },
      },
      ...lyrics.candidates.map((c) => ({
        id: `lrc-${c.id}`,
        group: 'LYRICS',
        title: t('cmd.lrcSource', { title: c.title, artist: c.artist }),
        keywords: `source ${c.source}`,
        hint: `${c.source.toUpperCase()} ${c.score ?? 0}`,
        active: lyrics.selected?.id === c.id,
        run: () => lyrics.choose(c.id),
      })),
      { id: 'lrc-off', group: 'LYRICS', title: t('cmd.lrcOff'), keywords: 'source none off', active: lyrics.chosenId === NO_LYRICS, run: () => lyrics.choose(NO_LYRICS) },
      { id: 'lrc-rescan', group: 'LYRICS', title: t('cmd.lrcRescan'), keywords: 'rescan refresh', run: () => void lyrics.refresh() },

      {
        id: 'accent-cover',
        group: 'VISUAL',
        title: t('cmd.accentCover'),
        keywords: 'accent color theme cover',
        active: settings.accentMode === 'cover',
        run: () => (settings.accentMode = 'cover'),
      },
      ...ACCENT_PRESETS.map((p) => ({
        id: `accent-${p.id}`,
        group: 'VISUAL',
        title: t('cmd.accent', { label: t(p.labelKey) }),
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
        title: t('cmd.focus'),
        keywords: 'focus wall depth dim',
        active: settings.wallFocus,
        run: () => (settings.wallFocus = !settings.wallFocus),
      },
      {
        id: 'wall-layout',
        group: 'VISUAL',
        title: settings.wallLayout === 'canvas' ? t('cmd.wall.waterfall') : t('cmd.wall.canvas'),
        keywords: 'wall layout canvas waterfall folia pan',
        hint: settings.wallLayout === 'canvas' ? 'CANVAS' : 'WALL',
        active: settings.wallLayout === 'canvas',
        run: () => (settings.wallLayout = settings.wallLayout === 'canvas' ? 'waterfall' : 'canvas'),
      },
      {
        id: 'reticle',
        group: 'VISUAL',
        title: t('cmd.reticle'),
        keywords: 'reticle locate lock aim target',
        active: settings.reticleLocate,
        run: () => (settings.reticleLocate = !settings.reticleLocate),
      },
      {
        id: 'pixel-comments',
        group: 'VISUAL',
        title: t('cmd.pixelComments'),
        keywords: 'pixel comments font ark silkscreen 像素 评论',
        active: settings.pixelComments,
        run: () => (settings.pixelComments = !settings.pixelComments),
      },
      {
        id: 'cover-info',
        group: 'VISUAL',
        title: t('cmd.coverInfo'),
        keywords: 'cover info title artist meta hover always 封面 信息 歌名',
        active: settings.coverInfoAlways,
        run: () => (settings.coverInfoAlways = !settings.coverInfoAlways),
      },

      { id: 'fx', group: 'AUDIO', title: t('cmd.fx'), keywords: 'fx eq equalizer', active: ui.fxOpen, run: () => ui.toggleFx() },
      ...Object.entries(EQ_PRESETS).map(([id, p]) => ({
        id: `eq-${id}`,
        group: 'AUDIO',
        title: t('cmd.eq', { label: t(p.labelKey) }),
        keywords: `eq equalizer preset ${id}`,
        active: settings.eqPreset === id,
        run: () => settings.applyEqPreset(id),
      })),
      {
        id: 'bitcrush',
        group: 'AUDIO',
        title: t('cmd.bitcrush'),
        keywords: 'bitcrush 8bit lofi chiptune',
        active: settings.bitcrush,
        run: () => (settings.bitcrush = !settings.bitcrush),
      },
      {
        id: 'crossfade',
        group: 'AUDIO',
        title: t('cmd.crossfade', { v: settings.crossfadeSec }),
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
        title: t('cmd.provider', { name: p.name }),
        keywords: `source provider ${p.id}`,
        active: p.id === provider.id,
        run: () => switchProvider(p.id),
      })),

      {
        id: 'lang',
        group: 'SYSTEM',
        title: t('lang.switch', { name: t('lang.name') }),
        keywords: 'language locale i18n english chinese 中文 语言',
        hint: locale.value.toUpperCase(),
        keep: true,
        run: () => cycleLocale(),
      },
      {
        id: 'power',
        group: 'SYSTEM',
        title: ui.poweredOff ? t('cmd.powerOn') : t('cmd.powerOff'),
        keywords: 'power off on standby crt shutdown boot',
        hint: 'P',
        active: ui.poweredOff,
        run: () => ui.powerToggle(),
      },
      { id: 'clear-lyrics', group: 'SYSTEM', title: t('cmd.clearLyrics'), keywords: 'cache clear', run: () => void lyrics.clearCache() },
    ]

    if (account.supported) {
      list.push(
        account.loggedIn
          ? {
              id: 'account',
              group: 'SYSTEM',
              title: t('cmd.account', { name: account.profile?.nickname ?? '', source: provider.name }),
              keywords: 'account login logout netease',
              run: () => account.openLogin(true),
            }
          : {
              id: 'login',
              group: 'SYSTEM',
              title: t('cmd.login', { source: provider.name }),
              keywords: 'account login netease qr',
              run: () => account.openLogin(true),
            },
      )
    }

    if (ui.installPrompt) {
      list.push({ id: 'install', group: 'SYSTEM', title: t('cmd.install'), keywords: 'install pwa app', run: () => void ui.install() })
    }
    if (!player.fxAvailable) {
      return list.filter((c) => !c.id.startsWith('eq-') && c.id !== 'bitcrush')
    }
    return list
  })
}
