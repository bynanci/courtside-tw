<script setup lang="ts">
import { computed, ref } from "vue"

import StudioShell from "../StudioShell.vue"
import { canStudioAction, missingRoleMessage } from "../studio-rbac"
import {
  approveArticle,
  archiveArticle,
  getPublisherArticle,
  publishArticle,
  requestChangesArticle,
  scheduleArticle,
  StudioApiError,
  withdrawArticle,
  type WorkflowResult
} from "../studio-api"
import type { StudioArticleDraft, StudioRole } from "../studio-contract"
import { articleStateLabel, readinessLabel } from "../studio-contract"
import { canReviewAction } from "./review-contract"

const props = defineProps<{
  role: StudioRole
  article: StudioArticleDraft
}>()

const current = ref<StudioArticleDraft>(props.article)
const timezone = ref("Asia/Taipei")
const publishAt = ref(defaultScheduleValue())
const scheduleKey = ref<string | null>(null)
const scheduleRetryPending = ref(false)
const scheduleOpen = ref(false)
const withdrawalOpen = ref(false)
const withdrawalReason = ref("")
const changesOpen = ref(false)
const changesReason = ref("")
const busy = ref(false)
const refreshed = ref(false)
const apiError = ref<string | null>(null)
const receipts = ref<string[]>([])

const rightsGate = computed(() => !current.value.readiness.ready)
const canApprove = computed(() =>
  canReviewAction(
    props.role,
    "approve",
    current.value.state,
    current.value.readiness.ready,
    current.value.scheduledAt
  )
)
const canRequestChanges = computed(() =>
  canReviewAction(
    props.role,
    "request-changes",
    current.value.state,
    current.value.readiness.ready,
    current.value.scheduledAt
  )
)
const canPublish = computed(() =>
  canReviewAction(
    props.role,
    "publish",
    current.value.state,
    current.value.readiness.ready,
    current.value.scheduledAt
  )
)
const canSchedule = computed(() =>
  canReviewAction(
    props.role,
    "schedule",
    current.value.state,
    current.value.readiness.ready,
    current.value.scheduledAt
  )
)
const canWithdraw = computed(() =>
  canReviewAction(
    props.role,
    "withdraw",
    current.value.state,
    current.value.readiness.ready,
    current.value.scheduledAt
  )
)
const canArchive = computed(() =>
  canReviewAction(
    props.role,
    "archive",
    current.value.state,
    current.value.readiness.ready,
    current.value.scheduledAt
  )
)

