import type { components } from "@courtside/api-client"

import { parsePublicIssueSlug } from "../../issues/public-issue-contract.ts"

const DATABASE_NAME = "courtside-offline"
const DATABASE_VERSION = 1
const STATE_STORE = "installed-issues"
const CACHE_PREFIX = "courtside-offline"
const MAX_ASSETS = 512
const MAX_WITHDRAWALS = 100_000
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024
const MAX_INSTALLED_ISSUES = 100
const ISSUE_LIFECYCLE_LOCK_PREFIX = "courtside-offline:lifecycle:"
const localIssueLifecycleTails = new Map<string, Promise<void>>()

export type OfflineArticle = {
  articleId: string
  slug: string
  title: string
  position: number
  revisionId: string
  revisionNumber: number
  contentUrl: string
  byteSize: number
  checksum: string
}

export type OfflineAsset = {
  assetId: string
  variant: string
  url: string
  mimeType: string
  byteSize: number
  checksum: string
  expiresAt: string
}

export type OfflineManifest = {
  issueSlug: string
  manifestVersion: number
  checksum: string
  expiresAt: string
  assetBytes: number
  articles: OfflineArticle[]
  assets: OfflineAsset[]
}

export type WithdrawalManifest = {
  version: number
  generatedAt: string
  withdrawals: string[]
  checksum: string
}

export type PublicArticleProjection = components["schemas"]["ArticleProjection"]

export type InstalledOfflineIssue = {
  issueSlug: string
  cacheName: string
  installedAt: string
  manifest: OfflineManifest
}

export type OfflineDownloadProgress = {
  completed: number
  total: number
}

export type OfflineIssueErrorCode =
  "interrupted" | "corrupt" | "quota" | "network" | "storage" | "withdrawn"

export class OfflineIssueError extends Error {
  readonly code: OfflineIssueErrorCode

  constructor(code: OfflineIssueErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "OfflineIssueError"
    this.code = code
  }
}

type StoredOfflineIssue = InstalledOfflineIssue & {
  cacheName: string
}

type DownloadAsset = {
  url: string
  checksum: string
  byteSize: number
}

export function getOfflineIssueManifestPath(issueSlug: string): string {
  return `/api/v1/public/offline/issues/${parsePublicIssueSlug(issueSlug)}/manifest`
}

