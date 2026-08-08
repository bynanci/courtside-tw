import { deepStrictEqual, strictEqual } from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import { validateContentDocument } from "../src/index.ts"

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(packageDirectory, "../../..")
const fixturesRoot = path.join(repositoryRoot, "packages/content-schema/fixtures")
const validFixturePath = path.join(fixturesRoot, "valid/content-document-v1-all-blocks.json")
const invalidFixtureDirectory = path.join(fixturesRoot, "invalid")

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
