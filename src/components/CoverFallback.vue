<script setup lang="ts">
/**
 * 封面加载失败时的占位：和播放栏同款的像素眼睛，眉眼低垂。
 * 不复用 RobotEyes —— 它每个实例都跑一个逐帧循环并跟随指针，封面墙上可能同时有几十个占位。
 */
const EYES = [0, 4]

/** 每个占位眨眼的节奏和相位都随机，避免整面墙同步眨眼 */
const blink = {
  '--blink-dur': `${(4.5 + Math.random() * 3.5).toFixed(2)}s`,
  '--blink-delay': `${(-Math.random() * 8).toFixed(2)}s`,
}
</script>

<template>
  <div class="cf" :style="blink" aria-hidden="true">
    <svg class="cf-eyes" viewBox="-1 -1 8 9" shape-rendering="crispEdges">
      <g v-for="x in EYES" :key="x">
        <!-- 眉毛内高外低 -->
        <rect :x="x === 0 ? 0 : 5" y="1" width="1" height="1" class="cf-brow" />
        <rect :x="x === 0 ? 1 : 4" y="0" width="1" height="1" class="cf-brow" />
        <g class="cf-eye">
          <rect :x="x" y="3" width="2" height="4" class="cf-ball" />
          <rect :x="x + 0.6" y="5.4" width="0.8" height="0.8" class="cf-pupil" />
        </g>
      </g>
    </svg>
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

.cf-eyes {
  width: 30cqmin;
  overflow: visible;
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 45%, transparent));
}

.cf-brow,
.cf-ball {
  fill: currentColor;
}

.cf-brow {
  opacity: 0.7;
}

.cf-pupil {
  fill: var(--bg-2);
}

.cf-eye {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: cf-blink var(--blink-dur) var(--blink-delay) infinite steps(1, end);
}

@keyframes cf-blink {
  0%,
  95%,
  100% {
    transform: none;
  }
  96% {
    transform: scaleY(0.5);
  }
  97% {
    transform: scaleY(0.15);
  }
  98% {
    transform: scaleY(0.5);
  }
}

.cf-text {
  margin-top: 7cqmin;
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.15em;
  color: currentColor;
  opacity: 0.6;
  white-space: nowrap;
}

@container (min-width: 360px) {
  .cf-text {
    font-size: 16px;
  }
}

@container (max-width: 96px) {
  .cf-text {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cf-eye {
    animation: none;
  }
}
</style>
