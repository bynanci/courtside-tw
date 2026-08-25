import {
  createConsentAwareAnalytics,
  type AnalyticsSink,
  type AnalyticsTrackResult,
  type ConsentStore
} from "./analytics.ts"

export type QueryLengthBucket = "empty" | "1_2" | "3_5" | "6_plus"
export type ResultCountBucket = "zero" | "1_5" | "6_20" | "21_plus"
export type ShareContentKind = "article" | "issue" | "none"
export type ShareTarget = "copy_link" | "native_share"

export function queryLengthBucket(length: number): QueryLengthBucket {
  const boundedLength = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0
  if (boundedLength === 0) return "empty"
  if (boundedLength <= 2) return "1_2"
  if (boundedLength <= 5) return "3_5"
  return "6_plus"
}

export function resultCountBucket(
  visibleResultCount: number,
  hasNextPage: boolean
): ResultCountBucket {
  if (hasNextPage) return "21_plus"

  const boundedCount = Number.isFinite(visibleResultCount)
    ? Math.max(0, Math.floor(visibleResultCount))
    : 0
  if (boundedCount === 0) return "zero"
  if (boundedCount <= 5) return "1_5"
  if (boundedCount <= 20) return "6_20"
  return "21_plus"
}

export function createProductAnalyticsRuntime(
  options: {
    storage?: ConsentStore
    sink?: AnalyticsSink
  } = {}
) {
  const client = createConsentAwareAnalytics(options)

  return {
    trackIssueView: (): Promise<AnalyticsTrackResult> =>
      client.track({
        type: "public_issue_view",
        properties: { content_kind: "issue", surface: "issue" }
      }),
    trackArticleView: (): Promise<AnalyticsTrackResult> =>
      client.track({
        type: "public_article_view",
        properties: { content_kind: "article", surface: "article" }
      }),
    trackSearchSubmitted: (
      queryLength: number,
      visibleResultCount: number,
      hasNextPage: boolean
    ): Promise<AnalyticsTrackResult> =>
      client.track({
        type: "public_search_submitted",
        properties: {
          query_length_bucket: queryLengthBucket(queryLength),
          result_count_bucket: resultCountBucket(visibleResultCount, hasNextPage),
          surface: "search"
        }
      }),
    trackShareStarted: (
      contentKind: ShareContentKind,
      shareTarget: ShareTarget
    ): Promise<AnalyticsTrackResult> =>
      client.track({
        type: "public_share_started",
        properties: {
          content_kind: contentKind,
          share_target: shareTarget,
          surface: "share"
        }
      })
  }
}

export type ProductAnalyticsRuntime = ReturnType<typeof createProductAnalyticsRuntime>
