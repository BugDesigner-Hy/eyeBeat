import type { AccountApi, AccountProfile, QrLoginState } from '../../types'
import { isLoggedIn, ncm, setSessionCookie } from './client'

interface StatusRes {
  data?: {
    /** vipType：0 非会员，10 音乐包，11 黑胶 VIP */
    profile?: { userId: number; nickname: string; avatarUrl: string; vipType?: number } | null
    account?: { vipType?: number } | null
  }
}

let cachedUid: string | null = null

/** 当前登录用户 ID（「我喜欢的音乐」需要） */
export async function currentUid(): Promise<string | null> {
  if (!isLoggedIn()) return null
  if (!cachedUid) await neteaseAccount.profile()
  return cachedUid
}

const QR_STATE: Record<number, QrLoginState['status']> = {
  800: 'expired',
  801: 'waiting',
  802: 'scanned',
  803: 'authorized',
}

export const neteaseAccount: AccountApi = {
  async profile() {
    if (!isLoggedIn()) return null
    const res = await ncm<StatusRes>('/login/status', {}, { fresh: true })
    const p = res.data?.profile
    if (!p) {
      // 凭证已失效
      setSessionCookie('')
      cachedUid = null
      return null
    }
    cachedUid = String(p.userId)
    return {
      id: cachedUid,
      nickname: p.nickname,
      avatar: p.avatarUrl.replace(/^http:/, 'https:'),
      vip: (p.vipType || res.data?.account?.vipType || 0) > 0,
    } satisfies AccountProfile
  },

  async createQr() {
    const keyRes = await ncm<{ data: { unikey: string } }>('/login/qr/key', {}, { fresh: true })
    const key = keyRes.data.unikey
    const qrRes = await ncm<{ data: { qrimg: string } }>('/login/qr/create', { key, qrimg: 'true' }, { fresh: true })
    return { key, image: qrRes.data.qrimg }
  },

  async checkQr(key) {
    const res = await ncm<{ code: number; cookie?: string }>(
      '/login/qr/check',
      { key },
      { fresh: true, accept: [800, 801, 802, 803] },
    )
    const status = QR_STATE[res.code] ?? 'waiting'
    if (status !== 'authorized') return { status }
    setSessionCookie(res.cookie ?? '')
    return { status, profile: await neteaseAccount.profile().catch(() => null) }
  },

  async logout() {
    await ncm('/logout', {}, { fresh: true }).catch(() => undefined)
    setSessionCookie('')
    cachedUid = null
  },
}
