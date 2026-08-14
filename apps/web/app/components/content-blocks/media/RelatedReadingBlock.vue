<script setup lang="ts">
import { stringValue } from "../rendering"

type Props = {
  payload: Record<string, unknown>
  relatedArticleHref: (value: unknown) => string | null
}

const props = defineProps<Props>()
const href = computed(() => props.relatedArticleHref(props.payload.articleSlug))
</script>

<template>
  <aside class="article-related">
    <p class="eyebrow">Related reading</p>
    <NuxtLink v-if="href" :to="href">{{ stringValue(props.payload.label) }}</NuxtLink>
    <span v-else>{{ stringValue(props.payload.label) }}</span>
  </aside>
</template>
