import { assertValidContentDocument, type ContentDocument } from "@courtside/content-schema"

export interface ContentParseResult {
  document: ContentDocument | null
  error: string | null
}

export function parseContentDocument(raw: string): ContentParseResult {
  try {
    const value: unknown = JSON.parse(raw)
    assertValidContentDocument(value)
    return { document: value, error: null }
  } catch (error) {
    return {
      document: null,
      error: error instanceof Error ? error.message : "內容格式無效。"
    }
  }
}

export function serializeContentDocument(value: unknown): string {
  assertValidContentDocument(value)
  return JSON.stringify(value, null, 2)
}

export function boundedGenerativePrompt(prompt: string): string {
  return prompt.trim().slice(0, 280)
}
