<script setup lang="ts">
import { navigateTo } from "#app"
import { onMounted, ref } from "vue"

import {
  deleteAccount,
  exportAccountData,
  readReaderSession
} from "../../features/library/reader-library-api"
import { clearAllLocalReadingProgress } from "../../features/reader/composables/useLocalReadingProgress"

const route = useRoute()
const loading = ref(true)
const signedIn = ref(false)
const confirmed = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
const deletionStatus = ref<string | null>(null)

onMounted(async () => {
  try {
    signedIn.value = (await readReaderSession()).canSync
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法確認登入狀態。"
  } finally {
    loading.value = false
  }
})

async function downloadExport(): Promise<void> {
  pending.value = true
  error.value = null
  try {
    const value = await exportAccountData()
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "courtside-account.json"
    link.click()
    URL.revokeObjectURL(url)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法匯出帳號資料。"
  } finally {
    pending.value = false
  }
}

async function eraseAccount(): Promise<void> {
  if (!confirmed.value || pending.value) return
  pending.value = true
  error.value = null
  deletionStatus.value = null
  try {
    const workflow = await deleteAccount()
    if (workflow.status === "COMPLETED") {
      clearAllLocalReadingProgress(window.localStorage)
      deletionStatus.value = "COMPLETED／刪除完成"
      signedIn.value = false
      return
    }
    deletionStatus.value = workflow.status
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "帳號刪除失敗。"
  } finally {
    pending.value = false
  }
}

function login(): void {
  void navigateTo(`/auth/login?returnTo=${encodeURIComponent(route.fullPath)}`, { external: true })
}
</script>

<template>
  <div class="site-page">
    <header class="site-header">
      <NuxtLink to="/" class="site-brand">Courtside TW</NuxtLink>
      <nav aria-label="主要導覽">
        <NuxtLink to="/library">我的收藏</NuxtLink>
        <NuxtLink to="/settings/privacy" aria-current="page">隱私設定</NuxtLink>
      </nav>
    </header>

    <main class="site-shell privacy-page">
      <header class="page-intro">
        <p class="eyebrow">Privacy &amp; Account</p>
        <h1>資料由你決定</h1>
        <p>匯出只包含你的書籤與閱讀進度；刪除需近期完成身分驗證。</p>
      </header>

      <p v-if="loading" role="status">正在確認登入狀態…</p>
      <section v-else-if="!signedIn && !deletionStatus" class="reading-state">
        <h2>請先登入</h2>
        <p>需要有效且近期驗證的 OIDC session。</p>
        <button type="button" class="button-link button-link--quiet" @click="login">登入</button>
      </section>

      <template v-else-if="signedIn">
        <section class="privacy-panel" aria-labelledby="privacy-export-heading">
          <h2 id="privacy-export-heading">匯出我的資料</h2>
          <p>下載 JSON 格式的書籤、閱讀進度及產生時間。</p>
          <button
            type="button"
            class="button-link button-link--quiet"
            :disabled="pending"
            @click="downloadExport"
          >
            下載資料
          </button>
        </section>

        <section
          class="privacy-panel privacy-panel--danger"
          aria-labelledby="privacy-delete-heading"
        >
          <h2 id="privacy-delete-heading">刪除帳號資料</h2>
          <p>這會刪除伺服器書籤與進度、撤銷角色，並清除這台裝置的本機進度。</p>
          <label class="privacy-confirm">
            <input v-model="confirmed" type="checkbox" />
            確認刪除帳號與讀者資料 / confirm deletion
          </label>
          <button
            type="button"
            class="button-link"
            :disabled="pending || !confirmed"
            @click="eraseAccount"
          >
            刪除帳號 / Delete account
          </button>
        </section>
      </template>

      <p v-if="deletionStatus" data-testid="account-deletion-status" role="status">
        {{ deletionStatus }}
      </p>
      <p v-if="error" class="privacy-error" role="alert">{{ error }}</p>
    </main>
  </div>
</template>

<style scoped>
.privacy-page {
  max-width: 58rem;
}

.privacy-panel {
  margin-bottom: 2rem;
  border-top: 1px solid var(--color-text-primary);
  padding-top: 1.5rem;
}

.privacy-panel--danger {
  border-color: var(--accent);
}

.privacy-panel h2 {
  margin: 0;
}

.privacy-confirm {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 1rem;
  font-family: var(--font-body);
}

.privacy-confirm input {
  width: 1.25rem;
  height: 1.25rem;
}

.privacy-panel .button-link {
  min-height: 44px;
  border: 1px solid var(--color-text-primary);
  background: transparent;
  cursor: pointer;
}

.privacy-panel--danger .button-link {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-on-danger);
}

.privacy-error {
  color: var(--color-danger);
}
</style>
