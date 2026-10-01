<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from "vue"

import { numberValue, stringValue } from "../rendering"

// The SSR poster and summary stay synchronous. Only the trusted local canvas
// host is resolved after runtimeEnabled becomes true on the client; no content
// value participates in module resolution.
const P5CanvasHost = defineAsyncComponent(() => import("./P5CanvasHost.vue"))

type Props = {
  blockId: string
  articleRevisionId: string
  payload: Record<string, unknown>
  clientReady: boolean
  motionMode: "reduced" | "full"
  interactiveEnabled: boolean
  getAssetUrl: (assetId: unknown, variant?: string) => string
  getAssetWidth: (assetId: unknown, variant?: string) => number | undefined
  getAssetHeight: (assetId: unknown, variant?: string) => number | undefined
  getAssetAttribution: (assetId: unknown, variant?: string, payloadCredit?: unknown) => string
  isAssetFailed: (assetKey: string) => boolean
  markAssetFailed: (assetKey: string) => void
  enableCreative: () => void | Promise<void>
}

const props = defineProps<Props>()
const saveData = ref(false)
const manualOverride = ref(false)
// A recap's public media projection is the current rights decision. Never keep
// displaying its derived values after that projection is withdrawn/unavailable.
const presentationAvailable = computed(
  () =>
    props.payload.presetId !== "season-recap-v1" ||
    Boolean(props.getAssetUrl(props.payload.posterAssetId, "wide"))
)

const runtimeEnabled = computed(
  () =>
    presentationAvailable.value &&
    props.clientReady &&
    props.interactiveEnabled &&
    (!saveData.value || manualOverride.value)
)
const posterWidth = computed(() => props.getAssetWidth(props.payload.posterAssetId, "wide"))
const posterHeight = computed(() => props.getAssetHeight(props.payload.posterAssetId, "wide"))
const posterAttribution = computed(() =>
  props.getAssetAttribution(props.payload.posterAssetId, "wide", props.payload.credit)
)
const creativeControlLabel = computed(() => {
  const altText = stringValue(props.payload.altText).trim()
  return altText ? `顯示互動視覺：${altText}` : "顯示互動視覺"
})

async function enable(): Promise<void> {
  manualOverride.value = true
  await props.enableCreative()
}

onMounted(() => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  saveData.value = connection?.saveData === true
})
</script>

<template>
  <section class="article-generative">
    <figure
      v-if="presentationAvailable"
      data-testid="generative-poster"
      data-fallback="true"
      class="article-generative-fallback"
    >
      <img
        v-if="
          props.getAssetUrl(props.payload.posterAssetId, 'wide') &&
          !props.isAssetFailed(`${props.blockId}-poster`)
        "
        data-testid="generative-poster-image"
        class="article-generative-poster"
        :src="props.getAssetUrl(props.payload.posterAssetId, 'wide')"
        :alt="stringValue(props.payload.altText)"
        :width="posterWidth"
        :height="posterHeight"
        loading="lazy"
        decoding="async"
        @error="props.markAssetFailed(`${props.blockId}-poster`)"
      />
      <div
        v-else
        class="article-generative-poster-placeholder"
        role="img"
        :aria-label="stringValue(props.payload.altText)"
      >
        {{ stringValue(props.payload.altText) }}
      </div>
      <figcaption>
        <span>{{ stringValue(props.payload.dataSummary) }}</span>
        <small
          v-if="posterAttribution"
          class="article-media-credit"
          data-testid="article-media-attribution"
        >
          {{ posterAttribution }}
        </small>
      </figcaption>
    </figure>
    <p v-else data-testid="recap-unavailable">此賽季回顧目前無法顯示。</p>
    <button
      v-if="
        presentationAvailable &&
        props.clientReady &&
        (!props.interactiveEnabled || saveData) &&
        !manualOverride
      "
      type="button"
      class="button-link creative-enable"
      data-testid="creative-enable"
      :aria-label="creativeControlLabel"
      @click="enable"
    >
      顯示互動視覺
    </button>
    <div
      v-if="presentationAvailable"
      data-testid="generative-canvas"
      :data-creative-block-id="props.blockId"
      :data-seed="String(numberValue(props.payload.seed))"
      :data-runtime-enabled="String(runtimeEnabled)"
      aria-hidden="true"
    >
      <P5CanvasHost
        v-if="runtimeEnabled"
        :key="`${props.articleRevisionId}:${props.blockId}`"
        :owner-id="`${props.articleRevisionId}:${props.blockId}`"
        :preset-id="stringValue(props.payload.presetId)"
        :seed="numberValue(props.payload.seed)"
        :parameters="props.payload.parameters"
        :alt-text="stringValue(props.payload.altText)"
        :enabled="runtimeEnabled"
        :reduced-motion="props.motionMode === 'reduced'"
      />
      <span v-else data-testid="creative-runtime-placeholder">
        互動視覺預設停用；{{ stringValue(props.payload.dataSummary) }}
      </span>
    </div>
  </section>
</template>
