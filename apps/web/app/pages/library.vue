<script setup lang="ts">
import { navigateTo } from "#app"
import { onMounted, ref } from "vue"

import OfflineLibraryPanel from "../features/offline/components/OfflineLibraryPanel.vue"
import { useProgressMerge } from "../features/library/composables/useProgressMerge"
import {
  listBookmarks,
  listProgress,
  readReaderSession,
  type BookmarkItem,
  type ReadingProgress
} from "../features/library/reader-library-api"

const route = useRoute()
const config = useRuntimeConfig()
const bookmarks = ref<BookmarkItem[]>([])
const progress = ref<ReadingProgress[]>([])
const loading = ref(true)
const signedIn = ref(false)
const error = ref<string | null>(null)
const mergeDecision = ref<string | null>(null)
const merge = useProgressMerge()

useHead({ title: "我的收藏 — Courtside TW" })

onMounted(loadLibrary)

async function loadLibrary(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const session = await readReaderSession()
    signedIn.value = session.canSync
    if (!session.canSync) return
    const [bookmarkPage, progressPage] = await Promise.all([listBookmarks(), listProgress()])
    bookmarks.value = bookmarkPage.items
    progress.value = progressPage.items
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取讀者收藏。"
  } finally {
    loading.value = false
  }
}

async function previewProgress(): Promise<void> {
  const result = await merge.previewLocal(window.localStorage)
  if (!result) return
  mergeDecision.value = "已選擇 newer／較新的有效閱讀進度；預覽尚未改寫伺服器資料。"
}

async function applyProgress(): Promise<void> {
  const result = await merge.applyPreview()
  if (!result) return
  progress.value = result.accepted
  mergeDecision.value = "較新的有效閱讀進度已套用。"
}

function bookmarkLabel(bookmark: BookmarkItem): string {
  return bookmark.title || bookmark.slug || "已收藏文章"
}

function progressPercent(value: number): string {
  return `${Math.round(value)}%`
}

function login(): void {
  void navigateTo(`/auth/login?returnTo=${encodeURIComponent(route.fullPath)}`, { external: true })
}
</script>

<template>
  <div class="site-page">
    <a class="skip-link" href="#main-content">跳到主要內容</a>
    <header class="site-header">
      <NuxtLink to="/" class="site-brand">Courtside TW</NuxtLink>
      <nav aria-label="主要導覽">
        <NuxtLink to="/issues">所有期數</NuxtLink>
        <NuxtLink to="/search">搜尋</NuxtLink>
        <NuxtLink to="/library" aria-current="page">我的收藏</NuxtLink>
      </nav>
    </header>

    <main id="main-content" class="site-shell library-page" tabindex="-1">
      <header class="page-intro">
        <p class="eyebrow">Reader Library</p>
        <h1>跨裝置接續閱讀</h1>
        <p>書籤直接同步；本機進度必須先預覽，再由你確認套用。</p>
      </header>

      <OfflineLibraryPanel :api-base-url="config.public.apiBaseUrl" />

      <p v-if="loading" role="status">正在讀取收藏與閱讀進度…</p>
      <section v-else-if="!signedIn" class="reading-state">
        <h2>登入後同步</h2>
        <p>匿名閱讀仍可使用本機進度；登入後才會同步到其他裝置。</p>
        <button type="button" class="button-link button-link--quiet" @click="login">
          使用 OIDC 登入
        </button>
      </section>
      <section v-else-if="error" class="reading-state reading-state--error" role="alert">
        <h2>收藏暫時無法載入</h2>
        <p>{{ error }}</p>
      </section>

      <template v-else>
        <section class="library-section" aria-labelledby="library-bookmarks-heading">
          <div class="section-heading">
            <h2 id="library-bookmarks-heading">書籤</h2>
            <span>{{ bookmarks.length }} 篇</span>
          </div>
          <ul v-if="bookmarks.length" class="library-list">
            <li
              v-for="bookmark in bookmarks"
              :key="bookmark.articleId"
              data-testid="library-bookmark"
            >
              <template v-if="bookmark.available && bookmark.slug">
                <NuxtLink :to="`/articles/${bookmark.slug}`">{{
                  bookmarkLabel(bookmark)
                }}</NuxtLink>
              </template>
              <div v-else data-testid="library-unavailable" class="library-unavailable">
                <strong>{{ bookmarkLabel(bookmark) }}</strong>
                <span>此內容目前不可用 unavailable；收藏記錄仍可移除。</span>
              </div>
            </li>
          </ul>
          <p v-else>尚未加入書籤。</p>
        </section>

        <section class="library-section" aria-labelledby="library-progress-heading">
          <div class="section-heading">
            <h2 id="library-progress-heading">閱讀進度</h2>
            <span v-if="progress[0]" data-testid="library-progress-percent" aria-live="polite">
              {{ progressPercent(progress[0].percent) }}
            </span>
          </div>
          <p>預覽只計算較新的有效 revision/block，不會改寫伺服器資料。</p>
          <div class="library-actions">
            <button
              type="button"
              class="button-link button-link--quiet"
              data-testid="progress-merge-preview"
              :disabled="merge.loading.value"
              @click="previewProgress"
            >
              預覽本機／伺服器合併
            </button>
            <button
              type="button"
              class="button-link"
              data-testid="progress-merge-apply"
              :disabled="merge.loading.value || !merge.preview.value"
              @click="applyProgress"
            >
              確認套用
            </button>
          </div>
          <p v-if="mergeDecision" data-testid="progress-merge-decision" role="status">
            {{ mergeDecision }}
          </p>
          <p v-if="merge.error.value" class="library-error" role="alert">
            {{ merge.error.value }}
          </p>
        </section>

        <NuxtLink to="/settings/privacy" class="text-link">匯出資料或刪除帳號</NuxtLink>
      </template>
    </main>
  </div>
</template>

<style scoped>
.library-page {
  max-width: 64rem;
}

.library-section {
  margin-bottom: 3rem;
  border-top: 1px solid #191916;
  padding-top: 1.5rem;
}

.library-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-list li {
  border-bottom: 1px solid #d8d0c3;
  padding: 1rem 0;
}

.library-unavailable {
  display: grid;
  gap: 0.4rem;
  color: var(--muted);
}

.library-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.library-actions .button-link {
  min-height: 44px;
  margin-top: 1rem;
  cursor: pointer;
}

.library-error {
  color: var(--accent);
}
</style>
