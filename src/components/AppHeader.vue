<script setup lang="ts">
import { ref } from 'vue'
import { availableProviders, provider, switchProvider } from '../api'
import { useAccountStore } from '../stores/account'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import VipBadge from './VipBadge.vue'

const store = usePlayerStore()
const account = useAccountStore()
const ui = useUiStore()
const query = ref(store.keyword)
const nextProvider = availableProviders.find((p) => p.id !== provider.id)

function submit() {
  if (query.value.trim() !== store.keyword) store.search(query.value)
}

function clear() {
  query.value = ''
  store.search('')
}
</script>

<template>
  <header class="top">
    <a class="logo" href="/" @click.prevent="clear">HI<span>/</span>MUSIC</a>

    <form class="search" role="search" @submit.prevent="submit">
      <span class="prompt">&gt;</span>
      <input
        v-model="query"
        type="search"
        placeholder="SEARCH TRACKS / ARTISTS"
        spellcheck="false"
        autocomplete="off"
        aria-label="搜索"
      />
      <button v-if="store.keyword" type="button" class="txt-btn" @click="clear">[CLR]</button>
    </form>

    <div class="status">
      <button type="button" class="txt-btn" title="命令面板" @click="ui.togglePalette(true)">[CTRL+K]</button>
      <button
        v-if="account.supported"
        type="button"
        class="txt-btn acct-btn"
        :class="{ on: account.loggedIn }"
        :title="account.loggedIn ? '网易云账号' : '扫码登录网易云'"
        @click="account.openLogin(true)"
      >
        <img v-if="account.profile" :src="`${account.profile.avatar}?param=40y40`" alt="" />
        <VipBadge v-if="account.profile?.vip" />
        {{ account.profile ? account.profile.nickname : '[LOGIN]' }}
      </button>
      <i class="dot" :class="{ live: store.isPlaying }" />
      <button
        v-if="nextProvider"
        type="button"
        class="txt-btn src-btn"
        :title="`切换到 ${nextProvider.name}`"
        @click="switchProvider(nextProvider.id)"
      >
        SRC::{{ store.providerName.toUpperCase() }}
      </button>
      <span v-else>SRC::{{ store.providerName.toUpperCase() }}</span>
      <span class="dim">{{ String(store.tracks.length).padStart(3, '0') }} TRK</span>
    </div>

    <button
      type="button"
      class="menu-btn"
      aria-label="菜单"
      :aria-expanded="ui.menuOpen"
      @click="ui.toggleMenu(true)"
    >
      [≡]
    </button>
  </header>
</template>

<style scoped>
.top {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: 1fr minmax(0, 420px) 1fr;
  align-items: center;
  gap: 24px;
  height: 72px;
  padding: 0 40px;
  background: linear-gradient(var(--bg) 30%, transparent);
  pointer-events: none;
}

.top > * {
  pointer-events: auto;
}

.logo {
  justify-self: start;
  font-family: var(--font-pixel);
  font-size: 16px;
  letter-spacing: 0.06em;
  color: var(--text);
  text-decoration: none;
}

.logo span {
  color: var(--accent);
}

.search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px 0 12px;
  background: rgba(17, 21, 26, 0.85);
  border: 1px solid var(--line-strong);
}

.search:focus-within {
  border-color: var(--accent);
}

.prompt {
  font-family: var(--font-mono);
  font-size: 20px;
  color: var(--accent);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: none;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 18px;
  caret-color: var(--accent);
}

.search input::placeholder {
  color: var(--text-dim);
  opacity: 0.7;
}

.search input::-webkit-search-cancel-button {
  display: none;
}

.status {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text);
}

.status .dim {
  color: var(--text-dim);
}

.src-btn {
  color: var(--text);
}

.acct-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 184px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono), var(--font-sans);
}

.acct-btn img {
  flex: none;
  width: 18px;
  height: 18px;
}

.dot {
  width: 6px;
  height: 6px;
  background: var(--text-dim);
}

.dot.live {
  background: var(--accent);
  animation: blink 1s steps(2) infinite;
}

.menu-btn {
  display: none;
}

@media (max-width: 1000px) {
  .top {
    grid-template-columns: auto minmax(0, 1fr);
    padding: 0 16px;
  }
  .status {
    display: none;
  }
}

@media (max-width: 640px) {
  .top {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    height: calc(56px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 8px 0 14px;
  }
  .logo {
    font-size: 12px;
  }
  .search {
    height: 36px;
  }
  /* 小于 16px 时 iOS 聚焦输入框会自动放大页面 */
  .search input {
    font-size: 16px;
  }
  .menu-btn {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-mono);
    font-size: 22px;
    color: var(--accent);
    cursor: pointer;
  }
}
</style>
