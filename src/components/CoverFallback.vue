<script setup lang="ts">
/**
 * 封面加载失败时的占位：和播放栏同款的像素眼睛，眉眼低垂。
 * 不复用 RobotEyes —— 它每个实例都跑一个逐帧循环并跟随指针，封面墙上可能同时有几十个占位。
 */
const BROWS = [
  [0, 5],
  [5, 0],
  [20, 0],
  [25, 5],
]
const EYES = [0, 20]

/** 每个占位眨眼的节奏和相位都随机，避免整面墙同步眨眼 */
const blink = {
  '--blink-dur': `${(4.5 + Math.random() * 3.5).toFixed(2)}s`,
  '--blink-delay': `${(-Math.random() * 8).toFixed(2)}s`,
}
</script>

<template>
  <div class="cf" :style="blink" aria-hidden="true">
    <div class="cf-face">
      <svg class="cf-brows" viewBox="0 0 30 10" shape-rendering="crispEdges">
        <rect v-for="[x, y] in BROWS" :key="x" :x="x" :y="y" width="5" height="5" />
      </svg>
      <!-- 眨眼动画放在 HTML 盒子的 transform 上才能交给合成线程；SVG 内部元素的 transform 每帧都要主线程处理 -->
      <span class="cf-eyes">
        <svg viewBox="0 0 30 20" shape-rendering="crispEdges">
          <g v-for="x in EYES" :key="x">
            <rect :x="x" y="0" width="10" height="20" class="cf-ball" />
            <rect :x="x + 3" y="12" width="4" height="4" class="cf-pupil" />
          </g>
        </svg>
      </span>
    </div>
    <span class="cf-text">NO SIGNAL</span>
  </div>
</template>

<style scoped>
.cf {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  container-type: size;
  color: color-mix(in srgb, var(--accent) 80%, var(--text-dim));
  pointer-events: none;
}

/*
 * --s 是一个子格（眼睛宽 10 个子格）的边长。封面够大时取整到整数像素，两只眼睛和瞳孔才不会一宽一窄；
 * 小缩略图上一个子格不到 1px，只能保留小数
 */
.cf-face {
  --s: 0.75cqmin;
  display: flex;
  flex-direction: column;
  gap: calc(var(--s) * 5);
  width: calc(var(--s) * 30);
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 45%, transparent));
}

@supports (width: round(1px, 1px)) {
  @container (min-width: 134px) and (min-height: 134px) {
    .cf-face {
      --s: round(0.75cqmin, 1px);
    }
  }
}

.cf-face svg {
  display: block;
  width: 100%;
  fill: currentColor;
}

.cf-brows {
  opacity: 0.7;
}

.cf-eyes {
  display: block;
  transform-origin: 50% 100%;
  animation: cf-blink var(--blink-dur) var(--blink-delay) infinite steps(1, end);
}

.cf-pupil {
  fill: var(--bg-2);
}

@keyframes cf-blink {
  0%,
  95%,
  99%,
  100% {
    transform: none;
  }
  96%,
  98% {
    transform: scaleY(0.5);
  }
  97% {
    transform: scaleY(0.15);
  }
}

.cf-text {
  margin-top: 7cqmin;
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.15em;
  opacity: 0.6;
  white-space: nowrap;
}

@container (min-width: 360px) and (min-height: 200px) {
  .cf-text {
    font-size: 16px;
  }
}

@container (max-width: 96px) or (max-height: 96px) {
  .cf-text {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cf-eyes {
    animation: none;
  }
}
</style>
