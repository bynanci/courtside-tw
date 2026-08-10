<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import IssueEditor from "../../../features/studio/issues/IssueEditor.vue"
import { listEditorIssues, type IssueDraft } from "../../../features/studio/studio-api"
import {
  resolveRequiredStudioRole,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"

const route = useRoute()
const issueId = String(route.params.id)
const role = ref<StudioRole | null>(null)
const issue = ref<IssueDraft | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const session = await readStudioSession()
    if (!session.authenticated) {
      error.value = "請先使用 OIDC 登入 Issue editor。"
      return
    }
    role.value = resolveRequiredStudioRole(session.roles, "EDITOR")
    if (!role.value) {
      error.value = "目前的 OIDC session 沒有 EDITOR role。"
      return
    }
    let cursor: string | undefined
    do {
      const page = await listEditorIssues(100, cursor)
      issue.value = page.items.find((item) => item.issueId === issueId) ?? null
      cursor = issue.value ? undefined : (page.page.nextCursor ?? undefined)
    } while (!issue.value && cursor)
    if (!issue.value) {
      error.value = "伺服器找不到這個 issue draft。"
    }
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
    <h1>Issue editor 需要有效資料</h1>
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
  <IssueEditor v-else-if="role && issue" :role="role" :issue="issue" />
</template>
