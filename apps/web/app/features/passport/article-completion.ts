type Completion = { articleId: string; revisionId: string; blockId: string; percent: number }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** Called only by the explicit reader acknowledgement button; scroll alone is insufficient. */
export async function acknowledgeArticleCompletion(
  context: { authenticated: boolean; articleId: string; revisionId: string; blockIds: string[] },
  save: (articleId: string, input: Omit<Completion, "articleId">) => Promise<Completion>
): Promise<Completion> {
  const blockId = context.blockIds.at(-1)
  if (
    !context.authenticated ||
    !UUID.test(context.articleId) ||
    !UUID.test(context.revisionId) ||
    !blockId ||
    !UUID.test(blockId)
  )
    throw new Error("COMPLETION_UNAVAILABLE")
  const saved = await save(context.articleId, {
    revisionId: context.revisionId,
    blockId,
    percent: 100
  })
  if (
    saved.articleId !== context.articleId ||
    saved.revisionId !== context.revisionId ||
    saved.blockId !== blockId ||
    saved.percent !== 100
  )
    throw new Error("COMPLETION_UNCONFIRMED")
  return saved
}
