<script setup lang="ts">
import { ref } from 'vue'
import { nextProvider, switchProvider } from '../api'
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
        :title="account.loggedIn ? t('header.account') : t('header.login')"
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
.menu-btn {
  display: none;
}

@media (max-width: 1000px) {
  .top {
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: 0 16px;
  }
  .status {
    display: none;
  }
  .mobile-pwr {
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
