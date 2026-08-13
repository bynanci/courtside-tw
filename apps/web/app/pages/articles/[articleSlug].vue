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
import {
  legacyProgressKey,
  progressIndexKey,
  selectViewportProgress,
  useLocalReadingProgress,
  type LocalReadingContext,
  type ProgressStorage,
  type ReadingBlockAnchor
} from "../../features/reader/composables/useLocalReadingProgress"
import CourtPulseRuntime from "../../components/article/CourtPulseRuntime.vue"

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

type CourtPulseParameters = {
  density: number
  tempo: number
  lineWeight: number
  paletteId: "court-dusk"
  numericSequence: number[]
}

type DocumentNavigationType = "navigate" | "reload" | "back_forward" | "prerender"
type DocumentNavigationEntry = {
  name: string
  type: DocumentNavigationType
}

const RELOAD_GUARD_ATTRIBUTE = "data-reader-reload-restoration-handled"
const READER_PROGRESS_WRITE_INTERVAL_MS = 250

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
const articleUnavailable = computed(
  () => !articleSlugValid || isUnavailableArticleError(error.value)
)

if (import.meta.server && articleUnavailable.value) {
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
const shareStatus = ref("")
const failedAssets = ref(new Set<string>())
const motionMode = ref<"reduced" | "full">("reduced")
const clientReady = ref(false)
const interactiveEnabled = ref(false)
const creativeInViewByBlock = ref<Record<string, boolean>>({})
const runtimeStateByBlock = ref<Record<string, "paused" | "running">>({})
const creativeObservers = new Map<string, IntersectionObserver>()
let creativeVisibilityTimer: number | null = null
let reloadGuardActive = false
let reloadProgressLoaded = false
let reloadResumeChoicePending = false
let reloadLifecycleReady = false
let reloadReleaseScheduled = false
let reloadChosenAction: "continue" | "start-over" | null = null
let previousScrollRestoration: "auto" | "manual" | null = null
let progressSaveTimer: number | null = null

useHead(() => {
  const current = article.value
  const title = current ? current.title + " — Courtside TW" : "文章閱讀頁 — Courtside TW"
  const description = current?.dek ?? "Courtside TW 的公開文章閱讀頁。"
  const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: current?.title,
    description,
    url: canonical.value,
    inLanguage: "zh-Hant-TW"
  }
  const authors = current?.contributors.filter((contributor) => contributor.role === "AUTHOR") ?? []
  if (authors.length > 0) {
    structuredData.author = authors.map((contributor) => ({
      "@type": "Person",
      name: contributor.displayName
    }))
  }
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
            innerHTML: jsonLd(structuredData)
          }
        ]
      : []
  }
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

function canvasParameters(value: unknown): CourtPulseParameters {
  const parameters = isRecord(value) ? value : {}
  const numericSequence = Array.isArray(parameters.numericSequence)
    ? parameters.numericSequence
        .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
        .map((entry) => Math.min(1, Math.max(0, entry)))
        .slice(0, 256)
    : []
  return {
    density: Math.min(100, Math.max(1, numberValue(parameters.density, 42))),
    tempo: Math.min(2, Math.max(0, numberValue(parameters.tempo, 0.8))),
    lineWeight: Math.min(10, Math.max(0.5, numberValue(parameters.lineWeight, 1.5))),
    paletteId: "court-dusk",
    numericSequence
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

function generativeBlockIds(): string[] {
  return articleBlocks.value
    .filter((block) => block.type === "generative-canvas")
    .map((block) => block.id)
}

function runtimeStateFor(blockId: string): "paused" | "running" {
  return runtimeStateByBlock.value[blockId] ?? "paused"
}

function syncRuntimeStates(): void {
  const nextStates: Record<string, "paused" | "running"> = {}
  for (const blockId of generativeBlockIds()) {
    nextStates[blockId] =
      creativeInViewByBlock.value[blockId] === true &&
      interactiveEnabled.value &&
      motionMode.value === "full" &&
      typeof document !== "undefined" &&
      !document.hidden
        ? "running"
        : "paused"
  }
  runtimeStateByBlock.value = nextStates
}

function creativeTarget(blockId: string): HTMLElement | null {
  if (typeof document === "undefined") {
    return null
  }
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid="generative-canvas"]')).find(
      (target) => target.dataset.creativeBlockId === blockId
    ) ?? null
  )
}

