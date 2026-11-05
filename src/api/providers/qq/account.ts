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

/** 昵称可能出现的键名，按可信度排序（name 放最后，避免抓到专辑/歌手名） */
const NICK_KEYS = ['nickname', 'nickName', 'nick', 'userName', 'username', 'displayName', 'name']
/** 头像同理：上游把头像放在 info.logo 里 */
const AVATAR_KEYS = ['avatarUrl', 'avatarurl', 'avatar', 'logo', 'headUrl', 'headurl']

/**
 * `/login/status` 返回的是「凭证字段 + 上游 GetLoginUserInfo」合并后的对象：
 * 凭据那层是 musicid / nickname / avatarUrl，上游那层把账号信息埋在 `info` 里，
 * 键名还可能变。所以按候选键做一次限深查找，而不是写死层级。
 */
function pickByKeys(node: unknown, keys: string[], depth = 0): string {
  if (!node || typeof node !== 'object' || depth > 4) return ''
  const obj = node as Record<string, unknown>
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  for (const value of Object.values(obj)) {
    const hit = pickByKeys(value, keys, depth + 1)
    if (hit) return hit
  }
  return ''
}

async function readProfile(): Promise<AccountProfile | null> {
  const res = await qq<StatusRes>('/login/status').catch(() => null)
  const p = res?.data?.profile ?? res?.profile
  const id = p ? idOf(p) : ''
  // info 是上游 GetLoginUserInfo 的账号资料，比凭据那层更完整，优先读它
  const nickname = (p ? pickByKeys(p.info, NICK_KEYS) || pickByKeys(p, NICK_KEYS) : '')
  const avatar = p ? pickByKeys(p.info, AVATAR_KEYS) || pickByKeys(p, AVATAR_KEYS) : ''
  if (import.meta.env.DEV && p) console.debug('[qq] profile', p)
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
