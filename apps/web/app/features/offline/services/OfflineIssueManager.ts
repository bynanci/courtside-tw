import { publicMediaUrl } from "../../issues/public-issue-api.ts"
import { parsePublicIssueSlug } from "../../issues/public-issue-contract.ts"

const DATABASE_NAME = "courtside-offline"
const DATABASE_VERSION = 1
const STATE_STORE = "installed-issues"
const CACHE_PREFIX = "courtside-offline"
const MAX_ASSETS = 512
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024

export type OfflineArticle = {
  articleId: string
  slug?: string
  title?: string
  position?: number
  revisionId?: string
  revisionNumber?: number
  checksum?: string
}

export type OfflineAsset = {
  assetId?: string
  variant?: string
  url?: string
  mimeType?: string
  byteSize?: number
  checksum?: string
  expiresAt?: string
}

export type OfflineManifest = {
  issueSlug: string
  manifestVersion: number
  checksum: string
  expiresAt?: string
  assetBytes?: number
  articles: OfflineArticle[]
  assets?: OfflineAsset[]
}

export type WithdrawalManifest = {
  version: number
  generatedAt?: string
  withdrawals: string[]
  checksum?: string
}

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
  checksum?: string
  byteSize?: number
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
    const state = await readState(this.issueSlug)
    if (!state) {
      return null
    }

    if (!cacheStorageAvailable()) {
      throw new OfflineIssueError("storage", "此瀏覽器無法存取離線儲存空間。")
    }

    return state
  }

  async download(
    onProgress?: (progress: OfflineDownloadProgress) => void
  ): Promise<InstalledOfflineIssue> {
    const manifest = await this.fetchManifest()
    const assets = downloadAssetsFor(manifest)
    await assertStorageCapacity(manifest.assetBytes ?? 0)

    const cacheStorage = getCacheStorage()
    const previous = await readState(this.issueSlug)
    const candidateCacheName = candidateCacheNameFor(this.issueSlug, manifest)
    let committed = false

    try {
      const cache = await cacheStorage.open(candidateCacheName)
      onProgress?.({ completed: 0, total: assets.length })

      for (const [index, asset] of assets.entries()) {
        const response = await fetchAsset(this.apiBaseUrl, asset.url)
        const bytes = await readAndVerifyAsset(response, asset)
        await cache.put(
          asset.url,
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
        await cacheStorage.delete(previous.cacheName)
      }

      return installed
    } catch (error) {
      if (!committed) {
        await cacheStorage.delete(candidateCacheName)
      }
      throw asOfflineIssueError(error)
    }
  }

  async reconcileWithdrawal(): Promise<
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
      validateWithdrawalManifest(manifest)
    } catch (error) {
      throw asOfflineIssueError(error)
    }

    const withdrawn = new Set(manifest.withdrawals)
    const hasWithdrawnArticle = installed.manifest.articles.some((article) =>
      withdrawn.has(article.articleId)
    )
    if (!hasWithdrawnArticle) {
      return { status: "available", state: installed }
    }

    await removeStateAndCache(installed)
    return { status: "withdrawn" }
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
  if (typeof articleId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._~-]{0,127}$/.test(articleId)) {
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
    manifest.articles.length > MAX_ASSETS
  ) {
    throw new OfflineIssueError("corrupt", "離線下載清單格式無效。")
  }
  assertSha256(manifest.checksum, "manifest")
  if (
    manifest.assetBytes !== undefined &&
    (!Number.isSafeInteger(manifest.assetBytes) ||
      manifest.assetBytes < 0 ||
      manifest.assetBytes > MAX_DOWNLOAD_BYTES)
  ) {
    throw new OfflineIssueError("corrupt", "離線下載清單大小超出安全上限。")
  }
  for (const article of manifest.articles) {
    if (!article || typeof article !== "object" || typeof article.articleId !== "string") {
      throw new OfflineIssueError("corrupt", "離線文章資料格式無效。")
    }
    assertSafeArticleId(article.articleId)
  }
  if (manifest.assets !== undefined) {
    if (!Array.isArray(manifest.assets) || manifest.assets.length > MAX_ASSETS) {
      throw new OfflineIssueError("corrupt", "離線資產數量超出安全上限。")
    }
    for (const asset of manifest.assets) {
      if (!asset || typeof asset !== "object" || !asset.url) {
        throw new OfflineIssueError("corrupt", "離線資產缺少安全來源。")
      }
      if (asset.checksum) {
        assertSha256(asset.checksum, "asset")
      }
      if (
        asset.byteSize !== undefined &&
        (!Number.isSafeInteger(asset.byteSize) ||
          asset.byteSize < 1 ||
          asset.byteSize > MAX_DOWNLOAD_BYTES)
      ) {
        throw new OfflineIssueError("corrupt", "離線資產大小無效。")
      }
    }
  }
}

function validateWithdrawalManifest(manifest: WithdrawalManifest): void {
  if (
    !manifest ||
    !Number.isInteger(manifest.version) ||
    manifest.version < 1 ||
    !Array.isArray(manifest.withdrawals) ||
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
  if (manifest.checksum) {
    assertSha256(manifest.checksum, "withdrawal manifest")
  }
}

function downloadAssetsFor(manifest: OfflineManifest): DownloadAsset[] {
  if (manifest.assets && manifest.assets.length > 0) {
    return manifest.assets.map((asset) => ({
      url: asset.url!,
      checksum: asset.checksum,
      byteSize: asset.byteSize
    }))
  }
  return manifest.articles.map((article) => ({
    url: getOfflineFallbackAssetPath(article.articleId)
  }))
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

async function fetchAsset(apiBaseUrl: URL, path: string): Promise<Response> {
  let url: string
  try {
    url = publicMediaUrl(apiBaseUrl.toString(), path)
  } catch {
    throw new OfflineIssueError("corrupt", "離線資產來源不受信任。")
  }
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
  return `${CACHE_PREFIX}:candidate:${encodeURIComponent(issueSlug)}:${manifest.manifestVersion}:${manifest.checksum}:${suffix}`
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
