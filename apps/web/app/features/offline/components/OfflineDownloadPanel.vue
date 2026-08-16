<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

import {
  OfflineIssueError,
  OfflineIssueManager,
  type InstalledOfflineIssue,
  type OfflineDownloadProgress
} from "../services/OfflineIssueManager"

const props = defineProps<{
  apiBaseUrl: string
  issueSlug: string
}>()

const manager = new OfflineIssueManager(props.apiBaseUrl, props.issueSlug)
const installed = ref<InstalledOfflineIssue | null>(null)
const status = ref<"idle" | "downloading" | "installed" | "error" | "unavailable">("idle")
const statusMessage = ref("尚未保存離線內容。")
const errorMessage = ref("")
const progress = ref<OfflineDownloadProgress | null>(null)

const isBusy = computed(() => status.value === "downloading")
const hasInstalled = computed(() => installed.value !== null && status.value !== "unavailable")
const isUnavailable = computed(() => status.value === "unavailable")

onMounted(async () => {
  try {
    installed.value = await manager.getInstalled()
    if (installed.value) {
      status.value = "installed"
      statusMessage.value = "這一期已保存，可在離線時開啟。"
    }
  } catch {
    // The public issue remains readable when this optional local cache is unavailable.
  }
})

async function downloadIssue(): Promise<void> {
  if (isBusy.value || isUnavailable.value) {
    return
  }

  status.value = "downloading"
  errorMessage.value = ""
  progress.value = null
  statusMessage.value = "正在準備離線內容……"

  try {
    installed.value = await manager.download((currentProgress) => {
      progress.value = currentProgress
      statusMessage.value =
        currentProgress.total > 0
          ? `正在下載 ${currentProgress.completed}/${currentProgress.total} 個資產……`
          : "正在建立離線內容……"
    })
    status.value = "installed"
    statusMessage.value = "下載完成，這一期已保存。"
  } catch (error) {
    status.value = "error"
    const issueError = error instanceof OfflineIssueError ? error : null
    if (issueError?.code === "quota") {
      errorMessage.value = "儲存空間不足，無法保留離線內容。"
      statusMessage.value = "下載未完成，沒有安裝部分內容。"
    } else if (issueError?.code === "corrupt") {
      errorMessage.value = "Checksum 校驗失敗：離線資產可能已損毀。"
      statusMessage.value = "下載未完成，沒有安裝部分內容。"
    } else if (issueError?.code === "interrupted") {
      statusMessage.value = "下載中斷，尚未安裝部分內容。"
    } else {
      errorMessage.value = "離線內容暫時無法取得，請稍後再試。"
      statusMessage.value = "下載未完成，沒有安裝部分內容。"
    }
  }
}

async function reconcileWithdrawal(): Promise<void> {
  if (!hasInstalled.value || isBusy.value) {
    return
  }

  status.value = "downloading"
  errorMessage.value = ""
  statusMessage.value = "正在確認內容是否仍可離線閱讀……"
  try {
    const result = await manager.reconcileWithdrawal()
    if (result.status === "withdrawn") {
      installed.value = null
      status.value = "unavailable"
      statusMessage.value = "這一期已撤回，離線內容已停止提供。"
      return
    }
    status.value = "installed"
    statusMessage.value = "內容仍可離線閱讀。"
  } catch {
    status.value = "error"
    errorMessage.value = "撤回狀態暫時無法確認，暫不開放離線內容。"
    statusMessage.value = "同步未完成，請在連線後重試。"
  }
}
</script>

<template>
  <section
    class="offline-panel"
    data-testid="offline-panel"
    aria-labelledby="offline-panel-heading"
  >
    <div class="offline-panel__copy">
      <p class="eyebrow">Offline reader</p>
      <h2 id="offline-panel-heading">下載這一期，離線也能讀</h2>
      <p>
        只保存公開期數的版本化內容與資產；這不是 DRM，也不代表永久可用，連線後仍會檢查撤回狀態。
      </p>
    </div>

    <div class="offline-panel__controls">
      <button
        data-testid="offline-download"
        type="button"
        :disabled="isBusy || isUnavailable"
        @click="downloadIssue"
      >
        {{ hasInstalled ? "更新離線內容" : "下載離線內容" }}
      </button>
      <button
        v-if="hasInstalled"
        data-testid="offline-update"
        type="button"
        class="offline-panel__secondary"
        :disabled="isBusy"
        @click="downloadIssue"
      >
        更新版本
      </button>
      <button
        v-if="hasInstalled"
        data-testid="offline-reconcile"
        type="button"
        class="offline-panel__secondary"
        :disabled="isBusy"
        @click="reconcileWithdrawal"
      >
        檢查撤回狀態
      </button>

      <p
        data-testid="offline-download-status"
        class="offline-panel__status"
        role="status"
        aria-live="polite"
      >
        {{ statusMessage }}
      </p>
      <p v-if="progress && isBusy" class="offline-panel__progress" aria-live="polite">
        {{ progress.completed }} / {{ progress.total }}
      </p>
      <p
        v-if="errorMessage"
        data-testid="offline-download-error"
        class="offline-panel__error"
        role="alert"
      >
        {{ errorMessage }}
      </p>

      <div
        v-if="hasInstalled && installed"
        data-testid="offline-installed"
        class="offline-panel__installed"
      >
        <span>已保存版本</span>
        <strong data-testid="offline-manifest-version">{{
          installed.manifest.manifestVersion
        }}</strong>
      </div>

      <p
        v-if="isUnavailable"
        data-testid="offline-unavailable"
        class="offline-panel__error"
        role="alert"
      >
        這一期已撤回，離線文章不可用。
      </p>
    </div>
  </section>
</template>
