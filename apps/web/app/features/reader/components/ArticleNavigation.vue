<script setup lang="ts">
import { articleRoute, issueRoute } from "../../issues/public-issue-contract"

type ArticleSummary = { articleId: string; slug: string; title: string; position: number }
type TocItem = { id: string; label: string; level: number }

const props = defineProps<{
  issueSlug: string
  issueNavigation: { previous: ArticleSummary | null; next: ArticleSummary | null }
  tocItems: TocItem[]
  mode: "toc" | "footer"
}>()
</script>

<template>
  <nav
    v-if="props.mode === 'toc' && props.tocItems.length"
    id="article-toc"
    data-testid="article-toc"
    class="article-toc"
    aria-label="文章目錄"
  >
    <p class="eyebrow">Contents</p>
    <ol>
      <li v-for="item in props.tocItems" :key="item.id" :data-heading-level="item.level">
        <a :href="`#block-${item.id}`">{{ item.label }}</a>
      </li>
    </ol>
  </nav>

  <nav v-if="props.mode === 'footer'" class="article-navigation" aria-label="文章前後篇">
    <button
      v-if="!props.issueNavigation.previous"
      type="button"
      data-testid="article-previous"
      disabled
    >
      上一篇
    </button>
    <NuxtLink
      v-else
      :to="articleRoute(props.issueNavigation.previous.slug, props.issueSlug)"
      rel="prev"
      data-testid="article-previous"
    >
      上一篇：{{ props.issueNavigation.previous.title }}
    </NuxtLink>

    <NuxtLink
      v-if="props.issueNavigation.next"
      :to="articleRoute(props.issueNavigation.next.slug, props.issueSlug)"
      rel="next"
      data-testid="article-next"
    >
      下一篇：{{ props.issueNavigation.next.title }}
    </NuxtLink>
    <button v-else type="button" data-testid="article-next" disabled>下一篇</button>
  </nav>

  <NuxtLink
    v-if="props.mode === 'footer'"
    :to="`${issueRoute(props.issueSlug)}#toc`"
    class="article-return-toc"
    data-testid="article-return-issue-toc"
  >
    讀完了，返回本期目錄
  </NuxtLink>
</template>
