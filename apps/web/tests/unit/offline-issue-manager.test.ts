import { deepEqual, equal, rejects, throws } from "node:assert/strict"
import { test } from "node:test"

import {
  getOfflineFallbackAssetPath,
  getOfflineIssueManifestPath,
  OfflineIssueError,
  OfflineIssueManager,
  type OfflineManifest,
  sha256Hex
} from "../../app/features/offline/services/OfflineIssueManager.ts"

const ISSUE_SLUG = "issue-2026-01"
const ARTICLE_ID = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const REVISION_ID = "0190f7b0-7c4b-7e3a-8f12-123456789ab1"
const ARTICLE_PATH = `/api/v1/public/offline/issues/${ISSUE_SLUG}/articles/${ARTICLE_ID}/revisions/${REVISION_ID}`

type StoredIssue = {
  issueSlug: string
}

type FakeCache = {
  match(request: RequestInfo | URL): Promise<Response | undefined>
  put(request: RequestInfo | URL, response: Response): Promise<void>
  keys(): Promise<Request[]>
}

type FakeCacheStorage = CacheStorage & {
  failNextDelete(cacheName: string): void
}

function requestUrl(request: RequestInfo | URL): string {
  if (typeof request === "string") return request
  if (request instanceof URL) return request.toString()
  return request.url
}

function createFakeCacheStorage(): FakeCacheStorage {
  const cachesByName = new Map<string, Map<string, Response>>()
  const oneShotDeleteFailures = new Set<string>()

  function cacheFor(cacheName: string): FakeCache {
    const entries = cachesByName.get(cacheName) ?? new Map<string, Response>()
    cachesByName.set(cacheName, entries)
    return {
      async match(request) {
        return entries.get(requestUrl(request))?.clone()
      },
      async put(request, response) {
        entries.set(requestUrl(request), response.clone())
      },
      async keys() {
        return [...entries.keys()].map((url) => new Request(url))
      }
    }
  }

  return {
    async delete(cacheName) {
      if (oneShotDeleteFailures.delete(cacheName)) {
        throw new Error(`delete failed for ${cacheName}`)
      }
      return cachesByName.delete(cacheName)
    },
    async has(cacheName) {
      return cachesByName.has(cacheName)
    },
    async keys() {
      return [...cachesByName.keys()]
    },
    async match(request) {
      for (const entries of cachesByName.values()) {
        const response = entries.get(requestUrl(request))
        if (response) return response.clone()
      }
      return undefined
    },
    async open(cacheName) {
      return cacheFor(cacheName) as Cache
    },
    failNextDelete(cacheName) {
      oneShotDeleteFailures.add(cacheName)
    }
  }
}

function createFakeIndexedDb(): IDBFactory {
  const records = new Map<string, StoredIssue>()
  let initialized = false

  const database = {
    close() {},
    createObjectStore() {
      initialized = true
      return {}
    },
    objectStoreNames: {
      contains() {
        return initialized
      }
    },
    transaction() {
      const transaction: Record<string, unknown> = {
        error: null,
        onabort: null,
        oncomplete: null,
        onerror: null
      }
      const objectStore = {
        delete(key: string) {
          queueMicrotask(() => {
            records.delete(key)
            ;(transaction.oncomplete as (() => void) | null)?.()
          })
          return {}
        },
        get(key: string) {
          const request: Record<string, unknown> = {
            error: null,
            onsuccess: null,
            onerror: null,
            result: undefined
          }
          queueMicrotask(() => {
            request.result = structuredClone(records.get(key))
            ;(request.onsuccess as (() => void) | null)?.()
          })
          return request
        },
        put(value: StoredIssue) {
          queueMicrotask(() => {
            records.set(value.issueSlug, structuredClone(value))
            ;(transaction.oncomplete as (() => void) | null)?.()
          })
          return {}
        }
      }
      transaction.objectStore = () => objectStore
      return transaction
    }
  }

  return {
    open() {
      const request: Record<string, unknown> = {
        error: null,
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: database
      }
      queueMicrotask(() => {
        if (!initialized) {
          ;(request.onupgradeneeded as (() => void) | null)?.()
        }
        queueMicrotask(() => {
          ;(request.onsuccess as (() => void) | null)?.()
        })
      })
      return request as unknown as IDBOpenDBRequest
    }
  } as IDBFactory
}

