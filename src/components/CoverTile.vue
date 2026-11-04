<script setup lang="ts">
import { computed } from 'vue'
import type { Track } from '../api/types'
import { useI18n } from '../i18n'
import { useSettingsStore } from '../stores/settings'
import { coverSources } from '../utils/cover'
import { tileDepthForId, tileSizeForId } from '../utils/tileSize'
import CoverImage from './CoverImage.vue'

const { t } = useI18n()
const settings = useSettingsStore()

const props = withDefaults(
  defineProps<{
    track: Track
    index: number
    current: boolean
    playing: boolean
    /** 键盘选中高亮 */
    selected?: boolean
    /** 画布模式：禁用 CSS hover 缩放（由画布做放大让路），尺寸仍错落 */
    uniform?: boolean
  }>(),
  { uniform: false, selected: false },
)

defineEmits<{ select: [] }>()

const size = computed(() => tileSizeForId(props.track.id))
const depth = computed(() => tileDepthForId(props.track.id))
const sources = computed(() =>
  coverSources(props.track.cover, size.value === 'm' || size.value === 'l' ? 'large' : 'medium'),
)
</script>

<template>
  <button
    type="button"
    class="tile"
    :class="[
      `is-${size}`,
      { 'is-current': current, 'is-uniform': uniform, 'is-selected': selected, 'show-info': settings.coverInfoAlways },
    ]"
    :style="{
      '--depth': depth.toFixed(3),
      '--delay': `${(index % 40) * 22}ms`,
      zIndex: Math.round(depth * 10),
    }"
    :data-track-id="track.id"
    :aria-label="t('tile.play', { title: track.title, artist: track.artist })"
    @click="$emit('select')"
  >
    <div class="tile-inner">
      <CoverImage :sources="sources" />
      <i class="shade" aria-hidden="true" />
      <i class="frame" aria-hidden="true" />
      <div class="meta">
        <span class="meta-title">{{ track.title }}</span>
        <span class="meta-artist">{{ track.artist }}</span>
      </div>
      <div v-if="current" class="badge" :class="{ paused: !playing }" aria-hidden="true">
        <i /><i /><i />
      </div>
    </div>
    <span class="cap" aria-hidden="true">
      <span class="cap-title">{{ track.title }}</span>
      <span class="cap-artist">{{ track.artist }}</span>
    </span>
  </button>
</template>

<style scoped>
.tile {
  position: relative;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: crosshair;
  text-align: left;
  /* scale 放在外层，避免和 CoverWall 写在 .tile-inner 上的视差 transform 打架 */
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cap {
  display: none;
}

.is-w {
  grid-column: span 2;
}
.is-t {
  grid-row: span 2;
}
.is-m {
  grid-column: span 2;
  grid-row: span 2;
}
.is-l {
  grid-column: span 3;
  grid-row: span 3;
}

@media (max-width: 720px) {
  .is-l {
    grid-column: span 2;
    grid-row: span 2;
  }
}

.tile-inner {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* transform / opacity 由 CoverWall 逐帧写入（视差 + 焦点衰减） */
  will-change: transform, opacity;
  animation: tile-in 320ms steps(4) backwards;
  animation-delay: var(--delay);
  transition:
    filter 180ms var(--ease-out),
    box-shadow 180ms var(--ease-out);
}

@keyframes tile-in {
  from {
    opacity: 0;
    clip-path: inset(0 0 100% 0);
  }
  to {
    opacity: 1;
    clip-path: inset(0);
  }
}

.shade {
  position: absolute;
  inset: 0;
  background: var(--bg);
  opacity: 0;
  pointer-events: none;
  transition: opacity 360ms steps(4);
}

.frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  --c: var(--accent);
  --l: 14px;
  --w: 2px;
  box-shadow: inset 0 0 0 1px var(--line);
  background:
    linear-gradient(var(--c) 0 0) top left / var(--l) var(--w),
    linear-gradient(var(--c) 0 0) top left / var(--w) var(--l),
    linear-gradient(var(--c) 0 0) top right / var(--l) var(--w),
    linear-gradient(var(--c) 0 0) top right / var(--w) var(--l),
    linear-gradient(var(--c) 0 0) bottom left / var(--l) var(--w),
    linear-gradient(var(--c) 0 0) bottom left / var(--w) var(--l),
    linear-gradient(var(--c) 0 0) bottom right / var(--l) var(--w),
    linear-gradient(var(--c) 0 0) bottom right / var(--w) var(--l);
  background-repeat: no-repeat;
  background-size: 0 0;
  transition:
    background-size 160ms steps(3),
    box-shadow 180ms var(--ease-out);
}

.tile:hover,
.tile:focus-visible,
.tile.is-selected {
  z-index: 40;
  transform: scale(1.07);
}

