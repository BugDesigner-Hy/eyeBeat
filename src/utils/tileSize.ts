/** 与封面墙瀑布流同一套尺寸权重，画布模式复用以免两套观感分叉 */

export type TileSize = 's' | 'w' | 't' | 'm' | 'l'

/** 出现频率即权重 */
export const TILE_SIZE_WEIGHTS: TileSize[] = ['s', 's', 's', 's', 's', 'w', 'w', 't', 't', 'm', 'm', 'l']

export const TILE_BASE_DEPTH: Record<TileSize, number> = {
  s: 0.3,
  w: 0.55,
  t: 0.55,
  m: 0.8,
  l: 1.05,
}

/** 画布世界像素尺寸（错落；略小于间距，大卡可自然叠压） */
export const TILE_CANVAS_DIM: Record<TileSize, { w: number; h: number }> = {
  s: { w: 152, h: 152 },
  w: { w: 268, h: 152 },
  t: { w: 152, h: 268 },
  m: { w: 232, h: 232 },
  l: { w: 300, h: 300 },
}

export function hashId(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function tileSizeForId(id: string): TileSize {
  return TILE_SIZE_WEIGHTS[hashId(id) % TILE_SIZE_WEIGHTS.length]
}

export function tileDepthForId(id: string): number {
  const seed = hashId(id)
  const size = TILE_SIZE_WEIGHTS[seed % TILE_SIZE_WEIGHTS.length]
  return TILE_BASE_DEPTH[size] + ((seed >>> 8) % 100) / 400
}

export function tileCanvasDimForId(id: string) {
  const size = tileSizeForId(id)
  return { size, ...TILE_CANVAS_DIM[size] }
}
