<script setup lang="ts">
import { inlineRuns } from "../rendering"
import InlineContent from "./InlineContent.vue"

const props = defineProps<{ payload: Record<string, unknown> }>()
</script>

<template>
  <p class="article-paragraph"><InlineContent :runs="inlineRuns(props.payload.content)" /></p>
</template>
