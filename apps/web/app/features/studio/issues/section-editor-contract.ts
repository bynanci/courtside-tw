import type { components } from "@courtside/api-client"

export type StudioIssueSection = components["schemas"]["IssueSection"]

export interface SectionPositionChange {
  sectionId: string
  position: number
}

/** Return a reordered copy with contiguous, server-persistable positions. */
export function moveSection(
  sections: readonly StudioIssueSection[],
  index: number,
  delta: -1 | 1
): StudioIssueSection[] {
  const target = index + delta
  if (index < 0 || index >= sections.length || target < 0 || target >= sections.length) {
    return sections.map((section) => ({ ...section }))
  }
  const reordered = sections.map((section) => ({ ...section }))
  const current = reordered[index]
  const destination = reordered[target]
  if (!current || !destination) return reordered
  reordered[index] = destination
  reordered[target] = current
  return reordered.map((section, position) => ({ ...section, position: position + 1 }))
}

export function buildSectionReorder(
  sections: readonly StudioIssueSection[]
): SectionPositionChange[] {
  return sections.map((section, index) => ({
    sectionId: section.sectionId,
    position: index + 1
  }))
}

export function sectionKeyboardAction(key: string): -1 | 0 | 1 {
  if (key === "ArrowUp") return -1
  if (key === "ArrowDown") return 1
  return 0
}
