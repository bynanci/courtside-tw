<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import StudioShell from "../../../features/studio/StudioShell.vue"
import { createEditorArticle, listEditorArticles } from "../../../features/studio/studio-api"
import {
  articleStateLabel,
  resolveRequiredStudioRole,
  type StudioArticleDraft,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"

import { buildArticleDraftInput } from "../../../features/studio/editor/article-draft-form"

const newTitle = ref("")
const newSlug = ref("")
const newDek = ref("")
const creating = ref(false)
const createError = ref<string | null>(null)

async function createDraft() {
  if (creating.value || role.value !== "EDITOR") return
  creating.value = true
  createError.value = null
  try {
    const article = await createEditorArticle(
      buildArticleDraftInput(newTitle.value, newSlug.value, newDek.value)
    )
    await navigateTo(`/studio/articles/${article.articleId}`)
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : "無法建立文章。"
  } finally {
    creating.value = false
  }
}

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
    <section class="studio-panel studio-panel--primary" aria-label="建立文章">
      <h2>建立文章</h2>
      <form class="studio-form-grid" @submit.prevent="createDraft">
        <label class="studio-field"
          ><span>新文章標題</span
          ><input v-model="newTitle" required maxlength="200" :disabled="creating"
        /></label>
        <label class="studio-field"
          ><span>文章網址代稱</span
          ><input v-model="newSlug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" :disabled="creating"
        /></label>
        <label class="studio-field studio-field--wide"
          ><span>新文章導讀</span
          ><textarea v-model="newDek" maxlength="1000" :disabled="creating" />
        </label>
        <button class="studio-button studio-button--primary" type="submit" :disabled="creating">
          {{ creating ? "建立中…" : "建立文章草稿" }}
        </button>
      </form>
      <p v-if="createError" role="alert" class="studio-inline-error">{{ createError }}</p>
    </section>
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
