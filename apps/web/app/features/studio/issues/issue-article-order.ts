export interface PositionedIssueArticle {
  articleId: string
  revisionId: string | null
  sectionId: string
  position: number
}

export function normalizeIssueArticles<T extends PositionedIssueArticle>(items: T[]): T[] {
  const positions = new Map<string, number>()
  return items.map((item) => {
    const position = (positions.get(item.sectionId) ?? 0) + 1
    positions.set(item.sectionId, position)
    return { ...item, position }
  })
}

export function moveIssueArticle<T extends PositionedIssueArticle>(
  items: T[],
  articleId: string,
  delta: -1 | 1
): T[] {
  const index = items.findIndex((item) => item.articleId === articleId)
  const selected = items[index]
  if (!selected) return items
  const siblings = items
    .map((item, i) => (item.sectionId === selected.sectionId ? i : -1))
    .filter((i) => i >= 0)
  const target = siblings[siblings.indexOf(index) + delta]
  if (target === undefined) return items
  const other = items[target]
  if (!other) return items
  const updated = [...items]
  updated[index] = other
  updated[target] = selected
  return normalizeIssueArticles(updated)
}
