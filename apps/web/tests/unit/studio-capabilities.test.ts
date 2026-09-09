import assert from "node:assert/strict"
import test from "node:test"
import {
  moveIssueArticle,
  normalizeIssueArticles
} from "../../app/features/studio/issues/issue-article-order.ts"

import {
  buildArticleDraftInput,
  buildIssueDraftInput,
  moveCredit,
  buildCreditAssignments,
  parsePrivatePreview
} from "../../app/features/studio/editor/article-draft-form.ts"

test("article creation validates identity and creates renderable content without publishing", () => {
  const draft = buildArticleDraftInput("  新文章  ", "opening-night", "  導讀  ")
  assert.equal(draft.title, "新文章")
  assert.equal(draft.dek, "導讀")
  assert.equal(draft.content.schemaVersion, 1)
  assert.equal(parsePrivatePreview(JSON.stringify(draft.content)).error, null)
  assert.throws(() => buildArticleDraftInput("", "opening-night", ""), /標題/)
  assert.throws(() => buildArticleDraftInput("Title", "../private", ""), /網址/)
})

test("issue creation requires an actual asset identity and preserves the entered description", () => {
  const id = "00000000-0000-4000-8000-000000000203"
  assert.deepEqual(buildIssueDraftInput(" 新期刊 ", "issue-one", " 摘要 ", id), {
    title: "新期刊",
    slug: "issue-one",
    description: "摘要",
    coverAssetId: id
  })
  assert.throws(
    () => buildIssueDraftInput("期刊", "issue-one", "摘要", "https://example.com/a"),
    /封面/
  )
})

test("ordered credit editing preserves identities and rejects duplicate person-role pairs", () => {
  const first = { contributorId: "one", role: "AUTHOR" as const }
  const second = { contributorId: "two", role: "PHOTOGRAPHER" as const }
  const original = [first, second]
  assert.deepEqual(moveCredit(original, 1, -1), [second, first])
  assert.deepEqual(original, [first, second])
  assert.deepEqual(moveCredit(original, 0, -1), original)
  assert.deepEqual(buildCreditAssignments([second, first]), { contributors: [second, first] })
  assert.throws(() => buildCreditAssignments([first, first]), /重複/)
  assert.deepEqual(buildCreditAssignments([]), { contributors: [] })
})

test("private preview rejects invalid content and never turns arbitrary HTML into renderer blocks", () => {
  const invalid = parsePrivatePreview(
    '{"schemaVersion":1,"blocks":[{"type":"html","payload":{"html":"<script>secret()</script>"}}]}'
  )
  assert.equal(invalid.document, null)
  assert.ok(invalid.error)
})

test("TOC ordering preserves exact revisions and independent section positions without mutating the saved list", () => {
  const items = [
    { articleId: "a", revisionId: "r1", sectionId: "first", position: 1 },
    { articleId: "b", revisionId: "r2", sectionId: "other", position: 1 },
    { articleId: "c", revisionId: "r3", sectionId: "first", position: 2 }
  ]
  const moved = moveIssueArticle(items, "c", -1)
  assert.deepEqual(
    moved.map((item) => [item.articleId, item.revisionId, item.position]),
    [
      ["c", "r3", 1],
      ["b", "r2", 1],
      ["a", "r1", 2]
    ]
  )
  assert.equal(items[0].articleId, "a")
  assert.deepEqual(
    normalizeIssueArticles(moved.filter((item) => item.articleId !== "c")).map(
      (item) => item.position
    ),
    [1, 1]
  )
  assert.equal(moveIssueArticle(items, "a", -1), items)
})
