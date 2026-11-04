/** Folia 同款立方六边形网格 */

export interface CubeCoord {
  x: number
  y: number
  z: number
}

export const toCubeKey = (c: CubeCoord) => `${c.x}:${c.y}:${c.z}`

const normalizeZero = (v: number) => (Object.is(v, -0) ? 0 : v)

export function roundCube(cube: CubeCoord): CubeCoord {
  let rx = Math.round(cube.x)
  let ry = Math.round(cube.y)
  let rz = Math.round(cube.z)
  const xDiff = Math.abs(rx - cube.x)
  const yDiff = Math.abs(ry - cube.y)
  const zDiff = Math.abs(rz - cube.z)
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz
  else if (yDiff > zDiff) ry = -rx - rz
  else rz = -rx - ry
  return { x: normalizeZero(rx), y: normalizeZero(ry), z: normalizeZero(rz) }
}

export function cubeToPixel(cube: CubeCoord, spacingX: number, spacingY: number) {
  return {
    x: cube.x * spacingX + (cube.z * spacingX) / 2,
    y: cube.z * spacingY,
  }
}

export function pixelToCube(worldX: number, worldY: number, spacingX: number, spacingY: number): CubeCoord {
  const z = worldY / spacingY
  const x = (worldX - (z * spacingX) / 2) / spacingX
  const y = -x - z
  return roundCube({ x, y, z })
}

export function forEachCubeInRadius(center: CubeCoord, radius: number, cb: (cube: CubeCoord) => void) {
  const r = Math.max(0, Math.floor(radius))
  for (let dx = -r; dx <= r; dx++) {
    const minDy = Math.max(-r, -dx - r)
    const maxDy = Math.min(r, -dx + r)
    for (let dy = minDy; dy <= maxDy; dy++) {
      cb({ x: center.x + dx, y: center.y + dy, z: center.z - dx - dy })
    }
  }
}

export function getHexCubicAtIndex(index: number): CubeCoord {
  if (index <= 0) return { x: 0, y: 0, z: 0 }

  let radius = 1
  while (index >= 1 + 3 * radius * (radius + 1)) radius++

  const ringStart = 1 + 3 * (radius - 1) * radius
  const ringOffset = index - ringStart
  const side = Math.floor(ringOffset / radius)
  const stepsOnSide = (ringOffset % radius) + 1
  const dirs = [
    { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 },
    { x: -1, y: 0, z: 1 },
    { x: 0, y: -1, z: 1 },
    { x: 1, y: -1, z: 0 },
    { x: 1, y: 0, z: -1 },
  ]
  const cube = { x: radius, y: -radius, z: 0 }

  for (let completedSide = 0; completedSide < side; completedSide++) {
    cube.x += dirs[completedSide].x * radius
    cube.y += dirs[completedSide].y * radius
    cube.z += dirs[completedSide].z * radius
  }
  cube.x += dirs[side].x * stepsOnSide
  cube.y += dirs[side].y * stepsOnSide
  cube.z += dirs[side].z * stepsOnSide
  return cube
}

/** 立方坐标 → 螺旋序号（与 getHexCubicAtIndex 互逆） */
export function cubeToSpiralIndex(c: CubeCoord): number {
  if (c.x === 0 && c.y === 0 && c.z === 0) return 0
  const r = (Math.abs(c.x) + Math.abs(c.y) + Math.abs(c.z)) / 2
  const ringStart = 1 + 3 * (r - 1) * r
  const dirs = [
    { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 },
    { x: -1, y: 0, z: 1 },
    { x: 0, y: -1, z: 1 },
    { x: 1, y: -1, z: 0 },
    { x: 1, y: 0, z: -1 },
  ]
  let x = r
  let y = -r
  let z = 0
  let idx = ringStart
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < r; step++) {
      if (x === c.x && y === c.y && z === c.z) return idx
      x += dirs[side].x
      y += dirs[side].y
      z += dirs[side].z
      idx++
    }
  }
  return ringStart
}

export function mod(n: number, m: number) {
  return ((n % m) + m) % m
}
