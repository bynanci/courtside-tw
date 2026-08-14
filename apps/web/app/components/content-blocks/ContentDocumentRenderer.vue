<script setup lang="ts">
import { onMounted, watch } from "vue"

import GenerativeCanvasBlock from "./creative/GenerativeCanvasBlock.vue"
import GalleryBlock from "./media/GalleryBlock.vue"
import ImageBlock from "./media/ImageBlock.vue"
import RelatedReadingBlock from "./media/RelatedReadingBlock.vue"
import StatBlock from "./media/StatBlock.vue"
import VideoBlock from "./media/VideoBlock.vue"
import {
  getSafeFallbackPosterAssetId,
  getSafeFallbackSummary,
  resolveContentBlockRenderer,
  type ContentBlock,
  type ContentBlockTelemetry
} from "./registry"
import { stringValue } from "./rendering"
import DividerBlock from "./text/DividerBlock.vue"
import HeadingBlock from "./text/HeadingBlock.vue"
import ListBlock from "./text/ListBlock.vue"
import ParagraphBlock from "./text/ParagraphBlock.vue"
import QuoteBlock from "./text/QuoteBlock.vue"

type Props = {
  blocks: ContentBlock[]
  articleRevisionId: string
  clientReady: boolean
  motionMode: "reduced" | "full"
  interactiveEnabled: boolean
  getAssetUrl: (assetId: unknown, variant?: string) => string
  getAssetWidth: (assetId: unknown, variant?: string) => number | undefined
  getAssetHeight: (assetId: unknown, variant?: string) => number | undefined
  getAssetAttribution: (assetId: unknown, variant?: string, payloadCredit?: unknown) => string
  isAssetFailed: (assetKey: string) => boolean
  markAssetFailed: (assetKey: string) => void
  relatedArticleHref: (value: unknown) => string | null
  enableCreative: () => void | Promise<void>
}

const props = defineProps<Props>()
const emit = defineEmits<{ telemetry: [event: ContentBlockTelemetry] }>()
const reportedFallbacks = new Set<string>()

function rendererFor(block: ContentBlock) {
  const resolution = resolveContentBlockRenderer(block)
  return resolution.kind === "renderer" ? resolution.renderer : null
}

function fallbackReasonFor(block: ContentBlock) {
  const resolution = resolveContentBlockRenderer(block)
  return resolution.kind === "fallback" ? resolution.reason : "unknown-block-type"
}

function fallbackTelemetryCodeFor(block: ContentBlock) {
  const resolution = resolveContentBlockRenderer(block)
  return resolution.kind === "fallback"
    ? resolution.telemetryCode
    : "CONTENT_BLOCK_RENDERER_UNKNOWN_TYPE"
}

function fallbackPosterUrl(block: ContentBlock): string {
  const assetId = fallbackPosterAssetId(block)
  return assetId ? props.getAssetUrl(assetId, "wide") : ""
}

function fallbackPosterAssetId(block: ContentBlock): string | null {
  return getSafeFallbackPosterAssetId(block.payload)
}

function fallbackPosterAttribution(block: ContentBlock): string {
  const assetId = fallbackPosterAssetId(block)
  return assetId ? props.getAssetAttribution(assetId, "wide", block.payload.credit) : ""
}

function reportFallbacks(): void {
  for (const block of props.blocks) {
    const resolution = resolveContentBlockRenderer(block)
    if (resolution.kind !== "fallback") continue
    const key = [block.id, block.type, block.version, resolution.telemetryCode].join(":")
    if (reportedFallbacks.has(key)) continue
    reportedFallbacks.add(key)
    emit("telemetry", {
      code: resolution.telemetryCode,
      blockId: block.id,
      blockType: block.type,
      blockVersion: block.version,
      reason: resolution.reason
    })
  }
}

onMounted(reportFallbacks)
watch(() => props.blocks, reportFallbacks)
</script>

