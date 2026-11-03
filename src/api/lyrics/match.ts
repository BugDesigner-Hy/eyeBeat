import type { LyricsCandidate, Track } from '../types'

/** 低于该分数的自动结果不采用（仍可在面板里手动选） */
export const ACCEPT_SCORE = 45

export function cleanTitle(title: string): string {
  return title
    .replace(/[([（【][^)\]）】]*[)\]）】]/g, '')
    .replace(/\s+(ft|feat)\.?\s.*$/i, '')
    .trim()
}

function normalize(s: string): string {
  return cleanTitle(s)
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>()
  if (s.length < 2) {
    if (s) map.set(s, 1)
    return map
  }
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    map.set(g, (map.get(g) ?? 0) + 1)
  }
  return map
}

/** Sørensen–Dice 系数，0..1 */
export function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ga = bigrams(na)
  const gb = bigrams(nb)
  let overlap = 0
  let total = 0
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0)
    total += n
  }
  for (const n of gb.values()) total += n
  return total ? (2 * overlap) / total : 0
}

export interface TitleReading {
  title: string
  artist: string
}

/**
 * 一首歌可能的 (歌名, 歌手) 解读：上传者常把歌手写进标题，
 * "Artist - Title" 与 "Title - Artist" 两种顺序都有
 */
export function titleReadings(track: Track): TitleReading[] {
  const title = cleanTitle(track.title)
  const artist = track.artist.replace(/^@/, '')
  const readings: TitleReading[] = [{ title, artist }]
  const parts = title.split(/\s+[-–—]\s+/)
  if (parts.length === 2 && parts[0] && parts[1]) {
    readings.push({ title: parts[1], artist: parts[0] }, { title: parts[0], artist: parts[1] })
  }
  return readings
}

export function scoreCandidate(track: Track, c: LyricsCandidate): number {
  let best = { title: 0, artist: 0, sum: -1 }
  for (const r of titleReadings(track)) {
    const title = similarity(r.title, c.title)
    const artist = similarity(r.artist, c.artist)
    const sum = title * 2 + artist
    if (sum > best.sum) best = { title, artist, sum }
  }
  const diff = Math.abs(track.duration - c.duration)
  const duration = diff <= 2 ? 20 : diff <= 5 ? 12 : diff <= 10 ? 4 : diff <= 15 ? -10 : -35

  let score = best.title * 40 + best.artist * 20 + duration
  // 同名不同歌手是最常见的误匹配
  if (best.artist < 0.35) score -= 30
  if (c.lyrics.synced) score += 8
  if (c.lyrics.wordSynced) score += 6
  if (c.exact) score += 60
  return Math.round(score)
}
