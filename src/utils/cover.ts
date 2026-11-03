import type { CoverSet } from '../api/types'

export function coverSources(cover: CoverSet, size: 'small' | 'medium' | 'large'): string[] {
  const primary = cover[size]
  if (!primary || !cover.mirrors?.length) return [primary]
  try {
    const url = new URL(primary)
    const alts = cover.mirrors.map((origin) => {
      const alt = new URL(url.pathname + url.search, origin)
      return alt.href
    })
    return [primary, ...alts.filter((u) => u !== primary)]
  } catch {
    return [primary]
  }
}
