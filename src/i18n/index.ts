import { computed, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { LOCALES, messages, type Locale } from './messages'

export type { Locale }
export { LOCALES }

function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] === undefined ? `{${key}}` : String(vars[key]),
  )
}

/** 非组件上下文也可取当前语言文案（读 settings） */
export function t(key: string, vars?: Record<string, string | number>) {
  const locale = (useSettingsStore().locale ?? 'en') as Locale
  const table = messages[locale] ?? messages.en
  return format(table[key] ?? messages.en[key] ?? key, vars)
}

export function useI18n() {
  const settings = useSettingsStore()
  const locale = computed(() => settings.locale as Locale)

  function translate(key: string, vars?: Record<string, string | number>) {
    void settings.locale
    return t(key, vars)
  }

  function setLocale(next: Locale) {
    settings.locale = next
  }

  function cycleLocale() {
    const i = LOCALES.findIndex((l) => l.id === settings.locale)
    settings.locale = LOCALES[(i + 1) % LOCALES.length].id
  }

  return { t: translate, locale, setLocale, cycleLocale, locales: LOCALES }
}

export function bindDocumentLang() {
  const settings = useSettingsStore()
  const apply = () => {
    document.documentElement.lang = settings.locale === 'zh' ? 'zh-CN' : 'en'
  }
  apply()
  watch(() => settings.locale, apply)
}
