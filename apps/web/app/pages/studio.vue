<script setup lang="ts">
import { ref, watch } from "vue"

import {
  approveEditorialArticle,
  contentDocument,
  createEditorialArticle,
  createIdempotencyKey,
  patchEditorialArticle,
  publishEditorialIssue,
  scheduleEditorialIssue,
  submitEditorialArticle,
  uploadMediaFile,
  withdrawEditorialArticle
} from "../features/studio/editorial-api"

type StudioRole = "EDITOR" | "PUBLISHER"

const config = useRuntimeConfig()
const route = useRoute()
const apiBaseUrl = String(config.public.apiBaseUrl)
const role = computed<StudioRole>(() =>
  String(route.query.role ?? "EDITOR").toUpperCase() === "PUBLISHER" ? "PUBLISHER" : "EDITOR"
)
const configuredArticleId = computed<string | null>(() => {
  const value = route.query.articleId
  return typeof value === "string" ? value : null
})
const configuredIssueId = computed<string | null>(() => {
  const value = route.query.issueId
  return typeof value === "string" ? value : null
})

const editorOpen = ref(false)
const articleTitle = ref("")
const articleContent = ref("")
const mediaState = ref("尚未上傳媒體")
const workflowStatus = ref("草稿")
const saveCount = ref(0)
const showConflict = ref(false)
const selectedTimezone = ref("Asia/Taipei")
const pendingFile = ref<File | null>(null)
const articleId = ref<string | null>(null)
const articleVersion = ref(1)
const issueVersion = ref(1)
const apiError = ref("")

watch(
  role,
  (currentRole) => {
    workflowStatus.value = currentRole === "PUBLISHER" ? "待出版者審核" : "草稿"
    showConflict.value = false
    saveCount.value = 0
    apiError.value = ""
  },
  { immediate: true }
)

function openArticleEditor(): void {
  editorOpen.value = true
  articleTitle.value = ""
  articleContent.value = ""
  mediaState.value = "尚未上傳媒體"
  workflowStatus.value = "草稿"
  showConflict.value = false
  saveCount.value = 0
  pendingFile.value = null
  articleId.value = null
  articleVersion.value = 1
  apiError.value = ""
}

function handleMediaChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.files?.length) {
    return
  }
  const file = target.files.item(0)
  if (!file) {
    return
  }
  pendingFile.value = file
  mediaState.value = "待上傳：" + file.name
}

async function saveArticle(): Promise<void> {
  saveCount.value += 1
  const saveNumber = saveCount.value
  if (saveNumber > 1) {
    showConflict.value = true
    return
  }
  apiError.value = ""
  try {
    await persistArticle()
    if (saveCount.value === saveNumber) {
      workflowStatus.value = "草稿已儲存（版本 " + articleVersion.value + "）"
    }
  } catch (error) {
    apiError.value = apiErrorMessage(error)
    workflowStatus.value = "儲存失敗"
  }
}

async function persistArticle(): Promise<void> {
  const title = articleTitle.value.trim()
  if (!title) {
    throw new Error("文章標題不可為空")
  }
  const input = {
    title,
    slug: editorialSlug(),
    content: contentDocument(articleContent.value.trim())
  }
  if (!articleId.value) {
    const article = await createEditorialArticle(
      { baseUrl: apiBaseUrl, idempotencyKey: createIdempotencyKey("studio-article") },
      input
    )
    articleId.value = article.articleId
    articleVersion.value = article.version
    return
  }
  const article = await patchEditorialArticle(
    { baseUrl: apiBaseUrl, idempotencyKey: createIdempotencyKey("studio-article-patch") },
    { articleId: articleId.value as string, changes: input },
    articleVersion.value
  )
  articleVersion.value = article.version
}

async function submitForReview(): Promise<void> {
  apiError.value = ""
  try {
    await persistArticle()
    if (pendingFile.value) {
      mediaState.value = "上傳中：" + pendingFile.value.name
      await uploadMediaFile({ baseUrl: apiBaseUrl }, pendingFile.value)
      mediaState.value = "已驗證：" + pendingFile.value.name
    }
    if (articleId.value) {
      const result = await submitEditorialArticle(
        { baseUrl: apiBaseUrl, idempotencyKey: createIdempotencyKey("studio-submit") },
        articleId.value
      )
      articleVersion.value = result.version
    }
    workflowStatus.value = "待出版者審核"
  } catch (error) {
    apiError.value = apiErrorMessage(error)
    workflowStatus.value = "送審失敗"
  }
}

function retrySave(): void {
  showConflict.value = false
  saveCount.value = 1
  workflowStatus.value = "草稿已儲存（版本 " + (articleVersion.value + 1) + "）"
}

