<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCommentsStore } from '../stores/comments'
import { fmtNum } from '../utils/num'
import CommentItem from './CommentItem.vue'

const props = defineProps<{ embedded?: boolean }>()
const store = useCommentsStore()
const thread = computed(() => store.thread)

const STAGGER_MAX = 10
/** 只给一页以内的条目挂显影动画：缓存的长列表重新挂载时不会几百条一起做模糊动画 */
const ANIMATED = 20
/** 新追加的一页从 0 开始计显影序号；已显影条目的序号归零，动画已结束不会重播 */
const base = ref(0)
watch([thread, () => thread.value?.items.length ?? 0], ([t, n], [pt, old]) => {
  base.value = t === pt && n > old ? old : 0
})

const scroller = ref<HTMLElement>()
const sentinel = ref<HTMLElement>()
let io: IntersectionObserver | null = null

/** 重新 observe 会立刻回报一次当前状态：一页加载完哨兵仍在范围内时继续加载 */
function rearm() {
  const s = sentinel.value
  if (!io || !s) return
  io.unobserve(s)
  io.observe(s)
}

onMounted(() => {
  // 手机端评论页由所在分页负责纵向滚动
  const root = props.embedded ? (scroller.value?.closest('[data-page]') ?? null) : (scroller.value ?? null)
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void store.loadMore()
    },
    { root, rootMargin: '0px 0px 400px 0px' },
  )
  rearm()
})
onBeforeUnmount(() => io?.disconnect())
watch([thread, () => thread.value?.loading], () => nextTick(rearm))
</script>

<template>
  <section class="cm" :class="{ embedded }" data-no-drag>
    <div class="cm-head np-in" style="--i: 1">
      <p class="np-label">
        // COMMENTS<b v-if="store.total != null" class="cm-total">{{ fmtNum(store.total) }}</b>
      </p>
      <slot name="head" />
    </div>
    <div ref="scroller" class="cm-scroll">
      <template v-if="thread?.hot.length">
        <p class="cm-sec np-in" style="--i: 2">HOT</p>
        <ol class="cm-list">
          <li v-for="(c, i) in thread.hot" :key="c.id" class="np-in" :style="{ '--i': 2 + Math.min(i, STAGGER_MAX) }">
            <CommentItem :c="c" />
          </li>
        </ol>
      </template>
      <template v-if="thread?.items.length">
        <p class="cm-sec np-in" style="--i: 2">LATEST</p>
        <ol class="cm-list">
          <li
            v-for="(c, i) in thread.items"
            :key="c.id"
            :class="{ 'np-in': i >= base && i < base + ANIMATED }"
            :style="{ '--i': 2 + Math.min(STAGGER_MAX, Math.max(0, i - base)) }"
          >
            <CommentItem :c="c" />
          </li>
        </ol>
      </template>
      <p v-if="thread?.loading" class="cm-foot">LOADING<i class="dots" /></p>
      <p v-else-if="thread?.error" class="cm-foot err">
        ERR · <button type="button" class="txt-btn" @click="store.retry()">[RETRY]</button>
      </p>
      <p v-else-if="thread?.ready && !thread.next" class="cm-foot">// END</p>
      <i ref="sentinel" class="cm-sentinel" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.cm {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.cm.embedded {
  flex: none;
}

.cm-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.cm-head .np-label {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.cm-head :deep(.txt-btn) {
  flex: none;
  margin-bottom: 12px;
}

.cm-total {
  font-family: var(--font-pixel);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.12em;
  color: var(--text-dim);
}

.cm-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.cm-scroll::-webkit-scrollbar {
  display: none;
}

.cm.embedded .cm-scroll {
  overflow: visible;
}

.cm-sec {
  margin: 4px 0 10px;
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.16em;
  color: var(--text-dim);
}

.cm-list {
  display: grid;
  gap: 14px;
  margin: 0 0 22px;
  padding: 0;
  list-style: none;
}

.cm-foot {
  margin: 0;
  padding: 4px 0 8px;
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}

.cm-foot.err {
  color: #ff7a7a;
}

.cm-foot .txt-btn {
  font-size: 16px;
  color: inherit;
}

.cm-sentinel {
  display: block;
  height: 1px;
}
</style>
