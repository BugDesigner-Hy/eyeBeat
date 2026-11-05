<script setup lang="ts">
import { ref } from 'vue'
import { nextProvider, provider, switchProvider } from '../api'
import { REPO_URL } from '../config'
import { useI18n } from '../i18n'
import { useAccountStore } from '../stores/account'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import BrandLogo from './BrandLogo.vue'
import PixelAvatar from './PixelAvatar.vue'
import VipBadge from './VipBadge.vue'

const store = usePlayerStore()
const account = useAccountStore()
const ui = useUiStore()
const { t } = useI18n()
const query = ref(store.keyword)
const nextSrc = nextProvider()

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
    <BrandLogo @clear="clear" />

    <form class="search" role="search" @submit.prevent="submit">
      <span class="prompt">&gt;</span>
      <input
        v-model="query"
        type="search"
        placeholder="SEARCH TRACKS / ARTISTS"
        spellcheck="false"
        autocomplete="off"
        :aria-label="t('header.search')"
      />
      <button v-if="store.keyword" type="button" class="txt-btn" @click="clear">[CLR]</button>
    </form>

    <div class="status">
      <button type="button" class="txt-btn" :title="t('header.palette')" @click="ui.togglePalette(true)">[CTRL+K]</button>
      <button
        v-if="account.supported"
        type="button"
        class="txt-btn acct-btn"
        :class="{ on: account.loggedIn }"
        :title="account.loggedIn ? t('header.account', { source: provider.name }) : t('header.login', { source: provider.name })"
        @click="account.openLogin(true)"
      >
        <PixelAvatar v-if="account.profile" :seed="account.profile.id" :size="18" />
        <VipBadge v-if="account.profile?.vip" />
        {{ account.profile ? account.profile.nickname : '[LOGIN]' }}
      </button>
      <i class="dot" :class="{ live: store.isPlaying }" />
      <button
        v-if="nextSrc"
        type="button"
        class="txt-btn src-btn"
        :title="t('header.switchSrc', { name: nextSrc.name })"
        @click="switchProvider(nextSrc.id)"
      >
        SRC::{{ store.providerName.toUpperCase() }}
      </button>
      <span v-else>SRC::{{ store.providerName.toUpperCase() }}</span>
      <span class="dim">{{ String(store.tracks.length).padStart(3, '0') }} TRK</span>
      <a
        class="pwr-btn gh-btn"
        :href="REPO_URL"
        target="_blank"
        rel="noopener noreferrer"
        :title="t('header.github')"
        :aria-label="t('header.github')"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
      </a>
      <button
        type="button"
        class="pwr-btn"
        :title="t('header.power')"
        :aria-label="t('cmd.powerOff')"
        @click="ui.powerToggle()"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 1h2v7H7zM4.2 3.1l1.4 1.4A4.9 4.9 0 0 0 3 9a5 5 0 0 0 10 0 4.9 4.9 0 0 0-2.6-4.5l1.4-1.4A6.9 6.9 0 0 1 15 9a7 7 0 1 1-14 0 6.9 6.9 0 0 1 3.2-5.9z"
          />
        </svg>
      </button>
    </div>

    <a
      class="pwr-btn mobile-gh"
      :href="REPO_URL"
      target="_blank"
      rel="noopener noreferrer"
      :title="t('header.github')"
      :aria-label="t('header.github')"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    </a>

    <button
      type="button"
      class="pwr-btn mobile-pwr"
      :title="t('header.power')"
      :aria-label="t('cmd.powerOff')"
      @click="ui.powerToggle()"
    >
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M7 1h2v7H7zM4.2 3.1l1.4 1.4A4.9 4.9 0 0 0 3 9a5 5 0 0 0 10 0 4.9 4.9 0 0 0-2.6-4.5l1.4-1.4A6.9 6.9 0 0 1 15 9a7 7 0 1 1-14 0 6.9 6.9 0 0 1 3.2-5.9z"
        />
      </svg>
    </button>

    <button
      type="button"
      class="menu-btn"
      :aria-label="t('header.menu')"
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


.dot {
  width: 6px;
  height: 6px;
  background: var(--text-dim);
}

.dot.live {
  background: var(--accent);
  animation: blink 1s steps(2) infinite;
}

.pwr-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--line-strong);
  background: #0e1116;
  color: var(--accent);
  cursor: pointer;
}

.pwr-btn:hover,
.pwr-btn:focus-visible {
  border-color: var(--accent);
  outline: 1px dashed var(--accent);
  outline-offset: 2px;
}

.mobile-pwr,
.mobile-gh,
.menu-btn {
  display: none;
}

.gh-btn {
  display: grid;
  place-items: center;
  text-decoration: none;
}

@media (max-width: 1000px) {
  .top {
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: 0 16px;
  }
  .status {
    display: none;
  }
  .mobile-pwr,
  .mobile-gh {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
  }
}

@media (max-width: 640px) {
  .top {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 4px;
    height: calc(56px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 8px 0 14px;
  }
  .search {
    height: 36px;
  }
  /* 小于 16px 时 iOS 聚焦输入框会自动放大页面 */
  .search input {
    font-size: 16px;
  }
  /* 手机上顶栏太挤，GitHub 入口收进 SYSTEM MENU */
  .mobile-gh {
    display: none;
  }
  .mobile-pwr,
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
