import { defineStore } from 'pinia'
import { reactive, toRefs, watch } from 'vue'
import { EQ_BANDS, EQ_PRESETS } from '../audio/eq'

export const ACCENT_PRESETS = [
  { id: 'phosphor', label: '磷光绿', color: '#7cffb2' },
  { id: 'cyan', label: '青色', color: '#5ce1ff' },
  { id: 'amber', label: '琥珀', color: '#ffb347' },
  { id: 'magenta', label: '洋红', color: '#ff6ad5' },
] as const

export interface Settings {
  accentMode: 'cover' | 'fixed'
  fixedAccent: string
  wallFocus: boolean
  /** 切歌时准星飞到封面墙上的新歌并锁定 */
  reticleLocate: boolean
  backdropLyrics: boolean
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
  /** 详情页封面是否显示为黑胶唱片 */
  coverVinyl: boolean
}

const KEY = 'himusic.settings'

const DEFAULTS: Settings = {
  accentMode: 'cover',
  fixedAccent: ACCENT_PRESETS[0].color,
  wallFocus: true,
  reticleLocate: true,
  backdropLyrics: true,
  lyricOffset: 0,
  eqPreset: 'flat',
  eqGains: [...EQ_PRESETS.flat.gains],
  bitcrush: false,
  crossfade: true,
  crossfadeSec: 4,
  detailCmtCollapsed: false,
  detailLowerCollapsed: false,
  coverVinyl: false,
}

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    const merged = { ...DEFAULTS, ...saved }
    if (!Array.isArray(merged.eqGains) || merged.eqGains.length !== EQ_BANDS.length) {
      merged.eqGains = [...DEFAULTS.eqGains]
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
