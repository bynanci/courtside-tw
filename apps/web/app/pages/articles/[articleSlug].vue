<script setup lang="ts">
import { useState } from "#app"
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import { canonicalUrl } from "../../composables/public-seo"
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
import {
  legacyProgressKey,
  progressIndexKey,
  selectViewportProgress,
  useLocalReadingProgress,
  type LocalReadingContext,
  type ProgressStorage,
  type ReadingBlockAnchor
} from "../../features/reader/composables/useLocalReadingProgress"
import ContentDocumentRenderer from "../../components/content-blocks/ContentDocumentRenderer.vue"
import type { ContentBlockTelemetry } from "../../components/content-blocks/registry"
import { formatMediaAttribution } from "../../components/content-blocks/rendering"
import ArticleNavigation from "../../features/reader/components/ArticleNavigation.vue"
import BookmarkControl from "../../features/reader/components/BookmarkControl.vue"
import ReadingProgress from "../../features/reader/components/ReadingProgress.vue"
import ShareArticleButton from "../../features/reader/components/ShareArticleButton.vue"
import { readingProgressPercent } from "../../features/reader/reading-progress"
import { buildArticleSeo } from "../../features/reader/seo/article-seo"
import {
  putProgress as putServerProgress,
  readReaderSession,
  ReaderLibraryApiError
} from "../../features/library/reader-library-api"

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

type DocumentNavigationType = "navigate" | "reload" | "back_forward" | "prerender"
type DocumentNavigationEntry = {
  name: string
  type: DocumentNavigationType
}

const RELOAD_GUARD_ATTRIBUTE = "data-reader-reload-restoration-handled"
const READER_PROGRESS_WRITE_INTERVAL_MS = 250
const RELOAD_SCROLL_SNAPSHOT_KEY = "courtside.reader.reload-scroll:v1"

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
    ? fetchPublicArticle(config.public.apiBaseUrl, articleSlug, issueSlugFromQuery)
    : Promise.resolve(null)
)
const articleUnavailable = computed(
  () => !articleSlugValid || isUnavailableArticleError(error.value)
)

if (import.meta.server) {
  if (articleUnavailable.value) {
    setResponseStatus(useRequestEvent()!, 404)
  } else if (error.value) {
    setResponseStatus(useRequestEvent()!, 503)
  }
}

const articleIssueSlug = computed(
  () => article.value?.issueNavigation.issueSlug ?? issueSlugFromQuery ?? ""
)
const articleCanonicalPath = computed(() => {
  const expectedPath = article.value
    ? "/articles/" + article.value.slug
    : "/articles/" + articleSlug
  return article.value?.canonicalPath === expectedPath ? article.value.canonicalPath : expectedPath
})
const canonical = computed(() => canonicalUrl(config.public.siteUrl, articleCanonicalPath.value))
const articleShareImage = computed(() => {
  const current = article.value
  if (!current) return undefined
  const media = current.media.find((candidate) => candidate.variant === "wide") ?? current.media[0]
  if (!media) return undefined
  try {
    return publicMediaUrl(config.public.apiBaseUrl, media.url)
  } catch {
    return undefined
  }
})

