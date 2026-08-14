<script setup lang="ts">
import type { ContentRun } from "../rendering"

defineProps<{ runs: ContentRun[] }>()
</script>

<template>
  <template v-for="(run, index) in runs" :key="index">
    <a
      v-if="run.kind === 'link' && run.href"
      :href="run.href"
      rel="noreferrer noopener"
      target="_blank"
    >
      {{ run.text }}
    </a>
    <span v-else>{{ run.text }}</span>
  </template>
</template>
