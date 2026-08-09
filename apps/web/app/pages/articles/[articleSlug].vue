<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import { canonicalUrl, jsonLd } from "../../composables/public-seo"
import {
  fetchPublicArticle,
  publicMediaUrl,
  PublicArticleApiError,
  type PublicArticleProjection
} from "../../features/issues/public-issue-api"
import {
  articleRoute,
  issueRoute,
  parsePublicArticleSlug,
  parsePublicIssueSlug
} from "../../features/issues/public-issue-contract"

type ContentRun = {
  kind: "text" | "link"
  text: string
  href?: string
}

type ArticleBlock = {
  id: string
  type: string
  version: number
  payload: Record<string, unknown>
}

type ContentDocument = {
  schemaVersion: number
  documentId: string
  blocks: ArticleBlock[]
}

type GalleryItem = {
  assetId: string
  altText: string
  caption?: string
  credit?: string
}

type ResumeProgress = {
  blockId: string
  offset: number
}

const route = useRoute()
const config = useRuntimeConfig()
const rawArticleSlug = Array.isArray(route.params.articleSlug)
  ? route.params.articleSlug[0]
  : route.params.articleSlug
const rawIssueSlug = Array.isArray(route.query.issue) ? route.query.issue[0] : route.query.issue

let articleSlug = "not-found"
let articleSlugValid = true
let issueSlugFromQuery: string | null = null

try {
  articleSlug = parsePublicArticleSlug(String(rawArticleSlug))
} catch {
  articleSlugValid = false
  // Keep malformed input on a safe, non-reflecting not-found path.
}

try {
  issueSlugFromQuery = rawIssueSlug ? parsePublicIssueSlug(String(rawIssueSlug)) : null
} catch {
  issueSlugFromQuery = null
}

const {
  data: article,
  error,
  pending
} = await useAsyncData<PublicArticleProjection | null>("public-article-" + articleSlug, () =>
  articleSlugValid
    ? fetchPublicArticle(config.public.apiBaseUrl, articleSlug)
    : Promise.resolve(null)
)

if (
  import.meta.server &&
  (!articleSlugValid ||
    (error.value instanceof PublicArticleApiError && error.value.statusCode === 404))
) {
  setResponseStatus(useRequestEvent()!, 404)
}

const articleIssueSlug = computed(
  () => article.value?.issueNavigation.issueSlug ?? issueSlugFromQuery ?? ""
)
const articleCanonicalPath = computed(() =>
  article.value ? "/articles/" + article.value.slug : "/articles/" + articleSlug
)
const canonical = computed(() => canonicalUrl(config.public.siteUrl, articleCanonicalPath.value))

const contentDocument = computed(() =>
  article.value ? toContentDocument(article.value.content) : null
)
const articleBlocks = computed(() => contentDocument.value?.blocks ?? [])
const readingTimeMinutes = computed(() => {
  const characters = articleBlocks.value.reduce(
    (total, block) => total + blockText(block).length,
    0
  )
  return Math.max(1, Math.ceil(characters / 450))
})
const resumeStorageKey = computed(() =>
  article.value
    ? "courtside.reader.progress:" +
      article.value.slug +
      ":revision-" +
      article.value.revisionNumber
    : ""
)
const resumeAvailable = ref(false)
const resumeProgress = ref<ResumeProgress | null>(null)
const shareStatus = ref("")
const failedAssets = ref(new Set<string>())
const motionMode = ref<"reduced" | "full">("reduced")
const creativeInView = ref(false)
const runtimeState = ref<"paused" | "running">("paused")
let creativeObserver: IntersectionObserver | null = null
let creativeVisibilityTimer: number | null = null
let creativeVisibilityTimeout: number | null = null

