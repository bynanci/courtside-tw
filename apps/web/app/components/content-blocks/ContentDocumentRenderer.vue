<script setup lang="ts">
import { onMounted, watch } from "vue"

import CourtPulseRuntime from "../article/CourtPulseRuntime.vue"
import {
  getSafeFallbackPosterAssetId,
  getSafeFallbackSummary,
  resolveContentBlockRenderer,
  type ContentBlock,
  type ContentBlockTelemetry
} from "./registry"

type ContentRun = {
  kind: "text" | "link"
  text: string
  href?: string
}

type GalleryItem = {
  assetId: string
  altText: string
  caption?: string
  credit?: string
}

type CourtPulseParameters = {
  density: number
  tempo: number
  lineWeight: number
  paletteId: "court-dusk"
  numericSequence: number[]
}

type Props = {
  blocks: ContentBlock[]
  articleRevisionId: string
  clientReady: boolean
  motionMode: "reduced" | "full"
  interactiveEnabled: boolean
  getAssetUrl: (assetId: unknown, variant?: string) => string
  getAssetWidth: (assetId: unknown, variant?: string) => number | undefined
  getAssetHeight: (assetId: unknown, variant?: string) => number | undefined
  isAssetFailed: (assetKey: string) => boolean
  markAssetFailed: (assetKey: string) => void
  relatedArticleHref: (value: unknown) => string | null
  enableCreative: () => void | Promise<void>
  runtimeStateFor: (blockId: string) => "paused" | "running"
  canvasParameters: (value: unknown) => CourtPulseParameters
  renderHash: (block: ContentBlock) => string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  telemetry: [event: ContentBlockTelemetry]
}>()

const reportedFallbacks = new Set<string>()

function payloadFor(block: ContentBlock): Record<string, unknown> {
  return block.payload
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function inlineRuns(value: unknown): ContentRun[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry): ContentRun[] => {
    if (!isRecord(entry) || typeof entry.text !== "string") {
      return []
    }
    if (entry.kind === "link" && typeof entry.href === "string") {
      return [{ kind: "link", text: entry.text, href: entry.href }]
    }
    if (entry.kind === "text") {
      return [{ kind: "text", text: entry.text }]
    }
    return []
  })
}

function listItems(value: unknown): ContentRun[][] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => (isRecord(item) ? inlineRuns(item.content) : []))
}

function galleryItems(value: unknown): GalleryItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): GalleryItem[] => {
    if (!isRecord(item) || typeof item.assetId !== "string" || typeof item.altText !== "string") {
      return []
    }
    return [
      {
        assetId: item.assetId,
        altText: item.altText,
        ...(typeof item.caption === "string" ? { caption: item.caption } : {}),
        ...(typeof item.credit === "string" ? { credit: item.credit } : {})
      }
    ]
  })
}

function safeInlineHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value.includes("\u0000")) {
    return null
  }
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(value)) {
    return value
  }
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function headingTag(value: unknown): "h2" | "h3" | "h4" {
  const level = numberValue(value, 2)
  return level === 4 ? "h4" : level === 3 ? "h3" : "h2"
}

function listTag(value: unknown): "ol" | "ul" {
  return value === true ? "ol" : "ul"
}

function dividerClass(value: unknown): string {
  return value === "space" ? "article-divider article-divider--space" : "article-divider"
}

function resolutionFor(block: ContentBlock) {
  return resolveContentBlockRenderer(block)
}

function rendererFor(block: ContentBlock) {
  const resolution = resolutionFor(block)
  return resolution.kind === "renderer" ? resolution.renderer : null
}

function fallbackReasonFor(block: ContentBlock) {
  const resolution = resolutionFor(block)
  return resolution.kind === "fallback" ? resolution.reason : "unknown-block-type"
}

function fallbackTelemetryCodeFor(block: ContentBlock) {
  const resolution = resolutionFor(block)
  return resolution.kind === "fallback"
    ? resolution.telemetryCode
    : "CONTENT_BLOCK_RENDERER_UNKNOWN_TYPE"
}

function fallbackPosterUrl(block: ContentBlock): string {
  const assetId = getSafeFallbackPosterAssetId(payloadFor(block))
  return assetId ? props.getAssetUrl(assetId, "wide") : ""
}

function fallbackTelemetryKey(block: ContentBlock, code: string): string {
  return [block.id, block.type, block.version, code].join(":")
}

