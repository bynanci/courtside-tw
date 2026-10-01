import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { parse } from "yaml"

const root = new URL("../../", import.meta.url)
const contract = parse(await readFile(new URL("contracts/openapi.yaml", root), "utf8"))
const additions = [
  ...["publisher", "admin"].flatMap((role) => [
    [`/api/v1/${role}/basketball/snapshots`, "post"],
    [`/api/v1/${role}/basketball/evidence/{evidenceId}:confirm`, "post"],
    [`/api/v1/${role}/basketball/facts`, "post"],
    [`/api/v1/${role}/basketball/evidence/{evidenceId}`, "get"]
  ]),
  ["/api/v1/publisher/season-recaps", "post"],
  ["/api/v1/public/seasons/{seasonId}/recaps/{projectionId}", "get"],
  ["/api/v1/me/seasons/{seasonId}/recaps/{projectionId}", "get"]
]

test("all implemented intake and recap boundaries have exact non-fabricated responses", () => {
  for (const [path, method] of additions) assert.ok(contract.paths[path]?.[method], path)
  const privateRecap = contract.paths[additions.at(-1)[0]].get
  assert.deepEqual(privateRecap["x-required-roles"], ["READER"])
  assert.deepEqual(Object.keys(privateRecap.responses).sort(), ["401", "403", "404"])
  const generate = contract.paths["/api/v1/publisher/season-recaps"].post
  assert.deepEqual(Object.keys(generate.responses).sort(), [
    "200",
    "400",
    "401",
    "403",
    "422",
    "429"
  ])
  assert.equal(generate["x-write-concurrency"], "IMMUTABLE_PROJECTION_ID")
  assert.equal(generate["x-idempotent"], undefined)
})

test("every added JSON request and success example validates against its actual schema", async () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true })
  addFormats(ajv)
  ajv.addSchema(
    JSON.parse(await readFile(new URL("contracts/content-document.schema.json", root), "utf8"))
  )
  let count = 0
  for (const [path, method] of additions) {
    const operation = contract.paths[path]?.[method]
    assert.ok(operation, path)
    const media = [
      operation.requestBody?.content?.["application/json"],
      ...Object.entries(operation.responses)
        .filter(([status]) => Number(status) >= 200 && Number(status) < 300)
        .map(([, response]) => response.content?.["application/json"])
    ].filter(Boolean)
    for (const item of media) {
      assert.ok(Object.keys(item.examples ?? {}).length, `${path} lacks an example`)
      const validate = ajv.compile({
        $id: `https://courtside.tw/contracts/example-${count++}.json`,
        ...item.schema,
        components: contract.components
      })
      for (const example of Object.values(item.examples)) {
        assert.equal(validate(example.value), true, `${path}: ${JSON.stringify(validate.errors)}`)
      }
    }
  }
  assert.equal(count, 17)
})

test("recap generation rejects raw metrics, reader identity and duplicate canonical facts", () => {
  const schema = contract.components.schemas.SeasonRecapGenerate
  assert.ok(schema)
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  addFormats(ajv)
  const validate = ajv.compile({ ...schema, components: contract.components })
  const valid = {
    projectionId: "00000000-0000-4000-8000-000000000021",
    seasonId: "00000000-0000-4000-8000-000000000022",
    posterAssetId: "00000000-0000-4000-8000-000000000023",
    asOf: "2026-09-12T00:00:00Z",
    factIds: ["00000000-0000-4000-8000-000000000024"]
  }
  assert.equal(validate(valid), true)
  for (const input of [
    { ...valid, values: [1] },
    { ...valid, readerId: valid.projectionId },
    { ...valid, factIds: [valid.factIds[0], valid.factIds[0]] },
    { ...valid, factIds: [] }
  ])
    assert.equal(validate(input), false)
})
