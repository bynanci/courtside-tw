<script setup lang="ts">
import { computed } from "vue"

import { canStudioAction } from "./studio-rbac"
import type { StudioRole } from "./studio-contract"
import { roleLabel } from "./studio-contract"

const props = defineProps<{
  role: StudioRole
  active: "articles" | "issues" | "media" | "review" | "audit"
  articleId?: string
  auditTargetType?: "ARTICLE" | "ISSUE" | "MEDIA_ASSET"
  auditTargetId?: string
  title: string
  eyebrow?: string
  description?: string
}>()

const articlePath = computed(() =>
  props.articleId ? `/studio/articles/${props.articleId}` : "/studio/articles"
)
const issuePath = "/studio/issues"
const reviewPath = computed(() =>
  props.articleId ? `/studio/review/${props.articleId}` : "/studio/review"
)
const auditPath = computed(() => {
  const query = new URLSearchParams({ role: props.role })
  if (props.auditTargetType && props.auditTargetId) {
    query.set("targetType", props.auditTargetType)
    query.set("targetId", props.auditTargetId)
  }
  return `/studio/audit?${query.toString()}`
})
</script>

<template>
  <div class="studio-app">
    <aside class="studio-sidebar" aria-label="Studio 導覽">
      <NuxtLink to="/" class="studio-sidebar__brand">Courtside / Studio</NuxtLink>
      <div class="studio-sidebar__identity">
        <span class="studio-sidebar__identity-label">目前角色</span>
        <strong>{{ roleLabel(role) }}</strong>
      </div>
      <nav class="studio-sidebar__nav" aria-label="Studio 工作區">
        <NuxtLink
          v-if="canStudioAction(role, 'edit')"
          :class="{ 'is-active': active === 'articles' }"
          :to="articlePath"
          >文章</NuxtLink
        >
        <NuxtLink
          v-if="canStudioAction(role, 'edit')"
          :class="{ 'is-active': active === 'issues' }"
          :to="issuePath"
          >期刊</NuxtLink
        >
        <NuxtLink
          v-if="canStudioAction(role, 'upload')"
          :class="{ 'is-active': active === 'media' }"
          to="/studio/media?role=EDITOR"
          >媒體庫</NuxtLink
        >
        <NuxtLink
          v-if="canStudioAction(role, 'publish')"
          :class="{ 'is-active': active === 'review' }"
          :to="reviewPath"
          >發布佇列</NuxtLink
        >
        <NuxtLink
          v-if="canStudioAction(role, 'view-audit')"
          :class="{ 'is-active': active === 'audit' }"
          :to="auditPath"
          >稽核軌跡</NuxtLink
        >
      </nav>
      <p class="studio-sidebar__note">每次變更都保留 revision、角色與稽核線索。</p>
    </aside>

    <main class="studio-main">
      <header class="studio-page-header">
        <div>
          <p class="studio-kicker">{{ eyebrow ?? "Editorial control room" }}</p>
          <h1>{{ title }}</h1>
          <p v-if="description" class="studio-page-header__description">{{ description }}</p>
        </div>
        <slot name="header-actions" />
      </header>
      <slot />
    </main>
  </div>
</template>
