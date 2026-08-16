import { deepEqual, match, strictEqual } from "node:assert/strict"
import { test } from "node:test"

import {
  APP_SHELL_CACHE_NAME,
  APP_SHELL_CACHE_PREFIX,
  APP_SHELL_ROUTES,
  EXCLUDED_PRECACHE_ROUTE_PREFIXES,
  ISSUE_CONTENT_CACHE_PREFIX,
  buildOfflineAppShellWorker,
  shouldPrecacheAppShellPath
} from "../../app/service-worker/offline-app-shell.ts"

test("app-shell cache is separate from issue-content caches", () => {
  strictEqual(APP_SHELL_CACHE_NAME.startsWith(APP_SHELL_CACHE_PREFIX), true)
  strictEqual(APP_SHELL_CACHE_NAME.startsWith(ISSUE_CONTENT_CACHE_PREFIX), false)

  const worker = buildOfflineAppShellWorker()
  strictEqual(worker.includes(ISSUE_CONTENT_CACHE_PREFIX), false)
  match(worker, /courtside-app-shell-v1/)
})

test("precache allowlist excludes editorial, preview and issue-content routes", () => {
  deepEqual(APP_SHELL_ROUTES, ["/", "/issues", "/search"])
  deepEqual(EXCLUDED_PRECACHE_ROUTE_PREFIXES, [
    "/articles/",
    "/issues/",
    "/studio/",
    "/preview/",
    "/editorial-preview/"
  ])

  strictEqual(shouldPrecacheAppShellPath("/"), true)
  strictEqual(shouldPrecacheAppShellPath("/issues"), true)
  strictEqual(shouldPrecacheAppShellPath("/search"), true)

  for (const path of [
    "/articles/opening-night",
    "/issues/issue-2026-01",
    "/studio/issues/issue-2026-01",
    "/preview/issue-2026-01",
    "/editorial-preview/issue-2026-01"
  ]) {
    strictEqual(shouldPrecacheAppShellPath(path), false, path)
  }
})

test("worker source handles only the app-shell navigation boundary", () => {
  const worker = buildOfflineAppShellWorker()

  match(worker, /request\.mode !== "navigate"/)
  match(worker, /pathname === route/)
  match(worker, /courtside-app-shell-/)
  strictEqual(worker.includes("courtside-offline"), false)
})
