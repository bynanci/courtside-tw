<script setup lang="ts">
import { onMounted, ref } from "vue"
import { navigateTo } from "#app"

import MediaLibrary from "../../../features/studio/media/MediaLibrary.vue"
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
      error.value = "請先使用 OIDC 登入 Media Library。"
      return
    }
    role.value = resolveRequiredStudioRole(session.roles, "EDITOR")
    if (!role.value) {
      error.value = "Media Library 需要 EDITOR role；URL role 不能提升權限。"
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
    <h1>Media Library 需要有效 session</h1>
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
  <MediaLibrary v-else-if="role === 'EDITOR'" :role="role" />
</template>