const contentDocument = computed(() =>
  article.value ? toContentDocument(article.value.content) : null
)
const articleBlocks = computed(() => contentDocument.value?.blocks ?? [])
const readingTimeMinutes = computed(() => {
  if (article.value?.readingTimeMinutes) {
    return article.value.readingTimeMinutes
  }
  const characters = articleBlocks.value.reduce(
    (total, block) => total + blockText(block).length,
    0
  )
  return Math.max(1, Math.ceil(characters / 450))
})
const articleTocItems = computed(() =>
  articleBlocks.value.flatMap((block) => {
    if (block.type !== "heading") return []
    const label = stringValue(block.payload.text).trim()
    return label ? [{ id: block.id, label, level: numberValue(block.payload.level, 2) }] : []
  })
)
const readingContext = computed<LocalReadingContext | null>(() =>
  article.value
    ? {
        articleId: article.value.articleId,
        revisionId: article.value.revisionId,
        revisionNumber: article.value.revisionNumber,
        articleSlug: article.value.slug,
        articleTitle: article.value.title
      }
    : null
)
const readingBlockAnchors = computed<ReadingBlockAnchor[]>(() =>
  articleBlocks.value.map((block, index) => ({
    id: block.id,
    label: blockAnchorLabel(index)
  }))
)
const readingProgress = useLocalReadingProgress()
const { resumePrompt } = readingProgress
const visibleReadingProgress = ref(0)
const failedAssets = ref(new Set<string>())
const contentBlockTelemetry = ref<ContentBlockTelemetry[]>([])
const motionMode = ref<"reduced" | "full">("reduced")
const clientReady = ref(false)
const interactiveEnabled = ref(false)
const readerCanSync = ref(false)
const progressSyncState = ref<"idle" | "syncing" | "synced" | "local-only">("idle")
const readerHasMounted = useState("public-article-reader-has-mounted", () => false)
let reloadGuardActive = false
let reloadProgressLoaded = false
let reloadResumeChoicePending = false
let reloadLifecycleReady = false
let reloadReleaseScheduled = false
let reloadChosenAction: "continue" | "start-over" | null = null
let reloadManualScrollPosition: number | null = null
let previousScrollRestoration: "auto" | "manual" | null = null
let progressSaveTimer: number | null = null
let progressSyncQueue = Promise.resolve()

useHead(() => {
  const current = article.value
  return buildArticleSeo({
    siteUrl: config.public.siteUrl,
    slug: current?.slug ?? articleSlug,
    canonicalPath: articleCanonicalPath.value,
    title: current?.title ?? "文章閱讀頁",
    ...(current?.dek ? { description: current.dek } : {}),
    contributors: current?.contributors ?? [],
    ...(current?.publishedAt ? { publishedAt: current.publishedAt } : {}),
    ...(current?.updatedAt ? { modifiedAt: current.updatedAt } : {}),
    ...(articleShareImage.value ? { imageUrl: articleShareImage.value } : {})
  })
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isUnavailableArticleError(value: unknown): boolean {
  if (value instanceof PublicArticleApiError) {
    return value.statusCode === 404 || value.statusCode === 410
  }
  if (!isRecord(value)) {
    return false
  }
  const status = value.statusCode ?? value.status
  return status === 404 || status === 410
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

function assetMediaUrl(assetId: unknown, variant = "inline"): string {
  const media = assetMedia(assetId, variant)
  if (!media) {
    return ""
  }
  try {
    return publicMediaUrl(config.public.apiBaseUrl, media.url)
  } catch {
    return ""
  }
}

function assetMedia(
  assetId: unknown,
  variant = "inline"
): PublicArticleProjection["media"][number] | null {
  if (typeof assetId !== "string" || !article.value) {
    return null
  }
  return (
    article.value.media.find(
      (candidate) => candidate.assetId === assetId && candidate.variant === variant
    ) ?? null
  )
}

function assetMediaWidth(assetId: unknown, variant = "inline"): number | undefined {
  return assetMedia(assetId, variant)?.width
}

function assetMediaHeight(assetId: unknown, variant = "inline"): number | undefined {
  return assetMedia(assetId, variant)?.height
}

function assetMediaAttribution(
  assetId: unknown,
  variant = "inline",
  payloadCredit?: unknown
): string {
  return formatMediaAttribution(assetMedia(assetId, variant), payloadCredit)
}

const CONTRIBUTOR_ROLE_LABELS: Record<string, string> = {
  AUTHOR: "作者",
  EDITOR: "編輯",
  PHOTOGRAPHER: "攝影",
  ILLUSTRATOR: "插畫",
  TRANSLATOR: "翻譯",
  DESIGNER: "設計"
}

function contributorRoleLabel(value: unknown): string {
  return typeof value === "string" ? (CONTRIBUTOR_ROLE_LABELS[value] ?? "貢獻者") : "貢獻者"
}

function publicDateLabel(value: string): string {
  const instant = Date.parse(value)
  if (!Number.isFinite(instant)) {
    return "日期未提供"
  }
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "long",
    timeZone: "Asia/Taipei"
  }).format(new Date(instant))
}

function markAssetFailed(assetKey: string): void {
  failedAssets.value = new Set(failedAssets.value).add(assetKey)
}

function isAssetFailed(assetKey: string): boolean {
  return failedAssets.value.has(assetKey)
}

function recordContentBlockTelemetry(event: ContentBlockTelemetry): void {
  if (
    contentBlockTelemetry.value.some(
      (entry) => entry.code === event.code && entry.blockId === event.blockId
    )
  ) {
    return
  }
  contentBlockTelemetry.value = [...contentBlockTelemetry.value, event].slice(-50)
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

function handleReaderScroll(): void {
  releaseReloadGuardAfterManualScroll()
  updateVisibleReadingProgress()
  scheduleReadingProgressSave()
}

function updateVisibleReadingProgress(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return
  }
  visibleReadingProgress.value = readingProgressPercent(
    window.scrollY,
    Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    window.innerHeight
  )
}

async function enableCreative(): Promise<void> {
  interactiveEnabled.value = true
  await nextTick()
}

function saveReadingProgress(): void {
  const storage = browserProgressStorage()
  const context = readingContext.value
  if (!storage || !context) {
    return
  }
  const documentBottom = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  )
  const scrollableHeight = Math.max(documentBottom - window.innerHeight, 1)
  const documentProgress = Math.min(1, Math.max(0, window.scrollY / scrollableHeight))
  if (documentProgress > 0.95) {
    readingProgress.clearCompleted(storage, context)
    return
  }
  const blockLabels = new Map(
    readingBlockAnchors.value.map((block) => [block.id, block.label] as const)
  )
  const location = selectViewportProgress(
    readingBlockElements().map((element) => {
      const rect = element.getBoundingClientRect()
      const blockId = element.dataset.blockId ?? ""
      return {
        blockId,
        blockLabel: blockLabels.get(blockId) ?? "文章段落",
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height
      }
    }),
    window.innerHeight,
    documentProgress
  )
  if (!location) {
    return
  }
  if (readingProgress.save(storage, context, location) && readerCanSync.value) {
    queueServerProgress(context, location)
  }
}

