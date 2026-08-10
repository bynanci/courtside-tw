import type { StudioRole } from "./studio-contract"

export type StudioAction =
  "edit" | "upload" | "submit" | "approve" | "publish" | "schedule" | "withdraw" | "view-audit"

const editorActions: ReadonlySet<StudioAction> = new Set(["edit", "upload", "submit", "view-audit"])

const publisherActions: ReadonlySet<StudioAction> = new Set([
  "approve",
  "publish",
  "schedule",
  "withdraw",
  "view-audit"
])

export function canStudioAction(role: StudioRole, action: StudioAction): boolean {
  return (role === "EDITOR" ? editorActions : publisherActions).has(action)
}

export function missingRoleMessage(action: StudioAction): string {
  const actionLabel: Record<StudioAction, string> = {
    edit: "編輯文章",
    upload: "上傳媒體",
    submit: "送審",
    approve: "核准",
    publish: "發布",
    schedule: "排程",
    withdraw: "撤回",
    "view-audit": "查看稽核"
  }
  return `${actionLabel[action]} 需要正確的 Studio 角色。`
}
