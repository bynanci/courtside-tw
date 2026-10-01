import assert from "node:assert/strict"
import test from "node:test"
import { acknowledgeArticleCompletion } from "../../../app/features/passport/article-completion.ts"

const articleId = "0190f7b0-7c4b-7e3a-8f12-123456789abc"
const revisionId = "0190f7b0-7c4b-7e3a-8f12-123456789abd"
const first = "0190f7b0-7c4b-7e3a-8f12-123456789abe"
const last = "0190f7b0-7c4b-7e3a-8f12-123456789abf"
const context = { authenticated: true, articleId, revisionId, blockIds: [first, last] }

test("explicit acknowledgement sends100 for actual published revision and final block", async () => {
  const calls: unknown[] = []
  const result = await acknowledgeArticleCompletion(context, async (article, value) => {
    calls.push({ article, ...value })
    return { articleId: article, ...value }
  })
  assert.deepEqual(calls, [{ article: articleId, revisionId, blockId: last, percent: 100 }])
  assert.equal(result.percent, 100)
})

test("anonymous readers, missing publication and invalid anchors cannot write acknowledgements", async () => {
  let writes = 0
  for (const input of [
    { ...context, authenticated: false },
    { ...context, revisionId: "" },
    { ...context, blockIds: [] }
  ]) {
    await assert.rejects(
      acknowledgeArticleCompletion(input, async () => {
        writes++
        throw new Error("unexpected write")
      })
    )
  }
  assert.equal(writes, 0)
})

test("denied writes and stale server revision never appear as acknowledged", async () => {
  await assert.rejects(
    acknowledgeArticleCompletion(context, async () => {
      throw new Error("401")
    }),
    /401/u
  )
  await assert.rejects(
    acknowledgeArticleCompletion(context, async () => ({
      articleId,
      revisionId: first,
      blockId: last,
      percent: 100
    })),
    /COMPLETION_UNCONFIRMED/u
  )
  await assert.rejects(
    acknowledgeArticleCompletion(context, async () => ({
      articleId,
      revisionId,
      blockId: last,
      percent: 95
    })),
    /COMPLETION_UNCONFIRMED/u
  )
})
