import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"

const root = new URL("../../", import.meta.url)
const load = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"))
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const domain = await load("apps/api/src/test/resources/basketball/synthetic-history.json")
const evidence = await load("apps/api/src/test/resources/evidence/synthetic-conflict.json")
const validateDomain = ajv.compile(await load("contracts/basketball-domain.schema.json"))
const validateEvidence = ajv.compile(await load("contracts/evidence.schema.json"))

test("synthetic basketball and evidence fixtures match strict contracts", () => {
  assert.equal(domain.synthetic, true)
  assert.equal(evidence.synthetic, true)
  assert.equal(validateDomain(domain), true, JSON.stringify(validateDomain.errors))
  assert.equal(validateEvidence(evidence), true, JSON.stringify(validateEvidence.errors))
})

test("canonical domain rejects missing evidence, unstable IDs and unknown fields", () => {
  for (const mutate of [
    (value) => {
      value.records[0].evidenceIds = []
    },
    (value) => {
      value.records[0].id = "same-player-name"
    },
    (value) => {
      value.records[0].currentTeamName = "synthetic accidental overwrite"
    },
    (value) => {
      delete value.records[0].aliases[0].period
    }
  ]) {
    const candidate = structuredClone(domain)
    mutate(candidate)
    assert.equal(validateDomain(candidate), false)
  }
})

test("evidence rejects unknown confirmed effective time, missing snapshot and unsafe source URLs", () => {
  for (const mutate of [
    (value) => {
      value.references[0].status = "CONFIRMED"
      value.references[0].effectiveAt = "UNKNOWN"
    },
    (value) => {
      delete value.references[0].snapshotId
    },
    (value) => {
      value.references[0].sourceUrl = "https://example.invalid/source?private-token=hidden"
    },
    (value) => {
      value.references[0].confidence = 1.01
    },
    (value) => {
      value.references[0].status = "PROBABLY_TRUE"
    },
    (value) => {
      value.references[0].freshness = "current-enough"
    },
    (value) => {
      value.snapshots[0].publishedAt = ""
    }
  ]) {
    const candidate = structuredClone(evidence)
    mutate(candidate)
    assert.equal(validateEvidence(candidate), false)
  }
})

test("every canonical fixture fact resolves to an unchanged source snapshot and explicit evidence time", () => {
  const sources = new Map(evidence.sources.map((source) => [source.id, source]))
  const snapshots = new Map(evidence.snapshots.map((snapshot) => [snapshot.id, snapshot]))
  const references = new Map(evidence.references.map((reference) => [reference.id, reference]))
  for (const reference of references.values()) {
    const snapshot = snapshots.get(reference.snapshotId)
    assert.ok(snapshot)
    assert.equal(snapshot.sourceId, reference.sourceId)
    assert.equal(sources.get(reference.sourceId)?.type, reference.sourceType)
    assert.equal(snapshot.sourceUrl, reference.sourceUrl)
    assert.equal(snapshot.retrievedAt, reference.retrievedAt)
    assert.equal(snapshot.publishedAt, reference.publishedAt)
    assert.equal(snapshot.sha256, createHash("sha256").update(snapshot.content).digest("hex"))
    assert.ok(Date.parse(reference.effectiveAt) <= Date.parse(reference.expiresAt))
    assert.equal(reference.status, "REPORTED", "synthetic fixture never invents confirmation")
  }
  const visit = (node) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node.evidenceIds)) {
      assert.ok(node.evidenceIds.length)
      for (const id of node.evidenceIds) assert.ok(references.has(id), `unknown evidence: ${id}`)
    }
    for (const value of Object.values(node)) visit(value)
  }
  visit(domain.records)
  assert.notEqual(evidence.snapshots[0].sha256, evidence.snapshots[1].sha256)
  assert.equal(evidence.snapshots.length, 2, "conflicting originals remain independently available")
})

test("same-name fixture players retain separate stable identities and career lives in stints", () => {
  const players = domain.records.filter((record) => record.type === "Player")
  assert.equal(players.length, 2)
  assert.equal(players[0].aliases[0].name, players[1].aliases[0].name)
  assert.notEqual(players[0].id, players[1].id)
  assert.ok(players.every((player) => !Object.hasOwn(player, "teamId")))
  assert.ok(domain.records.filter((record) => record.type === "PlayerTeamStint").length > 1)
  assert.deepEqual(
    domain.records
      .filter((record) => record.type === "NationalTeamRoster")
      .map((record) => record.revision),
    [1, 2]
  )
})
