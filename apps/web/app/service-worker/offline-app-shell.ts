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
    fetch(request).catch(() =>
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request, { ignoreSearch: true }).then((cached) => cached || Response.error())
      )
    )
  )
})
`
}