function queueServerProgress(
  context: LocalReadingContext,
  location: { blockId: string; documentProgress: number }
): void {
  progressSyncState.value = "syncing"
  progressSyncQueue = progressSyncQueue
    .then(async () => {
      await putServerProgress(context.articleId, {
        revisionId: context.revisionId,
        blockId: location.blockId,
        percent: Math.round(location.documentProgress * 10_000) / 100
      })
      progressSyncState.value = "synced"
    })
    .catch((cause: unknown) => {
      if (cause instanceof ReaderLibraryApiError && cause.status === 401) {
        readerCanSync.value = false
      }
      progressSyncState.value = "local-only"
    })
}

function scheduleReadingProgressSave(): void {
  if (typeof window === "undefined" || progressSaveTimer !== null) {
    return
  }
  progressSaveTimer = window.setTimeout(() => {
    progressSaveTimer = null
    saveReadingProgress()
  }, READER_PROGRESS_WRITE_INTERVAL_MS)
}

function flushReadingProgressSave(): void {
  if (typeof window === "undefined" || progressSaveTimer === null) {
    return
  }
  window.clearTimeout(progressSaveTimer)
  progressSaveTimer = null
  saveReadingProgress()
}

function loadResumeProgress(): void {
  const storage = browserProgressStorage()
  const context = readingContext.value
  if (!storage) {
    markReloadProgressLoaded(false)
    return
  }
  if (!context) {
    if (articleSlugValid && articleUnavailable.value) {
      readingProgress.clearUnavailable(storage, articleSlug)
    }
    markReloadProgressLoaded(false)
    return
  }
  readingProgress.load(storage, context, readingBlockAnchors.value)
  markReloadProgressLoaded(Boolean(readingProgress.resumePrompt.value))
}

function markReloadProgressLoaded(resumeChoicePending: boolean): void {
  if (!reloadGuardActive) {
    return
  }
  if (releaseReloadGuardAfterManualScroll()) {
    return
  }
  reloadProgressLoaded = true
  reloadResumeChoicePending = resumeChoicePending
  applyReloadGuardPosition()
  scheduleReloadGuardRelease()
}

