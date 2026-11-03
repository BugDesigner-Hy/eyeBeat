import { ref, watch } from 'vue'
import { provider } from './api'
import { usePlayerStore } from './stores/player'
import { useSettingsStore } from './stores/settings'
import { coverSources } from './utils/cover'
import { extractAccent } from './utils/palette'

/** 当前主题色，供 canvas 等无法读取 CSS 变量的地方使用 */
export const accent = ref('#7cffb2')

function apply(color: string) {
  accent.value = color
  document.documentElement.style.setProperty('--accent', color)
}

export function useAccentSync() {
  const player = usePlayerStore()
  const settings = useSettingsStore()

  watch(
    [() => player.current, () => settings.accentMode, () => settings.fixedAccent],
    async ([track, mode, fixed]) => {
      if (mode === 'fixed' || !track || !provider.coverCors) return apply(fixed)
      const color = await extractAccent(`${track.provider}:${track.id}`, coverSources(track.cover, 'small'))
      if (player.current === track && settings.accentMode === 'cover') apply(color ?? fixed)
    },
    { immediate: true },
  )
}
