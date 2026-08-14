<script setup lang="ts">
import { inlineRuns, stringValue } from "../rendering"
import InlineContent from "./InlineContent.vue"

const props = defineProps<{ payload: Record<string, unknown> }>()
</script>

<template>
  <blockquote>
    <p><InlineContent :runs="inlineRuns(props.payload.content)" /></p>
    <cite v-if="props.payload.attribution">{{ stringValue(props.payload.attribution) }}</cite>
  </blockquote>
</template>
