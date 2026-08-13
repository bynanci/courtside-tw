<script setup lang="ts">
import { numberValue, stringValue } from "../rendering"

const props = defineProps<{ payload: Record<string, unknown> }>()

function headingTag(): "h2" | "h3" | "h4" {
  const level = numberValue(props.payload.level, 2)
  return level === 4 ? "h4" : level === 3 ? "h3" : "h2"
}
</script>

<template>
  <component :is="headingTag()">{{ stringValue(props.payload.text) }}</component>
</template>
