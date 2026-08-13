<script setup lang="ts">
import { onMounted, ref } from "vue"

import { numberValue, stringValue } from "../rendering"
import P5CanvasHost from "./P5CanvasHost.vue"

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

const runtimeEnabled = computed(
  () => props.clientReady && props.interactiveEnabled && (!saveData.value || manualOverride.value)
)
const posterWidth = computed(() => props.getAssetWidth(props.payload.posterAssetId, "wide"))
const posterHeight = computed(() => props.getAssetHeight(props.payload.posterAssetId, "wide"))
const posterAttribution = computed(() =>
  props.getAssetAttribution(props.payload.posterAssetId, "wide", props.payload.credit)
)

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
    <button
      v-if="props.clientReady && (!props.interactiveEnabled || saveData) && !manualOverride"
      type="button"
      class="button-link creative-enable"
      data-testid="creative-enable"
      @click="enable"
    >
      顯示互動視覺
    </button>
    <div
      data-testid="generative-canvas"
      :data-creative-block-id="props.blockId"
      :data-seed="String(numberValue(props.payload.seed))"
      :data-runtime-enabled="String(runtimeEnabled)"
      role="group"
      :aria-label="stringValue(props.payload.altText)"
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
