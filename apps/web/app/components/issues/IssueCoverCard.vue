<script setup lang="ts">
import { publicMediaUrl, type PublicIssueSummary } from "../../features/issues/public-issue-api"
import { issueRoute } from "../../features/issues/public-issue-contract"

const props = defineProps<{
  issue: PublicIssueSummary
  priority?: boolean
  testId?: string
}>()
const config = useRuntimeConfig()
const coverSrc = computed(() => publicMediaUrl(config.public.apiBaseUrl, props.issue.cover.url))
</script>

<template>
  <article class="issue-cover-card">
    <NuxtLink
      :to="issueRoute(issue.slug)"
      class="issue-cover-card__link"
      :data-testid="testId"
      :aria-label="'閱讀第 ' + issue.issueNumber + ' 期：' + issue.title"
    >
      <div class="issue-cover-card__image-frame">
        <img
          :src="coverSrc"
          :alt="issue.cover.alt"
          :width="issue.cover.width"
          :height="issue.cover.height"
          :loading="priority ? 'eager' : 'lazy'"
          :fetchpriority="priority ? 'high' : 'auto'"
        />
      </div>
      <div class="issue-cover-card__copy">
        <p class="eyebrow">第 {{ issue.issueNumber }} 期</p>
        <h2>{{ issue.title }}</h2>
        <p>{{ issue.summary }}</p>
        <span class="text-link">進入本期目錄<span aria-hidden="true"> →</span></span>
      </div>
    </NuxtLink>
  </article>
</template>
