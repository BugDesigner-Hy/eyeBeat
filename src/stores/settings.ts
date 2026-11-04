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