useHead(() => {
  const current = article.value
  const title = current ? current.title + " — Courtside TW" : "文章閱讀頁 — Courtside TW"
  const description = current?.dek ?? "Courtside TW 的公開文章閱讀頁。"
  return {
    title,
    meta: [
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: canonical.value }
    ],
    link: [{ rel: "canonical", href: canonical.value }],
    script: current
      ? [
          {
            key: "courtside-article-jsonld",
            type: "application/ld+json",
            innerHTML: jsonLd({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: current.title,
              description,
              url: canonical.value,
              inLanguage: "zh-Hant-TW"
            })
          }
        ]
      : []
  }
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function toContentDocument(value: unknown): ContentDocument {
  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    return { schemaVersion: 1, documentId: "", blocks: [] }
  }
  return {
    schemaVersion: numberValue(value.schemaVersion, 1),
    documentId: stringValue(value.documentId),
    blocks: value.blocks.filter(isArticleBlock)
  }
}

function isArticleBlock(value: unknown): value is ArticleBlock {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.version === "number" &&
    isRecord(value.payload)
  )
}

function payloadFor(block: ArticleBlock): Record<string, unknown> {
  return block.payload
}

function inlineRuns(value: unknown): ContentRun[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry): ContentRun[] => {
    if (!isRecord(entry) || typeof entry.text !== "string") {
      return []
    }
    if (entry.kind === "link" && typeof entry.href === "string") {
      return [{ kind: "link", text: entry.text, href: entry.href }]
    }
    if (entry.kind === "text") {
      return [{ kind: "text", text: entry.text }]
    }
    return []
  })
}

function listItems(value: unknown): ContentRun[][] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => (isRecord(item) ? inlineRuns(item.content) : []))
}

function galleryItems(value: unknown): GalleryItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): GalleryItem[] => {
    if (!isRecord(item) || typeof item.assetId !== "string" || typeof item.altText !== "string") {
      return []
    }
    return [
      {
        assetId: item.assetId,
        altText: item.altText,
        ...(typeof item.caption === "string" ? { caption: item.caption } : {}),
        ...(typeof item.credit === "string" ? { credit: item.credit } : {})
      }
    ]
  })
}

function safeInlineHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value.includes("\u0000")) {
    return null
  }
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(value)) {
    return value
  }
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function assetMediaUrl(assetId: unknown): string {
  if (typeof assetId !== "string" || !articleSlug) {
    return ""
  }
  try {
    return publicMediaUrl(
      config.public.apiBaseUrl,
      "/media/articles/" + articleSlug + "/" + assetId + ".webp"
    )
  } catch {
    return ""
  }
}

function markAssetFailed(assetKey: string): void {
  failedAssets.value = new Set(failedAssets.value).add(assetKey)
}

function headingTag(value: unknown): "h2" | "h3" | "h4" {
  const level = numberValue(value, 2)
  return level === 4 ? "h4" : level === 3 ? "h3" : "h2"
}

function listTag(value: unknown): "ol" | "ul" {
  return value === true ? "ol" : "ul"
}

function dividerClass(value: unknown): string {
  return value === "space" ? "article-divider article-divider--space" : "article-divider"
}

function relatedArticleHref(value: unknown): string | null {
  if (typeof value !== "string" || !articleIssueSlug.value) {
    return null
  }
  try {
    return articleRoute(value, articleIssueSlug.value)
  } catch {
    return null
  }
}

function blockText(block: ArticleBlock): string {
  const payload = payloadFor(block)
  switch (block.type) {
    case "paragraph":
    case "quote":
      return inlineRuns(payload.content)
        .map((run) => run.text)
        .join("")
    case "heading":
      return stringValue(payload.text)
    case "list":
      return listItems(payload.items)
        .flat()
        .map((run) => run.text)
        .join("")
    case "stat":
      return (
        stringValue(payload.label) +
        stringValue(payload.value) +
        stringValue(payload.unit) +
        stringValue(payload.context)
      )
    case "video":
      return stringValue(payload.title) + stringValue(payload.caption)
    case "related-reading":
      return stringValue(payload.label)
    case "image":
      return stringValue(payload.altText) + stringValue(payload.caption)
    case "gallery":
      return galleryItems(payload.items)
        .map((item) => item.altText + (item.caption ?? ""))
        .join("")
    case "generative-canvas":
      return stringValue(payload.dataSummary) + stringValue(payload.altText)
    default:
      return ""
  }
}