async function continueFromSavedProgress(): Promise<void> {
  if (typeof window === "undefined") {
    return
  }
  if (!readingProgress.beginContinueReading()) {
    return
  }
  if (reloadGuardActive) {
    reloadManualScrollPosition = null
    reloadResumeChoicePending = false
    reloadChosenAction = "continue"
    applyReloadGuardPosition()
    scheduleReloadGuardRelease()
    return
  }
  await nextTick()
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(scrollToSavedProgress)
  })
}

function scrollToSavedProgress(): void {
  const targetTop = readingProgress.continueReading(
    readingBlockElements().map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        blockId: element.dataset.blockId ?? "",
        top: window.scrollY + rect.top,
        height: rect.height
      }
    }),
    window.innerHeight
  )
  window.scrollTo({ top: targetTop ?? 0, behavior: "auto" })
}

function startReadingFromTop(): void {
  const storage = browserProgressStorage()
  const context = readingContext.value
  if (storage && context) {
    readingProgress.startOver(storage, context)
  }
  if (typeof window !== "undefined") {
    if (reloadGuardActive) {
      reloadManualScrollPosition = null
      reloadResumeChoicePending = false
      reloadChosenAction = "start-over"
      applyReloadGuardPosition()
      scheduleReloadGuardRelease()
      return
    }
    window.scrollTo({ top: 0, behavior: "auto" })
  }
}

function applyReloadFinalChoice(): void {
  if (!reloadGuardActive) {
    return
  }
  if (reloadChosenAction === "continue") {
    scrollToSavedProgress()
  } else {
    applyReloadGuardPosition()
  }
}

function beginInitialReloadScrollGuard(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return
  }
  const navigation = navigationEntry()
  if (
    navigation?.type !== "reload" ||
    window.location.hash ||
    document.documentElement.hasAttribute(RELOAD_GUARD_ATTRIBUTE)
  ) {
    return
  }
  const initialUrl = new URL(navigation.name, window.location.href)
  if (
    initialUrl.origin !== window.location.origin ||
    initialUrl.pathname !== window.location.pathname ||
    initialUrl.search !== window.location.search
  ) {
    return
  }

  document.documentElement.setAttribute(RELOAD_GUARD_ATTRIBUTE, "true")
  if (!hasReloadProgressCandidate()) {
    return
  }
  previousScrollRestoration = window.history.scrollRestoration
  window.history.scrollRestoration = "manual"
  reloadGuardActive = true
  reloadProgressLoaded = false
  reloadResumeChoicePending = false
  reloadChosenAction = null
  reloadLifecycleReady = document.readyState === "complete"
  window.addEventListener("load", handleReloadLifecycleReady)
  window.addEventListener("pageshow", handleReloadLifecycleReady)
  applyReloadGuardPosition()
}

function restoreUnavailableStorageScrollPosition(): void {
  if (
    typeof window === "undefined" ||
    browserProgressStorage() ||
    navigationEntry()?.type !== "reload"
  ) {
    return
  }
  const storage = browserSessionStorage()
  if (!storage) {
    return
  }
  let rawSnapshot: string | null
  try {
    rawSnapshot = storage.getItem(RELOAD_SCROLL_SNAPSHOT_KEY)
    storage.removeItem(RELOAD_SCROLL_SNAPSHOT_KEY)
  } catch {
    return
  }
  if (!rawSnapshot) {
    return
  }
  let snapshot: { href?: unknown; top?: unknown }
  try {
    snapshot = JSON.parse(rawSnapshot) as { href?: unknown; top?: unknown }
  } catch {
    return
  }
  if (
    snapshot.href !== window.location.href ||
    typeof snapshot.top !== "number" ||
    !Number.isFinite(snapshot.top) ||
    snapshot.top <= 0
  ) {
    return
  }
  const targetPosition = snapshot.top
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetPosition, behavior: "auto" })
    })
  })
}

