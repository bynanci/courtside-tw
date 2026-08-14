import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import contentDocumentSchema from "../../../contracts/content-document.schema.json" with { type: "json" }
import { findControlCharacterErrors } from "./semantic-validation.ts"

export type { ContentDocument } from "./generated/content-document.js"

import type { ContentDocument } from "./generated/content-document.js"

export interface ContentDocumentValidationError {
  readonly instancePath: string
  readonly keyword: string
  readonly message: string
  readonly params: Readonly<Record<string, unknown>>
}

export interface ContentDocumentValidationResult {
  readonly valid: boolean
  readonly errors: readonly ContentDocumentValidationError[]
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateSchema = ajv.compile<ContentDocument>(contentDocumentSchema)

export function validateContentDocument(value: unknown): ContentDocumentValidationResult {
  const schemaErrors = validateSchema(value) ? [] : (validateSchema.errors ?? []).map(toError)
  const errors = [
    ...schemaErrors,
    ...findDuplicateBlockIds(value),
    ...findControlCharacterErrors(value)
  ]

  return {
    valid: errors.length === 0,
    errors
  }
}

export function assertValidContentDocument(value: unknown): asserts value is ContentDocument {
  const result = validateContentDocument(value)
  if (!result.valid) {
    const details = result.errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ")
    throw new Error(`Invalid ContentDocument: ${details}`)
  }
}

function toError(error: ErrorObject): ContentDocumentValidationError {
  return {
    instancePath: error.instancePath,
    keyword: error.keyword,
    message: error.message ?? "validation failed",
    params: { ...error.params }
  }
}

function findDuplicateBlockIds(value: unknown): ContentDocumentValidationError[] {
  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    return []
  }

  const firstIndexById = new Map<string, number>()
  const errors: ContentDocumentValidationError[] = []

  value.blocks.forEach((block, index) => {
    if (!isRecord(block) || typeof block.id !== "string") {
      return
    }

    const firstIndex = firstIndexById.get(block.id)
    if (firstIndex !== undefined) {
      errors.push({
        instancePath: `/blocks/${index}/id`,
        keyword: "uniqueBlockIds",
        message: "must be unique",
        params: { duplicateOf: firstIndex }
      })
      return
    }

    firstIndexById.set(block.id, index)
  })

  return errors
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
