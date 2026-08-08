import { readFile } from "node:fs/promises"
import process from "node:process"

type SeedScenario = {
  id: string
  publicationState: string
  rightsState: string
  reducedMotion: boolean
}

type SeedPayload = {
  fixtureVersion: number
  fixedSeed: number
  scenarios: SeedScenario[]
  generativeCanvas: {
    valid: { seed: number; validationCode: string }
    invalid: { seed: number; validationCode: string }
  }
}

const fixtureUrl = new URL(
  "../../apps/web/tests/fixtures/acceptance-scenarios.json",
  import.meta.url
)
const payload = JSON.parse(await readFile(fixtureUrl, "utf8")) as SeedPayload

const requiredScenarioIds = new Set([
  "published",
  "draft",
  "withdrawn",
  "expired-rights",
  "reduced-motion"
])
const actualScenarioIds = new Set(payload.scenarios.map((scenario) => scenario.id))

if (
  payload.fixtureVersion !== 1 ||
  payload.fixedSeed !== 424242 ||
  requiredScenarioIds.size !== actualScenarioIds.size ||
  [...requiredScenarioIds].some((id) => !actualScenarioIds.has(id)) ||
  payload.generativeCanvas.valid.seed !== payload.fixedSeed ||
  payload.generativeCanvas.invalid.seed !== payload.fixedSeed ||
  payload.generativeCanvas.valid.validationCode !== "valid" ||
  payload.generativeCanvas.invalid.validationCode !== "parameter-out-of-range"
) {
  throw new Error("T022 fixture catalog is not deterministic or complete")
}

const output = {
  fixtureVersion: payload.fixtureVersion,
  fixedSeed: payload.fixedSeed,
  scenarioIds: [...actualScenarioIds].sort(),
  generativeCanvas: {
    valid: payload.generativeCanvas.valid.validationCode,
    invalid: payload.generativeCanvas.invalid.validationCode
  }
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
