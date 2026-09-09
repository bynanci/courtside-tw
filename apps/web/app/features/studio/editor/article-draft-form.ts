import { parseContentDocument } from "./content-editor.ts"
import type { ContentDocument } from "@courtside/content-schema/browser"

export type CreditRole =
  "AUTHOR" | "EDITOR" | "PHOTOGRAPHER" | "ILLUSTRATOR" | "TRANSLATOR" | "DESIGNER"
export interface CreditAssignment {
  contributorId: string
  role: CreditRole
}

function identity(title: string, slug: string) {
  if (!title.trim() || title.trim().length > 200) throw new Error("請輸入 1–200 字的標題。")
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug.trim()))
    throw new Error("網址代稱僅能使用小寫英文、數字與連字號。")
  return { title: title.trim(), slug: slug.trim() }
}

export function buildArticleDraftInput(
  title: string,
  slug: string,
  dek: string
): { title: string; slug: string; dek: string; content: ContentDocument } {
  if (dek.trim().length > 1000) throw new Error("導讀不得超過 1000 字。")
  return {
    ...identity(title, slug),
    dek: dek.trim(),
    content: {
      schemaVersion: 1 as const,
      documentId: crypto.randomUUID(),
      blocks: [
        {
          id: crypto.randomUUID(),
          type: "paragraph" as const,
          version: 1 as const,
          payload: { content: [{ kind: "text" as const, text: "開始撰寫文章。" }] }
        }
      ]
    }
  }
}

export function buildIssueDraftInput(
  title: string,
  slug: string,
  description: string,
  coverAssetId: string
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(coverAssetId.trim()))
    throw new Error("請輸入媒體庫提供的封面資產 ID。")
  if (description.trim().length > 1000) throw new Error("摘要不得超過 1000 字。")
  return {
    ...identity(title, slug),
    description: description.trim(),
    coverAssetId: coverAssetId.trim()
  }
}

export function moveCredit<T>(credits: readonly T[], index: number, delta: -1 | 1): T[] {
  const result = [...credits]
  const target = index + delta
  if (index < 0 || index >= result.length || target < 0 || target >= result.length) return result
  const selected = result[index]!
  result[index] = result[target]!
  result[target] = selected
  return result
}

export function buildCreditAssignments(credits: readonly CreditAssignment[]) {
  if (credits.length > 50) throw new Error("最多可安排 50 筆署名。")
  const seen = new Set<string>()
  for (const credit of credits) {
    const key = `${credit.contributorId}:${credit.role}`
    if (seen.has(key)) throw new Error("同一作者與角色不可重複署名。")
    seen.add(key)
  }
  return { contributors: credits.map(({ contributorId, role }) => ({ contributorId, role })) }
}

export const parsePrivatePreview = parseContentDocument
