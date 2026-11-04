<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import CoverTile from './CoverTile.vue'
import { useMobile } from '../composables/useMobile'

const store = usePlayerStore()
const settings = useSettingsStore()
const mobile = useMobile()
const wall = ref<HTMLElement>()
const grid = ref<HTMLElement>()
const sentinel = ref<HTMLElement>()

const EASE = 0.08
/** 远离焦点的封面最多缩小 / 变淡到的比例（偏亮，避免整墙发闷） */
const MIN_SCALE = 0.96
const MIN_OPACITY = 0.84
/** 衰减半径占视口对角线的比例 */
const RADIUS = 0.48
/** 指针在视口边缘时，深度为 1 的封面偏移的像素数 */
const PARALLAX = 32

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 每帧直接写可见封面的 transform / opacity。不要改成在 .wall 上写继承的 CSS 变量：
 * 那会让墙内上千个节点每帧都重算样式，低性能机器上一帧要上百毫秒。
 */
interface TileBox {
  inner: HTMLElement
  depth: number
  x: number
  y: number
  /** 上次写入的值，没变就不写 */
  transform: string
  opacity: string
}

let boxes: TileBox[] = []
/** 指针位置（视口坐标），离开窗口时回到中心 */
let tx = window.innerWidth / 2
let ty = window.innerHeight / 2
let cx = tx
let cy = ty
let raf = 0

function measure() {
  const els = grid.value?.querySelectorAll<HTMLElement>('.tile') ?? []
  boxes = [...els].map((el) => {
    const r = el.getBoundingClientRect()
    return {
      inner: el.firstElementChild as HTMLElement,
      depth: parseFloat(el.style.getPropertyValue('--depth')) || 0,
      x: r.left + r.width / 2 + window.scrollX,
      y: r.top + r.height / 2 + window.scrollY,
      transform: '',
      opacity: '',
    }
  })
  schedule()
}

function schedule() {
  if (mobile.value) return
  if (!raf) raf = requestAnimationFrame(frame)
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)

function applyTiles() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const radius = Math.hypot(vw, vh) * RADIUS
  const sx = window.scrollX
  const sy = window.scrollY
  const mx = (cx / vw) * 2 - 1
  const my = (cy / vh) * 2 - 1
  const focus = settings.wallFocus
  for (const b of boxes) {
    const y = b.y - sy
    if (y < -vh * 0.5 || y > vh * 1.5) continue
    const t = focus ? smoothstep(Math.min(1, Math.hypot(b.x - sx - cx, y - cy) / radius)) : 0
    const k = -PARALLAX * b.depth
    const transform = `translate3d(${(mx * k).toFixed(2)}px, ${(my * k).toFixed(2)}px, 0) scale(${(1 - (1 - MIN_SCALE) * t).toFixed(3)})`
    const opacity = (1 - (1 - MIN_OPACITY) * t).toFixed(3)
    if (transform !== b.transform) b.inner.style.transform = b.transform = transform
    if (opacity !== b.opacity) b.inner.style.opacity = b.opacity = opacity
  }
}

function clearTiles() {
  for (const b of boxes) {
    b.inner.style.removeProperty('transform')
    b.inner.style.removeProperty('opacity')
    b.transform = b.opacity = ''
  }
}

function frame() {
  if (mobile.value) {
    raf = 0
    return
  }
  cx += (tx - cx) * EASE
  cy += (ty - cy) * EASE
  applyTiles()
  raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.5 ? requestAnimationFrame(frame) : 0
}

/** 只跟随鼠标：触摸拖动也会产生 pointermove，平板上滑动时封面会乱晃 */
function onPointerMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  tx = e.clientX
  ty = e.clientY
  schedule()
}

function onPointerLeave() {
  tx = window.innerWidth / 2
  ty = window.innerHeight / 2
  schedule()
}

function pickShelf(id: string) {
  if (id === store.shelf.id) return
  void store.openShelf(id)
  const top = wall.value?.getBoundingClientRect().top ?? 0
  if (top < 0) wall.value?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
}

let io: IntersectionObserver | undefined
let ro: ResizeObserver | undefined
let sentinelVisible = false

watch(
  () => store.listLoading,
  (loading) => {
    if (!loading && sentinelVisible && store.tracks.length) store.loadList()
  },
)

watch(
  () => store.tracks,
  () => nextTick(measure),
)

/** 先全部清掉：没有滚动监听时（减弱动效），视口外的封面不会再被重写 */
watch(
  () => settings.wallFocus,
  () => {
    clearTiles()
    schedule()
  },
)

/** 手机上没有视差（窄屏布局下封面会互相错位） */
watch(mobile, (m) => (m ? clearTiles() : schedule()))

