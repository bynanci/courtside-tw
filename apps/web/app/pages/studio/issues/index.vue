<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import {
  createEditorIssue,
  listEditorIssues,
  type IssueDraft
} from "../../../features/studio/studio-api"
import {
  resolveRequiredStudioRole,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"
import StudioShell from "../../../features/studio/StudioShell.vue"

import { buildIssueDraftInput } from "../../../features/studio/editor/article-draft-form"

const newTitle = ref("")
const newSlug = ref("")
const newDescription = ref("")
const coverAssetId = ref("")
const creating = ref(false)
const createError = ref<string | null>(null)

async function createDraft() {
  if (creating.value || role.value !== "EDITOR") return
  creating.value = true
  createError.value = null
  try {
    const issue = await createEditorIssue(
      buildIssueDraftInput(newTitle.value, newSlug.value, newDescription.value, coverAssetId.value)
    )
    await navigateTo(`/studio/issues/${issue.issueId}`)
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : "無法建立期刊。"
  } finally {
    creating.value = false
  }
}

const route = useRoute()
const role = ref<StudioRole | null>(null)
const issues = ref<IssueDraft[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function loadIssues(cursor?: string, append = false): Promise<void> {
  const page = await listEditorIssues(20, cursor)
  issues.value = append ? [...issues.value, ...page.items] : page.items
  nextCursor.value = page.page.nextCursor
}

async function loadMore(): Promise<void> {
  if (!nextCursor.value || loading.value) return
  loading.value = true
  error.value = null
  try {
    await loadIssues(nextCursor.value, true)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取更多 issue。"
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const session = await readStudioSession()
    if (!session.authenticated) {
      error.value = "請先使用 OIDC 登入 Studio。"
      return
    }
    role.value = resolveRequiredStudioRole(session.roles, "EDITOR")
    if (!role.value) {
      error.value = "目前的 OIDC session 沒有 EDITOR role。"
      return
    }
    await loadIssues()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取 issue API。"
  } finally {
    loading.value = false
  }
})

const login = () => navigateTo(loginPath(route.fullPath))
</script>

<template>
  <div v-if="loading" class="studio-loading" role="status">正在讀取 OIDC session 與 issue API…</div>
  <section
    v-else-if="error"
    class="studio-panel studio-panel--primary studio-page-error"
    role="alert"
  >
    <h1>Issue workspace 需要有效 session</h1>
    <p>{{ error }}</p>
    <button
      v-if="error.includes('OIDC')"
      class="studio-button studio-button--primary"
      type="button"
      @click="login"
    >
      使用 OIDC 登入
    </button>
  </section>
  <StudioShell
    v-else-if="role"
    :role="role"
    active="issues"
    title="Issue workspace"
    eyebrow="Studio / Issues"
    description="從 issue 索引進入每一期的 sections 與排序工作區。"
  >
    <section class="studio-panel studio-panel--primary" aria-label="建立期刊">
      <h2>建立期刊</h2>
      <form class="studio-form-grid" @submit.prevent="createDraft">
        <label class="studio-field"
          ><span>新期刊標題</span
          ><input v-model="newTitle" required maxlength="200" :disabled="creating"
        /></label>
        <label class="studio-field"
          ><span>期刊網址代稱</span
          ><input v-model="newSlug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" :disabled="creating"
        /></label>
        <label class="studio-field studio-field--wide"
          ><span>新期刊摘要</span
          ><textarea v-model="newDescription" maxlength="1000" :disabled="creating" />
        </label>
        <label class="studio-field"
          ><span>封面資產 ID</span
          ><input
            v-model="coverAssetId"
            required
            :disabled="creating"
            aria-describedby="issue-cover-help"
        /></label>
        <p id="issue-cover-help" class="studio-help">
          使用媒體庫已上傳的資產 ID。發布前會再次檢查封面與權利。
        </p>
        <button class="studio-button studio-button--primary" type="submit" :disabled="creating">
          {{ creating ? "建立中…" : "建立期刊草稿" }}
        </button>
      </form>
      <p v-if="createError" role="alert" class="studio-inline-error">{{ createError }}</p>
    </section>
    <section class="studio-panel studio-panel--primary" aria-label="Issue drafts">
      <div class="studio-panel__heading">
        <div>
          <p class="studio-kicker">Editorial issues</p>
          <h2>選擇一期</h2>
        </div>
        <span class="studio-version">{{ issues.length }} issues</span>
      </div>
      <ul v-if="issues.length" class="studio-audit-list">
        <li v-for="issue in issues" :key="issue.issueId">
          <span>{{ String(issue.issueNumber).padStart(2, "0") }}</span>
          <div>
            <NuxtLink :to="`/studio/issues/${issue.issueId}`">
              <strong>{{ issue.title }}</strong>
            </NuxtLink>
            <small>{{ issue.slug }} · {{ issue.state }} · v{{ issue.version }}</small>
          </div>
        </li>
      </ul>
      <p v-else class="studio-help">目前沒有可編輯的 issue draft。</p>
      <button
        v-if="nextCursor"
        class="studio-button studio-button--quiet"
        type="button"
        :disabled="loading"
        @click="loadMore"
      >
        {{ loading ? "讀取中…" : "載入更多 issues" }}
      </button>
    </section>
  </StudioShell>
</template>
