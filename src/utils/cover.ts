import type { CoverSet } from '../api/types'

/**
 * 刚加载失败的封面地址，让之后新建的图片直接跳过。
 * 有时效：断网恢复后新建的封面会重新尝试（已经显示占位的不会自动重试）
 */
const failed = new Map<string, number>()
const FAILED_TTL = 5 * 60_000
const FAILED_MAX = 200

export function markCoverFailed(url: string) {
  const now = Date.now()
  if (failed.size >= FAILED_MAX) {
    for (const [u, at] of failed) if (now - at >= FAILED_TTL) failed.delete(u)
  }
  failed.set(url, now)
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
