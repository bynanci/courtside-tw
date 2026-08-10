<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import StudioShell from "../../../features/studio/StudioShell.vue"
import {
  listEditorialAudit,
  type AuditEvent,
  StudioApiError
} from "../../../features/studio/studio-api"
import {
  parseAuditTarget,
  type StudioAuditTarget
} from "../../../features/studio/audit/audit-contract"
import { resolveStudioRole, type StudioRole } from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"

const route = useRoute()
const role = ref<StudioRole | null>(null)
const target = ref<StudioAuditTarget | null>(null)
const events = ref<AuditEvent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const session = await readStudioSession()
    if (!session.authenticated) {
      error.value = "請先使用 OIDC 登入 Studio audit。"
      return
    }

    const requestedRole = Array.isArray(route.query.role) ? route.query.role[0] : route.query.role
    role.value = resolveStudioRole(session.roles, requestedRole, "PUBLISHER")
    if (!role.value) {
      error.value = "目前的 OIDC session 沒有 EDITOR 或 PUBLISHER role。"
      return
    }

    target.value = parseAuditTarget(route.query.targetType, route.query.targetId)
    if (!target.value) return

    const page = await listEditorialAudit(target.value.targetType, target.value.targetId)
    events.value = page.items
  } catch (cause) {
    if (cause instanceof StudioApiError && cause.status === 403) {
      error.value = "目前的 OIDC session 沒有查看稽核軌跡的權限。"
    } else {
      error.value = cause instanceof Error ? cause.message : "無法讀取 audit API。"
    }
  } finally {
    loading.value = false
  }
})

const login = () => navigateTo(loginPath(route.fullPath))

function formatOccurredAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei"
  }).format(date)
}

function formatMetadata(value: Record<string, unknown>): string {
  return JSON.stringify(value)
}
</script>

<template>
  <div v-if="loading" class="studio-loading" role="status">正在讀取 OIDC session 與 audit API…</div>
  <section
    v-else-if="error"
    class="studio-panel studio-panel--primary studio-page-error"
    role="alert"
  >
    <h1>Audit trail 需要有效 session</h1>
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
    active="audit"
    title="稽核軌跡 Audit trail"
    eyebrow="Studio / Evidence"
    description="只讀取 append-only audit API；沒有 target context 時不顯示任何虛構事件。"
  >
    <section class="studio-panel studio-panel--primary studio-audit-page">
      <div class="studio-panel__heading">
        <div>
          <p class="studio-kicker">Append-only evidence</p>
          <h2>最近的決策</h2>
        </div>
        <span class="studio-version">read only</span>
      </div>

      <p v-if="target" class="studio-help">
        Target {{ target.targetType }} · {{ target.targetId }} · Asia/Taipei 顯示時間
      </p>
      <p v-else class="studio-help" role="status">
        請從文章、期數或媒體頁面進入稽核軌跡；目前沒有可查詢的 target。
      </p>

      <div
        v-if="target && events.length"
        class="studio-audit-table"
        role="table"
        aria-label="Studio 稽核事件"
      >
        <div class="studio-audit-table__row studio-audit-table__row--head" role="row">
          <span>時間</span><span>事件</span><span>Actor</span>
        </div>
        <div v-for="event in events" :key="event.id" class="studio-audit-table__row" role="row">
          <time :datetime="event.occurredAt">{{ formatOccurredAt(event.occurredAt) }}</time>
          <div>
            <strong>{{ event.action }}</strong>
            <small>{{ formatMetadata(event.metadata) }}</small>
          </div>
          <span>{{ event.actorSubject }}</span>
        </div>
      </div>
      <p v-else-if="target" class="studio-help" role="status">
        這個 target 目前沒有可讀取的 audit event。
      </p>
    </section>
  </StudioShell>
</template>
