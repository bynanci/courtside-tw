<script setup lang="ts">
const props = defineProps<{ payload: Record<string, unknown> }>()
</script>

<template>
  <div
    :class="['article-divider', { 'article-divider--space': props.payload.style === 'space' }]"
    role="separator"
  />
</template>
