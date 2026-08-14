<script setup lang="ts">
import { listItems } from "../rendering"
import InlineContent from "./InlineContent.vue"

const props = defineProps<{ payload: Record<string, unknown> }>()
</script>

<template>
  <component :is="props.payload.ordered === true ? 'ol' : 'ul'">
    <li v-for="(runs, index) in listItems(props.payload.items)" :key="index">
      <InlineContent :runs="runs" />
    </li>
  </component>
</template>
