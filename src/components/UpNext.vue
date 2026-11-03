<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'
import { coverSources } from '../utils/cover'
import CoverImage from './CoverImage.vue'

const UP_NEXT = 5

const player = usePlayerStore()
const list = computed(() => player.upcoming(UP_NEXT))
</script>

<template>
  <section class="un">
    <p class="np-label np-in" style="--i: 6">// UP NEXT</p>
    <p v-if="player.mode === 'shuffle'" class="un-state np-in" style="--i: 7">RAND::UNPREDICTABLE</p>
    <p v-else-if="!list.length" class="un-state np-in" style="--i: 7">QUEUE::EMPTY</p>
    <ol v-else class="un-list">
      <li v-for="(t, i) in list" :key="t.id" class="np-in" :style="{ '--i': 7 + i }">
        <button type="button" class="un-item" @click="player.play(t)">
          <span class="un-idx">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="un-thumb"><CoverImage :sources="coverSources(t.cover, 'small')" /></span>
          <span class="un-text">
            <b>{{ t.title }}</b>
            <small>{{ t.artist }}</small>
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.un {
  min-width: 0;
}

.un-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.un-item {
  display: grid;
  grid-template-columns: 22px 32px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 4px 6px 4px 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 160ms var(--ease-out);
}

.un-item:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.un-item:hover b {
  color: var(--accent);
}

.un-idx {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

.un-thumb {
  position: relative;
  width: 32px;
  height: 32px;
}

.un-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.un-text b,
.un-text small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.un-text b {
  font-size: 13px;
  font-weight: 600;
}

.un-text small {
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1;
  color: var(--text-dim);
}

.un-state {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}
</style>