function hasReloadProgressCandidate(): boolean {
  const storage = browserProgressStorage()
  const context = readingContext.value
  if (!storage || !context) {
    return false
  }
  try {
    const indexValue = storage.getItem(progressIndexKey(context.articleId))
    return Boolean(
      indexValue || storage.getItem(legacyProgressKey(context.articleSlug, context.revisionNumber))
    )
  } catch {
    return false
  }
}

function handleReloadLifecycleReady(): void {
  reloadLifecycleReady = true
  if (releaseReloadGuardAfterManualScroll()) {
    return
  }
  applyReloadGuardPosition()
  scheduleReloadGuardRelease()
}

function releaseReloadGuardAfterManualScroll(): boolean {
  if (!reloadGuardActive || reloadChosenAction === "continue" || window.scrollY <= 0) {
    return false
  }
  reloadManualScrollPosition = window.scrollY
  queueManualReloadPositionRestore()
  releaseReloadScrollGuard()
  return true
}

function queueManualReloadPositionRestore(): void {
  if (typeof window === "undefined" || reloadManualScrollPosition === null) {
    return
  }
  if (document.readyState === "complete") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restoreManualReloadScrollPosition)
    })
    return
  }
  window.addEventListener("load", restoreManualReloadScrollPosition, { once: true })
}

function restoreManualReloadScrollPosition(): void {
  if (typeof window === "undefined" || reloadManualScrollPosition === null) {
    return
  }
  const targetPosition = reloadManualScrollPosition
  reloadManualScrollPosition = null
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetPosition, behavior: "auto" })
    })
  })
}

function scheduleReloadGuardRelease(): void {
  if (
    !reloadGuardActive ||
    !reloadProgressLoaded ||
    !reloadLifecycleReady ||
    reloadResumeChoicePending ||
    reloadReleaseScheduled
  ) {
    return
  }
  reloadReleaseScheduled = true
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      applyReloadFinalChoice()
      releaseReloadScrollGuard()
    })
  })
}

function applyReloadGuardPosition(): void {
  if (reloadGuardActive) {
    window.scrollTo({ top: 0, behavior: "auto" })
  }
}

function releaseReloadScrollGuard(): void {
  if (typeof window === "undefined" || !reloadGuardActive) {
    return
  }
  reloadGuardActive = false
  reloadResumeChoicePending = false
  reloadReleaseScheduled = false
  reloadChosenAction = null
  window.removeEventListener("load", handleReloadLifecycleReady)
  window.removeEventListener("pageshow", handleReloadLifecycleReady)
  if (previousScrollRestoration) {
    window.history.scrollRestoration = previousScrollRestoration
  }
  previousScrollRestoration = null
}

function handleReaderPageHide(): void {
  saveUnavailableStorageScrollPosition()
  flushReadingProgressSave()
  reloadManualScrollPosition = null
  window.removeEventListener("load", restoreManualReloadScrollPosition)
  releaseReloadScrollGuard()
}

function navigationEntry(): DocumentNavigationEntry | null {
  if (typeof performance === "undefined") {
    return null
  }
  const entry = performance.getEntriesByType("navigation")[0] as
    { name?: unknown; type?: unknown } | undefined
  return entry && typeof entry.name === "string" && isDocumentNavigationType(entry.type)
    ? { name: entry.name, type: entry.type }
    : null
}

function isDocumentNavigationType(value: unknown): value is DocumentNavigationType {
  return (
    value === "navigate" || value === "reload" || value === "back_forward" || value === "prerender"
  )
}

function readingBlockElements(): HTMLElement[] {
  return typeof document === "undefined"
    ? []
    : Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]"))
}

function browserProgressStorage(): ProgressStorage | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function saveUnavailableStorageScrollPosition(): void {
  if (typeof window === "undefined" || browserProgressStorage() || window.scrollY <= 0) {
    return
  }
  const storage = browserSessionStorage()
  if (!storage) {
    return
  }
  try {
    storage.setItem(
      RELOAD_SCROLL_SNAPSHOT_KEY,
      JSON.stringify({ href: window.location.href, top: window.scrollY })
    )
  } catch {
    // A blocked session store should not affect normal pagehide behavior.
  }
}

