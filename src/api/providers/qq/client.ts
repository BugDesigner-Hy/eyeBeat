import { qs, type QueryParams } from '../../http'

/**
 * @yakult-green-tea/qq-music-api 客户端。
 *
 * 会话有两种携带方式，服务端都认：
 * - `X-QQ-Session: <token>`（裸 token，优先用）
 * - 同源 Cookie `qqmusic_session=<token>`（dev 代理是同源，浏览器会自动带上）
 *
 * 服务端返回 401 就清掉本地会话，避免一直拿着失效凭证重试。
 */
const BASE = (import.meta.env.VITE_QQ_API_BASE || '').replace(/\/$/, '')
const SESSION_KEY = 'himusic.qq.session'
const COOKIE_NAME = 'qqmusic_session'

export const qqConfigured = !!BASE

let session = localStorage.getItem(SESSION_KEY) ?? ''

export const qqSession = () => session

export function setQqSession(value: string) {
  session = value
  if (value) localStorage.setItem(SESSION_KEY, value)
  else localStorage.removeItem(SESSION_KEY)
}

/** 从 document.cookie 里捞出后端写的会话（HttpOnly 时读不到，靠浏览器自动携带即可） */
export function readSessionCookie(): string {
  for (const entry of document.cookie.split(';')) {
    const i = entry.indexOf('=')
    if (i > 0 && entry.slice(0, i).trim() === COOKIE_NAME) return entry.slice(i + 1).trim()
  }
  return ''
}

export class QqError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message)
  }
}

interface Envelope {
  code?: number
  message?: string
  failureHint?: { message?: string } | null
}

interface CallOptions {
  /** 除 200 外视为成功的业务码，例如空清单的 422 */
  accept?: number[]
}

async function call<T>(path: string, init: RequestInit, opts: CallOptions): Promise<T> {
  if (!BASE) throw new QqError('未配置 VITE_QQ_API_BASE')
  const token = session || readSessionCookie()
  const headers = new Headers(init.headers)
  if (token) headers.set('X-QQ-Session', token)
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' })
  const body = (await res.json().catch(() => null)) as (T & Envelope) | null
  if (!body) {
    throw new QqError(
      res.status >= 500 ? `无法连接 QQ 音乐 API 服务（HTTP ${res.status}）` : `QQ 音乐接口异常（HTTP ${res.status}）`,
    )
  }
  const code = body.code ?? res.status
  if (code === 401) {
    setQqSession('')
    throw new QqError('需要登录 QQ 音乐', 401)
  }
  if (code !== 200 && !opts.accept?.includes(code)) {
    throw new QqError(body.failureHint?.message || body.message || `QQ 音乐接口异常（${code}）`, code)
  }
  return body
}

export function qq<T>(path: string, params: QueryParams = {}, opts: CallOptions = {}): Promise<T> {
  const query = qs(params)
  return call<T>(`${path}${query ? `?${query}` : ''}`, { method: 'GET' }, opts)
}

export function qqPost<T>(path: string, body: unknown, opts: CallOptions = {}): Promise<T> {
  return call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, opts)
}
