import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import { ref, watch } from "vue"
import { ReaderLibraryApiError } from "../../../app/features/library/reader-library-api.ts"
import { acknowledgeArticleCompletion } from "../../../app/features/passport/article-completion.ts"

const ARTICLE = "0190f7b0-7c4b-7e3a-8f12-123456789abc"
const REVISION = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const BLOCK = "0190f7b0-7c4b-7e3a-8f12-123456789abe"
const noop = () => {}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Execute the actual SFC request functions and unmount callback, without replacing their guards. */
async function pageHarness() {
  const source = await readFile(
    new URL("../../../app/pages/articles/[articleSlug].vue", import.meta.url),
    "utf8"
  )
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/u)?.[1] ?? ""
  const ast = ts.createSourceFile(
    "article.ts",
    script,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const names = new Set([
    "queueServerProgress",
    "confirmArticleCompletion",
    "progressWriteIsCurrent"
  ])
  const selected = ast.statements
    .filter(
      (statement) =>
        (ts.isFunctionDeclaration(statement) && statement.name && names.has(statement.name.text)) ||
        (ts.isExpressionStatement(statement) &&
          statement.getText(ast).startsWith("onBeforeUnmount(")) ||
        (ts.isVariableStatement(statement) &&
          statement.getText(ast).startsWith("const stopProgressIdentityWatch"))
    )
    .map((statement) => statement.getText(ast))
    .join("\n")
  let unmount = noop
  let cleared = 0
  const writes: Array<{ articleId: string; revisionId: string; blockId: string; percent: number }> =
    []
  const context = { articleId: ARTICLE, revisionId: REVISION }
  const scope = {
    readingContext: ref(context),
    readerCanSync: ref(true),
    articleBlocks: { value: [{ id: BLOCK }] },
    completionState: { value: "idle" },
    completionError: { value: null as string | null },
    progressSyncState: { value: "idle" },
    progressSyncQueue: Promise.resolve(),
    progressDisposed: false,
    progressGeneration: 0,
    watch,
    putServerProgress: async (
      articleId: string,
      input: { revisionId: string; blockId: string; percent: number }
    ) => {
      const value = { articleId, ...input }
      writes.push(value)
      return value
    },
    acknowledgeArticleCompletion,
    ReaderLibraryApiError,
    browserProgressStorage: () => ({}),
    readingProgress: {
      clearCompleted: () => {
        cleared++
      }
    },
    onBeforeUnmount: (callback: () => void) => {
      unmount = callback
    },
    stopResumeWatch: noop,
    stopArticleFocusWatch: noop,
    stopReaderMotionPolicyWatch: noop,
    stopProgressIdentityWatch: noop,
    document: { removeEventListener: noop },
    window: { removeEventListener: noop },
    handleReaderScroll: noop,
    flushReadingProgressSave: noop,
    handleReaderPageHide: noop,
    reloadManualScrollPosition: null,
    restoreManualReloadScrollPosition: noop,
    releaseReloadScrollGuard: noop,
    complete: async () => {},
    queue: (_context: typeof context, _location: { blockId: string; documentProgress: number }) => {
      void _context
      void _location
    }
  }
  const js = ts.transpileModule(selected, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText
  vm.runInNewContext(
    js + "\ncomplete = confirmArticleCompletion; queue = queueServerProgress;",
    scope
  )
  return { scope, writes, unmount: () => unmount(), cleared: () => cleared }
}

test("unmount cancels completion waiting behind an earlier queued position write", async () => {
  const page = await pageHarness()
  const earlier = deferred<void>()
  page.scope.progressSyncQueue = earlier.promise
  const completion = page.scope.complete()
  page.unmount()
  earlier.resolve()
  await completion
  assert.equal(page.writes.length, 0)
  assert.equal(page.cleared(), 0)
})

test("unmount prevents a delayed position request from starting", async () => {
  const page = await pageHarness()
  const earlier = deferred<void>()
  page.scope.progressSyncQueue = earlier.promise
  page.scope.queue(page.scope.readingContext.value, { blockId: BLOCK, documentProgress: 0.9 })
  page.unmount()
  earlier.resolve()
  await page.scope.progressSyncQueue
  assert.equal(page.writes.length, 0)
})

test("revision replacement and loss of reader authority both prevent pending acknowledgement", async () => {
  for (const change of ["revision", "authority"]) {
    const page = await pageHarness()
    const earlier = deferred<void>()
    page.scope.progressSyncQueue = earlier.promise
    const completion = page.scope.complete()
    if (change === "revision")
      page.scope.readingContext.value = { articleId: ARTICLE, revisionId: BLOCK }
    else page.scope.readerCanSync.value = false
    earlier.resolve()
    await completion
    assert.equal(page.writes.length, 0)
    assert.equal(page.cleared(), 0)
  }
})

test("returning to the same revision or restoring authority cannot revive an older queued command", async () => {
  for (const change of ["revision", "authority"]) {
    const page = await pageHarness()
    const earlier = deferred<void>()
    page.scope.progressSyncQueue = earlier.promise
    const completion = page.scope.complete()
    if (change === "revision") {
      page.scope.readingContext.value = { articleId: ARTICLE, revisionId: BLOCK }
      page.scope.readingContext.value = { articleId: ARTICLE, revisionId: REVISION }
    } else {
      page.scope.readerCanSync.value = false
      page.scope.readerCanSync.value = true
    }
    earlier.resolve()
    await completion
    assert.equal(page.writes.length, 0)
    assert.equal(page.cleared(), 0)
    page.unmount()
  }
})

test("an already-sent position response cannot overwrite the next revision status", async () => {
  const page = await pageHarness()
  const sent = deferred<void>()
  const response = deferred<{
    articleId: string
    revisionId: string
    blockId: string
    percent: number
  }>()
  page.scope.putServerProgress = async () => {
    sent.resolve()
    return response.promise
  }
  page.scope.queue(page.scope.readingContext.value, { blockId: BLOCK, documentProgress: 0.9 })
  await sent.promise
  page.scope.readingContext.value = { articleId: ARTICLE, revisionId: BLOCK }
  page.scope.progressSyncState.value = "new-revision"
  response.resolve({ articleId: ARTICLE, revisionId: REVISION, blockId: BLOCK, percent: 90 })
  await page.scope.progressSyncQueue
  assert.equal(page.scope.progressSyncState.value, "new-revision")
  page.unmount()
})

test("late acknowledgement success or rejection cannot mutate an unmounted page", async () => {
  for (const rejected of [false, true]) {
    const page = await pageHarness()
    const sent = deferred<void>()
    const response = deferred<{
      articleId: string
      revisionId: string
      blockId: string
      percent: number
    }>()
    page.scope.putServerProgress = async () => {
      sent.resolve()
      return response.promise
    }
    const completion = page.scope.complete()
    await sent.promise
    page.unmount()
    page.scope.completionState.value = "new-page"
    page.scope.completionError.value = "new-page"
    if (rejected) response.reject(new ReaderLibraryApiError(401, "expired", null))
    else
      response.resolve({ articleId: ARTICLE, revisionId: REVISION, blockId: BLOCK, percent: 100 })
    await completion
    assert.equal(page.scope.completionState.value, "new-page")
    assert.equal(page.scope.completionError.value, "new-page")
    assert.equal(page.scope.readerCanSync.value, true)
    assert.equal(page.cleared(), 0)
  }
})
