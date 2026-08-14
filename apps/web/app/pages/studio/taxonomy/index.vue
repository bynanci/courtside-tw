<script setup lang="ts">
import { navigateTo } from "#app"
import { onMounted, ref } from "vue"

import TaxonomyManager from "../../../features/studio/taxonomy/TaxonomyManager.vue"
import {
  resolveRequiredStudioRole,
  type StudioRole
} from "../../../features/studio/studio-contract"
import { loginPath, readStudioSession } from "../../../features/studio/studio-session"

const route = useRoute()
const role = ref<StudioRole | null>(null)
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
      error.value = "Taxonomy management 需要 EDITOR role；URL 不能提升權限。"
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取 OIDC session。"
  } finally {
    loading.value = false
  }
})

const login = () => navigateTo(loginPath(route.fullPath))
</script>

<template>
  <div v-if="loading" class="studio-loading" role="status">正在讀取 OIDC session…</div>
  <section
    v-else-if="error"
    class="studio-panel studio-panel--primary studio-page-error"
    role="alert"
  >
    <h1>Taxonomy management 需要有效 session</h1>
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
  <TaxonomyManager v-else-if="role === 'EDITOR'" :role="role" />
</template>
