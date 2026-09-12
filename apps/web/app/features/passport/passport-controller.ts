import {
  PassportError,
  type IssueChoice,
  type PassportApi,
  type PassportErrorCode,
  type ReaderStamp
} from "./passport-api.ts"

export type PassportState = {
  busy: boolean
  items: ReaderStamp[]
  issues: IssueChoice[]
  nextCursor: string | null
  selected: string
  consent: boolean
  error: PassportErrorCode | null
  stampsError: boolean
  issuesError: boolean
  result: ReaderStamp | null
}
export function createPassportController(options: { api: PassportApi; key?: () => string }) {
  let state: PassportState = {
    busy: false,
    items: [],
    issues: [],
    nextCursor: null,
    selected: "",
    consent: false,
    error: null,
    stampsError: false,
    issuesError: false,
    result: null
  }
  let disposed = false
  const listeners = new Set<(value: PassportState) => void>()
  const keys = new Map<string, string>()
  function update(change: Partial<PassportState>) {
    if (disposed) return
    state = { ...state, ...change }
    for (const listener of listeners) listener(state)
  }
  function failure(error: unknown) {
    const code = error instanceof PassportError ? error.code : "UNAVAILABLE"
    update({
      error: code,
      ...(code === "AUTH_REQUIRED" ? { items: [], consent: false, result: null } : {})
    })
  }
  return {
    getState: () => state,
    subscribe(listener: (value: PassportState) => void) {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    },
    async load() {
      if (disposed || state.busy) return
      update({ busy: true, error: null, stampsError: false, issuesError: false, result: null })
      const [stamps, catalog] = await Promise.allSettled([options.api.list(), options.api.issues()])
      if (disposed) return
      if (catalog.status === "fulfilled") {
        const selected = catalog.value.items.some((item) => item.issueId === state.selected)
          ? state.selected
          : ""
        update({
          issues: catalog.value.items,
          nextCursor: catalog.value.nextCursor,
          selected,
          consent: false
        })
      } else update({ issuesError: true })
      if (stamps.status === "fulfilled") update({ items: stamps.value })
      else {
        update({ items: [], stampsError: true })
        failure(stamps.reason)
      }
      update({ busy: false })
    },
    async moreIssues() {
      if (disposed || state.busy || !state.nextCursor) return
      update({ busy: true, issuesError: false })
      try {
        const page = await options.api.issues(state.nextCursor)
        const seen = new Set(state.issues.map((item) => item.issueId))
        update({
          issues: [...state.issues, ...page.items.filter((item) => !seen.has(item.issueId))],
          nextCursor: page.nextCursor
        })
      } catch {
        update({ issuesError: true })
      } finally {
        update({ busy: false })
      }
    },
    select(id: string) {
      if (state.busy || disposed || !state.issues.some((item) => item.issueId === id)) return
      update({ selected: id, consent: false, result: null, error: null })
    },
    consent(value: boolean) {
      if (!state.busy && !disposed) update({ consent: value })
    },
    async claim() {
      const issue = state.issues.find((item) => item.issueId === state.selected)
      if (disposed || state.busy || !state.consent || !issue || state.error === "AUTH_REQUIRED")
        return
      const tuple = issue.issueId + ":" + issue.season
      const key = keys.get(tuple) ?? (options.key ?? (() => crypto.randomUUID()))()
      keys.set(tuple, key)
      update({ busy: true, error: null, result: null })
      try {
        const result = await options.api.claim(
          { issueId: issue.issueId, season: issue.season },
          key
        )
        update({
          items: [result, ...state.items.filter((item) => item.id !== result.id)],
          result,
          consent: false
        })
      } catch (error) {
        failure(error)
      } finally {
        update({ busy: false })
      }
    },
    dispose() {
      disposed = true
      keys.clear()
      listeners.clear()
      state = { ...state, items: [], issues: [], consent: false, result: null }
    }
  }
}
export function stampStatusLabel(stamp: ReaderStamp, now = Date.now()): string {
  if (["CLAIMED", "CLAIMABLE"].includes(stamp.status) && Date.parse(stamp.expiresAt) <= now)
    return "已到期"
  return {
    CLAIMABLE: "可領取",
    CLAIMED: "已領取",
    REVOKED: "已撤銷",
    SUPERSEDED: "已由新版取代",
    EXPIRED: "已到期"
  }[stamp.status]
}
