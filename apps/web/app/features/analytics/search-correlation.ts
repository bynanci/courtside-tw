export type SearchAnalyticsResolution = {
  resultCount: number
  hasNextPage: boolean
}

export type SearchAnalyticsDispatch = SearchAnalyticsResolution & {
  queryLength: number
}

type RequestToken = {
  generation: number
  routeEpoch: number
  key: string
}

export function createSearchAnalyticsCorrelation(
  initialRouteKey: string,
  dispatch: (event: SearchAnalyticsDispatch) => void
) {
  let currentRouteKey = initialRouteKey
  let routeEpoch = 0
  let requestGeneration = 0
  let submissionSequence = 0
  let pendingSubmission: {
    id: number
    key: string
    queryLength: number
    confirmed: boolean
  } | null = null
  let resolvedSearch: (SearchAnalyticsResolution & { key: string }) | null = null

  const consume = (): void => {
    const submission = pendingSubmission
    const resolved = resolvedSearch
    if (
      !submission?.confirmed ||
      !resolved ||
      submission.key !== currentRouteKey ||
      submission.key !== resolved.key
    ) {
      return
    }

    pendingSubmission = null
    dispatch({
      queryLength: submission.queryLength,
      resultCount: resolved.resultCount,
      hasNextPage: resolved.hasNextPage
    })
  }

  return {
    beginRequest(key: string): RequestToken {
      requestGeneration += 1
      resolvedSearch = null
      return { generation: requestGeneration, routeEpoch, key }
    },
    resolveRequest(token: RequestToken, resolution: SearchAnalyticsResolution): boolean {
      if (
        token.generation !== requestGeneration ||
        token.routeEpoch !== routeEpoch ||
        token.key !== currentRouteKey
      ) {
        return false
      }
      resolvedSearch = { key: token.key, ...resolution }
      consume()
      return true
    },
    rejectRequest(token: RequestToken): boolean {
      if (
        token.generation !== requestGeneration ||
        token.routeEpoch !== routeEpoch ||
        token.key !== currentRouteKey
      ) {
        return false
      }
      resolvedSearch = null
      if (pendingSubmission?.key === token.key) pendingSubmission = null
      return true
    },
    seedResolved(key: string, resolution: SearchAnalyticsResolution): boolean {
      if (key !== currentRouteKey) return false
      resolvedSearch = { key, ...resolution }
      consume()
      return true
    },
    beginSubmission(key: string, queryLength: number): number {
      const id = ++submissionSequence
      pendingSubmission = { id, key, queryLength, confirmed: false }
      return id
    },
    confirmSubmission(id: number, routeKey: string): boolean {
      if (!pendingSubmission || pendingSubmission.id !== id) return false
      if (pendingSubmission.key !== routeKey || routeKey !== currentRouteKey) {
        pendingSubmission = null
        return false
      }
      pendingSubmission.confirmed = true
      consume()
      return true
    },
    cancelSubmission(id: number): void {
      if (pendingSubmission?.id === id) pendingSubmission = null
    },
    routeChanged(routeKey: string): void {
      if (routeKey === currentRouteKey) return
      currentRouteKey = routeKey
      routeEpoch += 1
      resolvedSearch = null
      if (pendingSubmission?.key !== routeKey) pendingSubmission = null
    },
    reset(): void {
      routeEpoch += 1
      requestGeneration += 1
      pendingSubmission = null
      resolvedSearch = null
    }
  }
}
