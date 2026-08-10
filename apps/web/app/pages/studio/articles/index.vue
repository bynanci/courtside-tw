<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import StudioShell from "../../../features/studio/StudioShell.vue"
import { listEditorArticles } from "../../../features/studio/studio-api"
import {
  articleStateLabel,
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
      error.value = "請先使用 OIDC 登入 Studio。"
      return
    }
    role.value = resolveRequiredStudioRole(session.roles, "EDITOR")
    if (!role.value) {
      error.value = "目前的 OIDC session 沒有 EDITOR role。"
      return
    }
    const page = await listEditorArticles()
    articles.value = page.items
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取 Studio article API。"
  } finally {
    loading.value = false
  }
})

const login = () => navigateTo(loginPath(route.fullPath))
</script>

<template>
  <div v-if="loading" class="studio-loading" role="status">
    正在讀取 OIDC session 與 article API…
  </div>
  <section
    v-else-if="error"
    class="studio-panel studio-panel--primary studio-page-error"
    role="alert"
  >
    <h1>Studio 需要有效 session</h1>
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
    active="articles"
    title="文章工作台 Article workspace"
    eyebrow="Studio / Articles"
    description="文章清單來自 editor API；點入後的 revision 與權利 readiness 都由伺服器回傳。"
  >
    <section class="studio-panel studio-panel--primary" aria-label="文章清單">
      <div class="studio-panel__heading">
        <div>
          <p class="studio-kicker">Editorial API</p>
          <h2>目前文章</h2>
        </div>
        <span class="studio-version">{{ articles.length }} items</span>
      </div>
      <ul v-if="articles.length" class="studio-audit-list">
        <li v-for="article in articles" :key="article.articleId">
          <span>{{ article.revisionNumber }}</span>
          <div>
            <NuxtLink :to="`/studio/articles/${article.articleId}`">
              <strong>{{ article.title }}</strong>
            </NuxtLink>
            <small>{{ articleStateLabel(article.state) }} · v{{ article.version }}</small>
          </div>
        </li>
      </ul>
      <p v-else class="studio-help">目前沒有文章。</p>
    </section>
  </StudioShell>
</template>
