import { ref } from "vue"

const STORAGE_PREFIX = "courtside.reader.progress:v1:"
const LEGACY_STORAGE_PREFIX = "courtside.reader.progress:"
const STORAGE_MANIFEST_KEY = STORAGE_PREFIX + "manifest"
const MINIMUM_RESUME_PROGRESS = 0.1
const MAXIMUM_RESUME_PROGRESS = 0.95
const MAX_STORAGE_KEYS_TO_SCAN = 4096

export const MAX_LOCAL_PROGRESS_ARTICLES = 20

export interface ProgressStorage {
  readonly length?: number
  getItem(key: string): string | null
  key?(index: number): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LocalReadingContext = {
  articleId: string
  revisionId: string
  revisionNumber: number
  articleSlug: string
  articleTitle: string
}

export type ReadingBlockAnchor = {
  id: string
  label: string
}

export type ReadingProgressLocation = {
  blockId: string
  blockLabel: string
  offset: number
  documentProgress: number
}

export type ViewportBlockGeometry = {
  blockId: string
  blockLabel: string
  top: number
  bottom: number
  height: number
}

export type DocumentBlockGeometry = {
  blockId: string
  top: number
  height: number
}

type StoredReadingProgress = ReadingProgressLocation & {
  schemaVersion: 1
  articleId: string
  revisionId: string
  articleSlug: string
}

type ResumePrompt = {
  articleTitle: string
  blockLabel: string
  documentProgress: number
}

type ProgressManifestEntry = {
  articleId: string
  articleSlug: string
}

export function progressRecordKey(articleId: string, revisionId: string, blockId: string): string {
  return (
    STORAGE_PREFIX +
    "record:" +
    encodeURIComponent(articleId) +
    ":" +
    encodeURIComponent(revisionId) +
    ":" +
    encodeURIComponent(blockId)
  )
}

export function progressIndexKey(articleId: string): string {
  return STORAGE_PREFIX + "index:" + encodeURIComponent(articleId)
}

export function progressSlugKey(articleSlug: string): string {
  return STORAGE_PREFIX + "slug:" + encodeURIComponent(articleSlug)
}

export function legacyProgressKey(articleSlug: string, revisionNumber: number): string {
  return LEGACY_STORAGE_PREFIX + articleSlug + ":revision-" + String(revisionNumber)
}

export function selectViewportProgress(
  blocks: ViewportBlockGeometry[],
  viewportHeight: number,
  documentProgress: number
): ReadingProgressLocation | null {
  if (
    blocks.length === 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !isUnitInterval(documentProgress)
  ) {
    return null
  }

  let current = blocks.find(
    (block) => validGeometry(block) && block.bottom > 0 && block.top < viewportHeight * 0.6
  )
  if (!current) {
    const lastBlock = blocks.at(-1)
    if (
      lastBlock &&
      validGeometry(lastBlock) &&
      lastBlock.bottom <= viewportHeight * 0.25 &&
      documentProgress < MAXIMUM_RESUME_PROGRESS
    ) {
      current = lastBlock
    }
  }
  if (!current) {
    return null
  }

  return {
    blockId: current.blockId,
    blockLabel: current.blockLabel,
    offset: clamp((viewportHeight * 0.25 - current.top) / current.height),
    documentProgress
  }
}

export function useLocalReadingProgress() {
  const resumePrompt = ref<ResumePrompt | null>(null)
  const pendingProgress = ref<StoredReadingProgress | null>(null)
  const resumeRequested = ref(false)
  const storageDisabled = ref(false)

  function load(
    storage: ProgressStorage,
    context: LocalReadingContext,
    blocks: ReadingBlockAnchor[]
  ): void {
    resetPrompt()
    if (storageDisabled.value || !validContext(context) || blocks.length === 0) {
      return
    }

    const indexKey = progressIndexKey(context.articleId)
    let recordKey = read(storage, indexKey)
    if (!recordKey) {
      const migrated = migrateLegacy(storage, context, blocks)
      if (!migrated) {
        return
      }
      recordKey = progressRecordKey(migrated.articleId, migrated.revisionId, migrated.blockId)
    }

    if (!isRecordKeyForArticle(recordKey, context.articleId)) {
      clearArticle(storage, context.articleId, context.articleSlug)
      return
    }

    const serialized = read(storage, recordKey)
    if (!serialized) {
      clearArticle(storage, context.articleId, context.articleSlug)
      return
    }

    const stored = parseStoredProgress(serialized)
    if (!stored || stored.articleId !== context.articleId) {
      clearArticle(storage, context.articleId, context.articleSlug)
      return
    }

    const currentBlock = blocks.find((block) => block.id === stored.blockId)
    if (!currentBlock) {
      clearArticle(storage, context.articleId, context.articleSlug)
      return
    }

    if (stored.revisionId !== context.revisionId) {
      clearArticle(storage, context.articleId, context.articleSlug)
      return
    }

    if (!isResumeRange(stored.documentProgress)) {
      clearArticle(storage, context.articleId, context.articleSlug)
      return
    }

    pendingProgress.value = {
      ...stored,
      blockLabel: currentBlock.label
    }
    resumePrompt.value = {
      articleTitle: context.articleTitle,
      blockLabel: currentBlock.label,
      documentProgress: stored.documentProgress
    }
  }

  function save(
    storage: ProgressStorage,
    context: LocalReadingContext,
    location: ReadingProgressLocation
  ): boolean {
    if (storageDisabled.value || !validContext(context) || !validLocation(location)) {
      return false
    }
    if (location.documentProgress < MINIMUM_RESUME_PROGRESS) {
      return false
    }
    if (location.documentProgress > MAXIMUM_RESUME_PROGRESS) {
      clearArticle(storage, context.articleId, context.articleSlug)
      resetPrompt()
      return false
    }

    return persist(storage, context, {
      schemaVersion: 1,
      articleId: context.articleId,
      revisionId: context.revisionId,
      articleSlug: context.articleSlug,
      ...location
    })
  }

  function continueReading(blocks: DocumentBlockGeometry[], viewportHeight: number): number | null {
    const progress = pendingProgress.value
    if (!progress || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      return null
    }
    const target = blocks.find(
      (block) => block.blockId === progress.blockId && validDocumentGeometry(block)
    )
    if (!target) {
      resetPrompt()
      return null
    }

    const top = Math.max(
      0,
      target.top + target.height * progress.offset - Math.min(viewportHeight * 0.25, 160)
    )
    resumeRequested.value = true
    resumePrompt.value = null
    pendingProgress.value = null
    return top
  }

  function startOver(storage: ProgressStorage, context: LocalReadingContext): void {
    clearArticle(storage, context.articleId, context.articleSlug)
    resetPrompt()
  }

  function clearCompleted(storage: ProgressStorage, context: LocalReadingContext): void {
    clearArticle(storage, context.articleId, context.articleSlug)
    resetPrompt()
  }

  function clearUnavailable(storage: ProgressStorage, articleSlug: string): void {
    if (storageDisabled.value || !validSlug(articleSlug)) {
      return
    }
    clearLegacyProgress(storage, articleSlug)
    const slugKey = progressSlugKey(articleSlug)
    const articleId = read(storage, slugKey)
    if (articleId) {
      clearArticle(storage, articleId, articleSlug)
    } else {
      remove(storage, slugKey)
    }
    resetPrompt()
  }

  function migrateLegacy(
    storage: ProgressStorage,
    context: LocalReadingContext,
    blocks: ReadingBlockAnchor[]
  ): StoredReadingProgress | null {
    const key = legacyProgressKey(context.articleSlug, context.revisionNumber)
    const serialized = read(storage, key)
    if (!serialized) {
      clearLegacyProgress(storage, context.articleSlug)
      return null
    }
    try {
      const value = JSON.parse(serialized) as unknown
      if (!isRecord(value) || typeof value.blockId !== "string" || !isUnitInterval(value.offset)) {
        clearLegacyProgress(storage, context.articleSlug)
        return null
      }
      const blockIndex = blocks.findIndex((block) => block.id === value.blockId)
      if (blockIndex < 0) {
        clearLegacyProgress(storage, context.articleSlug)
        return null
      }
      const block = blocks[blockIndex]!
      const documentProgress = clamp((blockIndex + value.offset) / blocks.length)
      const migrated: StoredReadingProgress = {
        schemaVersion: 1,
        articleId: context.articleId,
        revisionId: context.revisionId,
        articleSlug: context.articleSlug,
        blockId: block.id,
        blockLabel: block.label,
        offset: value.offset,
        documentProgress
      }
      if (!isResumeRange(documentProgress)) {
        clearLegacyProgress(storage, context.articleSlug)
        return null
      }
      if (!persist(storage, context, migrated)) {
        return null
      }
      clearLegacyProgress(storage, context.articleSlug)
      return migrated
    } catch {
      clearLegacyProgress(storage, context.articleSlug)
      return null
    }
  }

  function persist(
    storage: ProgressStorage,
    context: LocalReadingContext,
    progress: StoredReadingProgress
  ): boolean {
    const indexKey = progressIndexKey(context.articleId)
    const previousRecordKey = read(storage, indexKey)
    const previousRecord =
      previousRecordKey && isRecordKeyForArticle(previousRecordKey, context.articleId)
        ? read(storage, previousRecordKey)
        : null
    const slugKey = progressSlugKey(context.articleSlug)
    const previousSlugArticleId = read(storage, slugKey)
    const previousManifest = read(storage, STORAGE_MANIFEST_KEY)
    if (storageDisabled.value) {
      return false
    }
    const recordKey = progressRecordKey(context.articleId, context.revisionId, progress.blockId)
    try {
      storage.setItem(recordKey, JSON.stringify(progress))
      storage.setItem(indexKey, recordKey)
      storage.setItem(slugKey, context.articleId)
      if (
        previousRecordKey &&
        previousRecordKey !== recordKey &&
        isRecordKeyForArticle(previousRecordKey, context.articleId)
      ) {
        storage.removeItem(previousRecordKey)
      }
      updateManifest(storage, context)
      if (storageDisabled.value) {
        throw new Error("Progress storage became unavailable")
      }
      return true
    } catch {
      storageDisabled.value = true
      try {
        if (recordKey !== previousRecordKey || previousRecord === null) {
          storage.removeItem(recordKey)
        }
        restoreStorageValue(storage, previousRecordKey, previousRecord)
        restoreStorageValue(storage, indexKey, previousRecordKey)
        restoreStorageValue(storage, slugKey, previousSlugArticleId)
        restoreStorageValue(storage, STORAGE_MANIFEST_KEY, previousManifest)
      } catch {
        // Storage is unavailable; reading remains functional without persistence.
      }
      return false
    }
  }

  function clearArticle(storage: ProgressStorage, articleId: string, articleSlug: string): void {
    if (storageDisabled.value) {
      return
    }
    const indexKey = progressIndexKey(articleId)
    const recordKey = read(storage, indexKey)
    if (storageDisabled.value) {
      return
    }
    if (recordKey && isRecordKeyForArticle(recordKey, articleId)) {
      remove(storage, recordKey)
    }
    remove(storage, indexKey)
    remove(storage, progressSlugKey(articleSlug))
    removeFromManifest(storage, articleId)
  }

  function updateManifest(storage: ProgressStorage, context: LocalReadingContext): void {
    const entries = readManifest(storage).filter((entry) => entry.articleId !== context.articleId)
    entries.push({ articleId: context.articleId, articleSlug: context.articleSlug })
    const evicted = entries.splice(0, Math.max(0, entries.length - MAX_LOCAL_PROGRESS_ARTICLES))
    storage.setItem(STORAGE_MANIFEST_KEY, JSON.stringify(entries))
    for (const entry of evicted) {
      clearArticleKeys(storage, entry.articleId, entry.articleSlug)
    }
  }

  function removeFromManifest(storage: ProgressStorage, articleId: string): void {
    const current = readManifest(storage)
    const remaining = current.filter((entry) => entry.articleId !== articleId)
    if (remaining.length === current.length) {
      return
    }
    if (remaining.length === 0) {
      remove(storage, STORAGE_MANIFEST_KEY)
      return
    }
    try {
      storage.setItem(STORAGE_MANIFEST_KEY, JSON.stringify(remaining))
    } catch {
      storageDisabled.value = true
    }
  }

  function readManifest(storage: ProgressStorage): ProgressManifestEntry[] {
    const serialized = read(storage, STORAGE_MANIFEST_KEY)
    if (!serialized) {
      return []
    }
    try {
      const parsed = JSON.parse(serialized) as unknown
      if (!Array.isArray(parsed)) {
        remove(storage, STORAGE_MANIFEST_KEY)
        return []
      }
      return parsed.filter(isProgressManifestEntry).slice(-MAX_LOCAL_PROGRESS_ARTICLES)
    } catch {
      remove(storage, STORAGE_MANIFEST_KEY)
      return []
    }
  }

  function clearArticleKeys(
    storage: ProgressStorage,
    articleId: string,
    articleSlug: string
  ): void {
    const indexKey = progressIndexKey(articleId)
    const recordKey = read(storage, indexKey)
    if (recordKey && isRecordKeyForArticle(recordKey, articleId)) {
      remove(storage, recordKey)
    }
    remove(storage, indexKey)
    remove(storage, progressSlugKey(articleSlug))
  }

  function clearLegacyProgress(storage: ProgressStorage, articleSlug: string): void {
    if (
      storageDisabled.value ||
      typeof storage.length !== "number" ||
      typeof storage.key !== "function"
    ) {
      return
    }
    const prefix = LEGACY_STORAGE_PREFIX + articleSlug + ":revision-"
    const matchingKeys: string[] = []
    const length = Math.min(storage.length, MAX_STORAGE_KEYS_TO_SCAN)
    try {
      for (let index = 0; index < length; index += 1) {
        const candidate = storage.key(index)
        if (candidate?.startsWith(prefix)) {
          matchingKeys.push(candidate)
        }
      }
    } catch {
      storageDisabled.value = true
      return
    }
    for (const key of matchingKeys) {
      remove(storage, key)
    }
  }

  function read(storage: ProgressStorage, key: string): string | null {
    if (storageDisabled.value) {
      return null
    }
    try {
      return storage.getItem(key)
    } catch {
      storageDisabled.value = true
      return null
    }
  }

  function remove(storage: ProgressStorage, key: string): void {
    if (storageDisabled.value) {
      return
    }
    try {
      storage.removeItem(key)
    } catch {
      storageDisabled.value = true
    }
  }

  function resetPrompt(): void {
    resumePrompt.value = null
    pendingProgress.value = null
    resumeRequested.value = false
  }

  return {
    resumePrompt,
    pendingProgress,
    resumeRequested,
    storageDisabled,
    load,
    save,
    continueReading,
    startOver,
    clearCompleted,
    clearUnavailable
  }
}

function parseStoredProgress(value: string): StoredReadingProgress | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 1 ||
      !validIdentifier(parsed.articleId) ||
      !validIdentifier(parsed.revisionId) ||
      !validSlug(parsed.articleSlug) ||
      !validIdentifier(parsed.blockId) ||
      !validLabel(parsed.blockLabel) ||
      !isUnitInterval(parsed.offset) ||
      !isUnitInterval(parsed.documentProgress)
    ) {
      return null
    }
    return parsed as StoredReadingProgress
  } catch {
    return null
  }
}

