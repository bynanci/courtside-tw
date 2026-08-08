import fixtureData from "./acceptance-scenarios.json"

export type FixtureScenario = {
  id: string
  publicationState: "PUBLISHED" | "DRAFT" | "WITHDRAWN"
  rightsState: "VALID" | "EXPIRED" | "WITHDRAWN"
  reducedMotion: boolean
}

export type CanvasFixture = {
  presetId: string
  seed: number
  parameters: Record<string, number>
  validationCode: string
}

type FixturePayload = {
  fixtureVersion: number
  fixedSeed: number
  scenarios: FixtureScenario[]
  generativeCanvas: {
    valid: CanvasFixture
    invalid: CanvasFixture
  }
}

const payload = fixtureData as FixturePayload

export const FIXTURE_VERSION = payload.fixtureVersion
export const FIXED_CANVAS_SEED = payload.fixedSeed
export const acceptanceScenarios = payload.scenarios
export const generativeCanvasFixtures = payload.generativeCanvas

export function fixtureFor(id: string): FixtureScenario {
  const fixture = acceptanceScenarios.find((candidate) => candidate.id === id)
  if (!fixture) {
    throw new Error(`unknown fixture scenario: ${id}`)
  }
  return fixture
}