export function getOfflineFallbackAssetPath(articleId: string): string {
  return `/media/offline/${assertSafeArticleId(articleId)}`
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new OfflineIssueError("storage", "此瀏覽器不支援離線內容校驗。")
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export class OfflineIssueManager {
  private readonly issueSlug: string
  private readonly apiBaseUrl: URL

  constructor(apiBaseUrl: string, issueSlug: string) {
    this.issueSlug = parsePublicIssueSlug(issueSlug)
    this.apiBaseUrl = normalizedApiBaseUrl(apiBaseUrl)
  }

  async getInstalled(): Promise<InstalledOfflineIssue | null> {
    return withIssueLifecycleLock(this.issueSlug, () => this.getInstalledLocked())
  }

  private async getInstalledLocked(): Promise<InstalledOfflineIssue | null> {
    return readValidatedInstalledIssue(this.issueSlug)
  }

  async download(
    onProgress?: (progress: OfflineDownloadProgress) => void
  ): Promise<InstalledOfflineIssue> {
    return withIssueLifecycleLock(this.issueSlug, () => this.downloadLocked(onProgress))
  }

  private async downloadLocked(
    onProgress?: (progress: OfflineDownloadProgress) => void
  ): Promise<InstalledOfflineIssue> {
    const cacheStorage = getCacheStorage()
    const previous = await readState(this.issueSlug)
    await sweepCandidateCaches(this.issueSlug, previous?.cacheName)
    const manifest = await this.fetchManifest()
    const assets = downloadAssetsFor(manifest)
    await assertStorageCapacity(manifest.assetBytes)

    const candidateCacheName = candidateCacheNameFor(this.issueSlug, manifest)
    let committed = false

    try {
      const cache = await cacheStorage.open(candidateCacheName)
      onProgress?.({ completed: 0, total: assets.length })

      for (const [index, asset] of assets.entries()) {
        const resourceUrl = offlineResourceUrl(this.apiBaseUrl, asset.url)
        const response = await fetchAsset(resourceUrl)
        const bytes = await readAndVerifyAsset(response, asset)
        await cache.put(
          resourceUrl,
          new Response(bytes, {
            status: 200,
            headers: response.headers
          })
        )
        onProgress?.({ completed: index + 1, total: assets.length })
      }

      const installed: InstalledOfflineIssue = {
        issueSlug: this.issueSlug,
        cacheName: candidateCacheName,
        installedAt: new Date().toISOString(),
        manifest
      }
      await writeState(installed)
      committed = true

      if (previous && previous.cacheName !== candidateCacheName) {
        try {
          await cacheStorage.delete(previous.cacheName)
        } catch {
          // IndexedDB is the commit point. A failed old-cache cleanup must not
          // turn an already committed update into a reported download failure;
          // the next load/install sweep retries removal of the orphan.
        }
      }

      return installed
    } catch (error) {
      if (!committed) {
        await cacheStorage.delete(candidateCacheName)
      }
      throw asOfflineIssueError(error)
    }
  }

  async remove(): Promise<boolean> {
    return withIssueLifecycleLock(this.issueSlug, () => this.removeLocked())
  }

  private async removeLocked(): Promise<boolean> {
    const installed = await readState(this.issueSlug)
    if (!installed) {
      await sweepCandidateCaches(this.issueSlug)
      return false
    }

    await removeStateAndCache(installed)
    await sweepCandidateCaches(this.issueSlug)
    return true
  }

  async reconcileWithdrawal(): Promise<
    | { status: "none" }
    | { status: "available"; state: InstalledOfflineIssue }
    | { status: "withdrawn" }
  > {
    return withIssueLifecycleLock(this.issueSlug, () => this.reconcileWithdrawalLocked())
  }

  private async reconcileWithdrawalLocked(): Promise<
    | { status: "none" }
    | { status: "available"; state: InstalledOfflineIssue }
    | { status: "withdrawn" }
  > {
    const installed = await readState(this.issueSlug)
    if (!installed) {
      return { status: "none" }
    }

    let manifest: WithdrawalManifest
    try {
      const response = await fetch(this.endpoint("/api/v1/public/withdrawals"), {
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      })
      if (!response.ok) {
        throw new OfflineIssueError("network", "撤回清單暫時無法取得。")
      }
      manifest = (await response.json()) as WithdrawalManifest
      await validateWithdrawalManifest(manifest)
    } catch (error) {
      await removeStateAndCache(installed)
      throw new OfflineIssueError("withdrawn", "撤回狀態無法驗證；本機離線內容已停用。", {
        cause: error
      })
    }

    const withdrawn = new Set(manifest.withdrawals)
    const hasWithdrawnArticle = installed.manifest.articles.some((article) =>
      withdrawn.has(article.articleId)
    )
    if (hasWithdrawnArticle) {
      await removeStateAndCache(installed)
      return { status: "withdrawn" }
    }

    let issueAvailable: boolean
    try {
      issueAvailable = await this.isIssueAvailable()
    } catch (error) {
      await removeStateAndCache(installed)
      throw new OfflineIssueError("withdrawn", "離線期數無法重新驗證；本機離線內容已停用。", {
        cause: error
      })
    }
    if (issueAvailable) {
      return { status: "available", state: installed }
    }

    await removeStateAndCache(installed)
    return { status: "withdrawn" }
  }

  private async isIssueAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint(getOfflineIssueManifestPath(this.issueSlug)), {
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      })
      if (response.status === 404) {
        return false
      }
      if (!response.ok) {
        throw new OfflineIssueError("network", "離線下載清單暫時無法取得。")
      }
      const manifest = (await response.json()) as OfflineManifest
      validateManifest(manifest, this.issueSlug)
      return !isExpired(manifest.expiresAt)
    } catch (error) {
      throw asOfflineIssueError(error)
    }
  }

  private async fetchManifest(): Promise<OfflineManifest> {
    try {
      const response = await fetch(this.endpoint(getOfflineIssueManifestPath(this.issueSlug)), {
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      })
      if (!response.ok) {
        throw new OfflineIssueError("network", "離線下載清單暫時無法取得。")
      }
      const manifest = (await response.json()) as OfflineManifest
      validateManifest(manifest, this.issueSlug)
      if (isExpired(manifest.expiresAt)) {
        throw new OfflineIssueError("withdrawn", "離線下載清單已過期。")
      }
      return manifest
    } catch (error) {
      throw asOfflineIssueError(error)
    }
  }

  private endpoint(path: string): string {
    const url = new URL(path, this.apiBaseUrl)
    if (url.origin !== this.apiBaseUrl.origin) {
      throw new OfflineIssueError("network", "離線內容來源不受信任。")
    }
    return url.toString()
  }
}

