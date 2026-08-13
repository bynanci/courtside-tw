export type ContentRun = {
  kind: "text" | "link"
  text: string
  href?: string
}

export type RenderableGalleryItem = {
  assetId: string
  altText: string
  caption?: string
  credit?: string
  width?: number
  height?: number
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function mediaFallbackStyle(
  width: number | undefined,
  height: number | undefined
): Record<string, string> {
  return typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
    ? { aspectRatio: `${width} / ${height}` }
    : { aspectRatio: "16 / 9" }
}

export function formatMediaAttribution(media: unknown, payloadCredit?: unknown): string {
  const metadata = isRecord(media) ? media : {}
  const parts = [
    stringValue(payloadCredit).trim(),
    stringValue(metadata.credit).trim(),
    stringValue(metadata.rightsOwner).trim()
      ? `權利：${stringValue(metadata.rightsOwner).trim()}`
      : "",
    stringValue(metadata.licenseName).trim()
      ? `授權：${stringValue(metadata.licenseName).trim()}`
      : ""
  ].filter(Boolean)
  return [...new Set(parts)].join(" · ")
}

export function inlineRuns(value: unknown): ContentRun[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry): ContentRun[] => {
    if (!isRecord(entry) || typeof entry.text !== "string") {
      return []
    }
    if (entry.kind === "link" && safeInlineHref(entry.href)) {
      return [{ kind: "link", text: entry.text, href: safeInlineHref(entry.href) ?? undefined }]
    }
    return entry.kind === "text" ? [{ kind: "text", text: entry.text }] : []
  })
}

export function safeInlineHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value.includes("\u0000")) {
    return null
  }
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(value)) {
    return value
  }
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && url.hostname
      ? url.toString()
      : null
  } catch {
    return null
  }
}

export function listItems(value: unknown): ContentRun[][] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => (isRecord(item) ? inlineRuns(item.content) : []))
}

export function galleryItems(
  value: unknown,
  getWidth: (assetId: unknown, variant?: string) => number | undefined = () => undefined,
  getHeight: (assetId: unknown, variant?: string) => number | undefined = () => undefined
): RenderableGalleryItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): RenderableGalleryItem[] => {
    if (!isRecord(item) || typeof item.assetId !== "string" || typeof item.altText !== "string") {
      return []
    }
    const width = getWidth(item.assetId, "inline")
    const height = getHeight(item.assetId, "inline")
    return [
      {
        assetId: item.assetId,
        altText: item.altText,
        ...(typeof item.caption === "string" ? { caption: item.caption } : {}),
        ...(typeof item.credit === "string" ? { credit: item.credit } : {}),
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height })
      }
    ]
  })
}
