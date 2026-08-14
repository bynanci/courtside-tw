<script setup lang="ts">
import { readerMotion } from "../../motion/reader-motion"

const props = defineProps<{ percent: number; motionMode: "full" | "reduced" }>()
const barStyle = computed(() => ({
  transform: `scaleX(${props.percent / 100})`,
  transitionDuration: `${readerMotion.readingProgress[props.motionMode].durationMs}ms`
}))
</script>

<template>
  <div
    class="reading-progress"
    data-testid="article-reading-progress"
    role="progressbar"
    aria-label="文章閱讀進度"
    aria-live="off"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    :data-motion="motionMode"
  >
    <span class="reading-progress__bar" :style="barStyle" />
    <span class="sr-only">已閱讀 {{ percent }}%</span>
  </div>
</template>