export async function listInstalledOfflineIssues(): Promise<InstalledOfflineIssue[]> {
  if (!cacheStorageAvailable() || typeof globalThis.indexedDB === "undefined") {
    return []
  }

  const records = await readAllStates()
  const issueSlugs = new Set<string>()
  for (const record of records) {
    if (!isRecord(record) || typeof record.issueSlug !== "string") {
      continue
    }
    try {
      issueSlugs.add(parsePublicIssueSlug(record.issueSlug))
    } catch {
      // Ignore malformed local records; they cannot be addressed by public issue routes.
    }
  }

  const installed: InstalledOfflineIssue[] = []
  for (const issueSlug of issueSlugs) {
    const state = await withIssueLifecycleLock(issueSlug, () =>
      readValidatedInstalledIssue(issueSlug)
    ).catch(() => null)
    if (state) {
      installed.push(state)
    }
  }
  return installed.sort((left, right) => right.installedAt.localeCompare(left.installedAt))
}

export async function readCachedOfflineArticle(
  apiBaseUrl: string,
  issueSlug: string,
  articleSlug: string
): Promise<PublicArticleProjection | null> {
  if (!cacheStorageAvailable() || typeof globalThis.indexedDB === "undefined") {
    return null
  }
  const normalizedIssueSlug = parsePublicIssueSlug(issueSlug)
  return withIssueLifecycleLock(normalizedIssueSlug, () =>
    readCachedOfflineArticleLocked(apiBaseUrl, normalizedIssueSlug, articleSlug)
  )
}

async function readCachedOfflineArticleLocked(
  apiBaseUrl: string,
  normalizedIssueSlug: string,
  articleSlug: string
): Promise<PublicArticleProjection | null> {
  const state = await readState(normalizedIssueSlug)
  if (!state) {
    return null
  }

  try {
    validateManifest(state.manifest, normalizedIssueSlug)
    if (isExpired(state.manifest.expiresAt)) {
      await removeStateAndCache(state)
      return null
    }
    const article = state.manifest.articles.find((candidate) => candidate.slug === articleSlug)
    if (!article) {
      return null
    }
    const resourceUrl = offlineResourceUrl(normalizedApiBaseUrl(apiBaseUrl), article.contentUrl)
    const cache = await getCacheStorage().open(state.cacheName)
    const response = await cache.match(resourceUrl)
    if (!response) {
      throw new OfflineIssueError("corrupt", "離線文章快取不完整。")
    }
    const bytes = await readAndVerifyAsset(response, {
      url: article.contentUrl,
      checksum: article.checksum,
      byteSize: article.byteSize
    })
    const projection = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    return validateCachedArticleProjection(projection, normalizedIssueSlug, articleSlug, article)
  } catch {
    await removeStateAndCache(state).catch(() => undefined)
    return null
  }
}

