<script setup lang="ts">
import { ref } from "vue"

import { performArticleShare } from "../share"

const props = defineProps<{ title: string; canonicalUrl: string; clientReady: boolean }>()
const status = ref("")

async function shareArticle(): Promise<void> {
  const result = await performArticleShare(
    { title: props.title, url: props.canonicalUrl },
    {
      ...(typeof navigator.share === "function" ? { share: navigator.share.bind(navigator) } : {}),
      ...(navigator.clipboard?.writeText
        ? { writeText: navigator.clipboard.writeText.bind(navigator.clipboard) }
        : {})
    }
  )
  status.value = result.message
}
</script>

<template>
  <div class="article-share-actions">
    <button
      v-if="props.clientReady"
      type="button"
      data-testid="article-share"
      class="button-link button-link--quiet"
      @click="shareArticle"
    >
      分享文章
    </button>
    <a :href="props.canonicalUrl" data-testid="article-share-fallback" class="text-link">
      開啟文章連結
    </a>
    <span v-if="status" data-testid="share-status" role="status">{{ status }}</span>
  </div>
</template>
