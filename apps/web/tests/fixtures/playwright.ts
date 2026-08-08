import type { FixtureScenario } from "./fixture-loader"

export const MOBILE_VIEWPORT = { width: 390, height: 844 }
export const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)"

/** Arguments for page.addInitScript; kept Playwright-compatible without coupling the app package to Playwright. */
export function browserFixtureArgs(scenario: FixtureScenario): {
  courtsideFixture: FixtureScenario
} {
  return { courtsideFixture: scenario }
}