async function withIssueLifecycleLock<T>(
  issueSlug: string,
  operation: () => Promise<T>
): Promise<T> {
  const lockName = ISSUE_LIFECYCLE_LOCK_PREFIX + encodeURIComponent(issueSlug)
  const lockManager = globalThis.navigator?.locks
  if (lockManager && typeof lockManager.request === "function") {
    return lockManager.request(lockName, { mode: "exclusive" }, operation)
  }

  const predecessor = localIssueLifecycleTails.get(lockName) ?? Promise.resolve()
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = predecessor.catch(() => undefined).then(() => gate)
  localIssueLifecycleTails.set(lockName, tail)

  await predecessor.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release?.()
    if (localIssueLifecycleTails.get(lockName) === tail) {
      localIssueLifecycleTails.delete(lockName)
    }
  }
}

async function readValidatedInstalledIssue(
  issueSlug: string
): Promise<InstalledOfflineIssue | null> {
  const state = await readState(issueSlug)
  if (!cacheStorageAvailable()) {
    if (!state) {
      return null
    }
    throw new OfflineIssueError("storage", "此瀏覽器無法存取離線儲存空間。")
  }
  await sweepCandidateCaches(issueSlug, state?.cacheName)
  if (!state) {
    return null
  }

  try {
    validateManifest(state.manifest, issueSlug)
  } catch {
    await removeStateAndCache(state)
    return null
  }
  if (isExpired(state.manifest.expiresAt)) {
    await removeStateAndCache(state)
    return null
  }

  return state
}

function normalizedApiBaseUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new OfflineIssueError("network", "離線內容來源設定無效。")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OfflineIssueError("network", "離線內容來源必須使用 HTTP(S)。")
  }
  if (url.username || url.password) {
    throw new OfflineIssueError("network", "離線內容來源不得包含帳密。")
  }
  return url
}

function assertSafeArticleId(articleId: string): string {
  if (
    typeof articleId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(articleId)
  ) {
    throw new OfflineIssueError("corrupt", "離線文章識別碼無效。")
  }
  return articleId
}

function assertSha256(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new OfflineIssueError("corrupt", `離線 ${field} 校驗值無效。`)
  }
}

