import { ref } from "vue"

import {
  mergeProgress,
  type ProgressMergeResult,
  type ReadingProgress
} from "../reader-library-api"
import {
  readMergeableLocalProgress,
  type ProgressStorage
} from "../../reader/composables/useLocalReadingProgress"

/** Explicit two-step merge; preview is side-effect free and apply requires that preview. */
export function useProgressMerge() {
  const preview = ref<ProgressMergeResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let previewedItems: ReadingProgress[] = []

  async function previewLocal(storage: ProgressStorage): Promise<ProgressMergeResult | null> {
    const items = readMergeableLocalProgress(storage)
    preview.value = null
    previewedItems = []
    error.value = null
    if (items.length === 0) {
      error.value = "沒有可合併的本機閱讀進度。"
      return null
    }
    loading.value = true
    try {
      const result = await mergeProgress("preview", items)
      preview.value = result
      previewedItems = items
      return result
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "無法預覽閱讀進度合併。"
      return null
    } finally {
      loading.value = false
    }
  }

  async function applyPreview(): Promise<ProgressMergeResult | null> {
    if (!preview.value || previewedItems.length === 0) {
      error.value = "請先預覽合併結果。"
      return null
    }
    loading.value = true
    error.value = null
    try {
      const result = await mergeProgress("apply", previewedItems)
      preview.value = null
      previewedItems = []
      return result
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "無法套用閱讀進度合併。"
      return null
    } finally {
      loading.value = false
    }
  }

  return { preview, loading, error, previewLocal, applyPreview }
}