async function refreshQueue(): Promise<void> {
  if (busy.value) return
  busy.value = true
  apiError.value = null
  try {
    await refreshFromApi()
    refreshed.value = true
    receipts.value = [`REVIEW_REFRESH · version ${current.value.version}`, ...receipts.value]
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

function openSchedule(): void {
  scheduleKey.value = crypto.randomUUID()
  scheduleRetryPending.value = false
  scheduleOpen.value = true
}

async function confirmSchedule(): Promise<void> {
  if (!canSchedule.value || !publishAt.value || busy.value) return
  await executeSchedule()
}

async function retrySchedule(): Promise<void> {
  if (!scheduleKey.value || busy.value) return
  scheduleRetryPending.value = true
  await executeSchedule()
}

async function executeSchedule(): Promise<void> {
  if (!scheduleKey.value) scheduleKey.value = crypto.randomUUID()
  busy.value = true
  apiError.value = null
  try {
    const result = await scheduleArticle(
      current.value.articleId,
      current.value.version,
      publishAt.value,
      timezone.value,
      scheduleKey.value
    )
    recordReceipt(result)
    await refreshFromApi()
    scheduleOpen.value = false
    if (scheduleRetryPending.value) {
      scheduleKey.value = null
      scheduleRetryPending.value = false
    }
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

async function approve(): Promise<void> {
  if (!canApprove.value || busy.value) return
  await runWorkflow(() => approveArticle(current.value.articleId, current.value.version))
}

async function publish(): Promise<void> {
  if (!canPublish.value || busy.value) return
  await runWorkflow(() => publishArticle(current.value.articleId, current.value.version))
}

function openWithdrawal(): void {
  withdrawalOpen.value = true
}

function openChanges(): void {
  changesOpen.value = true
}

async function confirmChanges(): Promise<void> {
  const reason = changesReason.value.trim()
  if (!canRequestChanges.value || !reason || busy.value) return
  await runWorkflow(() =>
    requestChangesArticle(current.value.articleId, current.value.version, reason)
  )
  if (!apiError.value) {
    changesReason.value = ""
    changesOpen.value = false
  }
}

async function confirmWithdrawal(): Promise<void> {
  const reason = withdrawalReason.value.trim()
  if (!canWithdraw.value || !reason || busy.value) return
  await runWorkflow(() => withdrawArticle(current.value.articleId, current.value.version, reason))
  if (!apiError.value) {
    withdrawalReason.value = ""
    withdrawalOpen.value = false
  }
}

async function archive(): Promise<void> {
  if (!canArchive.value || busy.value) return
  await runWorkflow(() => archiveArticle(current.value.articleId, current.value.version))
}

async function runWorkflow(action: () => Promise<WorkflowResult>): Promise<void> {
  busy.value = true
  apiError.value = null
  try {
    const result = await action()
    recordReceipt(result)
    await refreshFromApi()
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

async function refreshFromApi(): Promise<void> {
  const article = await getPublisherArticle(current.value.articleId)
  current.value = article
  if (article.scheduledAt) {
    const scheduled = new Date(article.scheduledAt)
    publishAt.value = toLocalDateTimeValue(scheduled)
  }
}

function recordReceipt(result: WorkflowResult): void {
  receipts.value = [`${result.status} · ${result.operationId}`, ...receipts.value]
}

function handleApiError(error: unknown): void {
  if (error instanceof StudioApiError && error.status === 409) {
    apiError.value = `409 VERSION_CONFLICT：${error.message}`
    return
  }
  apiError.value = error instanceof Error ? error.message : "Publisher API 請求失敗。"
}

function defaultScheduleValue(): string {
  const value = new Date(Date.now() + 60 * 60 * 1000)
  return toLocalDateTimeValue(value)
}

function toLocalDateTimeValue(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}
</script>

<template>
  <StudioShell
    :role="role"
    active="review"
    :article-id="current.articleId"
    audit-target-type="ARTICLE"
    :audit-target-id="current.articleId"
    title="發布佇列 Review queue"
    eyebrow="Studio / Publisher"
    description="Publisher 才能做發布、排程與撤回；每一次重試都用 idempotency receipt 綁定同一個決策。"
  >
    <template #header-actions>
      <button
        class="studio-button studio-button--quiet"
        type="button"
        :disabled="busy"
        @click="refreshQueue"
      >
        重新整理 Refresh
      </button>
    </template>

    <section class="studio-grid studio-grid--review" aria-label="發布審核工作區">
      <div class="studio-panel studio-panel--primary">
        <div class="studio-review-hero">
          <div>
            <p class="studio-kicker">Article {{ current.articleId }}</p>
            <h2>把內容交給讀者之前</h2>
            <p>{{ current.title }}</p>
          </div>
          <div class="studio-review-hero__stamp">
            <span>Revision</span>
            <strong>{{ current.revisionNumber }}</strong>
            <small>v{{ current.version }}</small>
          </div>
        </div>

        <div class="studio-review-grid">
          <div class="studio-review-card">
            <span class="studio-kicker">Publication readiness</span>
            <strong :class="rightsGate ? 'studio-danger-text' : 'studio-success-text'">
              {{ readinessLabel(current.readiness) }}
            </strong>
            <p>
              {{
                rightsGate
                  ? "發布會被 rights/content gate 阻擋。"
                  : "權利與內容已通過目前的發布檢查。"
              }}
            </p>
          </div>
          <div class="studio-review-card">
            <span class="studio-kicker">State</span>
            <strong>{{ current.state }}</strong>
            <p>{{ refreshed ? "已重新讀取最新 revision。" : "等待 publisher 操作。" }}</p>
          </div>
        </div>

        <p v-if="rightsGate" class="studio-gate-banner" role="alert">
          {{ current.readiness.blockingCodes.join("、") || "NOT_READY" }}：修正內容或 rights record
          後才能發布。
        </p>
        <p v-if="apiError" class="studio-inline-error" role="alert">{{ apiError }}</p>
        <p v-if="!canStudioAction(role, 'publish')" class="studio-inline-error" role="alert">
          {{ missingRoleMessage("publish") }}
        </p>

        <div class="studio-action-row studio-action-row--wrap">
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!canApprove || busy"
            @click="approve"
          >
            核准 Approve
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!canRequestChanges || busy"
            @click="openChanges"
          >
            退回修改 Request changes
          </button>
          <button
            class="studio-button studio-button--primary"
            type="button"
            :disabled="!canPublish || busy"
            @click="publish"
          >
            發布 Publish
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!canSchedule || busy"
            @click="openSchedule"
          >
            排程 Schedule
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!scheduleKey || busy"
            @click="retrySchedule"
          >
            重試 Retry
          </button>
          <button
            class="studio-button studio-button--danger"
            type="button"
            :disabled="!canWithdraw || busy"
            @click="openWithdrawal"
          >
            撤回 Withdraw
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!canArchive || busy"
            @click="archive"
          >
            封存 Archive
          </button>
        </div>

        <form v-if="changesOpen" class="studio-subform" @submit.prevent="confirmChanges">
          <h3>退回修改 Request changes</h3>
          <label class="studio-field" for="studio-changes-reason">
            <span>原因 Reason</span>
            <textarea
              id="studio-changes-reason"
              v-model="changesReason"
              rows="3"
              maxlength="2000"
              required
              :disabled="busy"
            />
          </label>
          <button class="studio-button studio-button--quiet" type="submit" :disabled="busy">
            確認退回 Confirm
          </button>
        </form>

        <form v-if="scheduleOpen" class="studio-subform" @submit.prevent="confirmSchedule">
          <h3>建立排程 Schedule</h3>
          <div class="studio-form-grid">
            <label class="studio-field" for="studio-schedule-timezone">
              <span>時區 Timezone</span>
              <select id="studio-schedule-timezone" v-model="timezone" :disabled="busy">
                <option value="Asia/Taipei">Asia/Taipei</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label class="studio-field" for="studio-schedule-at">
              <span>發布時間 Publish at</span>
              <input
                id="studio-schedule-at"
                v-model="publishAt"
                type="datetime-local"
                required
                :disabled="busy"
              />
            </label>
          </div>
          <p class="studio-help">
            API 會以指定 IANA timezone 解讀 local date-time；worker 只在到期後執行 re-check 與
            snapshot。
          </p>
          <div class="studio-action-row">
            <button class="studio-button studio-button--primary" type="submit" :disabled="busy">
              確認排程 Confirm schedule
            </button>
          </div>
        </form>

        <p v-if="current.scheduledAt" class="studio-action-result" role="status">
          UTC {{ current.scheduledAt }}
        </p>

        <form
          v-if="withdrawalOpen"
          class="studio-subform studio-subform--danger"
          @submit.prevent="confirmWithdrawal"
        >
          <h3>緊急撤回 Emergency withdrawal</h3>
          <label class="studio-field" for="studio-withdraw-reason">
            <span>原因 Reason</span>
            <textarea
              id="studio-withdraw-reason"
              v-model="withdrawalReason"
              rows="3"
              maxlength="500"
              required
              :disabled="busy"
            />
          </label>
          <button class="studio-button studio-button--danger" type="submit" :disabled="busy">
            確認撤回 Confirm withdrawal
          </button>
        </form>

        <p class="studio-workflow-result" role="status">
          <span>Current workflow</span>
          <strong
            >{{ articleStateLabel(current.state) }} · revision {{ current.revisionNumber }}</strong
          >
        </p>
      </div>

      <aside class="studio-panel studio-panel--rail">
        <p class="studio-kicker">API operation receipts</p>
        <h2>每個決策都可重播</h2>
        <ol v-if="receipts.length" class="studio-audit-list">
          <li v-for="(entry, index) in receipts" :key="`${entry}-${index}`">
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <div>
              <strong>{{ entry }}</strong
              ><small>server response · idempotency protected</small>
            </div>
          </li>
        </ol>
        <p v-else class="studio-help">尚未有本次頁面的 API operation receipt。</p>
      </aside>
    </section>
  </StudioShell>
</template>
