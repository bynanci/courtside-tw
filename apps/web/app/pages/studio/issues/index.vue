<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import { listEditorIssues, type IssueDraft } from "../../../features/studio/studio-api"
import {
  resolveRequiredStudioRole,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"
import StudioShell from "../../../features/studio/StudioShell.vue"

const route = useRoute()
const role = ref<StudioRole | null>(null)
const issues = ref<IssueDraft[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

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
    issues.value = (await listEditorIssues()).items
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
    </section>
  </StudioShell>
</template>
