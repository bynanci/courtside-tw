import { deepStrictEqual, strictEqual } from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

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
