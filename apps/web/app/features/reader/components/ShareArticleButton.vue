<script setup lang="ts">
import { useNuxtApp } from "#app"
import { ref } from "vue"

import { performArticleShare } from "../share"

const props = defineProps<{ title: string; canonicalUrl: string; clientReady: boolean }>()
const { $analytics } = useNuxtApp()
const status = ref("")

async function shareArticle(): Promise<void> {
  const hasNativeShare = typeof navigator.share === "function"
  const hasClipboard = typeof navigator.clipboard?.writeText === "function"
  const sharePromise = performArticleShare(
    { title: props.title, url: props.canonicalUrl },
    {
      ...(hasNativeShare ? { share: navigator.share.bind(navigator) } : {}),
      ...(hasClipboard
        ? { writeText: navigator.clipboard.writeText.bind(navigator.clipboard) }
        : {})
    }
  )
  if (hasNativeShare) {
    void $analytics.trackShareStarted("article", "native_share")
  } else if (hasClipboard) {
    void $analytics.trackShareStarted("article", "copy_link")
  }
  const result = await sharePromise
  status.value = result.message
}
</script>

<template>
  <div class="article-share-actions">
    <button
      type="button"
      data-testid="article-share"
      class="button-link button-link--quiet"
      :disabled="!props.clientReady"
      :aria-disabled="!props.clientReady"
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
