<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import ArticleEditor from "../../../features/studio/editor/ArticleEditor.vue"
import { getEditorArticle } from "../../../features/studio/studio-api"
import {
  resolveRequiredStudioRole,
  type StudioArticleDraft,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"

const route = useRoute()
const role = ref<StudioRole | null>(null)
const draft = ref<StudioArticleDraft | null>(null)
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
    const articleId = String(route.params.id)
    draft.value = await getEditorArticle(articleId)
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
  <ArticleEditor v-else-if="role && draft" :role="role" :draft="draft" />
  <p v-else class="studio-loading">無法建立 article editor。</p>
</template>
