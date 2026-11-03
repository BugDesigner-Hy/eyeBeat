<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { provider } from '../api'
import { errorMessage } from '../api/http'
import type { QrLoginTicket } from '../api/types'
import { useAccountStore } from '../stores/account'
import { usePlayerStore } from '../stores/player'

const POLL_MS = 2000

const account = useAccountStore()
const player = usePlayerStore()

type Phase = 'loading' | 'waiting' | 'scanned' | 'expired' | 'error'
const phase = ref<Phase>('loading')
const ticket = ref<QrLoginTicket | null>(null)
const error = ref('')
let timer = 0
let alive = true

const STATUS: Record<Phase, string> = {
  loading: '正在生成二维码',
  waiting: '打开网易云音乐 App 扫码',
  scanned: '已扫码，请在手机上确认',
  expired: '二维码已过期',
  error: '',
}

async function createQr() {
  clearTimeout(timer)
  phase.value = 'loading'
  error.value = ''
  try {
    ticket.value = await provider.account!.createQr()
    if (!alive) return
    phase.value = 'waiting'
    poll()
  } catch (e) {
    phase.value = 'error'
    error.value = errorMessage(e)
  }
}

function poll() {
  timer = window.setTimeout(async () => {
    const key = ticket.value?.key
    if (!alive || !key) return
    try {
      const state = await provider.account!.checkQr(key)
      if (!alive || key !== ticket.value?.key) return
      if (state.status === 'authorized') {
        account.setProfile(state.profile)
        player.showNotice(state.profile ? `已登录：${state.profile.nickname}` : '已登录网易云')
        account.openLogin(false)
        return
      }
      phase.value = state.status
      if (state.status !== 'expired') poll()
    } catch {
      // 偶发网络错误不打断扫码流程
      if (alive) poll()
    }
  }, POLL_MS)
}

async function logout() {
  await account.logout()
  player.showNotice('已退出网易云账号')
  account.openLogin(false)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') account.openLogin(false)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (!account.loggedIn) void createQr()
})

onBeforeUnmount(() => {
  alive = false
  clearTimeout(timer)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="acct-mask" @pointerdown.self="account.openLogin(false)">
    <div class="acct" role="dialog" aria-label="网易云账号">
      <header class="acct-head">
        <span class="acct-label">NETEASE // ACCOUNT</span>
        <button type="button" class="txt-btn" aria-label="关闭" @click="account.openLogin(false)">[ESC]</button>
      </header>

      <div v-if="account.profile" class="acct-body">
        <img class="avatar" :src="`${account.profile.avatar}?param=160y160`" alt="" />
        <p class="name">{{ account.profile.nickname }}</p>
        <p class="hint">UID {{ account.profile.id }}</p>
        <button type="button" class="txt-btn" @click="logout">[退出登录]</button>
      </div>

      <div v-else class="acct-body">
        <div class="qr" :class="{ stale: phase === 'expired' || phase === 'scanned' }">
          <img v-if="ticket" :src="ticket.image" alt="登录二维码" />
          <span v-if="phase === 'loading'" class="qr-msg">LOADING<i class="dots" /></span>
          <button v-else-if="phase === 'expired'" type="button" class="qr-msg txt-btn" @click="createQr">[刷新二维码]</button>
          <span v-else-if="phase === 'scanned'" class="qr-msg ok">✓</span>
        </div>
        <p class="status" :class="{ err: phase === 'error' }">
          {{ phase === 'error' ? `ERR::${error}` : STATUS[phase] }}
        </p>
        <button v-if="phase === 'error'" type="button" class="txt-btn" @click="createQr">[RETRY]</button>
        <p class="hint">登录后可播放完整版歌曲，并解锁「每日推荐」「我喜欢的音乐」。凭证只保存在本机浏览器。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acct-mask {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(5, 6, 8, 0.6);
}

.acct {
  width: min(340px, 100%);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-top: 2px solid var(--accent);
}

.acct-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--line);
}

.acct-label {
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--accent);
}

.acct-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 24px 20px;
  text-align: center;
}

.qr {
  position: relative;
  display: grid;
  place-items: center;
  width: 200px;
  height: 200px;
  padding: 10px;
  background: #fff;
}

.qr img {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

.qr.stale img {
  opacity: 0.12;
}

.qr-msg {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 20px;
  color: var(--bg);
}

.qr-msg.ok {
  font-size: 56px;
  color: var(--bg);
}

.qr .txt-btn {
  color: var(--bg);
}

.status {
  margin: 0;
  font-size: 14px;
  color: var(--text);
}

.status.err {
  color: #ff7a7a;
  font-family: var(--font-mono);
  font-size: 16px;
}

.avatar {
  width: 80px;
  height: 80px;
  border: 1px solid var(--line-strong);
}

.name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}
</style>
