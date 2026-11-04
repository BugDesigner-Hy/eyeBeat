/** 在平面点集上按方向选最近邻居（封面墙 / 画布键盘导航共用） */

export interface NavPoint {
  id: string
  x: number
  y: number
}

export type NavDir = 'left' | 'right' | 'up' | 'down'

const DIR_VEC: Record<NavDir, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
}

export function dirFromKey(key: string): NavDir | null {
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'
  return null
}

/**
 * 从 fromId 出发沿 dir 选点：须在前进半平面内，
 * 优先「更正对」再「更近」。无 fromId 时取最靠近原点的点。
 */
export function pickNeighbor(points: NavPoint[], fromId: string | null, dir: NavDir): string | null {
  if (!points.length) return null
  if (!fromId) {
    let best = points[0]
    let bestD = best.x * best.x + best.y * best.y
    for (let i = 1; i < points.length; i++) {
      const p = points[i]
      const d = p.x * p.x + p.y * p.y
      if (d < bestD) {
        best = p
        bestD = d
      }
    }
    return best.id
  }

  const cur = points.find((p) => p.id === fromId)
  if (!cur) return pickNeighbor(points, null, dir)

  const v = DIR_VEC[dir]
  let best: NavPoint | null = null
  let bestScore = Infinity

  for (const p of points) {
    if (p.id === cur.id) continue
    const dx = p.x - cur.x
    const dy = p.y - cur.y
    const forward = dx * v.x + dy * v.y
    if (forward <= 4) continue
    const lateral = Math.abs(dx * v.y - dy * v.x)
    const score = lateral * 2.4 + forward
    if (score < bestScore) {
      bestScore = score
      best = p
    }
  }
  return best?.id ?? null
}
