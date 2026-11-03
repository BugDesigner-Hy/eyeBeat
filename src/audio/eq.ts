export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_RANGE = 12

export const EQ_PRESETS: Record<string, { label: string; gains: number[] }> = {
  flat: { label: '平直', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { label: '低音增强', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  vocal: { label: '人声', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  electronic: { label: '电子', gains: [5, 4, 1, 0, -2, 0, 1, 3, 4, 5] },
  lofi: { label: 'Lo-Fi', gains: [2, 3, 2, 1, 0, -1, -3, -6, -9, -12] },
  radio: { label: '收音机', gains: [-12, -9, -4, 0, 3, 4, 3, -2, -8, -12] },
}

export const formatBand = (hz: number) => (hz >= 1000 ? `${hz / 1000}K` : String(hz))
