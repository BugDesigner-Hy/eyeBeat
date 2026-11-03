import type { LyricLine, LyricWord } from '../api/types'

// 小数部分有 [mm:ss.xx] 和 [mm:ss:xx]（网易云部分歌词）两种写法
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g
const YRC_LINE = /^\[(\d+),(\d+)\](.*)$/
const YRC_WORD = /\((\d+),(\d+),-?\d+\)([^(]*)/g
const TRANSLATION_TOLERANCE = 0.6

const toSec = (m: string, s: string, frac = '') => Number(m) * 60 + Number(s) + (frac ? Number(`0.${frac}`) : 0)

function fillDurations(lines: LyricLine[]): LyricLine[] {
  lines.sort((a, b) => a.time - b.time)
  lines.forEach((line, i) => {
    const next = lines[i + 1]
    if (line.duration === undefined) line.duration = next ? Math.max(0, next.time - line.time) : 5
    const words = line.words
    if (!words) return
    words.forEach((w, j) => {
      if (w.duration > 0) return
      const end = words[j + 1]?.time ?? line.time + (line.duration ?? 0)
      w.duration = Math.max(0.05, end - w.time)
    })
  })
  return lines
}

/** 增强型 LRC：行内 <mm:ss.xx> 标记逐字时间 */
function parseWords(text: string, lineTime: number): LyricWord[] | undefined {
  const tags = [...text.matchAll(WORD_TAG)]
  if (!tags.length) return undefined
  const words: LyricWord[] = []
  const lead = text.slice(0, tags[0].index).trim()
  if (lead) words.push({ time: lineTime, duration: 0, text: lead })
  tags.forEach((tag, i) => {
    const start = (tag.index ?? 0) + tag[0].length
    const end = tags[i + 1]?.index ?? text.length
    const piece = text.slice(start, end)
    if (piece) words.push({ time: toSec(tag[1], tag[2], tag[3]), duration: 0, text: piece })
  })
  return words.length ? words : undefined
}

function parseLrcLines(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(TIME_TAG)]
    if (!tags.length) continue
    const body = raw.replace(TIME_TAG, '')
    const text = body.replace(WORD_TAG, '').trim()
    if (!text) continue
    for (const tag of tags) {
      const time = toSec(tag[1], tag[2], tag[3])
      lines.push({ time, text, words: parseWords(body, time) })
    }
  }
  return lines
}

function attachTranslations(lines: LyricLine[], translated?: string) {
  if (!translated) return
  const trans = parseLrcLines(translated)
  for (const line of lines) {
    let best: LyricLine | undefined
    let bestDiff = TRANSLATION_TOLERANCE
    for (const t of trans) {
      const diff = Math.abs(t.time - line.time)
      if (diff < bestDiff) {
        best = t
        bestDiff = diff
      }
    }
    if (best && best.text !== line.text) line.translation = best.text
  }
}

export function parseLrc(lrc: string, translated?: string): LyricLine[] {
  const lines = fillDurations(parseLrcLines(lrc))
  attachTranslations(lines, translated)
  return lines
}

/** 网易云逐字歌词：[行起始ms,行时长ms](字起始ms,字时长ms,0)字... */
export function parseYrc(yrc: string, translated?: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of yrc.split(/\r?\n/)) {
    const m = raw.match(YRC_LINE)
    if (!m) continue
    const words: LyricWord[] = []
    for (const w of m[3].matchAll(YRC_WORD)) {
      if (w[3]) words.push({ time: Number(w[1]) / 1000, duration: Number(w[2]) / 1000, text: w[3] })
    }
    const text = words.map((w) => w.text).join('').trim()
    if (!text) continue
    lines.push({ time: Number(m[1]) / 1000, duration: Number(m[2]) / 1000, text, words })
  }
  fillDurations(lines)
  attachTranslations(lines, translated)
  return lines
}

export function plainLines(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ time: -1, text: t }))
}