onMounted(() => {
  if (!reduceMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('scroll', schedule, { passive: true })
  }
  ro = new ResizeObserver(measure)
  if (grid.value) ro.observe(grid.value)

  io = new IntersectionObserver(
    ([entry]) => {
      sentinelVisible = entry.isIntersecting
      if (sentinelVisible && store.tracks.length) store.loadList()
    },
    { rootMargin: '800px 0px' },
  )
  if (sentinel.value) io.observe(sentinel.value)
  if (!store.tracks.length) store.loadList(true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  document.documentElement.removeEventListener('pointerleave', onPointerLeave)
  window.removeEventListener('scroll', schedule)
  cancelAnimationFrame(raf)
  io?.disconnect()
  ro?.disconnect()
})
</script>

<template>
  <section
    ref="wall"
    class="wall"
    :class="{ 'dim-others': settings.wallFocus && store.isPlaying && store.current }"
  >
    <div class="wall-head">
      <span class="wall-label">// {{ store.keyword ? 'SEARCH' : store.shelf.tag }}</span>
      <h1 class="wall-title px-cjk">{{ store.keyword || store.shelf.name }}</h1>
      <span v-if="store.listStale" class="wall-sync loading" role="status">SYNC<i class="dots" /></span>
      <nav v-if="!store.keyword && store.shelves.length > 1" class="shelves" aria-label="分区">
        <button
          v-for="s in store.shelves"
          :key="s.id"
          type="button"
          class="txt-btn px-cjk"
          :class="{ on: s.id === store.shelf.id }"
          :aria-pressed="s.id === store.shelf.id"
          @click="pickShelf(s.id)"
        >
          [{{ s.name }}]
        </button>
      </nav>
    </div>

    <div class="grid-box" :class="{ stale: store.listStale }" :aria-busy="store.listStale">
      <div ref="grid" class="grid">
        <CoverTile
          v-for="(t, i) in store.tracks"
          :key="t.id"
          :track="t"
          :index="i"
          :current="store.current?.id === t.id"
          :playing="store.isPlaying"
          @select="store.playFromList(t)"
        />
      </div>
    </div>

    <div ref="sentinel" class="sentinel">
      <template v-if="store.listError">
        <span class="err">ERR::{{ store.listError }}</span>
        <button class="txt-btn" type="button" @click="store.loadList(!store.tracks.length)">[RETRY]</button>
      </template>
      <span v-else-if="store.listLoading" class="loading">LOADING<i class="dots" /></span>
      <span v-else-if="!store.tracks.length">NO SIGNAL / 无结果</span>
      <span v-else-if="!store.hasMore">// END OF LIST</span>
    </div>
  </section>
</template>

<style scoped>
.wall {
  --gap: 18px;
  --cols: 8;
  position: relative;
  padding: 104px 40px calc(var(--dock-h) + 48px);
}

@media (max-width: 1600px) {
  .wall {
    --cols: 7;
  }
}
@media (max-width: 1280px) {
  .wall {
    --cols: 6;
  }
}
@media (max-width: 1000px) {
  .wall {
    --cols: 4;
    padding-inline: 24px;
  }
}
@media (max-width: 600px) {
  .wall {
    --cols: 3;
    --gap: 10px;
    padding-inline: 12px;
  }
}
.wall-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 16px;
  margin-bottom: 28px;
}

.shelves {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-left: auto;
}

.wall-label {
  font-family: var(--font-pixel);
  font-size: 8px;
  color: var(--accent);
  letter-spacing: 0.1em;
}

.wall-title {
  margin: 0;
  font-family: var(--font-pixel-cjk);
  font-size: 36px;
  font-weight: 400;
  line-height: 1;
  color: var(--text);
}

.shelves .txt-btn {
  font-family: var(--font-pixel-cjk);
  font-size: 24px;
}

.wall-sync {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--accent);
}

.grid-box {
  container-type: inline-size;
  transition: opacity 160ms var(--ease-out);
}

.grid-box.stale {
  opacity: 0.3;
  pointer-events: none;
}

.dim-others :deep(.tile:not(.is-current):not(:hover) .shade) {
  opacity: 0.22;
}

.grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-auto-rows: calc((100cqw - (var(--cols) - 1) * var(--gap)) / var(--cols));
  grid-auto-flow: dense;
  gap: var(--gap);
}

.sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 80px;
  margin-top: 32px;
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--text-dim);
}

.err {
  color: #ff7a7a;
}

/* 放在末尾：需要覆盖上面 .grid / .shelves 的基础规则 */
@media (max-width: 640px) {
  .wall {
    --cols: 2;
    --gap: 10px;
    padding: 72px 12px calc(var(--dock-h) + 32px);
  }
  .wall-head {
    gap: 6px 12px;
    margin-bottom: 14px;
  }
  .wall-title {
    font-size: 24px;
  }
  .grid {
    grid-auto-rows: auto;
    grid-auto-flow: row;
    row-gap: 16px;
  }
  /* 分区标签单行横滑，两端渐隐提示还能滑 */
  .shelves {
    flex: 0 0 calc(100% + 24px);
    flex-wrap: nowrap;
    gap: 4px;
    margin: 0 -12px;
    padding: 0 12px;
    overflow-x: auto;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
    mask-image: linear-gradient(90deg, transparent, #000 12px, #000 calc(100% - 24px), transparent);
  }
  .shelves::-webkit-scrollbar {
    display: none;
  }
  .shelves .txt-btn {
    flex: none;
    font-size: 12px;
    min-height: 44px;
    scroll-snap-align: start;
  }
  .shelves .txt-btn.on {
    box-shadow: inset 0 -2px var(--accent);
  }
}
</style>
