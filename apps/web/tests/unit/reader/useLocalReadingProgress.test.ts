import assert from "node:assert/strict"
import test from "node:test"

import {
  legacyProgressKey,
  MAX_LOCAL_PROGRESS_ARTICLES,
  progressIndexKey,
  progressRecordKey,
  progressSlugKey,
  selectViewportProgress,
  useLocalReadingProgress,
  type LocalReadingContext,
  type ProgressStorage
} from "../../../app/features/reader/composables/useLocalReadingProgress.ts"

const context: LocalReadingContext = {
  articleId: "0190f7b0-7c4b-7e3a-8f12-123456789abd",
  revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789ab1",
  revisionNumber: 1,
  articleSlug: "opening-night",
  articleTitle: "主場燈光亮起之前"
}

const blocks = [
  { id: "00000000-0000-4000-8000-000000000001", label: "開場" },
  { id: "00000000-0000-4000-8000-000000000002", label: "第二節" },
  { id: "00000000-0000-4000-8000-000000000003", label: "收束" }
]

class MemoryStorage implements ProgressStorage {
  readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

class StagedFailureStorage extends MemoryStorage {
  private failAtSet: number | null = null
  private failAtRemove: number | null = null
  private setCalls = 0
  private removeCalls = 0

  armFailure(setCall: number): void {
    this.failAtSet = setCall
    this.setCalls = 0
  }

  armRemoveFailure(removeCall: number): void {
    this.failAtRemove = removeCall
    this.removeCalls = 0
  }

  override setItem(key: string, value: string): void {
    this.setCalls += 1
    if (this.failAtSet === this.setCalls) {
      this.failAtSet = null
      throw new DOMException("quota", "QuotaExceededError")
    }
    super.setItem(key, value)
  }