function blockAnchorLabel(index: number): string {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const block = articleBlocks.value[cursor]
    if (block?.type === "heading") {
      const heading = blockText(block).trim()
      if (heading) {
        return heading.slice(0, 120)
      }
    }
  }
  return "文章開場"
}

let stopResumeWatch: (() => void) | null = null
let stopArticleFocusWatch: (() => void) | null = null
let activeRevisionId: string | null = null

function focusArticleHeading(): void {
  document.getElementById("article-heading")?.focus({ preventScroll: true })
}

onMounted(() => {
  const focusOnMount = readerHasMounted.value
  readerHasMounted.value = true
  void readReaderSession()
    .then((session) => {
      readerCanSync.value = session.canSync
      progressSyncState.value = session.canSync ? "idle" : "local-only"
    })
    .catch(() => {
      readerCanSync.value = false
      progressSyncState.value = "local-only"
    })
  if (typeof window !== "undefined") {
    beginInitialReloadScrollGuard()
    restoreUnavailableStorageScrollPosition()
    motionMode.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "reduced"
      : "full"
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    interactiveEnabled.value = motionMode.value === "full" && connection?.saveData !== true
    updateVisibleReadingProgress()
    window.addEventListener("scroll", handleReaderScroll, { passive: true })
    window.addEventListener("beforeunload", flushReadingProgressSave)
    window.addEventListener("pagehide", handleReaderPageHide)
  }
  document.addEventListener("scroll", handleReaderScroll, { passive: true, capture: true })
  stopResumeWatch = watch(
    () => readingContext.value?.revisionId ?? error.value,
    () => void nextTick().then(loadResumeProgress),
    { immediate: true }
  )
  activeRevisionId = article.value?.revisionId ?? null
  stopArticleFocusWatch = watch(
    () => article.value?.revisionId ?? null,
    async (revisionId) => {
      if (revisionId === activeRevisionId) return
      activeRevisionId = revisionId
      failedAssets.value = new Set()
      if (!revisionId) return
      await nextTick()
      focusArticleHeading()
    }
  )
  void nextTick().then(() => {
    clientReady.value = true
    if (focusOnMount) {
      focusArticleHeading()
    }
  })
})

onBeforeUnmount(() => {
  stopResumeWatch?.()
  stopArticleFocusWatch?.()
  document.removeEventListener("scroll", handleReaderScroll, true)
  window.removeEventListener("scroll", handleReaderScroll)
  window.removeEventListener("beforeunload", flushReadingProgressSave)
  window.removeEventListener("pagehide", handleReaderPageHide)
  flushReadingProgressSave()
  reloadManualScrollPosition = null
  window.removeEventListener("load", restoreManualReloadScrollPosition)
  releaseReloadScrollGuard()
})
</script>