function renderHash(block: ArticleBlock): string {
  const payload = payloadFor(block)
  return "court-pulse-v1-" + String(numberValue(payload.seed)) + "-stable"
}

function syncRuntimeState(): void {
  runtimeState.value =
    creativeInView.value && typeof document !== "undefined" && !document.hidden
      ? "running"
      : "paused"
}

function creativeTarget(): HTMLElement | null {
  return typeof document !== "undefined"
    ? document.querySelector<HTMLElement>('[data-testid="generative-canvas"]')
    : null
}

function stopCreativeVisibilityWatch(): void {
  if (typeof window === "undefined") {
    return
  }
  if (creativeVisibilityTimer !== null) {
    window.clearInterval(creativeVisibilityTimer)
    creativeVisibilityTimer = null
  }
  if (creativeVisibilityTimeout !== null) {
    window.clearTimeout(creativeVisibilityTimeout)
    creativeVisibilityTimeout = null
  }
}

function updateCreativeVisibility(): void {
  const target = creativeTarget()
  if (!target || typeof window === "undefined") {
    return
  }
  const { top, bottom } = target.getBoundingClientRect()
  if (top < window.innerHeight && bottom > 0) {
    creativeInView.value = true
    syncRuntimeState()
    creativeObserver?.disconnect()
    stopCreativeVisibilityWatch()
  }
}

function startCreativeVisibilityWatch(): void {
  if (typeof window === "undefined" || creativeInView.value) {
    return
  }
  updateCreativeVisibility()
  if (creativeInView.value) {
    return
  }
  creativeVisibilityTimer = window.setInterval(updateCreativeVisibility, 50)
  creativeVisibilityTimeout = window.setTimeout(stopCreativeVisibilityWatch, 5000)
}

function handleCreativeScroll(): void {
  updateCreativeVisibility()
}

function handleReaderScroll(): void {
  handleCreativeScroll()
  saveReadingProgress()
}

function observeCreative(): void {
  const target = creativeTarget()
  if (!target) {
    return
  }
  if (typeof IntersectionObserver === "undefined") {
    creativeInView.value = true
    syncRuntimeState()
    return
  }
  creativeObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        creativeInView.value = true
        syncRuntimeState()
        creativeObserver?.disconnect()
      }
    },
    { threshold: 0.01 }
  )
  creativeObserver.observe(target)
  startCreativeVisibilityWatch()
}

async function shareArticle(): Promise<void> {
  shareStatus.value = ""
  const url = canonical.value
  const title = article.value?.title ?? "Courtside TW"
  if (typeof navigator === "undefined") {
    shareStatus.value = "請使用下方文章連結。"
    return
  }
  try {
    if (navigator.share) {
      await navigator.share({ title, url })
      shareStatus.value = "文章已分享。"
      return
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
      shareStatus.value = "文章連結已複製。"
      return
    }
  } catch {
    shareStatus.value = "分享未完成，請使用下方文章連結。"
    return
  }
  shareStatus.value = "請使用下方文章連結。"
}

function parseResumeProgress(value: unknown): ResumeProgress | null {
  if (
    !isRecord(value) ||
    typeof value.blockId !== "string" ||
    typeof value.offset !== "number" ||
    value.offset < 0 ||
    value.offset > 1
  ) {
    return null
  }
  return { blockId: value.blockId, offset: value.offset }
}

function restoreResumeProgress(): void {
  if (typeof window === "undefined" || !resumeProgress.value) {
    return
  }
  const target = document.getElementById("block-" + resumeProgress.value.blockId)
  if (!target) {
    return
  }
  const rect = target.getBoundingClientRect()
  const targetTop =
    window.scrollY +
    rect.top +
    rect.height * resumeProgress.value.offset -
    Math.min(window.innerHeight * 0.25, 160)
  window.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" })
}