async function offlineFixture(version: number): Promise<{
  articleBody: string
  manifest: OfflineManifest
}> {
  const articleBody = JSON.stringify({
    articleId: ARTICLE_ID,
    canonicalPath: "/articles/opening-night",
    content: { blocks: [], documentId: ARTICLE_ID, schemaVersion: 1 },
    contributors: [],
    issueNavigation: { issueSlug: ISSUE_SLUG, next: null, previous: null },
    media: [],
    plainText: "Offline body",
    publishedAt: "2026-08-01T00:00:00Z",
    readingTimeMinutes: 1,
    revisionId: REVISION_ID,
    revisionNumber: 1,
    slug: "opening-night",
    title: "Opening night",
    updatedAt: "2026-08-01T00:00:00Z"
  })
  const bytes = new TextEncoder().encode(articleBody)
  return {
    articleBody,
    manifest: {
      issueSlug: ISSUE_SLUG,
      manifestVersion: version,
      checksum: version.toString(16).padStart(64, "0"),
      expiresAt: "2099-09-01T00:00:00Z",
      assetBytes: bytes.byteLength,
      articles: [
        {
          articleId: ARTICLE_ID,
          revisionId: REVISION_ID,
          revisionNumber: 1,
          slug: "opening-night",
          title: "Opening night",
          position: 1,
          contentUrl: ARTICLE_PATH,
          byteSize: bytes.byteLength,
          checksum: await sha256Hex(bytes.buffer)
        }
      ],
      assets: []
    }
  }
}

test("offline manager builds bounded public manifest and asset paths", () => {
  equal(
    getOfflineIssueManifestPath("issue-2026-01"),
    "/api/v1/public/offline/issues/issue-2026-01/manifest"
  )
  equal(
    getOfflineFallbackAssetPath("0190f7b0-7c4b-7e3a-8f12-123456789abd"),
    "/media/offline/0190f7b0-7c4b-7e3a-8f12-123456789abd"
  )
})

test("offline manager rejects traversal in fallback asset identifiers", () => {
  throws(
    () => getOfflineFallbackAssetPath("../private-asset"),
    (error: unknown) => error instanceof OfflineIssueError && error.code === "corrupt"
  )
})

test("offline manager computes SHA-256 checksums for downloaded bytes", async () => {
  const checksum = await sha256Hex(new TextEncoder().encode("hello").buffer)
  deepEqual(checksum, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
})

test("offline manager commits updates once and removes installed state fail closed", async () => {
  const originalCaches = globalThis.caches
  const originalFetch = globalThis.fetch
  const originalIndexedDb = globalThis.indexedDB
  const cacheStorage = createFakeCacheStorage()
  const versionOne = await offlineFixture(1)
  const versionTwo = await offlineFixture(2)
  let fixture = versionOne
  let rejectNextManifest = false
  let releaseFirstArticle: (() => void) | undefined
  let markFirstArticleRequested: (() => void) | undefined
  const firstArticleRequested = new Promise<void>((resolve) => {
    markFirstArticleRequested = resolve
  })
  const firstArticleRelease = new Promise<void>((resolve) => {
    releaseFirstArticle = resolve
  })
  let firstArticleBlocked = true

  Object.defineProperty(globalThis, "caches", { configurable: true, value: cacheStorage })
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: createFakeIndexedDb()
  })
  globalThis.fetch = async (input) => {
    const url = requestUrl(input)
    if (url.endsWith(`/offline/issues/${ISSUE_SLUG}/manifest`)) {
      if (rejectNextManifest) {
        rejectNextManifest = false
        throw new Error("competing manifest request failed")
      }
      return Response.json(fixture.manifest)
    }
    if (url.endsWith(ARTICLE_PATH)) {
      if (firstArticleBlocked) {
        firstArticleBlocked = false
        markFirstArticleRequested?.()
        await firstArticleRelease
      }
      return new Response(fixture.articleBody, {
        headers: { "content-type": "application/json" }
      })
    }
    return new Response(null, { status: 404 })
  }

  try {
    const manager = new OfflineIssueManager("https://api.courtside.test", ISSUE_SLUG)
    const firstDownload = manager.download()
    await firstArticleRequested

    rejectNextManifest = true
    const competingManager = new OfflineIssueManager("https://api.courtside.test", ISSUE_SLUG)
    const competingFailure = rejects(
      competingManager.download(),
      (error: unknown) => error instanceof OfflineIssueError && error.code === "network"
    )
    for (let attempt = 0; attempt < 20 && rejectNextManifest; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    releaseFirstArticle?.()

    const installedOne = await firstDownload
    await competingFailure
    equal(installedOne.manifest.manifestVersion, 1)
    equal(await cacheStorage.has(installedOne.cacheName), true)

    fixture = versionTwo
    cacheStorage.failNextDelete(installedOne.cacheName)
    const installedTwo = await manager.download()
    equal(installedTwo.manifest.manifestVersion, 2)
    equal((await manager.getInstalled())?.manifest.manifestVersion, 2)

    cacheStorage.failNextDelete(installedTwo.cacheName)
    await rejects(
      manager.remove(),
      (error: unknown) => error instanceof OfflineIssueError && error.code === "storage"
    )
    equal(await manager.getInstalled(), null)
    deepEqual(await cacheStorage.keys(), [])
  } finally {
    Object.defineProperty(globalThis, "caches", { configurable: true, value: originalCaches })
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb
    })
    globalThis.fetch = originalFetch
  }
})
