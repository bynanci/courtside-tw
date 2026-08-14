<script setup lang="ts">
import ReadingState from "../components/issues/ReadingState.vue"
import { canonicalUrl } from "../composables/public-seo"
import { fetchPublicSearch, type PublicSearchPage } from "../features/search/public-search-api"

const route = useRoute()
const config = useRuntimeConfig()

const routeQuery = computed(() => boundedQuery(route.query.q))
const routeType = computed<"article" | "issue">(() =>
  route.query.type === "issue" ? "issue" : "article"
)
const inputQuery = ref(routeQuery.value)
const inputType = ref<"article" | "issue">(routeType.value)
let activeRequest: AbortController | null = null

const emptyPage = (raw: string): PublicSearchPage => ({
  query: { raw, normalized: "", taxonomy: [] },
  items: [],
  page: { nextCursor: null, limit: 20 }
})

const {
  data: results,
  error,
  pending
} = await useAsyncData(
  "public-search",
  async () => {
    const query = routeQuery.value
    if (!query) return emptyPage(query)
    activeRequest?.abort()
    const request = new AbortController()
    activeRequest = request
    try {
      return await fetchPublicSearch(config.public.apiBaseUrl, query, {
        limit: 20,
        type: routeType.value,
        signal: request.signal
      })
    } finally {
      if (activeRequest === request) activeRequest = null
    }
  },
  {
    watch: [routeQuery, routeType],
    dedupe: "cancel"
  }
)

watch([routeQuery, routeType], ([query, type]) => {
  inputQuery.value = query
  inputType.value = type
})
onBeforeUnmount(() => activeRequest?.abort())

const hasSearch = computed(() => routeQuery.value.length > 0)
const normalizedQuery = computed(() => results.value?.query.normalized ?? "")
const canonical = computed(() => {
  const url = new URL("/search", config.public.siteUrl)
  if (routeQuery.value) url.searchParams.set("q", routeQuery.value)
  if (routeType.value !== "article") url.searchParams.set("type", routeType.value)
  return canonicalUrl(config.public.siteUrl, url.pathname + url.search)
})

useHead(() => ({
  title: routeQuery.value ? `${routeQuery.value} 搜尋結果 — Courtside TW` : "搜尋 — Courtside TW",
  meta: [
    {
      name: "description",
      content: "搜尋已發布的 Courtside TW 台灣籃球文章與期數。"
    }
  ],
  link: [{ rel: "canonical", href: canonical.value }]
}))

async function submitSearch() {
  const query = inputQuery.value.trim().slice(0, 200)
  await navigateTo({
    path: "/search",
    query: {
      ...(query ? { q: query } : {}),
      ...(inputType.value === "issue" ? { type: "issue" } : {})
    }
  })
}

function boundedQuery(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 200) : ""
}
</script>

<template>
  <div class="site-page">
    <header class="site-header">
      <NuxtLink to="/" class="site-brand">Courtside TW</NuxtLink>
      <nav aria-label="主要導覽">
        <NuxtLink to="/">首頁</NuxtLink>
        <NuxtLink to="/issues">所有期數</NuxtLink>
        <NuxtLink to="/search" aria-current="page">搜尋</NuxtLink>
      </nav>
    </header>

    <main class="site-shell search-page">
      <div class="page-intro search-intro">
        <p class="eyebrow">Published Archive</p>
        <h1>搜尋場邊故事</h1>
        <p>只搜尋已發布且仍可公開閱讀的內容；名稱、別名與中英文可混合輸入。</p>
      </div>

      <form class="search-form" role="search" @submit.prevent="submitSearch">
        <div class="search-form__query">
          <label for="public-search-query">關鍵字</label>
          <input
            id="public-search-query"
            v-model="inputQuery"
            data-testid="search-input"
            name="q"
            type="search"
            maxlength="200"
            autocomplete="off"
            placeholder="例如：台籃 Courtside"
          />
        </div>
        <div class="search-form__filter">
          <label for="public-search-type">內容類型</label>
          <select id="public-search-type" v-model="inputType" name="type">
            <option value="article">文章</option>
            <option value="issue">期數</option>
          </select>
        </div>
        <button data-testid="search-submit" type="submit">搜尋</button>
      </form>

      <section class="search-results" aria-live="polite" :aria-busy="pending">
        <p v-if="hasSearch && normalizedQuery" class="search-summary">
          「{{ routeQuery }}」找到 {{ results?.items.length ?? 0 }} 筆公開結果
        </p>

        <ol v-if="results?.items.length" class="search-result-list">
          <li v-for="result in results.items" :key="result.articleId" data-testid="search-result">
            <article>
              <p class="eyebrow">{{ result.issueSlug || "Courtside TW" }}</p>
              <h2>
                <NuxtLink :to="`/articles/${result.slug}`">{{ result.title }}</NuxtLink>
              </h2>
              <p>{{ result.snippet }}</p>
            </article>
          </li>
        </ol>
        <ReadingState
          v-else-if="error"
          tone="error"
          title="搜尋暫時無法完成"
          body="請稍後重試；原始文章閱讀不受搜尋服務影響。"
        />
        <div v-else-if="!pending" data-testid="search-empty">
          <ReadingState
            :title="hasSearch ? '沒有符合的公開內容' : '輸入關鍵字開始搜尋'"
            :body="
              hasSearch
                ? '可改用球隊、聯盟別名或中英文組合；撤回內容不會出現在結果中。'
                : '搜尋會保留在網址中，方便返回與分享。'
            "
          />
        </div>
      </section>
    </main>
  </div>
</template>
