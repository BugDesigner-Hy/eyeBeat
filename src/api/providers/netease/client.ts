import { qs, type QueryParams } from '../../http'

/**
 * NeteaseCloudMusicApiEnhanced 客户端。
 * 登录凭证保存在 localStorage，每次随请求体显式传入（noCookie 模式），
 * 不依赖 API 服务写到浏览器上的 cookie，退出登录时也就只需清掉本地这一份。
 */
const BASE = (import.meta.env.VITE_NETEASE_API_BASE || '').replace(/\/$/, '')
const COOKIE_KEY = 'himusic.netease.cookie'

export const neteaseConfigured = !!BASE

let cookie = localStorage.getItem(COOKIE_KEY) ?? ''

export const isLoggedIn = () => /(^|;\s*)MUSIC_U=[^;]+/.test(cookie)

export function setSessionCookie(value: string) {
  cookie = value
  if (value) localStorage.setItem(COOKIE_KEY, value)
  else localStorage.removeItem(COOKIE_KEY)
}

/**
 * API 服务按 URL 缓存 2 分钟；带上会话指纹，避免登录前后互相命中缓存。
 * 参数名不能与接口参数重名（例如歌单接口的 s 会原样转发给网易云）
 */
function sessionTag(): string {
  let h = 0
  for (let i = 0; i < cookie.length; i++) h = (Math.imul(h, 31) + cookie.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

interface Envelope {
  code?: number
  msg?: string
  message?: string
}

export class NeteaseError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message)
  }
}

interface CallOptions {
  /** 跳过 API 服务的缓存（登录状态、播放地址等时效性数据） */
  fresh?: boolean
  /** 除 200 外视为成功的业务码 */
  accept?: number[]
}

export async function ncm<T>(path: string, params: QueryParams = {}, opts: CallOptions = {}): Promise<T> {
  if (!BASE) throw new NeteaseError('未配置 VITE_NETEASE_API_BASE')
  const query = qs({ ...params, noCookie: 'true', session: sessionTag(), timestamp: opts.fresh ? Date.now() : undefined })
  const res = await fetch(`${BASE}${path}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ cookie }),
  })
  const body = (await res.json().catch(() => null)) as (T & Envelope) | null
  if (!body) {
    throw new NeteaseError(
      res.status >= 500 ? `无法连接网易云 API 服务（HTTP ${res.status}）` : `网易云接口异常（HTTP ${res.status}）`,
    )
  }
  const code = body.code ?? res.status
  if (code === 301) throw new NeteaseError('需要登录网易云', 301)
  if (code !== 200 && !opts.accept?.includes(code)) {
    throw new NeteaseError(body.msg || body.message || `网易云接口异常（${code}）`, code)
  }
  return body
}
