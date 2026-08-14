<script setup lang="ts">
import type { PublicIssueDetail } from "../../features/issues/public-issue-api"
import { articleRoute } from "../../features/issues/public-issue-contract"

defineProps<{ issue: PublicIssueDetail }>()
</script>

<template>
  <section id="toc" class="issue-toc" data-testid="issue-toc" aria-labelledby="toc-heading">
    <div class="section-heading">
      <p class="eyebrow">本期目錄</p>
      <h2 id="toc-heading">依編輯順序閱讀</h2>
    </div>
    <ol v-if="issue.sections.length" class="issue-toc__sections">
      <li v-for="section in issue.sections" :key="section.position" class="issue-toc__section">
        <section :aria-labelledby="'section-' + section.position">
          <p class="issue-toc__position">0{{ section.position }}</p>
          <h3 :id="'section-' + section.position">{{ section.title }}</h3>
          <ol class="issue-toc__articles">
            <li v-for="article in section.articles" :key="article.articleId">
              <NuxtLink
                :to="articleRoute(article.slug, issue.slug)"
                class="issue-toc__article-link"
                data-testid="article-link"
              >
                <span class="issue-toc__article-number">{{ article.position }}</span>
                <span>{{ article.title }}</span>
                <span aria-hidden="true">↗</span>
              </NuxtLink>
            </li>
          </ol>
        </section>
      </li>
    </ol>
    <p v-else class="issue-toc__empty">本期公開目錄正在整理中。</p>
  </section>
</template>
