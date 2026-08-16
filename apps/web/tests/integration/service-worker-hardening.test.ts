import { deepEqual, rejects, strictEqual } from "node:assert/strict"
import { test } from "node:test"
import { runInNewContext } from "node:vm"

import {
  APP_SHELL_CACHE_NAME,
  buildOfflineAppShellWorker,
  disableOfflineAppShell
} from "../../app/service-worker/offline-app-shell.ts"

const ORIGIN = "https://courtside.tw"

type CacheRequest = { url: string } | string

type FakeCache = {
  addAll: (requests: readonly CacheRequest[]) => Promise<void>
  match: (
    request: CacheRequest,
    options?: { ignoreSearch?: boolean }
  ) => Promise<Response | undefined>
  put: (request: CacheRequest, response: Response) => Promise<void>
}

type FakeCacheStorage = {
  cache: FakeCache
  consumedBodies: string[]
  matchRequests: string[]
  putRequests: string[]
  seed: (pathname: string, body: string) => void
}

function cacheKey(request: CacheRequest): string {
  const url = new URL(typeof request === "string" ? request : request.url, ORIGIN)
  return `${url.pathname}${url.search}`
}

function createFakeCacheStorage(): FakeCacheStorage {
  const entries = new Map<string, Response>()
  const putRequests: string[] = []
  const matchRequests: string[] = []
  const consumedBodies: string[] = []

  const cache: FakeCache = {
    async addAll() {},
    async match(request, options) {
      const key = cacheKey(request)
      matchRequests.push(key)
      const exact = entries.get(key)
      if (exact) {
        return exact.clone()
      }
      if (!options?.ignoreSearch) {
        return undefined
      }
      const pathname = new URL(key, ORIGIN).pathname
      for (const [candidateKey, response] of entries) {
        if (new URL(candidateKey, ORIGIN).pathname === pathname) {
          return response.clone()
        }
      }
      return undefined
    },
    async put(request, response) {
      const key = cacheKey(request)
      putRequests.push(key)
      const body = await response.text()
      consumedBodies.push(body)
      entries.set(key, new Response(body, { status: response.status }))
    }
  }

  return {
    cache,
    consumedBodies,
    matchRequests,
    putRequests,
    seed(pathname, body) {
      entries.set(pathname, new Response(body))
    }
  }
}

function navigateRequest(
  pathname: string,
  search = ""
): { method: string; mode: string; url: string } {
  return {
    method: "GET",
    mode: "navigate",
    url: `${ORIGIN}${pathname}${search}`
  }
}

function createWorkerHarness(
  storage: FakeCacheStorage,
  fetchImplementation: (request: unknown) => Promise<Response>,
  cacheOpen: () => Promise<FakeCache> = async () => storage.cache
) {
  const listeners = new Map<
    string,
    (event: {
      request: unknown
      respondWith: (response: Promise<Response>) => void
      waitUntil: (effect: Promise<unknown>) => void
    }) => void
  >()
  const sideEffects: Promise<unknown>[] = []
  const self = {
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, listener as never)
    },
    clients: { claim: async () => undefined },
    location: { origin: ORIGIN },
    skipWaiting() {}
  }

  runInNewContext(buildOfflineAppShellWorker(), {
    Promise,
    Request,
    Response,
    URL,
    caches: { open: cacheOpen },
    fetch: fetchImplementation,
    self
  })

  return {
    dispatchFetch(request: unknown): Promise<Response> {
      const listener = listeners.get("fetch")
      if (!listener) {
        throw new Error("fetch listener was not registered")
      }
      let responsePromise: Promise<Response> | undefined
      listener({
        request,
        respondWith(response) {
          responsePromise = response
        },
        waitUntil(effect) {
          sideEffects.push(Promise.resolve(effect))
        }
      })
      if (!responsePromise) {
        throw new Error("fetch listener did not call respondWith")
      }
      return responsePromise
    },
    async waitForSideEffects() {
      await Promise.allSettled(sideEffects)
    }
  }
}

test("disabled flag only unregisters the app-shell worker and clears its caches", async () => {
  const unregistered: string[] = []
  const deleted: string[] = []
  const appShellRegistration = {
    scope: `${ORIGIN}/`,
    active: { scriptURL: `${ORIGIN}/offline-sw.js` },
    async unregister() {
      unregistered.push("app-shell")
      return true
    }
  }
  const unrelatedRegistration = {
    scope: `${ORIGIN}/`,
    active: { scriptURL: `${ORIGIN}/other-worker.js` },
    async unregister() {
      unregistered.push("unrelated")
      return true
    }
  }

  await disableOfflineAppShell(
    {
      getRegistrations: async () => [appShellRegistration, unrelatedRegistration]
    },
    {
      async keys() {
        return [APP_SHELL_CACHE_NAME, "courtside-app-shell-old", "courtside-offline:issue-1"]
      },
      async delete(name: string) {
        deleted.push(name)
        return true
      }
    }
  )

  deepEqual(unregistered, ["app-shell"])
  deepEqual(deleted, [APP_SHELL_CACHE_NAME, "courtside-app-shell-old"])
})