function validateManifest(manifest: OfflineManifest, issueSlug: string): void {
  if (
    !manifest ||
    manifest.issueSlug !== issueSlug ||
    !Number.isInteger(manifest.manifestVersion) ||
    manifest.manifestVersion < 1 ||
    !Array.isArray(manifest.articles) ||
    manifest.articles.length > MAX_ASSETS ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length > MAX_ASSETS ||
    !Number.isSafeInteger(manifest.assetBytes) ||
    manifest.assetBytes < 0 ||
    manifest.assetBytes > MAX_DOWNLOAD_BYTES ||
    !validInstant(manifest.expiresAt)
  ) {
    throw new OfflineIssueError("corrupt", "離線下載清單格式無效。")
  }
  assertSha256(manifest.checksum, "manifest")
  const articleIds = new Set<string>()
  const revisionIds = new Set<string>()
  const slugs = new Set<string>()
  const resourceUrls = new Set<string>()
  let declaredBytes = 0
  for (const article of manifest.articles) {
    if (
      !article ||
      typeof article !== "object" ||
      typeof article.articleId !== "string" ||
      typeof article.revisionId !== "string" ||
      !Number.isInteger(article.revisionNumber) ||
      article.revisionNumber < 1 ||
      typeof article.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) ||
      typeof article.title !== "string" ||
      article.title.trim().length < 1 ||
      !Number.isInteger(article.position) ||
      article.position < 1 ||
      typeof article.contentUrl !== "string" ||
      !Number.isSafeInteger(article.byteSize) ||
      article.byteSize < 1 ||
      article.byteSize > MAX_DOWNLOAD_BYTES
    ) {
      throw new OfflineIssueError("corrupt", "離線文章資料格式無效。")
    }
    assertSafeArticleId(article.articleId)
    assertSafeArticleId(article.revisionId)
    assertSha256(article.checksum, "article")
    const expectedContentUrl = `/api/v1/public/offline/issues/${issueSlug}/articles/${article.articleId}/revisions/${article.revisionId}`
    if (
      article.contentUrl !== expectedContentUrl ||
      !articleIds.add(article.articleId) ||
      !revisionIds.add(article.revisionId) ||
      !slugs.add(article.slug) ||
      !resourceUrls.add(article.contentUrl)
    ) {
      throw new OfflineIssueError("corrupt", "離線文章版本識別不一致。")
    }
    declaredBytes += article.byteSize
  }
  for (const asset of manifest.assets) {
    if (
      !asset ||
      typeof asset !== "object" ||
      typeof asset.assetId !== "string" ||
      typeof asset.variant !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,31}$/.test(asset.variant) ||
      typeof asset.url !== "string" ||
      typeof asset.mimeType !== "string" ||
      !["image/avif", "image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ||
      !Number.isSafeInteger(asset.byteSize) ||
      asset.byteSize < 1 ||
      asset.byteSize > MAX_DOWNLOAD_BYTES ||
      !validInstant(asset.expiresAt) ||
      Date.parse(asset.expiresAt) < Date.parse(manifest.expiresAt)
    ) {
      throw new OfflineIssueError("corrupt", "離線資產格式無效。")
    }
    assertSafeArticleId(asset.assetId)
    assertSha256(asset.checksum, "asset")
    if (!resourceUrls.add(asset.url)) {
      throw new OfflineIssueError("corrupt", "離線資產來源重複。")
    }
    declaredBytes += asset.byteSize
  }
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes !== manifest.assetBytes) {
    throw new OfflineIssueError("corrupt", "離線下載清單大小不一致。")
  }
}

async function validateWithdrawalManifest(manifest: WithdrawalManifest): Promise<void> {
  if (
    !manifest ||
    !Number.isInteger(manifest.version) ||
    manifest.version < 1 ||
    !Array.isArray(manifest.withdrawals) ||
    manifest.withdrawals.length > MAX_WITHDRAWALS ||
    !validInstant(manifest.generatedAt) ||
    manifest.withdrawals.some((articleId) => {
      try {
        assertSafeArticleId(articleId)
        return false
      } catch {
        return true
      }
    })
  ) {
    throw new OfflineIssueError("corrupt", "撤回清單格式無效。")
  }
  if (new Set(manifest.withdrawals).size !== manifest.withdrawals.length) {
    throw new OfflineIssueError("corrupt", "撤回清單含有重複識別碼。")
  }
  assertSha256(manifest.checksum, "withdrawal manifest")
  const canonical = `${manifest.version}\n${[...manifest.withdrawals].sort().join("\n")}`
  const checksum = await sha256Hex(new TextEncoder().encode(canonical).buffer as ArrayBuffer)
  if (checksum !== manifest.checksum) {
    throw new OfflineIssueError("corrupt", "撤回清單 checksum 校驗失敗。")
  }
}

function downloadAssetsFor(manifest: OfflineManifest): DownloadAsset[] {
  return [
    ...manifest.articles.map((article) => ({
      url: article.contentUrl,
      checksum: article.checksum,
      byteSize: article.byteSize
    })),
    ...manifest.assets.map((asset) => ({
      url: asset.url,
      checksum: asset.checksum,
      byteSize: asset.byteSize
    }))
  ]
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function isExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now()
}

