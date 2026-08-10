<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import StudioShell from "../../../features/studio/StudioShell.vue"
import { listPublisherArticles } from "../../../features/studio/studio-api"
import {
  articleStateLabel,
  readinessLabel,
  resolveRequiredStudioRole,
  type StudioArticleDraft,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"

const route = useRoute()
const role = ref<StudioRole | null>(null)
const articles = ref<StudioArticleDraft[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const session = await readStudioSession()
    if (!session.authenticated) {
      error.value = "請先使用 OIDC 登入 Publisher review。"
      return
    }
    role.value = resolveRequiredStudioRole(session.roles, "PUBLISHER")
    if (!role.value) {
      error.value = "目前的 OIDC session 沒有 PUBLISHER role。"
      return
    }
    const page = await listPublisherArticles()
    articles.value = page.items
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取 publisher article API。"
  } finally {
    loading.value = false
  }
})

const login = () => navigateTo(loginPath(route.fullPath))
</script>

<template>
  <div v-if="loading" class="studio-loading" role="status">
    正在讀取 OIDC session 與 review queue…
  </div>
  <section
    v-else-if="error"
    class="studio-panel studio-panel--primary studio-page-error"
    role="alert"
  >
    <h1>Publisher review 需要有效 session</h1>
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
    active="review"
    title="發布佇列 Review queue"
    eyebrow="Studio / Publisher"
    description="佇列來自 publisher API；選擇一個 frozen revision 後，才可進入核准、排程或發布操作。"
  >
    <section class="studio-panel studio-panel--primary" aria-label="發布審核清單">
      <div class="studio-panel__heading">
        <div>
          <p class="studio-kicker">Publisher API</p>
          <h2>待處理文章</h2>
        </div>
        <span class="studio-version">{{ articles.length }} items</span>
      </div>
      <ul v-if="articles.length" class="studio-audit-list">
        <li v-for="article in articles" :key="article.articleId">
          <span>v{{ article.version }}</span>
          <div>
            <NuxtLink :to="`/studio/review/${article.articleId}`">
              <strong>{{ article.title }}</strong>
            </NuxtLink>
            <small>
              {{ articleStateLabel(article.state) }} · {{ readinessLabel(article.readiness) }}
            </small>
          </div>
        </li>
      </ul>
      <p v-else class="studio-help">目前沒有可供 review 的 article。</p>
    </section>
  </StudioShell>
</template>
