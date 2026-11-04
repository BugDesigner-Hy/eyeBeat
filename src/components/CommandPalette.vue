<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCommands, type Command } from '../commands'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'

const player = usePlayerStore()
const ui = useUiStore()
const commands = useCommands()

const MAX_TRACKS = 6

const query = ref('')
const cursor = ref(0)
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()

interface Item extends Command {
  kind: 'command' | 'track' | 'search'
}

const items = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase()
  const terms = q.split(/\s+/).filter(Boolean)
  const match = (text: string) => terms.every((t) => text.includes(t))

  const cmds: Item[] = commands.value
    .filter((c) => !terms.length || match(`${c.title} ${c.keywords ?? ''} ${c.group}`.toLowerCase()))
    .map((c) => ({ ...c, kind: 'command' }))
  if (!terms.length) return cmds

  const tracks: Item[] = player.tracks
    .filter((t) => match(`${t.title} ${t.artist}`.toLowerCase()))
    .slice(0, MAX_TRACKS)
    .map((t) => ({
      id: `track-${t.id}`,
      group: 'TRACKS',
      title: `${t.title} — ${t.artist}`,
      kind: 'track',
      active: player.current?.id === t.id,
      run: () => player.playFromList(t),
    }))

  const search: Item = {
    id: 'search',
    group: 'SEARCH',
    title: `在 ${player.providerName} 搜索「${query.value.trim()}」`,
    hint: 'ENTER',
    kind: 'search',
    run: () => void player.search(query.value),
  }
  return [...cmds, ...tracks, search]
})

watch(query, () => (cursor.value = 0))

watch(cursor, (i) =>
  nextTick(() => list.value?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })),
)

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
  } else if (e.key === 'Enter') {
    e.preventDefault()
    run(items.value[cursor.value])
  }
}

const showGroup = (i: number) => i === 0 || items.value[i - 1].group !== items.value[i].group

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="palette-mask" @pointerdown.self="ui.togglePalette(false)">
    <div class="palette" role="dialog" aria-label="命令面板">
      <label class="pal-input">
        <span class="prompt">&gt;</span>
        <input
          ref="input"
          v-model="query"
          type="text"
          placeholder="输入命令或歌名…"
          spellcheck="false"
          autocomplete="off"
          @keydown="onKey"
        />
        <span class="pal-esc">ESC</span>
      </label>

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
            <span class="pal-title" :class="{ 'px-cjk': item.id.startsWith('shelf-') }">{{ item.title }}</span>
            <span v-if="item.hint" class="pal-hint">{{ item.hint }}</span>
          </button>
        </template>
        <p v-if="!items.length" class="pal-empty">NO MATCH</p>
      </div>

      <footer class="pal-foot">
        <span>↑↓ 选择</span>
        <span>ENTER 执行</span>
        <span>CTRL+K / 打开</span>
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
}

.pal-input {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
}

.prompt {
  font-family: var(--font-mono);
  font-size: 24px;
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
  font-family: var(--font-mono), var(--font-sans);
  font-size: 22px;
  caret-color: var(--accent);
}

.pal-input input::placeholder {
  color: var(--text-dim);
  opacity: 0.7;
}

.pal-esc {
  font-family: var(--font-pixel);
  font-size: 8px;
  color: var(--text-dim);
}

.pal-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.pal-group {
  margin: 8px 16px 4px;
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--text-dim);
}

.pal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 16px;
  border: 0;
  background: none;
  color: var(--text);
  font-size: 14px;
  /* 行高取整，否则逐行累积半像素，像素字会落在半像素上发糊 */
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}

.pal-item.on {
  background: var(--accent);
  color: var(--bg);
}

.pal-mark {
  flex: none;
  width: 10px;
  font-size: 10px;
  opacity: 0.8;
}

.pal-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pal-title.px-cjk {
  font-size: 12px;
}

.pal-hint {
  flex: none;
  font-family: var(--font-mono);
  font-size: 15px;
  opacity: 0.7;
}

.pal-empty {
  margin: 24px 0;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--text-dim);
}

.pal-foot {
  display: flex;
  gap: 18px;
  padding: 8px 16px;
  border-top: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-dim);
}
</style>