function offlineResourceUrl(apiBaseUrl: URL, path: string): string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.includes("..") ||
    path.includes("//") ||
    path.includes("/./") ||
    path.endsWith("/")
  ) {
    throw new OfflineIssueError("corrupt", "離線資產來源不受信任。")
  }
  const mediaPath = /^\/media\/[a-z0-9][a-z0-9._/-]{0,255}$/.test(path)
  const articlePath =
    /^\/api\/v1\/public\/offline\/issues\/[a-z0-9]+(?:-[a-z0-9]+)*\/articles\/[0-9a-f-]{36}\/revisions\/[0-9a-f-]{36}$/.test(
      path
    )
  if (!mediaPath && !articlePath) {
    throw new OfflineIssueError("corrupt", "離線資產來源不受信任。")
  }
  const url = new URL(path, apiBaseUrl)
  if (
    url.origin !== apiBaseUrl.origin ||
    url.pathname !== path ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new OfflineIssueError("corrupt", "離線資產來源不受信任。")
  }
  return url.toString()
}

function validateCachedArticleProjection(
  value: unknown,
  issueSlug: string,
  articleSlug: string,
  manifestArticle: OfflineArticle
): PublicArticleProjection {
  if (
    !isRecord(value) ||
    value.articleId !== manifestArticle.articleId ||
    value.revisionId !== manifestArticle.revisionId ||
    value.revisionNumber !== manifestArticle.revisionNumber ||
    value.slug !== articleSlug ||
    value.canonicalPath !== `/articles/${articleSlug}` ||
    typeof value.title !== "string" ||
    !isRecord(value.content) ||
    typeof value.plainText !== "string" ||
    !Number.isInteger(value.readingTimeMinutes) ||
    !Array.isArray(value.media) ||
    !Array.isArray(value.contributors) ||
    !isRecord(value.issueNavigation) ||
    value.issueNavigation.issueSlug !== issueSlug
  ) {
    throw new OfflineIssueError("corrupt", "離線文章內容格式無效。")
  }
  return value as PublicArticleProjection
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cacheStorageAvailable(): boolean {
  return typeof globalThis.caches !== "undefined"
}

function getCacheStorage(): CacheStorage {
  if (!cacheStorageAvailable()) {
    throw new OfflineIssueError("storage", "此瀏覽器無法存取離線資產快取。")
  }
  return globalThis.caches
}

async function assertStorageCapacity(requiredBytes: number): Promise<void> {
  if (requiredBytes > MAX_DOWNLOAD_BYTES) {
    throw new OfflineIssueError("quota", "離線內容超出可保存的大小上限。")
  }
  const storage = globalThis.navigator?.storage
  if (!storage || typeof storage.estimate !== "function") {
    return
  }
  const estimate = await storage.estimate()
  if (estimate.quota === undefined || estimate.usage === undefined) {
    return
  }
  if (estimate.usage >= estimate.quota || requiredBytes > estimate.quota - estimate.usage) {
    throw new OfflineIssueError("quota", "儲存空間不足，無法保留離線內容。")
  }
}

async function fetchAsset(url: string): Promise<Response> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error"
    })
    if (!response.ok) {
      throw new OfflineIssueError("interrupted", "離線下載中斷，尚未安裝內容。")
    }
    return response
  } catch (error) {
    throw asAssetError(error)
  }
}

async function readAndVerifyAsset(response: Response, asset: DownloadAsset): Promise<ArrayBuffer> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  if (contentType.startsWith("text/plain")) {
    throw new OfflineIssueError("corrupt", "離線資產 checksum 校驗失敗，內容可能已損毀。")
  }

  let bytes: ArrayBuffer
  try {
    bytes = await response.arrayBuffer()
  } catch (error) {
    throw new OfflineIssueError("interrupted", "離線下載中斷，尚未安裝內容。", { cause: error })
  }
  if (asset.byteSize !== undefined && bytes.byteLength !== asset.byteSize) {
    throw new OfflineIssueError("corrupt", "離線資產大小校驗失敗。")
  }
  if (asset.checksum) {
    const checksum = await sha256Hex(bytes)
    if (checksum !== asset.checksum) {
      throw new OfflineIssueError("corrupt", "離線資產 checksum 校驗失敗，內容可能已損毀。")
    }
  }
  return bytes
}

function asAssetError(error: unknown): OfflineIssueError {
  if (error instanceof OfflineIssueError) {
    return error
  }
  return new OfflineIssueError("interrupted", "離線下載中斷，尚未安裝內容。", { cause: error })
}