function saveReadingProgress(): void {
  if (typeof window === "undefined" || !resumeStorageKey.value) {
    return
  }
  const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]"))
  if (blocks.length === 0) {
    return
  }
  const current =
    blocks.find((block) => {
      const rect = block.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < window.innerHeight * 0.6
    }) ?? blocks[0]
  const rect = current.getBoundingClientRect()
  const offset = Math.min(
    1,
    Math.max(0, (window.innerHeight * 0.25 - rect.top) / Math.max(rect.height, 1))
  )
  const progress = { blockId: current.dataset.blockId ?? "", offset }
  if (!progress.blockId) {
    return
  }
  window.localStorage.setItem(resumeStorageKey.value, JSON.stringify(progress))
  resumeProgress.value = progress
  resumeAvailable.value = true
}

function loadResumeProgress(): void {
  resumeAvailable.value = false
  resumeProgress.value = null
  if (typeof window === "undefined" || !resumeStorageKey.value) {
    return
  }
  const saved = window.localStorage.getItem(resumeStorageKey.value)
  if (!saved) {
    return
  }
  try {
    const progress = parseResumeProgress(JSON.parse(saved))
    if (progress) {
      resumeProgress.value = progress
      resumeAvailable.value = true
      void nextTick().then(restoreResumeProgress)
    }
  } catch {
    // Ignore malformed local progress and keep the page readable.
  }
}

let stopResumeWatch: (() => void) | null = null

onMounted(() => {
  if (typeof window !== "undefined") {
    motionMode.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "reduced"
      : "full"
    window.addEventListener("scroll", handleReaderScroll, { passive: true })
    window.addEventListener("beforeunload", saveReadingProgress)
  }
  document.addEventListener("scroll", handleReaderScroll, { passive: true, capture: true })
  document.addEventListener("visibilitychange", syncRuntimeState)
  stopResumeWatch = watch(resumeStorageKey, loadResumeProgress, { immediate: true })
  void nextTick().then(() => observeCreative())
})

onBeforeUnmount(() => {
  stopResumeWatch?.()
  document.removeEventListener("scroll", handleReaderScroll, true)
  document.removeEventListener("visibilitychange", syncRuntimeState)
  window.removeEventListener("scroll", handleReaderScroll)
  window.removeEventListener("beforeunload", saveReadingProgress)
  stopCreativeVisibilityWatch()
  creativeObserver?.disconnect()
  creativeObserver = null
})
</script>

