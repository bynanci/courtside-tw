<script setup lang="ts">
import { mediaFallbackStyle, stringValue } from "../rendering"

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
const variant = computed(() => stringValue(props.payload.variant) || "inline")
const url = computed(() => props.getAssetUrl(props.payload.assetId, variant.value))
const attribution = computed(() =>
  props.getAssetAttribution(props.payload.assetId, variant.value, props.payload.credit)
)
const width = computed(() => props.getAssetWidth(props.payload.assetId, variant.value))
const height = computed(() => props.getAssetHeight(props.payload.assetId, variant.value))
</script>

<template>
  <figure class="article-image">
    <img
      v-if="url && !props.isAssetFailed(props.blockId)"
      :src="url"
      :alt="stringValue(props.payload.altText)"
      :width="width"
      :height="height"
      loading="lazy"
      decoding="async"
      @error="props.markAssetFailed(props.blockId)"
    />
    <div
      v-else
      data-testid="article-image-fallback"
      class="article-image-fallback"
      :style="mediaFallbackStyle(width, height)"
      role="img"
      :aria-label="stringValue(props.payload.altText)"
    >
      <p>圖片目前無法載入，文字備援：{{ stringValue(props.payload.altText) }}</p>
    </div>
    <figcaption v-if="props.payload.caption || attribution">
      <span v-if="props.payload.caption">{{ stringValue(props.payload.caption) }}</span>
      <small
        v-if="attribution"
        class="article-media-credit"
        data-testid="article-media-attribution"
      >
        {{ attribution }}
      </small>
    </figcaption>
  </figure>
</template>
