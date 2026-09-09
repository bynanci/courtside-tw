import assert from "node:assert/strict"
import test from "node:test"
import {
  canArchiveLibraryMedia,
  mediaArchiveFeedback,
  mediaPreviewFallback
} from "../../../../app/features/studio/media/media-library-contract.ts"

test("archive eligibility is independent of processing state and stops duplicate commands", () => {
  for (const state of ["PENDING", "PROCESSING", "READY", "FAILED", "REVOKED"]) {
    assert.equal(canArchiveLibraryMedia({ archivedAt: null, processingState: state }, false), true)
  }
  assert.equal(canArchiveLibraryMedia(null, false), false)
  assert.equal(canArchiveLibraryMedia({ archivedAt: "2026-09-09T00:00:00Z" }, false), false)
  assert.equal(canArchiveLibraryMedia({ archivedAt: null }, true), false)
})

test("archive conflict requires refreshed selection and generic failure never claims success", () => {
  assert.match(mediaArchiveFeedback(409), /重新選取/)
  assert.match(mediaArchiveFeedback(503), /未完成/)
  assert.doesNotMatch(mediaArchiveFeedback(503), /已封存/)
})

test("private preview failure keeps available alt text without promising unavailable bytes", () => {
  assert.equal(mediaPreviewFallback("球場照片", "READY"), "球場照片；私人預覽目前無法顯示。")
  assert.match(mediaPreviewFallback(null, "REVOKED"), /REVOKED/)
})
