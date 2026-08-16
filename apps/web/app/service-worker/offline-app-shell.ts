export const APP_SHELL_CACHE_PREFIX = "courtside-app-shell-"
export const APP_SHELL_CACHE_NAME = "courtside-app-shell-v1"
export const APP_SHELL_WORKER_PATH = "/offline-sw.js"
export const APP_SHELL_SCOPE = "/"
export const ISSUE_CONTENT_CACHE_PREFIX = "courtside-offline"

export const APP_SHELL_ROUTES = Object.freeze(["/", "/issues", "/search"] as const)
export const EXCLUDED_PRECACHE_ROUTE_PREFIXES = Object.freeze([
  "/articles/",
  "/issues/",
  "/studio/",
  "/preview/",
  "/editorial-preview/"
] as const)

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function shouldPrecacheAppShellPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  if (EXCLUDED_PRECACHE_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false
  }
  return APP_SHELL_ROUTES.some((route) => normalized === route)
}

type AppShellRegistrationLike = {
  scope: string
  active?: { scriptURL: string } | null
  waiting?: { scriptURL: string } | null
  installing?: { scriptURL: string } | null
  unregister: () => Promise<boolean>
}

type AppShellServiceWorkerContainerLike = {
  getRegistrations: () => Promise<readonly AppShellRegistrationLike[]>
}

type AppShellCacheStorageLike = {
  keys: () => Promise<readonly string[]>
  delete: (cacheName: string) => Promise<boolean>
}

function getPathname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl, "https://courtside.tw").pathname
  } catch {
    return null
  }
}

function isAppShellRegistration(registration: AppShellRegistrationLike): boolean {
  if (getPathname(registration.scope) !== APP_SHELL_SCOPE) {
    return false
  }

  return [registration.active, registration.waiting, registration.installing].some(
    (worker) => worker && getPathname(worker.scriptURL) === APP_SHELL_WORKER_PATH
  )
}

export async function disableOfflineAppShell(
  serviceWorker: AppShellServiceWorkerContainerLike,
  cacheStorage: AppShellCacheStorageLike
): Promise<void> {
  const registrations = await serviceWorker.getRegistrations()
  await Promise.all(
    registrations.filter(isAppShellRegistration).map((registration) => registration.unregister())
  )

  const cacheNames = await cacheStorage.keys()
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(APP_SHELL_CACHE_PREFIX))
      .map((cacheName) => cacheStorage.delete(cacheName))
  )
}

export function buildOfflineAppShellWorker(): string {
  const appShellRoutes = JSON.stringify(APP_SHELL_ROUTES)
  const excludedRoutes = JSON.stringify(EXCLUDED_PRECACHE_ROUTE_PREFIXES)

  return `const CACHE_NAME = ${JSON.stringify(APP_SHELL_CACHE_NAME)}
const CACHE_PREFIX = ${JSON.stringify(APP_SHELL_CACHE_PREFIX)}
const APP_SHELL_ROUTES = ${appShellRoutes}
const EXCLUDED_PRECACHE_ROUTE_PREFIXES = ${excludedRoutes}

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function isAppShellPath(rawPathname) {
  const pathname = normalizePathname(rawPathname)
  return (
    APP_SHELL_ROUTES.some((route) => pathname === route) &&
    !EXCLUDED_PRECACHE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

function buildAppShellCacheRequest(request) {
  const url = new URL(request.url)
  return new Request(new URL(normalizePathname(url.pathname), url.origin))
}

function isSameOriginResponse(response) {
  return !response.url || new URL(response.url).origin === self.location.origin
}

function readCachedAppShell(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache
      .match(buildAppShellCacheRequest(request), { ignoreSearch: true })
      .then((cached) => cached || Response.error())
  )
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ROUTES))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    !isAppShellPath(url.pathname)
  ) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response.ok || !isSameOriginResponse(response)) {
          return readCachedAppShell(request)
        }

        return caches
          .open(CACHE_NAME)
          .then((cache) =>
            cache
              .put(buildAppShellCacheRequest(request), response.clone())
              .catch(() => undefined)
          )
          .then(() => response)
      })
      .catch(() => readCachedAppShell(request))
  )
})
`
}
