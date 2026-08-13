<script setup lang="ts">
import { galleryItems, mediaFallbackStyle } from "../rendering"

type Props = {
  blockId: string
  payload: Record<string, unknown>
  getAssetUrl: (assetId: unknown, variant?: string) => string
  getAssetWidth: (assetId: unknown, variant?: string) => number | undefined
  getAssetHeight: (assetId: unknown, variant?: string) => number | undefined
  getAssetAttribution: (assetId: unknown, variant?: string, payloadCredit?: unknown) => string
  isAssetFailed: (assetKey: string) => boolean
  markAssetFailed: (assetKey: string) => void
}

const props = defineProps<Props>()
const items = computed(() =>
  galleryItems(props.payload.items, props.getAssetWidth, props.getAssetHeight)
)
</script>

<template>
  <div
    class="article-gallery"
    :class="{ 'article-gallery--stack': props.payload.layout === 'stack' }"
  >
    <figure v-for="(item, index) in items" :key="`${props.blockId}:${item.assetId}:${index}`">
      <img
        v-if="
          props.getAssetUrl(item.assetId, 'inline') &&
          !props.isAssetFailed(`${props.blockId}-${index}`)
        "
        :src="props.getAssetUrl(item.assetId, 'inline')"
        :alt="item.altText"
        :width="item.width"
        :height="item.height"
        loading="lazy"
        decoding="async"
        @error="props.markAssetFailed(`${props.blockId}-${index}`)"
      />
      <div
        v-else
        class="article-image-fallback"
        :style="mediaFallbackStyle(item.width, item.height)"
        role="img"
        :aria-label="item.altText"
      >
        <p>圖片備援：{{ item.altText }}</p>
      </div>
      <figcaption
        v-if="item.caption || props.getAssetAttribution(item.assetId, 'inline', item.credit)"
      >
        <span v-if="item.caption">{{ item.caption }}</span>
        <small
          v-if="props.getAssetAttribution(item.assetId, 'inline', item.credit)"
          class="article-media-credit"
          data-testid="article-media-attribution"
        >
          {{ props.getAssetAttribution(item.assetId, "inline", item.credit) }}
        </small>
      </figcaption>
    </figure>
  </div>
</template>
