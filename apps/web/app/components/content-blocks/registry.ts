export const CONTENT_BLOCK_RENDERER_VERSION = 1 as const

type ContentBlockRegistryEntry = {
  version: typeof CONTENT_BLOCK_RENDERER_VERSION
  preset?: string
}

export const CONTENT_BLOCK_RENDERERS = {
  paragraph: { version: CONTENT_BLOCK_RENDERER_VERSION },
  heading: { version: CONTENT_BLOCK_RENDERER_VERSION },
  list: { version: CONTENT_BLOCK_RENDERER_VERSION },
  quote: { version: CONTENT_BLOCK_RENDERER_VERSION },
  divider: { version: CONTENT_BLOCK_RENDERER_VERSION },
  image: { version: CONTENT_BLOCK_RENDERER_VERSION },
  gallery: { version: CONTENT_BLOCK_RENDERER_VERSION },
  stat: { version: CONTENT_BLOCK_RENDERER_VERSION },
  video: { version: CONTENT_BLOCK_RENDERER_VERSION },
  "related-reading": { version: CONTENT_BLOCK_RENDERER_VERSION },
  "generative-canvas": { version: CONTENT_BLOCK_RENDERER_VERSION, preset: "court-pulse-v1" }
} as const satisfies Record<string, ContentBlockRegistryEntry>

export type ContentBlockRendererKey = keyof typeof CONTENT_BLOCK_RENDERERS

export type ContentBlock = {
  id: string
  type: string
  version: number
  payload: Record<string, unknown>
}

export type ContentBlockFallbackReason =
  "unknown-block-type" | "unsupported-block-version" | "unknown-preset-version"

export type ContentBlockRendererResolution =
  | {
      kind: "renderer"
      renderer: ContentBlockRendererKey
    }
  | {
      kind: "fallback"
      reason: ContentBlockFallbackReason
      telemetryCode:
        | "CONTENT_BLOCK_RENDERER_UNKNOWN_TYPE"
        | "CONTENT_BLOCK_RENDERER_UNSUPPORTED_VERSION"
        | "CONTENT_BLOCK_RENDERER_UNKNOWN_PRESET"
    }

export type ContentBlockTelemetryCode =
  | "CONTENT_BLOCK_RENDERER_UNKNOWN_TYPE"
  | "CONTENT_BLOCK_RENDERER_UNSUPPORTED_VERSION"
  | "CONTENT_BLOCK_RENDERER_UNKNOWN_PRESET"

export type ContentBlockTelemetry = {
  code: ContentBlockTelemetryCode
  blockId: string
  blockType: string
  blockVersion: number
  reason: ContentBlockFallbackReason
}

export function resolveContentBlockRenderer(
  block: Pick<ContentBlock, "type" | "version" | "payload">
): ContentBlockRendererResolution {
  const renderer = CONTENT_BLOCK_RENDERERS[block.type as ContentBlockRendererKey] as
    ContentBlockRegistryEntry | undefined
  if (!renderer) {
    return {
      kind: "fallback",
      reason: "unknown-block-type",
      telemetryCode: "CONTENT_BLOCK_RENDERER_UNKNOWN_TYPE"
    }
  }
  if (block.version !== renderer.version) {
    return {
      kind: "fallback",
      reason: "unsupported-block-version",
      telemetryCode: "CONTENT_BLOCK_RENDERER_UNSUPPORTED_VERSION"
    }
  }
  if (renderer.preset && block.payload.presetId !== renderer.preset) {
    return {
      kind: "fallback",
      reason: "unknown-preset-version",
      telemetryCode: "CONTENT_BLOCK_RENDERER_UNKNOWN_PRESET"
    }
  }
  return { kind: "renderer", renderer: block.type as ContentBlockRendererKey }
}

export function getSafeFallbackPosterAssetId(payload: Record<string, unknown>): string | null {
  const value = payload.posterAssetId
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    !/^(?:https?:|data:|javascript:)/i.test(value)
    ? value
    : null
}

export function getSafeFallbackSummary(payload: Record<string, unknown>): string {
  const candidates = [payload.summary, payload.dataSummary, payload.altText, payload.text]
  for (const candidate of candidates) {
    const summary = sanitizePlainText(candidate)
    if (summary) {
      return summary
    }
  }
  return "此內容區塊版本尚未支援，已保留摘要。"
}

function sanitizePlainText(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }
  return value
    .split(String.fromCharCode(0))
    .join("")
    .replace(/[<>]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500)
}