function disconnectCreativeObservers(): void {
  for (const observer of creativeObservers.values()) {
    observer.disconnect()
  }
  creativeObservers.clear()
}

function stopCreativeVisibilityWatch(): void {
  if (typeof window !== "undefined" && creativeVisibilityTimer !== null) {
    window.clearInterval(creativeVisibilityTimer)
  }
  creativeVisibilityTimer = null
  disconnectCreativeObservers()
}

function updateCreativeVisibility(): void {
  const nextVisibility: Record<string, boolean> = {}
  for (const blockId of generativeBlockIds()) {
    const target = creativeTarget(blockId)
    if (!target || typeof window === "undefined") {
      nextVisibility[blockId] = false
      continue
    }
    const { top, bottom } = target.getBoundingClientRect()
    nextVisibility[blockId] = top < window.innerHeight && bottom > 0
  }
  creativeInViewByBlock.value = nextVisibility
  syncRuntimeStates()
}

function startCreativeVisibilityWatch(): void {
  if (typeof window === "undefined" || creativeVisibilityTimer !== null) {
    return
  }
  updateCreativeVisibility()
  creativeVisibilityTimer = window.setInterval(updateCreativeVisibility, 100)
}

function handleCreativeScroll(): void {
  updateCreativeVisibility()
}

function handleReaderScroll(): void {
  handleCreativeScroll()
  if (reloadGuardActive && reloadResumeChoicePending && window.scrollY > 0) {
    releaseReloadScrollGuard()
  }
  scheduleReadingProgressSave()
}

function observeCreative(): void {
  disconnectCreativeObservers()
  const blockIds = generativeBlockIds()
  if (blockIds.length === 0) {
    creativeInViewByBlock.value = {}
    runtimeStateByBlock.value = {}
    return
  }
  if (typeof IntersectionObserver === "undefined") {
    updateCreativeVisibility()
    startCreativeVisibilityWatch()
    return
  }
  for (const blockId of blockIds) {
    const target = creativeTarget(blockId)
    if (!target) {
      continue
    }
    const observer = new IntersectionObserver(
      (entries) => {
        creativeInViewByBlock.value = {
          ...creativeInViewByBlock.value,
          [blockId]: entries[0]?.isIntersecting === true
        }
        syncRuntimeStates()
      },
      { threshold: 0.01 }
    )
    observer.observe(target)
    creativeObservers.set(blockId, observer)
  }
  startCreativeVisibilityWatch()
}

