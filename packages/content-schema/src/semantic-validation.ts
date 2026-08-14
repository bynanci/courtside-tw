export interface SemanticValidationError {
  readonly instancePath: string
  readonly keyword: string
  readonly message: string
  readonly params: Readonly<Record<string, unknown>>
}

export function findControlCharacterErrors(
  value: unknown
): SemanticValidationError[] {
  const errors: SemanticValidationError[] = []

  function visit(node: unknown, instancePath: string): void {
    if (typeof node === "string") {
      if (hasForbiddenControlCharacters(node)) {
        errors.push({
          instancePath,
          keyword: "isoControlCharacter",
          message: "must not contain ISO control characters",
          params: {}
        })
      }
      return
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${instancePath}/${index}`))
      return
    }

    if (isRecord(node)) {
      Object.entries(node).forEach(([key, child]) => {
        visit(child, `${instancePath}/${escapeJsonPointer(key)}`)
      })
    }
  }

  visit(value, "")
  return errors
}

function hasForbiddenControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      (codePoint <= 0x1f && codePoint !== 0x0a) ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      return true
    }
  }
  return false
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
