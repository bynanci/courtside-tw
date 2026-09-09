<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import {
  archiveStudioMedia,
  getPrivateMediaPreview,
  listStudioMedia,
  StudioApiError,
  type StudioMediaItem
} from "../studio-api"
import type { StudioRole } from "../studio-contract"
import {
  canArchiveLibraryMedia,
  mediaArchiveFeedback,
  mediaPreviewFallback
} from "./media-library-contract"

const props = defineProps<{ role: StudioRole }>()
const emit = defineEmits<{ select: [item: StudioMediaItem | null] }>()
const archived = ref(false)
const items = ref<StudioMediaItem[]>([])
const nextCursor = ref<string | null>(null)
const selected = ref<StudioMediaItem | null>(null)
const busy = ref(false)
const loading = ref(false)
const listError = ref("")
const feedback = ref("")
const previewUrl = ref("")
const previewLoading = ref(false)
let previewController: AbortController | null = null
let disposed = false
const canArchive = computed(() =>
  canArchiveLibraryMedia(selected.value, busy.value || loading.value)
)

function clearPreview() {
  previewController?.abort()
  previewController = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ""
  previewLoading.value = false
}

async function select(item: StudioMediaItem | null) {
  clearPreview()
  selected.value = item
  emit("select", item)
  if (!item || item.processingState !== "READY") return
  const controller = new AbortController()
  previewController = controller
  previewLoading.value = true
  try {
    const blob = await getPrivateMediaPreview(item.assetId, controller.signal, props.role)
    if (!controller.signal.aborted) previewUrl.value = URL.createObjectURL(blob)
  } catch {
    // The selected metadata and alt text remain visible when private storage is unavailable.
  } finally {
    if (!controller.signal.aborted) previewLoading.value = false
  }
}

async function load(more = false) {
  if (loading.value || disposed) return
  loading.value = true
  listError.value = ""
  try {
    const page = await listStudioMedia(
      more ? (nextCursor.value ?? undefined) : undefined,
      archived.value,
      props.role
    )
    if (disposed) return
    items.value = more ? [...items.value, ...page.items] : page.items
    nextCursor.value = page.nextCursor
  } catch {
    listError.value = "媒體清單讀取失敗，請重試。"
  } finally {
    loading.value = false
  }
}

async function changeView(value: boolean) {
  if (loading.value || busy.value) return
  archived.value = value
  items.value = []
  nextCursor.value = null
  await select(null)
  await load()
}

async function archive() {
  const asset = selected.value
  if (!canArchive.value || !asset) return
  busy.value = true
  feedback.value = ""
  try {
    await archiveStudioMedia(asset, props.role)
    await select(null)
    items.value = items.value.filter((item) => item.assetId !== asset.assetId)
    feedback.value = "已封存媒體。可在「已封存」查看；既有出版內容與權利狀態保持不變。"
    await load()
  } catch (error) {
    const status = error instanceof StudioApiError ? error.status : 0
    feedback.value = mediaArchiveFeedback(status)
    if (status === 409) {
      await select(null)
      await load()
    }
  } finally {
    busy.value = false
  }
}

onMounted(() => load())
onBeforeUnmount(() => {
  disposed = true
  clearPreview()
})
</script>

<template>
  <section class="studio-panel" aria-label="媒體庫清單" :aria-busy="loading || busy">
    <h2>瀏覽媒體</h2>
    <div class="studio-action-row" aria-label="媒體庫篩選">
      <button
        type="button"
        class="studio-button"
        :aria-pressed="!archived"
        :disabled="loading || busy"
        @click="changeView(false)"
      >
        使用中
      </button>
      <button
        type="button"
        class="studio-button"
        :aria-pressed="archived"
        :disabled="loading || busy"
        @click="changeView(true)"
      >
        已封存
      </button>
    </div>
    <p v-if="loading" role="status">正在讀取媒體清單…</p>
    <p v-if="listError" role="alert">{{ listError }}</p>
    <button
      v-if="listError"
      type="button"
      class="studio-button"
      :disabled="loading || busy"
      @click="load()"
    >
      重試讀取
    </button>
    <p v-if="!loading && !listError && !items.length">
      {{ archived ? "目前沒有已封存媒體。" : "目前沒有使用中的媒體。" }}
    </p>
    <ul v-if="items.length" class="studio-fact-list">
      <li v-for="item in items" :key="item.assetId">
        <button
          type="button"
          class="studio-button"
          :disabled="busy"
          :aria-pressed="selected?.assetId === item.assetId"
          @click="select(item)"
        >
          {{ item.altText || item.assetId }} · {{ item.processingState
          }}{{ item.archivedAt ? " · 已封存" : "" }}
        </button>
      </li>
    </ul>
    <button
      v-if="nextCursor"
      type="button"
      class="studio-button"
      :disabled="loading || busy"
      @click="load(true)"
    >
      載入更多
    </button>
    <section v-if="selected" aria-label="選取媒體">
      <p>{{ selected.assetId }} · 版本 {{ selected.version }}</p>
      <p v-if="selected.archivedAt">
        封存時間：{{ selected.archivedAt }}。無法新增引用；既有出版內容仍依原權利規則顯示。
      </p>
      <img
        v-if="previewUrl"
        :src="previewUrl"
        :alt="selected.altText || '私人媒體預覽'"
        style="max-width: 100%; max-height: 24rem"
        @error="clearPreview"
      />
      <p v-else role="status">
        {{
          previewLoading
            ? "正在讀取私人預覽…"
            : mediaPreviewFallback(selected.altText, selected.processingState)
        }}
      </p>
      <p v-if="!selected.archivedAt">
        封存後，這張媒體會從使用中清單移除，並停止新增引用。既有出版內容與權利狀態保持不變。
      </p>
      <button
        v-if="!selected.archivedAt"
        type="button"
        class="studio-button"
        :disabled="!canArchive"
        @click="archive"
      >
        {{ busy ? "封存中…" : "封存媒體" }}
      </button>
    </section>
    <p v-if="feedback" role="status">{{ feedback }}</p>
  </section>
</template>
