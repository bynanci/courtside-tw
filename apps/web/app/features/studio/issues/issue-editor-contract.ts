import type { components } from "@courtside/api-client"

export type IssueEditorState = components["schemas"]["IssueDraft"]["state"]

export interface IssuePatchBody {
  issueId: string
  changes: {
    title: string
    description: string
  }
}

export function buildIssuePatch(
  issueId: string,
  title: string,
  description: string
): IssuePatchBody {
  return {
    issueId,
    changes: {
      title: title.trim(),
      description: description.trim()
    }
  }
}

export function isIssueEditable(state: IssueEditorState): boolean {
  return state === "DRAFT"
}
