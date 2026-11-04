<script setup lang="ts">
import { computed } from 'vue'
import type { TrackComment } from '../api/types'
import { fmtNum } from '../utils/num'
import { relTime } from '../utils/time'
import PixelAvatar from './PixelAvatar.vue'
import PixelIcon from './PixelIcon.vue'

const props = defineProps<{ c: TrackComment; reply?: boolean }>()

const MAX_REPLIES = 2

const seed = computed(() => props.c.user.name || props.c.id)
const meta = computed(() => {
  const c = props.c
  const where = c.at != null ? `@${Math.floor(c.at / 60)}:${String(Math.floor(c.at % 60)).padStart(2, '0')}` : c.location
  return [c.timeLabel ?? relTime(c.time), where].filter(Boolean).join(' · ')
})
const replies = computed(() => props.c.replies?.slice(0, MAX_REPLIES) ?? [])
const more = computed(() => Math.max(0, (props.c.replyCount ?? 0) - replies.value.length))
</script>

<template>
  <article class="cc" :class="{ reply }">
    <span class="cc-avatar" aria-hidden="true">
      <PixelAvatar :seed="seed" :size="reply ? 20 : 28" />
    </span>
    <div class="cc-body">
      <p class="cc-meta">
        <span class="cc-name">{{ c.user.name }}</span>
        <span class="cc-sub">{{ meta }}</span>
        <span v-if="c.likes" class="cc-likes"><PixelIcon name="heart" />{{ fmtNum(c.likes) }}</span>
      </p>
      <p class="cc-text">{{ c.content }}</p>
      <blockquote v-if="c.replyTo" class="cc-quote">回复 @{{ c.replyTo.user }}：{{ c.replyTo.content }}</blockquote>
      <div v-if="replies.length" class="cc-replies">
        <CommentItem v-for="r in replies" :key="r.id" :c="r" reply />
        <p v-if="more" class="cc-more">+{{ more }} 条回复</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.cc {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
}

.cc.reply {
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 8px;
}

.cc-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  overflow: hidden;
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-2));
}

.reply .cc-avatar {
  width: 20px;
  height: 20px;
}

.cc-body {
  min-width: 0;
}

.cc-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1;
  color: var(--text-dim);
}

.cc-name,
.cc-sub {
  /* 配合 overflow: hidden，行高为 1 会裁掉下伸部 */
  line-height: 1.3;
}

.cc-name {
  flex: none;
  max-width: 50%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.cc-sub {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cc-likes {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin-left: auto;
}

.cc-likes svg {
  color: var(--accent);
}

.cc-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text);
}

.reply .cc-text {
  font-size: 12px;
}

.cc-quote {
  margin: 6px 0 0;
  padding: 2px 0 2px 8px;
  border-left: 2px solid var(--accent);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.cc-replies {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.cc-more {
  margin: 0;
  padding-left: 28px;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}
</style>