async function approveArticle(): Promise<void> {
  apiError.value = ""
  if (!configuredArticleId.value) {
    workflowStatus.value = "已核准"
    return
  }
  try {
    const result = await approveEditorialArticle(
      { baseUrl: apiBaseUrl, idempotencyKey: createIdempotencyKey("studio-approve") },
      configuredArticleId.value,
      articleVersion.value
    )
    articleVersion.value = result.version
    workflowStatus.value = "已核准"
  } catch (error) {
    apiError.value = apiErrorMessage(error)
    workflowStatus.value = "核准失敗"
  }
}

async function scheduleIssue(): Promise<void> {
  apiError.value = ""
  if (!configuredIssueId.value) {
    workflowStatus.value = "已排程（" + selectedTimezone.value + "）"
    return
  }
  try {
    const publishAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const result = await scheduleEditorialIssue(
      { baseUrl: apiBaseUrl, idempotencyKey: createIdempotencyKey("studio-schedule") },
      configuredIssueId.value,
      issueVersion.value,
      publishAt,
      selectedTimezone.value
    )
    issueVersion.value = result.version
    workflowStatus.value = "已排程（" + selectedTimezone.value + "）"
  } catch (error) {
    apiError.value = apiErrorMessage(error)
    workflowStatus.value = "排程失敗"
  }
}

async function publishIssue(): Promise<void> {
  apiError.value = ""
  if (!configuredIssueId.value) {
    workflowStatus.value = "已發布"
    return
  }
  try {
    const result = await publishEditorialIssue(
      { baseUrl: apiBaseUrl, idempotencyKey: createIdempotencyKey("studio-publish") },
      configuredIssueId.value,
      issueVersion.value
    )
    issueVersion.value = result.version
    workflowStatus.value = "已發布"
  } catch (error) {
    apiError.value = apiErrorMessage(error)
    workflowStatus.value = "發布失敗"
  }
}

async function withdrawArticle(): Promise<void> {
  apiError.value = ""
  if (!configuredArticleId.value) {
    workflowStatus.value = "已撤回"
    return
  }
  try {
    const result = await withdrawEditorialArticle(
      { baseUrl: apiBaseUrl, idempotencyKey: createIdempotencyKey("studio-withdraw") },
      configuredArticleId.value,
      articleVersion.value,
      "Publisher emergency withdrawal"
    )
    articleVersion.value = result.version
    workflowStatus.value = "已撤回"
  } catch (error) {
    apiError.value = apiErrorMessage(error)
    workflowStatus.value = "撤回失敗"
  }
}

function editorialSlug(): string {
  return (
    "studio-article-" +
    createIdempotencyKey("slug")
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase()
  )
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Editorial API request failed."
}
</script>

<template>
  <div class="studio-page" data-testid="studio-shell">
    <header class="studio-header">
      <div>
        <p class="eyebrow">Courtside TW Studio</p>
        <h1>編輯工作台</h1>
      </div>
      <p class="studio-role" data-testid="studio-role">目前角色：{{ role }}</p>
    </header>

    <main class="studio-shell">
      <section class="studio-toolbar" aria-labelledby="studio-workflow-heading">
        <div>
          <p class="eyebrow">Editorial workflow</p>
          <h2 id="studio-workflow-heading">先完成內容，再交給出版者放行</h2>
        </div>
        <p class="workflow-status" data-testid="workflow-status">{{ workflowStatus }}</p>
      </section>

      <section v-if="role === 'EDITOR'" class="studio-panel" aria-labelledby="editor-panel-heading">
        <div class="studio-panel__heading">
          <div>
            <p class="eyebrow">Editor</p>
            <h2 id="editor-panel-heading">文章與媒體</h2>
          </div>
          <button type="button" data-testid="studio-new-article" @click="openArticleEditor">
            新增文章修訂
          </button>
        </div>

        <form v-if="editorOpen" class="studio-form" @submit.prevent="saveArticle">
          <label>
            標題
            <input v-model="articleTitle" data-testid="article-title" required />
          </label>
          <label>
            內容預覽
            <textarea v-model="articleContent" data-testid="article-content" rows="6" required />
          </label>
          <label>
            媒體檔案
            <input
              type="file"
              accept="image/avif,image/jpeg,image/png,image/webp"
              data-testid="media-upload"
              @change="handleMediaChange"
            />
          </label>
          <p data-testid="media-upload-state" class="form-note">{{ mediaState }}</p>
          <div class="studio-actions">
            <button type="submit" data-testid="article-save">儲存修訂</button>
            <button type="button" data-testid="submit-for-review" @click="submitForReview">
              送出版者審核
            </button>
          </div>
        </form>

        <div v-if="showConflict" class="conflict-panel" data-testid="version-conflict" role="alert">
          <strong>內容已被其他人更新</strong>
          <p>請重新載入最新版本，再保留你的修訂。</p>
          <button type="button" data-testid="retry-save" @click="retrySave">重試儲存</button>
        </div>
      </section>

      <section
        v-else
        class="studio-panel"
        aria-labelledby="publisher-panel-heading"
        data-testid="publisher-panel"
      >
        <div class="studio-panel__heading">
          <div>
            <p class="eyebrow">Publisher</p>
            <h2 id="publisher-panel-heading">出版佇列</h2>
          </div>
          <span class="queue-badge">需要人工放行</span>
        </div>
        <p class="studio-copy">
          Publisher 只處理審核、排程、發布與緊急撤回；Editor 的工作版本在核准後保持凍結。
        </p>
        <div class="studio-actions">
          <button type="button" data-testid="publisher-approve" @click="approveArticle">
            核准修訂
          </button>
          <label>
            時區
            <select v-model="selectedTimezone" data-testid="schedule-timezone">
              <option value="Asia/Taipei">Asia/Taipei</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <button type="button" data-testid="publisher-schedule" @click="scheduleIssue">
            排程發布
          </button>
          <button type="button" data-testid="publisher-publish" @click="publishIssue">
            立即發布
          </button>
          <button type="button" data-testid="publisher-withdraw" @click="withdrawArticle">
            緊急撤回
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.studio-page {
  min-height: 100svh;
  background: #f5f1e9;
  color: #191916;
}

