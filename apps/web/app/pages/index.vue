<script setup lang="ts">
import { definePageMeta } from "#imports"
import { ref } from "vue"

import ReadingState from "../components/issues/ReadingState.vue"
import SharedIssueCover from "../components/issues/SharedIssueCover.vue"
import ReaderJourneyRail from "../components/reader/ReaderJourneyRail.vue"
import { canonicalUrl, jsonLd } from "../composables/public-seo"
import { fetchPublicIssuePage, publicMediaUrl } from "../features/issues/public-issue-api"
import { issueRoute } from "../features/issues/public-issue-contract"

definePageMeta({ pageTransition: { name: "reader-route" } })

type SharedIssueCoverHandle = { capture: (event?: MouseEvent) => void }

const config = useRuntimeConfig()
const {
  data: page,
  error,
  pending
} = await useAsyncData("public-home-issues", () =>
  fetchPublicIssuePage(config.public.apiBaseUrl, 20)
)
const featuredIssue = computed(
  () => page.value?.items.find((issue) => issue.articleCount > 0) ?? null
)
const featuredCover = computed(() =>
  featuredIssue.value
    ? publicMediaUrl(config.public.apiBaseUrl, featuredIssue.value.cover.url)
    : null
)
const featuredIssueNumber = computed(() =>
  String(featuredIssue.value?.issueNumber ?? 0).padStart(2, "0")
)
const canonical = canonicalUrl(config.public.siteUrl, "/")
const featuredCoverMotion = ref<SharedIssueCoverHandle | null>(null)

function captureFeaturedCover(event: MouseEvent): void {
  featuredCoverMotion.value?.capture(event)
}

useHead(() => ({
  title: "Courtside TW — 台灣籃球雜誌",
  meta: [
    { name: "description", content: "從本期封面開始，閱讀台灣籃球的場邊觀察。" },
    { property: "og:title", content: "Courtside TW — 台灣籃球雜誌" },
    { property: "og:description", content: "從本期封面開始，閱讀台灣籃球的場邊觀察。" },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical }
  ],
  link: [{ rel: "canonical", href: canonical }],
  script: [
    {
      key: "courtside-home-jsonld",
      type: "application/ld+json",
      innerHTML: jsonLd({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Courtside TW",
        url: canonical,
        inLanguage: "zh-Hant-TW"
      })
    }
  ]
}))
</script>

<template>
  <div class="site-page">
    <a class="skip-link" href="#main-content">跳到主要內容</a>
    <div class="home-header-wrap">
      <header class="site-header site-header--hero">
        <NuxtLink to="/" class="site-brand" aria-label="Courtside TW 首頁">Courtside TW</NuxtLink>
        <nav aria-label="主要導覽">
          <NuxtLink to="/">首頁</NuxtLink>
          <NuxtLink to="/issues">所有期數</NuxtLink>
        </nav>
      </header>
    </div>

    <main id="main-content" class="home-main" tabindex="-1">
      <section class="arena-masthead" aria-labelledby="home-heading">
        <div class="arena-masthead__court" aria-hidden="true"></div>
        <div class="arena-masthead__inner">
          <div class="arena-masthead__copy">
            <p class="eyebrow">
              {{ featuredIssue ? `Issue ${featuredIssueNumber}` : "Taiwan Hoops Magazine" }}
            </p>
            <h1 id="home-heading">先閱讀，<br aria-hidden="true" />再決定你要記住什麼。</h1>
            <p class="arena-masthead__lede">
              Courtside TW 把每一期做成可直接閱讀的台灣籃球雜誌；不需要登入、錢包或外部服務。
            </p>
            <ReaderJourneyRail :active-step="1" tone="hero" />
            <div class="arena-masthead__actions">
              <NuxtLink
                v-if="featuredIssue"
                :to="issueRoute(featuredIssue.slug)"
                class="button-link button-link--primary"
                data-testid="home-issue-link"
                :aria-label="`閱讀第 ${featuredIssue.issueNumber} 期：${featuredIssue.title}`"
                @click="captureFeaturedCover"
              >
                查看本期 <span aria-hidden="true">↗</span>
              </NuxtLink>
              <NuxtLink to="/issues" class="arena-text-link">瀏覽所有期數</NuxtLink>
            </div>
          </div>

          <figure v-if="featuredIssue && featuredCover" class="arena-masthead__issue">
            <div class="arena-masthead__cover-wrap">
              <SharedIssueCover
                ref="featuredCoverMotion"
                class="arena-masthead__cover"
                :src="featuredCover"
                :alt="featuredIssue.cover.alt"
                :width="featuredIssue.cover.width"
                :height="featuredIssue.cover.height"
                :issue-slug="featuredIssue.slug"
                transition-role="source"
                priority
              />
              <span class="arena-masthead__issue-number" aria-hidden="true">
                {{ featuredIssueNumber }}
              </span>
            </div>
            <figcaption>
              <span>最新一期</span>
              <strong>{{ featuredIssue.title }}</strong>
            </figcaption>
          </figure>
          <div v-else class="arena-masthead__issue" aria-hidden="true">
            <span class="arena-masthead__empty-number">00</span>
            <span class="arena-masthead__empty-label">Awaiting publication</span>
          </div>
        </div>
      </section>

      <section class="site-shell home-feature" aria-labelledby="featured-heading">
        <div class="section-heading">
          <p class="eyebrow">本期命題</p>
          <h2 id="featured-heading">一冊雜誌，先給你一條讀法。</h2>
        </div>
        <article v-if="featuredIssue" class="home-editorial-note">
          <p>{{ featuredIssue.summary }}</p>
          <dl>
            <div>
              <dt>Issue</dt>
              <dd>{{ featuredIssueNumber }}</dd>
            </div>
            <div>
              <dt>Stories</dt>
              <dd>{{ featuredIssue.articleCount }}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>Public</dd>
            </div>
          </dl>
          <NuxtLink
            :to="issueRoute(featuredIssue.slug)"
            class="text-link"
            @click="captureFeaturedCover"
          >
            查看編輯目錄 <span aria-hidden="true">→</span>
          </NuxtLink>
        </article>
        <ReadingState
          v-else-if="error"
          tone="error"
          title="目前無法載入本期"
          body="請稍後再試；閱讀路徑不會要求你改用帳號或錢包。"
        />
        <ReadingState
          v-else-if="!pending"
          title="尚未有公開期數"
          body="已發布且權利有效的期數會直接出現在這裡。"
        />
      </section>
    </main>
  </div>
</template>
