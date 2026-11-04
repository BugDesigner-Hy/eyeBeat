import { defineStore } from 'pinia'
import { reactive, toRefs, watch } from 'vue'
import { EQ_BANDS, EQ_PRESETS } from '../audio/eq'

export const ACCENT_PRESETS = [
  { id: 'phosphor', labelKey: 'accent.phosphor', color: '#7cffb2' },
  { id: 'cyan', labelKey: 'accent.cyan', color: '#5ce1ff' },
  { id: 'amber', labelKey: 'accent.amber', color: '#ffb347' },
  { id: 'magenta', labelKey: 'accent.magenta', color: '#ff6ad5' },
] as const

export interface Settings {
  /** UI language; default English */
  locale: 'en' | 'zh'
  accentMode: 'cover' | 'fixed'
  fixedAccent: string
  wallFocus: boolean
  /** 桌面封面墙布局：瀑布流 / Folia 式无限画布 */
  wallLayout: 'waterfall' | 'canvas'
  /** 切歌时准星飞到封面墙上的新歌并锁定 */
  reticleLocate: boolean
  backdropLyrics: boolean
  /** 歌词使用像素字体（面板 / 详情 / 氛围） */
  pixelLyrics: boolean
  /** 评论使用像素字体 */
  pixelComments: boolean
  /** 封面墙上常显歌名/歌手（否则仅 hover / focus） */
  coverInfoAlways: boolean
  /** 全局歌词偏移（秒），正值表示歌词提前 */
  lyricOffset: number
  eqPreset: string
  eqGains: number[]
  bitcrush: boolean
  crossfade: boolean
  crossfadeSec: number
  /** 桌面详情页：评论栏（≥1440px）折叠成右侧细轨 */
  detailCmtCollapsed: boolean
  /** 桌面详情页：接下来播放与数据面板折叠成底部细条 */
  detailLowerCollapsed: boolean
  /** 桌面详情页：左侧封面/歌曲信息折叠成左侧细轨 */
  detailCoverCollapsed: boolean
  /** 详情页封面是否显示为黑胶唱片 */
  coverVinyl: boolean
}

const KEY = 'himusic.settings'

const DEFAULTS: Settings = {
  locale: 'en',
  accentMode: 'cover',
  fixedAccent: ACCENT_PRESETS[0].color,
  wallFocus: true,
  wallLayout: 'waterfall',
  reticleLocate: true,
  backdropLyrics: true,
  pixelLyrics: true,
  pixelComments: true,
  coverInfoAlways: false,
  lyricOffset: 0,
  eqPreset: 'flat',
  eqGains: [...EQ_PRESETS.flat.gains],
  bitcrush: false,
  crossfade: true,
  crossfadeSec: 4,
  detailCmtCollapsed: false,
  detailLowerCollapsed: false,
  detailCoverCollapsed: false,
  coverVinyl: false,
}

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    const merged = { ...DEFAULTS, ...saved }
    if (!Array.isArray(merged.eqGains) || merged.eqGains.length !== EQ_BANDS.length) {
      merged.eqGains = [...DEFAULTS.eqGains]
    }
    if (merged.wallLayout !== 'canvas' && merged.wallLayout !== 'waterfall') {
      merged.wallLayout = DEFAULTS.wallLayout
    }
    if (merged.locale !== 'en' && merged.locale !== 'zh') {
      merged.locale = DEFAULTS.locale
    }
    return merged
  } catch {
    return { ...DEFAULTS, eqGains: [...DEFAULTS.eqGains] }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const state = reactive(load())
  watch(state, (s) => localStorage.setItem(KEY, JSON.stringify(s)), { deep: true })

  function applyEqPreset(id: string) {
    const preset = EQ_PRESETS[id]
    if (!preset) return
    state.eqPreset = id
    state.eqGains = [...preset.gains]
  }

  function setEqBand(index: number, gain: number) {
    const gains = [...state.eqGains]
    gains[index] = gain
    state.eqGains = gains
    state.eqPreset = 'custom'
  }

  return { ...toRefs(state), applyEqPreset, setEqBand }
})
