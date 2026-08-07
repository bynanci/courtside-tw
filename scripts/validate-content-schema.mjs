import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const schemaPath = path.join(root, "contracts/content-document.schema.json")
const validPath = path.join(
  root,
  "packages/content-schema/fixtures/valid/content-document-v1-all-blocks.json"
)
const invalidDir = path.join(root, "packages/content-schema/fixtures/invalid")

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"))
const validFixture = JSON.parse(fs.readFileSync(validPath, "utf8"))
const invalidFiles = fs
  .readdirSync(invalidDir)
  .filter((file) => file.endsWith(".json"))
  .sort()

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validate = ajv.compile(schema)

assert.equal(validate(validFixture), true, ajv.errorsText(validate.errors))
assert.equal(new Set(validFixture.blocks.map((block) => block.type)).size, 11)
assert.match(validFixture.documentId, /-7[0-9a-f]{3}-/i)

const duplicateFile = "duplicate-block-id.json"
const schemaInvalidFiles = invalidFiles.filter((file) => file !== duplicateFile)
assert.equal(schemaInvalidFiles.length, 21, "unexpected schema-invalid fixture count")

for (const file of schemaInvalidFiles) {
  const fixture = JSON.parse(fs.readFileSync(path.join(invalidDir, file), "utf8"))
  assert.equal(validate(fixture), false, file + " unexpectedly passed schema validation")
}

const duplicateFixture = JSON.parse(fs.readFileSync(path.join(invalidDir, duplicateFile), "utf8"))
assert.equal(
  validate(duplicateFixture),
  true,
  "duplicate-ID fixture must isolate the semantic invariant"
)
const duplicateIds = duplicateFixture.blocks.map((block) => block.id)
assert.notEqual(
  new Set(duplicateIds).size,
  duplicateIds.length,
  "duplicate block IDs were not detected"
)

console.log(
  JSON.stringify(
    {
      schema: schemaPath,
      valid_fixture: "PASS",
      block_types: 11,
      schema_invalid_fixtures: schemaInvalidFiles.length,
      duplicate_block_id_invariant: "PASS"
    },
    null,
    2
  )
)
