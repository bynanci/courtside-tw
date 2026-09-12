import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"

const schema = JSON.parse(
  await readFile(
    new URL("../../contracts/archive-contribution.schema.json", import.meta.url),
    "utf8"
  )
)
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validate = ajv.compile(schema)
const id = "00000000-0000-4000-8000-000000000001"
const record = {
  schemaVersion: 1,
  id,
  contributorAccountId: id,
  kind: "HISTORICAL_PHOTO",
  assetId: id,
  status: "SUBMITTED",
  consentGranted: true,
  consentAt: "2026-08-01T00:00:00Z",
  rights: {
    assetId: id,
    rightsOwner: "Synthetic owner",
    license: "Synthetic license",
    allowedChannels: ["PUBLIC_WEB"],
    collectibleAllowed: false,
    redistributionAllowed: false,
    validFrom: "2026-08-01T00:00:00Z",
    validUntil: "2026-09-01T00:00:00Z",
    credit: "Synthetic credit",
    withdrawalPolicy: "ORIGIN_WITHDRAWAL",
    withdrawnAt: null
  },
  history: []
}

test("submitted archive contract requires consent and an attributable status receipt", () => {
  assert.equal(validate(record), false, "SUBMITTED without history must not validate")
  const submitted = structuredClone(record)
  submitted.history.push({
    status: "SUBMITTED",
    actorId: id,
    reasonCode: "FIXTURE_SUBMITTED",
    effectiveAt: record.consentAt
  })
  assert.equal(validate(submitted), true, JSON.stringify(validate.errors))
  submitted.consentGranted = false
  assert.equal(
    validate(submitted),
    false,
    "SUBMITTED without affirmative consent must not validate"
  )
})

test("draft archive may remain a private record before its first lifecycle event", () => {
  const draft = { ...record, status: "DRAFT", consentGranted: false }
  assert.equal(validate(draft), true, JSON.stringify(validate.errors))
})

test("withdrawn archive contract retains a rights withdrawal timestamp", () => {
  const withdrawn = { ...structuredClone(record), status: "WITHDRAWN", consentGranted: false }
  withdrawn.history.push({
    status: "WITHDRAWN",
    actorId: id,
    reasonCode: "CONSENT_WITHDRAWN",
    effectiveAt: record.consentAt
  })
  assert.equal(validate(withdrawn), false, "WITHDRAWN requires rights withdrawal evidence")
  withdrawn.rights.withdrawnAt = record.consentAt
  assert.equal(validate(withdrawn), true, JSON.stringify(validate.errors))
})
