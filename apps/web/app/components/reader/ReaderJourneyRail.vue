<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    activeStep: 1 | 2 | 3
    tone?: "hero" | "paper"
  }>(),
  { tone: "paper" }
)

const steps = [
  { number: "01", label: "封面" },
  { number: "02", label: "目錄" },
  { number: "03", label: "閱讀" }
] as const
</script>

<template>
  <ol class="reader-journey" :data-tone="props.tone" aria-label="閱讀旅程">
    <li
      v-for="(step, index) in steps"
      :key="step.number"
      class="reader-journey__step"
      :class="{ 'reader-journey__step--active': index + 1 === props.activeStep }"
      :aria-current="index + 1 === props.activeStep ? 'step' : undefined"
    >
      <span class="reader-journey__node" aria-hidden="true">{{ step.number }}</span>
      <span class="reader-journey__label">{{ step.label }}</span>
    </li>
  </ol>
</template>
