import type { AccountApi, AccountProfile } from '../../types'
import { qq, readSessionCookie, setQqSession } from './client'

interface QrKeyRes {
  data?: { unikey?: string }
}

interface QrCreateRes {
  data?: { qrimg?: string }
}

interface QrCheckRes {
  code?: number
  data?: { token?: string; session?: string }
}

/** `/login/status` 把账号资料放在 data.profile；`/user/detail` 直接给 profile */
interface ProfileNode {
  musicid?: number | string
  str_musicid?: number | string
  uin?: number | string
  id?: number | string
  nickname?: string
  nick?: string
  name?: string
  userName?: string
  avatarUrl?: string
  /** 头像在 info.logo（完整 URL） */
  info?: { logo?: string; nickname?: string }
}

interface StatusRes {
  data?: { profile?: ProfileNode }
  profile?: ProfileNode
}

interface VipRes {
  vipLevel?: string
}

const QR_STATE: Record<number, 'waiting' | 'scanned' | 'authorized' | 'expired'> = {
  800: 'expired',
  801: 'waiting',
  802: 'scanned',
  803: 'authorized',
}

/** 登录通道优先级：QQ 音乐 App 最省事，其次手机 QQ、微信 */
const CHANNEL_ORDER = ['qqmusic', 'qq', 'wechat'] as const

const VIP_LEVELS: Record<string, boolean> = { green: true, super: true, free: false }

const idOf = (p: ProfileNode) => p.str_musicid || p.musicid || p.uin || p.id

async function readProfile(): Promise<AccountProfile | null> {
  const res = await qq<StatusRes>('/login/status').catch(() => null)
  const p = res?.data?.profile ?? res?.profile
  const id = p ? idOf(p) : ''
  const nickname = p?.nickname || p?.nick || p?.name || p?.userName || p?.info?.nickname || ''
  const avatar = p?.avatarUrl || p?.info?.logo || ''
  if (!id && !nickname) return null
  const vip = await qq<VipRes>('/user/vip')
    .then((v) => VIP_LEVELS[String(v.vipLevel ?? '')])
    .catch(() => undefined)
  return {
    id: String(id || nickname),
    nickname: nickname || 'QQ 音乐用户',
    avatar: avatar.replace(/^http:\/\//, 'https://'),
    vip,
  }
}

export const qqAccount: AccountApi = {
  async profile() {
    return readProfile()
  },

  async createQr() {
    const channels = await qq<{ data?: { channels?: string[] } }>('/login/channels').catch(() => null)
    const available = channels?.data?.channels ?? []
    const channel = CHANNEL_ORDER.find((c) => available.includes(c)) ?? 'qqmusic'

    const keyRes = await qq<QrKeyRes>('/login/qr/key', { channel })
    const key = keyRes.data?.unikey
    if (!key) throw new Error('没有拿到二维码标识')
    const qrRes = await qq<QrCreateRes>('/login/qr/create', { key })
    const image = qrRes.data?.qrimg
    if (!image) throw new Error('没有拿到二维码图片')
    return { key, image }
  },

  async checkQr(key) {
    const res = await qq<QrCheckRes>('/login/qr/check', { key }, { accept: [800, 801, 802, 803] })
    const status = QR_STATE[res.code ?? 0] ?? 'waiting'
    if (status !== 'authorized') return { status }
    // 服务端可能直接给 token，也可能只写 Cookie；两种都接住
    const token = res.data?.token || res.data?.session || readSessionCookie()
    if (token) setQqSession(token)
    return { status, profile: await readProfile().catch(() => null) }
  },

  async logout() {
    await qq('/logout').catch(() => undefined)
    setQqSession('')
  },
}
