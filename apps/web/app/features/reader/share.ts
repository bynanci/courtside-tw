export type ArticleSharePayload = { title: string; url: string }
export type ArticleShareAdapters = {
  share?: (payload: ArticleSharePayload) => Promise<void>
  writeText?: (url: string) => Promise<void>
}
export type ArticleShareResult = {
  outcome: "shared" | "copied" | "cancelled" | "link"
  message: string
}

export async function performArticleShare(
  payload: ArticleSharePayload,
  adapters: ArticleShareAdapters
): Promise<ArticleShareResult> {
  if (adapters.share) {
    try {
      await adapters.share(payload)
      return { outcome: "shared", message: "文章已分享。" }
    } catch (error) {
      if (isShareCancellation(error)) {
        return { outcome: "cancelled", message: "已取消分享。" }
      }
      // A rejected or failed native share can still use the accessible copy fallback.
    }
  }
  if (adapters.writeText) {
    try {
      await adapters.writeText(payload.url)
      return { outcome: "copied", message: "文章連結已複製。" }
    } catch {
      // The canonical anchor remains available without browser APIs.
    }
  }
  return { outcome: "link", message: "分享未完成，請使用文章連結。" }
}

function isShareCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}