async function enableCreative(): Promise<void> {
  interactiveEnabled.value = true
  syncRuntimeStates()
  await nextTick()
  observeCreative()
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
  readingProgress.save(storage, context, location)
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
  applyReloadGuardPosition()
  scheduleReloadGuardRelease()
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
  flushReadingProgressSave()
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
let stopCreativeWatch: (() => void) | null = null

onMounted(() => {
  if (typeof window !== "undefined") {
    beginInitialReloadScrollGuard()
    motionMode.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "reduced"
      : "full"
    interactiveEnabled.value = motionMode.value === "full"
    window.addEventListener("scroll", handleReaderScroll, { passive: true })
    window.addEventListener("beforeunload", flushReadingProgressSave)
    window.addEventListener("pagehide", handleReaderPageHide)
  }
  document.addEventListener("scroll", handleReaderScroll, { passive: true, capture: true })
  document.addEventListener("visibilitychange", syncRuntimeStates)
  stopResumeWatch = watch(
    () => readingContext.value?.revisionId ?? error.value,
    () => void nextTick().then(loadResumeProgress),
    { immediate: true }
  )
  stopCreativeWatch = watch(
    () => article.value?.revisionId,
    async () => {
      creativeInViewByBlock.value = {}
      runtimeStateByBlock.value = {}
      stopCreativeVisibilityWatch()
      await nextTick()
      observeCreative()
    },
    { immediate: true }
  )
  void nextTick().then(() => {
    clientReady.value = true
  })
})

onBeforeUnmount(() => {
  stopResumeWatch?.()
  stopCreativeWatch?.()
  document.removeEventListener("scroll", handleReaderScroll, true)
  document.removeEventListener("visibilitychange", syncRuntimeStates)
  window.removeEventListener("scroll", handleReaderScroll)
  window.removeEventListener("beforeunload", flushReadingProgressSave)
  window.removeEventListener("pagehide", handleReaderPageHide)
  flushReadingProgressSave()
  releaseReloadScrollGuard()
  stopCreativeVisibilityWatch()
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
        :data-client-ready="String(clientReady)"
        aria-labelledby="article-heading"
      >
        <header class="article-header" data-testid="article-header">
          <p class="eyebrow">Public Reading</p>
          <h1 id="article-heading">{{ article.title }}</h1>
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
                v-if="
                  assetMediaUrl(
                    payloadFor(block).assetId,
                    stringValue(payloadFor(block).variant) || 'inline'
                  )
                "
                :src="
                  assetMediaUrl(
                    payloadFor(block).assetId,
                    stringValue(payloadFor(block).variant) || 'inline'
                  )
                "
                :alt="stringValue(payloadFor(block).altText)"
                :width="
                  assetMediaWidth(
                    payloadFor(block).assetId,
                    stringValue(payloadFor(block).variant) || 'inline'
                  )
                "
                :height="
                  assetMediaHeight(
                    payloadFor(block).assetId,
                    stringValue(payloadFor(block).variant) || 'inline'
                  )
                "
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
                  v-if="assetMediaUrl(item.assetId, 'inline')"
                  :src="assetMediaUrl(item.assetId, 'inline')"
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
                <img
                  v-if="
                    assetMediaUrl(payloadFor(block).posterAssetId, 'wide') &&
                    !failedAssets.has(block.id + '-poster')
                  "
                  data-testid="generative-poster-image"
                  class="article-generative-poster"
                  :src="assetMediaUrl(payloadFor(block).posterAssetId, 'wide')"
                  :alt="stringValue(payloadFor(block).altText)"
                  loading="lazy"
                  @error="markAssetFailed(block.id + '-poster')"
                />
                <span>{{ stringValue(payloadFor(block).dataSummary) }}</span>
              </div>
              <button
                v-if="clientReady && motionMode === 'reduced' && !interactiveEnabled"
                type="button"
                class="button-link creative-enable"
                data-testid="creative-enable"
                @click="enableCreative"
              >
                顯示互動視覺
              </button>
              <div
                data-testid="generative-canvas"
                :data-creative-block-id="block.id"
                :data-seed="String(numberValue(payloadFor(block).seed))"
                :data-render-hash="renderHash(block)"
                :data-runtime-state="runtimeStateFor(block.id)"
                :data-runtime-enabled="String(interactiveEnabled)"
                role="img"
                :aria-label="stringValue(payloadFor(block).altText)"
              >
                <CourtPulseRuntime
                  v-if="interactiveEnabled"
                  :key="article.revisionId + ':' + block.id"
                  :seed="numberValue(payloadFor(block).seed)"
                  :parameters="canvasParameters(payloadFor(block).parameters)"
                  :alt-text="stringValue(payloadFor(block).altText)"
                  :active="interactiveEnabled"
                  :paused="runtimeStateFor(block.id) !== 'running'"
                  :reduced-motion="motionMode === 'reduced'"
                />
                <span v-else data-testid="creative-runtime-placeholder">
                  互動視覺預設停用；{{ stringValue(payloadFor(block).dataSummary) }}
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
