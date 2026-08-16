<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

import {
  listInstalledOfflineIssues,
  OfflineIssueManager,
  type InstalledOfflineIssue
} from "../services/OfflineIssueManager"
import {
  formatOfflineExpiry,
  formatStorageBytes,
  readBrowserStorageEstimate,
  type BrowserStorageEstimate
} from "../services/offline-ui-contract"

const props = defineProps<{
  apiBaseUrl: string
}>()

const installedIssues = ref<InstalledOfflineIssue[]>([])
const storageEstimate = ref<BrowserStorageEstimate | null>(null)
const loading = ref(true)
const removingIssueSlug = ref<string | null>(null)
const statusMessage = ref("")
const errorMessage = ref("")

const storageEstimateMessage = computed(() => {
  const estimate = storageEstimate.value
  if (!estimate) {
    return "瀏覽器未提供容量估計。"
  }
  return `已使用 ${formatStorageBytes(estimate.usage)} / 共 ${formatStorageBytes(estimate.quota)}（可用 ${formatStorageBytes(estimate.available)}）`
})

onMounted(loadInstalledIssues)

async function loadInstalledIssues(): Promise<void> {
  loading.value = true
  errorMessage.value = ""
  try {
    const [issues, estimate] = await Promise.all([
      listInstalledOfflineIssues(),
      readBrowserStorageEstimate()
    ])
    installedIssues.value = issues
    storageEstimate.value = estimate
  } catch {
    errorMessage.value = "本機離線期數暫時無法讀取。"
  } finally {
    loading.value = false
  }
}

async function removeIssue(issue: InstalledOfflineIssue): Promise<void> {
  if (removingIssueSlug.value) {
    return
  }

  removingIssueSlug.value = issue.issueSlug
  statusMessage.value = `正在移除 ${issue.issueSlug}……`
  errorMessage.value = ""
  const manager = new OfflineIssueManager(props.apiBaseUrl, issue.issueSlug)
  try {
    await manager.remove()
    installedIssues.value = installedIssues.value.filter(
      (candidate) => candidate.issueSlug !== issue.issueSlug
    )
    statusMessage.value = `已移除 ${issue.issueSlug} 的本機離線內容。`
  } catch {
    const remaining = await manager.getInstalled().catch(() => null)
    if (!remaining) {
      installedIssues.value = installedIssues.value.filter(
        (candidate) => candidate.issueSlug !== issue.issueSlug
      )
      statusMessage.value = `已移除 ${issue.issueSlug} 的本機離線內容。`
      errorMessage.value = "舊快取清理尚未完成，瀏覽器稍後會重試。"
    } else {
      statusMessage.value = "本機離線內容暫時無法移除。"
      errorMessage.value = "請稍後再試。"
    }
  } finally {
    removingIssueSlug.value = null
    storageEstimate.value = await readBrowserStorageEstimate()
  }
}
</script>

<template>
  <section
    class="offline-library-panel"
    data-testid="offline-library-panel"
    aria-labelledby="offline-library-heading"
  >
    <div>
      <p class="eyebrow">Offline library</p>
      <h2 id="offline-library-heading">這台裝置的離線期數</h2>
      <p>離線保存不是 DRM，也不是永久授權；到期或撤回後會停用。你可以隨時移除本機副本。</p>
      <p class="offline-library-panel__storage">{{ storageEstimateMessage }}</p>
    </div>

    <p v-if="loading" role="status">正在讀取本機離線期數…</p>
    <p v-else-if="errorMessage && installedIssues.length === 0" role="alert">
      {{ errorMessage }}
    </p>
    <ul v-else-if="installedIssues.length" class="offline-library-panel__list">
      <li
        v-for="issue in installedIssues"
        :key="issue.issueSlug"
        data-testid="offline-library-item"
      >
        <div>
          <strong>{{ issue.issueSlug }}</strong>
          <span>版本 {{ issue.manifest.manifestVersion }}</span>
          <span>{{ formatStorageBytes(issue.manifest.assetBytes) }}</span>
          <time :datetime="issue.manifest.expiresAt">
            {{ formatOfflineExpiry(issue.manifest.expiresAt) }} 到期
          </time>
        </div>
        <button
          type="button"
          data-testid="offline-library-remove"
          :disabled="removingIssueSlug !== null"
          @click="removeIssue(issue)"
        >
          從這台裝置移除
        </button>
      </li>
    </ul>
    <p v-else>目前沒有本機離線期數。<NuxtLink to="/issues">前往所有期數</NuxtLink></p>

    <p data-testid="offline-library-status" role="status" aria-live="polite">
      {{ statusMessage }}
    </p>
    <p
      v-if="errorMessage && installedIssues.length"
      class="offline-library-panel__error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
  </section>
</template>

<style scoped>
.offline-library-panel {
  display: grid;
  gap: 1.25rem;
  margin-bottom: 3rem;
  border: 1px solid #d8d0c3;
  border-left: 0.3rem solid var(--accent);
  padding: clamp(1.25rem, 3vw, 2rem);
  background: #eee9df;
}

.offline-library-panel h2 {
  margin: 0;
  font-size: clamp(1.5rem, 3vw, 2.25rem);
}

.offline-library-panel p {
  line-height: 1.6;
}

.offline-library-panel__storage {
  color: var(--muted);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 0.8125rem;
}

.offline-library-panel__list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.offline-library-panel__list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid #d8d0c3;
  padding: 1rem 0;
}

.offline-library-panel__list li > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: baseline;
}

.offline-library-panel__list span,
.offline-library-panel__list time {
  color: var(--muted);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 0.8125rem;
}

.offline-library-panel button {
  min-height: 2.75rem;
  border: 1px solid #191916;
  padding: 0.65rem 0.9rem;
  background: transparent;
  color: #191916;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.offline-library-panel button:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

.offline-library-panel button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.offline-library-panel__error {
  color: #8c2d20;
}
</style>