function isProgressManifestEntry(value: unknown): value is ProgressManifestEntry {
  return isRecord(value) && validIdentifier(value.articleId) && validSlug(value.articleSlug)
}

function isRecordKeyForArticle(value: string, articleId: string): boolean {
  return value.startsWith(STORAGE_PREFIX + "record:" + encodeURIComponent(articleId) + ":")
}

function restoreStorageValue(
  storage: ProgressStorage,
  key: string | null,
  value: string | null
): void {
  if (!key) {
    return
  }
  if (value === null) {
    storage.removeItem(key)
  } else {
    storage.setItem(key, value)
  }
}

function validContext(context: LocalReadingContext): boolean {
  return (
    validIdentifier(context.articleId) &&
    validIdentifier(context.revisionId) &&
    Number.isInteger(context.revisionNumber) &&
    context.revisionNumber > 0 &&
    validSlug(context.articleSlug) &&
    validLabel(context.articleTitle)
  )
}

function validLocation(location: ReadingProgressLocation): boolean {
  return (
    validIdentifier(location.blockId) &&
    validLabel(location.blockLabel) &&
    isUnitInterval(location.offset) &&
    isUnitInterval(location.documentProgress)
  )
}

function validGeometry(block: ViewportBlockGeometry): boolean {
  return (
    validIdentifier(block.blockId) &&
    validLabel(block.blockLabel) &&
    Number.isFinite(block.top) &&
    Number.isFinite(block.bottom) &&
    Number.isFinite(block.height) &&
    block.height > 0
  )
}

function validDocumentGeometry(block: DocumentBlockGeometry): boolean {
  return (
    validIdentifier(block.blockId) &&
    Number.isFinite(block.top) &&
    Number.isFinite(block.height) &&
    block.height > 0
  )
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    !Array.from(value).some(containsControlCharacter)
  )
}

function validSlug(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)
  )
}

function validLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 500 &&
    !Array.from(value).some(containsControlCharacter)
  )
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
}

function isResumeRange(value: number): boolean {
  return value >= MINIMUM_RESUME_PROGRESS && value <= MAXIMUM_RESUME_PROGRESS
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function containsControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 31 || codePoint === 127
}
