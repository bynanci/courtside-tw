<script setup lang="ts">
defineProps<{ percent: number; motionMode: "full" | "reduced" }>()
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
    <svg
      class="reading-progress__graphic"
      viewBox="0 0 100 1"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect class="reading-progress__track" width="100" height="1" />
      <rect class="reading-progress__bar" :width="percent" height="1" />
    </svg>
    <span class="sr-only">已閱讀 {{ percent }}%</span>
  </div>
</template>