test("disabled cleanup still removes caches when worker unregister fails", async () => {
  const deleted: string[] = []

  await rejects(
    disableOfflineAppShell(
      {
        getRegistrations: async () => [
          {
            scope: `${ORIGIN}/`,
            active: { scriptURL: `${ORIGIN}/offline-sw.js` },
            async unregister() {
              throw new Error("registration update in progress")
            }
          }
        ]
      },
      {
        async keys() {
          return [APP_SHELL_CACHE_NAME, "courtside-offline:issue-1"]
        },
        async delete(name: string) {
          deleted.push(name)
          return true
        }
      }
    )
  )

  deepEqual(deleted, [APP_SHELL_CACHE_NAME])
})

test("same-origin canonical app-shell responses update cache from a clone", async () => {
  const storage = createFakeCacheStorage()
  const worker = createWorkerHarness(storage, async () => new Response("fresh-app-shell"))

  const response = await worker.dispatchFetch(navigateRequest("/search"))
  await worker.waitForSideEffects()

  strictEqual(await response.text(), "fresh-app-shell")
  deepEqual(storage.putRequests, ["/search"])
  deepEqual(storage.consumedBodies, ["fresh-app-shell"])
  const cached = await storage.cache.match("/search")
  strictEqual(await cached?.text(), "fresh-app-shell")
})

test("query-specific SSR responses do not overwrite the canonical shell cache", async () => {
  const storage = createFakeCacheStorage()
  const worker = createWorkerHarness(storage, async () => new Response("query-a-results"))

  const response = await worker.dispatchFetch(navigateRequest("/search", "?q=A"))
  await worker.waitForSideEffects()

  strictEqual(await response.text(), "query-a-results")
  deepEqual(storage.putRequests, [])
})

test("healthy navigation response is returned before asynchronous cache persistence", async () => {
  const storage = createFakeCacheStorage()
  const originalPut = storage.cache.put
  let releaseCacheWrite: (() => void) | undefined
  storage.cache.put = async (request, response) => {
    await new Promise<void>((resolve) => {
      releaseCacheWrite = resolve
    })
    await originalPut(request, response)
  }
  const worker = createWorkerHarness(storage, async () => new Response("streamable-shell"))

  const responsePromise = worker.dispatchFetch(navigateRequest("/issues"))
  let settled = false
  void responsePromise.then(() => {
    settled = true
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  strictEqual(settled, true)

  releaseCacheWrite?.()
  const response = await responsePromise
  strictEqual(await response.text(), "streamable-shell")
  await worker.waitForSideEffects()
})

test("cache storage open failure does not replace a successful network response", async () => {
  const storage = createFakeCacheStorage()
  const worker = createWorkerHarness(
    storage,
    async () => new Response("online-app-shell"),
    async () => {
      throw new Error("cache unavailable")
    }
  )

  const response = await worker.dispatchFetch(navigateRequest("/search"))

  strictEqual(await response.text(), "online-app-shell")
})

test("offline fallback looks up the normalized pathname", async () => {
  const storage = createFakeCacheStorage()
  storage.seed("/search", "cached-search")
  const worker = createWorkerHarness(storage, async () => {
    throw new Error("network offline")
  })

  const response = await worker.dispatchFetch(navigateRequest("/search/", "?section=top"))

  strictEqual(await response.text(), "cached-search")
  deepEqual(storage.matchRequests, ["/search"])
})

test("non-ok responses and network rejection both use cached app-shell responses", async () => {
  const fetchImplementations = [
    async () => new Response("upstream-503", { status: 503 }),
    async () => {
      throw new Error("network offline")
    }
  ]

  for (const fetchImplementation of fetchImplementations) {
    const storage = createFakeCacheStorage()
    storage.seed("/issues", "cached-issues")
    const worker = createWorkerHarness(storage, fetchImplementation)

    const response = await worker.dispatchFetch(navigateRequest("/issues"))

    strictEqual(await response.text(), "cached-issues")
  }
})

test("navigation redirects pass through instead of being replaced by a cached shell", async () => {
  const storage = createFakeCacheStorage()
  storage.seed("/issues", "cached-issues")
  const worker = createWorkerHarness(storage, async () =>
    Response.redirect(`${ORIGIN}/issues/`, 302)
  )

  const response = await worker.dispatchFetch(navigateRequest("/issues"))

  strictEqual(response.status, 302)
  strictEqual(response.headers.get("location"), `${ORIGIN}/issues/`)
})
