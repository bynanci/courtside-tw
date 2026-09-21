import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
const root = new URL("../../../contracts/", import.meta.url)
const schema = JSON.parse(readFileSync(new URL("provenance-manifest.schema.json", root), "utf8"))
const fixture = JSON.parse(
  readFileSync(new URL("fixtures/provenance/manifest-v1.json", root), "utf8")
)

test("manifest schema accepts shared fixture and rejects private fields and numeric revisions", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  assert.equal(validate(fixture.manifest), true, JSON.stringify(validate.errors))
  for (const change of [
    { email: "private@example.invalid" },
    { revision: 9007199254740992 },
    { assets: [{ assetId: fixture.manifest.snapshotId, digest: "sha256:invalid" }] }
  ]) {
    assert.equal(validate({ ...fixture.manifest, ...change }), false)
  }
})
