<script setup lang="ts">
import { stringValue } from "../rendering"

const props = defineProps<{ payload: Record<string, unknown> }>()
</script>

<template>
  <section class="article-video" aria-label="影片內容">
    <p class="eyebrow">Video</p>
    <h3>{{ stringValue(props.payload.title) }}</h3>
    <p>影片權利尚未開放；本頁保留可理解的文字內容。</p>
    <p v-if="props.payload.caption">{{ stringValue(props.payload.caption) }}</p>
  </section>
</template>
