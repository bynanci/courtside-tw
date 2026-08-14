<script setup lang="ts">
import { stringValue } from "../rendering"

const props = defineProps<{ payload: Record<string, unknown> }>()
</script>

<template>
  <aside class="article-stat" :aria-label="stringValue(props.payload.label)">
    <strong>{{ stringValue(props.payload.label) }}</strong>
    <span>{{ stringValue(props.payload.value) }}</span>
    <small>{{ stringValue(props.payload.unit) }}</small>
    <p>{{ stringValue(props.payload.context) }}</p>
  </aside>
</template>
