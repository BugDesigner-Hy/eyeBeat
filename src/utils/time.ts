export function fmtTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 与网易云 timeStr 同风格的相对时间；超过 30 天显示日期 */
export function relTime(ms: number, now = Date.now()): string {
  if (!ms) return ''
  const m = Math.floor((now - ms) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  if (m < 1440) return `${Math.floor(m / 60)}小时前`
  if (m < 43200) return `${Math.floor(m / 1440)}天前`
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