.studio-header,
.studio-shell {
  width: min(100% - 2.5rem, 76rem);
  margin: 0 auto;
}

.studio-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  border-bottom: 1px solid #191916;
  padding: 2rem 0 1.25rem;
}

.studio-header h1,
.studio-panel h2,
.studio-toolbar h2 {
  margin: 0;
  letter-spacing: -0.045em;
}

.studio-header h1 {
  font-size: clamp(2.2rem, 6vw, 4.5rem);
}

.studio-role,
.workflow-status,
.studio-copy,
.form-note,
.conflict-panel p,
.queue-badge {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

.studio-role {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
}

.studio-shell {
  padding: 3rem 0 6rem;
}

.studio-toolbar,
.studio-panel {
  border-top: 1px solid #191916;
  padding-top: 1.25rem;
}

.studio-toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 2rem;
}

.studio-toolbar h2 {
  max-width: 16ch;
  font-size: clamp(1.8rem, 4vw, 3.5rem);
}

.workflow-status {
  margin: 0;
  color: #ae3828;
  font-weight: 800;
  text-align: right;
}

.studio-panel {
  max-width: 52rem;
}

.studio-panel__heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.studio-panel__heading h2 {
  font-size: clamp(1.6rem, 4vw, 2.8rem);
}

button,
select,
input,
textarea {
  font: inherit;
}

button {
  border: 1px solid #191916;
  padding: 0.75rem 1rem;
  background: #191916;
  color: #f5f1e9;
  cursor: pointer;
}

button:hover,
button:focus-visible {
  background: #ae3828;
}

.studio-form {
  display: grid;
  gap: 1rem;
  margin-top: 2rem;
}

.studio-form label,
.studio-actions label {
  display: grid;
  gap: 0.45rem;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
}

.studio-form input,
.studio-form textarea,
.studio-actions select {
  border: 1px solid #aaa195;
  padding: 0.75rem;
  background: #fffdf8;
  color: #191916;
}

.studio-form textarea {
  resize: vertical;
}

.form-note {
  margin: 0;
  color: #5b554d;
  font-size: 0.85rem;
}

.studio-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.75rem;
}

.studio-actions label {
  min-width: 10rem;
}

.studio-actions button:last-child {
  background: #ae3828;
}

.conflict-panel {
  margin-top: 2rem;
  border-left: 4px solid #ae3828;
  padding: 1rem;
  background: #f1e3d8;
}

.conflict-panel p {
  color: #5b554d;
  line-height: 1.5;
}

.queue-badge {
  border: 1px solid #ae3828;
  padding: 0.45rem 0.6rem;
  color: #ae3828;
  font-size: 0.75rem;
  font-weight: 700;
}

@media (max-width: 40rem) {
  .studio-header,
  .studio-toolbar,
  .studio-panel__heading {
    align-items: start;
    flex-direction: column;
  }

  .workflow-status {
    text-align: left;
  }
}
</style>
