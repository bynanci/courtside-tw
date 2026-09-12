import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { offChainOnlyCredentialAdapter } from "../../packages/web3-adapter/src/credential.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const schema = JSON.parse(fs.readFileSync(path.join(root, "contracts/fan-passport.schema.json")))
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, "apps/api/src/test/resources/fanpassport/reader-stamp.json"))
)
const ajv = new Ajv({ strict: true, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(schema)

test("stamp schema accepts lifecycle fixture while excluding private behavior and financial claims", () => {
  assert.equal(validate(fixture), true)
  for (const status of ["CLAIMABLE", "CLAIMED", "REVOKED", "SUPERSEDED", "EXPIRED"]) {
    assert.equal(validate({ ...fixture, status }), true)
  }
  for (const field of [
    "email",
    "name",
    "wallet",
    "readingHistory",
    "articleId",
    "ip",
    "location",
    "content",
    "storageKey",
    "price",
    "yield"
  ]) {
    assert.equal(validate({ ...fixture, [field]: "private-canary" }), false, field)
  }
})

test("optional adapter fails closed for absent consent, transferability, gas or private payload", async () => {
  const credential = { id: fixture.id, season: "2026", credentialType: "READER_STAMP" }
  const policy = {
    externalWritesEnabled: false,
    explicitConsent: true,
    transferable: false,
    sponsoredTransaction: false,
    gasCeiling: 0,
    signerCustody: "NONE",
    revocationRegistry: "OFF_CHAIN"
  }
  assert.deepEqual(await offChainOnlyCredentialAdapter.deliver(credential, policy), {
    status: "DISABLED",
    publicCopyDeletable: false
  })
  for (const invalid of [
    { externalWritesEnabled: true },
    { explicitConsent: false },
    { transferable: true },
    { gasCeiling: 1 },
    { sponsoredTransaction: true },
    { signerCustody: "MANAGED" }
  ]) {
    await assert.rejects(
      offChainOnlyCredentialAdapter.deliver(credential, { ...policy, ...invalid })
    )
  }
  await assert.rejects(
    offChainOnlyCredentialAdapter.deliver({ ...credential, email: "private-canary" }, policy)
  )
})
