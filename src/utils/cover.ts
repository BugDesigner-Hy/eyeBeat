import type { CoverSet } from '../api/types'

/** 刚加载失败的封面地址；有时效，免得一次断网让封面整个会话都显示占位 */
const failed = new Map<string, number>()
const FAILED_TTL = 5 * 60_000

export function markCoverFailed(url: string) {
  failed.set(url, Date.now())
}

/** 去掉空地址和近期失败过的地址；为空说明该显示占位 */
export function usableCovers(sources: string[]): string[] {
  const now = Date.now()
  return sources.filter((u) => {
    if (!u) return false
    const at = failed.get(u)
    if (at === undefined) return true
    if (now - at < FAILED_TTL) return false
    failed.delete(u)
    return true
  })
}

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
