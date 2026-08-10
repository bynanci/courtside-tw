import { canStudioAction } from "../studio-rbac.ts"
import type { StudioArticleState, StudioRole } from "../studio-contract.ts"

export type ReviewAction =
  "approve" | "request-changes" | "publish" | "schedule" | "withdraw" | "archive"

export function canReviewAction(
  role: StudioRole,
  action: ReviewAction,
  state: StudioArticleState,
  rightsReady: boolean,
  scheduledAt?: string,
  nowMs = Date.now()
): boolean {
  const publisherAction =
    action === "request-changes" ? "approve" : action === "archive" ? "withdraw" : action
  if (!canStudioAction(role, publisherAction)) return false

  switch (action) {
    case "approve":
      return state === "IN_REVIEW" && rightsReady
    case "request-changes":
      return state === "IN_REVIEW"
    case "publish":
      return (
        rightsReady &&
        (state === "APPROVED" ||
          (state === "SCHEDULED" && (scheduledAt ? Date.parse(scheduledAt) <= nowMs : true)))
      )
    case "schedule":
      return state === "APPROVED" && rightsReady
    case "withdraw":
      return ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(state)
    case "archive":
      return state === "WITHDRAWN"
  }
}