<template>
  <div class="site-page">
    <a class="skip-link" href="#main-content">跳到主要內容</a>
    <header class="site-header">
      <NuxtLink to="/" class="site-brand">Courtside TW</NuxtLink>
      <nav aria-label="主要導覽">
        <NuxtLink to="/">首頁</NuxtLink>
        <NuxtLink to="/issues">所有期數</NuxtLink>
      </nav>
    </header>

    <main id="main-content" class="site-shell article-reader" tabindex="-1">
      <NuxtLink v-if="articleIssueSlug" :to="issueRoute(articleIssueSlug)" class="back-link"
        >← 返回本期目錄</NuxtLink
      >
      <NuxtLink v-else to="/issues" class="back-link">← 返回所有期數</NuxtLink>

      <article
        v-if="article"
        data-testid="article-document"
        :data-motion="motionMode"
        :data-client-ready="String(clientReady)"
        aria-labelledby="article-heading"
      >
        <ReadingProgress
          :percent="clientReady ? visibleReadingProgress : 0"
          :motion-mode="motionMode"
        />
        <header class="article-header" data-testid="article-header">
          <p class="eyebrow">Public Reading</p>
          <h1 id="article-heading" tabindex="-1">{{ article.title }}</h1>
          <p v-if="article.dek" class="article-dek">{{ article.dek }}</p>
          <div class="article-meta">
            <span
              v-if="article.contributors.length > 0"
              data-testid="article-byline"
              class="article-byline"
            >
              <span
                v-for="contributor in article.contributors"
                :key="contributor.contributorId + ':' + contributor.role"
                class="article-credit"
                data-testid="article-credit"
              >
                <span>{{ contributor.displayName }}</span>
                <span class="article-credit-role"
                  >（{{ contributorRoleLabel(contributor.role) }}）</span
                >
              </span>
            </span>
            <span v-else data-testid="article-byline">署名未提供</span>
            <span data-testid="article-reading-time">{{ readingTimeMinutes }} 分鐘閱讀</span>
            <time :datetime="article.publishedAt" data-testid="article-published-at">
              發布於 {{ publicDateLabel(article.publishedAt) }}
            </time>
            <time
              v-if="article.updatedAt && article.updatedAt !== article.publishedAt"
              :datetime="article.updatedAt"
              data-testid="article-updated-at"
            >
              更新於 {{ publicDateLabel(article.updatedAt) }}
            </time>
            <NuxtLink
              :to="issueRoute(articleIssueSlug)"
              data-testid="article-issue-link"
              class="text-link"
              >返回本期目錄</NuxtLink
            >
            <ShareArticleButton
              :title="article.title"
              :canonical-url="canonical"
              :client-ready="clientReady"
            />
            <BookmarkControl :article-id="article.articleId" />
            <span v-if="readerCanSync" data-testid="signed-in-progress-control" role="status">
              {{
                progressSyncState === "syncing"
                  ? "同步閱讀進度中"
                  : progressSyncState === "synced"
                    ? "閱讀進度已同步"
                    : "登入後將跨裝置同步"
              }}
            </span>
          </div>
        </header>

        <section
          v-if="resumePrompt"
          data-testid="reader-resume"
          class="reader-resume"
          aria-labelledby="reader-resume-heading"
        >
          <p id="reader-resume-heading">
            <strong>繼續閱讀「{{ resumePrompt.articleTitle }}」？</strong>
          </p>
          <p data-testid="reader-resume-section">上次讀到：{{ resumePrompt.blockLabel }}</p>
          <div class="reader-resume__actions">
            <button
              type="button"
              class="button-link"
              data-testid="reader-resume-continue"
              @click="continueFromSavedProgress"
            >
              繼續上次閱讀
            </button>
            <button
              type="button"
              class="button-link button-link--quiet"
              data-testid="reader-resume-start-over"
              @click="startReadingFromTop"
            >
              從頭開始
            </button>
          </div>
        </section>

        <ArticleNavigation
          :issue-slug="articleIssueSlug"
          :issue-navigation="article.issueNavigation"
          :toc-items="articleTocItems"
          mode="toc"
        />

        <div data-testid="article-content" class="article-content">
          <ContentDocumentRenderer
            :blocks="articleBlocks"
            :article-revision-id="article.revisionId"
            :client-ready="clientReady"
            :motion-mode="motionMode"
            :interactive-enabled="interactiveEnabled"
            :get-asset-url="assetMediaUrl"
            :get-asset-width="assetMediaWidth"
            :get-asset-height="assetMediaHeight"
            :get-asset-attribution="assetMediaAttribution"
            :is-asset-failed="isAssetFailed"
            :mark-asset-failed="markAssetFailed"
            :related-article-href="relatedArticleHref"
            :enable-creative="enableCreative"
            @telemetry="recordContentBlockTelemetry"
          />
          <p v-if="articleBlocks.length === 0" class="article-empty-content">
            這篇文章目前沒有可顯示的正文，請返回本期目錄。
          </p>
        </div>

        <ArticleNavigation
          :issue-slug="articleIssueSlug"
          :issue-navigation="article.issueNavigation"
          :toc-items="articleTocItems"
          mode="footer"
        />
      </article>

      <section
        v-else-if="articleUnavailable"
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

<style scoped>
.reader-resume p {
  margin: 0;
}

.reader-resume p + p {
  margin-top: 0.35rem;
}

.reader-resume__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
}

.reader-resume__actions .button-link {
  min-height: 44px;
  margin-top: 0;
  cursor: pointer;
}
</style>
