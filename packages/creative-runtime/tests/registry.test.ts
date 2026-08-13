import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  createActiveLoopCoordinator,
  normalizeCourtPulseParameters,
  resolveCreativePreset
} from "../src/index.ts"

test("creative preset resolution is a total local allowlist", () => {
  assert.equal(resolveCreativePreset("court-pulse-v1")?.id, "court-pulse-v1")
  assert.equal(resolveCreativePreset("court-pulse-v2"), null)
  assert.equal(resolveCreativePreset("../../../remote-module"), null)
})

test("court-pulse parameters are clamped to the approved runtime envelope", () => {
  assert.deepEqual(
    normalizeCourtPulseParameters({
      density: 999,
      tempo: -1,
      lineWeight: 99,
      paletteId: "attacker-palette",
      numericSequence: [...Array.from({ length: 80 }, () => 2), Number.NaN]
    }),
    {
      density: 48,
      tempo: 0.25,
      lineWeight: 3,
      paletteId: "court-dusk",
      numericSequence: Array.from({ length: 64 }, () => 1)
    }
  )
})

test("the runtime coordinator permits only one active loop", () => {
  const events: string[] = []
  const coordinator = createActiveLoopCoordinator()
  coordinator.claim("first", () => events.push("pause:first"))
  coordinator.claim("second", () => events.push("pause:second"))

  assert.deepEqual(events, ["pause:first"])
  assert.equal(coordinator.currentOwner(), "second")
  coordinator.release("second")
  assert.equal(coordinator.currentOwner(), null)
})

test("preset modules are selected only by the trusted registry", async () => {
  const source = await readFile(new URL("../src/registry.ts", import.meta.url), "utf8")
  assert.match(source, /court-pulse-v1/)
  assert.doesNotMatch(source, /import\s*\([^"']/u)
  assert.doesNotMatch(source, /https?:\/\//u)
  assert.doesNotMatch(source, /eval\s*\(|new Function/u)
})
