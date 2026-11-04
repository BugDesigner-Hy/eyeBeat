export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_RANGE = 12

export const EQ_PRESETS: Record<string, { labelKey: string; gains: number[] }> = {
  flat: { labelKey: 'eq.flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { labelKey: 'eq.bass', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  vocal: { labelKey: 'eq.vocal', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  electronic: { labelKey: 'eq.electronic', gains: [5, 4, 1, 0, -2, 0, 1, 3, 4, 5] },
  lofi: { labelKey: 'eq.lofi', gains: [2, 3, 2, 1, 0, -1, -3, -6, -9, -12] },
  radio: { labelKey: 'eq.radio', gains: [-12, -9, -4, 0, 3, 4, 3, -2, -8, -12] },
}

export const formatBand = (hz: number) => (hz >= 1000 ? `${hz / 1000}K` : String(hz))
