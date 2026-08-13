export function readingProgressPercent(
  scrollTop: number,
  documentHeight: number,
  viewportHeight: number
): number {
  const scrollableHeight = Math.max(documentHeight - viewportHeight, 1)
  const boundedTop = Math.min(scrollableHeight, Math.max(0, finite(scrollTop)))
  return Math.round((boundedTop / scrollableHeight) * 100)
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}
