<script setup lang="ts">
import { ref } from "vue"

import SharedIssueCover from "./SharedIssueCover.vue"
import { publicMediaUrl, type PublicIssueSummary } from "../../features/issues/public-issue-api"
import { issueRoute } from "../../features/issues/public-issue-contract"

const props = defineProps<{
  issue: PublicIssueSummary
  priority?: boolean
  testId?: string
}>()
const config = useRuntimeConfig()
const coverSrc = computed(() => publicMediaUrl(config.public.apiBaseUrl, props.issue.cover.url))
const coverMotion = ref<{ capture: (event?: MouseEvent) => void } | null>(null)

function captureCover(event: MouseEvent): void {
  coverMotion.value?.capture(event)
}
</script>

<template>
  <article class="issue-cover-card">
    <NuxtLink
      :to="issueRoute(issue.slug)"
      class="issue-cover-card__link"
      :data-testid="testId"
      :aria-label="'閱讀第 ' + issue.issueNumber + ' 期：' + issue.title"
      @click="captureCover"
    >
      <SharedIssueCover
        ref="coverMotion"
        class="issue-cover-card__image-frame"
        :src="coverSrc"
        :alt="issue.cover.alt"
        :width="issue.cover.width"
        :height="issue.cover.height"
        :issue-slug="issue.slug"
        transition-role="source"
        :priority="priority"
      />
      <div class="issue-cover-card__copy">
        <p class="eyebrow">第 {{ issue.issueNumber }} 期</p>
        <h2>{{ issue.title }}</h2>
        <p>{{ issue.summary }}</p>
        <span class="text-link">進入本期目錄<span aria-hidden="true"> →</span></span>
      </div>
    </NuxtLink>
  </article>
</template>