function reportFallbacks(): void {
  for (const block of props.blocks) {
    const resolution = resolutionFor(block)
    if (resolution.kind !== "fallback") {
      continue
    }
    const key = fallbackTelemetryKey(block, resolution.telemetryCode)
    if (reportedFallbacks.has(key)) {
      continue
    }
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
    :id="'block-' + block.id"
    :key="block.id"
    class="article-block"
    :data-block-id="block.id"
    :data-block-type="block.type"
  >
    <template v-if="rendererFor(block) !== null">
      <p v-if="rendererFor(block) === 'paragraph'" class="article-paragraph">
        <template v-for="(run, runIndex) in inlineRuns(payloadFor(block).content)" :key="runIndex">
          <a
            v-if="run.kind === 'link' && safeInlineHref(run.href)"
            :href="safeInlineHref(run.href) ?? '#'"
            rel="noreferrer noopener"
            target="_blank"
            >{{ run.text }}</a
          >
          <span v-else>{{ run.text }}</span>
        </template>
      </p>

      <component
        :is="headingTag(payloadFor(block).level)"
        v-else-if="rendererFor(block) === 'heading'"
      >
        {{ stringValue(payloadFor(block).text) }}
      </component>

      <component :is="listTag(payloadFor(block).ordered)" v-else-if="rendererFor(block) === 'list'">
        <li v-for="(runs, itemIndex) in listItems(payloadFor(block).items)" :key="itemIndex">
          <template v-for="(run, runIndex) in runs" :key="runIndex">
            <a
              v-if="run.kind === 'link' && safeInlineHref(run.href)"
              :href="safeInlineHref(run.href) ?? '#'"
              rel="noreferrer noopener"
              target="_blank"
              >{{ run.text }}</a
            >
            <span v-else>{{ run.text }}</span>
          </template>
        </li>
      </component>

      <blockquote v-else-if="rendererFor(block) === 'quote'">
        <p>
          <template
            v-for="(run, runIndex) in inlineRuns(payloadFor(block).content)"
            :key="runIndex"
          >
            <a
              v-if="run.kind === 'link' && safeInlineHref(run.href)"
              :href="safeInlineHref(run.href) ?? '#'"
              rel="noreferrer noopener"
              target="_blank"
              >{{ run.text }}</a
            >
            <span v-else>{{ run.text }}</span>
          </template>
        </p>
        <cite v-if="payloadFor(block).attribution">{{
          stringValue(payloadFor(block).attribution)
        }}</cite>
      </blockquote>

      <div
        v-else-if="rendererFor(block) === 'divider'"
        :class="dividerClass(payloadFor(block).style)"
        aria-hidden="true"
      />

      <figure v-else-if="rendererFor(block) === 'image'" class="article-image">
        <img
          v-if="
            props.getAssetUrl(
              payloadFor(block).assetId,
              stringValue(payloadFor(block).variant) || 'inline'
            )
          "
          :src="
            props.getAssetUrl(
              payloadFor(block).assetId,
              stringValue(payloadFor(block).variant) || 'inline'
            )
          "
          :alt="stringValue(payloadFor(block).altText)"
          :width="
            props.getAssetWidth(
              payloadFor(block).assetId,
              stringValue(payloadFor(block).variant) || 'inline'
            )
          "
          :height="
            props.getAssetHeight(
              payloadFor(block).assetId,
              stringValue(payloadFor(block).variant) || 'inline'
            )
          "
          loading="lazy"
          @error="props.markAssetFailed(block.id)"
        />
        <figcaption
          v-if="props.isAssetFailed(block.id)"
          data-testid="article-image-fallback"
          class="article-image-fallback"
        >
          圖片目前無法載入，已保留文字備援：{{ stringValue(payloadFor(block).altText) }}
        </figcaption>
        <figcaption v-if="payloadFor(block).caption">
          {{ stringValue(payloadFor(block).caption) }}
        </figcaption>
      </figure>

      <div
        v-else-if="rendererFor(block) === 'gallery'"
        class="article-gallery"
        :class="{ 'article-gallery--stack': payloadFor(block).layout === 'stack' }"
      >
        <figure
          v-for="(item, itemIndex) in galleryItems(payloadFor(block).items)"
          :key="block.id + '-' + itemIndex"
        >
          <img
            v-if="props.getAssetUrl(item.assetId, 'inline')"
            :src="props.getAssetUrl(item.assetId, 'inline')"
            :alt="item.altText"
            loading="lazy"
            @error="props.markAssetFailed(block.id + '-' + itemIndex)"
          />
          <figcaption v-if="props.isAssetFailed(block.id + '-' + itemIndex)">
            圖片備援：{{ item.altText }}
          </figcaption>
          <figcaption v-else-if="item.caption">
            {{ item.caption }}
          </figcaption>
        </figure>
      </div>

      <aside v-else-if="rendererFor(block) === 'stat'" class="article-stat">
        <strong>{{ stringValue(payloadFor(block).label) }}</strong>
        <span>{{ stringValue(payloadFor(block).value) }}</span>
        <small>{{ stringValue(payloadFor(block).unit) }}</small>
        <p>{{ stringValue(payloadFor(block).context) }}</p>
      </aside>

      <section v-else-if="rendererFor(block) === 'video'" class="article-video">
        <p class="eyebrow">Video</p>
        <h3>{{ stringValue(payloadFor(block).title) }}</h3>
        <p>影片權利尚未開放；本頁保留可理解的文字內容。</p>
        <p v-if="payloadFor(block).caption">
          {{ stringValue(payloadFor(block).caption) }}
        </p>
      </section>

      <aside v-else-if="rendererFor(block) === 'related-reading'" class="article-related">
        <p class="eyebrow">Related reading</p>
        <NuxtLink
          v-if="props.relatedArticleHref(payloadFor(block).articleSlug)"
          :to="props.relatedArticleHref(payloadFor(block).articleSlug) ?? '/issues'"
        >
          {{ stringValue(payloadFor(block).label) }}
        </NuxtLink>
      </aside>

      <section v-else-if="rendererFor(block) === 'generative-canvas'" class="article-generative">
        <div
          data-testid="generative-poster"
          data-fallback="true"
          role="img"
          :aria-label="stringValue(payloadFor(block).altText)"
        >
          <img
            v-if="
              props.getAssetUrl(payloadFor(block).posterAssetId, 'wide') &&
              !props.isAssetFailed(block.id + '-poster')
            "
            data-testid="generative-poster-image"
            class="article-generative-poster"
            :src="props.getAssetUrl(payloadFor(block).posterAssetId, 'wide')"
            :alt="stringValue(payloadFor(block).altText)"
            loading="lazy"
            @error="props.markAssetFailed(block.id + '-poster')"
          />
          <span>{{ stringValue(payloadFor(block).dataSummary) }}</span>
        </div>
        <button
          v-if="props.clientReady && props.motionMode === 'reduced' && !props.interactiveEnabled"
          type="button"
          class="button-link creative-enable"
          data-testid="creative-enable"
          @click="props.enableCreative"
        >
          顯示互動視覺
        </button>
        <div
          data-testid="generative-canvas"
          :data-creative-block-id="block.id"
          :data-seed="String(numberValue(payloadFor(block).seed))"
          :data-render-hash="props.renderHash(block)"
          :data-runtime-state="props.runtimeStateFor(block.id)"
          :data-runtime-enabled="String(props.interactiveEnabled)"
          role="img"
          :aria-label="stringValue(payloadFor(block).altText)"
        >
          <CourtPulseRuntime
            v-if="props.interactiveEnabled"
            :key="props.articleRevisionId + ':' + block.id"
            :seed="numberValue(payloadFor(block).seed)"
            :parameters="props.canvasParameters(payloadFor(block).parameters)"
            :alt-text="stringValue(payloadFor(block).altText)"
            :active="props.interactiveEnabled"
            :paused="props.runtimeStateFor(block.id) !== 'running'"
            :reduced-motion="props.motionMode === 'reduced'"
          />
          <span v-else data-testid="creative-runtime-placeholder">
            互動視覺預設停用；{{ stringValue(payloadFor(block).dataSummary) }}
          </span>
        </div>
        <p>{{ stringValue(payloadFor(block).dataSummary) }}</p>
      </section>
    </template>

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
        v-if="fallbackPosterUrl(block) && !props.isAssetFailed(block.id + '-fallback-poster')"
        :src="fallbackPosterUrl(block)"
        :alt="stringValue(payloadFor(block).altText) || '內容區塊 poster'"
        loading="lazy"
        data-testid="content-block-fallback-poster"
        @error="props.markAssetFailed(block.id + '-fallback-poster')"
      />
      <p data-testid="content-block-fallback-summary">
        {{ getSafeFallbackSummary(payloadFor(block)) }}
      </p>
      <span class="sr-only">{{ fallbackTelemetryCodeFor(block) }}</span>
    </aside>
  </section>
</template>