function asOfflineIssueError(error: unknown): OfflineIssueError {
  if (error instanceof OfflineIssueError) {
    return error
  }
  return new OfflineIssueError("network", "離線內容暫時無法取得。", { cause: error })
}

function candidateCacheNameFor(issueSlug: string, manifest: OfflineManifest): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${candidateCachePrefixFor(issueSlug)}${manifest.manifestVersion}:${manifest.checksum}:${suffix}`
}

function candidateCachePrefixFor(issueSlug: string): string {
  return `${CACHE_PREFIX}:candidate:${encodeURIComponent(issueSlug)}:`
}

async function sweepCandidateCaches(issueSlug: string, preservedCacheName?: string): Promise<void> {
  const cacheStorage = getCacheStorage()
  try {
    const cacheNames = await cacheStorage.keys()
    await Promise.all(
      cacheNames
        .filter(
          (cacheName) =>
            cacheName.startsWith(candidateCachePrefixFor(issueSlug)) &&
            cacheName !== preservedCacheName
        )
        .map((cacheName) => cacheStorage.delete(cacheName))
    )
  } catch (error) {
    throw new OfflineIssueError("storage", "未完成的離線下載無法清理。", { cause: error })
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof globalThis.indexedDB === "undefined") {
    return Promise.reject(new OfflineIssueError("storage", "此瀏覽器不支援離線狀態儲存。"))
  }
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STATE_STORE)) {
        request.result.createObjectStore(STATE_STORE, { keyPath: "issueSlug" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new OfflineIssueError("storage", "離線狀態儲存無法開啟。", { cause: request.error }))
  })
}

async function readState(issueSlug: string): Promise<StoredOfflineIssue | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, "readonly")
    const request = transaction.objectStore(STATE_STORE).get(issueSlug)
    request.onsuccess = () => {
      database.close()
      resolve((request.result as StoredOfflineIssue | undefined) ?? null)
    }
    request.onerror = () => {
      database.close()
      reject(new OfflineIssueError("storage", "離線狀態無法讀取。", { cause: request.error }))
    }
  })
}

async function readAllStates(): Promise<unknown[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, "readonly")
    const request = transaction.objectStore(STATE_STORE).getAll(undefined, MAX_INSTALLED_ISSUES)
    request.onsuccess = () => {
      database.close()
      resolve(Array.isArray(request.result) ? request.result : [])
    }
    request.onerror = () => {
      database.close()
      reject(new OfflineIssueError("storage", "離線安裝清單無法讀取。", { cause: request.error }))
    }
  })
}

async function writeState(state: InstalledOfflineIssue): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, "readwrite")
    transaction.objectStore(STATE_STORE).put(state)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(
        new OfflineIssueError("storage", "離線安裝狀態無法提交。", { cause: transaction.error })
      )
    }
    transaction.onabort = () => {
      database.close()
      reject(
        new OfflineIssueError("storage", "離線安裝狀態無法提交。", { cause: transaction.error })
      )
    }
  })
}

async function deleteState(issueSlug: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, "readwrite")
    transaction.objectStore(STATE_STORE).delete(issueSlug)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(
        new OfflineIssueError("storage", "離線安裝狀態無法移除。", { cause: transaction.error })
      )
    }
    transaction.onabort = () => {
      database.close()
      reject(
        new OfflineIssueError("storage", "離線安裝狀態無法移除。", { cause: transaction.error })
      )
    }
  })
}

async function removeStateAndCache(state: InstalledOfflineIssue): Promise<void> {
  let cacheError: unknown
  try {
    await getCacheStorage().delete(state.cacheName)
  } catch (error) {
    cacheError = error
  } finally {
    await deleteState(state.issueSlug)
  }
  if (cacheError) {
    throw new OfflineIssueError("storage", "離線內容已撤回，但舊快取清理未完成。", {
      cause: cacheError
    })
  }
}
