<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCommands, type Command } from '../commands'
import { useI18n } from '../i18n'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'

const player = usePlayerStore()
const ui = useUiStore()
const commands = useCommands()
const { t } = useI18n()

const MAX_TRACKS = 6

type TabId = 'all' | 'playback' | 'lyrics' | 'visual' | 'audio' | 'library' | 'system'

const TAB_DEFS: { id: TabId; labelKey: string; groups: string[] | null }[] = [
  { id: 'all', labelKey: 'tab.all', groups: null },
  { id: 'playback', labelKey: 'tab.playback', groups: ['PLAYBACK'] },
  { id: 'lyrics', labelKey: 'tab.lyrics', groups: ['LYRICS'] },
  { id: 'visual', labelKey: 'tab.visual', groups: ['VISUAL'] },
  { id: 'audio', labelKey: 'tab.audio', groups: ['AUDIO'] },
  { id: 'library', labelKey: 'tab.library', groups: ['LIBRARY'] },
  { id: 'system', labelKey: 'tab.system', groups: ['SYSTEM'] },
]

const tabs = computed(() => TAB_DEFS.map((d) => ({ ...d, label: t(d.labelKey) })))

const query = ref('')
const tab = ref<TabId>('all')
const cursor = ref(0)
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()

interface Item extends Command {
  kind: 'command' | 'track' | 'search'
}

/** Searching forces ALL so matches are not hidden by category */
const activeTab = computed(() => (query.value.trim() ? 'all' : tab.value))

const items = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase()
  const terms = q.split(/\s+/).filter(Boolean)
  const match = (text: string) => terms.every((t) => text.includes(t))
  const tabDef = TAB_DEFS.find((d) => d.id === activeTab.value) ?? TAB_DEFS[0]

  let cmds: Item[] = commands.value
    .filter((c) => !terms.length || match(`${c.title} ${c.keywords ?? ''} ${c.group}`.toLowerCase()))
    .map((c) => ({ ...c, kind: 'command' as const }))

  if (tabDef.groups) {
    const allow = new Set(tabDef.groups)
    cmds = cmds.filter((c) => allow.has(c.group))
  }

  if (!terms.length) return cmds

  const tracks: Item[] = player.tracks
    .filter((tr) => match(`${tr.title} ${tr.artist}`.toLowerCase()))
    .slice(0, MAX_TRACKS)
    .map((tr) => ({
      id: `track-${tr.id}`,
      group: 'TRACKS',
      title: `${tr.title} — ${tr.artist}`,
      kind: 'track',
      active: player.current?.id === tr.id,
      run: () => player.playFromList(tr),
    }))

  const search: Item = {
    id: 'search',
    group: 'SEARCH',
    title: t('pal.searchIn', { provider: player.providerName, q: query.value.trim() }),
    hint: 'ENTER',
    kind: 'search',
    run: () => void player.search(query.value),
  }
  return [...cmds, ...tracks, search]
})

watch(query, () => (cursor.value = 0))
watch(activeTab, () => (cursor.value = 0))

watch(cursor, (i) =>
  nextTick(() => list.value?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })),
)

function setTab(id: TabId) {
  tab.value = id
  input.value?.focus()
}

function shiftTab(dir: number) {
  if (query.value.trim()) return
  const i = TAB_DEFS.findIndex((d) => d.id === tab.value)
  const next = TAB_DEFS[(i + dir + TAB_DEFS.length) % TAB_DEFS.length]
  setTab(next.id)
}

function run(item: Item | undefined) {
  if (!item) return
  item.run()
  if (!item.keep) ui.togglePalette(false)
}

function onKey(e: KeyboardEvent) {
  const n = items.value.length
  if (e.key === 'Escape') {
    e.preventDefault()
    ui.togglePalette(false)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    cursor.value = n ? (cursor.value + 1) % n : 0
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    cursor.value = n ? (cursor.value - 1 + n) % n : 0
  } else if (e.key === 'ArrowLeft' && !query.value.trim()) {
    e.preventDefault()
    shiftTab(-1)
  } else if (e.key === 'ArrowRight' && !query.value.trim()) {
    e.preventDefault()
    shiftTab(1)
  } else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !query.value.trim()) {
    e.preventDefault()
    shiftTab(e.shiftKey ? -1 : 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    run(items.value[cursor.value])
  }
}