<template>
  <div class="site-page">
    <header class="site-header">
      <NuxtLink to="/" class="site-brand">Courtside TW</NuxtLink>
      <nav aria-label="主要導覽">
        <NuxtLink to="/">首頁</NuxtLink>
        <NuxtLink to="/issues">所有期數</NuxtLink>
      </nav>
    </header>

    <main class="site-shell article-reader">
      <NuxtLink v-if="articleIssueSlug" :to="issueRoute(articleIssueSlug)" class="back-link"
        >← 返回本期目錄</NuxtLink
      >
      <NuxtLink v-else to="/issues" class="back-link">← 返回所有期數</NuxtLink>

      <article
        v-if="article"
        data-testid="article-document"
        :data-motion="motionMode"
        aria-labelledby="article-heading"
      >
        <header class="article-header" data-testid="article-header">
          <p class="eyebrow">Public Reading</p>
          <h1 id="article-heading">{{ article.title }}</h1>
          <p v-if="article.dek" class="article-dek">{{ article.dek }}</p>
          <div class="article-meta">
            <span data-testid="article-byline">Courtside TW 編輯部</span>
            <span data-testid="article-reading-time">{{ readingTimeMinutes }} 分鐘閱讀</span>
            <NuxtLink
              :to="issueRoute(articleIssueSlug)"
              data-testid="article-issue-link"
              class="text-link"
              >返回本期目錄</NuxtLink
            >
            <button
              type="button"
              data-testid="article-share"
              class="button-link button-link--quiet"
              @click="shareArticle"
            >
              分享文章
            </button>
            <a :href="canonical" data-testid="article-share-fallback" class="text-link">
              開啟文章連結
            </a>
            <span v-if="shareStatus" data-testid="share-status" role="status">{{
              shareStatus
            }}</span>
          </div>
        </header>

        <p v-if="resumeAvailable" data-testid="reader-resume" class="reader-resume" role="status">
          繼續閱讀：已記住你上次讀到的位置。
        </p>

        <aside data-testid="article-toc" class="article-toc" aria-label="文章目錄">
          <p class="eyebrow">Contents</p>
          <ol>
            <li v-for="block in articleBlocks" :key="block.id">
              <a :href="'#block-' + block.id">{{ blockText(block) || block.type }}</a>
            </li>
          </ol>
        </aside>

        <div data-testid="article-content" class="article-content">
          <section
            v-for="block in articleBlocks"
            :id="'block-' + block.id"
            :key="block.id"
            class="article-block"
            :data-block-id="block.id"
            :data-block-type="block.type"
          >
            <p v-if="block.type === 'paragraph'" class="article-paragraph">
              <template
                v-for="(run, runIndex) in inlineRuns(payloadFor(block).content)"
                :key="runIndex"
              >
                <a
                  v-if="run.kind === 'link' && safeInlineHref(run.href)"
                  :href="safeInlineHref(run.href) ?? '#'"
                  rel="noreferrer noopener"
                  target="_blank"
                  >{{ run.text }}</a
                >
                <span v-else>{{ run.text }}</span>
              </template>
            </p>

            <component
              :is="headingTag(payloadFor(block).level)"
              v-else-if="block.type === 'heading'"
            >
              {{ stringValue(payloadFor(block).text) }}
            </component>

            <component :is="listTag(payloadFor(block).ordered)" v-else-if="block.type === 'list'">
              <li v-for="(runs, itemIndex) in listItems(payloadFor(block).items)" :key="itemIndex">
                <template v-for="(run, runIndex) in runs" :key="runIndex">
                  <a
                    v-if="run.kind === 'link' && safeInlineHref(run.href)"
                    :href="safeInlineHref(run.href) ?? '#'"
                    rel="noreferrer noopener"
                    target="_blank"
                    >{{ run.text }}</a
                  >
                  <span v-else>{{ run.text }}</span>
                </template>
              </li>
            </component>

            <blockquote v-else-if="block.type === 'quote'">
              <p>
                <template
                  v-for="(run, runIndex) in inlineRuns(payloadFor(block).content)"
                  :key="runIndex"
                >
                  <a
                    v-if="run.kind === 'link' && safeInlineHref(run.href)"
                    :href="safeInlineHref(run.href) ?? '#'"
                    rel="noreferrer noopener"
                    target="_blank"
                    >{{ run.text }}</a
                  >
                  <span v-else>{{ run.text }}</span>
                </template>
              </p>
              <cite v-if="payloadFor(block).attribution">{{
                stringValue(payloadFor(block).attribution)
              }}</cite>
            </blockquote>

            <div
              v-else-if="block.type === 'divider'"
              :class="dividerClass(payloadFor(block).style)"
              aria-hidden="true"
            />

            <figure v-else-if="block.type === 'image'" class="article-image">
              <img
                v-if="assetMediaUrl(payloadFor(block).assetId)"
                :src="assetMediaUrl(payloadFor(block).assetId)"
                :alt="stringValue(payloadFor(block).altText)"
                loading="lazy"
                @error="markAssetFailed(block.id)"
              />
              <figcaption
                v-if="failedAssets.has(block.id)"
                data-testid="article-image-fallback"
                class="article-image-fallback"
              >
                圖片目前無法載入，已保留文字備援：{{ stringValue(payloadFor(block).altText) }}
              </figcaption>
              <figcaption v-if="payloadFor(block).caption">
                {{ stringValue(payloadFor(block).caption) }}
              </figcaption>
            </figure>

            <div
              v-else-if="block.type === 'gallery'"
              class="article-gallery"
              :class="{
                'article-gallery--stack': payloadFor(block).layout === 'stack'
              }"
            >
              <figure
                v-for="(item, itemIndex) in galleryItems(payloadFor(block).items)"
                :key="block.id + '-' + itemIndex"
              >
                <img
                  v-if="assetMediaUrl(item.assetId)"
                  :src="assetMediaUrl(item.assetId)"
                  :alt="item.altText"
                  loading="lazy"
                  @error="markAssetFailed(block.id + '-' + itemIndex)"
                />
                <figcaption v-if="failedAssets.has(block.id + '-' + itemIndex)">
                  圖片備援：{{ item.altText }}
                </figcaption>
                <figcaption v-else-if="item.caption">
                  {{ item.caption }}
                </figcaption>
              </figure>
            </div>

            <aside v-else-if="block.type === 'stat'" class="article-stat">
              <strong>{{ stringValue(payloadFor(block).label) }}</strong>
              <span>{{ stringValue(payloadFor(block).value) }}</span>
              <small>{{ stringValue(payloadFor(block).unit) }}</small>
              <p>{{ stringValue(payloadFor(block).context) }}</p>
            </aside>

            <section v-else-if="block.type === 'video'" class="article-video">
              <p class="eyebrow">Video</p>
              <h3>{{ stringValue(payloadFor(block).title) }}</h3>
              <p>影片權利尚未開放；本頁保留可理解的文字內容。</p>
              <p v-if="payloadFor(block).caption">
                {{ stringValue(payloadFor(block).caption) }}
              </p>
            </section>

            <aside v-else-if="block.type === 'related-reading'" class="article-related">
              <p class="eyebrow">Related reading</p>
              <NuxtLink
                v-if="relatedArticleHref(payloadFor(block).articleSlug)"
                :to="relatedArticleHref(payloadFor(block).articleSlug) ?? '/issues'"
              >
                {{ stringValue(payloadFor(block).label) }}
              </NuxtLink>
            </aside>

            <section v-else-if="block.type === 'generative-canvas'" class="article-generative">
              <div
                data-testid="generative-poster"
                data-fallback="true"
                role="img"
                :aria-label="stringValue(payloadFor(block).altText)"
              >
                {{ stringValue(payloadFor(block).dataSummary) }}
              </div>
              <div
                data-testid="generative-canvas"
                :data-seed="String(numberValue(payloadFor(block).seed))"
                :data-render-hash="renderHash(block)"
                :data-runtime-state="runtimeState"
                role="img"
                :aria-label="stringValue(payloadFor(block).altText)"
              >
                <span v-if="creativeInView" data-testid="creative-runtime">
                  bounded creative runtime
                </span>
              </div>
              <p>{{ stringValue(payloadFor(block).dataSummary) }}</p>
            </section>
          </section>
        </div>

        <nav class="article-navigation" aria-label="文章前後篇">
          <button
            v-if="!article.issueNavigation.previous"
            type="button"
            data-testid="article-previous"
            disabled
          >
            上一篇
          </button>
          <NuxtLink
            v-else
            :to="articleRoute(article.issueNavigation.previous.slug, articleIssueSlug)"
            data-testid="article-previous"
          >
            上一篇：{{ article.issueNavigation.previous.title }}
          </NuxtLink>

          <NuxtLink
            v-if="article.issueNavigation.next"
            :to="articleRoute(article.issueNavigation.next.slug, articleIssueSlug)"
            data-testid="article-next"
          >
            下一篇：{{ article.issueNavigation.next.title }}
          </NuxtLink>
          <button v-else type="button" data-testid="article-next" disabled>下一篇</button>
        </nav>
      </article>

      <section
        v-else-if="error instanceof PublicArticleApiError && error.statusCode === 404"
        data-testid="article-error-state"
        class="reading-state"
      >
        <p class="eyebrow">Not found</p>
        <h1>找不到這篇文章</h1>
        <p>這篇文章可能尚未發布、已撤回，或網址不正確。</p>
      </section>
      <section v-else-if="error" class="reading-state reading-state--error">
        <p class="eyebrow">Unavailable</p>
        <h1>文章暫時無法載入</h1>
        <p>請稍後重試。</p>
      </section>
      <section v-else-if="!pending" class="reading-state">
        <p class="eyebrow">Not found</p>
        <h1>找不到這篇文章</h1>
        <p>請從公開期數目錄重新開始。</p>
      </section>
    </main>
  </div>
</template>
