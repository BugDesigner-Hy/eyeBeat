import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { provider } from '../api'
import type { AccountProfile } from '../api/types'

export const useAccountStore = defineStore('account', () => {
  const api = provider.account
  const supported = !!api
  const profile = shallowRef<AccountProfile | null>(null)
  const loggedIn = computed(() => !!profile.value)
  const checking = ref(false)
  const loginOpen = ref(false)

  async function refresh() {
    if (!api) return
    checking.value = true
    try {
      profile.value = await api.profile()
    } catch {
      // 网络问题时保留现状，凭证仍在本地
    } finally {
      checking.value = false
    }
  }

  function setProfile(p: AccountProfile | null) {
    profile.value = p
  }

  async function logout() {
    await api?.logout()
    profile.value = null
  }

  function openLogin(open = !loginOpen.value) {
    loginOpen.value = supported && open
  }

  void refresh()

  return { supported, profile, loggedIn, checking, loginOpen, refresh, setProfile, logout, openLogin }
})