  override removeItem(key: string): void {
    this.removeCalls += 1
    if (this.failAtRemove === this.removeCalls) {
      this.failAtRemove = null
      throw new DOMException("blocked", "SecurityError")
    }
    super.removeItem(key)
  }
}

test("loads a mid-article pointer as an explicit prompt without scrolling", () => {
  const storage = new MemoryStorage()
  const writer = useLocalReadingProgress()
  assert.equal(
    writer.save(storage, context, {
      blockId: blocks[1]!.id,
      blockLabel: blocks[1]!.label,
      offset: 0.4,
      documentProgress: 0.42
    }),
    true
  )

  const reader = useLocalReadingProgress()
  reader.load(storage, context, blocks)

  assert.deepEqual(reader.resumePrompt.value, {
    articleTitle: context.articleTitle,
    blockLabel: "第二節",
    documentProgress: 0.42
  })
  assert.equal(reader.pendingProgress.value?.blockId, blocks[1]!.id)
  assert.equal(reader.resumeRequested.value, false)
})

test("continue resolves the same stable anchor against current viewport and font geometry", () => {
  const storage = new MemoryStorage()
  const writer = useLocalReadingProgress()
  writer.save(storage, context, {
    blockId: blocks[1]!.id,
    blockLabel: blocks[1]!.label,
    offset: 0.5,
    documentProgress: 0.5
  })

  const compact = useLocalReadingProgress()
  compact.load(storage, context, blocks)
  assert.equal(
    compact.continueReading([{ blockId: blocks[1]!.id, top: 800, height: 400 }], 800),
    840
  )

  const reflowed = useLocalReadingProgress()
  reflowed.load(storage, context, blocks)
  assert.equal(
    reflowed.continueReading([{ blockId: blocks[1]!.id, top: 1100, height: 700 }], 500),
    1325
  )
  assert.equal(reflowed.resumeRequested.value, true)
})

test("invalidates a stale revision even when its stable block still exists", () => {
  const storage = new MemoryStorage()
  const writer = useLocalReadingProgress()
  writer.save(storage, context, {
    blockId: blocks[1]!.id,
    blockLabel: blocks[1]!.label,
    offset: 0.25,
    documentProgress: 0.35
  })
  const oldRecordKey = progressRecordKey(context.articleId, context.revisionId, blocks[1]!.id)

  const revisionTwo = { ...context, revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789ab2" }
  const invalidated = useLocalReadingProgress()
  invalidated.load(storage, revisionTwo, blocks)
  const currentRecordKey = progressRecordKey(
    revisionTwo.articleId,
    revisionTwo.revisionId,
    blocks[1]!.id
  )

  assert.equal(invalidated.resumePrompt.value, null)
  assert.equal(invalidated.pendingProgress.value, null)
  assert.equal(storage.getItem(oldRecordKey), null)
  assert.equal(storage.getItem(currentRecordKey), null)
  assert.equal(storage.getItem(progressIndexKey(context.articleId)), null)
  assert.equal(storage.getItem(progressSlugKey(context.articleSlug)), null)
})

test("selects a stable block after layout changes and bounds resume to 10-95 percent", () => {
  const selected = selectViewportProgress(
    [
      { blockId: blocks[0]!.id, blockLabel: "開場", top: -500, bottom: -50, height: 450 },
      { blockId: blocks[1]!.id, blockLabel: "第二節", top: 120, bottom: 920, height: 800 }
    ],
    800,
    0.44
  )
  assert.deepEqual(selected, {
    blockId: blocks[1]!.id,
    blockLabel: "第二節",
    offset: 0.1,
    documentProgress: 0.44
  })

  const storage = new MemoryStorage()
  const progress = useLocalReadingProgress()
  assert.equal(progress.save(storage, context, selected!), true)
  const savedIndex = storage.getItem(progressIndexKey(context.articleId))
  assert.equal(progress.save(storage, context, { ...selected!, documentProgress: 0.09 }), false)
  assert.equal(storage.getItem(progressIndexKey(context.articleId)), savedIndex)
  assert.equal(progress.save(storage, context, { ...selected!, documentProgress: 0.96 }), false)
  assert.equal(storage.getItem(progressIndexKey(context.articleId)), null)
})

test("start over and unavailable cleanup remove only the attributable article pointer", () => {
  const storage = new MemoryStorage()
  const progress = useLocalReadingProgress()
  progress.save(storage, context, {
    blockId: blocks[1]!.id,
    blockLabel: blocks[1]!.label,
    offset: 0.2,
    documentProgress: 0.4
  })
  progress.load(storage, context, blocks)
  progress.startOver(storage, context)

  assert.equal(progress.resumePrompt.value, null)
  assert.equal(storage.getItem(progressIndexKey(context.articleId)), null)
  assert.equal(storage.getItem(progressSlugKey(context.articleSlug)), null)

  progress.save(storage, context, {
    blockId: blocks[1]!.id,
    blockLabel: blocks[1]!.label,
    offset: 0.2,
    documentProgress: 0.4
  })
  progress.clearUnavailable(storage, context.articleSlug)
  assert.equal(storage.getItem(progressIndexKey(context.articleId)), null)
  assert.equal(storage.getItem(progressSlugKey(context.articleSlug)), null)

  const legacyRevisionOne = legacyProgressKey(context.articleSlug, 1)
  const legacyRevisionTwo = legacyProgressKey(context.articleSlug, 2)
  storage.setItem(legacyRevisionOne, JSON.stringify({ blockId: blocks[0]!.id, offset: 0.2 }))
  storage.setItem(legacyRevisionTwo, JSON.stringify({ blockId: blocks[1]!.id, offset: 0.3 }))
  progress.clearUnavailable(storage, context.articleSlug)
  assert.equal(storage.getItem(legacyRevisionOne), null)
  assert.equal(storage.getItem(legacyRevisionTwo), null)

  for (let index = 0; index < 4_096; index += 1) {
    storage.setItem(`unrelated:${index}`, "keep")
  }
  storage.setItem(legacyRevisionOne, JSON.stringify({ blockId: blocks[0]!.id, offset: 0.2 }))
  progress.clearUnavailable(storage, context.articleSlug)
  assert.equal(storage.getItem(legacyRevisionOne), null)
})

test("bounds retained article pointers and evicts only the oldest attributable keys", () => {
  const storage = new MemoryStorage()
  const progress = useLocalReadingProgress()
  storage.setItem("unrelated:preference", "keep")

  for (let index = 0; index <= MAX_LOCAL_PROGRESS_ARTICLES; index += 1) {
    const articleContext: LocalReadingContext = {
      articleId: `article-${index}`,
      revisionId: `revision-${index}`,
      revisionNumber: 1,
      articleSlug: `article-${index}`,
      articleTitle: `文章 ${index}`
    }
    assert.equal(
      progress.save(storage, articleContext, {
        blockId: blocks[1]!.id,
        blockLabel: blocks[1]!.label,
        offset: 0.2,
        documentProgress: 0.4
      }),
      true
    )
  }

  assert.equal(storage.getItem(progressIndexKey("article-0")), null)
  assert.equal(storage.getItem(progressSlugKey("article-0")), null)
  assert.notEqual(storage.getItem(progressIndexKey("article-1")), null)
  assert.notEqual(storage.getItem(progressIndexKey(`article-${MAX_LOCAL_PROGRESS_ARTICLES}`)), null)
  assert.equal(storage.getItem("unrelated:preference"), "keep")
})

test("a corrupt index never removes another article record or unrelated key", () => {
  const storage = new MemoryStorage()
  const otherContext = {
    ...context,
    articleId: "0190f7b0-7c4b-7e3a-8f12-123456789acc",
    revisionId: "0190f7b0-7c4b-7e3a-8f12-123456789acd",
    articleSlug: "other-article",
    articleTitle: "另一篇文章"
  }
  const writer = useLocalReadingProgress()
  writer.save(storage, otherContext, {
    blockId: blocks[1]!.id,
    blockLabel: blocks[1]!.label,
    offset: 0.2,
    documentProgress: 0.4
  })
  const otherRecordKey = progressRecordKey(
    otherContext.articleId,
    otherContext.revisionId,
    blocks[1]!.id
  )
  storage.setItem(progressIndexKey(context.articleId), otherRecordKey)
  storage.setItem(progressSlugKey(context.articleSlug), context.articleId)
  storage.setItem("unrelated:preference", "keep")

  const progress = useLocalReadingProgress()
  progress.load(storage, context, blocks)

  assert.equal(progress.resumePrompt.value, null)
  assert.equal(storage.getItem(progressIndexKey(context.articleId)), null)
  assert.equal(storage.getItem(progressSlugKey(context.articleSlug)), null)
  assert.notEqual(storage.getItem(otherRecordKey), null)
  assert.equal(storage.getItem(progressIndexKey(otherContext.articleId)), otherRecordKey)
  assert.equal(storage.getItem("unrelated:preference"), "keep")
})

test("a staged migration failure rolls back v1 keys and retains the legacy pointer", () => {
  const storage = new StagedFailureStorage()
  const legacyKey = legacyProgressKey(context.articleSlug, context.revisionNumber)
  storage.setItem(legacyKey, JSON.stringify({ blockId: blocks[1]!.id, offset: 0.3 }))
  storage.armFailure(4)

  const progress = useLocalReadingProgress()
  progress.load(storage, context, blocks)

  assert.equal(progress.resumePrompt.value, null)
  assert.equal(progress.storageDisabled.value, true)
  assert.notEqual(storage.getItem(legacyKey), null)
  assert.equal(storage.getItem(progressIndexKey(context.articleId)), null)
  assert.equal(storage.getItem(progressSlugKey(context.articleSlug)), null)
  assert.equal(
    storage.getItem(progressRecordKey(context.articleId, context.revisionId, blocks[1]!.id)),
    null
  )
})

test("failed corrupt-index save never removes a foreign record", () => {
  const storage = new StagedFailureStorage()
  const foreign = articleContext(99)
  useLocalReadingProgress().save(storage, foreign, readingLocation())
  const foreignRecordKey = storage.getItem(progressIndexKey(foreign.articleId))!
  storage.setItem(progressIndexKey(context.articleId), foreignRecordKey)
  storage.armFailure(1)

  assert.equal(useLocalReadingProgress().save(storage, context, readingLocation()), false)
  assert.notEqual(storage.getItem(foreignRecordKey), null)
  assert.equal(storage.getItem(progressIndexKey(foreign.articleId)), foreignRecordKey)
})

test("failed eviction restores the evicted pointer and manifest", () => {
  const storage = new StagedFailureStorage()
  const progress = useLocalReadingProgress()
  for (let index = 0; index < MAX_LOCAL_PROGRESS_ARTICLES; index += 1) {
    progress.save(storage, articleContext(index), readingLocation())
  }
  const oldestRecordKey = storage.getItem(progressIndexKey("article-0"))!
  const manifestBefore = storage.getItem("courtside.reader.progress:v1:manifest")
  storage.armRemoveFailure(2)

  assert.equal(
    progress.save(storage, articleContext(MAX_LOCAL_PROGRESS_ARTICLES), readingLocation()),
    false
  )
  assert.notEqual(storage.getItem(oldestRecordKey), null)
  assert.equal(storage.getItem(progressIndexKey("article-0")), oldestRecordKey)
  assert.equal(storage.getItem("courtside.reader.progress:v1:manifest"), manifestBefore)
})

test("recovers a missing manifest before enforcing the article cap", () => {
  const storage = new MemoryStorage()
  const progress = useLocalReadingProgress()
  for (let index = 0; index < MAX_LOCAL_PROGRESS_ARTICLES; index += 1) {
    progress.save(storage, articleContext(index), readingLocation())
  }
  storage.removeItem("courtside.reader.progress:v1:manifest")

  progress.save(storage, articleContext(MAX_LOCAL_PROGRESS_ARTICLES), readingLocation())

  assert.equal(storage.getItem(progressIndexKey("article-0")), null)
  assert.equal(countKeys(storage, "courtside.reader.progress:v1:index:"), 20)
  assert.equal(countKeys(storage, "courtside.reader.progress:v1:record:"), 20)
  assert.equal(countKeys(storage, "courtside.reader.progress:v1:slug:"), 20)
})

test("cleans old slug pointers and never follows a corrupt unavailable-slug index", () => {
  const storage = new MemoryStorage()
  const progress = useLocalReadingProgress()
  const oldContext = articleContext(1)
  progress.save(storage, oldContext, readingLocation())
  const renamed = {
    ...oldContext,
    revisionId: "renamed-revision",
    articleSlug: "renamed-article"
  }
  progress.load(storage, renamed, blocks)
  assert.equal(storage.getItem(progressSlugKey(oldContext.articleSlug)), null)

  const foreignContext = articleContext(2)
  progress.save(storage, foreignContext, readingLocation())
  const foreignRecordKey = storage.getItem(progressIndexKey(foreignContext.articleId))
  storage.setItem(progressSlugKey("withdrawn-article"), foreignContext.articleId)
  progress.clearUnavailable(storage, "withdrawn-article")
  assert.notEqual(storage.getItem(foreignRecordKey!), null)
  assert.equal(storage.getItem(progressIndexKey(foreignContext.articleId)), foreignRecordKey)
  assert.equal(storage.getItem(progressSlugKey("withdrawn-article")), null)
})

function articleContext(index: number): LocalReadingContext {
  return {
    articleId: `article-${index}`,
    revisionId: `revision-${index}`,
    revisionNumber: 1,
    articleSlug: `article-${index}`,
    articleTitle: `文章 ${index}`
  }
}

function readingLocation() {
  return {
    blockId: blocks[1]!.id,
    blockLabel: blocks[1]!.label,
    offset: 0.2,
    documentProgress: 0.4
  }
}

function countKeys(storage: MemoryStorage, prefix: string): number {
  return Array.from(storage.values.keys()).filter((key) => key.startsWith(prefix)).length
}

test("malformed and unavailable storage fail closed without breaking reading", () => {
  const malformed = new MemoryStorage()
  malformed.setItem(progressIndexKey(context.articleId), "broken-record-key")
  malformed.setItem("broken-record-key", "{not-json")
  malformed.setItem(progressSlugKey(context.articleSlug), context.articleId)

  const reader = useLocalReadingProgress()
  reader.load(malformed, context, blocks)
  assert.equal(reader.resumePrompt.value, null)
  assert.equal(malformed.getItem(progressIndexKey(context.articleId)), null)

  const unavailable: ProgressStorage = {
    getItem() {
      throw new DOMException("blocked", "SecurityError")
    },
    setItem() {
      throw new DOMException("quota", "QuotaExceededError")
    },
    removeItem() {
      throw new DOMException("blocked", "SecurityError")
    }
  }
  const degraded = useLocalReadingProgress()
  assert.doesNotThrow(() => degraded.load(unavailable, context, blocks))
  assert.equal(
    degraded.save(unavailable, context, {
      blockId: blocks[1]!.id,
      blockLabel: blocks[1]!.label,
      offset: 0.2,
      documentProgress: 0.4
    }),
    false
  )
  assert.equal(degraded.storageDisabled.value, true)
})