<template>
  <section
    v-for="block in props.blocks"
    :id="`block-${block.id}`"
    :key="block.id"
    class="article-block"
    :data-block-id="block.id"
    :data-block-type="block.type"
  >
    <ParagraphBlock v-if="rendererFor(block) === 'paragraph'" :payload="block.payload" />
    <HeadingBlock v-else-if="rendererFor(block) === 'heading'" :payload="block.payload" />
    <ListBlock v-else-if="rendererFor(block) === 'list'" :payload="block.payload" />
    <QuoteBlock v-else-if="rendererFor(block) === 'quote'" :payload="block.payload" />
    <DividerBlock v-else-if="rendererFor(block) === 'divider'" :payload="block.payload" />
    <ImageBlock
      v-else-if="rendererFor(block) === 'image'"
      :block-id="block.id"
      :payload="block.payload"
      :get-asset-url="props.getAssetUrl"
      :get-asset-width="props.getAssetWidth"
      :get-asset-height="props.getAssetHeight"
      :get-asset-attribution="props.getAssetAttribution"
      :is-asset-failed="props.isAssetFailed"
      :mark-asset-failed="props.markAssetFailed"
    />
    <GalleryBlock
      v-else-if="rendererFor(block) === 'gallery'"
      :block-id="block.id"
      :payload="block.payload"
      :get-asset-url="props.getAssetUrl"
      :get-asset-width="props.getAssetWidth"
      :get-asset-height="props.getAssetHeight"
      :get-asset-attribution="props.getAssetAttribution"
      :is-asset-failed="props.isAssetFailed"
      :mark-asset-failed="props.markAssetFailed"
    />
    <StatBlock v-else-if="rendererFor(block) === 'stat'" :payload="block.payload" />
    <VideoBlock v-else-if="rendererFor(block) === 'video'" :payload="block.payload" />
    <RelatedReadingBlock
      v-else-if="rendererFor(block) === 'related-reading'"
      :payload="block.payload"
      :related-article-href="props.relatedArticleHref"
    />
    <GenerativeCanvasBlock
      v-else-if="rendererFor(block) === 'generative-canvas'"
      :block-id="block.id"
      :article-revision-id="props.articleRevisionId"
      :payload="block.payload"
      :client-ready="props.clientReady"
      :motion-mode="props.motionMode"
      :interactive-enabled="props.interactiveEnabled"
      :get-asset-url="props.getAssetUrl"
      :get-asset-width="props.getAssetWidth"
      :get-asset-height="props.getAssetHeight"
      :get-asset-attribution="props.getAssetAttribution"
      :is-asset-failed="props.isAssetFailed"
      :mark-asset-failed="props.markAssetFailed"
      :enable-creative="props.enableCreative"
    />
    <aside
      v-else
      class="content-block-fallback"
      data-testid="content-block-fallback"
      data-fallback="true"
      :data-fallback-reason="fallbackReasonFor(block)"
      :data-telemetry-code="fallbackTelemetryCodeFor(block)"
      role="group"
      aria-label="內容區塊備援"
    >
      <img
        v-if="fallbackPosterUrl(block) && !props.isAssetFailed(`${block.id}-fallback-poster`)"
        :src="fallbackPosterUrl(block)"
        :alt="stringValue(block.payload.altText) || '內容區塊 poster'"
        :width="props.getAssetWidth(fallbackPosterAssetId(block), 'wide')"
        :height="props.getAssetHeight(fallbackPosterAssetId(block), 'wide')"
        class="content-block-fallback__poster"
        loading="lazy"
        decoding="async"
        data-testid="content-block-fallback-poster"
        @error="props.markAssetFailed(`${block.id}-fallback-poster`)"
      />
      <p data-testid="content-block-fallback-summary">
        {{ getSafeFallbackSummary(block.payload) }}
      </p>
      <small
        v-if="fallbackPosterAttribution(block)"
        class="article-media-credit"
        data-testid="article-media-attribution"
      >
        {{ fallbackPosterAttribution(block) }}
      </small>
      <span class="sr-only">{{ fallbackTelemetryCodeFor(block) }}</span>
    </aside>
  </section>
</template>
