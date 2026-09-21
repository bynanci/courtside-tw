import { deepStrictEqual, strictEqual } from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"

import { validateContentDocument as validateBrowserContentDocument } from "../src/browser.ts"
import { validateContentDocument } from "../src/index.ts"

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(packageDirectory, "../../..")
const fixturesRoot = path.join(repositoryRoot, "packages/content-schema/fixtures")
const validFixturePath = path.join(fixturesRoot, "valid/content-document-v1-all-blocks.json")
const invalidFixtureDirectory = path.join(fixturesRoot, "invalid")
const browserValidatorPath = path.join(
  repositoryRoot,
  "packages/content-schema/src/generated/content-document-validator.ts"
)

function readFixture(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown
}

test("accepts the canonical valid fixture and all 11 block types", () => {
  const result = validateContentDocument(readFixture(validFixturePath))

  strictEqual(result.valid, true, JSON.stringify(result.errors))
  strictEqual(result.errors.length, 0)
})

test("season recap passes identical server and CSP-safe browser schema validation", () => {
  const recap = readFixture(path.join(fixturesRoot, "valid/season-recap-v1.json"))
  for (const validate of [validateContentDocument, validateBrowserContentDocument]) {
    const result = validate(recap)
    strictEqual(result.valid, true, JSON.stringify(result.errors))
  }
})

test("recap schema rejects private payload, missing lineage, invalid times and excessive values", () => {
  const source = readFixture(path.join(fixturesRoot, "valid/season-recap-v1.json"))
  const mutations = [
    (payload: Record<string, unknown>) => {
      payload.email = "private@example.invalid"
    },
    (payload: Record<string, unknown>) => {
      payload.readingHistory = ["private-article"]
    },
    (payload: Record<string, unknown>) => {
      payload.asOf = "2026-02-30T00:00:00Z"
    },
    (payload: Record<string, unknown>) => {
      payload.evidenceSnapshotIds = []
    },
    (payload: Record<string, unknown>) => {
      payload.parameters = { values: [2], lineWeight: 2, paletteId: "season-ink" }
    }
  ]
  for (const mutation of mutations) {
    const fixture = structuredClone(source) as {
      blocks: Array<{ payload: Record<string, unknown> }>
    }
    mutation(fixture.blocks[0]!.payload)
    for (const validate of [validateContentDocument, validateBrowserContentDocument]) {
      strictEqual(validate(fixture).valid, false)
    }
  }
})

test("standalone recap and archive schemas enforce the public projection boundary", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const recapSchema = readFixture(
    path.join(repositoryRoot, "contracts/season-recap.schema.json")
  ) as object
  const archiveSchema = readFixture(
    path.join(repositoryRoot, "contracts/archive-contribution.schema.json")
  ) as { $id: string }
  const validateRecap = ajv.compile(recapSchema)
  const recap = readFixture(path.join(fixturesRoot, "valid/season-recap-v1.json")) as {
    blocks: Array<{ payload: Record<string, unknown> }>
  }
  strictEqual(validateRecap({ schemaVersion: 1, payload: recap.blocks[0]!.payload }), true)
  ajv.addSchema(archiveSchema)
  const validateArchivePublic = ajv.compile({
    $ref: archiveSchema.$id + "#/$defs/publicContribution"
  })
  const archive = {
    contributionId: "00000000-0000-4000-8000-000000000821",
    kind: "HISTORICAL_PHOTO",
    assetId: "00000000-0000-4000-8000-000000000816",
    credit: "測試署名",
    rightsOwner: "測試權利人",
    license: "測試授權"
  }
  strictEqual(validateArchivePublic(archive), true)
  for (const prohibited of [
    "contributorAccountId",
    "email",
    "readingHistory",
    "rightsContract",
    "storageKey",
    "consent",
    "history"
  ]) {
    strictEqual(validateArchivePublic({ ...archive, [prohibited]: "private" }), false)
  }
})

test("rejects every canonical invalid fixture", () => {
  const invalidFiles = readdirSync(invalidFixtureDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort()

  strictEqual(invalidFiles.length, 24, "unexpected canonical invalid fixture count")

  for (const file of invalidFiles) {
    const result = validateContentDocument(readFixture(path.join(invalidFixtureDirectory, file)))
    strictEqual(result.valid, false, `${file} unexpectedly passed: ${JSON.stringify(result)}`)
  }
})

test("rejects duplicate block IDs as a runtime semantic invariant", () => {
  const result = validateContentDocument(
    readFixture(path.join(invalidFixtureDirectory, "duplicate-block-id.json"))
  )

  strictEqual(result.valid, false)
  deepStrictEqual(
    result.errors.map((error) => error.keyword),
    ["uniqueBlockIds"]
  )
})

test("keeps Java and TypeScript reader-visible text controls aligned", () => {
  const document = (text: string) => ({
    schemaVersion: 1,
    documentId: "0190f7b0-7c4b-7e3a-8f12-123456789abc",
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "paragraph",
        version: 1,
        payload: { content: [{ kind: "text", text }] }
      }
    ]
  })

  for (const validate of [validateContentDocument, validateBrowserContentDocument]) {
    strictEqual(validate(document("第一行\n第二行")).valid, true)
    for (const control of ["\u0001", "\r", "\t", "\u007f"]) {
      const result = validate(document(`a${control}b`))
      strictEqual(result.valid, false, JSON.stringify(result.errors))
      strictEqual(
        result.errors.some((error) => error.keyword === "isoControlCharacter"),
        true
      )
    }
  }
})

test("browser validator is CSP-safe and preserves the canonical checks", () => {
  const source = readFileSync(browserValidatorPath, "utf8")
  strictEqual(/require\(|new Function|\beval\s*\(/u.test(source), false)

  const valid = readFixture(validFixturePath)
  strictEqual(validateBrowserContentDocument(valid).valid, true)

  const duplicate = structuredClone(valid) as { blocks: Array<{ id: string }> }
  const firstBlock = duplicate.blocks[0]
  const secondBlock = duplicate.blocks[1]
  if (!firstBlock || !secondBlock) throw new Error("valid fixture is missing blocks")
  secondBlock.id = firstBlock.id
  const result = validateBrowserContentDocument(duplicate)
  strictEqual(result.valid, false)
  strictEqual(
    result.errors.some((error) => error.keyword === "uniqueBlockIds"),
    true
  )
})
