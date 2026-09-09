<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"
import StudioShell from "../../../features/studio/StudioShell.vue"
import {
  archiveIssue,
  transitionIssue,
  listPublisherIssues,
  listIssueArticles,
  StudioApiError,
  type IssueArticleCollection,
  type IssueDraft
} from "../../../features/studio/studio-api"
import {
  resolveRequiredStudioRole,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"

const route = useRoute()
const role = ref<StudioRole | null>(null)
const issues = ref<IssueDraft[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const scheduleId = ref<string | null>(null)
const publishAt = ref("")
const timezone = ref("Asia/Taipei")
const contents = ref<Record<string, IssueArticleCollection>>({})
const contentsId = ref<string | null>(null)

async function readContents(issue: IssueDraft) {
  if (busy.value) return
  busy.value = true
  actionError.value = null
  try {
    const collection = await listIssueArticles(issue.issueId, "publisher")
    if (collection.issueVersion !== issue.version)
      throw new Error("期刊版本已變更，請重新讀取清單後再審閱。")
    contents.value[issue.issueId] = collection
    contentsId.value = issue.issueId
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : "無法讀取目錄。"
  } finally {
    busy.value = false
  }
}

async function advance(issue: IssueDraft, action: "approve" | "publish" | "schedule") {
  if (role.value !== "PUBLISHER" || busy.value) return
  if (
    (action === "approve" && issue.state !== "IN_REVIEW") ||
    (action !== "approve" && issue.state !== "APPROVED")
  )
    return
  busy.value = true
  actionError.value = null
  notice.value = null
  try {
    const result = await transitionIssue(
      issue,
      action,
      action === "schedule" ? { publishAt: publishAt.value, timezone: timezone.value } : undefined
    )
    const state =
      action === "approve" ? "APPROVED" : action === "schedule" ? "SCHEDULED" : "PUBLISHED"
    issues.value = issues.value.map((item) =>
      item.issueId === issue.issueId ? { ...item, state, version: result.version } : item
    )
    scheduleId.value = null
    notice.value =
      action === "schedule"
        ? `期刊已依 ${timezone.value} 的 ${publishAt.value} 排程；到期後仍會再次檢查權利。`
        : action === "approve"
          ? "期刊已核准。"
          : "期刊已發布。"
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : "期刊流程變更失敗。"
  } finally {
    busy.value = false
  }
}
async function load(append = false) {
  const page = await listPublisherIssues(append ? (nextCursor.value ?? undefined) : undefined)
  issues.value = append ? [...issues.value, ...page.items] : page.items
  nextCursor.value = page.page.nextCursor
  if (!append) {
    contents.value = {}
    contentsId.value = null
  }
}
async function reload(append = false) {
  if (busy.value) return
  busy.value = true
  actionError.value = null
  try {
    await load(append)
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : "無法讀取期刊。"
  } finally {
    busy.value = false
  }
}
async function archive(issue: IssueDraft) {
  if (role.value !== "PUBLISHER" || busy.value || issue.state !== "PUBLISHED") return
  busy.value = true
  actionError.value = null
  notice.value = null
  try {
    const result = await archiveIssue(issue)
    issues.value = issues.value.map((item) =>
      item.issueId === issue.issueId
        ? { ...item, state: "ARCHIVED", version: result.version }
        : item
    )
    selectedId.value = null
    notice.value = `「${issue.title}」已封存；既有出版快照與稽核紀錄繼續保留。`
  } catch (cause) {
    actionError.value =
      cause instanceof StudioApiError && cause.status === 409
        ? "期刊版本或狀態已變更，請重新讀取清單後確認。"
        : cause instanceof Error
          ? cause.message
          : "封存失敗。"
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  try {
    const session = await readStudioSession()
    if (!session.authenticated) throw new Error("請先使用 OIDC 登入。")
    role.value = resolveRequiredStudioRole(session.roles, "PUBLISHER")
    if (!role.value) throw new Error("此工作區需要 PUBLISHER role。")
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取期刊。"
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <p v-if="loading" class="studio-loading" role="status">正在讀取期刊發布管理…</p>
  <section v-else-if="error" class="studio-panel studio-page-error" role="alert">
    <h1>期刊發布管理需要有效 session</h1>
    <p>{{ error }}</p>
    <button
      v-if="error.includes('OIDC')"
      class="studio-button studio-button--primary"
      @click="navigateTo(loginPath(route.fullPath))"
    >
      使用 OIDC 登入
    </button>
  </section>
  <StudioShell
    v-else-if="role"
    :role="role"
    active="issue-review"
    title="期刊發布管理"
    eyebrow="Studio / Publisher"
    description="檢視期刊狀態、核准、排程、發布與封存；每個操作都再次檢查伺服器版本與權利。"
  >
    <p v-if="actionError" class="studio-inline-error" role="alert">{{ actionError }}</p>
    <p v-if="notice" class="studio-help" role="status">{{ notice }}</p>
    <section class="studio-panel studio-panel--primary" aria-label="Publisher 期刊清單">
      <div class="studio-panel__heading">
        <h2>期刊清單</h2>
        <button
          class="studio-button studio-button--quiet"
          type="button"
          :disabled="busy"
          @click="reload()"
        >
          重新讀取期刊
        </button>
      </div>
      <ul class="studio-audit-list">
        <li v-for="issue in issues" :key="issue.issueId">
          <span>{{ issue.issueNumber }}</span>
          <div>
            <strong>{{ issue.title }}</strong
            ><small>{{ issue.state }} · v{{ issue.version }}</small>
            <p>{{ issue.description }}</p>
            <button
              class="studio-button studio-button--quiet"
              type="button"
              :disabled="busy"
              @click="readContents(issue)"
            >
              檢視期刊目錄 {{ issue.title }}
            </button>
            <div
              v-if="contentsId === issue.issueId && contents[issue.issueId]"
              aria-label="期刊審閱目錄"
            >
              <div v-for="section in contents[issue.issueId]?.sections" :key="section.sectionId">
                <h3>{{ section.title }}</h3>
                <ol>
                  <li
                    v-for="article in contents[issue.issueId]?.articles.filter(
                      (item) => item.sectionId === section.sectionId
                    )"
                    :key="article.articleId"
                  >
                    {{ article.title ?? article.slug }} ·
                    {{
                      article.revisionNumber
                        ? `固定版本 r${article.revisionNumber}`
                        : "需重新指定已發布版本"
                    }}
                  </li>
                </ol>
              </div>
              <p v-if="!contents[issue.issueId]?.articles.length">這一期尚未安排文章。</p>
            </div>
            <div class="studio-action-row">
              <button
                v-if="issue.state === 'IN_REVIEW'"
                class="studio-button studio-button--primary"
                type="button"
                :disabled="busy"
                @click="advance(issue, 'approve')"
              >
                核准期刊
              </button>
              <button
                v-if="issue.state === 'APPROVED'"
                class="studio-button studio-button--primary"
                type="button"
                :disabled="busy"
                @click="advance(issue, 'publish')"
              >
                立即發布期刊
              </button>
              <button
                v-if="issue.state === 'APPROVED'"
                class="studio-button studio-button--quiet"
                type="button"
                :disabled="busy"
                @click="scheduleId = issue.issueId"
              >
                排程期刊
              </button>
            </div>
            <form
              v-if="scheduleId === issue.issueId && issue.state === 'APPROVED'"
              class="studio-form-grid"
              @submit.prevent="advance(issue, 'schedule')"
            >
              <label class="studio-field"
                ><span>期刊發布時間</span
                ><input v-model="publishAt" type="datetime-local" required :disabled="busy"
              /></label>
              <label class="studio-field"
                ><span>期刊發布時區</span
                ><select v-model="timezone" :disabled="busy">
                  <option value="Asia/Taipei">Asia/Taipei</option>
                  <option value="UTC">UTC</option>
                </select></label
              >
              <button class="studio-button studio-button--primary" type="submit" :disabled="busy">
                確認期刊排程
              </button>
              <button
                class="studio-button studio-button--quiet"
                type="button"
                :disabled="busy"
                @click="scheduleId = null"
              >
                取消排程
              </button>
            </form>
            <button
              v-if="issue.state === 'PUBLISHED' && selectedId !== issue.issueId"
              class="studio-button studio-button--quiet"
              type="button"
              :disabled="busy"
              @click="selectedId = issue.issueId"
            >
              封存期刊 {{ issue.title }}
            </button>
            <div v-if="selectedId === issue.issueId" aria-label="確認期刊封存">
              <p>封存後將停止公開展示這一期，出版快照仍會保留。</p>
              <button
                class="studio-button studio-button--primary"
                type="button"
                :disabled="busy"
                @click="archive(issue)"
              >
                確認封存期刊</button
              ><button
                class="studio-button studio-button--quiet"
                type="button"
                :disabled="busy"
                @click="selectedId = null"
              >
                取消
              </button>
            </div>
          </div>
        </li>
      </ul>
      <p v-if="!issues.length" class="studio-help">目前沒有期刊。</p>
      <button
        v-if="nextCursor"
        class="studio-button studio-button--quiet"
        type="button"
        :disabled="busy"
        @click="reload(true)"
      >
        載入更多期刊
      </button>
    </section>
  </StudioShell>
</template>