const showGroup = (i: number) => {
  if (activeTab.value !== 'all') return false
  return i === 0 || items.value[i - 1].group !== items.value[i].group
}

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="palette-mask" @pointerdown.self="ui.togglePalette(false)">
    <div class="palette" role="dialog" :aria-label="t('pal.aria')">
      <label class="pal-input">
        <span class="prompt">&gt;</span>
        <input
          ref="input"
          v-model="query"
          type="text"
          :placeholder="t('pal.placeholder')"
          spellcheck="false"
          autocomplete="off"
          @keydown="onKey"
        />
        <span class="pal-esc">ESC</span>
      </label>

      <div class="pal-tabs" role="tablist" :aria-label="t('pal.tabsAria')">
        <button
          v-for="tb in tabs"
          :key="tb.id"
          type="button"
          class="pal-tab"
          role="tab"
          :class="{ on: activeTab === tb.id, locked: !!query.trim() && tb.id !== 'all' }"
          :aria-selected="activeTab === tb.id"
          :tabindex="activeTab === tb.id ? 0 : -1"
          @click="setTab(tb.id)"
        >
          {{ tb.label }}
        </button>
      </div>

      <div ref="list" class="pal-list" role="listbox">
        <template v-for="(item, i) in items" :key="item.id">
          <p v-if="showGroup(i)" class="pal-group">// {{ item.group }}</p>
          <button
            type="button"
            class="pal-item"
            :class="{ on: i === cursor }"
            :data-i="i"
            role="option"
            :aria-selected="i === cursor"
            @pointermove="cursor = i"
            @click="run(item)"
          >
            <span class="pal-mark">{{ item.active ? '■' : '□' }}</span>
            <span class="pal-title">{{ item.title }}</span>
            <span v-if="item.hint" class="pal-hint">{{ item.hint }}</span>
          </button>
        </template>
        <p v-if="!items.length" class="pal-empty">{{ t('pal.empty') }}</p>
      </div>

      <footer class="pal-foot">
        <span>{{ t('pal.nav') }}</span>
        <span>{{ t('pal.tabsHint') }}</span>
        <span>{{ t('pal.enter') }}</span>
        <span>CTRL+K</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.palette-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: center;
  padding-top: 14vh;
  padding-top: round(14vh, 1px);
  background: rgba(5, 6, 8, 0.6);
}

.palette {
  display: flex;
  flex-direction: column;
  width: min(580px, calc(100vw - 32px));
  max-height: 64vh;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-top: 2px solid var(--accent);
  /* Silkscreen → Ark Pixel，系统黑体只做最后兜底 */
  font-family: var(--font-pixel-mix);
}

.pal-input {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
}

.prompt {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  line-height: 1;
  color: var(--accent);
  animation: blink 1s steps(2) infinite;
}

.pal-input input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: none;
  color: var(--text);
  font-family: var(--font-pixel-mix);
  /* Ark Pixel 必须 12 的整数倍，否则中文糊成黑体观感 */
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.04em;
  caret-color: var(--accent);
}

.pal-input input::placeholder {
  color: var(--text-dim);
  opacity: 0.7;
  letter-spacing: 0.06em;
}

.pal-esc {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.pal-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  scrollbar-width: none;
}

.pal-tabs::-webkit-scrollbar {
  display: none;
}

.pal-tab {
  flex: none;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-dim);
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.pal-tab:hover {
  color: var(--text);
}

.pal-tab.on {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.pal-tab.locked {
  opacity: 0.35;
  pointer-events: none;
}

.pal-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.pal-group {
  margin: 8px 16px 4px;
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--text-dim);
}

.pal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 16px;
  border: 0;
  background: none;
  color: var(--text);
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  /* 12 网格取整，避免像素字半像素发糊 */
  line-height: 16px;
  letter-spacing: 0.03em;
  text-align: left;
  cursor: pointer;
  image-rendering: pixelated;
}

.pal-item.on {
  background: var(--accent);
  color: var(--bg);
}

.pal-mark {
  flex: none;
  width: 12px;
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  line-height: 16px;
  opacity: 0.85;
}

.pal-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pal-hint {
  flex: none;
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.08em;
  opacity: 0.7;
}

.pal-empty {
  margin: 24px 0;
  text-align: center;
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--text-dim);
}

.pal-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 16px;
  border-top: 1px solid var(--line);
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}
</style>