/* 画布模式由 CoverCanvas 做放大+让路，避免和外层 transform 叠乘 */
.tile.is-uniform:hover,
.tile.is-uniform:focus-visible,
.tile.is-uniform.is-selected {
  z-index: auto;
  transform: none;
}

.tile:hover .tile-inner,
.tile:focus-visible .tile-inner,
.tile.is-selected .tile-inner {
  filter: brightness(1.14) saturate(1.1);
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.55),
    0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent),
    0 0 22px color-mix(in srgb, var(--accent) 28%, transparent);
}

.tile.is-uniform:hover .tile-inner,
.tile.is-uniform:focus-visible .tile-inner,
.tile.is-uniform.is-selected .tile-inner {
  filter: none;
  box-shadow: none;
}

.tile:hover .frame,
.tile:focus-visible .frame,
.tile.is-selected .frame {
  --l: 22px;
  --w: 3px;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent),
    inset 0 0 20px color-mix(in srgb, var(--accent) 22%, transparent);
  background-size:
    var(--l) var(--w),
    var(--w) var(--l),
    var(--l) var(--w),
    var(--w) var(--l),
    var(--l) var(--w),
    var(--w) var(--l),
    var(--l) var(--w),
    var(--w) var(--l);
}

.is-current .frame {
  background-size:
    var(--l) var(--w),
    var(--w) var(--l),
    var(--l) var(--w),
    var(--w) var(--l),
    var(--l) var(--w),
    var(--w) var(--l),
    var(--l) var(--w),
    var(--w) var(--l);
}

/* 准星锁定时闪一下边框：data-lock 由 CoverReticle 直接写，Vue 不管理这个属性 */
.tile-inner::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow:
    inset 0 0 0 2px var(--accent),
    inset 0 0 18px color-mix(in srgb, var(--accent) 45%, transparent);
  opacity: 0;
  pointer-events: none;
}

.tile[data-lock] .tile-inner::after {
  animation: lock-flash 420ms steps(6) both;
}

@keyframes lock-flash {
  0%,
  34% {
    opacity: 1;
  }
  17%,
  50% {
    opacity: 0.2;
  }
  100% {
    opacity: 0;
  }
}

.meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 22px 12px 10px;
  background: linear-gradient(transparent, rgba(6, 8, 10, 0.88));
  transform: translateY(100%);
  transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.tile:hover .meta,
.tile:focus-visible .meta,
.tile.is-selected .meta,
.tile.show-info .meta {
  transform: none;
}

.tile:hover .shade,
.tile:focus-visible .shade,
.tile.is-selected .shade,
.tile.show-info .shade {
  opacity: 0;
}

.meta-title {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  image-rendering: pixelated;
}

.meta-artist {
  font-family: var(--font-pixel-mix);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 16px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  image-rendering: pixelated;
}

.badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 18px;
  padding: 3px 4px;
  background: rgba(6, 8, 10, 0.75);
}

.badge i {
  width: 3px;
  height: 100%;
  background: var(--accent);
  animation: eq 600ms steps(4) infinite alternate;
}

.badge i:nth-child(2) {
  animation-delay: -200ms;
}
.badge i:nth-child(3) {
  animation-delay: -400ms;
}

.badge.paused i {
  animation-play-state: paused;
}

@keyframes eq {
  from {
    height: 25%;
  }
  to {
    height: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tile {
    transition: none;
  }
  .tile:hover,
  .tile:focus-visible {
    transform: none;
  }
  .tile-inner {
    animation: none;
    transition: none;
  }
  /* 全局规则会把闪烁压成 0.01ms，改为锁定期间静态高亮 */
  .tile[data-lock] .tile-inner::after {
    animation: none;
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .is-w,
  .is-t,
  .is-m,
  .is-l {
    grid-column: auto;
    grid-row: auto;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .tile-inner {
    position: relative;
    inset: auto;
    aspect-ratio: 1;
    will-change: auto;
  }
  .meta {
    display: none;
  }
  .cap {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .cap-title {
    font-family: var(--font-pixel-mix);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.04em;
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    image-rendering: pixelated;
  }
  .cap-artist {
    font-family: var(--font-pixel-mix);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.04em;
    line-height: 16px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    image-rendering: pixelated;
  }
  .is-current .cap-title {
    color: var(--accent);
  }
}

/* 触屏点过之后 :hover 会一直粘着，不能靠它显示角标 */
@media (hover: none) {
  .tile:hover,
  .tile:focus-visible {
    transform: none;
  }
  .tile:hover .tile-inner,
  .tile:focus-visible .tile-inner {
    filter: none;
    box-shadow: none;
  }
  .tile:hover:not(.is-current) .frame {
    background-size: 0 0;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .tile:hover:not(.show-info):not(.is-selected) .meta {
    transform: translateY(100%);
  }
}
</style>
