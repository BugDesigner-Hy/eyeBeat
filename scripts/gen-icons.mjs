// 生成 PWA 像素图标：node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x0a, 0x0c, 0x0f, 0xff]
const FG = [0x7c, 0xff, 0xb2, 0xff]

// 16x16，图形落在中央 80% 安全区内，可作 maskable
const GRID = [
  '................',
  '................',
  '................',
  '................',
  '...#...#....#...',
  '...#...#....#...',
  '...#...#...#....',
  '...#####...#....',
  '...#...#..#.....',
  '...#...#..#.....',
  '...#...#.#......',
  '...#...#.#......',
  '................',
  '................',
  '................',
  '................',
]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const cell = size / GRID.length
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const on = GRID[Math.floor(y / cell)][Math.floor(x / cell)] === '#'
      const px = on ? FG : BG
      raw.set(px, row + 1 + x * 4)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
for (const size of [192, 512]) writeFileSync(`public/pwa-${size}.png`, png(size))
writeFileSync('public/apple-touch-icon.png', png(176))
console.log('icons written to public/')
